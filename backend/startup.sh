#!/usr/bin/env bash
set -e
python -m gunicorn config.wsgi:application --bind=0.0.0.0:${PORT:-8000} --timeout 120 --workers 2
