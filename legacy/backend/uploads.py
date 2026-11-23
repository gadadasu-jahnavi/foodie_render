import uuid
from pathlib import Path

from flask import current_app

ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
SIGNATURES = {".jpg": b"\xff\xd8\xff", ".png": b"\x89PNG", ".pdf": b"%PDF"}


class UploadError(Exception):
    pass


def save_upload(file, label, subdir, images_only=False):
    """Validate type, size and magic bytes; store under a random name; return path relative to UPLOAD_DIR."""
    ext = ALLOWED.get(file.mimetype or "")
    if ext is None or (images_only and ext == ".pdf"):
        raise UploadError(f"{label}: only {'JPG or PNG' if images_only else 'JPG, PNG or PDF'} files are allowed")
    data = file.read()
    limit = current_app.config["MAX_UPLOAD_MB"]
    if len(data) > limit * 1024 * 1024:
        raise UploadError(f"{label}: file is larger than {limit} MB")
    if not data.startswith(SIGNATURES[ext]):
        raise UploadError(f"{label}: file content does not match its type")
    folder = Path(current_app.config["UPLOAD_DIR"]) / subdir
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{label}-{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(data)
    return f"{subdir}/{name}"
