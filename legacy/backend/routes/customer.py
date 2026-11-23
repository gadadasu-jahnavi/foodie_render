from flask import Blueprint, g, jsonify, request
from sqlalchemy import func

from auth import err, require_role
from models import MenuItem, Order, OrderItem, Review, Seller, db, iso, notify

bp = Blueprint("customer", __name__, url_prefix="/api/customer")


def rating_of(seller_id):
    avg, n = db.session.query(func.avg(Review.rating), func.count(Review.id)).filter_by(seller_id=seller_id).one()
    return (round(float(avg), 1) if avg else None), n


@bp.get("/restaurants")
@require_role("customer")
def restaurants():
    out = []
    for s in Seller.query.filter_by(status="Approved", active=True).order_by(Seller.restaurant_name):
        avg, n = rating_of(s.id)
        out.append({"id": s.id, "name": s.restaurant_name, "emoji": s.emoji, "cuisine": s.cuisine,
                    "city": s.restaurant_city, "rating": avg, "reviews": n,
                    "price_for_two": s.price_for_two, "opens": s.opening_time, "closes": s.closing_time})
    return jsonify(out)


@bp.get("/restaurants/<int:sid>/menu")
@require_role("customer")
def menu(sid):
    s = db.session.get(Seller, sid)
    if not s or s.status != "Approved":
        return err("Restaurant not found", 404)
    items = [{"id": m.id, "name": m.name, "emoji": m.emoji, "price": m.price}
             for m in s.menu if m.available]
    return jsonify({"restaurant": s.restaurant_name, "items": items})


def order_json(o):
    return {"id": o.id, "code": f"#FO{o.id}", "status": o.status, "total": o.total,
            "restaurant": o.seller.restaurant_name, "created_at": iso(o.created_at), "address": o.address,
            "items": [{"name": i.name, "emoji": i.emoji, "price": i.price, "qty": i.qty} for i in o.items],
            "rider": o.rider.name if o.rider else None,
            "review": {"rating": o.review.rating, "comment": o.review.comment} if o.review else None}


@bp.post("/orders")
@require_role("customer")
def place_order():
    d = request.get_json(silent=True) or {}
    sid, lines = d.get("seller_id"), d.get("items") or []
    address = (d.get("address") or "").strip()[:300]
    seller = db.session.get(Seller, sid) if sid else None
    if not seller or seller.status != "Approved" or not seller.active:
        return err("This restaurant is not available", 404)
    if not lines:
        return err("Your cart is empty", 422)
    if len(address) < 5:
        return err("Enter a delivery address", 422)
    order = Order(customer_id=g.user.id, seller_id=seller.id, address=address, total=0)
    total = 0
    for ln in lines:
        try:
            qty = int(ln.get("qty", 0))
        except (TypeError, ValueError):
            qty = 0
        m = db.session.get(MenuItem, ln.get("menu_item_id"))
        # price always comes from the database, never from the browser
        if not m or m.seller_id != seller.id or not m.available or not (1 <= qty <= 20):
            return err("One of the items in your cart is no longer available", 422)
        total += m.price * qty
        order.items.append(OrderItem(name=m.name, emoji=m.emoji, price=m.price, qty=qty))
    order.total = total
    db.session.add(order)
    db.session.flush()
    first = order.items[0]
    notify("order", f"New order #FO{order.id}", f"{first.name} · {g.user.name} · ₹{total}",
           "orders", {"q": f"#FO{order.id}"})
    db.session.commit()
    return jsonify(order_json(order)), 201


@bp.get("/orders")
@require_role("customer")
def my_orders():
    q = Order.query.filter_by(customer_id=g.user.id).order_by(Order.created_at.desc())
    return jsonify([order_json(o) for o in q])


@bp.post("/orders/<int:oid>/cancel")
@require_role("customer")
def cancel(oid):
    o = db.session.get(Order, oid)
    if not o or o.customer_id != g.user.id:
        return err("Order not found", 404)
    if o.status != "Pending":
        return err("Only orders the restaurant has not accepted yet can be cancelled", 409)
    o.status = "Cancelled"
    db.session.commit()
    return jsonify(order_json(o))


@bp.post("/orders/<int:oid>/review")
@require_role("customer")
def review(oid):
    d = request.get_json(silent=True) or {}
    o = db.session.get(Order, oid)
    if not o or o.customer_id != g.user.id:
        return err("Order not found", 404)
    if o.status != "Delivered":
        return err("You can rate an order after it has been delivered", 409)
    if o.review:
        return err("You have already rated this order", 409)
    try:
        rating = int(d.get("rating"))
    except (TypeError, ValueError):
        rating = 0
    if not 1 <= rating <= 5:
        return err("Choose a rating from 1 to 5 stars", 422)
    comment = (d.get("comment") or "").strip()[:500]
    r = Review(order_id=o.id, customer_id=g.user.id, seller_id=o.seller_id, rating=rating, comment=comment)
    db.session.add(r)
    dish = o.items[0].name
    notify("review", f"New {rating}★ review from {g.user.name}", f"\"{comment or 'No comment'}\" on {dish}",
           "reviews", {"hl": g.user.name})
    db.session.commit()
    return jsonify(order_json(o)), 201
