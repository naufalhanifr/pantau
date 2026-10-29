import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import FileResponse
from openpyxl import load_workbook

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SOURCE_FILE = DATA_DIR / "Bekasi.xlsx"
DASHBOARD_FILE = BASE_DIR / "index.html"

app = FastAPI(
    title="PANTAU API",
    description="PANTAU - monitoring iuran berbasis Excel",
    version="2.0.0",
)

_cache_lock = threading.RLock()
_cache_signature = None
_cache_rows: list[dict[str, Any]] = []
_cache_headers: list[str] = []
_cache_modified: str | None = None


def parse_amount(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("Rp", "").replace(" ", "")
    if "." in text and "," not in text:
        text = text.replace(".", "")
    elif "," in text and "." not in text:
        text = text.replace(",", "")
    elif "." in text and "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def find_column(headers: list[str], words: tuple[str, ...]) -> str | None:
    for header in headers:
        normalized = str(header or "").strip().lower()
        if all(word in normalized for word in words):
            return header
    return None


def load_excel(force: bool = False) -> tuple[list[dict[str, Any]], list[str], str]:
    global _cache_signature, _cache_rows, _cache_headers, _cache_modified

    if not SOURCE_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="File sumber Excel belum tersedia. Simpan file sebagai data/Bekasi.xlsx.",
        )

    try:
        stat = SOURCE_FILE.stat()
    except OSError as exc:
        raise HTTPException(status_code=503, detail=f"File Excel tidak dapat diperiksa: {exc}")

    signature = (stat.st_mtime_ns, stat.st_size)
    with _cache_lock:
        if not force and signature == _cache_signature:
            return _cache_rows, _cache_headers, _cache_modified or ""

        try:
            workbook = load_workbook(SOURCE_FILE, read_only=True, data_only=True)
            worksheet = workbook[workbook.sheetnames[0]]
            iterator = worksheet.iter_rows(values_only=True)
            raw_headers = next(iterator, None)
            if not raw_headers:
                workbook.close()
                raise HTTPException(status_code=422, detail="Sheet pertama Excel kosong.")

            headers = [
                str(value).strip() if value is not None else f"Kolom {index + 1}"
                for index, value in enumerate(raw_headers)
            ]
            code_key = find_column(headers, ("kode", "bu"))
            name_key = find_column(headers, ("nama", "bu"))
            no_key = find_column(headers, ("no",))
            tagihan_key = find_column(headers, ("tagihan",))
            bayar_key = next(
                (h for h in headers if "bayar" in h.lower() or "pembayaran" in h.lower()),
                None,
            )

            rows: list[dict[str, Any]] = []
            for excel_row, values in enumerate(iterator, start=2):
                if not values or not any(value is not None and str(value).strip() for value in values):
                    continue
                record = {
                    headers[index]: values[index] if index < len(values) else None
                    for index in range(len(headers))
                }
                code = record.get(code_key) if code_key else None
                name = record.get(name_key) if name_key else None
                record["excel_row"] = excel_row
                record["kode_bu"] = str(code).strip() if code is not None else ""
                record["nama_bu"] = str(name).strip() if name is not None else ""
                record["tagihan"] = parse_amount(record.get(tagihan_key)) if tagihan_key else 0.0
                record["bayar"] = parse_amount(record.get(bayar_key)) if bayar_key else 0.0
                if no_key and record.get(no_key) is not None:
                    record["no"] = record[no_key]
                rows.append(record)

            workbook.close()
            modified = datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Gagal membaca file Excel: {exc}")

        _cache_rows = rows
        _cache_headers = headers
        _cache_signature = signature
        _cache_modified = modified
        return _cache_rows, _cache_headers, _cache_modified


def public_record(row: dict[str, Any]) -> dict[str, Any]:
    # Preserve the source columns while ensuring standard fields for the existing dashboard.
    return dict(row)


@app.get("/")
def home():
    if DASHBOARD_FILE.exists():
        return FileResponse(DASHBOARD_FILE, media_type="text/html")
    return {"app": "PANTAU", "status": "running", "dashboard": "index.html belum tersedia"}


@app.get("/dashboard")
def dashboard():
    if not DASHBOARD_FILE.exists():
        raise HTTPException(status_code=404, detail="index.html belum ditemukan.")
    return FileResponse(DASHBOARD_FILE, media_type="text/html")


@app.get("/api/health")
def health_check():
    rows, _, modified = load_excel()
    return {
        "status": "ok",
        "source": "excel",
        "source_file": SOURCE_FILE.name,
        "last_modified": modified,
        "total_records": len(rows),
    }


@app.get("/api/summary")
def summary():
    rows, _, modified = load_excel()
    return {
        "total_records": len(rows),
        "source_file": SOURCE_FILE.name,
        "source_modified": modified,
    }


@app.get("/api/dashboard")
def dashboard_summary():
    rows, headers, modified = load_excel()
    total_tagihan = sum(row["tagihan"] for row in rows)
    total_bayar = sum(row["bayar"] for row in rows)
    top_tagihan = sorted(rows, key=lambda row: row["tagihan"], reverse=True)[:5]
    top_bayar = sorted(rows, key=lambda row: row["bayar"], reverse=True)[:5]

    period_header = next((key for key in headers if "tagihan" in key.lower()), "")
    period_label = ""
    if "(" in period_header and ")" in period_header:
        period_label = period_header[period_header.find("(") + 1:period_header.rfind(")")]

    return {
        "total_records": len(rows),
        "total_tagihan": total_tagihan,
        "total_bayar": total_bayar,
        "period_label": period_label,
        "top_tagihan": [public_record(row) for row in top_tagihan],
        "top_bayar": [public_record(row) for row in top_bayar],
        "source_file": SOURCE_FILE.name,
        "source_modified": modified,
    }


@app.get("/api/records")
def get_records(
    search: str = Query(default="", max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort_by: str = Query(default="no"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
):
    rows, headers, _ = load_excel()
    term = search.strip().casefold()
    filtered = rows
    if term:
        filtered = [
            row for row in rows
            if any(term in str(value).casefold() for value in row.values() if value is not None)
        ]

    sort_keys = {
        "no": lambda row: row.get("no", row.get("excel_row", 0)),
        "kode": lambda row: str(row.get("kode_bu", "")).casefold(),
        "nama": lambda row: str(row.get("nama_bu", "")).casefold(),
        "tagihan": lambda row: row.get("tagihan", 0),
        "bayar": lambda row: row.get("bayar", 0),
    }
    if sort_by not in sort_keys:
        sort_by = "no"
    filtered = sorted(filtered, key=sort_keys[sort_by], reverse=(sort_dir == "desc"))

    total = len(filtered)
    offset = (page - 1) * page_size
    page_rows = filtered[offset:offset + page_size]
    return {
        "page": page,
        "page_size": page_size,
        "total_records": total,
        "total_pages": (total + page_size - 1) // page_size,
        "data": [public_record(row) for row in page_rows],
    }
