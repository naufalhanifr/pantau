"""PPU PN: baca sheet Gabungan, ringkasan Satker, filter peserta. Jalankan: .venv/bin/python -m tests.test_ppu_pn"""
import sqlite3
from io import BytesIO

from openpyxl import Workbook

from backend.db import SCHEMA
from backend.services.ppu_pn import import_rows, peserta_page, read_workbook, satker_summary

workbook = Workbook()
workbook.active.title = "SKPD"   # sheet lain diabaikan
sheet = workbook.create_sheet("Gabungan")
sheet.append(["SKPD", "Satker", "nokapst", "nmpst", "pisapst", "nomor_hp"])
sheet.append(["DINAS A", "SATKER A1", 1, "BUDI", "P", 812])
sheet.append(["DINAS A", "SATKER A1", 2, "SITI", "I", None])
sheet.append(["DINAS A", " SATKER  A2 ", 3, "ANDI", "A", None])   # spasi berlebih dirapikan
sheet.append(["DINAS B", "SATKER B1", 4, "RINA", "X", None])      # kode tak dikenal: apa adanya
sheet.append([None, None, None, None, None, None])               # baris kosong di bawah data
buffer = BytesIO()
workbook.save(buffer)
buffer.seek(0)

rows = read_workbook(buffer)
assert rows == [
    ("DINAS A", "SATKER A1", "BUDI", "Peserta"), ("DINAS A", "SATKER A1", "SITI", "Istri"),
    ("DINAS A", "SATKER A2", "ANDI", "Anak"), ("DINAS B", "SATKER B1", "RINA", "X"),
], rows

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.executescript(SCHEMA)
assert import_rows(conn, rows, "test") == {"written": 4, "deleted": 0}
assert import_rows(conn, rows, "test") == {"written": 4, "deleted": 4}   # import ulang mengganti, tidak menumpuk

assert satker_summary(conn) == [
    {"skpd": "DINAS A", "satker": "SATKER A1", "peserta": 2}, {"skpd": "DINAS A", "satker": "SATKER A2", "peserta": 1},
    {"skpd": "DINAS B", "satker": "SATKER B1", "peserta": 1},
]
names = lambda **filters: [r["nama_peserta"] for r in peserta_page(conn, **{"skpd": "", "satker": "", "q": "", "page": 1, "size": 10, **filters})["rows"]]
assert names() == ["BUDI", "SITI", "ANDI", "RINA"]
assert names(skpd="DINAS A") == ["BUDI", "SITI", "ANDI"]
assert names(skpd="DINAS A", satker="SATKER A2") == ["ANDI"]
assert names(skpd="DINAS B", satker="SATKER A1") == []
assert names(q="ri") == ["RINA"]
# Halaman di luar jangkauan dikembalikan ke halaman terakhir.
assert peserta_page(conn, "", "", "", 9, 3) == {"total": 4, "page": 2, "rows": [dict(skpd="DINAS B", satker="SATKER B1", nama_peserta="RINA", status="X")]}
print("ok")
