'use strict';
require('./env');
const path = require('node:path');
const crypto = require('node:crypto');

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => { const n = Number(env(k, d)); return Number.isFinite(n) ? n : d; };

const secret = env('SESSION_SECRET');
const adminEmail = env('ADMIN_EMAIL', env('ADMIN_USERNAME')).toLowerCase();
const adminPassword = env('ADMIN_PASSWORD');
const smtpPort = num('SMTP_PORT', 465);
const smtpUser = env('SMTP_USER');

module.exports = {
  port: num('PORT', 3000),
  isProd: env('NODE_ENV') === 'production',
  trustProxy: env('TRUST_PROXY', '0') !== '0',
  siteUrl: env('SITE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  dataDir: path.resolve(env('DATA_DIR', path.join(__dirname, '..', 'data'))),
  uploadDir: path.resolve(env('UPLOAD_DIR', path.join(__dirname, '..', 'uploads'))),
  autoSeed: env('AUTO_SEED', 'true') !== 'false',

  // Where every order / contact message is e-mailed
  notifyEmail: env('OWNER_EMAIL', 'happymeena278@gmail.com'),

  // Admin login. Secrets live only in environment variables.
  adminEmail,
  adminPassword,
  adminConfigured: !!(adminEmail && adminPassword && adminPassword.length >= 8),
  secret: secret || crypto.randomBytes(32).toString('hex'),
  ephemeralSecret: !secret,

  // E-mail delivery (Resend API, or SMTP such as Gmail with an App Password)
  resendKey: env('RESEND_API_KEY'),
  smtp: { host: env('SMTP_HOST'), port: smtpPort, user: smtpUser, pass: env('SMTP_PASS'), secure: env('SMTP_SECURE', smtpPort === 465 ? 'true' : 'false') === 'true' },
  emailFrom: env('MAIL_FROM', smtpUser ? `HAKU Store <${smtpUser}>` : ''),

  shop: {
    name: 'HAKU',
    email: env('OWNER_EMAIL', 'happymeena278@gmail.com'),
    phone: env('SHOP_PHONE', '+91 98765 43210'),
    address: env('SHOP_ADDRESS', 'HAKU Store, Your Street, Your City, India'),
    instagram: env('SOCIAL_INSTAGRAM'),
    facebook: env('SOCIAL_FACEBOOK'),
    x: env('SOCIAL_X'),
    whatsapp: env('WHATSAPP_NUMBER').replace(/\D/g, ''),
  },

  freeShippingAbove: num('FREE_SHIPPING_ABOVE', 999),
  shippingFlat: num('SHIPPING_FLAT', 79),
  deliveryDays: num('DELIVERY_DAYS', 5),
};
