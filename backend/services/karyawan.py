"""Data Daftar Karyawan per bulan tagih: import dari Excel dan query untuk web monitoring.

Import: python -m backend.services.karyawan Data/Karyawan.xlsx
Sumber: satu sheet per bulan (nama sheet = bulan). Header 2 baris: Kode BU .. Bulan Tagih, lalu kolom bulan
berisi sub-judul Tanggal Bayar | Jumlah Bayar. Data peserta masuk tabel karyawan, pembayaran ke karyawan_pembayaran.
"""
import sqlite3
import sys
from datetime import date, datetime
from io import BytesIO
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill

from ..config import MONTHS
from .normalize import normalize_kode, normalize_month, normalize_name, parse_amount

COLUMNS = {
    "kode_bu": "kode bu",
    "nama_bu": "nama bu",
    "noka_peserta": "noka peserta",
    "nama_peserta": "nama peserta",
    "noka_keluarga": "noka peserta/keluarga",
    "nama_keluarga": "nama peserta/keluarga",
    "status": "pisapst",
    "bulan_menunggak": "bulan menunggak",
    "nominal_tagihan": "sisa tagihan aktif",
    "bulan_tagih": "bulan tagih",
}
# Bentuk satu baris hasil baca Excel / input admin: data karyawan + pembayaran bulan itu.
ROW_FIELDS = (
    "bulan", "periode", "kode_bu", "nama_bu", "noka_peserta", "nama_peserta", "noka_keluarga",
    "nama_keluarga", "status", "bulan_menunggak", "nominal_tagihan", "tanggal_bayar", "jumlah_bayar",
)
# Kolom yang ditinjau/diedit di web admin (urutan grid), tanpa "bulan" karena itu kunci per halaman.
ADMIN_LABELS = {
    "periode": "Bulan Tagih", "kode_bu": "Kode BU", "nama_bu": "Nama BU", "noka_peserta": "Noka Peserta",
    "nama_peserta": "Nama Peserta", "noka_keluarga": "Noka Peserta/Keluarga", "nama_keluarga": "Nama Peserta/Keluarga",
    "status": "Pisapst", "bulan_menunggak": "Bulan Menunggak", "nominal_tagihan": "Sisa Tagihan Aktif",
    "tanggal_bayar": "Tanggal Bayar (dd/mm/yyyy)", "jumlah_bayar": "Jumlah Bayar (0 = belum bayar)",
}
KARYAWAN_FIELDS = ROW_FIELDS[:11]
SEARCH_COLUMNS = ("nama_bu", "kode_bu", "nama_peserta", "nama_keluarga", "noka_peserta", "noka_keluarga")


def _noka(value: Any) -> str:
    """No. JKN 13 digit; angka dari Excel kehilangan nol di depan."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value or "").strip()
    return text.zfill(13) if text.isdigit() else text


# Tanggal Bayar: database & monitoring memakai ISO (2026-01-30); web admin & template memakai dd/mm/yyyy.
DATE_FORMAT = "%d/%m/%Y"


def _iso(value: Any) -> str | None:
    """Tanggal dari Excel (date atau teks dd/mm/yyyy / ISO) ke ISO; teks lain diteruskan apa adanya."""
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    for parse in (lambda t: datetime.strptime(t, DATE_FORMAT).date(), date.fromisoformat):
        try:
            return parse(text).isoformat()
        except ValueError:
            pass
    return text or None


def _display(value: str | None) -> str | None:
    """ISO ke dd/mm/yyyy untuk web admin; nilai yang bukan ISO ditampilkan apa adanya agar bisa diperbaiki."""
    try:
        return date.fromisoformat(value).strftime(DATE_FORMAT) if value else value
    except ValueError:
        return value


def _periode(value: Any) -> tuple[str, str] | None:
    if isinstance(value, (date, datetime)):
        name = MONTHS[value.month - 1]
        return name, f"{name} {value.year}"
    name = normalize_month(value)
    return (name, name) if name else None


def read_workbook(path: Any) -> list[tuple]:
    """path: lokasi file atau file-like (BytesIO dari upload admin). Sheet tanpa header karyawan dilewati."""
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        parsed = []
        for sheet in workbook.worksheets:
            rows = sheet.iter_rows(values_only=True)
            header = [str(cell or "").strip().lower() for cell in next(rows, ())]
            sub_header = [str(cell or "").strip().lower() for cell in next(rows, ())]
            try:
                index = {field: header.index(name) for field, name in COLUMNS.items()}
                tanggal_col, jumlah_col = sub_header.index("tanggal bayar"), sub_header.index("jumlah bayar")
            except ValueError:
                continue
            sheet_month = normalize_month(sheet.title)
            for row in rows:
                noka_keluarga = _noka(row[index["noka_keluarga"]])
                periode = _periode(row[index["bulan_tagih"]]) or ((sheet_month, sheet_month) if sheet_month else None)
                if not noka_keluarga or not periode:
                    continue
                tanggal, jumlah = row[tanggal_col], row[jumlah_col]
                parsed.append((
                    *periode,
                    normalize_kode(row[index["kode_bu"]]), normalize_name(row[index["nama_bu"]]),
                    _noka(row[index["noka_peserta"]]), normalize_name(row[index["nama_peserta"]]),
                    noka_keluarga, normalize_name(row[index["nama_keluarga"]]),
                    normalize_name(row[index["status"]]),
                    parse_amount(row[index["bulan_menunggak"]]), parse_amount(row[index["nominal_tagihan"]]),
                    _iso(tanggal.date() if isinstance(tanggal, datetime) else tanggal),
                    parse_amount(jumlah) if jumlah is not None else None,
                ))
        return parsed
    finally:
        workbook.close()


def _insert(conn: sqlite3.Connection, rows: list[tuple]) -> None:
    """Baris (ROW_FIELDS) ditulis ulang utuh: data karyawan, lalu pembayaran bulan itu.
    Pembayaran ada jika ada Tanggal Bayar atau Jumlah Bayar > 0 (grid admin mengubah sel kosong jadi 0)."""
    conn.executemany(
        f"INSERT OR REPLACE INTO karyawan ({', '.join(KARYAWAN_FIELDS)}) VALUES ({', '.join('?' * len(KARYAWAN_FIELDS))})",
        [row[:11] for row in rows],
    )
    conn.executemany("DELETE FROM karyawan_pembayaran WHERE bulan = ? AND noka_keluarga = ?", [(row[0], row[6]) for row in rows])
    conn.executemany(
        "INSERT INTO karyawan_pembayaran (bulan, noka_keluarga, tanggal_bayar, jumlah_bayar) VALUES (?, ?, ?, ?)",
        [(row[0], row[6], row[11], row[12] or 0) for row in rows if row[11] or row[12]],
    )


def _delete_month(conn: sqlite3.Connection, bulan: str) -> int:
    conn.execute("DELETE FROM karyawan_pembayaran WHERE bulan = ?", (bulan,))
    return conn.execute("DELETE FROM karyawan WHERE bulan = ?", (bulan,)).rowcount


def _log(conn: sqlite3.Connection, action: str, source: str, bulan: str, written: int, deleted: int) -> None:
    conn.execute(
        "INSERT INTO import_log (action, source, jenis, bulan, rows_written, rows_deleted) VALUES (?, ?, ?, ?, ?, ?)",
        (action, source, "karyawan", bulan, written, deleted),
    )


def import_rows(conn: sqlite3.Connection, rows: list[tuple], source: str) -> dict[str, Any]:
    """Ganti seluruh data bulan yang ada di file; bulan lain tidak disentuh."""
    months = sorted({row[0] for row in rows}, key=MONTHS.index)
    deleted = sum(_delete_month(conn, bulan) for bulan in months)
    _insert(conn, rows)
    _log(conn, "upload", source, ", ".join(months), len(rows), deleted)
    return {"months": months, "written": len(rows), "deleted": deleted}


# ---------- Web admin: upload per bulan, workspace, template ----------

def admin_sheets(rows: list[tuple], bulan: str = "") -> list[dict[str, Any]]:
    """Hasil read_workbook dalam bentuk parse_workbook (satu sheet per bulan tagih) untuk ditinjau di admin."""
    by_month: dict[str, list[list]] = {}
    for row in rows:
        if not bulan or row[0] == bulan:
            by_month.setdefault(row[0], []).append([*row[1:11], _display(row[11]), row[12]])
    return [{
        "name": month,
        "headers": list(ADMIN_LABELS.values()),
        "rows": by_month[month],
        "mapping": {field: index for index, field in enumerate(ADMIN_LABELS)},
        "jenis": "karyawan",
        "bulan": month,
    } for month in MONTHS if month in by_month]


def _clean(bulan: str, items: list[dict[str, Any]]) -> tuple[list[tuple], list[str]]:
    cleaned, errors, seen = [], [], set()
    for position, item in enumerate(items, start=1):
        noka = _noka(item.get("noka_keluarga"))
        if not noka:
            errors.append(f"Baris {position}: Noka Peserta/Keluarga kosong.")
            continue
        if noka in seen:
            errors.append(f"Baris {position}: Noka Peserta/Keluarga {noka} duplikat.")
            continue
        seen.add(noka)
        tanggal = str(item.get("tanggal_bayar") or "").strip() or None
        if tanggal:
            try:
                tanggal = datetime.strptime(tanggal, DATE_FORMAT).date().isoformat()
            except ValueError:
                errors.append(f"Baris {position}: Tanggal Bayar harus berformat dd/mm/yyyy, misalnya 30/01/2026.")
                continue
        periode = normalize_name(item.get("periode"))
        cleaned.append((
            bulan, periode if normalize_month(periode) == bulan else bulan,
            normalize_kode(item.get("kode_bu")), normalize_name(item.get("nama_bu")),
            _noka(item.get("noka_peserta")), normalize_name(item.get("nama_peserta")),
            noka, normalize_name(item.get("nama_keluarga")), normalize_name(item.get("status")),
            parse_amount(item.get("bulan_menunggak")), parse_amount(item.get("nominal_tagihan")),
            tanggal, parse_amount(item.get("jumlah_bayar")),
        ))
    return cleaned, errors


def import_month(conn: sqlite3.Connection, bulan: str, items: list[dict[str, Any]], replace: bool, source: str) -> dict[str, Any]:
    cleaned, errors = _clean(bulan, items)
    if errors:
        return {"ok": False, "errors": errors[:50]}
    deleted = _delete_month(conn, bulan) if replace else 0
    _insert(conn, cleaned)
    _log(conn, "upload", source, bulan, len(cleaned), deleted)
    return {"ok": True, "written": len(cleaned), "deleted": deleted}


def month_rows(conn: sqlite3.Connection, bulan: str) -> list[dict[str, Any]]:
    """Baris workspace admin: data karyawan + pembayaran bulan itu saja."""
    sql = (
        f"SELECT {', '.join('k.' + field for field in KARYAWAN_FIELDS[1:])}, p.tanggal_bayar, p.jumlah_bayar "
        "FROM karyawan k LEFT JOIN karyawan_pembayaran p ON p.bulan = k.bulan AND p.noka_keluarga = k.noka_keluarga "
        "WHERE k.bulan = ? ORDER BY k.rowid"
    )
    return [{**row, "tanggal_bayar": _display(row["tanggal_bayar"])} for row in map(dict, conn.execute(sql, (bulan,)))]


def save_workspace(conn: sqlite3.Connection, bulan: str, upserts: list[dict[str, Any]], deletes: list[str]) -> dict[str, Any]:
    cleaned, errors = _clean(bulan, upserts)
    if errors:
        return {"ok": False, "errors": errors[:50]}
    nokas = {_noka(k) for k in deletes if k}
    conn.executemany("DELETE FROM karyawan_pembayaran WHERE bulan = ? AND noka_keluarga = ?", [(bulan, noka) for noka in nokas])
    deleted = sum(
        conn.execute("DELETE FROM karyawan WHERE bulan = ? AND noka_keluarga = ?", (bulan, noka)).rowcount for noka in nokas
    )
    _insert(conn, cleaned)
    _log(conn, "workspace", "Workspace admin", bulan, len(cleaned), deleted)
    return {"ok": True, "written": len(cleaned), "deleted": deleted}


def build_template() -> bytes:
    """Template kosong format read_workbook: satu sheet per bulan, header 2 baris dengan Tanggal/Jumlah Bayar bulan itu."""
    workbook = Workbook()
    workbook.remove(workbook.active)
    base = ["Kode BU", "Nama BU", "Noka Peserta", "Nama Peserta", "Noka Peserta/Keluarga", "Nama Peserta/Keluarga",
            "Pisapst", "Bulan Menunggak", "Sisa Tagihan Aktif", "Bulan Tagih"]
    for month in MONTHS:
        sheet = workbook.create_sheet(month)
        sheet.append(base + [month, None])
        sheet.append([None] * len(base) + ["Tanggal Bayar", "Jumlah Bayar"])
        for row in sheet.iter_rows(min_row=1, max_row=2):
            for cell in row:
                cell.font, cell.fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="059669")
        for column, width in zip("ABCDEFGHIJKL", (12, 36, 16, 30, 22, 30, 12, 16, 18, 14, 16, 16)):
            sheet.column_dimensions[column].width = width
        for row in range(3, 2003):
            for column in (1, 3, 5):  # Kode BU & Noka: teks agar nol di depan tidak hilang
                sheet.cell(row=row, column=column).number_format = "@"
            sheet.cell(row=row, column=len(base) + 1).number_format = "DD/MM/YYYY"
        sheet.freeze_panes = "A3"
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def available_months(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    found = {row["bulan"]: dict(row) for row in conn.execute(
        "SELECT bulan, MIN(periode) AS periode, COUNT(*) AS total FROM karyawan GROUP BY bulan"
    )}
    return [found[bulan] for bulan in MONTHS if bulan in found]


def business_names(conn: sqlite3.Connection, bulan: str) -> list[str]:
    sql = "SELECT DISTINCT nama_bu FROM karyawan WHERE bulan = ? AND nama_bu != '' ORDER BY nama_bu COLLATE NOCASE"
    return [row[0] for row in conn.execute(sql, (bulan,))]


# Kolom yang bisa diurutkan di Daftar Karyawan: kunci API -> (kolom SQL, teks?). l = pembayaran terakhir.
SORT_COLUMNS = {
    "nama_bu": ("k.nama_bu", True), "nama_peserta": ("k.nama_peserta", True),
    "nama_keluarga": ("k.nama_keluarga", True), "status": ("k.status", True),
    "bulan_menunggak": ("k.bulan_menunggak", False), "nominal_tagihan": ("k.nominal_tagihan", False),
    "jumlah_bayar": ("l.jumlah_bayar", False), "tanggal_bayar": ("l.tanggal_bayar", False),
    "status_bayar": ("status_bayar_urutan", False),
}
# Status bayar dari pembayaran pada bulan tagih itu (b): lunas jika bayar >= sisa tagihan, nyicil jika kurang.
# Sisa Tagihan Aktif di Excel adalah sisa sebelum pembayaran bulan itu. Nilainya urutan sort: lunas, nyicil, belum.
STATUS_BAYAR = ("lunas", "nyicil", "belum")
STATUS_BAYAR_SQL = "CASE WHEN b.noka_keluarga IS NULL THEN 2 WHEN b.jumlah_bayar >= k.nominal_tagihan THEN 0 ELSE 1 END"
JOIN_BAYAR_BULAN = "LEFT JOIN karyawan_pembayaran b ON b.bulan = k.bulan AND b.noka_keluarga = k.noka_keluarga"


def employee_page(
    conn: sqlite3.Connection, bulan: str, q: str, status: str, bu: str, page: int, size: int,
    bayar: str = "", sort: str = "", desc: bool = False,
) -> dict[str, Any]:
    """bayar: salah satu STATUS_BAYAR. sort: kunci SORT_COLUMNS."""
    where, params = ["k.bulan = ?"], [bulan]
    if q:
        where.append("(" + " OR ".join(f"k.{column} LIKE ?" for column in SEARCH_COLUMNS) + ")")
        params += [f"%{q}%"] * len(SEARCH_COLUMNS)
    if status:
        where.append("k.status = ? COLLATE NOCASE")
        params.append(status)
    if bu:
        where.append("k.nama_bu = ? COLLATE NOCASE")
        params.append(bu)
    if bayar:
        where.append(f"{STATUS_BAYAR_SQL} = {STATUS_BAYAR.index(bayar)}")
    clause = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM karyawan k {JOIN_BAYAR_BULAN} WHERE {clause}", params).fetchone()[0]
    page = min(max(1, page), max(1, -(-total // size)))
    order = "k.rowid"
    if sort:
        column, text = SORT_COLUMNS[sort]
        # Baris tanpa pembayaran selalu di bawah, baik urut naik maupun turun.
        order = f"{column} IS NULL, {column}{' COLLATE NOCASE' if text else ''} {'DESC' if desc else 'ASC'}, k.rowid"
    # Pembayaran terakhir: bulan tagih terbaru (s.d. bulan terpilih), lalu tanggal; pembayaran tanpa tanggal ikut dihitung.
    months = MONTHS[:MONTHS.index(bulan) + 1]
    month_order = " ".join(f"WHEN '{month}' THEN {index}" for index, month in enumerate(MONTHS))  # konstanta, bukan input
    rows = conn.execute(
        "WITH l AS (SELECT noka_keluarga, tanggal_bayar, jumlah_bayar, "
        f"ROW_NUMBER() OVER (PARTITION BY noka_keluarga ORDER BY CASE bulan {month_order} END DESC, tanggal_bayar DESC) AS urutan "
        f"FROM karyawan_pembayaran WHERE bulan IN ({', '.join('?' * len(months))})) "
        f"SELECT {', '.join('k.' + field for field in KARYAWAN_FIELDS)}, l.tanggal_bayar, l.jumlah_bayar, "
        f"{STATUS_BAYAR_SQL} AS status_bayar_urutan "
        f"FROM karyawan k LEFT JOIN l ON l.noka_keluarga = k.noka_keluarga AND l.urutan = 1 {JOIN_BAYAR_BULAN} "
        f"WHERE {clause} ORDER BY {order} LIMIT ? OFFSET ?",
        [*months, *params, size, (page - 1) * size],
    )
    return {"total": total, "page": page, "rows": [
        {**row, "status_bayar": STATUS_BAYAR[row.pop("status_bayar_urutan")]} for row in map(dict, rows)
    ]}


def payment_history(conn: sqlite3.Connection, noka_keluarga: str, bulan: str) -> list[dict[str, Any]]:
    """Riwayat satu peserta/keluarga dari Januari s.d. bulan tagih terpilih: tagihan dan pembayaran tiap bulan."""
    months = MONTHS[:MONTHS.index(bulan) + 1]
    rows = conn.execute(
        "SELECT k.bulan, k.bulan_menunggak, k.nominal_tagihan, p.tanggal_bayar, p.jumlah_bayar FROM karyawan k "
        "LEFT JOIN karyawan_pembayaran p ON p.bulan = k.bulan AND p.noka_keluarga = k.noka_keluarga "
        f"WHERE k.noka_keluarga = ? AND k.bulan IN ({', '.join('?' * len(months))})",
        [noka_keluarga, *months],
    )
    return sorted((dict(row) for row in rows), key=lambda row: MONTHS.index(row["bulan"]))


if __name__ == "__main__":
    from ..db import init_db, transaction

    if len(sys.argv) != 2:
        sys.exit("Pakai: python -m backend.services.karyawan Data/Karyawan.xlsx")
    init_db()
    parsed = read_workbook(sys.argv[1])
    with transaction() as conn:
        result = import_rows(conn, parsed, sys.argv[1])
    print(f"{result['written']} baris karyawan disimpan ({', '.join(result['months'])}); {result['deleted']} baris lama diganti.")
