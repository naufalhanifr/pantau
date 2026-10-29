import sqlite3
from typing import Any, Iterable

from ..config import MONTHS
from .normalize import normalize_kode, normalize_name, parse_amount

JENIS_TABLE = {"tagihan": "tagihan", "pembayaran": "pembayaran"}

MONTH_ROWS_SQL = """
WITH keys AS (
    SELECT kode_bu, bulan FROM tagihan WHERE bulan = :bulan
    UNION
    SELECT kode_bu, bulan FROM pembayaran WHERE bulan = :bulan
)
SELECT k.kode_bu,
       COALESCE(p.nama_bu, '') AS nama_bu,
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
        "SELECT t.kode_bu, COALESCE(p.nama_bu, '') AS nama_bu, t.peserta, t.nominal "
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
        summary.append({
            "bulan": bulan,
            "tagihan_rows": tagihan["n"],
            "tagihan_total": tagihan["total"],
            "bayar_rows": bayar["n"],
            "bayar_total": bayar["total"],
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


def _upsert_amount(conn: sqlite3.Connection, table: str, kode: str, bulan: str, peserta: int, nominal: int) -> None:
    conn.execute(
        f"INSERT INTO {table} (kode_bu, bulan, periode, peserta, nominal) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(kode_bu, bulan) DO UPDATE SET peserta = excluded.peserta, nominal = excluded.nominal",
        (kode, bulan, bulan, peserta, nominal),
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
        cleaned.append({
            "kode_bu": kode,
            "nama_bu": normalize_name(row.get("nama_bu")),
            "peserta_tagihan": parse_amount(row.get("peserta_tagihan")),
            "tagihan": parse_amount(row.get("tagihan")),
            "peserta_bayar": parse_amount(row.get("peserta_bayar")),
            "bayar": parse_amount(row.get("bayar")),
            "peserta": parse_amount(row.get("peserta")),
            "nominal": parse_amount(row.get("nominal")),
        })
    return cleaned, errors


def import_rows(
    conn: sqlite3.Connection, jenis: str, bulan: str, rows: list[dict[str, Any]], replace: bool, source: str
) -> dict[str, Any]:
    """Simpan hasil upload. jenis: tagihan | pembayaran | rekap (tagihan + pembayaran sekaligus)."""
    cleaned, errors = _clean_rows(rows)
    if errors:
        return {"ok": False, "errors": errors[:50]}

    tables = ["tagihan", "pembayaran"] if jenis == "rekap" else [JENIS_TABLE[jenis]]
    deleted = 0
    if replace:
        for table in tables:
            deleted += conn.execute(f"DELETE FROM {table} WHERE bulan = ?", (bulan,)).rowcount

    for row in cleaned:
        _upsert_company(conn, row["kode_bu"], row["nama_bu"])
        if "tagihan" in tables:
            _upsert_amount(conn, "tagihan", row["kode_bu"], bulan, row["peserta_tagihan"], row["tagihan"])
        if "pembayaran" in tables:
            _upsert_amount(conn, "pembayaran", row["kode_bu"], bulan, row["peserta_bayar"], row["bayar"])

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
        _upsert_amount(conn, table, row["kode_bu"], bulan, row["peserta"], row["nominal"])

    conn.execute(
        "INSERT INTO import_log (action, source, jenis, bulan, rows_written, rows_deleted) VALUES (?, ?, ?, ?, ?, ?)",
        ("workspace", "Workspace admin", jenis, bulan, len(cleaned), deleted),
    )
    return {"ok": True, "written": len(cleaned), "deleted": deleted}


def import_log(conn: sqlite3.Connection, jenis: str, limit: int = 100) -> list[dict[str, Any]]:
    """Riwayat satu jenis, termasuk upload rekap yang mengubah tagihan dan pembayaran sekaligus."""
    sql = "SELECT * FROM import_log WHERE jenis IN (?, 'rekap') ORDER BY id DESC LIMIT ?"
    return [dict(row) for row in conn.execute(sql, (jenis, limit))]
