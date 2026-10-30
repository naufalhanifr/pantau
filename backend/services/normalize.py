from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from ..config import MONTHS


def parse_amount(value: Any) -> int:
    """Terima angka Excel maupun teks seperti 'Rp 1.234.567', '1,234,567', '1.234,50' atau '1,234.50'."""
    if value is None or value == "":
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
    except (InvalidOperation, ValueError):   # teks bukan angka, NaN, Infinity
        return 0


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
