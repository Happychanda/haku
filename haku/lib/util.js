'use strict';
const crypto = require('node:crypto');
const config = require('./config');

// ---------- validation ----------
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;           // Indian mobile, 10 digits
const PIN_RE = /^[1-9]\d{5}$/;             // Indian PIN code
/** "+91 98765-43210" -> "9876543210". Invalid input comes back as plain digits so validation still fails. */
const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
};
/** Trim, strip control characters, cap length. */
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
const discountPct = (orig, price) => (orig > price && orig > 0 ? Math.round(((orig - price) / orig) * 100) : 0);

// ---------- ids / dates ----------
const ID_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomId(len) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ID_CHARS[bytes[i] % ID_CHARS.length];
  return s;
}
/** HK-YYMMDD-XXXXXX (random, unguessable suffix; UNIQUE in the database) */
function newOrderId() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `HK-${ymd}-${randomId(6)}`;
}
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ---------- rate limiting (in-memory, per key) ----------
const buckets = new Map();
/** Returns true while under the limit, false once exceeded. */
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();

// ---------- admin session: HMAC-signed, HttpOnly cookie ----------
const COOKIE = 'haku_admin';
const hmac = (s) => crypto.createHmac('sha256', config.secret).update(s).digest('base64url');
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmac(body)}`;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i < 0) return;
    try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  });
  return out;
}
function adminFromReq(req) {
  if (!config.adminConfigured) return null;
  const tok = parseCookies(req)[COOKIE];
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  if (!safeEqual(sig, hmac(body))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return d && d.role === 'admin' && d.exp > Date.now() ? d : null;
  } catch { return null; }
}
function adminCookie(token, maxAgeSeconds) {
  const secure = config.siteUrl.startsWith('https') ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

module.exports = {
  EMAIL_RE, PHONE_RE, PIN_RE, normPhone, clean, slugify, discountPct, newOrderId, addDays,
  rateLimit, sign, safeEqual, adminFromReq, adminCookie,
};
