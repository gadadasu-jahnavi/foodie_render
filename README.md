# Foodie — Supabase + FastAPI + WebSockets + Render

This is the deployment-ready v2 foundation of your uploaded Foodie project. The original project is preserved in `legacy/` for reference. The active application is served by one FastAPI service: it serves the frontend, REST API, and authenticated WebSocket endpoint from the same Render web service.

## Architecture

- **Frontend:** responsive HTML/CSS/JavaScript role-based UI (`frontend/`)
- **Backend:** FastAPI + Uvicorn (`backend/main.py`)
- **Authentication:** Supabase Auth (email/password); API validates Supabase access tokens
- **Database:** Supabase hosted PostgreSQL; schema in `supabase/schema.sql`
- **Realtime:** authenticated WebSocket at `/ws?token=SUPABASE_ACCESS_TOKEN`
- **Hosting:** Render Blueprint (`render.yaml`), deploy directly from GitHub

## Roles and entry points

- `/` — landing page with exactly two entry choices: Admin Portal and User Portal
- `#/admin` — administrator-only sign-in
- `#/user` — buyer, seller and rider role chooser
- `#/login/buyer`, `#/login/seller`, `#/login/rider` — role-specific sign-in
- `#/register/buyer`, `#/register/seller`, `#/register/rider` — role-specific registration
- `#/dashboard` — role-specific dashboard after sign-in

The server enforces role access. Hiding a page or changing a browser value does not grant permissions.

## 1. Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `supabase/schema.sql`.
3. Open **Project Settings → API** and copy:
   - Project URL
   - `anon` / publishable key
   - `service_role` / secret key
4. In **Authentication → Providers → Email**, choose whether to require email confirmation. If confirmation is enabled, users must verify their email before signing in.
5. Never put the service-role key in frontend code, GitHub, or a public environment variable.

### Create the first administrator

Public registration intentionally allows only buyer, seller, and rider roles. To create an admin:

1. Register a normal account using the app (or create a user in Supabase Authentication).
2. Find that user's UUID in **Authentication → Users**.
3. Run this SQL in the Supabase SQL Editor, replacing the UUID:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

The account can now sign in through the separate Admin Portal. Do not add a public admin registration route. There is no built-in default admin email/password: first create the account through the User portal, verify the email if Supabase email confirmation is enabled, run the SQL above, then sign in through Admin Portal. The SQL Editor is the only intended place to promote the first administrator.

## 2. Run locally

Python 3.10+ recommended.

```bash
# from the repository root
python -m venv .venv

# Windows PowerShell
.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r backend/requirements.txt
```

Copy `.env.example` to `.env`, fill in your Supabase values, then:

```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`. API docs are at `/api/docs`; health check is `/api/health`.

## 3. Deploy to Render from GitHub

1. Push this folder's contents to a GitHub repository.
2. In Render, choose **New → Blueprint** and connect the repository.
3. Render reads `render.yaml` and creates the `foodie-platform` web service.
4. In the Render service Environment settings, add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Deploy. The service health endpoint is `/api/health`.

The single-service deployment avoids separate frontend CORS configuration. For a split deployment later, set `CORS_ORIGINS` to the exact frontend origin(s), comma-separated.

## Login troubleshooting

- `422` from `/api/auth/login` means the request body did not match the previous login schema. This version accepts older clients that omit `portal`, and the frontend displays individual validation fields when FastAPI returns them.
- `401` means Supabase rejected the credentials, the session was not issued, or the Supabase Auth configuration needs checking.
- `403` in the Admin Portal means the account exists but its `profiles.role` is not `admin`. Promote the account using the SQL above.
- If registration says to verify email, confirm the address before signing in when email confirmation is enabled in Supabase Auth settings.
- Ensure `.env` contains the correct `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, then restart Uvicorn after changing it.

## API summary

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/auth/register` | Public (buyer/seller/rider only) |
| POST | `/api/auth/login` | Public, portal role checked |
| GET | `/api/me` | Signed in |
| GET | `/api/locations` | Public (Available restaurant locations for rider registration) |
| GET | `/api/restaurants` | Public |
| GET | `/api/menu` | Public |
| POST/PATCH/DELETE | `/api/menu` | Seller (add dish, update details & photos, remove) |
| POST | `/api/upload` / `/api/upload-base64` | Signed in (Menu photo upload) |
| POST/GET | `/api/orders` | Buyer create (auto-allocates to free rider in restaurant city); signed-in reads own |
| PATCH | `/api/orders/{id}/status` | Seller/rider/admin, status constrained by role |
| GET | `/api/admin/overview` | Admin |
| GET | `/api/admin/profiles` | Admin |
| GET/PATCH | `/api/admin/restaurants` | Admin |
| GET | `/api/admin/orders` | Admin |
| GET | `/api/admin/riders` | Admin (Available free riders list with active delivery counts) |
| PATCH | `/api/admin/orders/{id}/assign-rider` | Admin (Dropdown assignment by rider name/status) |
| POST | `/api/admin/offers` | Admin |
| WS | `/ws?token=...` | Authenticated |

## V2.1 Enhancements

1. **Enhanced Modern UI:** Premium culinary styling preserving the warm color palette (`#ff7628`, `#201912`, `#fffaf3`), featuring card elevations, micro-animations, color-coded status badges, and responsive layouts.
2. **Zero Popup Intrusions:** Completely eliminated all `window.prompt()` and `window.alert()` calls. Replaced with in-page notice banners, inline checkout modals with delivery address inputs, and one-click dropdown selectors.
3. **Menu Photo Upload & Full Edit:** Kitchen partners can upload high-resolution dish photos (drag-and-drop or file upload), preview them live, edit existing dishes, and add, replace, or remove photos anytime.
4. **Location-Aware Rider Registration & Auto-Allocation:**
   - Riders select their operating location strictly from active restaurant hubs via a dynamic dropdown.
   - Incoming orders automatically allocate to a free registered rider in the restaurant's city.
   - If no free rider is available in the same city, the order gracefully routes to Admin Allocation, where administrators select from a real-time dropdown of free riders (showing name, city, and active delivery load).
5. **Back Button Protection:** Protected routes and history state management ensure that clicking the browser back button while logged in stays safely within the dashboard workspace rather than ejecting to the sign-in page.

## Important implementation notes

- `SUPABASE_SERVICE_ROLE_KEY` is used only by FastAPI on the server. Never expose it to browser JavaScript.
- The FastAPI layer validates the Supabase access token and reads the user's role from `profiles` for every protected API request.
- The SQL schema enables Row Level Security. The backend uses the service role, so authorization is enforced in FastAPI; do not create a browser-side service-role client.
- WebSocket connections require a valid Supabase access token. The current socket broadcasts order-created and order-status events to connected clients; clients can send `{"type":"ping"}` and receive `{"type":"pong"}`.
- Supabase Storage upload flows for seller/rider verification documents, payment gateway integration, rider dispatch/assignment, reviews/ratings, password-reset UI, and full migration of every legacy screen/API are not implemented in this v2 foundation. The original implementation remains under `legacy/` and can be migrated feature-by-feature. Do not treat the old local SQLite/MySQL records as migrated automatically.
- The API uses the service-role key for database access and performs role/ownership checks in route handlers. Before production launch, add automated tests, rate limiting, structured audit logs, and finer-grained database policies for any direct client access.

## Original project

The uploaded source has been retained in `legacy/` (excluding Python test cache files) so the previous UI, Flask API, model definitions, and flows are available during the next migration stage.
