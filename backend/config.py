import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "Data"
WEB_DIR = ROOT_DIR / "web"

DB_PATH = Path(os.environ.get("PANTAU_DB", DATA_DIR / "pantau.db"))

# Admin web: kata sandi WAJIB diganti lewat environment variable di server.
ADMIN_PASSWORD = os.environ.get("PANTAU_ADMIN_PASSWORD", "admin-pantau")
SECRET_KEY = os.environ.get("PANTAU_SECRET_KEY", "ganti-secret-key-ini")
TOKEN_TTL_SECONDS = int(os.environ.get("PANTAU_TOKEN_TTL", 8 * 60 * 60))

MAX_UPLOAD_BYTES = 20 * 1024 * 1024

MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
