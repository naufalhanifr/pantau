import sqlite3
from contextlib import contextmanager

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
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
    PRIMARY KEY (kode_bu, bulan),
    FOREIGN KEY (kode_bu) REFERENCES perusahaan(kode_bu)
);
CREATE TABLE IF NOT EXISTS pembayaran (
    kode_bu TEXT NOT NULL,
    bulan TEXT NOT NULL,
    periode TEXT NOT NULL,
    peserta INTEGER NOT NULL DEFAULT 0,
    nominal INTEGER NOT NULL DEFAULT 0,
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
-- PPU PN: satu baris per peserta/keluarga (sheet Gabungan), hierarki SKPD > Satker. Import mengganti seluruh isi.
CREATE TABLE IF NOT EXISTS ppu_pn (
    skpd TEXT NOT NULL,
    satker TEXT NOT NULL,
    nama_peserta TEXT NOT NULL,
    status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ppu_pn_satker ON ppu_pn(skpd, satker);
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
        conn.executescript(SCHEMA)
        _migrate_karyawan(conn)


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
