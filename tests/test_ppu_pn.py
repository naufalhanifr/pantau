"""PPU PN: baca sheet Gabungan, ringkasan Satker, filter peserta. Jalankan: .venv/bin/python -m tests.test_ppu_pn"""
import sqlite3
from io import BytesIO

from openpyxl import Workbook

from backend.db import SCHEMA, _migrate_ppu_pn
from backend.services.ppu_pn import available_months, detail, import_rows, month_from_filename, peserta_page, read_workbook, satker_summary

workbook = Workbook()
workbook.active.title = "SKPD"   # sheet lain diabaikan
sheet = workbook.create_sheet("Gabungan")
sheet.append(["SKPD", "Satker", "nokapst", "nmpst", "pisapst", "nomor_hp", "ketjnspeserta", "bulan_menunggak", "saldo"])
sheet.append(["DINAS A", "SATKER A1", 1, "BUDI", "P", 812, "PPPK", 12, 1000])
sheet.append(["DINAS A", "SATKER A1", 2, "SITI", "I", None, "PPPK", 5, 500])
sheet.append(["DINAS A", " SATKER  A2 ", 3, "ANDI", "A", None, "PNS DAERAH", 2, 200])   # spasi berlebih dirapikan
sheet.append(["DINAS B", "SATKER B1", 4, "RINA", "X", None, "PPPK", 0, None])           # kode tak dikenal: apa adanya
sheet.append([None] * 9)                                                                 # baris kosong di bawah data
buffer = BytesIO()
workbook.save(buffer)
buffer.seek(0)

rows = read_workbook(buffer)
assert rows == [
    ("DINAS A", "SATKER A1", "BUDI", "Peserta", "PPPK", 12, 1000), ("DINAS A", "SATKER A1", "SITI", "Istri", "PPPK", 5, 500),
    ("DINAS A", "SATKER A2", "ANDI", "Anak", "PNS DAERAH", 2, 200), ("DINAS B", "SATKER B1", "RINA", "X", "PPPK", 0, 0),
], rows

conn = sqlite3.connect(":memory:")
conn.row_factory = sqlite3.Row
conn.executescript(SCHEMA)
assert month_from_filename("Data/PPU PN sd Oktober 2026.xlsx") == "Oktober"
assert month_from_filename("PPU_PN_Januari_sd_MARET.xlsx") == "Maret"
assert month_from_filename("Data Oktober/PPU PN.xlsx") is None   # hanya nama file, bukan foldernya
assert import_rows(conn, rows, "test", "Oktober") == {"written": 4, "deleted": 0}
assert import_rows(conn, rows, "test", "Oktober") == {"written": 4, "deleted": 4}   # import ulang mengganti, tidak menumpuk
# Bulan lain disimpan terpisah dan tidak bercampur; urutan bulan mengikuti kalender.
assert import_rows(conn, rows[:1], "test", "Februari") == {"written": 1, "deleted": 0}
assert available_months(conn) == ["Februari", "Oktober"]
assert satker_summary(conn, "Februari") == [{"skpd": "DINAS A", "satker": "SATKER A1", "peserta": 1, "tunggakan": 1000}]
assert satker_summary(conn, "Maret") == []
assert detail(conn, "Februari", "DINAS A", "")["peserta"] == 1
assert detail(conn, "Februari", "DINAS B", "") is None
assert [r["nama_peserta"] for r in peserta_page(conn, "Februari", "", "", "", 1, 10)["rows"]] == ["BUDI"]

assert satker_summary(conn, "Oktober") == [
    {"skpd": "DINAS A", "satker": "SATKER A1", "peserta": 2, "tunggakan": 1500}, {"skpd": "DINAS A", "satker": "SATKER A2", "peserta": 1, "tunggakan": 200},
    {"skpd": "DINAS B", "satker": "SATKER B1", "peserta": 1, "tunggakan": 0},
]
assert detail(conn, "Oktober", "DINAS A", "") == {
    "skpd": "DINAS A", "satker": "", "peserta": 3, "jumlah_satker": 2, "tunggakan": 1700,
    "per_jenis": [{"label": "PPPK", "peserta": 2, "tunggakan": 1500}, {"label": "PNS DAERAH", "peserta": 1, "tunggakan": 200}],
}
one_satker = detail(conn, "Oktober", "DINAS A", "SATKER A2")
assert (one_satker["peserta"], one_satker["jumlah_satker"], one_satker["tunggakan"]) == (1, 1, 200)
assert detail(conn, "Oktober", "DINAS A", "SATKER B1") is None   # Satker harus di bawah SKPD itu
assert detail(conn, "Oktober", "TIDAK ADA", "") is None
names = lambda **filters: [r["nama_peserta"] for r in peserta_page(conn, **{"bulan": "Oktober", "skpd": "", "satker": "", "q": "", "page": 1, "size": 10, **filters})["rows"]]
assert names() == ["BUDI", "SITI", "ANDI", "RINA"]
assert names(skpd="DINAS A") == ["BUDI", "SITI", "ANDI"]
assert names(skpd="DINAS A", satker="SATKER A2") == ["ANDI"]
assert names(skpd="DINAS B", satker="SATKER A1") == []
assert names(q="ri") == ["RINA"]
assert names(sort="nama_peserta") == ["ANDI", "BUDI", "RINA", "SITI"]
assert names(sort="status", desc=True) == ["RINA", "BUDI", "SITI", "ANDI"]
assert names(sort="saldo; DROP TABLE ppu_pn") == ["BUDI", "SITI", "ANDI", "RINA"]   # di luar SORT_COLUMNS: tidak masuk SQL
# Migrasi: tabel versi lama tanpa bulan dibuat ulang, versi baru tidak disentuh.
old = sqlite3.connect(":memory:")
old.execute("CREATE TABLE ppu_pn (skpd TEXT NOT NULL, satker TEXT NOT NULL, nama_peserta TEXT NOT NULL, status TEXT NOT NULL)")
old.execute("INSERT INTO ppu_pn VALUES ('A', 'B', 'C', 'D')")
_migrate_ppu_pn(old)
old.executescript(SCHEMA)
assert old.execute("SELECT COUNT(*) FROM ppu_pn").fetchone()[0] == 0
assert "bulan" in {row[1] for row in old.execute("PRAGMA table_info(ppu_pn)")}
_migrate_ppu_pn(conn)
assert conn.execute("SELECT COUNT(*) FROM ppu_pn").fetchone()[0] == 5
# Halaman di luar jangkauan dikembalikan ke halaman terakhir.
assert peserta_page(conn, "Oktober", "", "", "", 9, 3) == {"total": 4, "page": 2, "rows": [dict(bulan="Oktober", skpd="DINAS B", satker="SATKER B1", nama_peserta="RINA", status="X", jenis="PPPK", bulan_menunggak=0, saldo=0)]}
print("ok")
