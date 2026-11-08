import json
from contextlib import closing

from fastapi import APIRouter, Header
from fastapi.responses import HTMLResponse, Response

from ..config import DB_PATH, PANTAU_YEAR, WEB_DIR
from ..db import connect
from ..services.records import monitoring_rows
from ..templating import render_page

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def monitoring_page():
    return render_page(WEB_DIR / "monitoring" / "index.html")


@router.get("/api/health")
def health():
    with closing(connect()) as conn:
        conn.execute("SELECT 1 FROM perusahaan LIMIT 1").fetchone()
    return {"status": "ok"}


# (versi file database, JSON siap kirim). Data hanya berubah saat admin menyimpan, sedangkan query ulang per kunjungan
# melambat tajam bila banyak pengunjung serentak (kontensi sqlite antar-thread: 10 serentak ±7 detik).
_data_cache: tuple[int, bytes] = (0, b"")


@router.get("/api/data")
def data(if_none_match: str = Header(default="")):
    global _data_cache
    version = DB_PATH.stat().st_mtime_ns   # dibaca sebelum query: tulisan di tengah jalan membuat versi berikutnya berbeda
    if _data_cache[0] != version:
        with closing(connect()) as conn:
            rows = monitoring_rows(conn)
        body = json.dumps({"data": rows, "total_records": len(rows), "year": PANTAU_YEAR}, ensure_ascii=False, separators=(",", ":")).encode()
        _data_cache = (version, body)
    # Data publik ±388 KB yang jarang berubah: browser cek ulang dengan ETag, tanpa mengunduh lagi bila sama.
    headers = {"ETag": f'"{_data_cache[0]}"', "Cache-Control": "no-cache"}
    if if_none_match == headers["ETag"]:
        return Response(status_code=304, headers=headers)
    return Response(_data_cache[1], media_type="application/json", headers=headers)
