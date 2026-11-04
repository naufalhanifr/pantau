"""PPU PN: peserta per Satker per SKPD, untuk menu PPU PN di web monitoring.

Import: python -m backend.services.ppu_pn "Data/PPU PN sd Oktober 2026.xlsx"
Sumber: sheet Gabungan, satu baris per peserta/keluarga. Yang disimpan hanya kolom yang ditampilkan
(SKPD, Satker, nmpst, pisapst); nomor HP, email, dan alamat di file tidak masuk database.
File berisi posisi terakhir, bukan per bulan, jadi import mengganti seluruh isi tabel ppu_pn.
"""
import sqlite3
import sys
from typing import Any

from openpyxl import load_workbook

from .normalize import normalize_name

SHEET = "Gabungan"
COLUMNS = {"skpd": "skpd", "satker": "satker", "nama_peserta": "nmpst", "status": "pisapst"}
# Kode pisapst -> label yang sama dengan Status Peserta di Daftar Karyawan.
STATUS = {"P": "Peserta", "I": "Istri", "S": "Suami", "A": "Anak", "T": "Keluarga Tambahan"}


def read_workbook(path: Any) -> list[tuple[str, str, str, str]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        if SHEET not in workbook.sheetnames:
            raise ValueError(f"Sheet {SHEET} tidak ditemukan.")
        rows = workbook[SHEET].iter_rows(values_only=True)
        header = [str(cell or "").strip().lower() for cell in next(rows, ())]
        missing = [name for name in COLUMNS.values() if name not in header]
        if missing:
            raise ValueError(f"Kolom tidak ditemukan di sheet {SHEET}: {', '.join(missing)}")
        index = [header.index(name) for name in COLUMNS.values()]
        parsed = []
        for row in rows:
            skpd, satker, nama, status = (normalize_name(row[i]) for i in index)
            if skpd and satker:   # sheet berisi ribuan baris kosong di bawah data
                parsed.append((skpd, satker, nama, STATUS.get(status.upper(), status)))
        return parsed
    finally:
        workbook.close()


def import_rows(conn: sqlite3.Connection, rows: list[tuple], source: str) -> dict[str, int]:
    deleted = conn.execute("DELETE FROM ppu_pn").rowcount
    conn.executemany("INSERT INTO ppu_pn (skpd, satker, nama_peserta, status) VALUES (?, ?, ?, ?)", rows)
    conn.execute(
        "INSERT INTO import_log (action, source, jenis, rows_written, rows_deleted) VALUES ('upload', ?, 'ppu_pn', ?, ?)",
        (source, len(rows), deleted),
    )
    return {"written": len(rows), "deleted": deleted}


def satker_summary(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Jumlah peserta per Satker beserta SKPD induknya; daftar SKPD dikelompokkan dari sini di browser."""
    return [dict(row) for row in conn.execute(
        "SELECT skpd, satker, COUNT(*) AS peserta FROM ppu_pn GROUP BY skpd, satker "
        "ORDER BY skpd COLLATE NOCASE, satker COLLATE NOCASE"
    )]


def peserta_page(conn: sqlite3.Connection, skpd: str, satker: str, q: str, page: int, size: int) -> dict[str, Any]:
    where, params = [], []
    if skpd:
        where.append("skpd = ?")
        params.append(skpd)
    if satker:
        where.append("satker = ?")
        params.append(satker)
    if q:
        where.append("nama_peserta LIKE ?")
        params.append(f"%{q}%")
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    total = conn.execute(f"SELECT COUNT(*) FROM ppu_pn {clause}", params).fetchone()[0]
    page = min(max(1, page), max(1, -(-total // size)))
    # rowid = urutan file, jadi satu keluarga tetap berdekatan di dalam Satker.
    rows = conn.execute(
        f"SELECT skpd, satker, nama_peserta, status FROM ppu_pn {clause} "
        "ORDER BY skpd COLLATE NOCASE, satker COLLATE NOCASE, rowid LIMIT ? OFFSET ?",
        [*params, size, (page - 1) * size],
    )
    return {"total": total, "page": page, "rows": [dict(row) for row in rows]}


if __name__ == "__main__":
    from ..db import init_db, transaction

    if len(sys.argv) != 2:
        sys.exit('Pakai: python -m backend.services.ppu_pn "Data/PPU PN sd Oktober 2026.xlsx"')
    init_db()
    parsed = read_workbook(sys.argv[1])
    if not parsed:
        sys.exit("Tidak ada baris peserta di file; data lama tidak diubah.")
    with transaction() as conn:
        result = import_rows(conn, parsed, sys.argv[1])
    print(f"{result['written']} peserta PPU PN disimpan; {result['deleted']} baris lama diganti.")
