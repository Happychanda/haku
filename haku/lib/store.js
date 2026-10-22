'use strict';
const { db, tx } = require('./db');
const config = require('./config');
const U = require('./util');
const { sendEmail, orderEmail } = require('./email');

const STAGES = ['placed', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
const STAGE_LABELS = {
  placed: 'Order Placed', confirmed: 'Order Confirmed', processing: 'Processing', packed: 'Packed',
  shipped: 'Shipped', out_for_delivery: 'Out for Delivery', delivered: 'Delivered',
  cancelled: 'Cancelled', returned: 'Returned',
};
const ALL_STATUSES = [...STAGES, 'cancelled', 'returned'];

class HttpError extends Error {
  constructor(status, message, fields) { super(message); this.status = status; this.fields = fields; }
}
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------- Products ----------
function ratingFor(row) {
  const r = db.prepare('SELECT COUNT(*) c, AVG(rating) a FROM reviews WHERE product_id = ? AND approved = 1').get(row.id);
  if (r.c > 0) return { rating: Math.round(r.a * 10) / 10, reviewCount: r.c, ratingIsSample: false };
  if (row.rating_seed_count > 0) return { rating: row.rating_seed, reviewCount: row.rating_seed_count, ratingIsSample: true };
  return { rating: 0, reviewCount: 0, ratingIsSample: false };
}
function shapeProduct(row, { admin = false } = {}) {
  const p = {
    id: row.id, slug: row.slug, name: row.name, shortDesc: row.short_desc, description: row.description,
    category: row.category, originalPrice: row.original_price, price: row.price,
    discountPct: U.discountPct(row.original_price, row.price),
    images: json(row.images, []), sizes: json(row.sizes, []), colors: json(row.colors, []),
    stock: row.stock, inStock: row.stock > 0, lowStock: row.stock > 0 && row.stock <= 5,
    badge: row.badge, sold: row.sold, createdAt: row.created_at,
    ...ratingFor(row),
  };
  if (admin) { p.active = !!row.active; p.ratingSeed = row.rating_seed; p.ratingSeedCount = row.rating_seed_count; }
  return p;
}
function listProducts(q = {}) {
  let rows = db.prepare('SELECT * FROM products WHERE active = 1').all().map((r) => shapeProduct(r));
  const s = (q.q || '').toLowerCase().trim();
  if (s) rows = rows.filter((p) => `${p.name} ${p.shortDesc} ${p.category} ${p.badge}`.toLowerCase().includes(s));
  if (q.category) rows = rows.filter((p) => p.category.toLowerCase() === String(q.category).toLowerCase());
  if (q.min) rows = rows.filter((p) => p.price >= Number(q.min));
  if (q.max) rows = rows.filter((p) => p.price <= Number(q.max));
  if (q.rating) rows = rows.filter((p) => p.rating >= Number(q.rating));
  if (q.discount === '1') rows = rows.filter((p) => p.discountPct > 0);
  if (q.badge) rows = rows.filter((p) => p.badge === q.badge);
  if (q.ids) { const ids = String(q.ids).split(',').map(Number); rows = rows.filter((p) => ids.includes(p.id)); }
  const sorters = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    popular: (a, b) => b.sold - a.sold,
    newest: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id),
    discount: (a, b) => b.discountPct - a.discountPct,
  };
  if (sorters[q.sort]) rows.sort(sorters[q.sort]);
  return rows;
}
function getProduct(slugOrId) {
  const row = /^\d+$/.test(String(slugOrId))
    ? db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(slugOrId))
    : db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(slugOrId);
  if (!row) return null;
  const p = shapeProduct(row);
  p.reviews = db.prepare('SELECT name, rating, comment, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY id DESC LIMIT 30').all(row.id);
  p.related = db.prepare('SELECT * FROM products WHERE active = 1 AND category = ? AND id != ? ORDER BY sold DESC LIMIT 4').all(row.category, row.id).map((r) => shapeProduct(r));
  return p;
}
function categories() {
  return db.prepare('SELECT category name, COUNT(*) count FROM products WHERE active = 1 GROUP BY category ORDER BY name').all();
}

// ---------- Pricing (server is the single source of truth) ----------
function validateCoupon(code, subtotal) {
  const c = U.clean(code, 40).toUpperCase();
  if (!c) return { discount: 0, code: '' };
  const row = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(c);
  if (!row || (row.expires_at && new Date(row.expires_at) < new Date())) throw new HttpError(400, 'That coupon code is not valid.', { coupon: 'Invalid or expired coupon' });
  if (subtotal < row.min_subtotal) throw new HttpError(400, `This coupon needs a minimum order of ₹${row.min_subtotal}.`, { coupon: `Minimum order ₹${row.min_subtotal}` });
  const discount = row.type === 'percent' ? Math.floor((subtotal * row.value) / 100) : Math.min(row.value, subtotal);
  return { discount, code: row.code };
}
function quote(rawItems, couponCode) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new HttpError(400, 'Your cart is empty.');
  if (rawItems.length > 30) throw new HttpError(400, 'Too many different items in the cart.');
  const merged = new Map();
  for (const it of rawItems) {
    const id = Number(it && it.productId);
    const qty = Math.floor(Number(it && it.qty));
    if (!Number.isInteger(id) || !(qty >= 1) || qty > 20) throw new HttpError(400, 'A cart item has an invalid quantity.');
    const size = U.clean(it.size, 20), color = U.clean(it.color, 30);
    const key = `${id}|${size}|${color}`;
    merged.set(key, { id, qty: (merged.get(key)?.qty || 0) + qty, size, color });
  }
  const items = [];
  const stockUse = new Map();
  for (const m of merged.values()) {
    const row = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(m.id);
    if (!row) throw new HttpError(409, 'One of the products in your cart is no longer available.', { items: 'unavailable' });
    const sizes = json(row.sizes, []), colors = json(row.colors, []);
    if (sizes.length && !sizes.includes(m.size)) throw new HttpError(400, `Please choose a size for ${row.name}.`);
    if (colors.length && !colors.includes(m.color)) throw new HttpError(400, `Please choose a colour for ${row.name}.`);
    const used = (stockUse.get(row.id) || 0) + m.qty;
    stockUse.set(row.id, used);
    if (row.stock <= 0) throw new HttpError(409, `${row.name} is out of stock.`, { items: 'out_of_stock' });
    if (used > row.stock) throw new HttpError(409, `Only ${row.stock} of ${row.name} left in stock.`, { items: 'insufficient_stock' });
    items.push({
      productId: row.id, name: row.name, image: json(row.images, [])[0] || '', qty: m.qty, price: row.price, originalPrice: row.original_price,
      variant: [m.size && `Size ${m.size}`, m.color].filter(Boolean).join(' / '), size: m.size, color: m.color,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const mrpTotal = items.reduce((s, i) => s + i.originalPrice * i.qty, 0);
  const { discount, code } = validateCoupon(couponCode, subtotal);
  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= config.freeShippingAbove ? 0 : config.shippingFlat;
  return {
    items, itemCount: items.reduce((s, i) => s + i.qty, 0), mrpTotal, saved: mrpTotal - subtotal,
    subtotal, discount, coupon: code, shipping, total: afterDiscount + shipping,
    freeShippingAbove: config.freeShippingAbove,
  };
}

// ---------- Orders ----------
function validateCustomer(b) {
  const f = {};
  const c = {
    name: U.clean(b.name, 80), email: U.clean(b.email, 120).toLowerCase(), phone: U.normPhone(U.clean(b.phone, 20)),
    address: U.clean(b.address, 300), city: U.clean(b.city, 60), state: U.clean(b.state, 60), pin: U.clean(b.pin, 6), notes: U.clean(b.notes, 300),
  };
  if (c.name.length < 2) f.name = 'Please enter your full name';
  if (!U.EMAIL_RE.test(c.email)) f.email = 'Enter a valid email address';
  if (!U.PHONE_RE.test(c.phone)) f.phone = 'Enter a valid 10-digit Indian mobile number';
  if (c.address.length < 8) f.address = 'Please enter your complete delivery address';
  if (c.city.length < 2) f.city = 'Enter your city';
  if (c.state.length < 2) f.state = 'Select your state';
  if (!U.PIN_RE.test(c.pin)) f.pin = 'Enter a valid 6-digit PIN code';
  if (Object.keys(f).length) throw new HttpError(422, 'Please fix the highlighted fields.', f);
  return c;
}
function orderRow(order_id) { return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(order_id); }

async function placeOrder(body) {
  const customer = validateCustomer(body);
  const method = U.clean(body.paymentMethod || 'cod', 10);
  if (method !== 'cod') throw new HttpError(400, 'Only Cash on Delivery is available right now.', { paymentMethod: 'Choose Cash on Delivery' });
  const key = /^[A-Za-z0-9-]{16,64}$/.test(body.idempotencyKey || '') ? body.idempotencyKey : null;

  if (key) { // repeated click / retry of the same checkout attempt returns the same order
    const existing = db.prepare('SELECT order_id FROM orders WHERE idempotency_key = ?').get(key);
    if (existing) return finishOrderResponse(existing.order_id, true);
  }

  let orderId;
  try {
    orderId = tx(() => {
      const q = quote(body.items, body.coupon); // re-priced and stock-checked inside the transaction
      for (const it of q.items) {
        const r = db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ? AND stock >= ?').run(it.qty, it.qty, it.productId, it.qty);
        if (r.changes !== 1) throw new HttpError(409, `${it.name} just went out of stock. Please update your cart.`);
      }
      const id = U.newOrderId();
      const stored = q.items.map(({ productId, name, image, qty, price, originalPrice, variant }) => ({ productId, name, image, qty, price, originalPrice, variant }));
      db.prepare(`INSERT INTO orders (order_id, idempotency_key, name, email, phone, address, city, state, pin, notes, items, subtotal, discount, coupon, shipping, total, payment_method, payment_status, status, expected_delivery)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'placed', ?)`).run(
        id, key, customer.name, customer.email, customer.phone, customer.address, customer.city, customer.state, customer.pin, customer.notes,
        JSON.stringify(stored), q.subtotal, q.discount, q.coupon, q.shipping, q.total, 'cod', 'pending', U.addDays(config.deliveryDays));
      db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)').run(id, 'placed', 'Order placed by customer');
      return id;
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (key && /UNIQUE/i.test(String(err.message))) { // lost a race with a duplicate request
      const existing = db.prepare('SELECT order_id FROM orders WHERE idempotency_key = ?').get(key);
      if (existing) return finishOrderResponse(existing.order_id, true);
    }
    console.error('[order] save failed:', err);
    throw new HttpError(500, 'We could not save your order. Nothing was charged. Please try again.');
  }

  // Order is safely stored. Now notify the shop; the result is recorded honestly.
  const order = orderRow(orderId);
  const mail = orderEmail(order, json(order.items, []));
  const result = await sendEmail({ to: config.notifyEmail, ...mail });
  db.prepare('UPDATE orders SET email_status = ?, email_error = ? WHERE order_id = ?').run(result.ok ? 'sent' : 'failed', result.ok ? '' : result.error, orderId);
  if (!result.ok) console.error(`[order ${orderId}] shop email NOT sent:`, result.error);
  return finishOrderResponse(orderId, false);
}
function finishOrderResponse(orderId, duplicate) {
  const o = orderRow(orderId);
  return { orderId: o.order_id, total: o.total, emailSent: o.email_status === 'sent', duplicate, status: o.status };
}
async function resendOrderEmail(orderId) {
  const order = orderRow(orderId);
  if (!order) throw new HttpError(404, 'Order not found');
  const result = await sendEmail({ to: config.notifyEmail, ...orderEmail(order, json(order.items, [])) });
  db.prepare('UPDATE orders SET email_status = ?, email_error = ? WHERE order_id = ?').run(result.ok ? 'sent' : 'failed', result.ok ? '' : result.error, orderId);
  return result;
}

// ---------- Tracking (customer-facing, verified) ----------
function trackOrder(orderId, contact) {
  const generic = new HttpError(404, "We couldn't find an order matching those details. Check the order ID and the email or phone number used at checkout.");
  const id = U.clean(orderId, 40).toUpperCase();
  const c = U.clean(contact, 120).toLowerCase();
  if (!id || !c) throw generic;
  const o = orderRow(id);
  if (!o) throw generic;
  const matches = c.includes('@') ? c === o.email : U.normPhone(c) === o.phone;
  if (!matches) throw generic; // same message either way: never confirm that an ID exists
  const events = db.prepare('SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').all(id);
  return {
    orderId: o.order_id, status: o.status, statusLabel: STAGE_LABELS[o.status], placedAt: o.created_at,
    expectedDelivery: o.expected_delivery, items: json(o.items, []),
    totals: { subtotal: o.subtotal, discount: o.discount, shipping: o.shipping, total: o.total, coupon: o.coupon },
    paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    shipTo: { name: o.name, address: o.address, city: o.city, state: o.state, pin: o.pin },
    cancelRequested: !!o.cancel_requested,
    stages: STAGES.map((s) => ({ key: s, label: STAGE_LABELS[s], at: (events.find((e) => e.status === s) || {}).created_at || null })),
    events,
  };
}
function requestCancellation(orderId, contact, reason) {
  const t = trackOrder(orderId, contact); // verifies ownership
  if (['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(t.status)) {
    throw new HttpError(409, 'This order can no longer be cancelled online. Please contact us for help.');
  }
  db.prepare('UPDATE orders SET cancel_requested = 1, cancel_reason = ? WHERE order_id = ?').run(U.clean(reason, 300), t.orderId);
  db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)').run(t.orderId, t.status, 'Customer requested cancellation');
  return { ok: true };
}

// ---------- Admin order operations ----------
function setOrderStatus(orderId, status, { note = '', expectedDelivery } = {}) {
  if (!ALL_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  return tx(() => {
    const o = orderRow(orderId);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === status && expectedDelivery === undefined) return o;
    const wasCancelled = ['cancelled', 'returned'].includes(o.status);
    const nowCancelled = ['cancelled', 'returned'].includes(status);
    if (!wasCancelled && nowCancelled) { // put stock back
      for (const it of json(o.items, [])) db.prepare('UPDATE products SET stock = stock + ?, sold = MAX(sold - ?, 0) WHERE id = ?').run(it.qty, it.qty, it.productId);
    } else if (wasCancelled && !nowCancelled) {
      for (const it of json(o.items, [])) {
        const r = db.prepare('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ? AND stock >= ?').run(it.qty, it.qty, it.productId, it.qty);
        if (r.changes !== 1) throw new HttpError(409, `Not enough stock of ${it.name} to reinstate this order`);
      }
    }
    let payStatus = o.payment_status;
    if (status === 'delivered' && o.payment_method === 'cod') payStatus = 'paid';
    if (nowCancelled && payStatus !== 'paid') payStatus = 'void';
    const exp = expectedDelivery === undefined ? o.expected_delivery : (expectedDelivery || null);
    db.prepare('UPDATE orders SET status = ?, payment_status = ?, expected_delivery = ?, cancel_requested = CASE WHEN ? THEN 0 ELSE cancel_requested END WHERE order_id = ?')
      .run(status, payStatus, exp, nowCancelled ? 1 : 0, orderId);
    if (o.status !== status) db.prepare('INSERT INTO order_events (order_id, status, note) VALUES (?,?,?)').run(orderId, status, U.clean(note, 200));
    return orderRow(orderId);
  });
}
function adminOrderShape(o) {
  return {
    orderId: o.order_id, name: o.name, email: o.email, phone: o.phone, address: o.address, city: o.city, state: o.state, pin: o.pin,
    notes: o.notes, items: json(o.items, []), subtotal: o.subtotal, discount: o.discount, coupon: o.coupon, shipping: o.shipping, total: o.total,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status, status: o.status, expectedDelivery: o.expected_delivery,
    emailStatus: o.email_status, emailError: o.email_error, cancelRequested: !!o.cancel_requested, cancelReason: o.cancel_reason, createdAt: o.created_at,
  };
}
function adminListOrders({ q = '', status = '' } = {}) {
  let rows = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
  const s = q.toLowerCase().trim();
  if (s) rows = rows.filter((o) => `${o.order_id} ${o.name} ${o.email} ${o.phone} ${o.status}`.toLowerCase().includes(s));
  if (status) rows = rows.filter((o) => o.status === status);
  return rows.map(adminOrderShape);
}
function adminStats() {
  const live = "status NOT IN ('cancelled','returned')";
  const t = db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) sales FROM orders WHERE ${live}`).get();
  const byStatus = db.prepare('SELECT status, COUNT(*) count FROM orders GROUP BY status').all();
  const per = new Map();
  for (const o of db.prepare(`SELECT items FROM orders WHERE ${live}`).all()) {
    for (const i of json(o.items, [])) { const e = per.get(i.name) || { name: i.name, qty: 0, revenue: 0 }; e.qty += i.qty; e.revenue += i.qty * i.price; per.set(i.name, e); }
  }
  const pending = db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('placed','confirmed','processing')").get().c;
  const cancelReq = db.prepare("SELECT COUNT(*) c FROM orders WHERE cancel_requested = 1 AND status NOT IN ('cancelled','returned')").get().c;
  const emailFailed = db.prepare("SELECT COUNT(*) c FROM orders WHERE email_status = 'failed'").get().c;
  const lowStock = db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock').all();
  return { orders: t.orders, sales: t.sales, pending, cancelRequests: cancelReq, emailFailed, byStatus, lowStock, best: [...per.values()].sort((a, b) => b.qty - a.qty).slice(0, 5) };
}

// ---------- Admin product operations ----------
function cleanProduct(b, existing) {
  const f = {};
  const name = U.clean(b.name, 120);
  const category = U.clean(b.category, 40);
  const price = Math.round(Number(b.price));
  const originalPrice = Math.round(Number(b.originalPrice || b.price));
  const stock = Math.round(Number(b.stock));
  if (!name) f.name = 'Name is required';
  if (!category) f.category = 'Category is required';
  if (!(price > 0)) f.price = 'Enter a valid price';
  if (!(originalPrice >= price)) f.originalPrice = 'Original price must be at least the selling price';
  if (!(stock >= 0)) f.stock = 'Stock must be 0 or more';
  if (Object.keys(f).length) throw new HttpError(422, 'Please fix the highlighted fields.', f);
  const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => U.clean(s, 40)).filter(Boolean).slice(0, 12);
  const images = (Array.isArray(b.images) ? b.images : String(b.images || '').split('\n')).map((s) => U.clean(s, 300)).filter((s) => /^(\/|https:\/\/)/.test(s)).slice(0, 8);
  const seed = Math.min(5, Math.max(0, Number(b.ratingSeed) || 0));
  return {
    name, category, price, originalPrice, stock, images, sizes: list(b.sizes), colors: list(b.colors),
    shortDesc: U.clean(b.shortDesc, 160), description: U.clean(b.description, 3000),
    badge: ['New', 'Popular', 'Best Seller', 'Trending'].includes(b.badge) ? b.badge : '',
    ratingSeed: seed, ratingSeedCount: Math.max(0, Math.round(Number(b.ratingSeedCount) || 0)), active: b.active === false ? 0 : 1,
  };
}
function uniqueSlug(name, exceptId) {
  const base = U.slugify(name); let s = base, n = 2;
  while (db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').get(s, exceptId || -1)) s = `${base}-${n++}`;
  return s;
}
function createProduct(b) {
  const p = cleanProduct(b);
  const r = db.prepare(`INSERT INTO products (slug,name,short_desc,description,category,original_price,price,images,sizes,colors,stock,badge,rating_seed,rating_seed_count,active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(uniqueSlug(p.name), p.name, p.shortDesc, p.description, p.category, p.originalPrice, p.price,
    JSON.stringify(p.images), JSON.stringify(p.sizes), JSON.stringify(p.colors), p.stock, p.badge, p.ratingSeed, p.ratingSeedCount, p.active);
  return shapeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(r.lastInsertRowid), { admin: true });
}
function updateProduct(id, b) {
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Product not found');
  const p = cleanProduct(b, cur);
  db.prepare(`UPDATE products SET name=?, slug=?, short_desc=?, description=?, category=?, original_price=?, price=?, images=?, sizes=?, colors=?, stock=?, badge=?, rating_seed=?, rating_seed_count=?, active=? WHERE id=?`)
    .run(p.name, uniqueSlug(p.name, id), p.shortDesc, p.description, p.category, p.originalPrice, p.price, JSON.stringify(p.images), JSON.stringify(p.sizes), JSON.stringify(p.colors), p.stock, p.badge, p.ratingSeed, p.ratingSeedCount, p.active, id);
  return shapeProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id), { admin: true });
}
function deleteProduct(id) {
  // Past orders keep their own item snapshot, so deleting a product never alters order history.
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  if (!r.changes) throw new HttpError(404, 'Product not found');
}
function adminListProducts() {
  return db.prepare('SELECT * FROM products ORDER BY id DESC').all().map((r) => shapeProduct(r, { admin: true }));
}

// ---------- Reviews, contact, newsletter ----------
function addReview(productId, b) {
  const p = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(Number(productId));
  if (!p) throw new HttpError(404, 'Product not found');
  const name = U.clean(b.name, 60), rating = Math.round(Number(b.rating)), comment = U.clean(b.comment, 600);
  const f = {};
  if (name.length < 2) f.name = 'Enter your name';
  if (!(rating >= 1 && rating <= 5)) f.rating = 'Choose 1 to 5 stars';
  if (comment.length < 3) f.comment = 'Please write a short review';
  if (Object.keys(f).length) throw new HttpError(422, 'Please fix the highlighted fields.', f);
  db.prepare('INSERT INTO reviews (product_id, name, rating, comment, approved) VALUES (?,?,?,?,0)').run(p.id, name, rating, comment);
}
async function addContact(b) {
  const f = {};
  const m = { name: U.clean(b.name, 80), email: U.clean(b.email, 120).toLowerCase(), phone: U.clean(b.phone, 20), subject: U.clean(b.subject, 120), message: U.clean(b.message, 2000) };
  if (m.name.length < 2) f.name = 'Enter your name';
  if (!U.EMAIL_RE.test(m.email)) f.email = 'Enter a valid email address';
  if (m.phone && !U.PHONE_RE.test(U.normPhone(m.phone))) f.phone = 'Enter a valid 10-digit mobile number or leave blank';
  if (m.subject.length < 3) f.subject = 'Add a subject';
  if (m.message.length < 10) f.message = 'Please write at least a few words';
  if (Object.keys(f).length) throw new HttpError(422, 'Please fix the highlighted fields.', f);
  const r = db.prepare('INSERT INTO contact_messages (name,email,phone,subject,message) VALUES (?,?,?,?,?)').run(m.name, m.email, m.phone, m.subject, m.message);
  const { esc } = require('./email');
  const res = await sendEmail({
    to: config.notifyEmail, replyTo: m.email, subject: `HAKU contact: ${m.subject}`,
    text: `From: ${m.name} <${m.email}> ${m.phone}\n\n${m.message}`,
    html: `<p><b>${esc(m.name)}</b> &lt;${esc(m.email)}&gt; ${esc(m.phone)}</p><p>${esc(m.message).replace(/\n/g, '<br>')}</p>`,
  });
  db.prepare('UPDATE contact_messages SET email_status = ? WHERE id = ?').run(res.ok ? 'sent' : 'failed', r.lastInsertRowid);
  return { emailSent: res.ok };
}
function addSubscriber(email) {
  const e = U.clean(email, 120).toLowerCase();
  if (!U.EMAIL_RE.test(e)) throw new HttpError(422, 'Enter a valid email address', { email: 'Enter a valid email address' });
  const r = db.prepare('INSERT OR IGNORE INTO newsletter (email) VALUES (?)').run(e);
  return { already: r.changes === 0 };
}
function publicCoupons() {
  return db.prepare("SELECT code, type, value, min_subtotal minSubtotal FROM coupons WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY code").all();
}
function latestReviews() {
  return db.prepare('SELECT r.name, r.rating, r.comment, r.created_at createdAt, p.name product, p.slug FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.approved = 1 AND p.active = 1 ORDER BY r.id DESC LIMIT 6').all();
}
function activePromotion() {
  return db.prepare("SELECT title, subtitle, ends_at endsAt FROM promotions WHERE active = 1 AND ends_at > datetime('now') ORDER BY ends_at LIMIT 1").get() || null;
}

module.exports = {
  HttpError, STAGES, STAGE_LABELS, ALL_STATUSES, listProducts, getProduct, categories, quote, placeOrder, resendOrderEmail,
  trackOrder, requestCancellation, setOrderStatus, adminListOrders, adminStats, createProduct, updateProduct, deleteProduct,
  adminListProducts, addReview, addContact, addSubscriber, activePromotion, publicCoupons, latestReviews, validateCoupon, orderRow, adminOrderShape,
};
