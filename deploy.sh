#!/usr/bin/env bash
# Deploy PANTAU ke production: isi server disamakan persis dengan folder ini (file lama yang tidak ada di sini dihapus).
# Data/ server tidak disentuh, kecuali pakai --with-data (menimpa Data/ server dengan Data/ lokal).
set -euo pipefail
cd "$(dirname "$0")"

HOST=pantau@103.93.135.213
APP=/var/www/pantau
SSH="ssh -i $HOME/.ssh/NAUFAL -o IdentitiesOnly=yes"

EXCLUDES=(--exclude /.git --exclude /.venv --exclude /tests --exclude __pycache__ --exclude .DS_Store --exclude /CLAUDE.md --exclude /nginx-admin.conf)
[ "${1:-}" = "--with-data" ] || EXCLUDES+=(--exclude /Data)

rsync -az --delete "${EXCLUDES[@]}" -e "$SSH" ./ "$HOST:$APP/"

$SSH -t "$HOST" "set -e; cd $APP
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
sudo systemctl restart pantau
sleep 3
systemctl is-active pantau
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8000/"
