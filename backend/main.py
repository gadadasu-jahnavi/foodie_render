import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, Header, WebSocket, WebSocketDisconnect, Depends, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
    print("WARNING: Supabase env vars are not configured. Add them in Render before using API.")

supabase: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None
auth_client: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_ANON_KEY) if SUPABASE_URL and SUPABASE_ANON_KEY else None

app = FastAPI(title="Foodie API", version="2.1.0", docs_url="/api/docs")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

def db():
    if not supabase:
        raise HTTPException(503, "Supabase is not configured. Set environment variables.")
    return supabase

def get_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in to continue")
    token = authorization.split(" ", 1)[1]
    try:
        user = auth_client.auth.get_user(token).user
        if not user:
            raise Exception("Invalid session")
        rows = db().table("profiles").select("*").eq("id", user.id).limit(1).execute().data
        if not rows:
            raise HTTPException(403, "Profile is missing")
        return {"auth": user, "profile": rows[0], "token": token}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Session expired. Please sign in again.")

def role_user(user=Depends(get_user)):
    return user

def require(*roles):
    def guard(user=Depends(get_user)):
        if user["profile"]["role"] not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return guard

class Register(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    phone: str = ""
    city: str = ""
    restaurant_name: str = ""

class Login(BaseModel):
    email: str
    password: str
    portal: Optional[str] = None

class Item(BaseModel):
    name: str
    description: str = ""
    price: float
    category: str = "Main"
    image_url: str = ""
    available: bool = True

class ItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    available: Optional[bool] = None

class OrderCreate(BaseModel):
    seller_id: str
    items: list[dict]
    address: str

class StatusUpdate(BaseModel):
    status: str

class OfferCreate(BaseModel):
    code: str
    description: str
    discount_percent: int
    expires_at: Optional[str] = None

class AssignRider(BaseModel):
    rider_id: str

class Base64Upload(BaseModel):
    data: str
    filename: Optional[str] = None

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "foodie-api", "supabase_configured": bool(supabase)}

@app.get("/api/locations")
def get_locations():
    """Returns available restaurant locations for rider registration."""
    try:
        data = db().table("restaurants").select("city").execute().data
        cities = {r["city"].strip() for r in data if r.get("city") and r.get("city").strip()}
        sellers = db().table("profiles").select("city").eq("role", "seller").execute().data
        for s in sellers:
            if s.get("city") and s.get("city").strip():
                cities.add(s["city"].strip())
    except Exception:
        cities = set()
    
    fallback = ["Bengaluru", "Mumbai", "Delhi NCR", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Chandigarh"]
    result = sorted(list(cities)) if cities else fallback
    return {"locations": result}

@app.post("/api/auth/register")
def register(payload: Register):
    if payload.role not in ("buyer", "seller", "rider"):
        raise HTTPException(400, "Choose a valid user role")
    if len(payload.password) < 8:
        raise HTTPException(422, "Password must contain at least 8 characters")
    try:
        result = auth_client.auth.sign_up({
            "email": str(payload.email),
            "password": payload.password,
            "options": {"data": {"name": payload.name, "role": payload.role}}
        })
        au = result.user
        if not au:
            raise HTTPException(400, "Could not create account")
        profile = {
            "id": au.id,
            "name": payload.name,
            "email": str(payload.email),
            "role": payload.role,
            "phone": payload.phone,
            "city": payload.city
        }
        db().table("profiles").upsert(profile).execute()
        if payload.role == "seller":
            db().table("restaurants").insert({
                "owner_id": au.id,
                "name": payload.restaurant_name or payload.name + "'s Kitchen",
                "city": payload.city,
                "status": "pending"
            }).execute()
        return {"message": "Account created. Verify your email if confirmation is enabled, then sign in."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/api/auth/login")
def login(payload: Login):
    if not auth_client:
        raise HTTPException(503, "Supabase Auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.")
    if not payload.email or not payload.password:
        raise HTTPException(400, "Email and password are required")
    email = payload.email.strip().lower()
    if payload.portal and payload.portal not in ("admin", "buyer", "seller", "rider"):
        raise HTTPException(400, "Invalid portal. Choose admin, buyer, seller or rider.")
    try:
        result = auth_client.auth.sign_in_with_password({"email": email, "password": payload.password})
        au = result.user
        if not au:
            raise HTTPException(401, "Invalid email or password")
        rows = db().table("profiles").select("*").eq("id", au.id).limit(1).execute().data
        if not rows:
            raise HTTPException(403, "Profile not found")
        profile = rows[0]
        if payload.portal == "admin" and profile["role"] != "admin":
            raise HTTPException(403, "This account is not an administrator. Promote it to admin in Supabase SQL Editor (see README).")
        if payload.portal and payload.portal != "admin" and profile["role"] != payload.portal:
            raise HTTPException(403, f"This account has the '{profile['role']}' role. Please use the matching portal.")
        if not result.session:
            raise HTTPException(401, "Sign-in did not return a session. Check whether email confirmation is required in Supabase.")
        return {"access_token": result.session.access_token, "refresh_token": result.session.refresh_token, "user": profile}
    except HTTPException:
        raise
    except Exception as e:
        message = str(e).strip() or "Unable to sign in. Check your credentials."
        raise HTTPException(401, message[:300])

@app.post("/api/auth/logout")
def logout(user=Depends(get_user)):
    try:
        auth_client.auth.sign_out()
    except Exception:
        pass
    return {"ok": True}

@app.get("/api/me")
def me(user=Depends(get_user)):
    return user["profile"]

@app.get("/api/restaurants")
def restaurants():
    rows = db().table("restaurants").select("*").eq("status", "approved").execute().data
    for row in rows:
        row["menu_items"] = db().table("menu_items").select("*").eq("seller_id", row["owner_id"]).eq("available", True).execute().data
    return rows

@app.get("/api/menu")
def menu(seller_id: Optional[str] = None):
    q = db().table("menu_items").select("*")
    if seller_id:
        q = q.eq("seller_id", seller_id)
    return q.execute().data

@app.post("/api/upload")
async def upload_image(file: Optional[UploadFile] = File(None), user=Depends(get_user)):
    """Uploads a photo for menu items or restaurant profile."""
    if not file or not file.filename:
        raise HTTPException(400, "No image file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]:
        ext = ".jpg"
    filename = f"menu-{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image file too large (maximum 10MB)")
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{filename}"}

@app.post("/api/upload-base64")
async def upload_base64_image(payload: Base64Upload, user=Depends(get_user)):
    """Uploads a base64 encoded photo."""
    if not payload.data:
        raise HTTPException(400, "Empty image data")
    import base64
    raw = payload.data
    ext = ".jpg"
    if raw.startswith("data:"):
        header, b64content = raw.split(",", 1)
        if "png" in header: ext = ".png"
        elif "webp" in header: ext = ".webp"
        elif "gif" in header: ext = ".gif"
    else:
        b64content = raw
    try:
        content = base64.b64decode(b64content)
    except Exception:
        raise HTTPException(400, "Invalid base64 payload")
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Image exceeds 10MB limit")
    filename = f"menu-{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOADS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{filename}"}

@app.post("/api/menu")
def add_menu_item(item: Item, user=Depends(require("seller"))):
    restaurant = db().table("restaurants").select("id,status").eq("owner_id", user["auth"].id).limit(1).execute().data
    if not restaurant:
        raise HTTPException(404, "Create a restaurant profile first")
    if restaurant[0]["status"] != "approved":
        raise HTTPException(403, "Your restaurant must be approved before publishing menu items")
    data = item.model_dump()
    data["seller_id"] = user["auth"].id
    return db().table("menu_items").insert(data).execute().data[0]

@app.patch("/api/menu/{item_id}")
def update_menu_item(item_id: str, item: ItemUpdate, user=Depends(require("seller"))):
    data = {k: v for k, v in item.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "No fields provided to update")
    res = db().table("menu_items").update(data).eq("id", item_id).eq("seller_id", user["auth"].id).execute().data
    return res

@app.delete("/api/menu/{item_id}")
def delete_menu_item(item_id: str, user=Depends(require("seller"))):
    db().table("menu_items").delete().eq("id", item_id).eq("seller_id", user["auth"].id).execute()
    return {"ok": True}

def enrich_orders(orders_list: list):
    """Enriches order objects with restaurant, buyer, and rider details."""
    if not orders_list:
        return []
    seller_ids = list({o["seller_id"] for o in orders_list if o.get("seller_id")})
    buyer_ids = list({o["buyer_id"] for o in orders_list if o.get("buyer_id")})
    rider_ids = list({o["rider_id"] for o in orders_list if o.get("rider_id")})

    restaurants_by_owner = {}
    if seller_ids:
        rests = db().table("restaurants").select("owner_id, name, city").in_("owner_id", seller_ids).execute().data
        for r in rests:
            restaurants_by_owner[r["owner_id"]] = r

    profiles_by_id = {}
    all_prof_ids = list(set(seller_ids + buyer_ids + rider_ids))
    if all_prof_ids:
        profs = db().table("profiles").select("id, name, email, phone, city, role").in_("id", all_prof_ids).execute().data
        for p in profs:
            profiles_by_id[p["id"]] = p

    for o in orders_list:
        sid = o.get("seller_id")
        bid = o.get("buyer_id")
        rid = o.get("rider_id")

        rest = restaurants_by_owner.get(sid) or {}
        seller_prof = profiles_by_id.get(sid) or {}
        buyer_prof = profiles_by_id.get(bid) or {}
        rider_prof = profiles_by_id.get(rid) or {}

        o["restaurant_name"] = rest.get("name") or seller_prof.get("name") or "Kitchen"
        o["restaurant_city"] = rest.get("city") or seller_prof.get("city") or ""
        o["buyer_name"] = buyer_prof.get("name") or "Customer"
        o["buyer_phone"] = buyer_prof.get("phone") or ""
        o["buyer_city"] = buyer_prof.get("city") or ""
        o["rider_name"] = rider_prof.get("name") or ""
        o["rider_phone"] = rider_prof.get("phone") or ""
        o["rider_city"] = rider_prof.get("city") or ""

    return orders_list

@app.post("/api/orders")
async def create_order(order: OrderCreate, user=Depends(require("buyer"))):
    if not order.items:
        raise HTTPException(422, "Add at least one item")
    rows = db().table("menu_items").select("*").in_("id", [str(i.get("id")) for i in order.items]).execute().data
    byid = {r["id"]: r for r in rows}
    total = 0
    lines = []
    for line in order.items:
        item = byid.get(str(line.get("id")))
        qty = int(line.get("quantity", 1))
        if not item or item["seller_id"] != order.seller_id or qty < 1:
            raise HTTPException(422, "Invalid order item")
        total += float(item["price"]) * qty
        lines.append({"menu_item_id": item["id"], "name": item["name"], "quantity": qty, "unit_price": item["price"]})

    # Find the restaurant location (city)
    rest_data = db().table("restaurants").select("name, city").eq("owner_id", order.seller_id).limit(1).execute().data
    rest_city = (rest_data[0].get("city") or "").strip() if rest_data else ""
    if not rest_city:
        seller_prof = db().table("profiles").select("city").eq("id", order.seller_id).limit(1).execute().data
        rest_city = (seller_prof[0].get("city") or "").strip() if seller_prof else ""

    # Auto-allocation rule:
    # Look for registered riders in the same city who are free (0 active orders).
    # If not available in the same city, rider_id remains None (for admin allocation).
    auto_assigned_rider_id = None
    rider_name = None
    if rest_city:
        riders = db().table("profiles").select("id, name, city").eq("role", "rider").execute().data
        city_riders = [r for r in riders if r.get("city") and r.get("city").strip().lower() == rest_city.lower()]
        if city_riders:
            rider_ids = [r["id"] for r in city_riders]
            active_orders = db().table("orders").select("rider_id").in_("rider_id", rider_ids).not_.in_("status", ["delivered", "cancelled"]).execute().data
            busy_counts = {}
            for ao in active_orders:
                rid = ao.get("rider_id")
                if rid:
                    busy_counts[rid] = busy_counts.get(rid, 0) + 1

            free_riders = [r for r in city_riders if busy_counts.get(r["id"], 0) == 0]
            if free_riders:
                auto_assigned_rider_id = free_riders[0]["id"]
                rider_name = free_riders[0]["name"]

    inserted = db().table("orders").insert({
        "buyer_id": user["auth"].id,
        "seller_id": order.seller_id,
        "address": order.address,
        "total": total,
        "status": "placed",
        "rider_id": auto_assigned_rider_id
    }).execute().data[0]

    for line in lines:
        line["order_id"] = inserted["id"]
    db().table("order_items").insert(lines).execute()

    await hub.broadcast({
        "type": "order_created",
        "order_id": inserted["id"],
        "status": "placed",
        "rider_id": auto_assigned_rider_id,
        "rider_name": rider_name,
        "auto_allocated": bool(auto_assigned_rider_id),
        "city": rest_city
    })
    inserted["auto_allocated"] = bool(auto_assigned_rider_id)
    inserted["rider_name"] = rider_name
    return inserted

@app.get("/api/orders")
def orders(user=Depends(get_user)):
    role = user["profile"]["role"]
    uid = user["auth"].id
    q = db().table("orders").select("*, order_items(*)").order("created_at", desc=True)
    if role == "buyer":
        q = q.eq("buyer_id", uid)
    elif role == "seller":
        q = q.eq("seller_id", uid)
    elif role == "rider":
        q = q.eq("rider_id", uid)
    elif role != "admin":
        raise HTTPException(403, "Not allowed")
    rows = q.execute().data
    return enrich_orders(rows)

@app.patch("/api/orders/{order_id}/status")
async def update_order(order_id: str, payload: StatusUpdate, user=Depends(get_user)):
    role = user["profile"]["role"]
    uid = user["auth"].id
    allowed = {
        "buyer": [],
        "seller": ["accepted", "preparing", "ready", "cancelled"],
        "rider": ["picked_up", "delivered"],
        "admin": ["placed", "accepted", "preparing", "ready", "picked_up", "delivered", "cancelled"]
    }
    if payload.status not in allowed.get(role, []):
        raise HTTPException(403, "This role cannot set that order status")
    q = db().table("orders").update({"status": payload.status}).eq("id", order_id)
    if role == "seller":
        q = q.eq("seller_id", uid)
    if role == "rider":
        q = q.eq("rider_id", uid)
    result = q.execute().data
    await hub.broadcast({"type": "order_status", "order_id": order_id, "status": payload.status})
    return result

@app.get("/api/admin/overview")
def admin_overview(user=Depends(require("admin"))):
    client = db()
    return {
        "profiles": client.table("profiles").select("*", count="exact").execute().count or 0,
        "restaurants": client.table("restaurants").select("*", count="exact").execute().count or 0,
        "orders": client.table("orders").select("*", count="exact").execute().count or 0,
        "pending_restaurants": client.table("restaurants").select("*", count="exact").eq("status", "pending").execute().count or 0
    }

@app.get("/api/admin/profiles")
def admin_profiles(user=Depends(require("admin"))):
    return db().table("profiles").select("*").order("created_at", desc=True).execute().data

@app.get("/api/admin/restaurants")
def admin_restaurants(user=Depends(require("admin"))):
    return db().table("restaurants").select("*").order("created_at", desc=True).execute().data

@app.patch("/api/admin/restaurants/{restaurant_id}")
def admin_restaurant_status(restaurant_id: str, payload: StatusUpdate, user=Depends(require("admin"))):
    if payload.status not in ("approved", "rejected", "suspended"):
        raise HTTPException(422, "Invalid restaurant status")
    return db().table("restaurants").update({"status": payload.status}).eq("id", restaurant_id).execute().data

@app.get("/api/admin/orders")
def admin_orders(user=Depends(require("admin"))):
    rows = db().table("orders").select("*, order_items(*)").order("created_at", desc=True).limit(500).execute().data
    return enrich_orders(rows)

@app.get("/api/admin/riders")
def admin_riders(user=Depends(require("admin"))):
    """Returns all registered riders with their city, active order counts, and free status."""
    riders = db().table("profiles").select("id, name, email, phone, city").eq("role", "rider").order("name").execute().data
    if not riders:
        return []
    rider_ids = [r["id"] for r in riders]
    active_orders = db().table("orders").select("id, rider_id, status").in_("rider_id", rider_ids).not_.in_("status", ["delivered", "cancelled"]).execute().data
    active_counts = {}
    for o in active_orders:
        rid = o.get("rider_id")
        if rid:
            active_counts[rid] = active_counts.get(rid, 0) + 1

    for r in riders:
        cnt = active_counts.get(r["id"], 0)
        r["active_orders"] = cnt
        r["is_free"] = (cnt == 0)
    return riders

@app.patch("/api/admin/orders/{order_id}/assign-rider")
async def assign_rider(order_id: str, payload: AssignRider, user=Depends(require("admin"))):
    rider = db().table("profiles").select("id, role, name").eq("id", payload.rider_id).limit(1).execute().data
    if not rider or rider[0]["role"] != "rider":
        raise HTTPException(422, "Select a valid rider account")
    result = db().table("orders").update({"rider_id": payload.rider_id}).eq("id", order_id).execute().data
    await hub.broadcast({
        "type": "rider_assigned",
        "order_id": order_id,
        "rider_id": payload.rider_id,
        "rider_name": rider[0]["name"]
    })
    return result

@app.post("/api/admin/offers")
def create_offer(offer: OfferCreate, user=Depends(require("admin"))):
    if not 1 <= offer.discount_percent <= 90:
        raise HTTPException(422, "Discount must be between 1 and 90")
    data = offer.model_dump()
    data["code"] = data["code"].upper()
    return db().table("offers").insert(data).execute().data[0]

class SocketHub:
    def __init__(self):
        self.clients = set()
    async def connect(self, ws):
        await ws.accept()
        self.clients.add(ws)
    def disconnect(self, ws):
        self.clients.discard(ws)
    async def broadcast(self, event):
        stale = []
        for ws in list(self.clients):
            try:
                await ws.send_json(event)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)

hub = SocketHub()

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    token = ws.query_params.get("token")
    try:
        if not token:
            await ws.close(code=4401)
            return
        auth_client.auth.get_user(token)
        await hub.connect(ws)
        await ws.send_json({"type": "connected", "at": datetime.now(timezone.utc).isoformat()})
        while True:
            msg = await ws.receive_json()
            if msg.get("type") == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        hub.disconnect(ws)
    except Exception:
        hub.disconnect(ws)
        try:
            await ws.close(code=4401)
        except Exception:
            pass

FRONTEND = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/assets", StaticFiles(directory=FRONTEND), name="assets")

@app.get("/{path:path}")
def frontend(path: str):
    candidate = os.path.join(FRONTEND, path)
    if os.path.isfile(candidate):
        return FileResponse(candidate)
    return FileResponse(os.path.join(FRONTEND, "index.html"))
