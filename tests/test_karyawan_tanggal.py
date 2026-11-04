"""Tanggal Bayar: ISO di database, dd/mm/yyyy di web admin. Jalankan: .venv/bin/python -m tests.test_karyawan_tanggal"""
from datetime import date

from backend.services.karyawan import _clean, _display, _iso

assert _iso(date(2026, 1, 30)) == "2026-01-30"
assert _iso("30/01/2026") == _iso("2026-01-30") == "2026-01-30"
assert _iso("") is None and _iso("kemarin") == "kemarin"
assert _display("2026-01-30") == "30/01/2026" and _display(None) is None

rows, errors = _clean("Januari", [{"kode_bu": "00000001", "noka_keluarga": "1", "tanggal_bayar": "30/01/2026", "jumlah_bayar": 35000}])
assert not errors and rows[0][11:] == ("2026-01-30", 35000)
for wrong in ("2026-01-30", "31/02/2026"):
    assert _clean("Januari", [{"kode_bu": "00000001", "noka_keluarga": "1", "tanggal_bayar": wrong}])[1], wrong
print("ok")
