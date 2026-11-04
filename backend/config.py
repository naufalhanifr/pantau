import os
import secrets
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "Data"
WEB_DIR = ROOT_DIR / "web"

DB_PATH = Path(os.environ.get("PANTAU_DB", DATA_DIR / "pantau.db"))

# Tanpa kata sandi bawaan: variabel yang kosong membuat auth.check_login menolak semua login di menu itu.
# Admin web.
ADMIN_PASSWORD = os.environ.get("PANTAU_ADMIN_PASSWORD", "")
# Menu Karyawan PPU BU dan Karyawan PPU PN di web monitoring (data pribadi peserta), dicek di server. Masing-masing punya kata sandi dan sesi sendiri.
KARYAWAN_PASSWORD = os.environ.get("PANTAU_KARYAWAN_PASSWORD", "")
PPU_PN_PASSWORD = os.environ.get("PANTAU_PPU_PN_PASSWORD", "")
# Tanpa env, kunci acak per proses: token tidak bisa dipalsukan, tapi semua sesi berakhir saat server restart.
SECRET_KEY = os.environ.get("PANTAU_SECRET_KEY") or secrets.token_hex(32)
# Di luar Data/: `deploy.sh --with-data` memakai rsync --delete di Data/ dan akan menghapus backup server.
BACKUP_DIR = Path(os.environ.get("PANTAU_BACKUP_DIR", ROOT_DIR / "backups"))
# Satu database = satu tahun (README "Pergantian tahun"). Dikirim ke browser lewat /api/data.
PANTAU_YEAR = int(os.environ.get("PANTAU_YEAR", 2026))
TOKEN_TTL_SECONDS = int(os.environ.get("PANTAU_TOKEN_TTL", 8 * 60 * 60))
# Kedua sesi karyawan berakhir setelah 30 menit tanpa aktivitas; browser memperpanjang token selama pengguna aktif.
KARYAWAN_IDLE_SECONDS = 30 * 60
# Batas salah kata sandi per alamat IP dalam satu jendela waktu. Tidak terlalu ketat karena staf kantor berbagi satu IP
# publik: satu orang salah ketik beberapa kali tidak boleh mengunci semua orang.
LOGIN_MAX_FAILURES = 10
LOGIN_LOCK_SECONDS = 15 * 60

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # file Karyawan setahun ±30 MB

MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
