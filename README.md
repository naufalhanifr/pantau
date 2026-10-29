# PANTAU

Pemantauan pembayaran iuran BPJS Kesehatan KC Bekasi.

- **Web monitoring** (`/`): dashboard, daftar badan usaha, daftar karyawan.
- **Web admin** (`/admin`): menu terpisah untuk Tagihan dan Pembayaran, masing-masing berisi Upload Excel, Workspace (edit seperti spreadsheet), dan Riwayat Perubahan. Setelah disimpan, data langsung masuk ke `Data/pantau.db` dan tampil di monitoring.

## Menjalankan

```bash
export PANTAU_ADMIN_PASSWORD='kata-sandi-admin'   # wajib diganti
export PANTAU_SECRET_KEY='string-acak-panjang'     # untuk token sesi admin
./run.sh                                           # http://localhost:8000
```

| Variabel | Default | Keterangan |
|---|---|---|
| `PANTAU_ADMIN_PASSWORD` | `admin-pantau` | Kata sandi web admin |
| `PANTAU_SECRET_KEY` | `ganti-secret-key-ini` | Kunci tanda tangan token admin |
| `PANTAU_DB` | `Data/pantau.db` | Lokasi database SQLite |
| `PANTAU_TOKEN_TTL` | `28800` | Masa berlaku sesi admin (detik) |

## Struktur

```
backend/                     FastAPI
  main.py                    app, static mount
  config.py  db.py  auth.py  konfigurasi, skema SQLite, token admin
  templating.py              penyusun HTML: <!-- @include file.html -->
  routers/monitoring.py      GET /, /api/data, /api/health
  routers/admin.py           GET /admin, /api/admin/* (login, upload, import, records, history)
  services/excel.py          baca Excel + deteksi kolom/bulan/jenis
  services/records.py        query & simpan tagihan/pembayaran
  services/normalize.py      parsing angka, KODE BU 8 digit, nama bulan

web/shared/design-system/    komponen CSS bersama (monitoring + admin)
  base.css  table.css  buttons.css  select-menu.css  empty-state.css  login-card.css
  pagination.css + pagination.js   tombol pagination tabel: pantauPagination(halaman, total, go)
  confirm-dialog.css/.js     modal konfirmasi: await pantauConfirm({ title, message, confirmText, tone })
  select-menu.css/.js        semua <select> otomatis tampil sebagai daftar opsi PANTAU

web/monitoring/
  index.html                 kerangka halaman (head + include + urutan script)
  partials/                  header, sidebar, footer, popup detail BU
  pages/                     dashboard.html, badan-usaha.html, karyawan.html
  assets/css/layout/         shell.css (sidebar, area konten, footer)
  assets/css/pages/          common, dashboard, badan-usaha, business-detail, karyawan
  assets/js/core/            api, utils, state, data, period-filter
  assets/js/layout/          shell (tinggi header), navigation (menu & sidebar)
  assets/js/pages/           dashboard, dashboard-trend, badan-usaha, business-detail, karyawan(-auth)
  assets/js/components/      clock, empty-state, dropdown-scroll-indicator
  assets/js/data/            employee-records.js (data contoh Daftar Karyawan)

web/admin/
  index.html  partials/  pages/ (upload, workspace, riwayat; isinya mengikuti menu jenis aktif)
  assets/css/                admin.css, spreadsheet.css (tema Tabulator)
  assets/js/                 core/, layout/, components/spreadsheet.js, pages/, main.js

Data/                        pantau.db + file Excel sumber
_backup/                     index.html & main.py versi lama (boleh dihapus)
```

HTML dipecah per menu, tetapi backend menyusunnya kembali menjadi satu dokumen. Urutan parsing dan eksekusi script di browser tetap sama seperti file tunggal.

## Format Excel yang dikenali

- **Upload per bulan**: di halaman Upload (menu Tagihan atau Pembayaran), tabel 12 bulan menampilkan status data tiap bulan. Tombol Upload/Ganti mengunci bulan, lalu memakai sheet yang bulannya cocok (atau sheet pertama) dan mengganti data bulan itu.
- **Template**: tombol "Download template" di judul halaman Upload (12 sheet, satu per bulan). KODE BU berformat teks agar nol di depan tidak hilang, dan sheet kosong dilewati saat upload.
- **Tagihan / Pembayaran**: satu sheet per bulan, kolom `NO | KODE BU | NAMA BU | Periode | Peserta | Nominal`. Jenis data mengikuti menu yang dibuka (nama file hanya dipakai untuk peringatan), bulan dari nama sheet atau kolom Periode.
- **Rekap**: kolom `Kode BU | Nama BU | Total Tagihan (...) | Total Bayar (...)`. Hanya kolom sesuai menu (Total Tagihan atau Total Bayar) yang disimpan, dan bulan dibaca dari judul kolom.

Pemetaan kolom dan bulan bisa diubah di layar upload sebelum disimpan. Opsi "Ganti seluruh data bulan yang sama" menghapus data jenis tersebut pada bulan itu sebelum menyimpan isi file.
