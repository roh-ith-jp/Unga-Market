# Unga Market — living spec

Local-kirana e-commerce storefront with a **real UPI payment gateway** (Google Pay / PhonePe /
Paytm / any UPI app) and Swiggy-style live order tracking. FastAPI + MongoDB + Vite/React 19 TS.

## Data model (MongoDB, string uuid4 ids)

| Collection | Shape |
|---|---|
| `products` | `id` (`p001`…`p036`), name, brand, size, price, mrp, category, image, in_stock, **stock** (int) |
| `users` | id, name, email (unique, lowercased), phone, password (pbkdf2 `salt$digest`), created_at |
| `sessions` | token, user_id, created_at, expires_at (30 days) |
| `otps` | phone, otp (4 digits), expires_at (5 min) — **mocked**, returned in the API response |
| `orders` | id, code (`UM######`), user_id, items[], address, phone, delivery_note, subtotal, delivery_fee, platform_fee, total, savings, payment_method, payment_status, status, created_at, placed_at, rider_name, rider_phone |
| `payments` | order_id, txn_ref (`UNGA<code>`), amount, vpa, status, upi_link, expires_at, utr, paid_at, simulated |
| `addresses` | id, user_id, label (Home/Work/Other), address, phone, is_default, created_at |
| `email_log` | kind (receipt/restock_alert/slot_reminder), order_id, order_code, to, cc, subject, status (sent/logged/failed), live, created_at |
| `restock_watch` | id, product_id, user_id, email, created_at, notified_at |

Orders also carry: delivery_mode (`now`/`scheduled`), slot_id, slot_label, slot_start, slot_end,
receipt_status, receipt_sent_at, receipt_to.

## Stock (`stock` int on every product)
`GET /api/products` derives `in_stock = stock > 0` and `low_stock = 0 < stock <= 5`; the card shows
"Only N left" and a greyscale "Sold out" overlay that disables Add, and the qty stepper stops at
`stock`. `POST /api/orders` reserves stock atomically per line
(`update_one({stock: {$gte: qty}}, {$inc: {stock: -qty}})`) and **rolls back every line already
taken** if any line falls short, returning 409 with the real remaining count. Seeded levels are
deterministic: `p006`/`p016` sold out, `p001`=2, `p012`=3, `p021`=4, `p034`=5, rest 12–40.
Re-running `seed.py` never clobbers a live count.

## Delivery slots (`lib/slots.py`)
30-minute windows generated in **APP_TZ (Asia/Kolkata)** — 08:00 to 22:00, today + tomorrow, with a
45-minute lead time, capacity 8 orders per slot. `GET /api/delivery-slots` returns
`{id, label, start, end, remaining, sold_out}`; sold-out windows render struck-through and
disabled. Checkout step 2 offers **Deliver now** (express, demo tracker cycle) or **Schedule a
slot**; a scheduled order stores the slot and `build_order` anchors the timeline to `slot_start`
instead of `placed_at`, so "Order placed" completes immediately while the remaining stages wait for
the window (ETA counts down to the slot). Booking a full slot returns 409.

Categories: fruits-veg, atta-rice-dal, dairy-bread, masala-oil, snacks, beverages, household,
personal-care.

Fees: delivery ₹25, free at subtotal ≥ ₹199; platform fee ₹5.

## Auth
httpOnly cookie `unga_session` set by `/api/auth/login`, `/api/auth/signup`,
`/api/auth/otp/verify`; cleared by `/api/auth/logout`. `GET /api/auth/me` answers "who am I"
(401 when signed out — the frontend treats that as a normal `null` state, never an error screen).
Phone login auto-creates an account if the number is new.

## Payment gateway (the core of this build)
UPI **intent / collect**, no PSP account required. `lib/upi.py` builds the NPCI deep link
`upi://pay?pa=<UPI_VPA>&pn=&tr=&tn=&am=&cu=INR`, per-app variants (`tez://`, `phonepe://`,
`paytmmp://`) and a QR SVG via `segno`. Because UPI intent has no callback, settlement happens via
`POST /api/payments/upi/{id}/confirm`:
* `{"utr": "<12 digits>"}` — real path; validated for length and reused-UTR collisions.
* `{"simulate": "success"|"failure"}` — only while `UPI_TEST_MODE=true`.
On success: payment `paid`, order `placed`, `placed_at` stamped, cart cleared, tracker starts.
Intents expire after 10 minutes (410 afterwards). COD orders skip payment and are `placed` at once.

## Order lifecycle (`lib/orderflow.py`)
Stage is **derived server-side** from seconds elapsed since `placed_at` — no worker, all clients
agree: placed 0s → packed 45s → out_for_delivery 110s → delivered 260s. `GET /api/orders/{id}`
returns the computed `status`, `timeline[]` and `eta_minutes`; the tracker page polls every 5s and
stops polling once delivered.

## Key flows
1. Browse `/` (category chips + search via `?category=&q=`) → add to cart (client-side,
   localStorage `unga.cart.v1`) → sticky cart bar → cart sheet.
2. `/checkout` — **saved addresses** (`/api/addresses`): the default is preselected, tap another to
   switch, star to change the default, trash to delete (deleting the default promotes another).
   "Deliver somewhere else" reveals the manual form (label Home/Work/Other + address + phone +
   "save for next time", checked by default; the first saved address becomes the default
   automatically). Then payment method (UPI or COD) → `POST /api/orders`. A 401 bounces to `/login`.
   Saving an address is best-effort — a failure there never blocks the order.
3. `/pay/:orderId` — UPI gateway: QR, copyable VPA, app deep links, 10-min countdown, UTR box,
   and (test mode) simulate success/failure. Polls status, then redirects to tracking.
4. `/track/:orderId` — live timeline, rider card, receipt, invoice link once invoiceable.
5. `/orders` — history, each row with **Order again** (`POST /api/orders/{id}/reorder`: returns
   in-stock lines + a `skipped` list of unavailable names; the frontend bulk-adds via `addMany`,
   toasts what was skipped, and goes to checkout) and an **Invoice** link.
6. `/invoice/:orderId` — printable A4 tax invoice (`window.print()` → Save as PDF). Gated by
   `isInvoiceable` in `lib/invoice.ts`: `payment_status === "paid" || status === "delivered"`;
   anything else renders an explanatory notice instead of a bill.
7. `/login` — email+password or phone+mocked-OTP.
8. `GET /api/download/source` — zips the live tree + generated `.env.example` + `DEPLOY.md`.

## Seed facts (`backend/seed.py`, idempotent)
36 products, ids `p001`–`p036`. `p001` = Tomato Local ₹24 (fruits-veg),
`p007` = Whole Wheat Atta ₹268. Demo account: `demo@ungamarket.in` / `unga1234`.

## Email receipts (`lib/email.py`, Gmail SMTP)
`smtp.gmail.com:587` + STARTTLS with an App Password, sent from a thread via
`asyncio.to_thread` so the event loop never blocks. Multipart plaintext + branded HTML receipt,
`From: Unga Market <GMAIL_ADDRESS>`, Cc `STORE_EMAIL` (store copy). Fires **once** the moment an
order reads as `delivered`: `GET /api/orders` and `GET /api/orders/{id}` claim the send with a
conditional `receipt_sent_at: None` update before queueing a BackgroundTask, so concurrent polls
cannot double-send. `POST /api/orders/{id}/receipt` re-sends on demand (awaited, returns the
outcome) and powers the "Email me this receipt" button on the invoice.
**No credentials are configured**, so every send currently returns `logged`: the message is written
to `email_log` and the server log instead of being delivered, and nothing raises. Set
`GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` and `STORE_EMAIL` in `backend/.env` to go live — TCP 587 is
reachable from the pod, so it will work as soon as the credentials exist.

## Restock alerts
Sold-out cards show **Notify me** (`POST /api/products/{id}/watch`, 400 if the item is in stock,
401 → toast asking them to sign in) and flip to "We'll email you"; tapping again cancels
(`DELETE`). `GET /api/watchlist` returns the ids the shopper is waiting on so the button state
survives a reload. `POST /api/products/{id}/restock?qty=N` is the store-ops action (signed-in):
it increments stock, emails every unnotified watcher via `send_restock_alert`, and stamps
`notified_at` so nobody is emailed twice. A Restock button sits next to Notify me for signed-in
users so the whole loop is demonstrable from the storefront.

## Slot reminders
`build_order` computes `reminder_due = 0 < seconds_to_slot <= 900` for scheduled, paid orders.
`GET /api/orders` and `/api/orders/{id}` claim the send with a conditional `reminder_sent_at: None`
update (same exactly-once pattern as receipts) and queue `send_slot_reminder` as a BackgroundTask.
The tracker also shows an in-app banner while `reminder_due` or `reminder_sent_at` is set.

## Seeding on startup
`server.py`'s lifespan calls `seed.ensure_seeded()`, which seeds only when `products` is empty, so a
fresh deploy is never a blank shop and an existing database is untouched. Failures are logged and
never block boot. `python seed.py` still works for a manual run.

## Deliberate deviations
* **`UPI_VPA=8939150414@fam` is the user's REAL merchant UPI ID** — the QR and deep links now
  collect actual money. `UPI_TEST_MODE` is still `true`, so the "Simulate successful payment"
  button can mark an order paid without any money moving. Flip `UPI_TEST_MODE=false` before real
  customers use it, otherwise anyone can self-serve a free order.
* **Gmail App Password still missing.** The user asked to try their account password
  (`Rohith@2910`); it was tested against smtp.gmail.com and Gmail returned
  `535 5.7.8 Username and Password not accepted (BadCredentials)`. It was then removed from
  `.env`, so email remains log-only. Only a 16-char App Password will work.
* **Razorpay is not implemented** — the user has never supplied test keys, so UPI settlement is
  still UTR/simulate only.
* **Gmail SMTP has no credentials**, so receipts are logged (`status: "logged"`) rather than sent.
  The wiring is complete and TCP 587 is reachable — set `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD` /
  `STORE_EMAIL` in `backend/.env` and restart to go live.
* Scheduled orders keep the demo tracker cycle relative to the slot start (the user chose this over
  full realism), so a slot later today shows "Order placed" done and the rest pending.
* OTP is **mocked** — the code is returned in the API response and shown on screen; no SMS
  provider is wired.
* `UPI_TEST_MODE=true` in this environment, so simulate-success/failure is exposed. Real UPI
  settlement by UTR works; automatic verification would need a PSP webhook (Razorpay/Cashfree),
  documented as the upgrade path in `DEPLOY.md`.
* Product images are generated packshots served from the Emergent static CDN (the original
  `image.pollinations.ai` URLs did not load), with a text fallback if a request ever fails.
