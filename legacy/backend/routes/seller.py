from flask import Blueprint, g, jsonify, request

from auth import err, require_role
from models import MenuItem, Order, db

bp = Blueprint("seller", __name__, url_prefix="/api/seller")

# what the restaurant is allowed to do next
NEXT = {"Pending": ["Accepted", "Cancelled"], "Accepted": ["Preparing", "Cancelled"], "Preparing": []}


def approved_only():
    if g.user.status != "Approved":
        return err("Your registration is " + g.user.status.lower() + ". You can use this after admin approval.", 403)


def order_json(o):
    from routes.customer import order_json as base
    d = base(o)
    d["customer"] = o.customer.name
    d["phone"] = o.customer.phone
    d["next"] = NEXT.get(o.status, [])
    return d


@bp.get("/me")
@require_role("seller")
def me():
    s = g.user
    return jsonify({"id": s.id, "restaurant": s.restaurant_name, "owner": s.owner_name, "status": s.status,
                    "reject_reason": s.reject_reason, "registration_id": s.registration_id})


@bp.get("/orders")
@require_role("seller")
def orders():
    blocked = approved_only()
    if blocked:
        return blocked
    q = Order.query.filter_by(seller_id=g.user.id).order_by(Order.created_at.desc()).limit(200)
    return jsonify([order_json(o) for o in q])


@bp.patch("/orders/<int:oid>/status")
@require_role("seller")
def set_status(oid):
    blocked = approved_only()
    if blocked:
        return blocked
    o = db.session.get(Order, oid)
    if not o or o.seller_id != g.user.id:
        return err("Order not found", 404)
    new = (request.get_json(silent=True) or {}).get("status")
    if new not in NEXT.get(o.status, []):
        return err(f"Cannot move an order from {o.status} to {new}", 409)
    o.status = new
    db.session.commit()
    return jsonify(order_json(o))


# ------------------------------------------------------------------ menu
def item_json(m):
    return {"id": m.id, "name": m.name, "emoji": m.emoji, "price": m.price, "available": m.available}


def read_item(d, partial=False):
    out = {}
    if "name" in d or not partial:
        name = (d.get("name") or "").strip()
        if not name:
            return None, "Enter a dish name"
        out["name"] = name[:120]
    if "price" in d or not partial:
        try:
            price = int(d.get("price"))
        except (TypeError, ValueError):
            price = 0
        if not 1 <= price <= 100000:
            return None, "Enter a valid price"
        out["price"] = price
    if "emoji" in d:
        out["emoji"] = (d.get("emoji") or "🍽️")[:8]
    if "available" in d:
        out["available"] = bool(d["available"])
    return out, None


@bp.get("/menu")
@require_role("seller")
def menu():
    return jsonify([item_json(m) for m in g.user.menu])


@bp.post("/menu")
@require_role("seller")
def add_item():
    blocked = approved_only()
    if blocked:
        return blocked
    data, e = read_item(request.get_json(silent=True) or {})
    if e:
        return err(e, 422)
    m = MenuItem(seller_id=g.user.id, **data)
    db.session.add(m)
    db.session.commit()
    return jsonify(item_json(m)), 201


@bp.patch("/menu/<int:mid>")
@require_role("seller")
def edit_item(mid):
    m = db.session.get(MenuItem, mid)
    if not m or m.seller_id != g.user.id:
        return err("Dish not found", 404)
    data, e = read_item(request.get_json(silent=True) or {}, partial=True)
    if e:
        return err(e, 422)
    for k, v in data.items():
        setattr(m, k, v)
    db.session.commit()
    return jsonify(item_json(m))


@bp.delete("/menu/<int:mid>")
@require_role("seller")
def delete_item(mid):
    m = db.session.get(MenuItem, mid)
    if not m or m.seller_id != g.user.id:
        return err("Dish not found", 404)
    db.session.delete(m)
    db.session.commit()
    return jsonify({"ok": True})
