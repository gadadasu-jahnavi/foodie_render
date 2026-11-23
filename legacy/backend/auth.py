import re
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from models import Admin, Customer, Rider, Seller, db

ROLE_MODEL = {"admin": Admin, "customer": Customer, "seller": Seller, "rider": Rider}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def err(message, code=400):
    return jsonify({"error": message}), code


def make_token(role, user_id):
    exp = datetime.now(timezone.utc) + timedelta(hours=current_app.config["JWT_EXPIRE_HOURS"])
    return jwt.encode({"role": role, "sub": str(user_id), "exp": exp},
                      current_app.config["SECRET_KEY"], algorithm="HS256")


def clean_phone(text):
    """Accepts '+91 98765 43210', '98765-43210' ... -> '9876543210'."""
    digits = re.sub(r"\D", "", text or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits


def require_role(role):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return err("Please log in", 401)
            try:
                payload = jwt.decode(header[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"])
            except jwt.PyJWTError:
                return err("Session expired. Please log in again", 401)
            if payload.get("role") != role:
                return err("You do not have access to this area", 403)
            user = db.session.get(ROLE_MODEL[role], int(payload["sub"]))
            if user is None:
                return err("Account not found", 401)
            if role == "customer" and user.status != "Active":
                return err("This account has been deactivated", 403)
            if role == "rider" and user.status != "Approved":
                # also covers riders rejected/re-set to Pending after they already hold a token
                return err("Your rider account is not approved", 403)
            g.user = user
            return fn(*a, **kw)
        return wrapper
    return deco
