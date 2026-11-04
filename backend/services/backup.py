"""Backup database: harian lewat cron (deploy.sh memasangnya) dan otomatis sebelum data satu bulan diganti.

Jalankan manual: .venv/bin/python -m backend.services.backup harian
Pulihkan: stop service, salin file backup menjadi Data/pantau.db, start service.
"""
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

from ..config import BACKUP_DIR, DB_PATH

# Jumlah file yang disimpan per jenis; yang paling lama dihapus.
KEEP = {"harian": 7, "sebelum-ganti": 10}


def backup_db(kind: str) -> Path | None:
    """API backup SQLite aman walau ada request lain yang sedang menulis, tidak seperti cp. None bila database belum ada."""
    if not DB_PATH.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = BACKUP_DIR / f"pantau-{kind}-{datetime.now():%Y%m%d-%H%M%S-%f}.db"
    source = sqlite3.connect(DB_PATH)
    # Berkas dibuat dengan izin 600 lebih dulu: isinya data pribadi.
    os.close(os.open(target, os.O_CREAT | os.O_WRONLY, 0o600))
    destination = sqlite3.connect(target)
    try:
        with destination:
            source.backup(destination)
    finally:
        destination.close()
        source.close()
    for old in sorted(BACKUP_DIR.glob(f"pantau-{kind}-*.db"), reverse=True)[KEEP.get(kind, 7):]:
        old.unlink()
    return target


if __name__ == "__main__":
    print(backup_db(sys.argv[1] if len(sys.argv) > 1 else "harian"))
