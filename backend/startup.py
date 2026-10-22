import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
nested = os.path.join(ROOT, "backend", "app.py")
if not os.path.exists(os.path.join(ROOT, "app.py")) and os.path.exists(nested):
    ROOT = os.path.join(ROOT, "backend")

os.chdir(ROOT)
sys.path.insert(0, ROOT)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

try:
    import django  # noqa: F401
    import gunicorn  # noqa: F401
except ImportError:
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"]
    )

port = os.environ.get("PORT", "8000")
os.execv(
    sys.executable,
    [
        sys.executable,
        "-m",
        "gunicorn",
        "app:app",
        "--bind",
        f"0.0.0.0:{port}",
        "--timeout",
        "600",
        "--access-logfile",
        "-",
        "--error-logfile",
        "-",
    ],
)
