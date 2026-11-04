from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import check_login, issue_token, require_karyawan, revoke_token
from ..config import KARYAWAN_IDLE_SECONDS, KARYAWAN_PASSWORD, MONTHS
from ..db import connect
from ..services import karyawan

router = APIRouter()
api = APIRouter(prefix="/api/karyawan", dependencies=[Depends(require_karyawan)])


class LoginBody(BaseModel):
    password: str


# Nama dan No. JKN lewat body POST, bukan query string: URL tercatat di log nginx.
class HistoryBody(BaseModel):
    noka: str
    bulan: str


class SearchBody(BaseModel):
    bulan: str
    q: str = ""
    status: str = ""
    bu: str = ""
    bayar: Literal["", "lunas", "nyicil", "belum"] = ""
    sort: str = ""
    dir: Literal["asc", "desc"] = "asc"
    page: int = Field(1, ge=1)
    size: int = Field(10, ge=1, le=100)


@router.post("/api/karyawan/login")
def login(body: LoginBody, request: Request):
    check_login(request, "karyawan", body.password, KARYAWAN_PASSWORD)
    return {"token": issue_token("karyawan", KARYAWAN_IDLE_SECONDS)}


@api.post("/refresh")
def refresh():
    """Perpanjang sesi 30 menit lagi; dipanggil browser hanya selama pengguna aktif."""
    return {"token": issue_token("karyawan", KARYAWAN_IDLE_SECONDS)}


@api.post("/logout")
def logout(authorization: str = Header(default="")):
    revoke_token(authorization)
    return {"ok": True}


@api.get("/meta")
def meta(bulan: str = ""):
    """Bulan tagih yang tersedia dan daftar badan usaha pada bulan terpilih (default: bulan terakhir)."""
    conn = connect()
    try:
        months = karyawan.available_months(conn)
        if bulan not in {m["bulan"] for m in months}:
            bulan = months[-1]["bulan"] if months else ""
        return {"months": months, "bulan": bulan, "businesses": karyawan.business_names(conn, bulan),
                "summary": karyawan.pay_summary(conn, bulan)}
    finally:
        conn.close()


@api.post("/riwayat")
def history(body: HistoryBody):
    if body.bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {body.bulan}")
    conn = connect()
    try:
        return {"rows": karyawan.payment_history(conn, body.noka.strip(), body.bulan)}
    finally:
        conn.close()


@api.post("/search")
def employees(body: SearchBody):
    if body.bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {body.bulan}")
    if body.sort and body.sort not in karyawan.SORT_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Kolom urutan tidak dikenal: {body.sort}")
    conn = connect()
    try:
        return karyawan.employee_page(
            conn, body.bulan, body.q.strip(), body.status.strip(), body.bu.strip(), body.page, body.size, body.bayar, body.sort, body.dir == "desc"
        )
    finally:
        conn.close()
