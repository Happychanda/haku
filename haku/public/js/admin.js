// Admin dashboard (all data comes from admin-only API routes; the server enforces the session)
import { $, $$, esc, inr, dt, api, toast, withLoading, getConfig } from './core.js';

const main = () => $('#main');
const STATUS = [['placed', 'Order Placed'], ['confirmed', 'Order Confirmed'], ['processing', 'Processing'], ['packed', 'Packed'], ['shipped', 'Shipped'], ['out_for_delivery', 'Out for Delivery'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['returned', 'Returned']];
const label = (s) => (STATUS.find((x) => x[0] === s) || [, s])[1];
let tab = 'dashboard';

export async function admin() {
  document.title = 'Admin | HAKU';
  let me;
  try { me = await api('/admin/me'); } catch (e) { main().innerHTML = `<div class="page"><div class="wrap"><div class="note err">${esc(e.message)}</div></div></div>`; return; }
  if (!me.admin) return loginView(me);
  shell(me);
}

function loginView(me) {
  main().innerHTML = `<div class="page"><div class="wrap"><form class="panel login-card" id="login" novalidate>
    <h1 style="font-size:2rem;font-weight:900;text-transform:uppercase">Admin login</h1>
    ${me.configured ? '' : '<div class="note warn">Admin login is not configured yet. Set <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> in your <code>.env</code> file and restart the server.</div>'}
    <div class="field"><label for="a-e">Email</label><input class="input" id="a-e" name="email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="a-p">Password</label><input class="input" id="a-p" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn" type="submit">Sign in</button><div id="a-err" role="alert"></div></form></div></div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    await withLoading(e.target.querySelector('button'), async () => {
      try { await api('/admin/login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } }); admin(); }
      catch (err) { $('#a-err').innerHTML = `<div class="note err">${esc(err.message)}</div>`; }
    });
  });
}

function shell(me) {
  const tabs = [['dashboard', 'Dashboard'], ['orders', 'Orders'], ['products', 'Products'], ['reviews', 'Reviews'], ['messages', 'Messages'], ['offers', 'Coupons & Sale']];
  main().innerHTML = `<div class="page"><div class="wrap">
    <div class="toolbar"><h1 class="page-title" style="margin:0;font-size:clamp(1.8rem,6vw,3rem)">Admin</h1><button class="btn ghost sm" id="logout">Sign out</button></div>
    ${me.emailConfigured ? '' : '<div class="note warn" style="margin-bottom:12px">Order emails are <b>not configured</b>. Orders are saved, but no email is sent until you set <code>RESEND_API_KEY</code> or the <code>SMTP_*</code> values in <code>.env</code>.</div>'}
    <div class="admin-tabs" role="tablist">${tabs.map(([k, l]) => `<button class="chip ${k === tab ? 'on' : ''}" role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="a-body"></div></div></div>`;
  $('#logout').addEventListener('click', async () => { await api('/admin/logout', { method: 'POST' }); admin(); });
  $('.admin-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; $$('.admin-tabs .chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); render(); });
  render();
}
const body = () => $('#a-body');
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.status === 401) { toast('Session expired. Please sign in again.', 'err'); admin(); } else body() && (body().innerHTML = `<div class="note err">${esc(e.message)}</div>`); } };
function render() { ({ dashboard, orders, products, reviews, messages, offers }[tab] || dashboard)(); }

// ---------- Dashboard ----------
const dashboard = guard(async () => {
  body().innerHTML = '<div class="skeleton" style="min-height:120px"></div>';
  const { stats: s } = await api('/admin/stats');
  body().innerHTML = `<div class="stat-grid">
    <div class="stat"><b>${s.orders}</b><span>Total orders (excl. cancelled)</span></div><div class="stat"><b>${inr(s.sales)}</b><span>Total sales</span></div>
    <div class="stat"><b>${s.pending}</b><span>Orders to process</span></div><div class="stat"><b>${s.cancelRequests}</b><span>Cancellation requests</span></div><div class="stat"><b style="${s.emailFailed ? 'color:var(--danger)' : ''}">${s.emailFailed}</b><span>Order emails failed</span></div></div>
    <div class="co" style="margin-top:18px"><div class="panel"><h2 style="font-size:1.3rem;margin-bottom:10px">Best-selling products</h2>${s.best.length ? `<div class="table-wrap" style="border:0"><table style="min-width:0"><tr><th>Product</th><th>Units</th><th>Revenue</th></tr>${s.best.map((b) => `<tr><td>${esc(b.name)}</td><td>${b.qty}</td><td>${inr(b.revenue)}</td></tr>`).join('')}</table></div>` : '<p style="color:var(--muted)">No sales yet.</p>'}</div>
    <div class="panel"><h2 style="font-size:1.3rem;margin-bottom:10px">Low stock (5 or fewer)</h2>${s.lowStock.length ? `<table style="min-width:0"><tr><th>Product</th><th>Stock</th></tr>${s.lowStock.map((b) => `<tr><td>${esc(b.name)}</td><td><b style="color:${b.stock ? 'var(--warn)' : 'var(--danger)'}">${b.stock}</b></td></tr>`).join('')}</table>` : '<p style="color:var(--muted)">All products are well stocked.</p>'}
      <h2 style="font-size:1.3rem;margin:18px 0 10px">Orders by status</h2><div class="chips">${s.byStatus.map((b) => `<span class="chip" style="cursor:default">${esc(label(b.status))}: ${b.count}</span>`).join('') || '<span style="color:var(--muted)">No orders yet.</span>'}</div></div></div>`;
});

// ---------- Orders ----------
const orders = guard(async () => {
  body().innerHTML = `<div class="toolbar"><div class="row2" style="flex:1;min-width:260px"><input class="input" id="o-q" type="search" placeholder="Search order ID, customer, phone, status" aria-label="Search orders"><select class="input" id="o-s" aria-label="Filter by status"><option value="">All statuses</option>${STATUS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div></div><div id="o-list"></div>`;
  let t;
  const load = guard(async () => {
    const q = new URLSearchParams({ q: $('#o-q').value, status: $('#o-s').value });
    const { orders: list } = await api('/admin/orders?' + q);
    $('#o-list').innerHTML = list.length ? `<div class="table-wrap"><table><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Email</th><th></th></tr>${list.map((o) => `<tr><td><b>${esc(o.orderId)}</b><br><small>${dt(o.createdAt)}</small></td><td>${esc(o.name)}<br><small>${esc(o.phone)}</small></td><td>${o.items.reduce((s, i) => s + i.qty, 0)}</td><td>${inr(o.total)}</td><td>${esc(label(o.status))}${o.cancelRequested && !['cancelled', 'returned'].includes(o.status) ? '<br><small style="color:var(--danger);font-weight:700">Cancel requested</small>' : ''}</td><td>${o.emailStatus === 'sent' ? '<span style="color:var(--ok)">Sent</span>' : `<span style="color:var(--danger)">${esc(o.emailStatus)}</span>`}</td><td><button class="btn ghost sm" data-order="${esc(o.orderId)}">Open</button></td></tr>`).join('')}</table></div>` : '<div class="empty"><h3>No orders found</h3></div>';
    $$('[data-order]').forEach((b) => b.addEventListener('click', () => openOrder(list.find((o) => o.orderId === b.dataset.order), load)));
  });
  $('#o-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); }); $('#o-s').addEventListener('change', load);
  load();
});

function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="modal-card">${html}</div>`; document.body.appendChild(m); document.body.classList.add('lock');
  const close = () => { m.remove(); document.body.classList.remove('lock'); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_); m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
  m.querySelector('[data-close]')?.addEventListener('click', close);
  return { el: m, close };
}

function openOrder(o, reload) {
  const m = modal(`<div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><h2 style="font-size:1.5rem">${esc(o.orderId)}</h2><small style="color:var(--muted)">Placed ${dt(o.createdAt)}</small></div><button class="btn ghost sm" data-close>Close</button></div>
    ${o.cancelRequested && !['cancelled', 'returned'].includes(o.status) ? `<div class="note warn"><b>Customer requested cancellation.</b> ${esc(o.cancelReason || '')}</div>` : ''}
    ${o.emailStatus !== 'sent' ? `<div class="note err">Shop email for this order was <b>${esc(o.emailStatus)}</b>${o.emailError ? `: ${esc(o.emailError)}` : ''}. <button class="btn sm" id="resend" style="margin-left:6px">Retry email</button></div>` : ''}
    <div class="row2"><div class="panel"><div class="lbl">Customer</div><p>${esc(o.name)}<br>${esc(o.email)}<br>${esc(o.phone)}</p></div><div class="panel"><div class="lbl">Ship to</div><p>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.state)} ${esc(o.pin)}</p>${o.notes ? `<p style="margin-top:6px"><b>Note:</b> ${esc(o.notes)}</p>` : ''}</div></div>
    <div class="table-wrap"><table style="min-width:0"><tr><th>Item</th><th>Qty</th><th>Price</th></tr>${o.items.map((i) => `<tr><td>${esc(i.name)}${i.variant ? `<br><small>${esc(i.variant)}</small>` : ''}</td><td>${i.qty}</td><td>${inr(i.price * i.qty)}</td></tr>`).join('')}</table></div>
    <div class="sum"><div><span>Subtotal</span><span>${inr(o.subtotal)}</span></div><div><span>Discount ${esc(o.coupon)}</span><span>-${inr(o.discount)}</span></div><div><span>Shipping</span><span>${inr(o.shipping)}</span></div><div class="tot"><span>Total (${o.paymentMethod.toUpperCase()}, ${esc(o.paymentStatus)})</span><span>${inr(o.total)}</span></div></div>
    <form id="st-form" class="admin-form"><div class="row2"><div class="field"><label for="st">Status</label><select class="input" id="st" name="status">${STATUS.map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="ex">Expected delivery</label><input class="input" id="ex" name="exp" type="date" value="${esc(o.expectedDelivery || '')}"></div></div>
      <div class="field"><label for="nt">Note (shown in history)</label><input class="input" id="nt" name="note" maxlength="200" placeholder="e.g. Courier: Delhivery, AWB 12345"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn lime" type="submit">Update order</button><button class="btn danger" type="button" id="cancel-o" ${['cancelled', 'returned'].includes(o.status) ? 'disabled' : ''}>Cancel order</button></div><div id="st-out" role="status"></div></form>`);
  const send = guard(async (status) => {
    const f = $('#st-form', m.el);
    await api(`/admin/orders/${encodeURIComponent(o.orderId)}/status`, { method: 'POST', body: { status, note: f.note.value, expectedDelivery: f.exp.value } });
    toast('Order updated'); m.close(); reload();
  });
  $('#st-form', m.el).addEventListener('submit', (e) => { e.preventDefault(); withLoading(e.target.querySelector('button[type=submit]'), () => send(e.target.status.value)); });
  $('#cancel-o', m.el)?.addEventListener('click', () => { if (confirm(`Cancel order ${o.orderId}? Stock will be returned.`)) send('cancelled'); });
  $('#resend', m.el)?.addEventListener('click', (e) => withLoading(e.currentTarget, async () => { const r = await api(`/admin/orders/${encodeURIComponent(o.orderId)}/resend-email`, { method: 'POST' }); toast(r.ok ? 'Email sent' : `Email failed: ${r.error}`, r.ok ? 'ok' : 'err'); if (r.ok) { m.close(); reload(); } }));
}

// ---------- Products ----------
const products = guard(async () => {
  body().innerHTML = '<div class="skeleton" style="min-height:120px"></div>';
  const { products: list } = await api('/admin/products');
  body().innerHTML = `<div class="toolbar"><span class="count">${list.length} products</span><button class="btn lime sm" id="p-new">+ Add product</button></div>
    <div class="table-wrap"><table><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr>${list.map((p) => `<tr><td><img class="thumb-sm" src="${esc(p.images[0] || '')}" alt=""></td><td><b>${esc(p.name)}</b><br><small>${esc(p.category)}</small></td><td>${inr(p.price)}<br><small><s>${inr(p.originalPrice)}</s> ${p.discountPct}% off</small></td><td style="${p.stock <= 5 ? 'color:var(--danger);font-weight:700' : ''}">${p.stock}</td><td>${p.active ? 'Live' : 'Hidden'}</td><td style="white-space:nowrap"><button class="btn ghost sm" data-edit="${p.id}">Edit</button> <button class="btn ghost sm" data-del="${p.id}" aria-label="Delete ${esc(p.name)}">Delete</button></td></tr>`).join('')}</table></div>`;
  $('#p-new').addEventListener('click', () => productForm(null, list, products));
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => productForm(list.find((p) => p.id === +b.dataset.edit), list, products)));
  $$('[data-del]').forEach((b) => b.addEventListener('click', guard(async () => { const p = list.find((x) => x.id === +b.dataset.del); if (!confirm(`Delete "${p.name}" permanently? Past orders keep their own copy of the item. (Tip: untick "Visible in shop" to just hide it.)`)) return; await api(`/admin/products/${p.id}`, { method: 'DELETE' }); toast('Product deleted'); products(); })));
});

function productForm(p, list, reload) {
  const cats = [...new Set(list.map((x) => x.category))];
  let images = [...(p?.images || [])];
  const m = modal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:1.5rem">${p ? 'Edit product' : 'Add product'}</h2><button class="btn ghost sm" data-close>Close</button></div>
    <form id="pf" class="admin-form" novalidate>
      <div class="field" data-f="name"><label for="pf-n">Name *</label><input class="input" id="pf-n" name="name" value="${esc(p?.name || '')}" maxlength="120"><span class="errmsg"></span></div>
      <div class="row2"><div class="field" data-f="category"><label for="pf-c">Category *</label><input class="input" id="pf-c" name="category" list="cats" value="${esc(p?.category || '')}" maxlength="40"><datalist id="cats">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</datalist><span class="errmsg"></span></div>
        <div class="field"><label for="pf-b">Badge</label><select class="input" id="pf-b" name="badge">${['', 'New', 'Popular', 'Best Seller', 'Trending'].map((b) => `<option ${p?.badge === b ? 'selected' : ''} value="${b}">${b || 'None'}</option>`).join('')}</select></div></div>
      <div class="row3"><div class="field" data-f="originalPrice"><label for="pf-o">Original price (₹) *</label><input class="input" id="pf-o" name="originalPrice" type="number" min="1" inputmode="numeric" value="${p?.originalPrice ?? ''}"><span class="errmsg"></span></div>
        <div class="field" data-f="price"><label for="pf-p">Selling price (₹) *</label><input class="input" id="pf-p" name="price" type="number" min="1" inputmode="numeric" value="${p?.price ?? ''}"><span class="errmsg"></span></div>
        <div class="field" data-f="stock"><label for="pf-s">Stock *</label><input class="input" id="pf-s" name="stock" type="number" min="0" inputmode="numeric" value="${p?.stock ?? 0}"><span class="errmsg"></span></div></div>
      <p id="pf-disc" style="font-size:.85rem;color:var(--ok);font-weight:700"></p>
      <div class="field"><label for="pf-sd">Short description</label><input class="input" id="pf-sd" name="shortDesc" maxlength="160" value="${esc(p?.shortDesc || '')}"></div>
      <div class="field"><label for="pf-d">Full description</label><textarea class="input" id="pf-d" name="description" maxlength="3000">${esc(p?.description || '')}</textarea></div>
      <div class="row2"><div class="field"><label for="pf-sz">Sizes (comma separated)</label><input class="input" id="pf-sz" name="sizes" value="${esc((p?.sizes || []).join(', '))}" placeholder="S, M, L"></div><div class="field"><label for="pf-co">Colours (comma separated)</label><input class="input" id="pf-co" name="colors" value="${esc((p?.colors || []).join(', '))}" placeholder="Black, White"></div></div>
      <div class="field"><span class="lbl">Images (first one is the main photo)</span><div class="img-list" id="imgs"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px"><label class="btn ghost sm" style="cursor:pointer">Upload image<input type="file" id="up" accept="image/jpeg,image/png,image/webp" hidden multiple></label><input class="input" id="img-url" placeholder="…or paste an https:// image URL" style="flex:1;min-width:180px;min-height:38px"><button class="btn ghost sm" type="button" id="img-add">Add</button></div><small style="color:var(--muted)">JPG, PNG or WebP, up to 3 MB each.</small></div>
      <details class="panel"><summary style="cursor:pointer;font-weight:700">Sample rating (optional)</summary><p style="font-size:.82rem;color:var(--muted);margin:8px 0">Shown (and labelled "sample") only until real customer reviews are approved. Leave at 0 to show no rating.</p><div class="row2"><div class="field"><label for="pf-r">Rating (0-5)</label><input class="input" id="pf-r" name="ratingSeed" type="number" step="0.1" min="0" max="5" value="${p?.ratingSeed ?? 0}"></div><div class="field"><label for="pf-rc">Number of ratings</label><input class="input" id="pf-rc" name="ratingSeedCount" type="number" min="0" value="${p?.ratingSeedCount ?? 0}"></div></div></details>
      <label style="display:flex;gap:10px;align-items:center;font-weight:600"><input type="checkbox" name="active" ${p?.active === false ? '' : 'checked'} style="width:20px;height:20px;accent-color:#0b0b0b"> Visible in shop</label>
      <button class="btn lime" type="submit">${p ? 'Save changes' : 'Create product'}</button><div id="pf-out" role="alert"></div></form>`);
  const f = $('#pf', m.el);
  const drawImgs = () => { $('#imgs', m.el).innerHTML = images.map((u, i) => `<div><img src="${esc(u)}" alt="Product image ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove image ${i + 1}">×</button></div>`).join('') || '<small style="color:var(--muted)">No images yet</small>'; $$('[data-rm]', m.el).forEach((b) => b.addEventListener('click', () => { images.splice(+b.dataset.rm, 1); drawImgs(); })); };
  drawImgs();
  const disc = () => { const o = +f.originalPrice.value, s = +f.price.value; $('#pf-disc', m.el).textContent = o > s && s > 0 ? `Discount shown to customers: ${Math.round(((o - s) / o) * 100)}% off` : ''; };
  f.originalPrice.addEventListener('input', disc); f.price.addEventListener('input', disc); disc();
  $('#up', m.el).addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      if (file.size > 3 * 1024 * 1024) { toast(`${file.name} is over 3 MB`, 'err'); continue; }
      try { const r = await fetch('/api/admin/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file }); const d = await r.json(); if (!r.ok) throw new Error(d.error); images.push(d.url); drawImgs(); }
      catch (err) { toast(err.message, 'err'); }
    }
    e.target.value = '';
  });
  $('#img-add', m.el).addEventListener('click', () => { const u = $('#img-url', m.el).value.trim(); if (!/^https:\/\//.test(u)) { toast('Image URLs must start with https://', 'err'); return; } images.push(u); $('#img-url', m.el).value = ''; drawImgs(); });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    withLoading(f.querySelector('button[type=submit]'), async () => {
      $$('.field', f).forEach((x) => { x.classList.remove('err'); const em = x.querySelector('.errmsg'); if (em) em.textContent = ''; }); $('#pf-out', m.el).innerHTML = '';
      const d = Object.fromEntries(new FormData(f)); d.active = f.active.checked; d.images = images;
      try { await api(p ? `/admin/products/${p.id}` : '/admin/products', { method: p ? 'PUT' : 'POST', body: d }); toast(p ? 'Product saved' : 'Product created'); m.close(); reload(); }
      catch (err) { for (const k in (err.fields || {})) { const w = f.querySelector(`[data-f=${k}]`); if (w) { w.classList.add('err'); w.querySelector('.errmsg').textContent = err.fields[k]; } } $('#pf-out', m.el).innerHTML = `<div class="note err">${esc(err.message)}</div>`; }
    });
  });
}

// ---------- Reviews ----------
const reviews = guard(async () => {
  const { reviews: list } = await api('/admin/reviews');
  body().innerHTML = list.length ? `<div class="table-wrap"><table><tr><th>Product</th><th>Review</th><th>Status</th><th></th></tr>${list.map((r) => `<tr><td>${esc(r.product)}</td><td>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}<br>${esc(r.comment)}<br><small>${esc(r.name)} · ${dt(r.created_at)}</small></td><td>${r.approved ? '<span style="color:var(--ok)">Published</span>' : '<b style="color:var(--warn)">Pending</b>'}</td><td style="white-space:nowrap"><button class="btn ${r.approved ? 'ghost' : 'lime'} sm" data-ap="${r.id}" data-v="${r.approved ? 0 : 1}">${r.approved ? 'Unpublish' : 'Approve'}</button> <button class="btn ghost sm" data-rd="${r.id}">Delete</button></td></tr>`).join('')}</table></div>` : '<div class="empty"><h3>No reviews yet</h3><p>Customer reviews will show up here for approval.</p></div>';
  $$('[data-ap]').forEach((b) => b.addEventListener('click', guard(async () => { await api(`/admin/reviews/${b.dataset.ap}`, { method: 'POST', body: { approved: b.dataset.v === '1' } }); reviews(); })));
  $$('[data-rd]').forEach((b) => b.addEventListener('click', guard(async () => { if (confirm('Delete this review?')) { await api(`/admin/reviews/${b.dataset.rd}`, { method: 'DELETE' }); reviews(); } })));
});

// ---------- Messages ----------
const messages = guard(async () => {
  const { messages: list } = await api('/admin/messages');
  body().innerHTML = list.length ? `<div style="display:grid;gap:10px">${list.map((m) => `<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(m.subject)}</b><small>${dt(m.created_at)}</small></div><p style="color:var(--muted);font-size:.85rem">${esc(m.name)} · <a href="mailto:${esc(m.email)}"><u>${esc(m.email)}</u></a> ${esc(m.phone)}</p><p style="margin-top:6px;white-space:pre-wrap">${esc(m.message)}</p></div>`).join('')}</div>` : '<div class="empty"><h3>No messages yet</h3></div>';
});

// ---------- Coupons & sale ----------
const offers = guard(async () => {
  const [{ coupons }, cfg] = await Promise.all([api('/admin/coupons'), getConfig(true)]);
  const promo = cfg.promotion;
  body().innerHTML = `<div class="co"><div class="panel" style="display:grid;gap:12px;align-content:start"><h2 style="font-size:1.3rem">Coupons</h2>
    ${coupons.length ? `<div class="table-wrap" style="border:0"><table style="min-width:0"><tr><th>Code</th><th>Discount</th><th>Min order</th><th></th></tr>${coupons.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${c.type === 'percent' ? c.value + '%' : inr(c.value)}</td><td>${inr(c.min_subtotal)}</td><td><button class="btn ghost sm" data-cd="${esc(c.code)}">Delete</button></td></tr>`).join('')}</table></div>` : '<p style="color:var(--muted)">No coupons.</p>'}
    <form id="cp-form" class="admin-form"><div class="row2"><div class="field"><label for="cp-c">Code</label><input class="input" id="cp-c" name="code" maxlength="30" style="text-transform:uppercase"></div><div class="field"><label for="cp-t">Type</label><select class="input" id="cp-t" name="type"><option value="percent">Percent off</option><option value="flat">Flat ₹ off</option></select></div></div><div class="row2"><div class="field"><label for="cp-v">Value</label><input class="input" id="cp-v" name="value" type="number" min="1"></div><div class="field"><label for="cp-m">Minimum order (₹)</label><input class="input" id="cp-m" name="minSubtotal" type="number" min="0" value="0"></div></div><button class="btn lime sm" type="submit">Add coupon</button><div id="cp-out" role="alert"></div></form></div>
    <div class="panel" style="display:grid;gap:12px;align-content:start"><h2 style="font-size:1.3rem">Homepage sale banner</h2><p style="font-size:.85rem;color:var(--muted)">The countdown on the homepage only appears while a sale is configured here and hasn't ended.</p>
    <form id="pr-form" class="admin-form"><div class="field"><label for="pr-t">Title</label><input class="input" id="pr-t" name="title" maxlength="80" value="${esc(promo?.title || '')}" placeholder="Festive Week Sale"></div><div class="field"><label for="pr-s">Subtitle</label><input class="input" id="pr-s" name="subtitle" maxlength="160" value="${esc(promo?.subtitle || '')}"></div><div class="field"><label for="pr-e">Ends at</label><input class="input" id="pr-e" name="endsAt" type="datetime-local"></div><div style="display:flex;gap:8px"><button class="btn lime sm" type="submit">Save sale</button><button class="btn ghost sm" type="button" id="pr-clear">Remove sale</button></div></form></div></div>`;
  $$('[data-cd]').forEach((b) => b.addEventListener('click', guard(async () => { await api(`/admin/coupons/${b.dataset.cd}`, { method: 'DELETE' }); offers(); })));
  $('#cp-form').addEventListener('submit', (e) => { e.preventDefault(); withLoading(e.target.querySelector('button'), async () => { try { await api('/admin/coupons', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Coupon saved'); offers(); } catch (err) { $('#cp-out').innerHTML = `<div class="note err">${esc(err.message)}</div>`; } }); });
  $('#pr-form').addEventListener('submit', (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); withLoading(e.target.querySelector('button'), async () => { if (!d.title || !d.endsAt) { toast('Enter a title and an end date', 'err'); return; } d.endsAt = new Date(d.endsAt).toISOString(); await api('/admin/promotion', { method: 'POST', body: d }); toast('Sale saved'); offers(); }); });
  $('#pr-clear').addEventListener('click', guard(async () => { await api('/admin/promotion', { method: 'POST', body: {} }); toast('Sale removed'); offers(); }));
});
