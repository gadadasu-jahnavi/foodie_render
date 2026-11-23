# Foodie – Admin, Seller, Rider & Customer panels (Flask + SQLite)

One Flask server hosts the REST API **and** all four front-ends, so every panel talks to the same database.
Anything a seller, rider or customer does shows up in the admin panel (it refreshes itself every 10 seconds).

```
foodie/
├── backend/
│   ├── app.py            Flask app factory, serves the 4 panels (/ -> /admin/)
│   ├── config.py         settings (env vars)
│   ├── models.py         database tables (SQLAlchemy)
│   ├── auth.py           JWT login helpers, role guards
│   ├── uploads.py        safe document upload (type + size + magic-byte check)
│   ├── routes/           public.py (register/login) · customer.py · seller.py · rider.py · admin.py
│   ├── seed.py           optional demo data
│   ├── tests/test_flow.py  end-to-end API test
│   └── requirements.txt
├── frontend/
│   ├── admin/            your admin panel, now reading live data
│   ├── seller/           registration (+password), login, NEW dashboard (orders + menu)
│   ├── rider/            registration (+city), login, NEW dashboard (pickups + earnings)
│   └── customer/         register/login, NEW home (restaurants, cart, orders, star ratings)
├── uploads/              documents uploaded during registration (created automatically)
├── run.sh / run.bat
└── .env.example
```

## Run it

```bash
cd backend
python -m venv venv && source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python seed.py          # optional: demo data  (python seed.py --reset to start over)
python app.py           # http://localhost:5000
```
(or just run `run.sh` / `run.bat`)

**Opening the site goes straight to the Admin panel.** `run.sh` / `run.bat` (or `python app.py`) start the server and open
`http://localhost:5000/admin/` in your browser; `http://localhost:5000/` also redirects there. The seller, rider and customer
panels are no longer listed on a landing page: they live at their own links, which the admin dashboard shows (with Copy buttons)
under **Registration Links**. The terminal prints the same links using your computer's network address.

**Registering from other devices:** phones/computers on the same Wi-Fi open the network links (for example
`http://192.168.1.20:5000/seller/seller-registration.html`), not `localhost`. Set `NO_BROWSER=1` to stop the browser auto-opening.
If a device can't connect, allow port 5000 through the computer's firewall.

**What the admin sees, live (refreshes every 5 s):**
- Dashboard → **Live Registrations**: newest customers, sellers and riders mixed together, with status and time
- Sidebar badges on *Seller Registration* / *Rider Registration* showing how many are waiting for approval
- A pop-up message and a short beep when a new registration arrives, and `(n)` in the browser tab title for pending approvals
- Bell notifications and the Customers / Seller Registration / Rider Registration pages

| Panel    | URL                           | Login |
|----------|-------------------------------|-------|
| Admin    | http://localhost:5000/admin/    | `admin@foodie.com` / `admin123` (**change it** in Settings → Account) |
| Seller   | http://localhost:5000/seller/   | email or mobile + password chosen at registration |
| Rider registration | http://localhost:5000/rider/index.html | Submit details and documents for admin approval |
| Rider login | http://localhost:5000/rider/login.html | Email or mobile + password (approved riders only) |
| Customer | http://localhost:5000/customer/ | email (or name) + password |

With `seed.py`, demo accounts use the password `password123`
(`ravi@mail.com`, `spicegarden@mail.com`, `arjun@mail.com`).

## How the panels are connected

| Action | Where it appears in admin |
|---|---|
| Customer registers | Customers page, bell notification |
| Seller registers (with documents) | Seller Registration → *Pending*; **Details** link shows the form + document files |
| Rider registers (with documents) | Rider Registration → *Pending*; **Details** link |
| Admin approves / rejects (reason required) | Seller/Rider moves to Sellers/Riders lists; the seller/rider dashboard shows the result |
| Customer places an order | Orders, Dashboard, Analytics, bell notification |
| Seller accepts → rider picks up → rider delivers | Order status updates live; Seller/Rider history pages and Analytics fill in |
| Customer rates a delivered order (1–5 ★ + comment) | Reviews & Ratings, average rating, restaurant rating |

**Order flow:** `Pending → Accepted → (rider picks up) Out for Delivery → Delivered`. A customer can cancel while *Pending*; the seller can reject.
Only **Approved** sellers show up for customers, and only **Approved** riders can take deliveries.

## API summary (JSON, `Authorization: Bearer <token>`)

- `POST /api/customers/register` · `POST /api/sellers/register` (multipart) · `POST /api/riders/register` (multipart)
- `POST /api/auth/login` `{role, identifier, password}` → `{token, user}`
- Customer: `GET /api/customer/restaurants`, `…/restaurants/<id>/menu`, `POST …/orders`, `GET …/orders`, `POST …/orders/<id>/cancel`, `POST …/orders/<id>/review`
- Seller: `GET /api/seller/me|orders|menu`, `PATCH …/orders/<id>/status`, `POST|PATCH|DELETE …/menu`
- Rider: `GET /api/rider/me|available|orders`, `POST …/orders/<id>/pickup|deliver`
- Admin: `GET /api/admin/bootstrap`, `PATCH …/sellers|riders|customers/<id>/status`, `POST …/offers`, `POST …/password`

## Tests

```bash
cd backend && python tests/test_flow.py     # registers, approves, orders, delivers, rates, checks admin sees it all
```

## What changed in your original files
- **Admin**: the mock data and random order generator were replaced by `loadData()` (from `/api/admin/bootstrap`). Dashboards, analytics, history pages and search are the same code, now fed by real rows. Sign-in, approve/reject, offers and password change go through the API.
- **Seller**: added *Create/Confirm password* to step 1 (the original form had none, so login was impossible); the form submits to the API; new `seller-dashboard.html`.
- **Rider**: your separate rider frontend (registration form + login) now talks to this Flask API; only admin-approved riders can log in; `dashboard.html` holds pickups and earnings. City is optional (the form has no City field, so admin shows "—"). The FastAPI backend inside your zip was replaced by this Flask one.
- **Customer**: added optional mobile + city on sign-up; login uses the API; `home.html` is now a working storefront.

## Know before going live
- **Set `SECRET_KEY`** and change the admin password. Run behind gunicorn/nginx with HTTPS (`gunicorn -w 4 "app:create_app()"` from `backend/`). Use PostgreSQL by setting `DATABASE_URL`.
- Admin *Details* links carry the admin token in the URL (new tabs can't send headers). Fine for a private admin tool; avoid sharing those links.
- Offers can be created in admin but are **not yet applied at customer checkout**.
- Rider distance is entered by the rider on delivery (estimated if left blank); there is no GPS or payment gateway.
- The admin can approve/reject sellers and riders; the API also supports deactivating customers, but there is no button for it in the UI yet.
- Admin profile details (name, phone, avatar, theme) are still saved in the browser only; the password is stored server-side.
- Live updates use polling (10 s admin, 8 s others), not WebSockets.
