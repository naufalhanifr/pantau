import logging
from io import BytesIO
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from ..auth import check_login, issue_token, require_admin, revoke_token
from ..config import ADMIN_PASSWORD, MONTHS, WEB_DIR
from ..db import connect, transaction
from ..services import karyawan, ppu_pn, records
from ..services.backup import backup_db
from ..services.excel import build_template, parse_workbook
from ..templating import render_page

router = APIRouter()
api = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
log = logging.getLogger("pantau.admin")


class LoginBody(BaseModel):
    password: str


Jenis = Literal["tagihan", "pembayaran", "karyawan"]
# PPU PN hanya punya upload dan riwayat: berkasnya ±3 ribu baris dan langsung dari sumber, tanpa workspace.
JenisRiwayat = Literal["tagihan", "pembayaran", "karyawan", "ppu_pn"]


class ImportBody(BaseModel):
    jenis: Jenis
    bulan: str
    replace: bool = True
    source: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)


class WorkspaceBody(BaseModel):
    jenis: Jenis
    bulan: str
    upserts: list[dict[str, Any]] = Field(default_factory=list)
    deletes: list[str] = Field(default_factory=list)


def _check_month(bulan: str) -> None:
    if bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {bulan}")


@router.get("/admin", response_class=HTMLResponse)
def admin_page():
    return render_page(WEB_DIR / "admin" / "index.html")


@router.post("/api/admin/login")
def login(body: LoginBody, request: Request):
    check_login(request, "admin", body.password, ADMIN_PASSWORD)
    return {"token": issue_token()}


@api.post("/logout")
def logout(authorization: str = Header(default="")):
    revoke_token(authorization)
    return {"ok": True}


@api.get("/summary")
def summary():
    conn = connect()
    try:
        return {"months": MONTHS, "per_bulan": records.month_summary(conn)}
    finally:
        conn.close()


@api.post("/ppu-pn/upload")
def upload_ppu_pn(file: UploadFile = File(...), bulan: str = "", simpan: bool = False):
    """simpan=False hanya membaca berkas dan melaporkan isinya, untuk ditampilkan di dialog konfirmasi."""
    _check_month(bulan)
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="Format file harus .xlsx atau .xlsm.")
    try:
        rows = ppu_pn.read_workbook(BytesIO(file.file.read()))
    except ValueError as error:   # sheet/kolom tidak ada atau isi baris salah: pesannya memang untuk pengguna
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        log.exception("Gagal membaca Excel PPU PN %r (bulan=%s)", file.filename, bulan)
        raise HTTPException(status_code=422, detail="File Excel tidak dapat dibaca. Pastikan file .xlsx/.xlsm asli, tidak rusak, dan tidak dikunci kata sandi.")
    if not rows:
        raise HTTPException(status_code=422, detail="Tidak ada baris peserta di file; data lama tidak diubah.")
    if not simpan:
        return {"filename": file.filename, "rows": len(rows), "total": sum(row[6] for row in rows), "bulan_file": ppu_pn.month_from_filename(file.filename or "")}
    backup_db("sebelum-ganti")
    with transaction() as conn:
        return ppu_pn.import_rows(conn, rows, file.filename or "", bulan)


@api.post("/upload")
def upload(file: UploadFile = File(...), jenis: str = "", bulan: str = ""):
    # Sengaja sync: parsing Excel berat CPU dan akan membekukan event loop (semua pengguna) jika async.
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="Format file harus .xlsx atau .xlsm.")
    if jenis == "karyawan" and bulan not in MONTHS:
        # File setahun ±26 MB JSON ke browser: Karyawan hanya lewat tombol Upload per bulan.
        raise HTTPException(status_code=422, detail="Upload Karyawan per bulan: pilih tombol Upload pada bulan yang dituju.")
    content = file.file.read()  # tanpa batas ukuran: hanya admin yang bisa upload
    try:
        if jenis == "karyawan":
            # Upload per bulan hanya mengirim baris bulan itu ke browser (file setahun ±150 ribu baris).
            sheets = karyawan.admin_sheets(karyawan.read_workbook(BytesIO(content)), bulan)
        else:
            sheets = parse_workbook(content, file.filename or "")
    except Exception:
        log.exception("Gagal membaca Excel %r (jenis=%s, bulan=%s)", file.filename, jenis, bulan)
        raise HTTPException(status_code=422, detail="File Excel tidak dapat dibaca. Pastikan file .xlsx/.xlsm asli, tidak rusak, dan tidak dikunci kata sandi.")
    if not sheets:
        detail = f"Tidak ada data bulan tagih {bulan} di file." if jenis == "karyawan" and bulan else "Tidak ada sheet berisi data."
        raise HTTPException(status_code=422, detail=detail)
    return {"filename": file.filename, "sheets": sheets}


@api.get("/template")
def template(jenis: Jenis):
    return Response(
        karyawan.build_template() if jenis == "karyawan" else build_template(MONTHS),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Template {jenis.title()}.xlsx"'},
    )


@api.post("/import")
def import_data(body: ImportBody):
    _check_month(body.bulan)
    if not body.rows:
        raise HTTPException(status_code=422, detail="Tidak ada baris untuk disimpan.")
    errors = karyawan.row_errors(body.bulan, body.rows) if body.jenis == "karyawan" else records.row_errors(body.rows)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    if body.replace:
        backup_db("sebelum-ganti")
    with transaction() as conn:
        if body.jenis == "karyawan":
            result = karyawan.import_month(conn, body.bulan, body.rows, body.replace, body.source)
        else:
            result = records.import_rows(conn, body.jenis, body.bulan, body.rows, body.replace, body.source)
        if not result["ok"]:
            raise HTTPException(status_code=422, detail=result["errors"])
    return result


@api.get("/records")
def get_records(jenis: Jenis, bulan: str):
    _check_month(bulan)
    conn = connect()
    try:
        rows = karyawan.month_rows(conn, bulan) if jenis == "karyawan" else records.month_rows(conn, jenis, bulan)
        return {"jenis": jenis, "bulan": bulan, "rows": rows}
    finally:
        conn.close()


@api.put("/records")
def save_records(body: WorkspaceBody):
    _check_month(body.bulan)
    with transaction() as conn:
        if body.jenis == "karyawan":
            result = karyawan.save_workspace(conn, body.bulan, body.upserts, body.deletes)
        else:
            result = records.save_workspace(conn, body.jenis, body.bulan, body.upserts, body.deletes)
        if not result["ok"]:
            raise HTTPException(status_code=422, detail=result["errors"])
    return result


@api.get("/history")
def history(jenis: JenisRiwayat):
    conn = connect()
    try:
        return {"rows": records.import_log(conn, jenis)}
    finally:
        conn.close()
