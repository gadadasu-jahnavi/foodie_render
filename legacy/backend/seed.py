"""Optional demo data so every admin page has something to show.

    python seed.py            # adds demo customers / sellers / riders / menus / orders / reviews
    python seed.py --reset    # wipes the database first

Demo logins (password for all: password123)
    customer  ravi@mail.com        seller  spicegarden@mail.com
    rider     arjun@mail.com       admin   admin@foodie.com / admin123
"""
import random
import sys
from datetime import timedelta

from werkzeug.security import generate_password_hash

from app import create_app
from models import (Customer, MenuItem, Offer, Order, OrderItem, Review, Rider, Seller, db, now)

PW = generate_password_hash("password123")
random.seed(7)

CUSTOMERS = [("Ravi Kumar", "ravi@mail.com", "9848011122", "Vijayawada"), ("Anita Rao", "anita@mail.com", "9849022233", "Guntur"),
             ("Divya S", "divya@mail.com", "9123444455", "Vizag"), ("Kiran M", "kiran@mail.com", "9000555566", "Vizag")]
SELLERS = [("Spice Garden", "Ramesh G", "spicegarden@mail.com", "9848055566", "Vijayawada", "Indian", "🍛",
            [("Chicken Biryani", "🍛", 320), ("Paneer Tikka", "🍢", 260), ("Gulab Jamun", "🍮", 90)]),
           ("Pizza Hub", "Mohan R", "pizzahub@mail.com", "9849066677", "Guntur", "Italian", "🍕",
            [("Veg Pizza", "🍕", 410), ("Margherita Pizza", "🍕", 360), ("Garlic Bread", "🥖", 140)]),
           ("Burger Point", "Imran S", "burgerpoint@mail.com", "9123488899", "Vizag", "Fast Food", "🍔",
            [("Burger Combo", "🍔", 280), ("Veg Burger", "🍔", 180), ("Chicken 65", "🍗", 240)])]
RIDERS = [("Arjun V", "arjun@mail.com", "9848099900", "Vijayawada", "Bike"), ("Prasad N", "prasad@mail.com", "9849000011", "Guntur", "Scooter")]
COMMENTS = ["Super tasty and arrived hot!", "Great taste, slightly late delivery.", "Best in town.", "Good, but could use more spice."]


def main():
    app = create_app()
    with app.app_context():
        if "--reset" in sys.argv:
            db.drop_all(); db.create_all()
            from models import Admin
            db.session.add(Admin(name="Admin", email=app.config["ADMIN_EMAIL"],
                                 password_hash=generate_password_hash(app.config["ADMIN_PASSWORD"])))
            db.session.commit()
        if Customer.query.first():
            print("Database already has data. Use --reset to start over."); return
        custs = [Customer(name=n, email=e, phone=p, city=c, password_hash=PW) for n, e, p, c in CUSTOMERS]
        sellers = []
        for i, (rn, on, em, ph, city, cu, emo, menu) in enumerate(SELLERS):
            s = Seller(password_hash=PW, owner_name=on, owner_email=em, owner_phone=ph, owner_city=city, restaurant_name=rn,
                       cuisine=cu, restaurant_city=city, restaurant_address=f"{10 + i} Main Road, {city}", emoji=emo,
                       price_for_two=400, opening_time="10:00", closing_time="22:30", registration_id=f"FOODIEDEMO{i}",
                       status="Approved", created_at=now() - timedelta(days=90 - i * 10))
            s.menu = [MenuItem(name=n, emoji=e, price=pr) for n, e, pr in menu]
            sellers.append(s)
        sellers.append(Seller(password_hash=PW, owner_name="Farhan A", owner_email="tastybites@mail.com", owner_phone="9000512121",
                              owner_city="Guntur", restaurant_name="Tasty Bites", cuisine="Multi Cuisine", restaurant_city="Guntur",
                              registration_id="FOODIEDEMO9", status="Pending"))
        riders = [Rider(name=n, email=e, phone=p, city=c, vehicle=v, vehicle_number="AP07AB10%02d" % i, licence_number="AP312024%05d" % i,
                        password_hash=PW, status="Approved", created_at=now() - timedelta(days=80)) for i, (n, e, p, c, v) in enumerate(RIDERS)]
        riders.append(Rider(name="Venkat R", email="venkat@mail.com", phone="9000111122", city="Vizag", vehicle="Bike",
                            vehicle_number="AP31XY0001", licence_number="AP3120240099", password_hash=PW, status="Pending"))
        db.session.add_all(custs + sellers + riders)
        db.session.flush()
        live = [s for s in sellers if s.status == "Approved"]
        for day in range(45, -1, -1):
            for _ in range(random.randint(2, 6)):
                s = random.choice(live); c = random.choice(custs); r = random.choice(riders[:2])
                ts = (now() - timedelta(days=day)).replace(hour=random.choice([12, 13, 14, 19, 20, 21]), minute=random.randint(0, 59))
                o = Order(customer_id=c.id, seller_id=s.id, address=f"Flat {random.randint(1, 40)}, {c.city}", total=0, created_at=ts)
                for m in random.sample(s.menu, random.randint(1, 2)):
                    q = random.randint(1, 2); o.items.append(OrderItem(name=m.name, emoji=m.emoji, price=m.price, qty=q)); o.total += m.price * q
                if random.random() < 0.06:
                    o.status = "Cancelled"
                elif day > 0:
                    km = round(random.uniform(1.5, 9), 1)
                    o.status, o.rider_id, o.km = "Delivered", r.id, km
                    o.mins, o.pay, o.delivered_at = round(14 + km * 3), 25 + round(km * 6), ts + timedelta(minutes=round(14 + km * 3))
                else:
                    o.status = random.choice(["Pending", "Accepted", "Preparing"])
                db.session.add(o); db.session.flush()
                if o.status == "Delivered" and random.random() < 0.5:
                    db.session.add(Review(order_id=o.id, customer_id=c.id, seller_id=s.id, rating=random.choice([3, 4, 4, 5, 5]),
                                          comment=random.choice(COMMENTS), created_at=o.delivered_at))
        db.session.add_all([Offer(code="WELCOME50", description="50% off first order", max_discount=100, expiry="2026-12-31"),
                            Offer(code="FREEDEL", description="Free delivery above ₹299", max_discount=40, expiry="2026-11-30")])
        db.session.commit()
        print("Demo data added. All demo accounts use the password: password123")


if __name__ == "__main__":
    main()
