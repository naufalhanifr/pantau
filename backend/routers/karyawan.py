from contextlib import closing
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_karyawan, session_routes
from ..config import KARYAWAN_IDLE_SECONDS, KARYAWAN_PASSWORD
from ..db import connect
from ..services import karyawan
from . import check_month

session = session_routes("/api/karyawan", "karyawan", KARYAWAN_PASSWORD, KARYAWAN_IDLE_SECONDS, require_karyawan)
api = APIRouter(prefix="/api/karyawan", dependencies=[Depends(require_karyawan)])


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


@api.get("/meta")
def meta(bulan: str = ""):
    """Bulan tagih yang tersedia dan daftar badan usaha pada bulan terpilih (default: bulan terakhir)."""
    with closing(connect()) as conn:
        months = karyawan.available_months(conn)
        if bulan not in {m["bulan"] for m in months}:
            bulan = months[-1]["bulan"] if months else ""
        return {"months": months, "bulan": bulan, "businesses": karyawan.business_names(conn, bulan),
                "summary": karyawan.pay_summary(conn, bulan)}


@api.post("/riwayat")
def history(body: HistoryBody):
    check_month(body.bulan)
    with closing(connect()) as conn:
        return {"rows": karyawan.payment_history(conn, body.noka.strip(), body.bulan)}


@api.post("/search")
def employees(body: SearchBody):
    check_month(body.bulan)
    if body.sort and body.sort not in karyawan.SORT_COLUMNS:
        raise HTTPException(status_code=422, detail=f"Kolom urutan tidak dikenal: {body.sort}")
    with closing(connect()) as conn:
        return karyawan.employee_page(
            conn, body.bulan, body.q.strip(), body.status.strip(), body.bu.strip(), body.page, body.size, body.bayar, body.sort, body.dir == "desc"
        )
