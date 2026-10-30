import os
import secrets
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "Data"
WEB_DIR = ROOT_DIR / "web"

DB_PATH = Path(os.environ.get("PANTAU_DB", DATA_DIR / "pantau.db"))

# Admin web: kata sandi WAJIB diganti lewat environment variable di server.
ADMIN_PASSWORD = os.environ.get("PANTAU_ADMIN_PASSWORD", "admin-pantau")
# Menu Daftar Karyawan di web monitoring (data pribadi peserta), dicek di server.
KARYAWAN_PASSWORD = os.environ.get("PANTAU_KARYAWAN_PASSWORD", "PantauBPJs")
# Tanpa env, kunci acak per proses: token tidak bisa dipalsukan, tapi semua sesi berakhir saat server restart.
SECRET_KEY = os.environ.get("PANTAU_SECRET_KEY") or secrets.token_hex(32)
TOKEN_TTL_SECONDS = int(os.environ.get("PANTAU_TOKEN_TTL", 8 * 60 * 60))
# Sesi Daftar Karyawan berakhir setelah 30 menit tanpa aktivitas; browser memperpanjang token selama pengguna aktif.
KARYAWAN_IDLE_SECONDS = 30 * 60
# Batas salah kata sandi Daftar Karyawan per alamat IP dalam satu jendela waktu.
LOGIN_MAX_FAILURES = 5
LOGIN_LOCK_SECONDS = 15 * 60

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # file Karyawan setahun ±30 MB

MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
