#!/usr/bin/env bash
# Deploy PANTAU ke production: kode aplikasi di server disamakan persis dengan folder ini.
# Data/ server tidak disentuh, kecuali pakai --with-data (menimpa Data/ server dengan Data/ lokal; database server dibackup dulu).
set -euo pipefail
cd "$(dirname "$0")"

HOST=pantau@103.93.135.213
APP=/var/www/pantau
SSH="ssh -i $HOME/.ssh/NAUFAL -o IdentitiesOnly=yes"

# Daftar putih: hanya yang dibutuhkan aplikasi saat jalan. Folder alat bantu/agent AI (.claude, .cursor, ...),
# test, dan konfigurasi nginx tidak pernah ikut, termasuk folder baru yang muncul nanti.
INCLUDES=(--include "/backend/***" --include "/web/***" --include /requirements.txt --include /run.sh)
if [ "${1:-}" = "--with-data" ]; then
  INCLUDES+=(--include "/Data/***")
  # Backup di luar Data/: rsync --delete menghapus file Data/ server yang tidak ada di lokal.
  $SSH "$HOST" "mkdir -p ~/pantau-backup && [ ! -f $APP/Data/pantau.db ] || cp -p $APP/Data/pantau.db ~/pantau-backup/pantau-\$(date +%Y%m%d-%H%M%S).db; chmod 700 ~/pantau-backup"
fi

# Paket dipasang dan versi dicek sebelum kode dikirim: bila gagal, server tetap utuh di versi lama
# (bukan backend lama yang melayani halaman baru). DROP COLUMN di migrasi db.py butuh SQLite 3.35+.
rsync -az -e "$SSH" requirements.txt "$HOST:$APP/requirements.txt"
$SSH "$HOST" "set -e; cd $APP
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -c 'import sqlite3, sys; sys.exit(0 if sqlite3.sqlite_version_info >= (3, 35) else \"SQLite \" + sqlite3.sqlite_version + \" terlalu lama, butuh 3.35 atau lebih baru.\")'
.venv/bin/pip install -q -r requirements.txt"

rsync -az --delete --exclude __pycache__ --exclude .DS_Store "${INCLUDES[@]}" --exclude "*" -e "$SSH" ./ "$HOST:$APP/"

# Sisa kiriman versi lama yang sekarang di luar daftar putih (tidak dihapus rsync karena dikecualikan).
OLD_EXTRAS=".agents .augment .claude .cline .codebuddy .codewhale .codex .continue .cursor .factory .gemini .github .hermes .kilocode .kiro .opencode .qoder .roo .trae .warp .windsurf AGENTS.md CLAUDE.md DESIGN.md README.md deploy.sh tailwind.config.js tests _backup"

$SSH -t "$HOST" "set -e; cd $APP
rm -rf $OLD_EXTRAS
sudo systemctl restart pantau
sleep 3
systemctl is-active pantau
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8000/
curl -fsS -o /dev/null http://127.0.0.1:8000/api/health
# Izin file data: hanya pemilik, bila service berjalan sebagai pemilik itu (kalau tidak, service tidak bisa membacanya).
if [ -f Data/pantau.db ] && [ \"\$(systemctl show -p User --value pantau)\" = \"\$(stat -c %U Data/pantau.db)\" ]; then
  chmod 700 Data; find Data -maxdepth 1 -type f -exec chmod 600 {} +
else
  echo 'PERINGATAN: izin Data/ tidak diubah karena service tidak berjalan sebagai pemilik pantau.db; pastikan file itu tidak bisa dibaca semua pengguna.'
fi
# Backup harian 01:15; baris lama diganti, jadi deploy berulang tidak menggandakan jadwal.
if command -v crontab >/dev/null; then
  { crontab -l 2>/dev/null | grep -v pantau-backup || true; echo '15 1 * * * cd $APP && .venv/bin/python -m backend.services.backup harian >/dev/null # pantau-backup'; } | crontab -
else
  echo 'PERINGATAN: crontab tidak ada, backup harian belum terpasang (lihat README).'
fi
curl -fsS http://127.0.0.1:8000/api/ppu-pn/satker | grep -q '\"months\":\[\]' && echo 'PERINGATAN: data PPU PN masih kosong; upload lewat web admin, menu PPU PN.'
grep -qs 'client_max_body_size 0;' /etc/nginx/sites-available/pantau-admin || echo 'PERINGATAN: nginx-admin.conf versi terbaru belum terpasang; upload/simpan file besar bisa gagal 413 (lihat README).'
pid=\$(systemctl show -p MainPID --value pantau)
for v in PANTAU_ADMIN_PASSWORD PANTAU_KARYAWAN_PASSWORD PANTAU_PPU_PN_PASSWORD PANTAU_SECRET_KEY; do
  sudo grep -qz \"^\$v=\" /proc/\$pid/environ || echo \"PERINGATAN: \$v belum di-set di service pantau; login web akan ditolak (lihat README).\"
done"
