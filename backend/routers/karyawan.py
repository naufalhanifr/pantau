from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ..auth import check_login, issue_token, require_karyawan
from ..config import KARYAWAN_IDLE_SECONDS, KARYAWAN_PASSWORD, MONTHS
from ..db import connect
from ..services import karyawan

router = APIRouter()
api = APIRouter(prefix="/api/karyawan", dependencies=[Depends(require_karyawan)])


class LoginBody(BaseModel):
    password: str


@router.post("/api/karyawan/login")
def login(body: LoginBody, request: Request):
    check_login(request, "karyawan", body.password, KARYAWAN_PASSWORD)
    return {"token": issue_token("karyawan", KARYAWAN_IDLE_SECONDS)}


@api.post("/refresh")
def refresh():
    """Perpanjang sesi 30 menit lagi; dipanggil browser hanya selama pengguna aktif."""
    return {"token": issue_token("karyawan", KARYAWAN_IDLE_SECONDS)}


@api.get("/meta")
def meta(bulan: str = ""):
    """Bulan tagih yang tersedia dan daftar badan usaha pada bulan terpilih (default: bulan terakhir)."""
    conn = connect()
    try:
        months = karyawan.available_months(conn)
        if bulan not in {m["bulan"] for m in months}:
            bulan = months[-1]["bulan"] if months else ""
        return {"months": months, "bulan": bulan, "businesses": karyawan.business_names(conn, bulan)}
    finally:
        conn.close()


@api.get("/riwayat")
def history(noka: str, bulan: str):
    if bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {bulan}")
    conn = connect()
    try:
        return {"rows": karyawan.payment_history(conn, noka.strip(), bulan)}
    finally:
        conn.close()


@api.get("")
def employees(
    bulan: str,
    q: str = "",
    status: str = "",
    bu: str = "",
    bayar: Literal["", "lunas", "nyicil", "belum"] = "",
    sort: str = "",
    dir: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    if bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {bulan}")
    if sort and sort not in karyawan.SORT_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Kolom urutan tidak dikenal: {sort}")
    conn = connect()
    try:
        return karyawan.employee_page(
            conn, bulan, q.strip(), status.strip(), bu.strip(), page, size, bayar, sort, dir == "desc"
        )
    finally:
        conn.close()
