#!/usr/bin/env bash
set -e
ROOT="/home/site/wwwroot"
if [ -f "$ROOT/backend/app.py" ] && [ ! -f "$ROOT/app.py" ]; then
  ROOT="$ROOT/backend"
fi
cd "$ROOT"
export PYTHONPATH="$ROOT:${PYTHONPATH:-}"
if ! python -c "import gunicorn, django, rest_framework" 2>/dev/null; then
  python -m pip install -r requirements.txt
fi
exec python -m gunicorn app:app --bind=0.0.0.0 --timeout 600
