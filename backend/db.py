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
