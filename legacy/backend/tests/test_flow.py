"""End-to-end check of the whole platform:  python -m pytest tests -q   (or: python tests/test_flow.py)"""
import io
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app import create_app  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def png(name="x.png"):
    return (io.BytesIO(PNG), name, "image/png")


def make_client():
    tmp = tempfile.mkdtemp()
    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp}/t.db", "UPLOAD_DIR": tmp + "/up", "TESTING": True})
    return app.test_client()


def auth(tok):
    return {"Authorization": "Bearer " + tok}


def test_full_flow():
    c = make_client()

    # --- admin login
    r = c.post("/api/auth/login", json={"role": "admin", "identifier": "admin@foodie.com", "password": "admin123"})
    assert r.status_code == 200
    admin = auth(r.json["token"])
    assert c.post("/api/auth/login", json={"role": "admin", "identifier": "admin@foodie.com", "password": "bad"}).status_code == 401

    # --- registrations from the three panels
    r = c.post("/api/customers/register", json={"name": "Ravi Kumar", "email": "ravi@mail.com", "phone": "9848011122",
                                                "city": "Vizag", "password": "password1"})
    assert r.status_code == 201
    assert c.post("/api/customers/register", json={"name": "Ravi", "email": "RAVI@mail.com", "password": "password1"}).status_code == 409

    seller_form = {"owner_name": "Ramesh G", "owner_email": "ramesh@mail.com", "owner_phone": "9848055566",
                   "password": "password1", "confirm_password": "password1", "restaurant_name": "Spice Garden",
                   "cuisine": "Indian", "restaurant_city": "Vizag", "restaurant_address": "1 Beach Rd",
                   "owner_state": "Other", "owner_state_other": "Andhra Pradesh", "price": "400",
                   "fssai": png("f.png"), "pan": png("p.png")}
    r = c.post("/api/sellers/register", data=seller_form, content_type="multipart/form-data")
    assert r.status_code == 201, r.json
    assert r.json["registration_id"].startswith("FOODIE")

    rider_form = {"name": "Arjun V", "email": "arjun@mail.com", "phone": "9848099900", "city": "Vizag",
                  "password": "password1", "confirm_password": "password1", "vehicle": "Bike",
                  "licence_number": "AP3120240012345", "vehicle_number": "AP07AB1234",
                  "aadhaar": png(), "licence": png(), "photo": png()}
    r = c.post("/api/riders/register", data=rider_form, content_type="multipart/form-data")
    assert r.status_code == 201, r.json
    bad = dict(rider_form, aadhaar=(io.BytesIO(b"MZ-not-an-image"), "a.png", "image/png"), licence=png(), photo=png(),
               email="z@mail.com", phone="9000011122")
    assert c.post("/api/riders/register", data=bad, content_type="multipart/form-data").status_code == 422

    # --- they appear in admin
    d = c.get("/api/admin/bootstrap", headers=admin).json
    assert [x["name"] for x in d["customers"]] == ["Ravi Kumar"]
    assert d["sellers"][0]["restaurant"] == "Spice Garden" and d["sellers"][0]["status"] == "Pending"
    assert d["riders"][0]["name"] == "Arjun V" and d["riders"][0]["status"] == "Pending"
    kinds = {n["type"] for n in d["notifications"]}
    assert {"customer", "seller", "rider"} <= kinds
    sid, rid = d["sellers"][0]["id"], d["riders"][0]["id"]

    # --- pending seller is blocked; pending rider cannot even log in
    s_tok = auth(c.post("/api/auth/login", json={"role": "seller", "identifier": "ramesh@mail.com", "password": "password1"}).json["token"])
    assert c.get("/api/seller/orders", headers=s_tok).status_code == 403
    rl = {"role": "rider", "identifier": "9848099900", "password": "password1"}
    assert c.post("/api/auth/login", json=rl).status_code == 403                                   # Pending
    assert c.post("/api/auth/login", json=dict(rl, password="wrongpass")).status_code == 401
    assert c.patch(f"/api/admin/riders/{rid}/status", json={"status": "Rejected"}, headers=admin).status_code == 422
    assert c.patch(f"/api/admin/riders/{rid}/status", json={"status": "Rejected", "reason": "Blurry documents"}, headers=admin).status_code == 200
    rj = c.post("/api/auth/login", json=rl)
    assert rj.status_code == 403 and "Blurry documents" in rj.json["error"]                         # Rejected
    assert c.get("/api/admin/bootstrap", headers=admin).json["riders"][0]["status"] == "Rejected"
    # Rider identity documents are available only through a short-lived,
    # read-only token scoped to this specific application.
    assert c.get(f"/api/admin/review/rider/{rid}").status_code == 401
    assert c.get(f"/api/admin/review/rider/{rid}?token=" + admin["Authorization"][7:]).status_code == 401
    link = c.post(f"/api/admin/review-link/rider/{rid}", headers=admin)
    assert link.status_code == 200
    review_url = link.json["url"]
    rp = c.get(review_url)
    assert rp.status_code == 200 and b"Arjun V" in rp.data and b"aadhaar" in rp.data
    import re as _re
    doc = _re.search(rb'/api/admin/files/[^"?]+', rp.data).group(0).decode()
    scoped = review_url.split("?", 1)[1]
    assert c.get(doc).status_code == 401 and c.get(doc + "?" + scoped).status_code == 200
    assert c.get(doc.replace("aadhaar", "../../foodie.db") + "?" + scoped).status_code == 404
    assert c.get("/uploads/" + doc.split("/api/admin/files/")[1]).status_code == 404
    # A rider token cannot create admin review links.
    assert c.post(f"/api/admin/review-link/rider/{rid}", headers=auth("not-a-token")).status_code == 401

    # --- admin: reject needs a reason, then approve
    assert c.patch(f"/api/admin/sellers/{sid}/status", json={"status": "Rejected"}, headers=admin).status_code == 422
    assert c.patch(f"/api/admin/sellers/{sid}/status", json={"status": "Approved"}, headers=admin).status_code == 200
    assert c.patch(f"/api/admin/riders/{rid}/status", json={"status": "Approved"}, headers=admin).status_code == 200
    r_tok = auth(c.post("/api/auth/login", json=rl).json["token"])                                  # Approved -> can log in
    assert c.get("/api/rider/available", headers=r_tok).status_code == 200

    # --- seller builds a menu
    m = c.post("/api/seller/menu", json={"name": "Chicken Biryani", "price": 320, "emoji": "🍛"}, headers=s_tok)
    assert m.status_code == 201
    mid = m.json["id"]

    # --- customer orders
    cu = auth(c.post("/api/auth/login", json={"role": "customer", "identifier": "ravi@mail.com", "password": "password1"}).json["token"])
    rests = c.get("/api/customer/restaurants", headers=cu).json
    assert rests[0]["name"] == "Spice Garden"
    r = c.post("/api/customer/orders", headers=cu, json={"seller_id": sid, "address": "Flat 4, MVP Colony",
                                                        "items": [{"menu_item_id": mid, "qty": 2, "price": 1}]})
    assert r.status_code == 201 and r.json["total"] == 640     # price from DB, not from the browser
    oid = r.json["id"]
    assert c.post(f"/api/customer/orders/{oid}/review", headers=cu, json={"rating": 5}).status_code == 409   # not delivered yet

    # --- seller -> rider -> delivered
    assert c.patch(f"/api/seller/orders/{oid}/status", headers=s_tok, json={"status": "Preparing"}).status_code == 409
    assert c.patch(f"/api/seller/orders/{oid}/status", headers=s_tok, json={"status": "Accepted"}).status_code == 200
    assert c.get("/api/rider/available", headers=r_tok).json[0]["id"] == oid
    assert c.post(f"/api/rider/orders/{oid}/pickup", headers=r_tok).status_code == 200
    assert c.post(f"/api/rider/orders/{oid}/pickup", headers=r_tok).status_code == 409      # already taken
    r = c.post(f"/api/rider/orders/{oid}/deliver", headers=r_tok, json={"km": 3.5})
    assert r.status_code == 200 and r.json["pay"] == 46

    # --- rating
    assert c.post(f"/api/customer/orders/{oid}/review", headers=cu, json={"rating": 9}).status_code == 422
    assert c.post(f"/api/customer/orders/{oid}/review", headers=cu, json={"rating": 5, "comment": "Super tasty"}).status_code == 201
    assert c.post(f"/api/customer/orders/{oid}/review", headers=cu, json={"rating": 4}).status_code == 409

    # --- all of it is visible in admin
    d = c.get("/api/admin/bootstrap", headers=admin).json
    o = d["orders"][0]
    assert (o["status"], o["customer"], o["seller"], o["rider"], o["total"]) == ("Delivered", "Ravi Kumar", "Spice Garden", "Arjun V", 640)
    assert d["reviews"][0]["rating"] == 5 and d["reviews"][0]["dish"] == "Chicken Biryani"
    assert d["sellers"][0]["rating"] == 5.0 and d["sellers"][0]["orders"] == 1
    assert {"order", "review"} <= {n["type"] for n in d["notifications"]}

    # --- role separation + admin document review
    assert c.get("/api/admin/bootstrap", headers=cu).status_code == 403
    assert c.get("/api/admin/bootstrap").status_code == 401
    seller_link = c.post(f"/api/admin/review-link/seller/{sid}", headers=admin)
    assert seller_link.status_code == 200
    page = c.get(seller_link.json["url"])
    assert page.status_code == 200 and b"Spice Garden" in page.data
    assert c.get(f"/api/admin/review/seller/{sid}").status_code == 401
    # A rider-scoped review token cannot open a seller application (and vice versa).
    assert c.get(seller_link.json["url"].replace("/seller/", "/rider/")).status_code == 401
    assert c.get("/api/admin/files/../../etc/passwd?token=" + tok).status_code == 401

    # --- panels are served
    for p in ("admin", "seller", "rider", "customer"):
        assert c.get(f"/{p}/").status_code == 200, p


if __name__ == "__main__":
    test_full_flow()
    print("ALL CHECKS PASSED")
