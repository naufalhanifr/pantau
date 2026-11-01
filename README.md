# PANTAU

Pemantauan pembayaran iuran BPJS Kesehatan KC Bekasi.

- **Web monitoring** (`/`): dashboard, daftar badan usaha, daftar karyawan.
- **Web admin** (`/admin`): menu terpisah untuk Tagihan, Pembayaran, dan Karyawan, masing-masing berisi Upload Excel, Workspace (edit seperti spreadsheet), dan Riwayat Perubahan. Setelah disimpan, data langsung masuk ke `Data/pantau.db` dan tampil di monitoring.

## Menjalankan

```bash
export PANTAU_ADMIN_PASSWORD='kata-sandi-admin'   # wajib diganti
export PANTAU_SECRET_KEY='string-acak-panjang'     # untuk token sesi admin
./run.sh                                           # http://localhost:8000
```

| Variabel | Default | Keterangan |
|---|---|---|
| `PANTAU_ADMIN_PASSWORD` | `admin-pantau` | Kata sandi web admin |
| `PANTAU_KARYAWAN_PASSWORD` | `PantauBPJs` | Kata sandi menu Daftar Karyawan (dicek server) |

Kata sandi bawaan hanya untuk uji lokal: diterima jika dibuka langsung di komputer server (`localhost`), ditolak dari IP lain atau lewat nginx. Di server, isi kedua variabel kata sandi.
| `PANTAU_SECRET_KEY` | acak tiap start | Kunci tanda tangan token admin & karyawan. Tanpa env, semua sesi berakhir saat server restart |
| `PANTAU_DB` | `Data/pantau.db` | Lokasi database SQLite |
| `PANTAU_TOKEN_TTL` | `28800` | Masa berlaku sesi admin (detik) |

### Keamanan menu Daftar Karyawan (data pribadi)

- Kata sandi dicek server; salah 5× dari satu IP dikunci 15 menit (login admin juga). Browser tidak menawarkan simpan kata sandi.
- Token hanya di memori halaman: tutup tab, reload, atau pindah halaman = keluar. Data di layar dihapus saat keluar.
- Keluar otomatis setelah 30 menit tanpa aktivitas atau saat koneksi terputus. Token dari server juga hanya berlaku 30 menit dan diperpanjang selama pengguna aktif.
- Respons `/api/*` memakai `Cache-Control: no-store`; semua respons memakai header `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.
- Jalankan di balik HTTPS. Hitungan gagal login disimpan di memori satu proses: jalankan uvicorn satu worker (seperti `run.sh`).
- `nginx-admin.conf` tidak ikut `deploy.sh`. Setelah mengubahnya, salin ke server (`/etc/nginx/sites-available/pantau-admin`) lalu `sudo nginx -t && sudo systemctl reload nginx`.
- nginx domain utama wajib meneruskan IP pengunjung: `proxy_set_header Host $host;` dan `proxy_set_header X-Forwarded-For $remote_addr;`.

## Deploy

`./deploy.sh` hanya mengirim yang dipakai aplikasi: `backend/`, `web/`, `requirements.txt`, `run.sh`. Folder alat bantu/agent AI (`.claude`, `.cursor`, dan sejenisnya), test, dan file dokumentasi tidak ikut, dan sisa kiriman lama di server dihapus. Setelah restart, skrip memberi peringatan bila `PANTAU_ADMIN_PASSWORD`, `PANTAU_KARYAWAN_PASSWORD`, atau `PANTAU_SECRET_KEY` belum di-set di service.

`./deploy.sh --with-data` juga menimpa `Data/` server dengan `Data/` lokal; database server dibackup dulu ke `~/pantau-backup/` di server.

## Pergantian tahun

Database menyimpan nama bulan tanpa tahun, jadi satu `pantau.db` = satu tahun. Upload "Januari" tahun baru dengan opsi ganti akan menghapus Januari tahun lalu. Sebelum upload pertama tahun baru:

1. Di server, arsipkan database: `cp Data/pantau.db Data/pantau-2026.db`, lalu hapus `Data/pantau.db` (dibuat ulang kosong saat restart).
2. Ubah `PANTAU_YEAR` di `web/monitoring/assets/js/core/data.js` ke tahun baru, lalu deploy.
3. Data lama tetap bisa dilihat dengan instance kedua: `PANTAU_DB=Data/pantau-2026.db PORT=8001 ./run.sh`.

## Struktur

```
backend/                     FastAPI
  main.py                    app, static mount
  config.py  db.py  auth.py  konfigurasi, skema SQLite, token admin
  templating.py              penyusun HTML: <!-- @include file.html -->
  routers/monitoring.py      GET /, /api/data, /api/health
  routers/karyawan.py        POST /api/karyawan/login, GET /api/karyawan/meta, /api/karyawan (perlu token)
  routers/admin.py           GET /admin, /api/admin/* (login, upload, import, records, history)
  services/excel.py          baca Excel + deteksi kolom/bulan/jenis
  services/records.py        query & simpan tagihan/pembayaran
  services/normalize.py      parsing angka, KODE BU 8 digit, nama bulan
  services/karyawan.py       import Excel Karyawan + query Daftar Karyawan per bulan tagih

web/shared/design-system/    komponen CSS bersama (monitoring + admin)
  base.css  table.css  buttons.css  select-menu.css  empty-state.css  login-card.css
  badge.css                  label status berwarna: pantau-badge (+ pantau-badge-success / pantau-badge-warning)
  pagination.css + pagination.js   tombol pagination tabel: pantauPagination(halaman, total, go)
  confirm-dialog.css/.js     modal konfirmasi: await pantauConfirm({ title, message, confirmText, tone })
  detail-modal.css/.js       popup detail + tabel: <dialog class="pantau-detail-modal">, buka dengan pantauOpenDetailModal(id)
  select-menu.css/.js        semua <select> otomatis tampil sebagai daftar opsi PANTAU
  app-shell.css/.js          header (jam WIB), sidebar (bisa diciutkan, grup menu opsional), footer: pantau-header / pantau-sidebar / pantau-footer
  layout.css  card.css       padding area konten (pantau-content), jarak antar blok (pantau-page, pantau-page-head), card (pantau-card)
  search-bar.css             searchbar: pantau-search
  dropdown-list.css/.js      list opsi dropdown (pantau-dropdown-list, scrollbar selalu terlihat); pantauPlaceDropdown() memilih muncul di bawah/atas
web/shared/common.js         MONTHS dan escapeHtml (monitoring + admin)
web/shared/tailwind.css      CSS Tailwind hasil build (tailwind.config.js di root). Build ulang setelah menambah class:
                             npx -y tailwindcss@3.4.17 -o web/shared/tailwind.css --minify

web/monitoring/
  index.html                 kerangka halaman (head + include + urutan script)
  partials/                  header, sidebar, footer, popup detail BU
  pages/                     dashboard.html, badan-usaha.html, karyawan.html
  assets/css/pages/          common, dashboard, badan-usaha, business-detail, karyawan
  assets/js/core/            api, utils, state, data, period-filter
  assets/js/layout/          navigation (pindah menu)
  assets/js/pages/           dashboard, dashboard-trend, badan-usaha, business-detail, karyawan(-auth)

web/admin/
  index.html  partials/  pages/ (upload, workspace, riwayat; isinya mengikuti menu jenis aktif)
  assets/css/                admin.css, spreadsheet.css (tema Tabulator)
  assets/js/                 core/, layout/, components/spreadsheet.js, pages/, main.js

Data/                        pantau.db + file Excel sumber
tests/                       .venv/bin/python -m tests.test_aturan  (dan tests.test_karyawan_tanggal)
```

HTML dipecah per menu, tetapi backend menyusunnya kembali menjadi satu dokumen. Urutan parsing dan eksekusi script di browser tetap sama seperti file tunggal.

## Format Excel yang dikenali

- **Upload per bulan**: di halaman Upload (menu Tagihan atau Pembayaran), tabel 12 bulan menampilkan status data tiap bulan. Tombol Upload/Ganti mengunci bulan, lalu memakai sheet yang bulannya cocok (atau sheet pertama) dan mengganti data bulan itu.
- **Template**: tombol "Download template" di judul halaman Upload (12 sheet, satu per bulan). KODE BU berformat teks agar nol di depan tidak hilang, dan sheet kosong dilewati saat upload.
- **Tagihan / Pembayaran**: satu sheet per bulan, kolom `NO | KODE BU | NAMA BU | Periode | Peserta | Nominal`. Jenis data mengikuti menu yang dibuka (nama file hanya dipakai untuk peringatan), bulan dari nama sheet atau kolom Periode.
- **Rekap**: kolom `Kode BU | Nama BU | Total Tagihan (...) | Total Bayar (...)`. Hanya kolom sesuai menu (Total Tagihan atau Total Bayar) yang disimpan, dan bulan dibaca dari judul kolom.

Pemetaan kolom dan bulan bisa diubah di layar upload sebelum disimpan. Opsi "Ganti seluruh data bulan yang sama" menghapus data jenis tersebut pada bulan itu sebelum menyimpan isi file.

## Data Karyawan

Excel Karyawan berisi satu sheet per bulan tagih (header 2 baris: Kode BU .. Bulan Tagih, lalu Tanggal Bayar | Jumlah Bayar bulan itu).
Di `pantau.db` disimpan sebagai:

- `karyawan`: satu baris per peserta/keluarga per bulan tagih.
- `karyawan_pembayaran`: riwayat pembayaran, satu baris per peserta/keluarga per bulan yang ada pembayarannya.
  Menu Daftar Karyawan menampilkan pembayaran terakhir sampai bulan tagih yang dipilih.

Diisi lewat web admin menu **Karyawan** (Upload Excel per bulan, Workspace, Riwayat) atau, untuk file setahun, dari terminal:

```bash
.venv/bin/python -m backend.services.karyawan Data/Karyawan.xlsx   # ±5 detik; bulan yang ada di file diganti
```
