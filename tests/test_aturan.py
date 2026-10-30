"""Aturan berisiko: token per peran, kunci login, parsing nominal, status bayar. Jalankan: .venv/bin/python -m tests.test_aturan"""
import sqlite3
from types import SimpleNamespace

from fastapi import HTTPException

from backend.auth import check_login, issue_token, require_admin, require_karyawan
from backend.db import SCHEMA
from backend.services.karyawan import _insert, employee_page
from backend.services.normalize import parse_amount


def status(call) -> int | None:
    try:
        call()
    except HTTPException as exc:
        return exc.status_code
    return None


# Token hanya berlaku untuk perannya dan sampai kedaluwarsa.
assert status(lambda: require_admin(f"Bearer {issue_token()}")) is None
assert status(lambda: require_admin(f"Bearer {issue_token('karyawan')}")) == 401
assert status(lambda: require_karyawan(f"Bearer {issue_token()}")) == 401
assert status(lambda: require_admin(f"Bearer {issue_token(ttl=-1)}")) == 401

# 5x salah dari satu IP: kata sandi benar pun ditolak; scope lain tidak ikut terkunci.
request = SimpleNamespace(client=SimpleNamespace(host="10.0.0.1"))
for _ in range(5):
    assert status(lambda: check_login(request, "test", "salah", "benar")) == 401
assert status(lambda: check_login(request, "test", "benar", "benar")) == 429
assert status(lambda: check_login(request, "test-lain", "benar", "benar")) is None

# Pemisah yang muncul terakhir adalah desimal.
assert parse_amount("Rp 1.234.567") == parse_amount("1,234,567") == 1234567
# Setengah dibulatkan ke atas, sama dengan Math.round di web admin.
assert parse_amount("1.234,50") == parse_amount("1,234.50") == parse_amount(1234.5) == 1235
assert parse_amount(2.5) == 3 and parse_amount("NaN") == parse_amount("abc") == 0

# Status bayar: lunas jika bayar >= sisa tagihan, nyicil jika kurang, belum jika tidak ada pembayaran.
conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.executescript(SCHEMA)
person = ("Januari", "Januari", "00000001", "PT A", "1", "A", None, "A", "PST", 1, 100)
_insert(conn, [
    (*person[:6], "1", *person[7:], "2026-01-05", 100),
    (*person[:6], "2", *person[7:], None, 50),        # bayar tanpa tanggal tetap dihitung
    (*person[:6], "3", *person[7:], None, 0),         # sel kosong di grid admin = 0 = belum bayar
])
rows = employee_page(conn, "Januari", "", "", "", 1, 10)["rows"]
assert {r["noka_keluarga"]: r["status_bayar"] for r in rows} == {"1": "lunas", "2": "nyicil", "3": "belum"}, rows

# Pembayaran terakhir = bulan tagih terbaru, walau tanpa tanggal (bukan pembayaran Januari yang bertanggal).
_insert(conn, [("Februari", "Februari", *person[2:6], "1", *person[7:], None, 70)])
row = employee_page(conn, "Februari", "", "", "", 1, 10)["rows"][0]
assert (row["tanggal_bayar"], row["jumlah_bayar"]) == (None, 70), row
print("ok")
