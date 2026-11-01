#!/usr/bin/env bash
# Jalankan PANTAU (monitoring: http://localhost:8000, admin: http://localhost:8000/admin)
set -euo pipefail
cd "$(dirname "$0")"
# Kata sandi & kunci sesi dari .env (tidak di-commit, tidak ikut deploy); tanpa .env dipakai kata sandi bawaan lokal.
if [ -f .env ]; then set -a; . ./.env; set +a; fi
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/uvicorn backend.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" "$@"
