"""PPU PN: peserta per Satker per SKPD, untuk menu PPU PN di web monitoring.

Import: lewat web admin (menu PPU PN), atau python -m backend.services.ppu_pn "Data/PPU PN sd Oktober 2026.xlsx"
Sumber: sheet Gabungan, satu baris per peserta/keluarga. Yang disimpan hanya kolom ini
(SKPD, Satker, nmpst, pisapst, ketjnspeserta, bulan_menunggak, saldo); nomor HP, email, dan alamat di file
tidak masuk database. Tunggakan = jumlah saldo, cocok dengan Total Tunggakan di sheet SKPD dan Satker.
Tiap file berisi posisi satu bulan (dari nama file: "sd Oktober 2026" = Oktober), jadi import hanya mengganti bulan itu.
"""
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from ..config import MONTHS
from ..db import log_change
from .normalize import ExcelError, amount_error, like_pattern, normalize_name, parse_amount

SHEET = "Gabungan"
COLUMNS = {
    "skpd": "skpd", "satker": "satker", "nama_peserta": "nmpst", "status": "pisapst",
    "jenis": "ketjnspeserta", "bulan_menunggak": "bulan_menunggak", "saldo": "saldo",
}
# Kode pisapst -> label yang sama dengan Status Peserta di Daftar Karyawan.
STATUS = {"P": "Peserta", "I": "Istri", "S": "Suami", "A": "Anak", "T": "Keluarga Tambahan"}
# Kolom yang bisa diurutkan di tabel Karyawan; nama ini masuk ke SQL, jadi hanya dari daftar ini.
SORT_COLUMNS = ("nama_peserta", "status", "satker", "skpd")
# Ringkasan terbuka tanpa login: kelompok lebih kecil dari ini tampil tanpa nominal, karena tunggakannya menunjuk ke orang tertentu.
MIN_PUBLIC_PESERTA = 3


def read_workbook(path: Any) -> list[tuple[str, str, str, str, str, int, int]]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        if SHEET not in workbook.sheetnames:
            raise ExcelError(f"Sheet {SHEET} tidak ditemukan.")
        rows = workbook[SHEET].iter_rows(values_only=True)
        header = [str(cell or "").strip().lower() for cell in next(rows, ())]
        missing = [name for name in COLUMNS.values() if name not in header]
        if missing:
            raise ExcelError(f"Kolom tidak ditemukan di sheet {SHEET}: {', '.join(missing)}")
        index = [header.index(name) for name in COLUMNS.values()]
        parsed, problems = [], []
        for position, row in enumerate(rows, start=2):
            values = [row[i] for i in index]
            skpd, satker, nama, status, jenis = (normalize_name(value) for value in values[:5])
            if not (skpd and satker):   # sheet berisi ribuan baris kosong di bawah data
                continue
            errors = [amount_error(values[5], "bulan_menunggak"), amount_error(values[6], "saldo")]
            problems += [f"Baris {position}: {error}" for error in errors if error]
            parsed.append((skpd, satker, nama, STATUS.get(status.upper(), status), jenis, parse_amount(values[5]), parse_amount(values[6])))
        if problems:
            raise ExcelError("Data lama tidak diubah. Perbaiki dulu:\n" + "\n".join(problems[:50]))
        return parsed
    finally:
        workbook.close()


def month_from_filename(path: Any) -> str | None:
    """Bulan terakhir yang disebut di nama file: "PPU PN Januari sd Oktober 2026.xlsx" -> Oktober."""
    found = [word.title() for word in re.findall(r"[A-Za-z]+", Path(path).stem) if word.title() in MONTHS]
    return found[-1] if found else None


def import_rows(conn: sqlite3.Connection, rows: list[tuple], source: str, bulan: str) -> dict[str, int]:
    deleted = conn.execute("DELETE FROM ppu_pn WHERE bulan = ?", (bulan,)).rowcount
    conn.executemany(
        "INSERT INTO ppu_pn (bulan, skpd, satker, nama_peserta, status, jenis, bulan_menunggak, saldo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [(bulan, *row) for row in rows],
    )
    log_change(conn, "upload", source, "ppu_pn", bulan, len(rows), deleted)
    return {"written": len(rows), "deleted": deleted}


def available_months(conn: sqlite3.Connection) -> list[str]:
    found = {row[0] for row in conn.execute("SELECT DISTINCT bulan FROM ppu_pn")}
    return [bulan for bulan in MONTHS if bulan in found]


def satker_summary(conn: sqlite3.Connection, bulan: str) -> list[dict[str, Any]]:
    """Peserta dan tunggakan per Satker beserta SKPD induknya; daftar SKPD dikelompokkan dari sini di browser."""
    return [dict(row) for row in conn.execute(
        "SELECT skpd, satker, COUNT(*) AS peserta, SUM(saldo) AS tunggakan FROM ppu_pn WHERE bulan = ? GROUP BY skpd, satker "
        "ORDER BY skpd COLLATE NOCASE, satker COLLATE NOCASE",
        (bulan,),
    )]


def _mask_small_groups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Hapus nominal kelompok kecil. Bila hanya satu yang tersembunyi, nominalnya bisa dihitung dari total dikurangi
    yang tampil, jadi kelompok terkecil berikutnya ikut disembunyikan."""
    masked = [{**row} for row in rows]
    hidden = [row for row in masked if row["peserta"] < MIN_PUBLIC_PESERTA]
    if len(hidden) == 1:
        others = [row for row in masked if row is not hidden[0]]
        if others:
            hidden.append(min(others, key=lambda row: row["peserta"]))
    for row in hidden:
        row["tunggakan"] = None
    return masked


def public_summary(conn: sqlite3.Connection, bulan: str) -> dict[str, Any]:
    """Ringkasan terbuka: total per SKPD dihitung di sini, karena browser tidak lagi punya semua nominal Satker."""
    rows = satker_summary(conn, bulan)
    by_skpd: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_skpd.setdefault(row["skpd"], []).append(row)
    totals = _mask_small_groups([
        {"skpd": skpd, "peserta": sum(row["peserta"] for row in group), "tunggakan": sum(row["tunggakan"] for row in group)}
        for skpd, group in by_skpd.items()
    ])
    skpd_totals = {row["skpd"]: row["tunggakan"] for row in totals}
    public_rows = []
    for skpd, group in by_skpd.items():
        masked = _mask_small_groups(group)
        # SKPD yang totalnya disembunyikan: nominal Satker-nya akan membuka total itu.
        public_rows += [{**row, "tunggakan": None} for row in masked] if skpd_totals[skpd] is None else masked
    return {"rows": public_rows, "skpd_totals": skpd_totals, "total_tunggakan": sum(row["tunggakan"] for row in rows)}


def public_detail(conn: sqlite3.Connection, bulan: str, skpd: str, satker: str) -> dict[str, Any] | None:
    result = detail(conn, bulan, skpd, satker)
    if result is None:
        return None
    summary = public_summary(conn, bulan)
    if satker:
        visible = next((row["tunggakan"] for row in summary["rows"] if row["skpd"] == skpd and row["satker"] == satker), None)
    else:
        visible = summary["skpd_totals"].get(skpd)
    result["tunggakan"] = visible
    result["per_jenis"] = _mask_small_groups(result["per_jenis"]) if visible is not None else [{**row, "tunggakan": None} for row in result["per_jenis"]]
    return result


def detail(conn: sqlite3.Connection, bulan: str, skpd: str, satker: str) -> dict[str, Any] | None:
    """Rincian satu SKPD (satker kosong) atau satu Satker pada satu bulan. Hanya angka agregat, tanpa nama orang."""
    clause = "WHERE bulan = ? AND skpd = ?" + (" AND satker = ?" if satker else "")
    params = [bulan, skpd, satker] if satker else [bulan, skpd]
    total = conn.execute(
        f"SELECT COUNT(*) AS peserta, COUNT(DISTINCT satker) AS jumlah_satker, SUM(saldo) AS tunggakan FROM ppu_pn {clause}",
        params,
    ).fetchone()
    if not total["peserta"]:
        return None
    per_jenis = [dict(row) for row in conn.execute(
        f"SELECT jenis AS label, COUNT(*) AS peserta, SUM(saldo) AS tunggakan FROM ppu_pn {clause} "
        "GROUP BY label ORDER BY peserta DESC, label",
        params,
    )]
    return {"skpd": skpd, "satker": satker, **dict(total), "per_jenis": per_jenis}


def peserta_page(
    conn: sqlite3.Connection, bulan: str, skpd: str, satker: str, q: str, page: int, size: int, sort: str = "", desc: bool = False,
) -> dict[str, Any]:
    where, params = ["bulan = ?"], [bulan]
    if skpd:
        where.append("skpd = ?")
        params.append(skpd)
    if satker:
        where.append("satker = ?")
        params.append(satker)
    if q:
        where.append("nama_peserta LIKE ? ESCAPE '\\'")
        params.append(like_pattern(q))
    clause = f"WHERE {' AND '.join(where)}"
    total = conn.execute(f"SELECT COUNT(*) FROM ppu_pn {clause}", params).fetchone()[0]
    page = min(max(1, page), max(1, -(-total // size)))
    sort_by = f"{sort} COLLATE NOCASE {'DESC' if desc else 'ASC'}, " if sort in SORT_COLUMNS else ""
    # rowid = urutan file, jadi satu keluarga tetap berdekatan di dalam Satker.
    rows = conn.execute(
        f"SELECT bulan, skpd, satker, nama_peserta, status, jenis, bulan_menunggak, saldo FROM ppu_pn {clause} "
        f"ORDER BY {sort_by}skpd COLLATE NOCASE, satker COLLATE NOCASE, rowid LIMIT ? OFFSET ?",
        [*params, size, (page - 1) * size],
    )
    return {"total": total, "page": page, "rows": [dict(row) for row in rows]}


if __name__ == "__main__":
    from ..db import init_db, transaction
    from .backup import backup_db

    if len(sys.argv) != 2:
        sys.exit('Pakai: python -m backend.services.ppu_pn "Data/PPU PN sd Oktober 2026.xlsx"')
    init_db()
    bulan = month_from_filename(sys.argv[1])
    if not bulan:
        sys.exit('Nama file harus menyebut bulan, contoh: "PPU PN sd Oktober 2026.xlsx"; data lama tidak diubah.')
    try:
        parsed = read_workbook(sys.argv[1])
    except ValueError as error:
        sys.exit(str(error))
    if not parsed:
        sys.exit("Tidak ada baris peserta di file; data lama tidak diubah.")
    backup_db("sebelum-ganti")
    with transaction() as conn:
        result = import_rows(conn, parsed, sys.argv[1], bulan)
    print(f"{result['written']} peserta PPU PN bulan {bulan} disimpan; {result['deleted']} baris lama bulan itu diganti.")
