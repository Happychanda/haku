// Core helpers: DOM, formatting, API, storage, toasts, icons
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const dt = (s, withTime = true) => {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
  return d.toLocaleString('en-IN', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) });
};

// ---------- Icons (24px stroke icons) ----------
const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const I = {
  menu: ic('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  close: ic('<path d="M18 6 6 18M6 6l12 12"/>'),
  search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  heart: ic('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  bag: ic('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
  trash: ic('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  check: ic('<path d="m5 12 5 5L20 7"/>'),
  truck: ic('<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
  refresh: ic('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
  shield: ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  cash: ic('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  tag: ic('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>'),
  mail: ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
  phone: ic('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  pin: ic('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  filter: ic('<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>'),
  box: ic('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>'),
  wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.2L2 22l4.9-1.3A11 11 0 1 0 20.5 3.5zM12 20a9 9 0 0 1-4.6-1.3l-.3-.2-2.9.8.8-2.8-.2-.3A9 9 0 1 1 12 20zm5-6.7c-.3-.1-1.6-.8-1.9-.9s-.5-.1-.7.1-.8.9-.9 1.1-.3.2-.6.1a7.3 7.3 0 0 1-3.6-3.1c-.3-.5.3-.5.8-1.5a.5.5 0 0 0 0-.5c-.1-.1-.7-1.6-.9-2.2s-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.7 3.7 0 0 0-1.1 2.7 6.4 6.4 0 0 0 1.4 3.4 14.7 14.7 0 0 0 5.6 4.9c2.1.9 2.9.9 3.9.8a3.3 3.3 0 0 0 2.2-1.6 2.7 2.7 0 0 0 .2-1.6c-.1-.1-.3-.2-.6-.3z"/></svg>',
  cart: ic('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>'),
};
export const LOGO_MARK = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4v16M19 4v16M5 12h14" stroke="#c6f432" stroke-width="4" stroke-linecap="square"/></svg>`;

export const stars = (r) => {
  const full = Math.round(r);
  return `<span class="stars" role="img" aria-label="${r} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= full ? '' : 'off'}">${I.star}</span>`).join('')}</span>`;
};

// ---------- Local storage (safe) ----------
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or disabled */ } };

export const bus = new EventTarget();
const emit = (name) => bus.dispatchEvent(new Event(name));

export const cart = {
  items: read('haku.cart', []).filter((i) => i && Number.isInteger(i.productId) && i.qty > 0),
  save() { write('haku.cart', this.items); emit('cart'); },
  count() { return this.items.reduce((s, i) => s + i.qty, 0); },
  key: (i) => `${i.productId}|${i.size || ''}|${i.color || ''}`,
  add(productId, qty = 1, size = '', color = '', max = 20) {
    const ex = this.items.find((i) => this.key(i) === `${productId}|${size}|${color}`);
    if (ex) ex.qty = Math.min(ex.qty + qty, max, 20); else this.items.push({ productId, qty: Math.min(qty, max, 20), size, color });
    this.save();
  },
  setQty(key, qty) { const i = this.items.find((x) => this.key(x) === key); if (i) { i.qty = Math.max(1, Math.min(20, qty)); this.save(); } },
  remove(key) { this.items = this.items.filter((i) => this.key(i) !== key); this.save(); },
  clear() { this.items = []; this.save(); },
  coupon: read('haku.coupon', ''),
  setCoupon(c) { this.coupon = c; write('haku.coupon', c); },
};
export const wish = {
  ids: read('haku.wish', []),
  has(id) { return this.ids.includes(id); },
  toggle(id) { this.ids = this.has(id) ? this.ids.filter((x) => x !== id) : [...this.ids, id]; write('haku.wish', this.ids); emit('wish'); return this.has(id); },
};
export const recent = {
  ids: read('haku.recent', []),
  push(id) { this.ids = [id, ...this.ids.filter((x) => x !== id)].slice(0, 8); write('haku.recent', this.ids); },
};

// ---------- API ----------
export async function api(path, { method = 'GET', body, headers } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('Network problem. Check your connection and try again.'); e.network = true; throw e;
  }
  let data = {};
  try { data = await res.json(); } catch { /* non-json */ }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong. Please try again.'); e.status = res.status; e.fields = data.fields; throw e; }
  return data;
}

let _config;
export async function getConfig(force = false) {
  if (!_config || force) _config = await api('/config');
  return _config;
}

// ---------- Toasts ----------
export function toast(msg, type = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : ''}`;
  el.innerHTML = `<i></i><span>${esc(msg)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, type === 'err' ? 4800 : 2600);
  while (box.children.length > 3) box.firstChild.remove();
}

// ---------- Button loading helper ----------
export async function withLoading(btn, fn) {
  if (!btn || btn.classList.contains('loading')) return;
  btn.classList.add('loading'); btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.classList.remove('loading'); btn.removeAttribute('aria-busy'); }
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export const STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'];
