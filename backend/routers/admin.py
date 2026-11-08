import logging
from contextlib import closing
from io import BytesIO
from typing import Any, Callable, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from ..auth import require_admin, session_routes
from ..config import ADMIN_PASSWORD, MONTHS, TOKEN_TTL_SECONDS, WEB_DIR
from ..db import connect, transaction
from ..services import karyawan, ppu_pn, records
from ..services.backup import backup_db
from ..services.excel import build_template, parse_workbook
from ..services.normalize import ExcelError
from ..templating import render_page
from . import check_month

router = APIRouter()
session = session_routes("/api/admin", "admin", ADMIN_PASSWORD, TOKEN_TTL_SECONDS, require_admin, refresh=False)
api = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
log = logging.getLogger("pantau.admin")

Jenis = Literal["tagihan", "pembayaran", "karyawan"]
# PPU PN hanya punya upload dan riwayat: berkasnya ±3 ribu baris dan langsung dari sumber, tanpa workspace.
JenisRiwayat = Literal["tagihan", "pembayaran", "karyawan", "ppu_pn"]


class Sheet(BaseModel):
    bulan: str
    source: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)


class ImportBody(BaseModel):
    """Semua sheet satu upload disimpan dalam satu transaksi: gagal di satu bulan = tidak ada yang tersimpan."""
    jenis: Jenis
    replace: bool = True
    sheets: list[Sheet] = Field(min_length=1)


class WorkspaceBody(BaseModel):
    jenis: Jenis
    bulan: str
    upserts: list[dict[str, Any]] = Field(default_factory=list)
    deletes: list[str] = Field(default_factory=list)


def _clean(jenis: str, bulan: str, rows: list[dict[str, Any]], prefix: str = "") -> list:
    """Baris siap simpan; seluruh permintaan ditolak bila ada baris yang salah."""
    check_month(bulan)
    cleaned, errors = karyawan.clean(bulan, rows) if jenis == "karyawan" else records.clean_rows(rows)
    if errors:
        raise HTTPException(status_code=422, detail=[prefix + error for error in errors[:50]])
    return cleaned


def _read_excel(file: UploadFile, parse: Callable[[bytes], Any]) -> Any:
    # Sengaja dipanggil dari endpoint sync: parsing Excel berat CPU dan akan membekukan event loop (semua pengguna) jika async.
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="Format file harus .xlsx atau .xlsm.")
    content = file.file.read()  # tanpa batas ukuran: hanya admin yang bisa upload
    try:
        return parse(content)
    except ExcelError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        log.exception("Gagal membaca Excel %r", file.filename)
        raise HTTPException(status_code=422, detail="File Excel tidak dapat dibaca. Pastikan file .xlsx/.xlsm asli, tidak rusak, dan tidak dikunci kata sandi.")


@router.get("/admin", response_class=HTMLResponse)
def admin_page():
    return render_page(WEB_DIR / "admin" / "index.html")


@api.get("/summary")
def summary():
    with closing(connect()) as conn:
        return {"months": MONTHS, "per_bulan": records.month_summary(conn)}


@api.post("/ppu-pn/upload")
def upload_ppu_pn(file: UploadFile = File(...), bulan: str = "", simpan: bool = False):
    """simpan=False hanya membaca berkas dan melaporkan isinya, untuk ditampilkan di dialog konfirmasi."""
    check_month(bulan)
    rows = _read_excel(file, lambda content: ppu_pn.read_workbook(BytesIO(content)))
    if not rows:
        raise HTTPException(status_code=422, detail="Tidak ada baris peserta di file; data lama tidak diubah.")
    if not simpan:
        return {"filename": file.filename, "rows": len(rows), "total": sum(row[6] for row in rows), "bulan_file": ppu_pn.month_from_filename(file.filename or "")}
    backup_db("sebelum-ganti")
    with transaction() as conn:
        return ppu_pn.import_rows(conn, rows, file.filename or "", bulan)


@api.post("/upload")
def upload(file: UploadFile = File(...), jenis: str = "", bulan: str = ""):
    if jenis == "karyawan":
        # File setahun ±26 MB JSON ke browser: Karyawan hanya lewat tombol Upload per bulan, dan hanya baris bulan itu yang dikirim.
        if bulan not in MONTHS:
            raise HTTPException(status_code=422, detail="Upload Karyawan per bulan: pilih tombol Upload pada bulan yang dituju.")
        sheets = _read_excel(file, lambda content: karyawan.admin_sheets(karyawan.read_workbook(BytesIO(content)), bulan))
    else:
        sheets = _read_excel(file, lambda content: parse_workbook(content, file.filename or ""))
    if not sheets:
        detail = f"Tidak ada data bulan tagih {bulan} di file." if jenis == "karyawan" else "Tidak ada sheet berisi data."
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
    prefix = len(body.sheets) > 1
    cleaned = []
    for sheet in body.sheets:
        if not sheet.rows:
            raise HTTPException(status_code=422, detail="Tidak ada baris untuk disimpan.")
        cleaned.append((sheet, _clean(body.jenis, sheet.bulan, sheet.rows, f"{sheet.bulan}: " if prefix else "")))
    # Divalidasi dulu: percobaan yang pasti ditolak tidak membuat backup yang menggeser backup lama.
    if body.replace:
        backup_db("sebelum-ganti")
    with transaction() as conn:
        return {"per_bulan": [{"bulan": sheet.bulan, **(
            karyawan.import_month(conn, sheet.bulan, rows, body.replace, sheet.source) if body.jenis == "karyawan"
            else records.import_rows(conn, body.jenis, sheet.bulan, rows, body.replace, sheet.source)
        )} for sheet, rows in cleaned]}


@api.get("/records")
def get_records(jenis: Jenis, bulan: str):
    check_month(bulan)
    with closing(connect()) as conn:
        rows = karyawan.month_rows(conn, bulan) if jenis == "karyawan" else records.month_rows(conn, jenis, bulan)
    return {"jenis": jenis, "bulan": bulan, "rows": rows}


@api.put("/records")
def save_records(body: WorkspaceBody):
    rows = _clean(body.jenis, body.bulan, body.upserts)
    with transaction() as conn:
        if body.jenis == "karyawan":
            return karyawan.save_workspace(conn, body.bulan, rows, body.deletes)
        return records.save_workspace(conn, body.jenis, body.bulan, rows, body.deletes)


@api.get("/history")
def history(jenis: JenisRiwayat):
    with closing(connect()) as conn:
        return {"rows": records.import_log(conn, jenis)}
