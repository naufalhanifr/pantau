import json

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, Response

from ..config import DB_PATH, WEB_DIR
from ..db import connect
from ..services.records import monitoring_rows
from ..templating import render_page

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
def monitoring_page():
    return render_page(WEB_DIR / "monitoring" / "index.html")


@router.get("/api/health")
def health():
    conn = connect()
    try:
        perusahaan = conn.execute("SELECT COUNT(*) FROM perusahaan").fetchone()[0]
    finally:
        conn.close()
    return {"status": "ok", "database": DB_PATH.name, "total_perusahaan": perusahaan}


# (versi file database, JSON siap kirim). Data hanya berubah saat admin menyimpan, sedangkan query ulang per kunjungan
# melambat tajam bila banyak pengunjung serentak (kontensi sqlite antar-thread: 10 serentak ±7 detik).
_data_cache: tuple[int, bytes] = (0, b"")


@router.get("/api/data")
def data():
    global _data_cache
    version = DB_PATH.stat().st_mtime_ns   # dibaca sebelum query: tulisan di tengah jalan membuat versi berikutnya berbeda
    if _data_cache[0] != version:
        conn = connect()
        try:
            rows = monitoring_rows(conn)
        finally:
            conn.close()
        body = json.dumps({"data": rows, "total_records": len(rows)}, ensure_ascii=False, separators=(",", ":")).encode()
        _data_cache = (version, body)
    return Response(_data_cache[1], media_type="application/json")
