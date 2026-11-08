from fastapi import HTTPException

from ..config import MONTHS


def check_month(bulan: str) -> None:
    if bulan not in MONTHS:
        raise HTTPException(status_code=422, detail=f"Bulan tidak dikenal: {bulan}")
