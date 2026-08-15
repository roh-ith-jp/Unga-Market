# Unga Market — run, test & deploy

Local e-commerce storefront with a **real UPI payment gateway** (Google Pay / PhonePe / Paytm /
any UPI app) and Swiggy-style live order tracking.

Stack: **FastAPI + MongoDB (motor)** backend · **Vite + React 19 + TypeScript + Tailwind v4**
frontend. Every backend route lives under `/api`; the frontend only ever calls relative
`/api/...` paths, so dev (Vite proxy) and production (single origin) use identical code.

---

## 1. What the payment gateway actually does

UPI has two integration shapes. This app implements the first, and is structured for the second.

**Implemented — UPI Intent / Collect (no gateway account, no fees).**
The backend mints an NPCI-standard deep link for each order:

```
upi://pay?pa=<merchant VPA>&pn=Unga%20Market&tr=UNGA<order code>&tn=<note>&am=<amount>&cu=INR
```

* `POST /api/payments/upi/{order_id}/intent` returns that link, per-app variants
  (`tez://` Google Pay, `phonepe://`, `paytmmp://`) and a **scannable QR** rendered server-side
  with `segno`. Money moves directly from the customer's bank to `UPI_VPA`.
* UPI intent has **no server-to-server callback**, so settlement is confirmed by
  `POST /api/payments/upi/{order_id}/confirm`, one of two ways:
  * the payer submits the **12-digit UTR / RRN** their UPI app displayed (validated, and rejected
    if already used on another order), or
  * `{"simulate": "success"}` / `{"simulate": "failure"}` — allowed **only** while
    `UPI_TEST_MODE=true`, so the whole flow can be walked without moving money.
* `GET /api/payments/upi/{order_id}/status` is polled by the payment screen; on `paid` the order
  flips to `placed`, `placed_at` is stamped and the live tracker starts.

**Upgrade path — a PSP with webhooks.** For automatic verification, add Razorpay (UPI collect /
QR) or Cashfree: create their order server-side, keep the same `orders` documents, and replace
the `confirm` endpoint with a signature-verified webhook that sets `payment_status = "paid"`.
Nothing else in the app changes — the frontend already treats settlement as asynchronous.

---

## 2. Configuration

Copy `backend/.env.example` to `backend/.env`:

| Variable | Meaning |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | database name (`unga_market`) |
| `CORS_ORIGINS` | comma-separated allowed origins, `*` in dev |
| `APP_URL` | public URL of the frontend (cookie `secure` flag follows it) |
| `UPI_VPA` | **your merchant UPI ID** — this is who gets paid. Replace the placeholder. |
| `UPI_PAYEE_NAME` | name shown inside the customer's UPI app |
| `UPI_TEST_MODE` | `true` exposes simulate-success/failure. **Set `false` in production.** |
| `APP_TZ` | store timezone for delivery slots (default `Asia/Kolkata`) |
| `GMAIL_ADDRESS` | Gmail account that sends receipts. Leave empty to log emails instead of sending. |
| `GMAIL_APP_PASSWORD` | 16-character Google **App Password** (needs 2-Step Verification): myaccount.google.com/apppasswords. Not your normal password — that causes `535 Username and Password not accepted`. |
| `STORE_EMAIL` | store owner's copy of every receipt (defaults to `GMAIL_ADDRESS`) |

Email is optional by design: with the Gmail values empty, receipts are written to the `email_log`
collection and the server log with status `logged`, and nothing fails. Gmail allows roughly 500
messages per rolling 24 hours on a personal account; if your host blocks outbound TCP 587, use a
mail relay over 443 instead.

---

## 3. Run locally

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                     # 36 products + demo account (idempotent)
# (also runs automatically on startup when the database is empty)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# frontend (second terminal)
cd frontend
yarn install
yarn dev                           # http://localhost:3000
```

Demo login: **demo@ungamarket.in / unga1234**
Phone login also works — the OTP is **mocked** and shown on screen (no SMS provider is wired).

---

## 4. Test the payment endpoints

```bash
BASE=http://localhost:8001/api
JAR=/tmp/unga.jar

# sign in (session is an httpOnly cookie)
curl -s -c $JAR -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@ungamarket.in","password":"unga1234"}'

# create a UPI order
OID=$(curl -s -b $JAR -X POST $BASE/orders -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":"p001","qty":2}],"address":"402 Sunrise Apts, Indiranagar, Bengaluru 560038","phone":"9876543210","payment_method":"upi"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# mint the UPI intent (deep link + QR)
curl -s -b $JAR -X POST $BASE/payments/upi/$OID/intent | head -c 400

# settle it — real flow uses the 12-digit UTR; test mode can simulate
curl -s -b $JAR -X POST $BASE/payments/upi/$OID/confirm \
  -H 'Content-Type: application/json' -d '{"simulate":"success"}'

# live tracker state (stage is derived server-side from placed_at)
curl -s -b $JAR $BASE/orders/$OID
```

Backend test suite: `cd backend && pytest`.

---

## 5. Deploy

**One origin, two processes** is the simplest production shape.

1. **Database** — MongoDB Atlas (free tier is enough). Put its SRV string in `MONGO_URL`.
2. **Backend** — any Python host (Render, Railway, Fly, a VM):
   `uvicorn server:app --host 0.0.0.0 --port $PORT` from the `backend/` directory.
   Set every variable from the table above. `pip install -r requirements.txt` first.
3. **Frontend** — `cd frontend && yarn build` produces `frontend/dist/`. Serve it as static
   files and **proxy `/api/*` to the backend** so the app stays same-origin (required: the
   session is an httpOnly cookie). Nginx:

   ```nginx
   location /api/ { proxy_pass http://backend:8001; proxy_set_header Host $host; }
   location /     { root /srv/unga/dist; try_files $uri /index.html; }
   ```

   On Vercel/Netlify, use a rewrite from `/api/*` to the backend URL instead.
4. **Seed once** against production: `python seed.py`.
5. **Before taking real money**: set `UPI_TEST_MODE=false`, set `UPI_VPA` to your live merchant
   VPA, set `CORS_ORIGINS` to your domain only, and serve over HTTPS.

---

## 6. API surface

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` · `/api/auth/login` | email + password, sets session cookie |
| POST | `/api/auth/otp/request` · `/api/auth/otp/verify` | phone login, **mocked OTP** |
| GET | `/api/auth/me` · POST `/api/auth/logout` | who am I / sign out |
| GET | `/api/products` · `/api/products/{id}` · `/api/categories` | catalog, `?category=&q=` |
| GET/POST | `/api/addresses` | saved addresses (label + address + phone + default) |
| PUT/DELETE | `/api/addresses/{id}` · POST `/api/addresses/{id}/default` | edit, remove, set default |
| GET | `/api/delivery-slots` | bookable 30-min windows with remaining capacity |
| GET | `/api/watchlist` · POST/DELETE `/api/products/{id}/watch` | restock alerts for sold-out items |
| POST | `/api/products/{id}/restock?qty=N` | store ops: add stock and email every watcher |
| POST | `/api/orders` | create order (`upi` → awaiting_payment, `cod` → placed); reserves stock |
| POST | `/api/orders/{id}/receipt` | email the receipt via Gmail SMTP (logs when unconfigured) |
| POST | `/api/orders/{id}/reorder` | rebuild a past basket; returns in-stock lines + `skipped` |
| GET | `/api/orders` · `/api/orders/{id}` | history, and the live tracker payload |
| POST | `/api/payments/upi/{id}/intent` | UPI deep link + per-app links + QR SVG |
| POST | `/api/payments/upi/{id}/confirm` | settle by UTR, or simulate in test mode |
| GET | `/api/payments/upi/{id}/status` | polled payment state |
| GET | `/api/download/source` | this source bundle as a zip |
