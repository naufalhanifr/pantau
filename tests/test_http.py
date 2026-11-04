"""Lewat HTTP: auth tiap endpoint, penolakan nilai rusak, backup, privasi ringkasan terbuka. Jalankan: .venv/bin/python -m tests.test_http
Butuh requirements-dev.txt. Memakai database sementara, Data/pantau.db tidak disentuh."""
import os
import sqlite3
import tempfile
from io import BytesIO
from pathlib import Path

tmp = Path(tempfile.mkdtemp())
os.environ.update(
    PANTAU_DB=str(tmp / "uji.db"), PANTAU_BACKUP_DIR=str(tmp / "backup"), PANTAU_SECRET_KEY="kunci-uji",
    PANTAU_ADMIN_PASSWORD="uji-admin", PANTAU_KARYAWAN_PASSWORD="uji-karyawan", PANTAU_PPU_PN_PASSWORD="uji-ppu",
)

from fastapi.testclient import TestClient
from openpyxl import Workbook

from backend.main import app


def ppu_file(rows) -> tuple[str, BytesIO, str]:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Gabungan"
    sheet.append(["SKPD", "Satker", "nmpst", "pisapst", "ketjnspeserta", "bulan_menunggak", "saldo"])
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return ("PPU PN sd Oktober 2026.xlsx", buffer, "application/octet-stream")


def bu(kode="00000001", peserta=1, nominal=1000, nama="PT UJI"):
    return {"kode_bu": kode, "nama_bu": nama, "peserta": peserta, "nominal": nominal}


with TestClient(app) as client:
    def login(path, password):
        response = client.post(path, json={"password": password})
        assert response.status_code == 200, response.text
        return {"Authorization": f"Bearer {response.json()['token']}"}

    # Dokumentasi otomatis mati, header keamanan terpasang, health tidak menyebut nama database.
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404, path
    page = client.get("/")
    assert "default-src 'self'" in page.headers["content-security-policy"] and "https://" not in page.text.split("</head>")[0]
    assert client.get("/api/health").json() == {"status": "ok"}

    admin = login("/api/admin/login", "uji-admin")
    pegawai = login("/api/karyawan/login", "uji-karyawan")
    ppu = login("/api/ppu-pn/login", "uji-ppu")

    # Token kosong dan token peran lain ditolak di semua endpoint berisi data pribadi atau perubahan data.
    protected = [
        ("POST", "/api/karyawan/search", pegawai, {"bulan": "Januari"}), ("POST", "/api/karyawan/riwayat", pegawai, {"noka": "1", "bulan": "Januari"}),
        ("GET", "/api/karyawan/meta", pegawai, None), ("POST", "/api/ppu-pn/peserta", ppu, {"bulan": "Januari"}),
        ("GET", "/api/admin/summary", admin, None), ("POST", "/api/admin/import", admin, {"jenis": "tagihan", "bulan": "Januari", "rows": [bu()]}),
    ]
    for method, path, owner, body in protected:
        others = [token for token in (admin, pegawai, ppu) if token is not owner]
        for headers in ({}, *others):
            assert client.request(method, path, headers=headers, json=body).status_code == 401, (path, headers)
        assert client.request(method, path, headers=owner, json=body).status_code == 200, path

    # Keluar mencabut token di server.
    temp = login("/api/karyawan/login", "uji-karyawan")
    assert client.post("/api/karyawan/logout", headers=temp).status_code == 200
    assert client.get("/api/karyawan/meta", headers=temp).status_code == 401
    temp = login("/api/admin/login", "uji-admin")
    assert client.post("/api/admin/logout", headers=temp).status_code == 200
    assert client.get("/api/admin/summary", headers=temp).status_code == 401
    assert client.get("/api/admin/summary", headers=admin).status_code == 200

    # Nilai rusak ditolak utuh: tidak ada baris yang tersimpan.
    def upload_status(rows, jenis="tagihan", bulan="Februari"):
        return client.post("/api/admin/import", headers=admin, json={"jenis": jenis, "bulan": bulan, "rows": rows})

    for rows in (
        [bu(nominal="lima juta")], [bu(nominal=-5000)], [bu(kode="KODE-SALAH")], [bu(kode="123456789012345678")],
        [bu(nominal="99999999999999999999")], [bu(peserta="abc")], [bu(), bu()],
    ):
        response = upload_status(rows)
        assert response.status_code == 422, rows
        assert isinstance(response.json()["detail"], list)
    assert not [m for m in client.get("/api/admin/summary", headers=admin).json()["per_bulan"] if m["bulan"] == "Februari" and m["tagihan_rows"]]
    assert upload_status([bu(nominal="Rp 1.234.567", kode=123)]).status_code == 200

    person = {"kode_bu": "00000001", "nama_bu": "PT UJI", "noka_peserta": "1", "nama_peserta": "A", "noka_keluarga": "1", "nama_keluarga": "A", "status": "Peserta", "bulan_menunggak": 1, "nominal_tagihan": 100, "tanggal_bayar": "15/02/2026", "jumlah_bayar": 50}
    for wrong in ({"tanggal_bayar": "31/12/2026"}, {"jumlah_bayar": "abc"}, {"nominal_tagihan": -1}, {"noka_keluarga": "12345678901234"}, {"kode_bu": "x"}, {"bulan_menunggak": "tiga"}):
        assert upload_status([{**person, **wrong}], "karyawan").status_code == 422, wrong
    assert upload_status([person], "karyawan").status_code == 200
    row = client.post("/api/karyawan/search", headers=pegawai, json={"bulan": "Februari", "bayar": "nyicil"}).json()["rows"][0]
    assert row["status_bayar"] == "nyicil"
    # % dan _ dicari sebagai huruf, bukan pola.
    assert client.post("/api/karyawan/search", headers=pegawai, json={"bulan": "Februari", "q": "%"}).json()["total"] == 0
    assert client.post("/api/karyawan/search", headers=pegawai, json={"bulan": "Februari", "q": "UJI"}).json()["total"] == 1

    # Mengganti bulan membuat backup yang bisa dibuka; percobaan yang ditolak tidak.
    backups = lambda: sorted((tmp / "backup").glob("pantau-sebelum-ganti-*.db"))
    before = len(backups())
    assert upload_status([bu(nominal="abc")]).status_code == 422
    assert len(backups()) == before
    assert upload_status([bu(nominal=2000)]).status_code == 200
    assert len(backups()) == before + 1
    copy = sqlite3.connect(backups()[-1])
    assert copy.execute("SELECT nominal FROM tagihan WHERE bulan = 'Februari'").fetchone()[0] == 1234567   # isi sebelum diganti
    copy.close()
    assert oct(backups()[-1].stat().st_mode)[-3:] == "600"

    # Nama BU berganti di bulan baru: bulan lama tetap memakai nama lamanya.
    assert upload_status([bu(nominal=3000, nama="PT BARU")], bulan="Maret").status_code == 200
    data = client.get("/api/data").json()
    names = {row["bulan"]: row["nama_bu"] for row in data["data"]}
    assert names["Februari"] == "PT UJI" and names["Maret"] == "PT BARU" and data["year"] == 2026

    # ETag: tanpa perubahan data, /api/data tidak dikirim ulang.
    etag = client.get("/api/data").headers["etag"]
    assert client.get("/api/data", headers={"If-None-Match": etag}).status_code == 304

    # Upload PPU PN: pratinjau tidak mengubah data, simpan mengganti bulan itu dan tercatat di riwayat dengan bulannya.
    rows = [
        ["DINAS A", "SATKER A1", "BUDI", "P", "PNS", 1, 1000], ["DINAS A", "SATKER A1", "SITI", "I", "PNS", 1, 2000], ["DINAS A", "SATKER A1", "ANDI", "A", "PNS", 1, 3000],
        ["DINAS A", "SATKER A2", "RINA", "P", "PPPK", 1, 4000], ["DINAS A", "SATKER A3", "TONO", "P", "PNS", 1, 5000],
        ["DINAS A", "SATKER A3", "TINI", "I", "PNS", 1, 6000], ["DINAS A", "SATKER A3", "TATA", "A", "PNS", 1, 7000],
        ["DINAS B", "SATKER B1", "DEDI", "P", "PNS", 1, 8000],
        ["DINAS C", "SATKER C1", "EKO", "P", "PNS", 1, 1000], ["DINAS C", "SATKER C1", "EVI", "I", "PNS", 1, 1000], ["DINAS C", "SATKER C1", "EGA", "A", "PNS", 1, 1000],
    ]
    url = "/api/admin/ppu-pn/upload?bulan=Oktober"
    preview = client.post(url, headers=admin, files={"file": ppu_file(rows)}).json()
    assert preview == {"filename": "PPU PN sd Oktober 2026.xlsx", "rows": 11, "total": 39000, "bulan_file": "Oktober"}, preview
    assert client.get("/api/ppu-pn/satker").json()["months"] == []
    assert client.post(url + "&simpan=true", headers=admin, files={"file": ppu_file(rows)}).json() == {"written": 11, "deleted": 0}
    assert client.post(url + "&simpan=true", files={"file": ppu_file(rows)}).status_code == 401
    bad = client.post(url + "&simpan=true", headers=admin, files={"file": ppu_file([["DINAS A", "SATKER A1", "X", "P", "PNS", 1, "abc"]])})
    assert bad.status_code == 422 and "saldo bukan angka" in bad.json()["detail"]
    log = client.get("/api/admin/history?jenis=ppu_pn", headers=admin).json()["rows"]
    assert log[0]["bulan"] == "Oktober" and log[0]["rows_written"] == 11

    # Ringkasan terbuka: Satker di bawah 3 peserta tanpa nominal, dan satu yang tersembunyi tidak bisa dihitung dari total.
    public = client.get("/api/ppu-pn/satker").json()
    by_name = {row["satker"]: row["tunggakan"] for row in public["rows"]}
    assert by_name["SATKER A2"] is None and by_name["SATKER B1"] is None
    assert sum(value is None for value in by_name.values()) >= 2
    assert public["total_tunggakan"] == 39000
    # DINAS B satu peserta; DINAS C (terkecil berikutnya) ikut disembunyikan, juga Satker di dalamnya, agar B tidak bisa dihitung dari total.
    assert public["skpd_totals"] == {"DINAS A": 28000, "DINAS B": None, "DINAS C": None}
    assert by_name["SATKER C1"] is None and by_name["SATKER A3"] == 18000
    detail = client.get("/api/ppu-pn/detail", params={"bulan": "Oktober", "skpd": "DINAS A"}).json()
    assert {row["label"]: row["tunggakan"] for row in detail["per_jenis"]}["PPPK"] is None
    hidden = client.get("/api/ppu-pn/detail", params={"bulan": "Oktober", "skpd": "DINAS C"}).json()
    assert hidden["tunggakan"] is None and all(row["tunggakan"] is None for row in hidden["per_jenis"])
    assert client.get("/api/ppu-pn/peserta").status_code == 405   # nama peserta hanya lewat POST
print("ok")
