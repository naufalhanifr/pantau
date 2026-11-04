#!/usr/bin/env bash
# Jalankan PANTAU (monitoring: http://localhost:8000, admin: http://localhost:8000/admin)
set -euo pipefail
cd "$(dirname "$0")"
# Kata sandi & kunci sesi dari .env (tidak di-commit, tidak ikut deploy); tanpa .env semua login ditolak.
if [ -f .env ]; then set -a; . ./.env; set +a; fi
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
# Default hanya komputer ini; supaya bisa dibuka dari perangkat lain di jaringan yang sama: HOST=0.0.0.0 ./run.sh
exec .venv/bin/uvicorn backend.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}" --no-server-header "$@"
