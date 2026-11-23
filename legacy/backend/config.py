

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent

# Load database credentials from backend/.env
load_dotenv(BASE_DIR / ".env")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # Connect to the migrated MySQL database
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        f"sqlite:///{BASE_DIR / 'foodie.db'}"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))

    UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", ROOT_DIR / "uploads"))
    MAX_CONTENT_LENGTH = 40 * 1024 * 1024
    MAX_UPLOAD_MB = 5

    FRONTEND_DIR = ROOT_DIR / "frontend"

    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@foodie.com")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
