# Unga Market — Base44 Dev Notes

## Stack
Single Node.js (ESM) Express server (`server.js`) on port 3000, host `0.0.0.0`.
Serves a static single-page app (`index.html`) plus REST API routes from the same origin.
No database — in-memory state and caches. Product catalog lives in `products.js`.

## Running
`docker compose -f docker-compose.base44.yml up -d`
- Node 22 slim image, source bind-mounted at `/app`.
- `npm install --omit=dev` runs at startup; `node_modules` is a named volume so installs don't leak to host.
- `nodemon` watches `server.js` and `products.js` (legacy polling for bind mounts) for live reload.
- `index.html` is served via `express.static`, so edits appear on browser refresh.

## Secrets
- `GEMINI_API_KEY` (optional): Google Gemini key for AI product image generation. Without it the app
  falls back to generated SVG packshots — it still boots and renders. Delivered via `/run/base44/app.env`.
- Other vars (`STORE_EMAIL`, `UPI_VPA`, etc.) have working defaults in `.env.base44-defaults`.
- `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` appear in `.env.example` but are NOT referenced in code.

## Verification
- `curl -sf http://localhost:3000/` returns the HTML page.
- `curl -sf -H "Host: external.preview.example" http://localhost:3000/` confirms external host access
  (CORS is `app.use(cors())` — allow all).
