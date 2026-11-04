import sqlite3
from typing import Any, Iterable

from ..config import MONTHS
from .normalize import amount_error, normalize_kode, normalize_name, parse_amount

JENIS_TABLE = {"tagihan": "tagihan", "pembayaran": "pembayaran"}

MONTH_ROWS_SQL = """
WITH keys AS (
    SELECT kode_bu, bulan FROM tagihan WHERE bulan = :bulan
    UNION
    SELECT kode_bu, bulan FROM pembayaran WHERE bulan = :bulan
)
SELECT k.kode_bu,
       COALESCE(t.nama_bu, b.nama_bu, p.nama_bu, '') AS nama_bu,
       k.bulan,
       COALESCE(t.peserta, 0) AS peserta_tagihan,
       COALESCE(t.nominal, 0) AS tagihan,
       COALESCE(b.peserta, 0) AS peserta_bayar,
       COALESCE(b.nominal, 0) AS bayar
FROM keys k
LEFT JOIN perusahaan p ON p.kode_bu = k.kode_bu
LEFT JOIN tagihan t ON t.kode_bu = k.kode_bu AND t.bulan = k.bulan
LEFT JOIN pembayaran b ON b.kode_bu = k.kode_bu AND b.bulan = k.bulan
ORDER BY tagihan DESC, k.kode_bu
"""


def monitoring_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Baris per BU per bulan untuk web monitoring (format yang dipakai dashboard)."""
    rows = []
    for index, bulan in enumerate(MONTHS, start=1):
        for row in conn.execute(MONTH_ROWS_SQL, {"bulan": bulan}):
            rows.append({
                "kode_bu": row["kode_bu"],
                "nama_bu": row["nama_bu"],
                "month": index,
                "bulan": bulan,
                "tagihan": row["tagihan"],
                "bayar": row["bayar"],
            })
    return rows


def month_rows(conn: sqlite3.Connection, jenis: str, bulan: str) -> list[dict[str, Any]]:
    """Baris satu jenis (tagihan/pembayaran) pada satu bulan untuk workspace admin."""
    table = JENIS_TABLE[jenis]
    sql = (
        "SELECT t.kode_bu, COALESCE(t.nama_bu, p.nama_bu, '') AS nama_bu, t.peserta, t.nominal "
        f"FROM {table} t LEFT JOIN perusahaan p ON p.kode_bu = t.kode_bu "
        "WHERE t.bulan = ? ORDER BY t.nominal DESC, t.kode_bu"
    )
    return [dict(row) for row in conn.execute(sql, (bulan,))]


def month_summary(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    summary = []
    for bulan in MONTHS:
        tagihan = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total FROM tagihan WHERE bulan = ?", (bulan,)
        ).fetchone()
        bayar = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(nominal), 0) AS total FROM pembayaran WHERE bulan = ?", (bulan,)
        ).fetchone()
        karyawan = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(nominal_tagihan), 0) AS total FROM karyawan WHERE bulan = ?", (bulan,)
        ).fetchone()
        ppu = conn.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(saldo), 0) AS total FROM ppu_pn WHERE bulan = ?", (bulan,)
        ).fetchone()
        summary.append({
            "bulan": bulan,
            "karyawan_rows": karyawan["n"],
            "karyawan_total": karyawan["total"],
            "tagihan_rows": tagihan["n"],
            "tagihan_total": tagihan["total"],
            "bayar_rows": bayar["n"],
            "bayar_total": bayar["total"],
            "ppu_rows": ppu["n"],
            "ppu_total": ppu["total"],
        })
    return summary


def _upsert_company(conn: sqlite3.Connection, kode: str, nama: str) -> None:
    if nama:
        conn.execute(
            "INSERT INTO perusahaan (kode_bu, nama_bu) VALUES (?, ?) "
            "ON CONFLICT(kode_bu) DO UPDATE SET nama_bu = excluded.nama_bu",
            (kode, nama),
        )
    else:
        conn.execute("INSERT OR IGNORE INTO perusahaan (kode_bu, nama_bu) VALUES (?, ?)", (kode, kode))


def _upsert_amount(conn: sqlite3.Connection, table: str, kode: str, nama: str, bulan: str, peserta: int, nominal: int) -> None:
    # Nama ikut disimpan per bulan: BU yang berganti nama tidak mengubah tampilan bulan-bulan sebelumnya.
    conn.execute(
        f"INSERT INTO {table} (kode_bu, bulan, periode, peserta, nominal, nama_bu) VALUES (?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(kode_bu, bulan) DO UPDATE SET peserta = excluded.peserta, nominal = excluded.nominal, "
        "nama_bu = COALESCE(excluded.nama_bu, nama_bu)",
        (kode, bulan, bulan, peserta, nominal, nama or None),
    )


def _clean_rows(rows: Iterable[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    cleaned, errors, seen = [], [], set()
    for position, row in enumerate(rows, start=1):
        kode = normalize_kode(row.get("kode_bu"))
        if not kode:
            errors.append(f"Baris {position}: KODE BU kosong.")
            continue
        if kode in seen:
            errors.append(f"Baris {position}: KODE BU {kode} duplikat.")
            continue
        seen.add(kode)
        if not (kode.isdigit() and len(kode) == 8):
            errors.append(f"Baris {position}: KODE BU harus 8 digit angka ({kode[:40]}).")
            continue
        problems = [amount_error(row.get(field), label) for field, label in (("peserta", "Peserta"), ("nominal", "Nominal"))]
        if any(problems):
            errors += [f"Baris {position} (KODE BU {kode}): {problem}" for problem in problems if problem]
            continue
        cleaned.append({
            "kode_bu": kode,
            "nama_bu": normalize_name(row.get("nama_bu")),
            "peserta": parse_amount(row.get("peserta")),
            "nominal": parse_amount(row.get("nominal")),
        })
    return cleaned, errors


def row_errors(rows: list[dict[str, Any]]) -> list[str]:
    """Dicek sebelum backup, supaya percobaan yang pasti ditolak tidak menggeser file backup lama."""
    return _clean_rows(rows)[1][:50]


def import_rows(
    conn: sqlite3.Connection, jenis: str, bulan: str, rows: list[dict[str, Any]], replace: bool, source: str
) -> dict[str, Any]:
    """Simpan hasil upload satu jenis (tagihan | pembayaran) pada satu bulan."""
    table = JENIS_TABLE[jenis]
    cleaned, errors = _clean_rows(rows)
    if errors:
        return {"ok": False, "errors": errors[:50]}

    deleted = conn.execute(f"DELETE FROM {table} WHERE bulan = ?", (bulan,)).rowcount if replace else 0
    for row in cleaned:
        _upsert_company(conn, row["kode_bu"], row["nama_bu"])
        _upsert_amount(conn, table, row["kode_bu"], row["nama_bu"], bulan, row["peserta"], row["nominal"])

    conn.execute(
        "INSERT INTO import_log (action, source, jenis, bulan, rows_written, rows_deleted) VALUES (?, ?, ?, ?, ?, ?)",
        ("upload", source, jenis, bulan, len(cleaned), deleted),
    )
    return {"ok": True, "written": len(cleaned), "deleted": deleted}


def save_workspace(
    conn: sqlite3.Connection, jenis: str, bulan: str, upserts: list[dict[str, Any]], deletes: list[str]
) -> dict[str, Any]:
    """Simpan perubahan dari workspace spreadsheet satu jenis: baris diubah/ditambah dan baris dihapus."""
    table = JENIS_TABLE[jenis]
    cleaned, errors = _clean_rows(upserts)
    if errors:
        return {"ok": False, "errors": errors[:50]}

    deleted = sum(
        conn.execute(f"DELETE FROM {table} WHERE kode_bu = ? AND bulan = ?", (kode, bulan)).rowcount
        for kode in {normalize_kode(k) for k in deletes if k}
    )

    for row in cleaned:
        _upsert_company(conn, row["kode_bu"], row["nama_bu"])
        _upsert_amount(conn, table, row["kode_bu"], row["nama_bu"], bulan, row["peserta"], row["nominal"])

    conn.execute(
        "INSERT INTO import_log (action, source, jenis, bulan, rows_written, rows_deleted) VALUES (?, ?, ?, ?, ?, ?)",
        ("workspace", "Workspace admin", jenis, bulan, len(cleaned), deleted),
    )
    return {"ok": True, "written": len(cleaned), "deleted": deleted}


def import_log(conn: sqlite3.Connection, jenis: str, limit: int = 100) -> list[dict[str, Any]]:
    """Riwayat satu jenis, termasuk upload rekap yang mengubah tagihan dan pembayaran sekaligus."""
    rekap = "rekap" if jenis in JENIS_TABLE else jenis
    sql = "SELECT * FROM import_log WHERE jenis IN (?, ?) ORDER BY id DESC LIMIT ?"
    return [dict(row) for row in conn.execute(sql, (jenis, rekap, limit))]
