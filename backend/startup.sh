#!/usr/bin/env bash
set -e
ROOT="/home/site/wwwroot"
if [ -f "$ROOT/backend/app.py" ] && [ ! -f "$ROOT/app.py" ]; then
  ROOT="$ROOT/backend"
fi
cd "$ROOT"
export PYTHONPATH="$ROOT:${PYTHONPATH:-}"
exec gunicorn --bind=0.0.0.0 --timeout 600 app:app
