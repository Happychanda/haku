'use strict';
const tls = require('node:tls');
const net = require('node:net');
const config = require('./config');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

function emailConfigured() {
  return !!(config.resendKey || (config.smtp.host && config.smtp.user && config.smtp.pass));
}

// ---------- Resend (HTTPS API) ----------
async function sendViaResend({ to, subject, html, text, replyTo }) {
  const from = config.emailFrom || 'HAKU Store <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${body.message || body.name || 'unknown error'}`);
  return body.id;
}

// ---------- Minimal SMTP client (implicit TLS on 465, STARTTLS on 587) ----------
function smtpSend({ to, subject, html, text, replyTo }) {
  const { host, port, user, pass, secure } = config.smtp;
  const from = config.emailFrom ? config.emailFrom : user;
  const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1];
  return new Promise((resolve, reject) => {
    let socket;
    let buffer = '';
    let waiter = null;
    let done = false;
    const fail = (err) => { if (!done) { done = true; try { socket && socket.destroy(); } catch {} reject(err); } };
    const timer = setTimeout(() => fail(new Error('SMTP timed out')), 20000);

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      // A reply is complete when its last line has "NNN " (space) rather than "NNN-"
      const lines = buffer.split('\r\n');
      if (lines.length < 2) return;
      const last = lines[lines.length - 2];
      if (/^\d{3} /.test(last) && waiter) {
        const text = buffer; buffer = '';
        const w = waiter; waiter = null;
        w(text);
      }
    }
    const read = () => new Promise((res) => { waiter = res; if (buffer) onData(''); });
    const expect = async (codes) => {
      const r = await read();
      const code = r.slice(0, 3);
      if (!codes.includes(code)) throw new Error(`SMTP error: ${r.trim().slice(0, 200)}`);
      return r;
    };
    const cmd = async (line, codes) => { socket.write(line + '\r\n'); return expect(codes); };

    const run = async () => {
      await expect(['220']);
      let ehlo = await cmd('EHLO haku-store', ['250']);
      if (!secure) {
        await cmd('STARTTLS', ['220']);
        socket.removeListener('data', onData);
        socket = tls.connect({ socket, host, servername: host });
        await new Promise((r, j) => { socket.once('secureConnect', r); socket.once('error', j); });
        socket.on('data', onData);
        ehlo = await cmd('EHLO haku-store', ['250']);
      }
      await cmd('AUTH LOGIN', ['334']);
      await cmd(Buffer.from(user).toString('base64'), ['334']);
      await cmd(Buffer.from(pass).toString('base64'), ['235']);
      await cmd(`MAIL FROM:<${fromAddr}>`, ['250']);
      await cmd(`RCPT TO:<${to}>`, ['250', '251']);
      await cmd('DATA', ['354']);
      const boundary = 'haku' + Date.now().toString(36);
      const b64 = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
      const msg = [
        `From: ${from}`,
        `To: ${to}`,
        ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(text),
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(html),
        `--${boundary}--`,
      ].join('\r\n');
      socket.write(msg.replace(/^\./gm, '..') + '\r\n.\r\n');
      await expect(['250']);
      try { socket.write('QUIT\r\n'); socket.end(); } catch {}
    };

    const start = () => {
      socket.on('data', onData);
      socket.on('error', fail);
      run().then(() => { done = true; clearTimeout(timer); resolve('smtp-ok'); }).catch((e) => { clearTimeout(timer); fail(e); });
    };
    if (secure) socket = tls.connect({ host, port, servername: host }, start);
    else socket = net.connect({ host, port }, start);
  });
}

// Returns { ok: true, id } only when the provider confirmed acceptance. Never throws.
async function sendEmail(opts) {
  if (!emailConfigured()) return { ok: false, error: 'Email provider is not configured (set RESEND_API_KEY or SMTP_* in .env)' };
  try {
    const id = config.resendKey ? await sendViaResend(opts) : await smtpSend(opts);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 300) };
  }
}

function orderEmail(order, items) {
  const when = new Date(order.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const rows = items.map((i) => `<tr>
    <td style="padding:8px;border-bottom:1px solid #eee">${esc(i.name)}${i.variant ? `<br><small style="color:#666">${esc(i.variant)}</small>` : ''}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${inr(i.price)}</td>
    <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${inr(i.price * i.qty)}</td></tr>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111">
    <div style="background:#0b0b0b;color:#c6f432;padding:18px 24px;font-size:26px;font-weight:800;letter-spacing:2px">HAKU</div>
    <div style="padding:24px;border:1px solid #eee">
    <h2 style="margin:0 0 4px">New order ${esc(order.order_id)}</h2>
    <p style="margin:0 0 16px;color:#555">Placed ${esc(when)} (IST)</p>
    <h3>Customer</h3>
    <p>${esc(order.name)}<br>${esc(order.email)}<br>${esc(order.phone)}</p>
    <h3>Ship to</h3>
    <p>${esc(order.address)}<br>${esc(order.city)}, ${esc(order.state)} - ${esc(order.pin)}</p>
    ${order.notes ? `<p><b>Notes:</b> ${esc(order.notes)}</p>` : ''}
    <h3>Items</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:#f5f5f5"><th align="left" style="padding:8px">Product</th><th>Qty</th><th align="right" style="padding:8px">Price</th><th align="right" style="padding:8px">Total</th></tr>${rows}</table>
    <table style="width:100%;margin-top:12px;font-size:14px">
      <tr><td>Subtotal</td><td align="right">${inr(order.subtotal)}</td></tr>
      <tr><td>Discount${order.coupon ? ` (${esc(order.coupon)})` : ''}</td><td align="right">-${inr(order.discount)}</td></tr>
      <tr><td>Shipping</td><td align="right">${order.shipping ? inr(order.shipping) : 'Free'}</td></tr>
      <tr><td style="font-size:18px;padding-top:8px"><b>Total payable</b></td><td align="right" style="font-size:18px;padding-top:8px"><b>${inr(order.total)}</b></td></tr>
    </table>
    <p><b>Payment:</b> ${esc(order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method)} (${esc(order.payment_status)})</p>
    </div></div>`;
  const text = [
    `New HAKU order ${order.order_id}`, `Placed: ${when} (IST)`, '',
    `Customer: ${order.name} | ${order.email} | ${order.phone}`,
    `Ship to: ${order.address}, ${order.city}, ${order.state} - ${order.pin}`,
    order.notes ? `Notes: ${order.notes}` : '', '', 'Items:',
    ...items.map((i) => `- ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.qty} @ ${inr(i.price)} = ${inr(i.price * i.qty)}`), '',
    `Subtotal: ${inr(order.subtotal)}`, `Discount: -${inr(order.discount)}${order.coupon ? ` (${order.coupon})` : ''}`,
    `Shipping: ${order.shipping ? inr(order.shipping) : 'Free'}`, `TOTAL: ${inr(order.total)}`,
    `Payment: ${order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method}`,
  ].filter((l) => l !== undefined).join('\n');
  return { subject: `New HAKU order ${order.order_id} - ${inr(order.total)}`, html, text, replyTo: order.email };
}

module.exports = { sendEmail, orderEmail, emailConfigured, esc, inr };
