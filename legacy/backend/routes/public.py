"""Registration + login for all four roles."""
import json
import secrets

from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from werkzeug.security import check_password_hash, generate_password_hash

from auth import EMAIL_RE, PHONE_RE, clean_phone, err, make_token
from models import Admin, Customer, Rider, Seller, db, notify
from uploads import UploadError, save_upload

bp = Blueprint("public", __name__, url_prefix="/api")


def f(name, default=""):
    return (request.form.get(name) or default).strip()


# ------------------------------------------------------------------ customer
@bp.post("/customers/register")
def register_customer():
    d = request.get_json(silent=True) or {}
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    phone = clean_phone(d.get("phone") or "")
    city = (d.get("city") or "").strip()
    password = d.get("password") or ""
    if len(name) < 2:
        return err("Enter your name", 422)
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address", 422)
    if phone and not PHONE_RE.match(phone):
        return err("Enter a valid 10-digit mobile number", 422)
    if len(password) < 8:
        return err("Password must be at least 8 characters", 422)
    if Customer.query.filter_by(email=email).first():
        return err("An account with this email already exists. Please log in.", 409)
    c = Customer(name=name, email=email, phone=phone, city=city,
                 password_hash=generate_password_hash(password))
    db.session.add(c)
    notify("customer", "New customer registered", f"{name} ({email}) just signed up",
           "customers", {"q": name, "hl": name})
    db.session.commit()
    return jsonify({"id": c.id, "name": c.name, "email": c.email}), 201


CUISINE_EMOJI = {"Indian": "🍛", "South Indian": "🥞", "North Indian": "🍢", "Chinese": "🥡",
                 "Italian": "🍕", "Continental": "🥗", "Fast Food": "🍔", "Multi Cuisine": "🍽️"}


# ------------------------------------------------------------------- seller
@bp.post("/sellers/register")
def register_seller():
    required = ["owner_name", "owner_email", "owner_phone", "restaurant_name", "password"]
    for k in required:
        if not f(k):
            return err(f"Missing field: {k}", 422)
    email = f("owner_email").lower()
    phone = clean_phone(f("owner_phone"))
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address", 422)
    if not PHONE_RE.match(phone):
        return err("Enter a valid 10-digit mobile number", 422)
    if len(request.form.get("password", "")) < 8:
        return err("Password must be at least 8 characters", 422)
    if request.form.get("password") != request.form.get("confirm_password"):
        return err("Passwords don't match", 422)
    if Seller.query.filter(or_(Seller.owner_email == email, Seller.owner_phone == phone)).first():
        return err("A seller with this email or mobile number is already registered", 409)

    state = f("owner_state_other") if f("owner_state") == "Other" else f("owner_state")
    docs = {}
    try:
        for key in ["fssai", "identity", "pan", "gst", "bank", "ownership"]:
            file = request.files.get(key)
            if file and file.filename:
                docs[key] = save_upload(file, key, "sellers")
    except UploadError as e:
        return err(str(e), 422)

    def num(k):
        try:
            return int(f(k))
        except ValueError:
            return None

    s = Seller(
        password_hash=generate_password_hash(request.form["password"]),
        owner_name=f("owner_name"), owner_email=email, owner_phone=phone,
        owner_dob=f("owner_dob"), owner_gender=f("owner_gender"),
        owner_id_type=f("owner_id_type"), owner_id_number=f("owner_id_number"),
        owner_address=f("owner_address"), owner_city=f("owner_city"),
        owner_state=state, owner_pin=f("owner_pin"),
        restaurant_name=f("restaurant_name"), business_type=f("business_type"),
        cuisine=f("cuisine"), restaurant_phone=clean_phone(f("restaurant_phone")),
        restaurant_email=f("restaurant_email").lower(), established=f("establishment"),
        opening_time=f("opening_time"), closing_time=f("closing_time"),
        price_for_two=num("price"), capacity=num("capacity"),
        restaurant_address=f("restaurant_address"), restaurant_city=f("restaurant_city"),
        restaurant_pin=f("restaurant_pin"), description=f("description"),
        documents_json=json.dumps(docs), emoji=CUISINE_EMOJI.get(f("cuisine"), "🍽️"),
        registration_id="FOODIE" + secrets.token_hex(4).upper(),
    )
    db.session.add(s)
    notify("seller", "Seller registration pending",
           f"{s.restaurant_name} ({s.owner_name}, {s.restaurant_city or s.owner_city}) is waiting for approval",
           "seller-reg", {"f": "Pending", "hl": s.restaurant_name})
    db.session.commit()
    return jsonify({"id": s.id, "registration_id": s.registration_id, "status": s.status}), 201


# -------------------------------------------------------------------- rider
@bp.post("/riders/register")
def register_rider():
    name, email = f("name"), f("email").lower()
    phone, city = clean_phone(f("phone")), f("city")
    password, vehicle = request.form.get("password", ""), f("vehicle")
    if len(name) < 2:
        return err("Enter your full name", 422)
    if not EMAIL_RE.match(email):
        return err("Enter a valid email address", 422)
    if not PHONE_RE.match(phone):
        return err("Enter a 10-digit mobile number", 422)
    if len(password) < 8:
        return err("Password must be at least 8 characters", 422)
    if password != request.form.get("confirm_password"):
        return err("Passwords don't match", 422)
    if vehicle not in ("Bike", "Scooter", "Cycle", "Van"):
        return err("Select a vehicle", 422)
    is_cycle = vehicle == "Cycle"
    lic, vno = f("licence_number").upper(), f("vehicle_number").upper()
    if not is_cycle and (len(lic) < 5 or len(vno) < 4):
        return err("Enter your licence number and vehicle number", 422)
    if Rider.query.filter(or_(Rider.email == email, Rider.phone == phone)).first():
        return err("This email or phone number is already registered", 409)
    aadhaar, photo, licence = (request.files.get(k) for k in ("aadhaar", "photo", "licence"))
    if not aadhaar or not photo or (not is_cycle and not licence):
        return err("Please upload all required documents", 422)
    try:
        a = save_upload(aadhaar, "aadhaar", "riders")
        p = save_upload(photo, "photo", "riders", images_only=True)
        l = save_upload(licence, "licence", "riders") if (licence and not is_cycle) else None
    except UploadError as e:
        return err(str(e), 422)
    r = Rider(name=name, email=email, phone=phone, city=city,
              password_hash=generate_password_hash(password), vehicle=vehicle,
              licence_number=None if is_cycle else lic, vehicle_number=None if is_cycle else vno,
              aadhaar_path=a, photo_path=p, licence_path=l)
    db.session.add(r)
    notify("rider", "New rider application", f"{name} ({vehicle}, {city or 'city n/a'}) applied to join",
           "rider-reg", {"f": "Pending", "hl": name})
    db.session.commit()
    return jsonify({"id": r.id, "status": r.status}), 201


# -------------------------------------------------------------------- login
@bp.post("/auth/login")
def login():
    d = request.get_json(silent=True) or {}
    role = d.get("role")
    ident = (d.get("identifier") or "").strip().lower()
    pw = d.get("password") or ""
    if role not in ("admin", "customer", "seller", "rider") or not ident or not pw:
        return err("Enter your login details", 422)
    digits = clean_phone(ident)
    if role == "admin":
        user = Admin.query.filter_by(email=ident).first()
    elif role == "customer":
        user = Customer.query.filter(or_(Customer.email == ident, db.func.lower(Customer.name) == ident)).first()
    elif role == "seller":
        user = Seller.query.filter(or_(Seller.owner_email == ident, Seller.owner_phone == digits)).first()
    else:
        user = Rider.query.filter(or_(Rider.email == ident, Rider.phone == digits)).first()
    if user is None or not check_password_hash(user.password_hash, pw):
        return err("Incorrect login details. Check and try again.", 401)
    if role == "customer" and user.status != "Active":
        return err("This account has been deactivated. Contact support.", 403)
    if role == "rider" and user.status != "Approved":
        # Only admin-approved riders may sign in (password is checked first, so this does not leak account existence)
        if user.status == "Rejected":
            reason = user.reject_reason or "not given"
            return err(f"Your rider application was rejected. Reason: {reason}", 403)
        return err("Your application is still pending admin approval. You can log in once it is approved.", 403)
    return jsonify({"token": make_token(role, user.id), "role": role, "user": public_user(role, user)})


def public_user(role, u):
    if role == "admin":
        return {"id": u.id, "name": u.name, "email": u.email}
    if role == "customer":
        return {"id": u.id, "name": u.name, "email": u.email, "phone": u.phone, "city": u.city}
    if role == "seller":
        return {"id": u.id, "name": u.owner_name, "restaurant": u.restaurant_name, "email": u.owner_email,
                "phone": u.owner_phone, "status": u.status, "reject_reason": u.reject_reason}
    return {"id": u.id, "name": u.name, "email": u.email, "phone": u.phone, "vehicle": u.vehicle,
            "vehicle_number": u.vehicle_number, "status": u.status, "reject_reason": u.reject_reason}
