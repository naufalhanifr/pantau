from typing import Any, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from ..auth import check_password, issue_token, require_admin
from ..config import MAX_UPLOAD_BYTES, MONTHS, WEB_DIR
from ..db import connect, transaction
from ..services import records
from ..services.excel import build_template, parse_workbook
from ..templating import render_page

router = APIRouter()
api = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])


class LoginBody(BaseModel):
    password: str


class ImportBody(BaseModel):
    jenis: Literal["tagihan", "pembayaran", "rekap"]
    bulan: str
    replace: bool = True
    source: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)


Jenis = Literal["tagihan", "pembayaran"]


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
def login(body: LoginBody):
    if not check_password(body.password):
        raise HTTPException(status_code=401, detail="Kata sandi tidak sesuai.")
    return {"token": issue_token()}


@api.get("/summary")
def summary():
    conn = connect()
    try:
        return {"months": MONTHS, "per_bulan": records.month_summary(conn)}
    finally:
        conn.close()


@api.post("/upload")
async def upload(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=422, detail="Format file harus .xlsx atau .xlsm.")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Ukuran file melebihi 20 MB.")
    try:
        sheets = parse_workbook(content, file.filename or "")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"File Excel tidak dapat dibaca: {exc}")
    if not sheets:
        raise HTTPException(status_code=422, detail="Tidak ada sheet berisi data.")
    return {"filename": file.filename, "sheets": sheets}


@api.get("/template")
def template(jenis: Jenis):
    return Response(
        build_template(MONTHS),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="Template {jenis.title()}.xlsx"'},
    )


@api.post("/import")
def import_data(body: ImportBody):
    _check_month(body.bulan)
    if not body.rows:
        raise HTTPException(status_code=422, detail="Tidak ada baris untuk disimpan.")
    with transaction() as conn:
        result = records.import_rows(conn, body.jenis, body.bulan, body.rows, body.replace, body.source)
        if not result["ok"]:
            raise HTTPException(status_code=422, detail=result["errors"])
    return result


@api.get("/records")
def get_records(jenis: Jenis, bulan: str):
    _check_month(bulan)
    conn = connect()
    try:
        return {"jenis": jenis, "bulan": bulan, "rows": records.month_rows(conn, jenis, bulan)}
    finally:
        conn.close()


@api.put("/records")
def save_records(body: WorkspaceBody):
    _check_month(body.bulan)
    with transaction() as conn:
        result = records.save_workspace(conn, body.jenis, body.bulan, body.upserts, body.deletes)
        if not result["ok"]:
            raise HTTPException(status_code=422, detail=result["errors"])
    return result


@api.get("/history")
def history(jenis: Jenis):
    conn = connect()
    try:
        return {"rows": records.import_log(conn, jenis)}
    finally:
        conn.close()
