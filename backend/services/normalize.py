from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from ..config import MONTHS


class ExcelError(ValueError):
    """Isi file Excel salah; pesannya ditampilkan apa adanya ke admin."""


# Di atas ini pasti salah ketik, dan melewati batas INTEGER SQLite (2^63).
MAX_AMOUNT = 10 ** 15


def parse_number(value: Any) -> int | None:
    """Terima angka Excel maupun teks seperti 'Rp 1.234.567', '1,234,567', '1.234,50' atau '1,234.50'.
    Sel kosong = 0; None berarti bukan angka, supaya pemanggil bisa menolaknya alih-alih menyimpan 0."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        number = value
    else:
        text = str(value).strip().replace("Rp", "").replace(" ", "")
        if "." in text and "," in text:
            # Pemisah yang muncul terakhir adalah desimal; yang lain pemisah ribuan.
            decimal = "," if text.rfind(",") > text.rfind(".") else "."
            text = text.replace("." if decimal == "," else ",", "").replace(decimal, ".")
        else:
            text = text.replace(".", "").replace(",", "")
        number = text
    try:
        # Setengah dibulatkan ke atas, sama dengan Math.round di web admin (round() Python membulatkan ke genap).
        return int(Decimal(number).quantize(Decimal(1), ROUND_HALF_UP))
    except (InvalidOperation, ValueError, OverflowError):   # teks bukan angka, NaN, Infinity
        return None


def parse_amount(value: Any) -> int:
    return parse_number(value) or 0


def amount_error(value: Any, label: str) -> str | None:
    """Pesan penolakan untuk nominal/jumlah di file atau grid; None bila valid."""
    number = parse_number(value)
    if number is None:
        return f"{label} bukan angka ({str(value)[:40]})."
    if number < 0:
        return f"{label} tidak boleh negatif ({number})."
    if number > MAX_AMOUNT:
        return f"{label} terlalu besar ({number})."
    return None


def like_pattern(text: str) -> str:
    """Pola LIKE untuk pencarian teks biasa: % dan _ dari pengguna dicari sebagai huruf. Pakai dengan ESCAPE '\\'."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def normalize_kode(value: Any) -> str:
    """KODE BU adalah teks 8 digit; angka dari Excel kehilangan nol di depan."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    if text.isdigit() and len(text) < 8:
        text = text.zfill(8)
    return text


def normalize_name(value: Any) -> str:
    return " ".join(str(value or "").split())


def normalize_month(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    for name in MONTHS:
        if name.lower() in text:
            return name
    return None
