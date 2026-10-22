// Cart page, checkout, confirmation, tracking
import { $, $$, esc, inr, dt, I, cart, api, getConfig, toast, withLoading, STATES } from './core.js';
import { cartDetail, cartBodyHtml, navigate } from './ui.js';
import { notFound } from './pages-store.js';

const main = () => $('#main');

// ---------------- Cart page ----------------
export async function cartPage() {
  main().innerHTML = `<div class="page"><div class="wrap"><nav class="crumbs"><a href="/" data-link>Home</a> / <span>Cart</span></nav><h1 class="page-title">Your Cart</h1><div id="cart-page"><div class="skeleton" style="min-height:140px"></div></div></div></div>`;
  await renderCartPage();
}
export async function renderCartPage() {
  const host = $('#cart-page'); if (!host) return;
  try {
    const det = await cartDetail(); const { body, foot } = cartBodyHtml(det, { page: true });
    host.innerHTML = foot ? `<div class="co"><div style="display:grid;gap:10px;align-content:start">${body}</div><aside class="panel" style="display:grid;gap:12px">${foot}<button class="btn ghost block" data-action="continue">Continue Shopping</button></aside></div>` : body;
  } catch (e) { host.innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
}

// ---------------- Checkout ----------------
const FIELDS = ['name', 'email', 'phone', 'address', 'city', 'state', 'pin'];
const saved = () => { try { return JSON.parse(localStorage.getItem('haku.customer')) || {}; } catch { return {}; } };

function validate(v) {
  const e = {};
  if (v.name.trim().length < 2) e.name = 'Please enter your full name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Enter a valid email address';
  if (!/^(?:\+?91[\s-]?|0)?[6-9]\d{9}$/.test(v.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a valid 10-digit Indian mobile number';
  if (v.address.trim().length < 8) e.address = 'Please enter your complete delivery address';
  if (v.city.trim().length < 2) e.city = 'Enter your city';
  if (!v.state) e.state = 'Select your state';
  if (!/^[1-9]\d{5}$/.test(v.pin.trim())) e.pin = 'Enter a valid 6-digit PIN code';
  return e;
}
const setErrors = (form, errs) => {
  FIELDS.concat(['paymentMethod']).forEach((k) => { const f = form.querySelector(`[data-field=${k}]`); if (!f) return; const m = errs[k]; f.classList.toggle('err', !!m); const el = f.querySelector('.errmsg'); if (el) el.textContent = m || ''; const inp = f.querySelector('.input'); if (inp) inp.setAttribute('aria-invalid', m ? 'true' : 'false'); });
  const first = FIELDS.find((k) => errs[k]); if (first) form.querySelector(`[name=${first}]`)?.focus();
};

export async function checkout() {
  if (!cart.items.length) { navigate('/cart', { replace: true }); return; }
  main().innerHTML = `<div class="page"><div class="wrap"><nav class="crumbs"><a href="/" data-link>Home</a> / <a href="/cart" data-link>Cart</a> / <span>Checkout</span></nav><h1 class="page-title">Checkout</h1><div id="co-host"><div class="skeleton" style="min-height:300px"></div></div></div></div>`;
  let det, cfg;
  try { [det, cfg] = await Promise.all([cartDetail(), getConfig()]); } catch (e) { $('#co-host').innerHTML = `<div class="note err">${esc(e.message)}</div>`; return; }
  if (det.empty || !det.lines.length) { navigate('/cart', { replace: true }); return; }
  if (det.blocked) { toast('Some items in your cart need attention', 'err'); navigate('/cart', { replace: true }); return; }
  const q = det.quote, sv = saved();
  const field = (name, label, attrs = '', extra = '') => `<div class="field" data-field="${name}"><label for="co-${name}">${label}</label><input class="input" id="co-${name}" name="${name}" value="${esc(sv[name] || '')}" ${attrs}><span class="errmsg" role="alert"></span></div>`;
  $('#co-host').innerHTML = `<div class="co">
    <form id="co-form" novalidate aria-label="Delivery details">
      <div class="panel admin-form"><h2 style="font-size:1.4rem">Delivery details</h2>
        <div class="row2">${field('name', 'Full name *', 'autocomplete="name" maxlength="80"')}${field('phone', 'Mobile number *', 'type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="10-digit number"')}</div>
        ${field('email', 'Email address *', 'type="email" autocomplete="email" maxlength="120"')}
        <div class="field" data-field="address"><label for="co-address">Complete address *</label><textarea class="input" id="co-address" name="address" autocomplete="street-address" maxlength="300" placeholder="House no., street, area, landmark" style="min-height:90px">${esc(sv.address || '')}</textarea><span class="errmsg" role="alert"></span></div>
        <div class="row2">${field('city', 'City *', 'autocomplete="address-level2" maxlength="60"')}
          <div class="field" data-field="state"><label for="co-state">State *</label><select class="input" id="co-state" name="state" autocomplete="address-level1"><option value="">Select state</option>${STATES.map((s) => `<option ${sv.state === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select><span class="errmsg" role="alert"></span></div></div>
        ${field('pin', 'PIN code *', 'inputmode="numeric" autocomplete="postal-code" maxlength="6" placeholder="6 digits"')}
        <div class="field"><label for="co-notes">Order notes (optional)</label><textarea class="input" id="co-notes" name="notes" maxlength="300" placeholder="Delivery instructions, gift message…" style="min-height:70px"></textarea></div>
      </div>
      <div class="panel admin-form"><h2 style="font-size:1.4rem">Payment</h2>
        <label class="pay-opt"><input type="radio" name="paymentMethod" value="cod" checked><span><b>Cash on Delivery</b><small>Pay in cash when your order arrives.</small></span></label>
        <p style="font-size:.82rem;color:var(--muted)">Online payments are not available yet.</p></div>
      <div id="co-error" role="alert"></div>
      <button class="btn lime block" type="submit" id="co-submit" style="min-height:54px;font-size:1.05rem">Place Order · ${inr(q.total)}</button>
      <p style="font-size:.78rem;color:var(--muted);text-align:center">By placing your order you agree to our <a href="/policy/terms" data-link><u>Terms</u></a> and <a href="/policy/privacy" data-link><u>Privacy Policy</u></a>.</p>
    </form>
    <aside class="panel" style="display:grid;gap:12px"><h2 style="font-size:1.4rem">Order summary</h2>
      ${det.lines.map(({ item, p }) => `<div class="mini"><img src="${esc(p.images[0])}" alt="${esc(p.name)}" width="54" height="54"><div><b>${esc(p.name)}</b><small>${esc([item.size && `Size ${item.size}`, item.color].filter(Boolean).join(' / '))} Qty ${item.qty}</small><small>${p.discountPct ? `<s>${inr(p.originalPrice)}</s> ` : ''}${inr(p.price)} each</small></div><b>${inr(p.price * item.qty)}</b></div>`).join('')}
      <div class="sum"><div><span>Subtotal</span><span>${inr(q.subtotal)}</span></div>${q.saved > 0 ? `<div class="save"><span>Savings on MRP</span><span>-${inr(q.saved)}</span></div>` : ''}${q.discount ? `<div class="save"><span>Coupon ${esc(q.coupon)}</span><span>-${inr(q.discount)}</span></div>` : ''}<div><span>Shipping</span><span>${q.shipping ? inr(q.shipping) : 'Free'}</span></div><div><span>Payment</span><span>Cash on Delivery</span></div><div class="tot"><span>Payable</span><span>${inr(q.total)}</span></div></div>
      <a href="/cart" data-link class="link-arrow" style="justify-self:start">Edit cart</a></aside></div>`;

  const form = $('#co-form');
  // inline validation on blur
  FIELDS.forEach((k) => form.querySelector(`[name=${k}]`)?.addEventListener('blur', () => { const v = Object.fromEntries(FIELDS.map((x) => [x, form[x].value])); const e = validate(v); setErrors(form, k in e ? { [k]: e[k] } : {}); const keep = FIELDS.filter((x) => x !== k && form.querySelector(`[data-field=${x}]`)?.classList.contains('err')).reduce((o, x) => ({ ...o, [x]: form.querySelector(`[data-field=${x}] .errmsg`).textContent }), {}); setErrors(form, { ...keep, ...(k in e ? { [k]: e[k] } : {}) }); }));

  // one idempotency key per checkout attempt; reused on retry so a double-submit can never create two orders
  const idemKey = sessionStorage.getItem('haku.idem') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^A-Za-z0-9-]/g, '');
  sessionStorage.setItem('haku.idem', idemKey);
  let submitting = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); if (submitting) return;
    const v = Object.fromEntries(FIELDS.map((x) => [x, form[x].value])); const errs = validate(v);
    $('#co-error').innerHTML = ''; setErrors(form, errs);
    if (Object.keys(errs).length) { toast('Please fix the highlighted fields', 'err'); return; }
    submitting = true;
    await withLoading($('#co-submit'), async () => {
      try {
        const r = await api('/orders', { method: 'POST', body: { ...v, notes: form.notes.value, paymentMethod: 'cod', items: cart.items, coupon: cart.coupon, idempotencyKey: idemKey } });
        try { localStorage.setItem('haku.customer', JSON.stringify(Object.fromEntries(FIELDS.map((x) => [x, v[x]])))); } catch { /* ignore */ }
        sessionStorage.setItem('haku.lastOrder', JSON.stringify({ ...r, email: v.email.trim().toLowerCase(), phone: v.phone, at: Date.now() }));
        sessionStorage.removeItem('haku.idem');
        cart.clear(); cart.setCoupon('');
        navigate(`/order/${r.orderId}`);
      } catch (err) {
        if (err.fields) setErrors(form, err.fields);
        const stock = err.status === 409;
        $('#co-error').innerHTML = `<div class="note err">${esc(err.message)}${err.network ? '' : stock ? ' <a href="/cart" data-link><u>Review your cart</u></a>.' : ' You can safely try again. You will not be charged twice.'}</div>`;
        $('#co-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally { submitting = false; }
    });
  });
}

// ---------------- Confirmation ----------------
export async function confirmation(id) {
  let last = null; try { last = JSON.parse(sessionStorage.getItem('haku.lastOrder')); } catch { /* ignore */ }
  document.title = 'Order confirmed | HAKU';
  if (!last || last.orderId !== id) {
    main().innerHTML = `<div class="page"><div class="wrap"><div class="empty"><h3>Looking for an order?</h3><p>For privacy, order details are only shown after you verify them. Use Track Order with your order ID and the email or phone you used at checkout.</p><a class="btn lime" href="/track?id=${encodeURIComponent(id)}" data-link>Track order ${esc(id)}</a></div></div></div>`; return;
  }
  const cfg = await getConfig();
  main().innerHTML = `<div class="page"><div class="wrap"><div class="confirm">
    <div class="tick">${I.check}</div><h1 class="page-title" style="margin:0">Order placed!</h1>
    <p style="max-width:50ch;color:var(--ink-2)">Thank you${''}. Your order has been received. ${last.duplicate ? 'This order was already placed, so we did not create a duplicate.' : ''}</p>
    <div><div class="lbl" style="margin-bottom:6px">Your order ID</div><div class="oid" id="oid">${esc(last.orderId)}</div></div>
    <p><b>${inr(last.total)}</b> payable by Cash on Delivery</p>
    ${last.emailSent ? '<div class="note ok" style="max-width:520px">The shop has been notified of your order by email.</div>' : `<div class="note warn" style="max-width:520px">Your order is saved, but the email notification to the shop has not been confirmed yet. Don't worry, the team can still see it in their dashboard. If you do not hear from us, contact <a href="mailto:${esc(cfg.shop.email)}"><u>${esc(cfg.shop.email)}</u></a> with your order ID.</div>`}
    <p style="color:var(--muted);max-width:50ch;font-size:.9rem">Save your order ID. You'll need it, plus your email or phone number, to track the order.</p>
    <div class="hero-cta" style="justify-content:center"><a class="btn lime" href="/track?id=${encodeURIComponent(last.orderId)}" data-link>Track this order</a><button class="btn ghost" id="copy-id">Copy order ID</button><a class="btn ghost" href="/shop" data-link>Continue shopping</a></div>
  </div></div></div>`;
  $('#copy-id').addEventListener('click', async () => { try { await navigator.clipboard.writeText(last.orderId); toast('Order ID copied'); } catch { toast('Could not copy. Select the ID and copy it.', 'err'); } });
}

// ---------------- Track order ----------------
const STAGE_ICONS = { placed: I.box, confirmed: I.check, processing: I.refresh, packed: I.box, shipped: I.truck, out_for_delivery: I.truck, delivered: I.check };
export async function track() {
  const p = new URLSearchParams(location.search);
  let last = null; try { last = JSON.parse(sessionStorage.getItem('haku.lastOrder')); } catch { /* ignore */ }
  const id0 = p.get('id') || '';
  const contact0 = last && last.orderId === id0 ? last.email : '';
  main().innerHTML = `<div class="page"><div class="wrap"><nav class="crumbs"><a href="/" data-link>Home</a> / <span>Track order</span></nav><h1 class="page-title">Track Order</h1>
    <p style="color:var(--ink-2);max-width:56ch;margin-bottom:20px">Enter your order ID and the email address or phone number you used at checkout.</p>
    <form class="track-form panel" id="track-form" novalidate>
      <div class="field"><label for="t-id">Order ID</label><input class="input" id="t-id" name="orderId" placeholder="HK-261021-AB12CD" value="${esc(id0)}" autocomplete="off" autocapitalize="characters" maxlength="40"></div>
      <div class="field"><label for="t-c">Email or phone number</label><input class="input" id="t-c" name="contact" placeholder="you@example.com or 9876543210" value="${esc(contact0)}" autocomplete="email" maxlength="120"></div>
      <button class="btn lime" type="submit">Track Order</button><div id="t-err" role="alert"></div></form>
    <div id="t-out" style="margin-top:26px"></div></div></div>`;
  const out = $('#t-out');
  async function lookup(orderId, contactVal) {
    $('#t-err').innerHTML = ''; out.innerHTML = '';
    if (!orderId.trim() || !contactVal.trim()) { $('#t-err').innerHTML = '<div class="note err">Please enter both your order ID and your email or phone number.</div>'; return; }
    await withLoading($('#track-form button'), async () => {
      try { const { order } = await api('/track', { method: 'POST', body: { orderId, contact: contactVal } }); renderTrack(order, orderId, contactVal); }
      catch (e) { $('#t-err').innerHTML = `<div class="note err">${esc(e.message)}</div>`; }
    });
  }
  $('#track-form').addEventListener('submit', (e) => { e.preventDefault(); lookup(e.target.orderId.value, e.target.contact.value); });
  if (id0 && contact0) lookup(id0, contact0);

  function renderTrack(o, orderId, contactVal) {
    const bad = ['cancelled', 'returned'].includes(o.status);
    const idx = o.stages.findIndex((s) => s.key === o.status);
        const canCancel = !bad && ['placed', 'confirmed', 'processing', 'packed'].includes(o.status) && !o.cancelRequested;
    out.innerHTML = `<div class="co"><div style="display:grid;gap:16px;align-content:start">
      <div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><div class="lbl">Order</div><b style="font-family:var(--display);font-size:1.3rem">${esc(o.orderId)}</b><div style="color:var(--muted);font-size:.85rem">Placed ${dt(o.placedAt)}</div></div><span class="status-pill ${bad ? 'bad' : ''}">${esc(o.statusLabel)}</span></div>
        ${o.expectedDelivery && !bad && o.status !== 'delivered' ? `<p style="margin-top:10px"><b>Expected delivery:</b> ${new Date(o.expectedDelivery).toLocaleDateString('en-IN', { dateStyle: 'full' })}</p>` : ''}
        ${o.cancelRequested && !bad ? '<div class="note info" style="margin-top:10px">Cancellation requested. The shop will review it shortly.</div>' : ''}
        ${bad ? `<div class="note err" style="margin-top:10px">This order was ${esc(o.status)}.${o.events.filter((e) => e.status === o.status).map((e) => e.note ? ' ' + esc(e.note) : '').join('')}</div>` : ''}</div>
      <div class="panel"><h2 style="font-size:1.3rem;margin-bottom:12px">Progress</h2><ol class="timeline" style="list-style:none;padding:0;margin:0">
        ${o.stages.map((s, i) => { const done = bad ? !!s.at : i <= idx; const cur = !bad && i === idx && o.status !== 'delivered'; return `<li class="t-step ${done ? 'done' : ''} ${cur ? 'current' : ''}" ${cur ? 'aria-current="step"' : ''}><span class="t-dot">${STAGE_ICONS[s.key]}</span><div><h4>${esc(s.label)}</h4><small>${s.at ? dt(s.at) : done ? 'Completed' : cur ? 'In progress' : 'Pending'}</small></div></li>`; }).join('')}
        ${bad ? `<li class="t-step current"><span class="t-dot" style="background:var(--danger);border-color:var(--danger);color:#fff">${I.close}</span><div><h4 style="color:var(--danger)">${esc(o.statusLabel)}</h4><small>${dt((o.events.filter((e) => e.status === o.status).pop() || {}).created_at)}</small></div></li>` : ''}
      </ol></div>
      ${canCancel ? `<details class="panel"><summary style="font-weight:800;cursor:pointer">Need to cancel this order?</summary><form id="cancel-form" class="admin-form" style="margin-top:12px"><div class="field"><label for="cx-r">Reason (optional)</label><textarea class="input" id="cx-r" name="reason" maxlength="300" style="min-height:70px"></textarea></div><button class="btn danger sm" type="submit">Request cancellation</button><div id="cx-out" role="status"></div></form></details>` : ''}
    </div>
    <aside class="panel" style="display:grid;gap:12px"><h2 style="font-size:1.3rem">Order details</h2>
      ${o.items.map((i) => `<div class="mini"><img src="${esc(i.image)}" alt="${esc(i.name)}" width="54" height="54" loading="lazy"><div><b>${esc(i.name)}</b><small>${esc(i.variant || '')} Qty ${i.qty}</small></div><b>${inr(i.price * i.qty)}</b></div>`).join('')}
      <div class="sum"><div><span>Subtotal</span><span>${inr(o.totals.subtotal)}</span></div>${o.totals.discount ? `<div class="save"><span>Discount${o.totals.coupon ? ` (${esc(o.totals.coupon)})` : ''}</span><span>-${inr(o.totals.discount)}</span></div>` : ''}<div><span>Shipping</span><span>${o.totals.shipping ? inr(o.totals.shipping) : 'Free'}</span></div><div class="tot"><span>Total</span><span>${inr(o.totals.total)}</span></div><div><span>Payment</span><span>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : esc(o.paymentMethod)} (${esc(o.paymentStatus)})</span></div></div>
      <div><div class="lbl">Delivering to</div><p style="font-size:.9rem;color:var(--ink-2)">${esc(o.shipTo.name)}<br>${esc(o.shipTo.address)}<br>${esc(o.shipTo.city)}, ${esc(o.shipTo.state)} ${esc(o.shipTo.pin)}</p></div></aside></div>`;
    $('#cancel-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await withLoading(e.target.querySelector('button'), async () => {
        try { await api('/orders/cancel-request', { method: 'POST', body: { orderId, contact: contactVal, reason: e.target.reason.value } }); toast('Cancellation requested'); lookup(orderId, contactVal); }
        catch (err) { $('#cx-out').innerHTML = `<div class="note err">${esc(err.message)}</div>`; }
      });
    });
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
