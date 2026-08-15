# Unga Market — test credentials

## Demo shopper (seeded by `backend/seed.py`, idempotent)
- Email: `demo@ungamarket.in`
- Password: `unga1234`
- Phone on the account: `9876543210`

Sign in at `/login` → "Email" tab (the form is pre-filled with these values).

## Phone + OTP login (MOCKED)
`/login` → "Phone OTP" tab. Enter any 10-digit number and press **Send OTP**. No SMS is sent —
the 4-digit code is returned by `POST /api/auth/otp/request` and displayed on screen in the
orange hint box (`data-testid="mock-otp-hint"`), also readable from the toast. An unknown number
auto-creates an account.

## UPI payment (test mode)
`UPI_TEST_MODE=true` in `backend/.env`, so `/pay/:orderId` shows a test panel:
- **Simulate successful payment** (`data-testid="simulate-success-btn"`) settles the order.
- **Simulate failure** (`data-testid="simulate-failure-btn"`) marks the payment failed.
Real path: paste any unused **12-digit** number into the UTR field
(`data-testid="utr-input"`) and press Confirm — e.g. `123456789012`. Fewer/more than 12 digits
is rejected with 400, and a UTR already used on another order is rejected with 409.

## Email (Gmail SMTP) — NOT LIVE
`backend/.env` has `GMAIL_ADDRESS=rohithjayaprasad2910@gmail.com` and the same for
`STORE_EMAIL`, but **`GMAIL_APP_PASSWORD` is empty on purpose**. The password the user supplied
(`Rohith@2910`) is their normal Google account password; Gmail SMTP rejects that with
`535 Username and Password not accepted`, so it was deliberately not stored. Every email
(receipt, restock alert, slot reminder) therefore returns `logged` and is written to the
`email_log` collection plus the server log. To go live: create a 16-character App Password at
myaccount.google.com/apppasswords (2-Step Verification required), set `GMAIL_APP_PASSWORD`, then
`sudo supervisorctl restart backend`.

## Restock alerts
Sold-out cards show **Notify me** (`notify-me-btn-<id>`) and, for signed-in users, a **Restock**
button (`restock-btn-<id>`) that adds 10 to stock and emails every watcher — that's the whole loop
without an admin panel. `p006` (Coriander Bunch) and `p016` (Paneer Fresh) are seeded sold out.

## Session
httpOnly cookie `unga_session`. With curl, use a cookie jar:
`curl -c /tmp/jar -X POST localhost:8001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@ungamarket.in","password":"unga1234"}'`
then pass `-b /tmp/jar` on later calls.
