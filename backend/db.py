import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS perusahaan (
    kode_bu TEXT PRIMARY KEY,
    nama_bu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tagihan (
    kode_bu TEXT NOT NULL,
    bulan TEXT NOT NULL,
    periode TEXT NOT NULL,
    peserta INTEGER NOT NULL DEFAULT 0,
    nominal INTEGER NOT NULL DEFAULT 0,
    nama_bu TEXT,
    PRIMARY KEY (kode_bu, bulan),
    FOREIGN KEY (kode_bu) REFERENCES perusahaan(kode_bu)
);
CREATE TABLE IF NOT EXISTS pembayaran (
    kode_bu TEXT NOT NULL,
    bulan TEXT NOT NULL,
    periode TEXT NOT NULL,
    peserta INTEGER NOT NULL DEFAULT 0,
    nominal INTEGER NOT NULL DEFAULT 0,
    nama_bu TEXT,
    PRIMARY KEY (kode_bu, bulan),
    FOREIGN KEY (kode_bu) REFERENCES perusahaan(kode_bu)
);
CREATE TABLE IF NOT EXISTS import_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    action TEXT NOT NULL,
    source TEXT,
    jenis TEXT,
    bulan TEXT,
    rows_written INTEGER NOT NULL DEFAULT 0,
    rows_deleted INTEGER NOT NULL DEFAULT 0
);
-- Daftar Karyawan: satu baris per peserta/keluarga per bulan tagih (satu sheet Excel = satu bulan).
CREATE TABLE IF NOT EXISTS karyawan (
    bulan TEXT NOT NULL,
    periode TEXT NOT NULL,
    kode_bu TEXT NOT NULL,
    nama_bu TEXT NOT NULL,
    noka_peserta TEXT NOT NULL,
    nama_peserta TEXT NOT NULL,
    noka_keluarga TEXT NOT NULL,
    nama_keluarga TEXT NOT NULL,
    status TEXT NOT NULL,
    bulan_menunggak INTEGER NOT NULL DEFAULT 0,
    nominal_tagihan INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bulan, noka_keluarga)
);
-- Riwayat pembayaran karyawan: Tanggal/Jumlah Bayar dari sheet bulan itu. Pembayaran terakhir dihitung saat query.
CREATE TABLE IF NOT EXISTS karyawan_pembayaran (
    bulan TEXT NOT NULL,
    noka_keluarga TEXT NOT NULL,
    tanggal_bayar TEXT,
    jumlah_bayar INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (bulan, noka_keluarga)
);
-- PPU PN: satu baris per peserta/keluarga (sheet Gabungan), hierarki SKPD > Satker. Import mengganti satu bulan.
CREATE TABLE IF NOT EXISTS ppu_pn (
    bulan TEXT NOT NULL,
    skpd TEXT NOT NULL,
    satker TEXT NOT NULL,
    nama_peserta TEXT NOT NULL,
    status TEXT NOT NULL,
    jenis TEXT NOT NULL,
    bulan_menunggak INTEGER NOT NULL DEFAULT 0,
    saldo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ppu_pn_satker ON ppu_pn(bulan, skpd, satker);
CREATE INDEX IF NOT EXISTS idx_karyawan_pembayaran_noka ON karyawan_pembayaran(noka_keluarga, tanggal_bayar);
CREATE INDEX IF NOT EXISTS idx_karyawan_bulan_bu ON karyawan(bulan, nama_bu);
CREATE INDEX IF NOT EXISTS idx_tagihan_bulan ON tagihan(bulan);
CREATE INDEX IF NOT EXISTS idx_pembayaran_bulan ON pembayaran(bulan);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with transaction() as conn:
        migrate(conn)


def migrate(conn: sqlite3.Connection) -> None:
    """Buat tabel yang belum ada dan ubah struktur versi lama; aman dijalankan tiap start."""
    _migrate_ppu_pn(conn)
    conn.executescript(SCHEMA)
    _migrate_karyawan(conn)
    _migrate_nama_per_bulan(conn)
    # Sisa versi awal: tidak dibaca kode mana pun, sumber datanya sekarang import_log.
    conn.execute("DROP TABLE IF EXISTS metadata")


# Kantor di WIB; jam server bisa UTC, jadi waktu riwayat tidak memakai datetime('now', 'localtime').
WIB = timezone(timedelta(hours=7))


def log_change(conn: sqlite3.Connection, action: str, source: str, jenis: str, bulan: str, written: int, deleted: int) -> None:
    conn.execute(
        "INSERT INTO import_log (created_at, action, source, jenis, bulan, rows_written, rows_deleted) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (datetime.now(WIB).strftime("%Y-%m-%d %H:%M:%S"), action, source, jenis, bulan, written, deleted),
    )


def _migrate_nama_per_bulan(conn: sqlite3.Connection) -> None:
    """Baris lama tanpa nama tetap memakai nama dari tabel perusahaan."""
    for table in ("tagihan", "pembayaran"):
        if "nama_bu" not in {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN nama_bu TEXT")


def _migrate_ppu_pn(conn: sqlite3.Connection) -> None:
    """Struktur lama tanpa bulan: buang agar dibuat ulang. Isinya salinan file Excel, jadi cukup diimport lagi;
    tabel kosong lebih jujur daripada menebak bulan data lama."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(ppu_pn)")}
    if columns and "bulan" not in columns:
        conn.execute("DROP TABLE ppu_pn")


def _migrate_karyawan(conn: sqlite3.Connection) -> None:
    """Struktur lama menyimpan pembayaran di baris karyawan: pindahkan ke karyawan_pembayaran lalu hapus kolomnya."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(karyawan)")}
    if "tanggal_bayar" not in columns:
        return
    conn.execute(
        "INSERT OR REPLACE INTO karyawan_pembayaran (bulan, noka_keluarga, tanggal_bayar, jumlah_bayar) "
        "SELECT bulan, noka_keluarga, tanggal_bayar, COALESCE(jumlah_bayar, 0) FROM karyawan "
        "WHERE tanggal_bayar IS NOT NULL OR jumlah_bayar IS NOT NULL"
    )
    conn.execute("ALTER TABLE karyawan DROP COLUMN tanggal_bayar")
    conn.execute("ALTER TABLE karyawan DROP COLUMN jumlah_bayar")
