from typing import Any

from ..config import MONTHS


def parse_amount(value: Any) -> int:
    """Terima angka Excel maupun teks seperti 'Rp 1.234.567' atau '1,234,567'."""
    if value is None or value == "":
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(round(value))
    text = str(value).strip().replace("Rp", "").replace(" ", "")
    if "." in text and "," not in text:
        text = text.replace(".", "")
    elif "," in text and "." not in text:
        text = text.replace(",", "")
    elif "." in text and "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return int(round(float(text)))
    except ValueError:
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
