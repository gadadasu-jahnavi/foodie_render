import json
from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    """Always send UTC with a Z so browsers parse it correctly."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Admin(db.Model):
    __tablename__ = "admins"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), default="Admin")
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)


class Customer(db.Model):
    __tablename__ = "customers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(15), default="")
    city = db.Column(db.String(100), default="")
    password_hash = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(10), default="Active")       # Active / Inactive
    created_at = db.Column(db.DateTime(timezone=True), default=now)


class Seller(db.Model):
    """One row = one owner + their restaurant (matches the 3-step seller form)."""
    __tablename__ = "sellers"
    id = db.Column(db.Integer, primary_key=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # --- owner ---
    owner_name = db.Column(db.String(100), nullable=False)
    owner_email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    owner_phone = db.Column(db.String(15), unique=True, nullable=False, index=True)
    owner_dob = db.Column(db.String(10))
    owner_gender = db.Column(db.String(20))
    owner_id_type = db.Column(db.String(30))
    owner_id_number = db.Column(db.String(50))
    owner_address = db.Column(db.Text)
    owner_city = db.Column(db.String(100))
    owner_state = db.Column(db.String(100))
    owner_pin = db.Column(db.String(10))
    # --- restaurant ---
    restaurant_name = db.Column(db.String(150), nullable=False)
    business_type = db.Column(db.String(60))
    cuisine = db.Column(db.String(60))
    restaurant_phone = db.Column(db.String(15))
    restaurant_email = db.Column(db.String(255))
    established = db.Column(db.String(10))
    opening_time = db.Column(db.String(10))
    closing_time = db.Column(db.String(10))
    price_for_two = db.Column(db.Integer)
    capacity = db.Column(db.Integer)
    restaurant_address = db.Column(db.Text)
    restaurant_city = db.Column(db.String(100))
    restaurant_pin = db.Column(db.String(10))
    description = db.Column(db.Text)
    emoji = db.Column(db.String(8), default="🍽️")
    # --- documents (paths on disk) ---
    documents_json = db.Column(db.Text, default="{}")
    # --- admin review ---
    status = db.Column(db.String(10), default="Pending", index=True)  # Pending/Approved/Rejected
    reject_reason = db.Column(db.String(300))
    active = db.Column(db.Boolean, default=True)
    registration_id = db.Column(db.String(20), unique=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now)

    menu = db.relationship("MenuItem", backref="seller", cascade="all, delete-orphan")

    @property
    def documents(self):
        return json.loads(self.documents_json or "{}")


class Rider(db.Model):
    __tablename__ = "riders"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(10), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    vehicle = db.Column(db.String(20), nullable=False)
    licence_number = db.Column(db.String(50))
    vehicle_number = db.Column(db.String(20))
    city = db.Column(db.String(100), default="")
    aadhaar_path = db.Column(db.String(500))
    licence_path = db.Column(db.String(500))
    photo_path = db.Column(db.String(500))
    status = db.Column(db.String(10), default="Pending", index=True)
    reject_reason = db.Column(db.String(300))
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=now)


class MenuItem(db.Model):
    __tablename__ = "menu_items"
    id = db.Column(db.Integer, primary_key=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("sellers.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    emoji = db.Column(db.String(8), default="🍽️")
    price = db.Column(db.Integer, nullable=False)
    available = db.Column(db.Boolean, default=True)


ORDER_STATUSES = ["Pending", "Accepted", "Preparing", "Out for Delivery", "Delivered", "Cancelled"]


class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False, index=True)
    seller_id = db.Column(db.Integer, db.ForeignKey("sellers.id"), nullable=False, index=True)
    rider_id = db.Column(db.Integer, db.ForeignKey("riders.id"), nullable=True, index=True)
    status = db.Column(db.String(20), default="Pending", index=True)
    total = db.Column(db.Integer, nullable=False)
    address = db.Column(db.String(300), default="")
    km = db.Column(db.Float)
    mins = db.Column(db.Integer)
    pay = db.Column(db.Integer)                      # rider earning
    created_at = db.Column(db.DateTime(timezone=True), default=now, index=True)
    delivered_at = db.Column(db.DateTime(timezone=True))

    customer = db.relationship("Customer")
    seller = db.relationship("Seller")
    rider = db.relationship("Rider")
    items = db.relationship("OrderItem", backref="order", cascade="all, delete-orphan")
    review = db.relationship("Review", backref="order", uselist=False)


class OrderItem(db.Model):
    __tablename__ = "order_items"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    emoji = db.Column(db.String(8), default="🍽️")
    price = db.Column(db.Integer, nullable=False)
    qty = db.Column(db.Integer, nullable=False)


class Review(db.Model):
    __tablename__ = "reviews"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    seller_id = db.Column(db.Integer, db.ForeignKey("sellers.id"), nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)           # 1..5
    comment = db.Column(db.String(500), default="")
    created_at = db.Column(db.DateTime(timezone=True), default=now)

    customer = db.relationship("Customer")
    seller = db.relationship("Seller")


class RiderPreference(db.Model):
    __tablename__ = "rider_preferences"
    id = db.Column(db.Integer, primary_key=True)
    rider_id = db.Column(db.Integer, db.ForeignKey("riders.id"), unique=True, nullable=False, index=True)
    is_online = db.Column(db.Boolean, default=False, nullable=False)
    areas_json = db.Column(db.Text, default="[]", nullable=False)
    rider = db.relationship("Rider")


class Offer(db.Model):
    __tablename__ = "offers"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    description = db.Column(db.String(200), nullable=False)
    max_discount = db.Column(db.Integer, nullable=False)
    expiry = db.Column(db.String(10), nullable=False)        # YYYY-MM-DD
    status = db.Column(db.String(10), default="Active")


class Notification(db.Model):
    """Events shown in the admin bell: new registrations, orders, reviews."""
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(12), nullable=False)          # order/seller/rider/review/customer/offer
    title = db.Column(db.String(200), nullable=False)
    text = db.Column(db.String(300), default="")
    page = db.Column(db.String(30), default="dashboard")
    params_json = db.Column(db.Text, default="{}")
    created_at = db.Column(db.DateTime(timezone=True), default=now, index=True)


def notify(type_, title, text, page, params=None):
    db.session.add(Notification(type=type_, title=title, text=text, page=page,
                                params_json=json.dumps(params or {})))
