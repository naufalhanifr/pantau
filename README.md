# PANTAU

Pemantauan pembayaran iuran BPJS Kesehatan KC Bekasi.

- **Web monitoring** (`/`): dashboard, daftar badan usaha, Karyawan PPU BU, SKPD dan Karyawan PPU PN.
- **Web admin** (`/admin`): menu terpisah untuk Tagihan, Pembayaran, dan Karyawan (Upload Excel, Workspace, Riwayat Perubahan), serta PPU PN (Upload Excel, Riwayat Perubahan). Setelah disimpan, data langsung masuk ke `Data/pantau.db` dan tampil di monitoring.

## Menjalankan

```bash
./run.sh    # http://localhost:8000, hanya dari komputer ini; dari perangkat lain di jaringan: HOST=0.0.0.0 ./run.sh
```

Kata sandi dan kunci sesi dibaca dari file `.env` di folder ini (format `NAMA='nilai'`, satu per baris). File ini dan `server.env` ada di `.gitignore` dan tidak ikut `deploy.sh`: jangan di-commit atau dibagikan.

| Variabel | Default | Keterangan |
|---|---|---|
| `PANTAU_ADMIN_PASSWORD` | wajib diisi | Kata sandi web admin |
| `PANTAU_KARYAWAN_PASSWORD` | wajib diisi | Kata sandi menu Karyawan PPU BU (dicek server) |
| `PANTAU_PPU_PN_PASSWORD` | wajib diisi | Kata sandi menu Karyawan PPU PN (dicek server, sesi terpisah dari PPU BU) |
| `PANTAU_SECRET_KEY` | acak tiap start | Kunci tanda tangan token. Tanpa env, semua sesi berakhir saat server restart. Nilai di `.env` dan `server.env` harus berbeda, supaya token lokal tidak berlaku di server |
| `PANTAU_DB` | `Data/pantau.db` | Lokasi database SQLite |
| `PANTAU_TOKEN_TTL` | `28800` | Masa berlaku sesi admin (detik); keluar lebih awal setelah 30 menit tanpa aktivitas |
| `PANTAU_BACKUP_DIR` | `backups/` | Lokasi backup database |
| `PANTAU_YEAR` | `2026` | Tahun data di database ini, lihat "Pergantian tahun" |

Tidak ada kata sandi bawaan: login menu yang variabelnya kosong selalu ditolak, juga di lokal. Di server, kata sandi diisi lewat `/etc/pantau.env` (hanya bisa dibaca root, dipasang dari `server.env`). Kata sandi di bawah 12 karakter memberi peringatan di log saat start.

### Keamanan menu Karyawan (data pribadi)

- Kata sandi dicek server; salah 10× dari satu IP dikunci 15 menit (login admin juga). Browser tidak menawarkan simpan kata sandi. Login berhasil dan gagal tercatat di log service beserta IP-nya. Karena satu kata sandi dipakai bersama, log tidak bisa menunjukkan siapa orangnya.
- Token hanya di memori halaman: tombol Keluar, tutup tab, reload, atau pindah halaman = keluar, dan tokennya dicabut di server. Data di layar dihapus saat keluar.
- Keluar otomatis setelah 30 menit tanpa aktivitas atau saat koneksi terputus. Token dari server juga hanya berlaku 30 menit dan diperpanjang selama pengguna aktif.
- Nama dan No. JKN dikirim lewat body POST, bukan URL, supaya tidak tercatat di log nginx. Respons `/api/*` memakai `Cache-Control: no-store`, kecuali `/api/data` (data publik, ber-ETag); semua respons memakai header `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. Pustaka (Chart.js, Tabulator, Font Awesome) di-host sendiri di `web/shared/vendor/`.
- Ringkasan PPU PN terbuka tanpa login, tetapi nominal kelompok di bawah 3 peserta tidak dikirim server (`MIN_PUBLIC_PESERTA` di `services/ppu_pn.py`), karena tunggakannya menunjuk ke orang tertentu.
- Jalankan di balik HTTPS. Hitungan gagal login dan token yang dicabut disimpan di memori satu proses: jalankan uvicorn satu worker (seperti `run.sh` dan `pantau.service`).
- `nginx-admin.conf`, `nginx-main.conf`, dan `pantau.service` tidak ikut `deploy.sh`. Dua yang terakhir adalah contoh yang belum pernah dibandingkan dengan server: bandingkan dulu dengan yang terpasang. Setelah mengubah nginx, salin ke `/etc/nginx/sites-available/` lalu `sudo nginx -t && sudo systemctl reload nginx`.
- nginx domain utama wajib meneruskan IP pengunjung: `proxy_set_header Host $host;` dan `proxy_set_header X-Forwarded-For $remote_addr;`. Tanpa itu semua pengunjung terhitung satu IP dan satu orang salah ketik bisa mengunci semua orang.

### Pesan error

Semua error memakai pesan berbahasa Indonesia yang menyebut langkah berikutnya, supaya pengguna tidak melihat kode mentah.

- **Backend** (`ERROR_MESSAGES` di `backend/main.py`): pesan bawaan per kode (404, 405, 422, 429, 500, 503 saat database sibuk) bila route tidak memberi pesan sendiri. Browser yang membuka alamat yang tidak ada mendapat halaman `web/shared/error.html`, bukan teks JSON.
- **Frontend** (`PANTAU_ERROR_MESSAGES` di `web/shared/common.js`): untuk respons tanpa pesan dari backend, misalnya halaman error nginx (502, 504, 413) atau koneksi putus. Semua permintaan API lewat `pantauFetch`.
- **nginx**: saat backend mati atau terlalu lama (502/504), `nginx-admin.conf` dan `nginx-main.conf` menampilkan `web/shared/error.html`. Halaman ini mandiri tanpa CSS/JS luar, jadi tetap tampil walau backend mati. Path yang tidak ada diteruskan ke aplikasi supaya halaman 404-nya sama.

## Deploy

`./deploy.sh` hanya mengirim yang dipakai aplikasi: `backend/`, `web/`, `requirements.txt`, `run.sh`. Folder alat bantu/agent AI (`.claude`, `.cursor`, dan sejenisnya), test, dan file dokumentasi tidak ikut, dan sisa kiriman lama di server dihapus. Setelah restart, skrip mengatur izin `Data/`, memasang backup harian, dan memberi peringatan bila ada yang belum siap.

Sebelum mengirim kode, skrip memasang paket dan memastikan SQLite server versi 3.35 atau lebih baru (dibutuhkan migrasi); bila gagal, server tetap di versi lama. Waktu di Riwayat Perubahan selalu WIB, apa pun zona waktu server.

Checklist deploy pertama versi ini (skrip memeriksa nomor 1 sampai 3 dan menulis `PERINGATAN` bila belum):

1. `/etc/pantau.env` berisi `PANTAU_ADMIN_PASSWORD`, `PANTAU_KARYAWAN_PASSWORD`, `PANTAU_PPU_PN_PASSWORD`, `PANTAU_SECRET_KEY`. Ambil dari `server.env`, lalu `sudo systemctl restart pantau`.
2. `nginx-admin.conf` terbaru terpasang. Tanpanya, upload/simpan file besar gagal 413 karena batas bawaan nginx 1 MB.
3. Data PPU PN terisi: web admin, menu PPU PN, Upload Excel. Tabel versi lama dikosongkan otomatis saat aplikasi start.
4. nginx domain utama: lihat bagian Keamanan di atas dan `nginx-main.conf`, dan pastikan port 8000 tidak terbuka ke internet.

`./deploy.sh --with-data` juga menimpa `Data/` server dengan `Data/` lokal; database server dibackup dulu ke `~/pantau-backup/` di server.

## Backup

Database disalin otomatis ke `backups/` (di luar `Data/`, tidak ikut `deploy.sh`), dengan izin hanya pemilik:

- **Harian** pukul 01:15 lewat cron yang dipasang `deploy.sh`; 7 terakhir disimpan.
- **Sebelum upload yang mengganti data**, satu kali per upload walau berisi banyak bulan, lewat admin atau terminal; 10 terakhir disimpan.

Satu file sebesar database (±40 MB), jadi pastikan disk server menyisakan ±700 MB. Memulihkan: `sudo systemctl stop pantau`, salin file backup menjadi `Data/pantau.db`, `sudo systemctl start pantau`.

## Pergantian tahun

Database menyimpan nama bulan tanpa tahun, jadi satu `pantau.db` = satu tahun. Upload "Januari" tahun baru dengan opsi ganti akan menghapus Januari tahun lalu. Sebelum upload pertama tahun baru:

1. Di server, arsipkan database: `cp Data/pantau.db Data/pantau-2026.db`, lalu hapus `Data/pantau.db` (dibuat ulang kosong saat restart).
2. Tambahkan `PANTAU_YEAR=<tahun baru>` di `/etc/pantau.env`, lalu `sudo systemctl restart pantau`.
3. Data lama tetap bisa dilihat dengan instance kedua: `PANTAU_DB=Data/pantau-2026.db PANTAU_YEAR=2026 PORT=8001 ./run.sh`.

## Struktur

```
backend/                     FastAPI
  main.py                    app, static mount
  config.py  db.py  auth.py  konfigurasi; skema, migrasi & catatan riwayat (WIB); token, kunci login & rute login/refresh/logout
  templating.py              penyusun HTML: <!-- @include file.html -->
  routers/monitoring.py      GET /, /api/data, /api/health
  routers/__init__.py        check_month (dipakai semua router)
  routers/karyawan.py        POST /api/karyawan/login, /refresh, /logout; GET /meta; POST /search, /riwayat (perlu token)
  routers/ppu_pn.py          GET /api/ppu-pn/satker dan /detail (terbuka), POST /login, /refresh, /logout, /peserta (token PPU PN)
  routers/admin.py           GET /admin, /api/admin/* (login, logout, upload, ppu-pn/upload, import, records, history)
  services/excel.py          baca Excel + deteksi kolom/bulan/jenis
  services/records.py        query & simpan tagihan/pembayaran
  services/normalize.py      parsing angka, KODE BU 8 digit, nama bulan
  services/karyawan.py       import Excel Karyawan + query Daftar Karyawan per bulan tagih
  services/ppu_pn.py         import Excel PPU PN + query SKPD/Satker/peserta + ringkasan terbuka
  services/backup.py         backup database harian dan sebelum data diganti

web/shared/design-system/    komponen CSS bersama (monitoring + admin)
  base.css  table.css  buttons.css  select-menu.css  empty-state.css  login-card.css
  (warna dasar: --pantau-* di base.css)
  badge.css                  label status berwarna: pantau-badge (+ pantau-badge-success / pantau-badge-warning)
  pagination.css + pagination.js   tombol pagination tabel: pantauPagination(halaman, total, go)
  confirm-dialog.css/.js     modal konfirmasi: await pantauConfirm({ title, message, confirmText, tone })
  detail-modal.css/.js       popup detail + tabel: <dialog class="pantau-detail-modal">, buka dengan pantauOpenDetailModal(id)
  select-menu.css/.js        semua <select> otomatis tampil sebagai daftar opsi PANTAU
  app-shell.css/.js          header (jam WIB), sidebar (bisa diciutkan, grup menu opsional), footer: pantau-header / pantau-sidebar / pantau-footer
  layout.css  card.css       padding area konten (pantau-content), jarak antar blok (pantau-page, pantau-page-head), card (pantau-card)
  search-bar.css             searchbar: pantau-search
  dropdown-list.css/.js      list opsi dropdown (pantau-dropdown-list, scrollbar selalu terlihat); pantauPlaceDropdown() memilih muncul di bawah/atas
web/shared/common.js         MONTHS, escapeHtml, formatRupiah (monitoring + admin)
web/shared/vendor/           Chart.js 4.6.1, Tabulator 6.3.1, Font Awesome 6.4.0 (salinan paket npm, tidak diubah)
web/shared/tailwind.css      CSS Tailwind hasil build (tailwind.config.js di root). Build ulang setelah menambah class:
                             npx -y tailwindcss@3.4.17 -o web/shared/tailwind.css --minify

web/monitoring/
  index.html                 kerangka halaman (head + include + urutan script)
  partials/                  header, sidebar, footer, popup detail BU
  pages/                     dashboard.html, badan-usaha.html, karyawan.html, ppu-pn.html
  assets/css/pages/          common, dashboard, badan-usaha, business-detail, karyawan, ppu-pn
  assets/js/core/            api, utils, state, data, period-filter
  assets/js/layout/          navigation (pindah menu)
  assets/js/pages/           dashboard, dashboard-trend, badan-usaha, business-detail, karyawan(-auth), ppu-pn

web/admin/
  index.html  partials/  pages/ (upload, workspace, riwayat; isinya mengikuti menu jenis aktif)
  assets/css/                admin.css, spreadsheet.css (tema Tabulator)
  assets/js/                 core/, layout/, components/spreadsheet.js, pages/, main.js

Data/                        pantau.db + file Excel sumber
tests/                       .venv/bin/python -m tests.test_aturan  (dan tests.test_karyawan_tanggal, tests.test_ppu_pn)
                             tests.test_http butuh: .venv/bin/pip install -r requirements-dev.txt
                             GitHub Actions menjalankan semuanya tiap push (.github/workflows/test.yml)
```

HTML dipecah per menu, tetapi backend menyusunnya kembali menjadi satu dokumen. Urutan parsing dan eksekusi script di browser tetap sama seperti file tunggal.

## Format Excel yang dikenali

- **Upload per bulan**: di halaman Upload (menu Tagihan atau Pembayaran), tabel 12 bulan menampilkan status data tiap bulan. Tombol Upload/Ganti mengunci bulan, lalu memakai sheet yang bulannya cocok (atau sheet pertama) dan mengganti data bulan itu.
- **Template**: tombol "Download template" di judul halaman Upload (12 sheet, satu per bulan). KODE BU berformat teks agar nol di depan tidak hilang, dan sheet kosong dilewati saat upload.
- **Tagihan / Pembayaran**: satu sheet per bulan, kolom `NO | KODE BU | NAMA BU | Periode | Peserta | Nominal`. Jenis data mengikuti menu yang dibuka (nama file hanya dipakai untuk peringatan), bulan dari nama sheet atau kolom Periode.
- **Rekap**: kolom `Kode BU | Nama BU | Total Tagihan (...) | Total Bayar (...)`. Hanya kolom sesuai menu (Total Tagihan atau Total Bayar) yang disimpan, dan bulan dibaca dari judul kolom.

Pemetaan kolom dan bulan bisa diubah di layar upload sebelum disimpan. Opsi "Ganti seluruh data bulan yang sama" menghapus data jenis tersebut pada bulan itu sebelum menyimpan isi file; dialog konfirmasi menampilkan jumlah baris lama dan baru.

Semua sheet dalam satu upload disimpan sekaligus: bila satu bulan gagal, tidak ada yang tersimpan. Seluruh baris ditolak, dengan pesan per baris, bila ada isi yang salah: KODE BU bukan 8 digit, Noka bukan 13 digit, jumlah bukan angka atau negatif, atau Tanggal Bayar di luar bulan tagihnya.

## Data Karyawan

Excel Karyawan berisi satu sheet per bulan tagih (header 2 baris: Kode BU .. Bulan Tagih, lalu Tanggal Bayar | Jumlah Bayar bulan itu).
Di `pantau.db` disimpan sebagai:

- `karyawan`: satu baris per peserta/keluarga per bulan tagih.
- `karyawan_pembayaran`: riwayat pembayaran, satu baris per peserta/keluarga per bulan yang ada pembayarannya.
  Menu Karyawan PPU BU menampilkan pembayaran terakhir sampai bulan tagih yang dipilih.

Diisi lewat web admin menu **Karyawan** (Upload Excel per bulan, Workspace, Riwayat) atau, untuk file setahun, dari terminal:

```bash
.venv/bin/python -m backend.services.karyawan Data/Karyawan.xlsx   # ±5 detik; bulan yang ada di file diganti
```

## Data PPU PN

Menu **PPU PN** di monitoring: SKPD terbuka tanpa login, Karyawan memakai kata sandi dan sesi sendiri (`PANTAU_PPU_PN_PASSWORD`). Dashboard punya tab PPU PN berisi ringkasan serta SKPD dan Satker tunggakan tertinggi, juga tanpa login karena tidak memuat nama peserta. Filternya rentang bulan seperti tab PPU BU, tetapi angkanya posisi pada bulan akhir rentang karena saldo tidak boleh dijumlahkan antarbulan.
Sumbernya sheet `Gabungan` di file `PPU PN sd <bulan> <tahun>.xlsx`: satu baris per peserta/keluarga dengan kolom `SKPD`, `Satker`, `nmpst`, `pisapst`, `ketjnspeserta`, `bulan_menunggak`, `saldo`.
Total Tunggakan = jumlah `saldo`, sama dengan sheet `SKPD` dan `Satker` di file itu. Tabel menu berisi ringkasan; rincian per jenis peserta dan daftar Satker ada di popup Detail.
Disimpan di tabel `ppu_pn` (kolom di atas saja; nomor HP, email, dan alamat tidak disimpan). Diisi lewat web admin menu **PPU PN** (tombol Upload per bulan), atau dari terminal:

```bash
.venv/bin/python -m backend.services.ppu_pn "Data/PPU PN sd Oktober 2026.xlsx"   # hanya data bulan Oktober yang diganti
```

Bulan data diambil dari nama file, dan filter Bulan di ketiga menu hanya menampilkan bulan yang sudah diimport. Tahun tidak disimpan, sama dengan Daftar Karyawan.

Tabel `ppu_pn` versi lama (tanpa `bulan`) otomatis dikosongkan saat aplikasi start, jadi setelah deploy data perlu diupload sekali.
