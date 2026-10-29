from datetime import date, datetime
from io import BytesIO
from typing import Any

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill

from .normalize import normalize_month

# Kolom yang dikenali otomatis dari header Excel (huruf kecil, cocok jika semua kata ada).
FIELD_PATTERNS = {
    "kode_bu": [("kode",)],
    "nama_bu": [("nama",)],
    "periode": [("periode",), ("bulan",)],
    "peserta": [("peserta",)],
    "nominal": [("nominal",)],
    "tagihan": [("tagihan",)],
    "bayar": [("bayar",), ("pembayaran",)],
}


TEMPLATE_HEADERS = ["NO", "KODE BU", "NAMA BU", "Periode", "Peserta", "Nominal"]
TEMPLATE_WIDTHS = [6, 14, 44, 14, 12, 18]
TEMPLATE_ROWS = 2000  # baris yang diberi format teks/angka


def build_template(months: list[str]) -> bytes:
    """Template upload: satu sheet per bulan, header sesuai FIELD_PATTERNS, KODE BU berformat teks."""
    workbook = Workbook()
    workbook.remove(workbook.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="059669")
    for month in months:
        sheet = workbook.create_sheet(month)
        sheet.append(TEMPLATE_HEADERS)
        for column, width in enumerate(TEMPLATE_WIDTHS, start=1):
            cell = sheet.cell(row=1, column=column)
            cell.font, cell.fill = header_font, header_fill
            sheet.column_dimensions[cell.column_letter].width = width
        for row in range(2, TEMPLATE_ROWS + 2):
            sheet.cell(row=row, column=2).number_format = "@"        # nol di depan KODE BU tidak hilang
            sheet.cell(row=row, column=6).number_format = "#,##0"
        sheet.freeze_panes = "A2"
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _json_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def detect_columns(headers: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    lowered = [h.lower() for h in headers]
    for field, patterns in FIELD_PATTERNS.items():
        for index, header in enumerate(lowered):
            if index in mapping.values():
                continue
            if any(all(word in header for word in words) for words in patterns):
                mapping[field] = index
                break
    return mapping


def detect_jenis(filename: str, mapping: dict[str, int]) -> str | None:
    if "tagihan" in mapping and "bayar" in mapping:
        return "rekap"
    name = filename.lower()
    if "tagihan" in name:
        return "tagihan"
    if "bayar" in name:
        return "pembayaran"
    return None


def parse_workbook(content: bytes, filename: str) -> list[dict[str, Any]]:
    workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    sheets = []
    try:
        for worksheet in workbook.worksheets:
            iterator = worksheet.iter_rows(values_only=True)
            raw_headers = next(iterator, None)
            if not raw_headers:
                continue
            headers = [
                str(value).strip() if value is not None else f"Kolom {index + 1}"
                for index, value in enumerate(raw_headers)
            ]
            rows = []
            for values in iterator:
                if not values or not any(v is not None and str(v).strip() for v in values):
                    continue
                padded = list(values) + [None] * (len(headers) - len(values))
                rows.append([_json_value(v) for v in padded[: len(headers)]])

            mapping = detect_columns(headers)
            bulan = normalize_month(worksheet.title)
            if not bulan and "periode" in mapping and rows:
                bulan = normalize_month(rows[0][mapping["periode"]])
            if not bulan:
                bulan = next((normalize_month(h) for h in headers if normalize_month(h)), None)

            sheets.append({
                "name": worksheet.title,
                "headers": headers,
                "rows": rows,
                "mapping": mapping,
                "jenis": detect_jenis(filename, mapping),
                "bulan": bulan,
            })
    finally:
        workbook.close()
    return sheets
