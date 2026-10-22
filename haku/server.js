'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./lib/config');
const { db } = require('./lib/db');
const S = require('./lib/store');
const U = require('./lib/util');
const { svg: placeholderSvg } = require('./lib/placeholder');
const { emailConfigured } = require('./lib/email');
const { seedIfEmpty } = require('./lib/seed');

const PUBLIC = path.join(__dirname, 'public');
const UPLOADS = config.uploadDir;
fs.mkdirSync(UPLOADS, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}
function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new S.HttpError(413, 'Request is too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw new S.HttpError(400, 'Invalid JSON body'); }
}
// Only trust X-Forwarded-For when the app is explicitly deployed behind a proxy (TRUST_PROXY=1); otherwise it is spoofable.
const clientIp = (req) => (config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'ip';

// Same-origin check for state-changing requests (CSRF defence in addition to SameSite cookies)
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients / same-origin GET-style fetches
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function requireAdmin(req) {
  const a = U.adminFromReq(req);
  if (!a) throw new S.HttpError(401, 'Admin login required');
  return a;
}

// ---------------- API ----------------
async function api(req, res, url) {
  const m = req.method;
  const p = url.pathname.replace(/^\/api/, '');
  const q = Object.fromEntries(url.searchParams);
  const ip = clientIp(req);
  if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(req)) throw new S.HttpError(403, 'Cross-origin request blocked');

  // ----- public -----
  if (m === 'GET' && p === '/config') {
    const s = config.shop;
    return sendJson(res, 200, {
      shop: { name: s.name, email: s.email, phone: s.phone, address: s.address, instagram: s.instagram, facebook: s.facebook, x: s.x, whatsapp: s.whatsapp },
      freeShippingAbove: config.freeShippingAbove, shippingFlat: config.shippingFlat, paymentMethods: [{ id: 'cod', label: 'Cash on Delivery' }],
      categories: S.categories(), promotion: S.activePromotion(), coupons: S.publicCoupons(), stages: S.STAGES.map((k) => ({ key: k, label: S.STAGE_LABELS[k] })),
    });
  }
  if (m === 'GET' && p === '/reviews/latest') return sendJson(res, 200, { reviews: S.latestReviews() });
  if (m === 'GET' && p === '/products') return sendJson(res, 200, { products: S.listProducts(q) });
  if (m === 'GET' && p.startsWith('/products/')) {
    const prod = S.getProduct(decodeURIComponent(p.slice(10)));
    if (!prod) throw new S.HttpError(404, 'Product not found');
    return sendJson(res, 200, { product: prod });
  }
  if (m === 'POST' && p === '/quote') {
    const b = await readJson(req);
    try { return sendJson(res, 200, { quote: S.quote(b.items, b.coupon) }); }
    catch (e) { if (e instanceof S.HttpError && e.status === 409) return sendJson(res, 409, { error: e.message, fields: e.fields }); throw e; }
  }
  if (m === 'POST' && p === '/orders') {
    if (!U.rateLimit(`order:${ip}`, 8, 10 * 60 * 1000)) throw new S.HttpError(429, 'Too many order attempts. Please wait a few minutes and try again.');
    const b = await readJson(req);
    const r = await S.placeOrder(b);
    return sendJson(res, 201, r);
  }
  if (m === 'POST' && p === '/track') {
    if (!U.rateLimit(`track:${ip}`, 15, 10 * 60 * 1000)) throw new S.HttpError(429, 'Too many lookups. Please wait a few minutes.');
    const b = await readJson(req);
    return sendJson(res, 200, { order: S.trackOrder(b.orderId, b.contact) });
  }
  if (m === 'POST' && p === '/orders/cancel-request') {
    if (!U.rateLimit(`cancel:${ip}`, 6, 10 * 60 * 1000)) throw new S.HttpError(429, 'Too many requests. Please wait a few minutes.');
    const b = await readJson(req);
    return sendJson(res, 200, S.requestCancellation(b.orderId, b.contact, b.reason));
  }
  if (m === 'POST' && /^\/products\/\d+\/reviews$/.test(p)) {
    if (!U.rateLimit(`review:${ip}`, 5, 60 * 60 * 1000)) throw new S.HttpError(429, 'Too many reviews submitted. Try again later.');
    S.addReview(p.split('/')[2], await readJson(req));
    return sendJson(res, 201, { ok: true, message: 'Thanks! Your review will appear after the shop approves it.' });
  }
  if (m === 'POST' && p === '/contact') {
    if (!U.rateLimit(`contact:${ip}`, 5, 60 * 60 * 1000)) throw new S.HttpError(429, 'Too many messages. Please try again later.');
    const b = await readJson(req);
    if (b.website) return sendJson(res, 200, { ok: true, emailSent: true }); // honeypot field: bots fill it
    return sendJson(res, 200, { ok: true, ...(await S.addContact(b)) });
  }
  if (m === 'POST' && p === '/newsletter') {
    if (!U.rateLimit(`news:${ip}`, 8, 60 * 60 * 1000)) throw new S.HttpError(429, 'Too many attempts. Please try again later.');
    const b = await readJson(req);
    return sendJson(res, 200, { ok: true, ...S.addSubscriber(b.email) });
  }

  // ----- admin auth -----
  if (m === 'POST' && p === '/admin/login') {
    if (!U.rateLimit(`login:${ip}`, 8, 15 * 60 * 1000)) throw new S.HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
    if (!config.adminConfigured) throw new S.HttpError(503, 'Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart.');
    const b = await readJson(req);
    const okEmail = U.safeEqual(String(b.email || '').toLowerCase(), config.adminEmail);
    const okPass = U.safeEqual(String(b.password || ''), config.adminPassword);
    if (!(okEmail && okPass)) { await new Promise((r) => setTimeout(r, 400)); throw new S.HttpError(401, 'Incorrect email or password.'); }
    const maxAge = 8 * 3600;
    const token = U.sign({ role: 'admin', exp: Date.now() + maxAge * 1000 });
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': U.adminCookie(token, maxAge) });
  }
  if (m === 'POST' && p === '/admin/logout') return sendJson(res, 200, { ok: true }, { 'Set-Cookie': U.adminCookie('', 0) });
  if (m === 'GET' && p === '/admin/me') return sendJson(res, 200, { admin: !!U.adminFromReq(req), configured: config.adminConfigured, emailConfigured: emailConfigured() });

  // ----- admin (every route below requires a valid signed admin session) -----
  if (p.startsWith('/admin/')) {
    requireAdmin(req);
    if (m === 'GET' && p === '/admin/stats') return sendJson(res, 200, { stats: S.adminStats(), emailConfigured: emailConfigured() });
    if (m === 'GET' && p === '/admin/products') return sendJson(res, 200, { products: S.adminListProducts() });
    if (m === 'POST' && p === '/admin/products') return sendJson(res, 201, { product: S.createProduct(await readJson(req)) });
    let mm;
    if ((mm = p.match(/^\/admin\/products\/(\d+)$/))) {
      if (m === 'PUT') return sendJson(res, 200, { product: S.updateProduct(Number(mm[1]), await readJson(req)) });
      if (m === 'DELETE') { S.deleteProduct(Number(mm[1])); return sendJson(res, 200, { ok: true }); }
    }
    if (m === 'POST' && p === '/admin/upload') return handleUpload(req, res);
    if (m === 'GET' && p === '/admin/orders') return sendJson(res, 200, { orders: S.adminListOrders(q) });
    if ((mm = p.match(/^\/admin\/orders\/([A-Za-z0-9-]+)\/status$/)) && m === 'POST') {
      const b = await readJson(req);
      const o = S.setOrderStatus(mm[1], String(b.status), { note: b.note, expectedDelivery: b.expectedDelivery });
      return sendJson(res, 200, { order: S.adminOrderShape(o) });
    }
    if ((mm = p.match(/^\/admin\/orders\/([A-Za-z0-9-]+)\/resend-email$/)) && m === 'POST') {
      const r = await S.resendOrderEmail(mm[1]);
      return sendJson(res, 200, { ok: r.ok, error: r.error || '' });
    }
    if (m === 'GET' && p === '/admin/reviews') {
      return sendJson(res, 200, { reviews: db.prepare('SELECT r.*, p.name product FROM reviews r JOIN products p ON p.id = r.product_id ORDER BY r.id DESC LIMIT 200').all() });
    }
    if ((mm = p.match(/^\/admin\/reviews\/(\d+)$/))) {
      if (m === 'POST') { db.prepare('UPDATE reviews SET approved = ? WHERE id = ?').run((await readJson(req)).approved ? 1 : 0, Number(mm[1])); return sendJson(res, 200, { ok: true }); }
      if (m === 'DELETE') { db.prepare('DELETE FROM reviews WHERE id = ?').run(Number(mm[1])); return sendJson(res, 200, { ok: true }); }
    }
    if (m === 'GET' && p === '/admin/messages') return sendJson(res, 200, { messages: db.prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200').all() });
    if (m === 'GET' && p === '/admin/coupons') return sendJson(res, 200, { coupons: db.prepare('SELECT * FROM coupons ORDER BY code').all() });
    if (m === 'POST' && p === '/admin/coupons') {
      const b = await readJson(req);
      const code = U.clean(b.code, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const type = b.type === 'flat' ? 'flat' : 'percent';
      const value = Math.round(Number(b.value));
      if (!code || !(value > 0) || (type === 'percent' && value > 90)) throw new S.HttpError(422, 'Enter a code and a valid value (percent max 90).');
      db.prepare('INSERT OR REPLACE INTO coupons (code,type,value,min_subtotal,active) VALUES (?,?,?,?,?)').run(code, type, value, Math.max(0, Math.round(Number(b.minSubtotal) || 0)), b.active === false ? 0 : 1);
      return sendJson(res, 200, { ok: true });
    }
    if ((mm = p.match(/^\/admin\/coupons\/([A-Z0-9]+)$/)) && m === 'DELETE') { db.prepare('DELETE FROM coupons WHERE code = ?').run(mm[1]); return sendJson(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/admin/promotion') {
      const b = await readJson(req);
      db.prepare('DELETE FROM promotions').run();
      if (b.title && b.endsAt && !Number.isNaN(Date.parse(b.endsAt))) {
        db.prepare('INSERT INTO promotions (title, subtitle, ends_at) VALUES (?,?,?)').run(U.clean(b.title, 80), U.clean(b.subtitle, 160), new Date(b.endsAt).toISOString().slice(0, 19).replace('T', ' '));
      }
      return sendJson(res, 200, { ok: true });
    }
  }
  throw new S.HttpError(404, 'Not found');
}

// Image upload: raw binary body, validated by magic bytes (never trust the filename or content-type)
async function handleUpload(req, res) {
  const buf = await readBody(req, 3 * 1024 * 1024);
  const sig = (...bytes) => bytes.every((b, i) => buf[i] === b);
  let ext = null;
  if (sig(0xff, 0xd8, 0xff)) ext = 'jpg';
  else if (sig(0x89, 0x50, 0x4e, 0x47)) ext = 'png';
  else if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') ext = 'webp';
  if (!ext) throw new S.HttpError(415, 'Please upload a JPG, PNG or WebP image (max 3 MB).');
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  sendJson(res, 201, { url: `/uploads/${name}` });
}

// ---------------- Pages + static ----------------
const INDEX_HTML = () => fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function pageMeta(pathname) {
  const base = { title: 'HAKU – Discover Something Special', desc: 'HAKU is a modern online store for fashion, footwear, bags, accessories, electronics and home essentials. Great prices, fast delivery and easy returns.' };
  const t = {
    '/shop': ['Shop all products | HAKU', 'Browse everything at HAKU. Filter by category, price and rating.'],
    '/cart': ['Your cart | HAKU', 'Review the items in your HAKU cart.'],
    '/checkout': ['Checkout | HAKU', 'Secure checkout at HAKU.'],
    '/track': ['Track your order | HAKU', 'Enter your order ID to see live order status.'],
    '/contact': ['Contact us | HAKU', 'Get in touch with the HAKU team. We usually reply within one working day.'],
    '/wishlist': ['Your wishlist | HAKU', 'Products you have saved at HAKU.'],
    '/admin': ['Admin | HAKU', 'HAKU store admin.'],
  }[pathname];
  if (t) return { title: t[0], desc: t[1] };
  const pm = pathname.match(/^\/product\/([^/]+)$/);
  if (pm) {
    const prod = S.getProduct(decodeURIComponent(pm[1]));
    if (prod) return { title: `${prod.name} | HAKU`, desc: prod.shortDesc || prod.description.slice(0, 150), image: prod.images[0], product: prod };
  }
  return base;
}
function renderIndex(pathname) {
  const meta = pageMeta(pathname);
  let html = INDEX_HTML().replace(/<title>.*?<\/title>/, `<title>${escAttr(meta.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escAttr(meta.desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escAttr(meta.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escAttr(meta.desc)}$2`);
  if (meta.image) html = html.replace('</head>', `<meta property="og:image" content="${escAttr(config.siteUrl + meta.image)}"></head>`);
  if (meta.product) {
    const p = meta.product;
    const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.shortDesc, image: p.images.map((i) => config.siteUrl + i), category: p.category,
      offers: { '@type': 'Offer', priceCurrency: 'INR', price: p.price, availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } };
    html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></head>`);
  }
  return html;
}
const PAGE_ROUTES = [/^\/$/, /^\/shop$/, /^\/cart$/, /^\/checkout$/, /^\/track$/, /^\/contact$/, /^\/wishlist$/, /^\/admin$/, /^\/product\/[^/]+$/, /^\/order\/[A-Za-z0-9-]+$/, /^\/policy\/[a-z-]+$/];

function serveFile(req, res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache };
    if (file.startsWith(UPLOADS) && ext === '.svg') return send(res, 403, 'Forbidden');
    res.writeHead(200, { ...SECURITY_HEADERS, ...headers });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }

    if (pathname.startsWith('/api/')) {
      try { return await api(req, res, url); }
      catch (err) {
        if (err instanceof S.HttpError) return sendJson(res, err.status, { error: err.message, fields: err.fields });
        console.error('[api error]', req.method, pathname, err);
        return sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' });
      }
    }
    if (pathname === '/healthz') return sendJson(res, 200, { ok: true });
    if (pathname === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${config.siteUrl}/sitemap.xml\n`, { 'Content-Type': 'text/plain' });
    if (pathname === '/sitemap.xml') {
      const urls = ['/', '/shop', '/track', '/contact', ...S.listProducts().map((p) => `/product/${p.slug}`)];
      return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${config.siteUrl}${u}</loc></url>`).join('')}</urlset>`, { 'Content-Type': 'application/xml' });
    }
    // generated placeholder artwork: /ph/<icon>/<hex>/<variant>.svg
    const ph = pathname.match(/^\/ph\/([a-z]+)\/([0-9a-fA-F]{6})\/(\d)\.svg$/);
    if (ph) return send(res, 200, placeholderSvg(ph[1], ph[2], ph[3]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });

    if (pathname.startsWith('/uploads/')) return serveFile(req, res, path.join(UPLOADS, path.basename(pathname)), 'public, max-age=604800');

    // static assets
    const rel = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(PUBLIC, rel);
    if (file.startsWith(PUBLIC + path.sep) && pathname !== '/' && fs.existsSync(file) && fs.statSync(file).isFile() && !file.endsWith('index.html')) {
      return serveFile(req, res, file, /\.(css|js)$/.test(file) ? 'no-cache' : 'public, max-age=86400');
    }
    // app pages
    if (PAGE_ROUTES.some((r) => r.test(pathname))) {
      return send(res, 200, renderIndex(pathname), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    }
    // custom 404 page (client renders it, but the status code is a real 404 for crawlers)
    return send(res, 404, renderIndex('/__404'), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  } catch (err) {
    console.error('[server error]', err);
    if (!res.headersSent) send(res, 500, 'Server error', { 'Content-Type': 'text/plain' });
  }
});

if (require.main === module) {
  if (config.autoSeed) { const n = seedIfEmpty(); if (n) console.log(`  Seeded ${n} sample products (first run).`); }
  server.listen(config.port, () => {
    console.log(`\n  HAKU store running at http://localhost:${config.port}`);
    console.log(`  Admin panel:   http://localhost:${config.port}/admin  ${config.adminConfigured ? '' : '(NOT configured: set ADMIN_EMAIL / ADMIN_PASSWORD in .env)'}`);
    console.log(`  Order emails:  ${emailConfigured() ? 'provider configured -> ' + config.notifyEmail : 'NOT configured (orders still save; set RESEND_API_KEY or SMTP_* in .env)'}`);
    if (config.ephemeralSecret) console.log('  Note: SESSION_SECRET not set; admin sessions reset on restart.');
    console.log('');
  });
}
module.exports = { server };
