from fastapi import APIRouter, Depends, Query

from ..auth import require_karyawan
from ..db import connect
from ..services import ppu_pn

# Ringkasan SKPD/Satker terbuka seperti Dashboard; daftar peserta berisi nama orang, jadi perlu login Daftar Karyawan.
api = APIRouter(prefix="/api/ppu-pn")


@api.get("/satker")
def satker():
    conn = connect()
    try:
        return {"rows": ppu_pn.satker_summary(conn)}
    finally:
        conn.close()


@api.get("/peserta", dependencies=[Depends(require_karyawan)])
def peserta(
    skpd: str = "",
    satker: str = "",
    q: str = "",
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
):
    conn = connect()
    try:
        return ppu_pn.peserta_page(conn, skpd.strip(), satker.strip(), q.strip(), page, size)
    finally:
        conn.close()
