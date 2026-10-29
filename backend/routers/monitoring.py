from fastapi import APIRouter
from fastapi.responses import HTMLResponse

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


@router.get("/api/data")
def data():
    conn = connect()
    try:
        rows = monitoring_rows(conn)
    finally:
        conn.close()
    return {"data": rows, "total_records": len(rows)}
