'use strict';
// End-to-end test: node test/e2e.js   (needs openssl for the fake SMTP server; no other dependencies)
const { spawn, execSync } = require('node:child_process');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90), SMTP_PORT = 2400 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
let passed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };

// ---- fake SMTP server (implicit TLS) that records what the shop would receive ----
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tmp}/k.pem -out ${tmp}/c.pem -days 2 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" 2>/dev/null`);
const mails = [];
const smtp = tls.createServer({ key: fs.readFileSync(`${tmp}/k.pem`), cert: fs.readFileSync(`${tmp}/c.pem`) }, (s) => {
  let data = false, buf = '', cur = { rcpt: [], body: '' };
  s.write('220 fake ESMTP\r\n');
  s.on('data', (c) => {
    buf += c.toString();
    if (data) { if (buf.endsWith('\r\n.\r\n')) { cur.body = buf; mails.push(cur); cur = { rcpt: [], body: '' }; data = false; buf = ''; s.write('250 queued\r\n'); } return; }
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/i.test(line)) s.write('250-fake\r\n250 AUTH LOGIN\r\n');
      else if (/^AUTH LOGIN/i.test(line)) s.write('334 VXNlcm5hbWU6\r\n');
      else if (/^[A-Za-z0-9+/=]+$/.test(line) && !cur.authed) { cur.authStep = (cur.authStep || 0) + 1; if (cur.authStep === 1) s.write('334 UGFzc3dvcmQ6\r\n'); else { cur.authed = true; s.write('235 ok\r\n'); } }
      else if (/^MAIL FROM/i.test(line)) s.write('250 ok\r\n');
      else if (/^RCPT TO/i.test(line)) { cur.rcpt.push(line.match(/<(.+)>/)[1]); s.write('250 ok\r\n'); }
      else if (/^DATA/i.test(line)) { data = true; s.write('354 go\r\n'); if (buf) s.emit('data', ''); }
      else if (/^QUIT/i.test(line)) s.end('221 bye\r\n');
    }
  });
  s.on('error', () => {});
});

const J = (p, body, opts = {}) => fetch(BASE + '/api' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})), headers: r.headers }));
const customer = { name: 'Asha Verma', email: 'asha@example.com', phone: '+91 98765 43210', address: '14 Park Street, Flat 2B', city: 'Kolkata', state: 'West Bengal', pin: '700016', paymentMethod: 'cod' };

(async () => {
  await new Promise((r) => smtp.listen(SMTP_PORT, r));
  const server = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, DATA_DIR: tmp + '/data', UPLOAD_DIR: tmp + '/up', ADMIN_EMAIL: 'admin@haku.test', ADMIN_PASSWORD: 'correct-horse-9', SESSION_SECRET: 'test-secret',
      SMTP_HOST: 'localhost', SMTP_PORT: String(SMTP_PORT), SMTP_SECURE: 'true', SMTP_USER: 'sender@example.com', SMTP_PASS: 'app-pass', OWNER_EMAIL: 'happymeena278@gmail.com', NODE_EXTRA_CA_CERTS: `${tmp}/c.pem`, FREE_SHIPPING_ABOVE: '999', SHIPPING_FLAT: '79' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/healthz'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }

  console.log('HAKU end-to-end tests');
  let hoodie, outOfStock, orderId, cookie;
  const stockOf = async (id) => (await J('/products/' + id)).body.product.stock;

  await t('catalogue is seeded and prices/discounts are computed', async () => {
    const { body } = await J('/products'); assert.ok(body.products.length >= 20);
    hoodie = body.products.find((p) => p.slug === 'street-core-hoodie'); outOfStock = body.products.find((p) => p.stock === 0);
    assert.equal(hoodie.discountPct, Math.round(((hoodie.originalPrice - hoodie.price) / hoodie.originalPrice) * 100));
    assert.ok(outOfStock, 'has an out-of-stock sample');
  });
  await t('search, category, price, rating, discount filters and sorting', async () => {
    assert.ok((await J('/products?q=hoodie')).body.products.every((p) => /hoodie/i.test(p.name + p.shortDesc)));
    assert.ok((await J('/products?category=Footwear')).body.products.every((p) => p.category === 'Footwear'));
    assert.ok((await J('/products?min=1000&max=2000')).body.products.every((p) => p.price >= 1000 && p.price <= 2000));
    assert.ok((await J('/products?rating=4.5')).body.products.every((p) => p.rating >= 4.5));
    const asc = (await J('/products?sort=price-asc')).body.products.map((p) => p.price); assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
    assert.equal((await J('/products?q=zzzznothing')).body.products.length, 0);
  });
  await t('product detail returns related products from the same category', async () => {
    const { body } = await J('/products/' + hoodie.slug); assert.ok(body.product.related.length > 0 && body.product.related.every((r) => r.category === hoodie.category));
  });
  await t('quote rejects out-of-stock items and missing size', async () => {
    assert.equal((await J('/quote', { items: [{ productId: outOfStock.id, qty: 1, size: outOfStock.sizes[0] }] })).status, 409);
    assert.equal((await J('/quote', { items: [{ productId: hoodie.id, qty: 1 }] })).status, 400);
  });
  await t('quote applies coupon and shipping rules on the server', async () => {
    const q = (await J('/quote', { items: [{ productId: hoodie.id, qty: 1, size: 'M' }], coupon: 'WELCOME10' })).body.quote;
    assert.equal(q.discount, Math.floor(hoodie.price * 0.1)); assert.equal(q.total, hoodie.price - q.discount + q.shipping);
    assert.equal((await J('/quote', { items: [{ productId: hoodie.id, qty: 1, size: 'M' }], coupon: 'NOPE' })).status, 400);
    const cheap = (await J('/products?sort=price-asc')).body.products.find((p) => p.inStock && !p.sizes.length && !p.colors.length);
    assert.equal((await J('/quote', { items: [{ productId: cheap.id, qty: 1 }] })).body.quote.shipping, 79);
  });
  await t('checkout validation reports every bad field', async () => {
    const r = await J('/orders', { ...customer, email: 'bad', phone: '12345', pin: '12', name: '', items: [{ productId: hoodie.id, qty: 1, size: 'M' }] });
    assert.equal(r.status, 422); for (const f of ['email', 'phone', 'pin', 'name']) assert.ok(r.body.fields[f], f);
  });
  await t('order is saved, e-mailed to the shop via SMTP, and client-sent prices are ignored', async () => {
    const before = await stockOf(hoodie.id);
    const r = await J('/orders', { ...customer, notes: 'Ring the bell', items: [{ productId: hoodie.id, qty: 2, size: 'M', price: 1, total: 1 }], coupon: 'WELCOME10', idempotencyKey: 'test-idem-key-000001', total: 1 });
    assert.equal(r.status, 201); orderId = r.body.orderId; assert.match(orderId, /^HK-\d{6}-[A-Z0-9]{6}$/);
    const expectTotal = hoodie.price * 2 - Math.floor(hoodie.price * 2 * 0.1); assert.equal(r.body.total, expectTotal);
    assert.equal(r.body.emailSent, true); assert.equal(await stockOf(hoodie.id), before - 2);
    assert.equal(mails.length, 1); const m = mails[0];
    assert.deepEqual(m.rcpt, ['happymeena278@gmail.com']);
    const decoded = [...m.body.matchAll(/\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/g)].map((x) => Buffer.from(x[1].replace(/\r\n/g, ''), 'base64').toString()).join('\n');
    for (const needle of [orderId, 'Asha Verma', 'asha@example.com', '9876543210', '14 Park Street', 'Kolkata', 'Street Core Hoodie', 'Size M', 'Cash on Delivery', 'Ring the bell']) assert.ok(decoded.includes(needle), 'email missing: ' + needle);
  });
  await t('double-click / retry with the same key does not create a second order or take stock twice', async () => {
    const before = await stockOf(hoodie.id);
    const r = await J('/orders', { ...customer, items: [{ productId: hoodie.id, qty: 2, size: 'M' }], coupon: 'WELCOME10', idempotencyKey: 'test-idem-key-000001' });
    assert.equal(r.body.duplicate, true); assert.equal(r.body.orderId, orderId); assert.equal(await stockOf(hoodie.id), before); assert.equal(mails.length, 1);
  });
  await t('cannot buy more than the stock or an out-of-stock item', async () => {
    assert.equal((await J('/orders', { ...customer, items: [{ productId: outOfStock.id, qty: 1, size: outOfStock.sizes[0] }] })).status, 409);
    assert.equal((await J('/orders', { ...customer, items: [{ productId: hoodie.id, qty: 15, size: 'M' }, { productId: hoodie.id, qty: 15, size: 'L' }] })).status, 409);
  });
  await t('tracking needs the matching e-mail or phone; wrong details leak nothing', async () => {
    const bad = await J('/track', { orderId, contact: 'someone@else.com' }); assert.equal(bad.status, 404);
    assert.equal((await J('/track', { orderId: 'HK-000000-AAAAAA', contact: 'asha@example.com' })).body.error, bad.body.error);
    const byMail = await J('/track', { orderId, contact: 'ASHA@example.com' }); assert.equal(byMail.status, 200);
    const byPhone = await J('/track', { orderId: orderId.toLowerCase(), contact: '098765 43210' }); assert.equal(byPhone.status, 200);
    const o = byMail.body.order; assert.equal(o.status, 'placed'); assert.equal(o.stages.length, 7); assert.ok(o.stages[0].at); assert.equal(o.stages[1].at, null); assert.ok(o.expectedDelivery);
  });
  await t('admin routes are closed without a session and reject bad passwords', async () => {
    for (const p of ['/admin/orders', '/admin/stats', '/admin/products']) assert.equal((await J(p)).status, 401);
    assert.equal((await J('/admin/products', { name: 'x' })).status, 401);
    assert.equal((await J('/admin/login', { email: 'admin@haku.test', password: 'wrong' })).status, 401);
  });
  await t('admin can log in (HttpOnly cookie) and sees the order', async () => {
    const r = await J('/admin/login', { email: 'admin@haku.test', password: 'correct-horse-9' }); assert.equal(r.status, 200);
    const sc = r.headers.get('set-cookie'); assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); cookie = sc.split(';')[0];
    const list = (await J('/admin/orders?q=' + orderId, null, { cookie })).body.orders; assert.equal(list.length, 1); assert.equal(list[0].emailStatus, 'sent');
    assert.equal((await J('/admin/orders?q=Asha', null, { cookie })).body.orders.length, 1); assert.equal((await J('/admin/orders?status=delivered', null, { cookie })).body.orders.length, 0);
    assert.equal((await J('/admin/orders', null, { cookie: cookie.slice(0, -3) + 'xxx' })).status, 401);
  });
  await t('status updates appear on the customer tracking timeline with timestamps', async () => {
    for (const s of ['confirmed', 'processing', 'packed', 'shipped']) assert.equal((await J(`/admin/orders/${orderId}/status`, { status: s, note: 'n' }, { cookie })).status, 200);
    const o = (await J('/track', { orderId, contact: customer.email })).body.order;
    assert.equal(o.status, 'shipped'); assert.ok(o.stages.slice(0, 5).every((s) => s.at)); assert.equal(o.stages[6].at, null);
    assert.equal((await J('/orders/cancel-request', { orderId, contact: customer.email, reason: 'x' })).status, 409);
  });
  await t('cancelling restores stock and shows as cancelled to the customer', async () => {
    const r = await J('/orders', { ...customer, items: [{ productId: hoodie.id, qty: 1, size: 'L' }], idempotencyKey: 'test-idem-key-000002' }); const id2 = r.body.orderId;
    const before = await stockOf(hoodie.id);
    assert.equal((await J('/orders/cancel-request', { orderId: id2, contact: customer.phone, reason: 'Changed my mind' })).status, 200);
    assert.equal((await J('/admin/orders?q=' + id2, null, { cookie })).body.orders[0].cancelRequested, true);
    await J(`/admin/orders/${id2}/status`, { status: 'cancelled' }, { cookie });
    assert.equal(await stockOf(hoodie.id), before + 1);
    assert.equal((await J('/track', { orderId: id2, contact: customer.email })).body.order.status, 'cancelled');
  });
  await t('admin stats count real orders and best sellers', async () => {
    const s = (await J('/admin/stats', null, { cookie })).body.stats; assert.equal(s.orders, 1); assert.ok(s.sales > 0); assert.equal(s.best[0].name, 'Street Core Hoodie');
  });
  await t('admin product CRUD, validation and image upload (magic-byte checked)', async () => {
    assert.equal((await J('/admin/products', { name: 'Bad', category: 'X', price: 500, originalPrice: 100, stock: 1 }, { cookie })).status, 422);
    const c = await J('/admin/products', { name: 'Test Mug', category: 'Home', price: 400, originalPrice: 500, stock: 3, images: ['/img/x.png'], badge: 'New' }, { cookie }); assert.equal(c.status, 201);
    const id = c.body.product.id; assert.equal(c.body.product.discountPct, 20);
    assert.equal((await J('/products/test-mug')).status, 200);
    const u = await fetch(BASE + '/api/admin/products/' + id, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Test Mug', category: 'Home', price: 300, originalPrice: 500, stock: 0 }) }); assert.equal((await u.json()).product.discountPct, 40);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==', 'base64');
    const up = await fetch(BASE + '/api/admin/upload', { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body: png }); const url = (await up.json()).url; assert.match(url, /^\/uploads\/.+\.png$/);
    assert.equal((await fetch(BASE + url)).status, 200);
    assert.equal((await fetch(BASE + '/api/admin/upload', { method: 'POST', headers: { cookie }, body: Buffer.from('<svg onload=alert(1)>') })).status, 415);
    assert.equal((await fetch(BASE + '/api/admin/products/' + id, { method: 'DELETE', headers: { cookie } })).status, 200); assert.equal((await J('/products/test-mug')).status, 404);
  });
  await t('contact form e-mails the shop; newsletter dedupes; reviews wait for approval', async () => {
    const n = mails.length;
    assert.equal((await J('/contact', { name: 'Ravi', email: 'ravi@example.com', subject: 'Size help', message: 'Does the hoodie run large?' })).body.emailSent, true); assert.equal(mails.length, n + 1);
    assert.equal((await J('/contact', { name: 'R', email: 'bad', subject: '', message: 'x' })).status, 422);
    assert.equal((await J('/newsletter', { email: 'fan@example.com' })).body.already, false); assert.equal((await J('/newsletter', { email: 'fan@example.com' })).body.already, true);
    assert.equal((await J(`/products/${hoodie.id}/reviews`, { name: 'Meera', rating: 5, comment: 'Lovely hoodie, warm and soft.' })).status, 201);
    assert.equal((await J('/products/' + hoodie.slug)).body.product.reviews.length, 0);
    const pending = (await J('/admin/reviews', null, { cookie })).body.reviews[0]; await J('/admin/reviews/' + pending.id, { approved: true }, { cookie });
    const p = (await J('/products/' + hoodie.slug)).body.product; assert.equal(p.reviews.length, 1); assert.equal(p.ratingIsSample, false); assert.equal(p.rating, 5);
  });
  await t('pages render with real 404 status and security headers', async () => {
    for (const p of ['/', '/shop', '/product/' + hoodie.slug, '/track', '/checkout', '/contact', '/admin', '/policy/returns']) assert.equal((await fetch(BASE + p)).status, 200, p);
    const nf = await fetch(BASE + '/no-such-page'); assert.equal(nf.status, 404); assert.equal(nf.headers.get('x-frame-options'), 'DENY');
    assert.match(await (await fetch(BASE + '/product/' + hoodie.slug)).text(), /Street Core Hoodie \| HAKU/);
    assert.equal((await fetch(BASE + '/data/haku.db')).status, 404); assert.equal((await fetch(BASE + '/../server.js')).status, 404);
  });

  server.kill(); smtp.close();
  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED\n' + log.slice(-1500) : ''}`);
  fs.rmSync(tmp, { recursive: true, force: true });
})();
