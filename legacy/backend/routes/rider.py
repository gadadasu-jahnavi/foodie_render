import json
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from auth import err, require_role, clean_phone
from models import Order, Review, RiderPreference, db, iso, now

bp = Blueprint("rider", __name__, url_prefix="/api/rider")


def approved_only():
    if g.user.status != "Approved":
        return err("Your application is " + g.user.status.lower() + ". You can take deliveries after admin approval.", 403)


def prefs_for(rider_id):
    pref = RiderPreference.query.filter_by(rider_id=rider_id).first()
    if not pref:
        pref = RiderPreference(rider_id=rider_id, is_online=False, areas_json="[]")
        db.session.add(pref)
        db.session.commit()
    return pref


def job_json(o):
    return {"id": o.id, "code": f"#FO{o.id}", "status": o.status, "restaurant": o.seller.restaurant_name,
            "pickup": o.seller.restaurant_address, "city": o.seller.restaurant_city,
            "customer": o.customer.name, "phone": o.customer.phone, "address": o.address, "total": o.total,
            "items": [f"{i.qty} × {i.name}" for i in o.items], "created_at": iso(o.created_at), "delivered_at": iso(o.delivered_at),
            "km": o.km, "mins": o.mins, "pay": o.pay}


def rider_review_json(review):
    order = review.order
    return {"id": review.id, "customer": review.customer.name if review.customer else "Customer",
            "rating": review.rating, "comment": review.comment or "", "created_at": iso(review.created_at),
            "order": f"#FO{order.id}" if order else ""}


@bp.get("/me")
@require_role("rider")
def me():
    r = g.user
    done = Order.query.filter_by(rider_id=r.id, status="Delivered").all()
    pref = prefs_for(r.id)
    return jsonify({"id": r.id, "name": r.name, "email": r.email, "phone": r.phone,
                    "vehicle": r.vehicle, "vehicle_number": r.vehicle_number, "licence_number": r.licence_number,
                    "city": r.city, "status": r.status, "reject_reason": r.reject_reason,
                    "deliveries": len(done), "earnings": sum(o.pay or 0 for o in done),
                    "is_online": pref.is_online, "areas": json.loads(pref.areas_json or "[]")})


@bp.patch("/profile")
@require_role("rider")
def update_profile():
    r = g.user
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    phone = clean_phone(data.get("phone") or "")
    if name:
        if len(name) > 100:
            return err("Name must be 100 characters or fewer", 422)
        r.name = name
    if "phone" in data:
        if len(phone) != 10 or not phone.isdigit() or phone[0] not in "6789":
            return err("Enter a valid 10-digit Indian mobile number", 422)
        from models import Rider
        if Rider.query.filter(Rider.phone == phone, Rider.id != r.id).first():
            return err("That phone number is already used by another rider", 409)
        r.phone = phone
    for key, attr, limit in (("vehicle", "vehicle", 20), ("vehicle_number", "vehicle_number", 20), ("city", "city", 100)):
        if key in data:
            value = (data.get(key) or "").strip()
            if len(value) > limit:
                return err(f"{key.replace('_', ' ').title()} is too long", 422)
            setattr(r, attr, value)
    db.session.commit()
    return jsonify({"ok": True, "name": r.name, "phone": r.phone, "vehicle": r.vehicle,
                    "vehicle_number": r.vehicle_number, "city": r.city})


@bp.get("/preferences")
@require_role("rider")
def get_preferences():
    pref = prefs_for(g.user.id)
    return jsonify({"is_online": pref.is_online, "areas": json.loads(pref.areas_json or "[]")})


@bp.patch("/preferences")
@require_role("rider")
def update_preferences():
    pref = prefs_for(g.user.id)
    data = request.get_json(silent=True) or {}
    if "is_online" in data:
        if data["is_online"] and g.user.status != "Approved":
            return err("Your account must be approved before going online", 403)
        pref.is_online = bool(data["is_online"])
    if "areas" in data:
        areas = data["areas"]
        if not isinstance(areas, list) or len(areas) > 30 or any(not isinstance(x, str) or not x.strip() for x in areas):
            return err("Please provide a valid list of up to 30 delivery areas", 422)
        pref.areas_json = json.dumps(list(dict.fromkeys(x.strip()[:100] for x in areas)))
    db.session.commit()
    return jsonify({"is_online": pref.is_online, "areas": json.loads(pref.areas_json or "[]")})


@bp.get("/reviews")
@require_role("rider")
def reviews():
    rows = (Review.query.join(Order, Review.order_id == Order.id)
            .filter(Order.rider_id == g.user.id).order_by(Review.created_at.desc()).limit(20).all())
    values = [rider_review_json(x) for x in rows]
    average = round(sum(x["rating"] for x in values) / len(values), 1) if values else None
    return jsonify({"reviews": values, "average": average, "count": len(values)})


@bp.get("/available")
@require_role("rider")
def available():
    blocked = approved_only()
    if blocked:
        return blocked
    q = (Order.query.filter(Order.rider_id.is_(None), Order.status.in_(["Accepted", "Preparing"]))
         .order_by(Order.created_at))
    return jsonify([job_json(o) for o in q])


@bp.get("/orders")
@require_role("rider")
def mine():
    q = Order.query.filter_by(rider_id=g.user.id).order_by(Order.created_at.desc()).limit(100)
    return jsonify([job_json(o) for o in q])


@bp.post("/orders/<int:oid>/pickup")
@require_role("rider")
def pickup(oid):
    blocked = approved_only()
    if blocked:
        return blocked
    changed = (Order.query.filter(Order.id == oid, Order.rider_id.is_(None),
                                  Order.status.in_(["Accepted", "Preparing"]))
               .update({"rider_id": g.user.id, "status": "Out for Delivery"}, synchronize_session=False))
    db.session.commit()
    if not changed:
        return err("This order was already taken or is not ready", 409)
    return jsonify(job_json(db.session.get(Order, oid)))


@bp.post("/orders/<int:oid>/deliver")
@require_role("rider")
def deliver(oid):
    o = db.session.get(Order, oid)
    if not o or o.rider_id != g.user.id:
        return err("Order not found", 404)
    if o.status != "Out for Delivery":
        return err("This order is not out for delivery", 409)
    d = request.get_json(silent=True) or {}
    try:
        km = round(float(d.get("km")), 1)
        if not 0.1 <= km <= 100:
            raise ValueError
    except (TypeError, ValueError):
        km = round(1.5 + (o.id * 37 % 75) / 10, 1)
    created = o.created_at if o.created_at.tzinfo else o.created_at.replace(tzinfo=timezone.utc)
    o.status, o.delivered_at, o.km = "Delivered", now(), km
    o.mins = max(1, round((o.delivered_at - created).total_seconds() / 60))
    o.pay = 25 + round(km * 6)
    db.session.commit()
    return jsonify(job_json(o))
