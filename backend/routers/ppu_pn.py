from fastapi import APIRouter, Depends, Query

from ..auth import require_karyawan
from ..db import connect
from ..services import ppu_pn

# Berisi nama peserta: login sama dengan Daftar Karyawan.
api = APIRouter(prefix="/api/ppu-pn", dependencies=[Depends(require_karyawan)])


@api.get("/satker")
def satker():
    conn = connect()
    try:
        return {"rows": ppu_pn.satker_summary(conn)}
    finally:
        conn.close()


@api.get("/peserta")
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
