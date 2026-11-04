from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..auth import check_login, issue_token, require_ppu_pn, revoke_token
from ..config import KARYAWAN_IDLE_SECONDS, PPU_PN_PASSWORD
from ..db import connect
from ..services import ppu_pn

# Ringkasan SKPD/Satker terbuka seperti Dashboard; daftar peserta berisi nama orang, jadi perlu login PPU PN sendiri.
api = APIRouter(prefix="/api/ppu-pn")


class LoginBody(BaseModel):
    password: str


# Nama peserta lewat body POST, bukan query string: URL tercatat di log nginx.
class PesertaBody(BaseModel):
    bulan: str = ""
    skpd: str = ""
    satker: str = ""
    q: str = ""
    sort: str = ""
    dir: Literal["asc", "desc"] = "asc"
    page: int = Field(1, ge=1)
    size: int = Field(10, ge=1, le=100)


@api.post("/login")
def login(body: LoginBody, request: Request):
    check_login(request, "ppu_pn", body.password, PPU_PN_PASSWORD)
    return {"token": issue_token("ppu_pn", KARYAWAN_IDLE_SECONDS)}


@api.post("/refresh", dependencies=[Depends(require_ppu_pn)])
def refresh():
    """Perpanjang sesi 30 menit lagi; dipanggil browser hanya selama pengguna aktif."""
    return {"token": issue_token("ppu_pn", KARYAWAN_IDLE_SECONDS)}


@api.post("/logout", dependencies=[Depends(require_ppu_pn)])
def logout(authorization: str = Header(default="")):
    revoke_token(authorization)
    return {"ok": True}


@api.get("/satker")
def satker(bulan: str = ""):
    """Bulan yang tersedia dan ringkasan Satker pada bulan terpilih (default: bulan terakhir). Tanpa login: nominal kelompok kecil disembunyikan."""
    conn = connect()
    try:
        months = ppu_pn.available_months(conn)
        if bulan not in months:
            bulan = months[-1] if months else ""
        return {"months": months, "bulan": bulan, **ppu_pn.public_summary(conn, bulan)}
    finally:
        conn.close()


@api.get("/detail")
def detail(bulan: str = Query(min_length=1), skpd: str = Query(min_length=1), satker: str = ""):
    conn = connect()
    try:
        result = ppu_pn.public_detail(conn, bulan, skpd.strip(), satker.strip())
    finally:
        conn.close()
    if result is None:
        raise HTTPException(status_code=404, detail="Data SKPD atau Satker tidak ditemukan.")
    return result


@api.post("/peserta", dependencies=[Depends(require_ppu_pn)])
def peserta(body: PesertaBody):
    if body.sort and body.sort not in ppu_pn.SORT_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Kolom urutan tidak dikenal: {body.sort}")
    conn = connect()
    try:
        return ppu_pn.peserta_page(conn, body.bulan, body.skpd.strip(), body.satker.strip(), body.q.strip(), body.page, body.size, body.sort, body.dir == "desc")
    finally:
        conn.close()
