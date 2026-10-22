# HAKU – online store
link https://haku-o2mq.onrender.com/

A complete small-shop e-commerce site: storefront, cart, checkout (Cash on Delivery), order e-mails, order tracking and an admin panel.
Zero npm dependencies: Node.js 22.13+ with its built-in SQLite, plain HTML/CSS/JS front-end.

## Run it locally
```bash
cp .env.example .env      # then edit .env (admin login at minimum)
npm start                 # http://localhost:3000   (admin: /admin)
npm test                  # end-to-end tests (needs openssl)
```
The first start creates `data/haku.db` and loads 24 **sample** products (ratings are labelled "sample"). Manage real products in `/admin`.
To remove the samples later: delete them in Admin → Products and set `AUTO_SEED=false`.

## Make order e-mails reach happymeena278@gmail.com
Every order and contact message is e-mailed to `OWNER_EMAIL` (default `happymeena278@gmail.com`). Pick one provider in `.env`:

**Gmail (simplest)** – use the same Gmail account as the sender:
1. Google Account → Security → turn on 2-Step Verification.
2. Security → App passwords → create one called "HAKU" → copy the 16 characters.
3. In `.env`: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=happymeena278@gmail.com`, `SMTP_PASS=<app password>`.

**Resend** – set `RESEND_API_KEY` and leave `SMTP_*` empty (without a verified domain it only delivers to your own Resend account address).

Honest behaviour: the order is saved first. The confirmation page says the shop was e-mailed **only if the provider accepted the message**; otherwise it says so, the order still appears in Admin flagged "email failed", and you can press **Retry email**. Credentials only ever live in `.env` / host environment variables.

## What is included
- **Storefront**: sticky header, hero, featured / best sellers / new / trending, categories, offers, reviews, newsletter, footer; search, category, price, rating, discount filters, sorting; product pages with gallery, size/colour, quantity, related + recently viewed; wishlist; slide-in cart drawer (persists in localStorage); coupons; shipping calculation; policy pages; custom 404.
- **Checkout**: validation (Indian mobile, PIN, e-mail) on client and server; server re-prices everything from the database (browser prices are ignored) and re-checks stock; idempotency key prevents duplicate orders; unique order ID `HK-YYMMDD-XXXXXX`.
- **Tracking**: order ID + matching e-mail/phone; 7-stage timeline from stored status events with timestamps; cancelled/returned; cancellation requests; wrong details reveal nothing.
- **Admin** (`/admin`): signed HttpOnly session cookie, rate-limited login; products CRUD + image upload (type checked by file signature); orders search/status/expected delivery/cancel/restock; stats and best sellers; review approval; messages; coupons; a real sale countdown (shown only when you configure one).
- **Security**: all admin APIs check the session server-side; same-origin checks; CSP and security headers; rate limits; input validation; parameterised SQL.

Payment is Cash on Delivery only. Online payments (e.g. Razorpay) are **not** implemented, so nothing claims a payment was taken.

## Deploy
Needs a host that runs a long-lived Node 22.13+ process **with a persistent disk** (Render, Railway, Fly.io, a VPS). Serverless hosts such as Vercel would lose the SQLite file.
1. Set environment variables from `.env.example` (`NODE_ENV=production`, `SITE_URL=https://your-domain`, `TRUST_PROXY=1`, admin login, `SESSION_SECRET=$(openssl rand -hex 32)`, e-mail settings).
2. Point `DATA_DIR` and `UPLOAD_DIR` at the persistent volume. Start command: `npm start`. Health check: `/healthz`.
3. Serve over HTTPS (the host usually does this). Back up the `DATA_DIR` folder regularly.

## Layout
`server.js` HTTP + API routes · `lib/store.js` business logic · `lib/db.js` schema · `lib/email.js` SMTP/Resend · `lib/seed.js` sample data · `public/` the single-page front-end · `test/e2e.js` tests.
