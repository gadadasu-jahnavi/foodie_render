import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import jwt
from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from sqlalchemy import func
from markupsafe import escape
from werkzeug.security import check_password_hash, generate_password_hash

from auth import err, require_role
from models import (Admin, Customer, Notification, Offer, Order, Review, Rider, Seller, db, iso)

bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@bp.get("/bootstrap")
@require_role("admin")
def bootstrap():
    """Everything the admin panel needs in one call (the panel recomputes its dashboards from this)."""
    avg = dict(db.session.query(Review.seller_id, func.avg(Review.rating)).group_by(Review.seller_id).all())
    cnt = dict(db.session.query(Order.seller_id, func.count(Order.id)).group_by(Order.seller_id).all())

    customers = [{"id": c.id, "name": c.name, "email": c.email, "phone": c.phone, "city": c.city,
                  "status": c.status, "created_at": iso(c.created_at)}
                 for c in Customer.query.order_by(Customer.created_at.desc())]
    sellers = [{"id": s.id, "restaurant": s.restaurant_name, "owner": s.owner_name, "phone": s.owner_phone,
                "city": s.restaurant_city or s.owner_city or "", "status": s.status, "active": s.active,
                "reason": s.reject_reason, "cuisine": s.cuisine or "—", "emoji": s.emoji,
                "rating": round(float(avg[s.id]), 1) if s.id in avg else None, "orders": cnt.get(s.id, 0),
                "created_at": iso(s.created_at)} for s in Seller.query.order_by(Seller.created_at.desc())]
    riders = [{"id": r.id, "name": r.name, "vehicle": r.vehicle, "phone": r.phone, "city": r.city or "",
               "status": r.status, "active": r.active, "reason": r.reject_reason, "created_at": iso(r.created_at)}
              for r in Rider.query.order_by(Rider.created_at.desc())]
    orders = [{"id": o.id, "status": o.status, "total": o.total, "created_at": iso(o.created_at),
               "customer": o.customer.name, "seller": o.seller.restaurant_name,
               "rider": o.rider.name if o.rider else None, "rider_id": o.rider_id, "km": o.km, "mins": o.mins, "pay": o.pay,
               "items": [{"name": i.name, "emoji": i.emoji, "qty": i.qty, "price": i.price} for i in o.items]}
              for o in Order.query.order_by(Order.created_at.desc()).limit(5000)]
    reviews = [{"id": r.id, "customer": r.customer.name, "restaurant": r.seller.restaurant_name,
                "dish": r.order.items[0].name if r.order.items else "—", "rating": r.rating,
                "comment": r.comment, "created_at": iso(r.created_at)}
               for r in Review.query.order_by(Review.created_at.desc())]
    offers = [{"code": o.code, "description": o.description, "max": o.max_discount, "expiry": o.expiry,
               "status": o.status} for o in Offer.query.order_by(Offer.id.desc())]
    notes = [{"id": n.id, "type": n.type, "title": n.title, "text": n.text, "page": n.page,
              "params": json.loads(n.params_json or "{}"), "created_at": iso(n.created_at)}
             for n in Notification.query.order_by(Notification.created_at.desc()).limit(100)]
    me = g.user
    host = request.host.split(":")[0]
    port = request.host.split(":")[1] if ":" in request.host else ""
    if host in ("localhost", "127.0.0.1", "::1"):       # phones can't use "localhost" - give the network address
        from netutil import lan_ip
        host = lan_ip()
    base = f"http://{host}{':' + port if port else ''}"
    links = {"seller": f"{base}/seller/seller-registration.html", "rider": f"{base}/rider/index.html",
             "customer": f"{base}/customer/register.html"}
    return jsonify({"links": links, "admin": {"name": me.name, "email": me.email}, "customers": customers, "sellers": sellers,
                    "riders": riders, "orders": orders, "reviews": reviews, "offers": offers,
                    "notifications": notes})


def set_review_status(model, rid, label):
    obj = db.session.get(model, rid)
    if not obj:
        return err(f"{label} not found", 404)
    d = request.get_json(silent=True) or {}
    status = d.get("status")
    if status not in ("Approved", "Rejected", "Pending"):
        return err("Invalid status", 422)
    if status == "Rejected":
        reason = (d.get("reason") or "").strip()
        if len(reason) < 5:
            return err("Please give a reason (at least 5 characters)", 422)
        obj.reject_reason = reason[:300]
    else:
        obj.reject_reason = None
    obj.status = status
    db.session.commit()
    return jsonify({"id": obj.id, "status": obj.status})


@bp.patch("/sellers/<int:rid>/status")
@require_role("admin")
def seller_status(rid):
    return set_review_status(Seller, rid, "Seller")


@bp.patch("/riders/<int:rid>/status")
@require_role("admin")
def rider_status(rid):
    return set_review_status(Rider, rid, "Rider")


@bp.patch("/customers/<int:cid>/status")
@require_role("admin")
def customer_status(cid):
    c = db.session.get(Customer, cid)
    status = (request.get_json(silent=True) or {}).get("status")
    if not c or status not in ("Active", "Inactive"):
        return err("Invalid request", 422)
    c.status = status
    db.session.commit()
    return jsonify({"id": c.id, "status": c.status})


@bp.post("/offers")
@require_role("admin")
def create_offer():
    d = request.get_json(silent=True) or {}
    code = (d.get("code") or "").strip().upper()
    desc = (d.get("description") or "").strip()
    try:
        mx = int(d.get("max"))
        date.fromisoformat(d.get("expiry") or "")
    except (TypeError, ValueError):
        return err("Check the discount amount and expiry date", 422)
    if not code or not desc or mx < 1:
        return err("Fill in all offer fields", 422)
    if Offer.query.filter_by(code=code).first():
        return err(f"{code} already exists", 409)
    db.session.add(Offer(code=code, description=desc[:200], max_discount=mx, expiry=d["expiry"]))
    db.session.commit()
    return jsonify({"ok": True}), 201


@bp.post("/password")
@require_role("admin")
def change_password():
    d = request.get_json(silent=True) or {}
    if not check_password_hash(g.user.password_hash, d.get("current") or ""):
        return err("Current password is incorrect", 422)
    new = d.get("new") or ""
    if len(new) < 8:
        return err("New password must be at least 8 characters", 422)
    g.user.password_hash = generate_password_hash(new)
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------- document review
# Admins must explicitly request a short-lived, read-only link for one application.
def review_token_payload():
    token = request.args.get("token", "")
    try:
        payload = jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    if payload.get("role") != "admin" or payload.get("purpose") != "application_review":
        return None
    if payload.get("kind") not in ("rider", "seller"):
        return None
    return payload


@bp.post("/review-link/<kind>/<int:rid>")
@require_role("admin")
def create_review_link(kind, rid):
    if kind == "rider":
        obj = db.session.get(Rider, rid)
    elif kind == "seller":
        obj = db.session.get(Seller, rid)
    else:
        return err("Not found", 404)
    if not obj:
        return err("Application not found", 404)
    exp = datetime.now(timezone.utc) + timedelta(minutes=2)
    token = jwt.encode({"role": "admin", "sub": str(g.user.id), "purpose": "application_review",
                        "kind": kind, "rid": rid, "exp": exp},
                       current_app.config["SECRET_KEY"], algorithm="HS256")
    return jsonify({"url": f"/api/admin/review/{kind}/{rid}?token={token}"})


@bp.get("/files/<path:rel>")
def file(rel):
    payload = review_token_payload()
    if not payload:
        return err("A valid application review link is required", 401)
    if payload.get("kind") == "rider":
        obj = db.session.get(Rider, int(payload["rid"]))
        allowed = {obj.aadhaar_path, obj.licence_path, obj.photo_path} if obj else set()
    else:
        obj = db.session.get(Seller, int(payload["rid"]))
        allowed = set(obj.documents.values()) if obj else set()
    if rel not in allowed or not rel:
        return err("File not found", 404)
    root = Path(current_app.config["UPLOAD_DIR"]).resolve()
    target = (root / rel).resolve()
    if root not in target.parents or not target.is_file():
        return err("File not found", 404)
    response = send_from_directory(root, rel)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@bp.get("/review/<kind>/<int:rid>")
def review_page(kind, rid):
    payload = review_token_payload()
    if not payload or payload.get("kind") != kind or int(payload.get("rid", -1)) != rid:
        return "A valid application review link is required", 401
    t = escape(request.args.get("token", ""))
    rows, docs = [], {}
    if kind == "seller":
        s = db.session.get(Seller, rid)
        if not s:
            return "Not found", 404
        docs = s.documents
        rows = [("Restaurant", s.restaurant_name), ("Registration ID", s.registration_id), ("Owner", s.owner_name),
                ("Email", s.owner_email), ("Mobile", s.owner_phone), ("DOB", s.owner_dob),
                ("ID", f"{s.owner_id_type} {s.owner_id_number}"), ("Owner address", f"{s.owner_address}, {s.owner_city}, {s.owner_state} {s.owner_pin}"),
                ("Business", f"{s.business_type} · {s.cuisine}"), ("Hours", f"{s.opening_time} – {s.closing_time}"),
                ("Restaurant address", f"{s.restaurant_address}, {s.restaurant_city} {s.restaurant_pin}"),
                ("Avg price for two", s.price_for_two), ("Seating", s.capacity), ("About", s.description),
                ("Status", s.status)]
    elif kind == "rider":
        r = db.session.get(Rider, rid)
        if not r:
            return "Not found", 404
        docs = {"aadhaar": r.aadhaar_path, "licence": r.licence_path, "photo": r.photo_path}
        rows = [("Name", r.name), ("Email", r.email), ("Phone", r.phone), ("City", r.city),
                ("Vehicle", f"{r.vehicle} {r.vehicle_number or ''}"), ("Licence no.", r.licence_number or "—"),
                ("Status", r.status)]
    else:
        return "Not found", 404
    body = "".join(f"<tr><th>{escape(k)}</th><td>{escape(v if v not in (None, '') else '—')}</td></tr>" for k, v in rows)
    cards = []
    for label, rel in docs.items():
        if not rel:
            continue
        url = f"/api/admin/files/{escape(rel)}?token={t}"
        suffix = Path(rel).suffix.lower()
        preview = (f'<img src="{url}" alt="{escape(label)} document" loading="lazy">'
                   if suffix in (".jpg", ".jpeg", ".png") else
                   '<div class="pdf-icon">PDF</div>')
        cards.append(f'<article class="doc"><h3>{escape(label.title())}</h3>{preview}'
                     f'<a href="{url}" target="_blank" rel="noopener">Open / view document</a></article>')
    docs_html = "".join(cards) or '<p class="muted">No documents uploaded</p>'
    return (f"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{kind.title()} registration review · Foodie</title><style>"
            f"body{{font-family:system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 18px;color:#30231e;background:#fffaf5}}"
            f"h1{{color:#e87518}}table{{border-collapse:collapse;width:100%;background:white;border-radius:12px;overflow:hidden}}"
            f"th,td{{text-align:left;padding:11px 14px;border-bottom:1px solid #f0e5dc;vertical-align:top}}"
            f"th{{width:34%;color:#75665e}}.docs{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px}}"
            f".doc{{background:white;border:1px solid #efdfd3;border-radius:12px;padding:14px;min-width:0}}"
            f".doc h3{{margin:0 0 10px;font-size:15px;text-transform:capitalize}}.doc img{{display:block;width:100%;height:220px;object-fit:contain;background:#f7f2ed;border-radius:8px}}"
            f".pdf-icon{{height:150px;display:grid;place-items:center;background:#f7f2ed;border-radius:8px;color:#e87518;font-weight:800;font-size:28px}}"
            f"a{{display:inline-block;margin-top:10px;color:#c95b12;font-weight:650}}.muted{{color:#75665e}}</style>"
            f"<h1>Foodie · {kind.title()} registration</h1><h2>Applicant details</h2><table>{body}</table>"
            f"<h2>Uploaded documents</h2><section class=docs>{docs_html}</section></html>")
