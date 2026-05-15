
require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const webpush = require('web-push');
const QRCode = require('qrcode');
const { generateStickerPrintPdf } = require('./lib/generateStickerPrintPdf');
const pool = require('./db');



const app = express();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:prova@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}


const ADMIN_COOKIE_NAME = 'admin_session';

async function logBlockedAttempt(data = {}) {
  try {
    await pool.query(
      `INSERT INTO blocked_attempt_logs (
        code, plate, public_flow, block_id, matched_block_type, matched_block_value, matched_reason,
        ip_address, ip_city, ip_region, ip_country, sender_phone,
        reason, message_text, location_shared, latitude, longitude, maps_url, user_agent, created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
      [
        data.code || null,
        data.plate || null,
        data.public_flow || null,
        data.block_id || null,
        data.matched_block_type || null,
        data.matched_block_value || null,
        data.matched_reason || null,
        data.ip_address || null,
        data.ip_city || null,
        data.ip_region || null,
        data.ip_country || null,
        data.sender_phone || null,
        data.reason || null,
        data.message_text || null,
        !!data.location_shared,
        data.latitude || null,
        data.longitude || null,
        data.maps_url || null,
        data.user_agent || null
      ]
    );
  } catch (err) {
    console.error('blocked attempt log error:', err);
  }
}

function getAdminUser() {
  return process.env.ADMIN_USER || process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || '';
}

function getAdminPass() {
  return process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || '';
}

function getAdminSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || 'change-this-admin-secret';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) {
      const k = part.slice(0, i).trim();
      const v = part.slice(i + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function signAdminSession(value) {
  const sig = crypto.createHmac('sha256', getAdminSecret()).update(value).digest('hex');
  return `${value}.${sig}`;
}

function verifyAdminSession(token) {
  if (!token || !token.includes('.')) return false;
  const idx = token.lastIndexOf('.');
  const value = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getAdminSecret()).update(value).digest('hex');
  const sigBuffer = Buffer.from(sig, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return (
    value === 'admin-authenticated' &&
    sigBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  );
}

function endOfMonthFromDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addYearsUtc(dateValue, years) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

function toIsoDateOnly(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function computeNextReviewDate(firstRegistrationDate, lastReviewDate) {
  if (lastReviewDate) {
    const d = addYearsUtc(lastReviewDate, 2);
    return toIsoDateOnly(endOfMonthFromDate(d));
  }
  if (firstRegistrationDate) {
    const d = addYearsUtc(firstRegistrationDate, 4);
    return toIsoDateOnly(endOfMonthFromDate(d));
  }
  return null;
}

function pgDateToYmd(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeVehicleServiceRow(row) {
  if (!row) return null;
  return {
    ...row,
    first_registration_date: pgDateToYmd(row.first_registration_date),
    last_review_date: pgDateToYmd(row.last_review_date),
    next_review_date: pgDateToYmd(row.next_review_date),
    insurance_expiry_date: pgDateToYmd(row.insurance_expiry_date),
    tax_expiry_date: pgDateToYmd(row.tax_expiry_date),
    tires_expiry_date: pgDateToYmd(row.tires_expiry_date),
    service_expiry_date: pgDateToYmd(row.service_expiry_date)
  };
}

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!verifyAdminSession(token)) {
    return res.status(401).json({ success: false, error: 'Non autorizzato.' });
  }
  next();
}




function generateOwnerAccessToken() {
  return crypto.randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

function generateCode() {
  return 'AMC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}


function formatEventDateTimeIT(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch (_) {
    return date.toISOString();
  }
}



function normalizeItalianMobileForOtp(input) {
  const raw = String(input || '').trim();
  let cleaned = raw.replace(/[^\d+]/g, '');

  if (!cleaned) {
    return { raw, e164: '', whatsapp: '', isValid: false };
  }

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  if (cleaned.startsWith('39') && !cleaned.startsWith('+39') && cleaned.replace(/\D/g, '').length >= 12) {
    cleaned = '+' + cleaned;
  }

  const onlyNumbers = cleaned.replace(/\D/g, '');

  if (!cleaned.startsWith('+') && onlyNumbers.startsWith('3') && onlyNumbers.length === 10) {
    cleaned = '+39' + onlyNumbers;
  } else if (cleaned.startsWith('+')) {
    cleaned = '+' + onlyNumbers;
  }

  const e164 = cleaned;
  const whatsapp = e164.replace(/\D/g, '');
  const isValid = /^\+393\d{8,10}$/.test(e164);

  return { raw, e164, whatsapp, isValid };
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}


function normalizePhoneForOwnerLogin(value) {
  let raw = String(value || '').trim();
  raw = raw.replace(/\s+/g, '').replace(/[().-]/g, '');
  if (!raw) return '';

  if (raw.startsWith('00')) {
    raw = '+' + raw.slice(2);
  }

  if (raw.startsWith('+')) {
    return raw.replace(/[^\d+]/g, '');
  }

  raw = raw.replace(/\D/g, '');
  if (!raw) return '';

  if (raw.length <= 10) {
    return '+39' + raw;
  }

  if (raw.startsWith('39')) {
    return '+' + raw;
  }

  return '+39' + raw;
}

function normalizePlateForOwnerLogin(value) {
  return String(value || '').toUpperCase().replace(/\s+/g, '').trim();
}

function generatePublicId() {
  return require('crypto')
    .randomBytes(6)
    .toString('base64url')
    .replace(/[-_]/g, '')
    .slice(0, 10)
    .toUpperCase();
}

async function getUniquePublicId(pool) {
  let publicId;
  let exists = true;

  while (exists) {
    publicId = generatePublicId();
    const check = await pool.query(
      'SELECT 1 FROM sticker_codes WHERE public_id = $1 LIMIT 1',
      [publicId]
    );
    exists = check.rows.length > 0;
  }

  return publicId;
}

async function lookupIpArea(ip) {
  let controller;
  let timeoutId;

  try {
    if (!ip) return { city: null, region: null, country: null };

    let cleanIp = String(ip).trim();

    if (cleanIp.startsWith('::ffff:')) {
      cleanIp = cleanIp.replace('::ffff:', '');
    }

    if (cleanIp === '::1' || cleanIp === '127.0.0.1') {
      return { city: 'Locale', region: 'Sviluppo', country: 'IT' };
    }

    const token = process.env.IPINFO_TOKEN;
    const url = token
      ? `https://ipinfo.io/${encodeURIComponent(cleanIp)}/json?token=${encodeURIComponent(token)}`
      : `https://ipinfo.io/${encodeURIComponent(cleanIp)}/json`;

    controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 1200);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { city: null, region: null, country: null };
    }

    const data = await response.json();

    return {
      city: data.city || null,
      region: data.region || null,
      country: data.country || null
    };
  } catch (err) {
    return { city: null, region: null, country: null };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function validateRuntimeEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Variabile ambiente mancante: DATABASE_URL');
  }

  if (!process.env.ADMIN_EMAIL) {
    throw new Error('Variabile ambiente mancante: ADMIN_EMAIL');
  }

  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('Variabile ambiente mancante: ADMIN_PASSWORD');
  }

  if (!process.env.BASE_URL) {
    console.warn('Attenzione: BASE_URL non impostata. Verrà usato il fallback locale.');
  }
}

app.use(cors());

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send('Stripe non configurato.');
  }

  let event;
  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS processed_stripe_events (
        event_id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const eventId = String(event.id || '').trim();
    if (!eventId) {
      return res.status(400).send('Missing event id.');
    }

    const already = await pool.query(
      'SELECT event_id FROM processed_stripe_events WHERE event_id = $1 LIMIT 1',
      [eventId]
    );

    if (already.rows.length) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const publicId = String(session.client_reference_id || '').trim().toUpperCase();
      const paymentLinkId = String(session.payment_link || '').trim();

      if (!publicId) {
        throw new Error('client_reference_id mancante');
      }

      const found = await pool.query(
        `SELECT code, public_id, plan_type, expires_at
         FROM sticker_codes
         WHERE public_id = $1
         LIMIT 1`,
        [publicId]
      );

      if (!found.rows.length) {
        throw new Error(`public_id non trovato: ${publicId}`);
      }

      const row = found.rows[0];
      let newPlanType = row.plan_type;
      let newExpiresAt = row.expires_at ? new Date(row.expires_at) : null;

      const baseDate =
        newExpiresAt && newExpiresAt > new Date()
          ? newExpiresAt
          : new Date();

      if (paymentLinkId === 'plink_1TOheDLHke5YTzVMZFj7FEWu') {
        newPlanType = '1month';
        newExpiresAt = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else if (paymentLinkId === 'plink_1TOiDLLHke5YTzVMHyYzU2fg') {
        newPlanType = '6months';
        newExpiresAt = new Date(baseDate.getTime() + 180 * 24 * 60 * 60 * 1000);
      } else if (paymentLinkId === 'plink_1TOiFYLHke5YTzVMZ4ZrwwYd') {
        newPlanType = '1year';
        newExpiresAt = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      } else if (paymentLinkId === 'plink_1TOiHPLHke5YTzVM4FDxT4DC') {
        newPlanType = 'always';
        newExpiresAt = null;
      } else {
        throw new Error(`Payment Link non riconosciuto: ${paymentLinkId || 'vuoto'}`);
      }

      await pool.query(
        `UPDATE sticker_codes
         SET plan_type = $2,
             expires_at = $3
         WHERE public_id = $1`,
        [publicId, newPlanType, newExpiresAt]
      );
    }

    await pool.query(
      'INSERT INTO processed_stripe_events (event_id) VALUES ($1)',
      [eventId]
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Stripe webhook processing error:', err);
    return res.status(500).send('Webhook processing failed.');
  }
});




app.get('/owner-install/:plate/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    const plate = String(req.params.plate || '').trim().toUpperCase();
    const fallbackTitle = 'Contatto Veicolo';
    const appTitle = plate || fallbackTitle;
    const ownerUrl = `/owner-app.html?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(plate)}`;

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${appTitle}</title>
  <style>
    :root{
      --bg:#eef3fb;
      --card:#ffffff;
      --text:#101828;
      --muted:#667085;
      --line:#e7ecf3;
      --blue:#0a84ff;
      --blue-dark:#0066d6;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;min-height:100%}
    body{
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      background:linear-gradient(180deg,#edf4ff 0%, #f7f9fc 100%);
      color:var(--text);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
    }
    .card{
      width:min(680px,100%);
      background:var(--card);
      border:1px solid rgba(255,255,255,.92);
      border-radius:28px;
      box-shadow:0 16px 40px rgba(16,24,40,.08);
      padding:24px 20px;
      text-align:center;
    }
    .kicker{
      font-size:.78rem;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--blue);
      margin-bottom:8px;
    }
    h1{
      margin:0;
      font-size:clamp(1.8rem,4vw,2.6rem);
      line-height:1.03;
      letter-spacing:-.04em;
      font-weight:900;
    }
    .plate{
      margin-top:8px;
      font-size:1.1rem;
      font-weight:800;
      color:#31445d;
    }
    .copy{
      margin:14px auto 0;
      max-width:520px;
      color:var(--muted);
      line-height:1.6;
      font-size:.98rem;
    }
    .actions{
      display:flex;
      justify-content:center;
      gap:10px;
      flex-wrap:wrap;
      margin-top:18px;
    }
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:46px;
      padding:0 18px;
      border-radius:14px;
      border:1px solid var(--line);
      background:#fff;
      color:var(--text);
      text-decoration:none;
      font-weight:800;
      cursor:pointer;
      box-shadow:0 6px 18px rgba(16,24,40,.04);
    }
    .btn-primary{
      background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%);
      color:#fff;
      border-color:transparent;
      box-shadow:0 14px 26px rgba(10,132,255,.22);
    }
    .note{
      margin-top:14px;
      color:#66758b;
      font-size:.88rem;
      line-height:1.55;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="kicker">Web App personale</div>
    <h1>Salva la tua App</h1>
    <div class="plate">${appTitle}</div>
    <div class="copy">
      Se desideri salvare questa Web App sul tuo iPhone, usa <strong>Condividi</strong> e poi <strong>Aggiungi alla schermata Home</strong>.
      Prima di confermare, verifica il nome proposto. Se necessario, sostituiscilo con la targa.
    </div>

    <div class="actions">
      <a class="btn btn-primary" href="${ownerUrl}">Apri la tua App</a>
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('owner-install path route error:', err);
    return res.status(500).send('Errore apertura pagina di installazione.');
  }
});


app.get('/owner-install.html', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const plate = String(req.query.plate || '').trim().toUpperCase();
    const fallbackTitle = 'Contatto Veicolo';
    const appTitle = plate || fallbackTitle;
    const ownerUrl = `/owner-app.html?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(plate)}`;

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>${appTitle}</title>
  <style>
    :root{
      --bg:#eef3fb;
      --card:#ffffff;
      --text:#101828;
      --muted:#667085;
      --line:#e7ecf3;
      --blue:#0a84ff;
      --blue-dark:#0066d6;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;min-height:100%}
    body{
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
      background:linear-gradient(180deg,#edf4ff 0%, #f7f9fc 100%);
      color:var(--text);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:18px;
    }
    .card{
      width:min(680px,100%);
      background:var(--card);
      border:1px solid rgba(255,255,255,.92);
      border-radius:28px;
      box-shadow:0 16px 40px rgba(16,24,40,.08);
      padding:24px 20px;
      text-align:center;
    }
    .kicker{
      font-size:.78rem;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--blue);
      margin-bottom:8px;
    }
    h1{
      margin:0;
      font-size:clamp(1.8rem,4vw,2.6rem);
      line-height:1.03;
      letter-spacing:-.04em;
      font-weight:900;
    }
    .plate{
      margin-top:8px;
      font-size:1.1rem;
      font-weight:800;
      color:#31445d;
    }
    .copy{
      margin:14px auto 0;
      max-width:520px;
      color:var(--muted);
      line-height:1.6;
      font-size:.98rem;
    }
    .actions{
      display:flex;
      justify-content:center;
      gap:10px;
      flex-wrap:wrap;
      margin-top:18px;
    }
    .btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:46px;
      padding:0 18px;
      border-radius:14px;
      border:1px solid var(--line);
      background:#fff;
      color:var(--text);
      text-decoration:none;
      font-weight:800;
      cursor:pointer;
      box-shadow:0 6px 18px rgba(16,24,40,.04);
    }
    .btn-primary{
      background:linear-gradient(135deg,var(--blue) 0%,var(--blue-dark) 100%);
      color:#fff;
      border-color:transparent;
      box-shadow:0 14px 26px rgba(10,132,255,.22);
    }
    .note{
      margin-top:14px;
      color:#66758b;
      font-size:.88rem;
      line-height:1.55;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="kicker">Web App personale</div>
    <h1>Salva la tua App</h1>
    <div class="plate">${appTitle}</div>
    <div class="copy">
      Se desideri salvare questa Web App sul tuo iPhone, usa <strong>Condividi</strong> e poi <strong>Aggiungi alla schermata Home</strong>.
      Dopo il salvataggio potrai aprire la tua App personale e attivare le notifiche.
    </div>

    <div class="actions">
      <a class="btn btn-primary" href="${ownerUrl}">Apri la tua App</a>
    </div>

    <div class="note">
      Dopo qualche secondo verrai indirizzato automaticamente alla tua App personale.
    </div>
  </div>

  <script>
    setTimeout(function(){
      window.location.replace(${JSON.stringify(ownerUrl)});
    }, 3500);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('owner-install dynamic route error:', err);
    return res.status(500).send('Errore apertura pagina di installazione.');
  }
});


app.get('/owner-app.html', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const plate = String(req.query.plate || '').trim().toUpperCase();
    const fallbackTitle = 'Contatto Veicolo';
    const appTitle = plate || fallbackTitle;

    const filePath = path.join(__dirname, 'public', 'owner-simple.html');
    let html = fs.readFileSync(filePath, 'utf-8');

    html = html.replace(
      '<title>Contatto Veicolo</title>',
      `<title>${appTitle}</title>`
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('owner-app dynamic route error:', err);
    return res.status(500).send('Errore apertura owner app.');
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/api/admin-login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const adminUser = getAdminUser();
    const adminPass = getAdminPass();

    if (!adminUser || !adminPass) {
      return res.status(500).json({ success: false, error: 'Credenziali admin non configurate.' });
    }

    if (String(username || '') !== adminUser || String(password || '') !== adminPass) {
      return res.status(401).json({ success: false, error: 'Credenziali non valide.' });
    }

    const token = signAdminSession('admin-authenticated');
    const isProd = (process.env.PUBLIC_BASE_URL || '').startsWith('https://');
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${isProd ? '; Secure' : ''}`
    );
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore login admin.' });
  }
});

app.post('/api/admin-logout', (req, res) => {
  const isProd = (process.env.PUBLIC_BASE_URL || '').startsWith('https://');
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? '; Secure' : ''}`
  );
  return res.json({ success: true });
});

app.get('/api/admin-auth-check', (req, res) => {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  return res.json({ success: true, authenticated: verifyAdminSession(token) });
});

app.get('/admin.html', (req, res, next) => {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!verifyAdminSession(token)) {
    return res.redirect(302, '/admin-login.html');
  }
  next();
});



app.get('/manifest/owner', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const plate = String(req.query.plate || '').trim();

    let appName = plate || 'Contatto Veicolo';
    let startUrl = '/owner-login.html';

    if (code) {
      const result = await pool.query(
        `SELECT code, plate
         FROM sticker_codes
         WHERE code = $1
         LIMIT 1`,
        [code]
      );

      if (result.rows.length) {
        const row = result.rows[0];
        appName = String(plate || row.plate || 'Contatto Veicolo').trim();
        startUrl = `/owner-simple.html?code=${encodeURIComponent(row.code || code)}&plate=${encodeURIComponent(appName)}`;
      } else if (plate) {
        startUrl = `/owner-simple.html?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(plate)}`;
      }
    }

    const manifest = {
      id: startUrl,
      name: appName,
      short_name: appName,
      description: `Web App personale del veicolo ${appName}`,
      start_url: startUrl,
      scope: '/',
      display: 'standalone',
      background_color: '#07101d',
      theme_color: '#07101d',
      icons: [
        { src: '/icons/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
      ]
    };

    res.setHeader('Content-Type', 'application/manifest+json');
    return res.send(JSON.stringify(manifest, null, 2));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore generazione manifest.' });
  }
});



app.get('/api/push/public-key', (req, res) => {
  return res.json({ success: true, publicKey: vapidPublicKey || '' });
});

app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { code, plate, subscription, invite_token } = req.body || {};

    if (!code || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ success: false, error: 'Dati subscription mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = plate || null;
    const cleanPlateNorm = String(cleanPlate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanInviteToken = invite_token ? String(invite_token).trim() : '';

    let inviteRow = null;

    if (cleanInviteToken) {
      const inviteRes = await pool.query(
        `SELECT id, code, plate, invite_token, status, expires_at, created_by_endpoint
         FROM owner_invites
         WHERE invite_token = $1
         LIMIT 1`,
        [cleanInviteToken]
      );

      inviteRow = inviteRes.rows[0] || null;

      if (!inviteRow) {
        return res.status(404).json({ success: false, error: 'Invito non valido.' });
      }

      const inviteCode = String(inviteRow.code || '').trim().toUpperCase();
      const invitePlateNorm = String(inviteRow.plate || '').trim().toUpperCase().replace(/\s+/g, '');

      if (inviteCode !== cleanCode || invitePlateNorm !== cleanPlateNorm) {
        return res.status(401).json({ success: false, error: 'Invito non corrispondente al veicolo.' });
      }

      if (inviteRow.status === 'revoked') {
        return res.status(410).json({ success: false, error: 'Invito revocato.' });
      }

      if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) {
        await pool.query(
          `UPDATE owner_invites
           SET status = 'expired'
           WHERE id = $1 AND status <> 'used'`,
          [inviteRow.id]
        );
        return res.status(410).json({ success: false, error: 'Invito scaduto.' });
      }
    }

    const existing = await pool.query(
      `SELECT id
       FROM push_subscriptions
       WHERE code = $1
         AND plate IS NOT DISTINCT FROM $2
         AND endpoint <> $3
         AND is_active = TRUE
       ORDER BY id ASC`,
      [cleanCode, cleanPlate, subscription.endpoint]
    );

    const isInviteDevice = !!inviteRow;
    const isFirstDevice = !isInviteDevice && existing.rows.length === 0;
    const saveAsPrimary = isInviteDevice ? false : isFirstDevice;
    const receiveAdminAlerts = isInviteDevice ? false : isFirstDevice;

    await pool.query(
      `INSERT INTO push_subscriptions
       (code, plate, endpoint, p256dh, auth, user_agent, updated_at,
        is_primary, receive_admin_alerts, receive_passenger_alerts, is_active,
        invite_token, invited_by_endpoint, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(),
        $7, $8, TRUE, TRUE,
        $9, $10, NOW())
       ON CONFLICT (endpoint)
       DO UPDATE SET
         code = EXCLUDED.code,
         plate = EXCLUDED.plate,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW(),
         is_primary = EXCLUDED.is_primary,
         receive_admin_alerts = EXCLUDED.receive_admin_alerts,
         receive_passenger_alerts = TRUE,
         is_active = TRUE,
         invite_token = COALESCE(EXCLUDED.invite_token, push_subscriptions.invite_token),
         invited_by_endpoint = COALESCE(EXCLUDED.invited_by_endpoint, push_subscriptions.invited_by_endpoint),
         last_seen_at = NOW()`,
      [
        cleanCode,
        cleanPlate,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        req.headers['user-agent'] || null,
        saveAsPrimary,
        receiveAdminAlerts,
        cleanInviteToken || null,
        inviteRow?.created_by_endpoint || null
      ]
    );

    if (inviteRow) {
      await pool.query(
        `UPDATE owner_invites
         SET status = 'used',
             used_at = COALESCE(used_at, NOW()),
             used_endpoint = $2,
             user_agent = $3
         WHERE id = $1`,
        [inviteRow.id, subscription.endpoint, req.headers['user-agent'] || null]
      );
    }

    // Ruolo dispositivo/veicolo: permette allo stesso endpoint di gestire più veicoli.
    try {
      const primaryRoleCheck = await pool.query(
        `SELECT r.id
         FROM owner_device_vehicle_roles r
         INNER JOIN push_subscriptions ps
           ON ps.endpoint = r.endpoint
          AND ps.code = r.code
          AND REPLACE(UPPER(COALESCE(ps.plate,'')), ' ', '') = REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '')
          AND COALESCE(ps.is_active, TRUE) = TRUE
         WHERE r.code = $1
           AND REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '') = $2
           AND COALESCE(r.is_active, TRUE) = TRUE
           AND COALESCE(r.is_primary, FALSE) = TRUE
         LIMIT 1`,
        [cleanCode, cleanPlateNorm]
      );

      const roleIsPrimary = inviteRow ? false : primaryRoleCheck.rows.length === 0;

      await pool.query(
        `INSERT INTO owner_device_vehicle_roles
         (code, plate, endpoint, is_primary, invite_token, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
         ON CONFLICT (code, plate, endpoint)
         DO UPDATE SET
           is_active = TRUE,
           invite_token = COALESCE(EXCLUDED.invite_token, owner_device_vehicle_roles.invite_token),
           updated_at = NOW()`,
        [cleanCode, cleanPlateNorm, subscription.endpoint, roleIsPrimary, cleanInviteToken || null]
      );
    } catch(e) {
      console.error('owner_device_vehicle_roles upsert error:', e);
    }

    return res.json({
      success: true,
      is_primary: saveAsPrimary,
      invited: isInviteDevice
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore salvataggio subscription.' });
  }
});


app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Endpoint mancante.' });
    }

    await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);

    await pool.query(
      `UPDATE owner_device_vehicle_roles
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE endpoint = $1`,
      [endpoint]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore unsubscribe.' });
  }
});



function normalizeOwnerPlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function requirePrimaryOwnerDevice({ code, plate, endpoint }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanPlate = String(plate || '').trim();
  const cleanPlateNorm = normalizeOwnerPlate(cleanPlate);
  const cleanEndpoint = String(endpoint || '').trim();

  if (!cleanCode || !cleanPlate || !cleanEndpoint) {
    return { ok: false, status: 400, error: 'Dati mancanti.' };
  }

  // Prima verifichiamo che l'endpoint sia davvero una subscription attiva del dispositivo.
  const endpointCheck = await pool.query(
    `SELECT endpoint, invite_token
     FROM push_subscriptions
     WHERE endpoint = $1
       AND COALESCE(is_active, TRUE) = TRUE
     LIMIT 1`,
    [cleanEndpoint]
  );

  if (!endpointCheck.rows.length) {
    return { ok: false, status: 403, error: 'Dispositivo non riconosciuto.' };
  }

  // Recupera eventuale ruolo specifico endpoint + veicolo.
  let role = await pool.query(
    `SELECT id, is_primary, invite_token, is_active
     FROM owner_device_vehicle_roles
     WHERE code = $1
       AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
       AND endpoint = $3
     LIMIT 1`,
    [cleanCode, cleanPlateNorm, cleanEndpoint]
  );

  // Se non esiste ruolo per questa vettura, crealo automaticamente SOLO se non esiste già
  // un proprietario principale con subscription push ancora realmente attiva.
  if (!role.rows.length) {
    const primaryCheck = await pool.query(
      `SELECT r.id
       FROM owner_device_vehicle_roles r
       INNER JOIN push_subscriptions ps
         ON ps.endpoint = r.endpoint
        AND ps.code = r.code
        AND REPLACE(UPPER(COALESCE(ps.plate,'')), ' ', '') = REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '')
        AND COALESCE(ps.is_active, TRUE) = TRUE
       WHERE r.code = $1
         AND REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '') = $2
         AND COALESCE(r.is_active, TRUE) = TRUE
         AND COALESCE(r.is_primary, FALSE) = TRUE
       LIMIT 1`,
      [cleanCode, cleanPlateNorm]
    );

    const makePrimary = primaryCheck.rows.length === 0;

    const inserted = await pool.query(
      `INSERT INTO owner_device_vehicle_roles
       (code, plate, endpoint, is_primary, invite_token, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, TRUE, NOW(), NOW())
       ON CONFLICT (code, plate, endpoint)
       DO UPDATE SET
         updated_at = NOW()
       RETURNING id, is_primary, invite_token, is_active`,
      [cleanCode, cleanPlateNorm, cleanEndpoint, makePrimary]
    );

    role = inserted;
  }

  const row = role.rows[0];

  if (!row || row.is_active === false) {
    return { ok: false, status: 403, error: 'Accesso non attivo.' };
  }

  if (row.invite_token) {
    return { ok: false, status: 403, error: 'Funzione disponibile solo dal dispositivo principale.' };
  }

  if (row.is_primary === true) {
    return {
      ok: true,
      code: cleanCode,
      plate: cleanPlateNorm,
      plateNorm: cleanPlateNorm,
      endpoint: cleanEndpoint
    };
  }

  return { ok: false, status: 403, error: 'Funzione disponibile solo dal dispositivo principale.' };
}


function buildPublicBaseUrl(req) {
  const envBase = process.env.PUBLIC_BASE_URL || '';
  if (envBase) return envBase.replace(/\/$/, '');
  const host = req.get('host');
  const isRenderHost = /onrender\.com$/i.test(host || '');
  return isRenderHost ? `https://${host}` : `${req.protocol}://${host}`;
}

function createInviteToken() {
  return require('node:crypto').randomBytes(24).toString('hex');
}

app.post('/api/owner/create-invite', async (req, res) => {
  try {
    const { code, plate, endpoint } = req.body || {};
    const owner = await requirePrimaryOwnerDevice({ code, plate, endpoint });

    if (!owner.ok) {
      return res.status(owner.status).json({ success: false, error: owner.error });
    }

    let inviteToken = null;

    for (let i = 0; i < 10; i++) {
      const candidate = createInviteToken();
      const exists = await pool.query(
        `SELECT 1 FROM owner_invites WHERE invite_token = $1 LIMIT 1`,
        [candidate]
      );

      if (!exists.rows.length) {
        inviteToken = candidate;
        break;
      }
    }

    if (!inviteToken) {
      return res.status(500).json({ success: false, error: 'Impossibile generare invito univoco.' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const inserted = await pool.query(
      `INSERT INTO owner_invites
       (code, plate, invite_token, status, created_by_endpoint, created_at, sent_at, expires_at)
       VALUES ($1, $2, $3, 'pending', $4, NOW(), NOW(), $5)
       RETURNING id, code, plate, invite_token, status, created_at, sent_at, opened_at, used_at, revoked_at, expires_at`,
      [owner.code, owner.plate, inviteToken, owner.endpoint, expiresAt]
    );

    const baseUrl = buildPublicBaseUrl(req);
    const inviteUrl = `${baseUrl}/owner-invite/${inviteToken}`;

    const shareText =
`Ciao, ti invio l’accesso agli avvisi del mio veicolo.

Apri questo link dal telefono, salva la Web App e attiva le notifiche:

${inviteUrl}

Il link è personale e può essere usato una sola volta.`;

    return res.json({
      success: true,
      invite: inserted.rows[0],
      invite_url: inviteUrl,
      share_text: shareText
    });
  } catch (err) {
    console.error('owner create-invite error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore creazione invito.',
      detail: err && err.message ? err.message : String(err),
      code: err && err.code ? err.code : null
    });
  }
});

app.post('/api/owner/list-invites', async (req, res) => {
  try {
    const { code, plate, endpoint } = req.body || {};
    const owner = await requirePrimaryOwnerDevice({ code, plate, endpoint });

    if (!owner.ok) {
      return res.status(owner.status).json({ success: false, error: owner.error });
    }

    const rows = await pool.query(
      `SELECT
         oi.id,
         oi.code,
         oi.plate,
         oi.invite_token,
         oi.status,
         oi.created_at,
         oi.sent_at,
         oi.opened_at,
         oi.used_at,
         oi.revoked_at,
         oi.expires_at,
         oi.used_endpoint,
         ps.is_active AS notification_active,
         ps.receive_passenger_alerts,
         ps.receive_admin_alerts,
         ps.is_primary,
         ps.app_saved_detected,
         ps.app_saved_detected_at,
         ps.last_seen_at
       FROM owner_invites oi
       LEFT JOIN push_subscriptions ps
         ON ps.endpoint = oi.used_endpoint
       WHERE oi.code = $1
         AND REPLACE(UPPER(COALESCE(oi.plate,'')), ' ', '') = $2
       ORDER BY oi.created_at DESC, oi.id DESC
       LIMIT 100`,
      [owner.code, owner.plateNorm]
    );

    return res.json({ success: true, items: rows.rows || [] });
  } catch (err) {
    console.error('owner list-invites error:', err);
    return res.status(500).json({ success: false, error: 'Errore elenco inviti.' });
  }
});


app.post('/api/owner/delete-invite', async (req, res) => {
  try {
    const { code, plate, endpoint, invite_id } = req.body || {};

    const owner = await requirePrimaryOwnerDevice({ code, plate, endpoint });
    if (!owner.ok) {
      return res.status(owner.status || 403).json({ success: false, error: owner.error || 'Non autorizzato.' });
    }

    const inviteId = Number(invite_id);
    if (!inviteId || !Number.isFinite(inviteId)) {
      return res.status(400).json({ success: false, error: 'ID invito mancante.' });
    }

    const inviteRes = await pool.query(
      `SELECT id, code, plate, invite_token, used_endpoint
       FROM owner_invites
       WHERE id = $1
         AND code = $2
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $3
       LIMIT 1`,
      [inviteId, owner.code, owner.plateNorm]
    );

    if (!inviteRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Invito non trovato.' });
    }

    const invite = inviteRes.rows[0];

    // Se l’invito aveva già prodotto un accesso, lo disattiviamo prima di cancellare la riga.
    if (invite.invite_token) {
      await pool.query(
        `UPDATE owner_device_vehicle_roles
         SET is_active = FALSE,
             is_primary = FALSE,
             updated_at = NOW()
         WHERE code = $1
           AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
           AND invite_token = $3`,
        [owner.code, owner.plateNorm, invite.invite_token]
      );

      await pool.query(
        `UPDATE push_subscriptions
         SET is_active = FALSE,
             receive_admin_alerts = FALSE,
             receive_passenger_alerts = FALSE,
             updated_at = NOW()
         WHERE code = $1
           AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
           AND invite_token = $3`,
        [owner.code, owner.plateNorm, invite.invite_token]
      );
    }

    await pool.query(
      `DELETE FROM owner_invites
       WHERE id = $1
         AND code = $2
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $3`,
      [inviteId, owner.code, owner.plateNorm]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('owner delete-invite error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore cancellazione invito.',
      detail: err && err.message ? err.message : String(err)
    });
  }
});


app.post('/api/owner/revoke-invite', async (req, res) => {
  try {
    const { code, plate, endpoint, invite_id } = req.body || {};
    const owner = await requirePrimaryOwnerDevice({ code, plate, endpoint });

    if (!owner.ok) {
      return res.status(owner.status).json({ success: false, error: owner.error });
    }

    const inviteId = Number(invite_id);

    if (!Number.isFinite(inviteId) || inviteId <= 0) {
      return res.status(400).json({ success: false, error: 'ID invito non valido.' });
    }

    const found = await pool.query(
      `SELECT id, used_endpoint
       FROM owner_invites
       WHERE id = $1
         AND code = $2
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $3
       LIMIT 1`,
      [inviteId, owner.code, owner.plateNorm]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Invito non trovato.' });
    }

    const invite = found.rows[0];

    await pool.query(
      `UPDATE owner_invites
       SET status = 'revoked',
           revoked_at = NOW()
       WHERE id = $1`,
      [inviteId]
    );

    if (invite.used_endpoint) {
      await pool.query(
        `UPDATE push_subscriptions
         SET is_active = FALSE,
             receive_admin_alerts = FALSE,
             receive_passenger_alerts = FALSE,
             updated_at = NOW()
         WHERE endpoint = $1`,
        [invite.used_endpoint]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('owner revoke-invite error:', err);
    return res.status(500).json({ success: false, error: 'Errore revoca invito.' });
  }
});

app.get('/owner-invite/:invite_token', async (req, res) => {
  try {
    const inviteToken = String(req.params.invite_token || '').trim();

    const result = await pool.query(
      `SELECT id, code, plate, status, expires_at
       FROM owner_invites
       WHERE invite_token = $1
       LIMIT 1`,
      [inviteToken]
    );

    const invite = result.rows[0];

    if (!invite) {
      return res.status(404).send('Invito non valido.');
    }

    if (invite.status === 'revoked') {
      return res.status(410).send('Invito revocato.');
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      await pool.query(
        `UPDATE owner_invites
         SET status = 'expired'
         WHERE id = $1 AND status <> 'used'`,
        [invite.id]
      );
      return res.status(410).send('Invito scaduto.');
    }

    await pool.query(
      `UPDATE owner_invites
       SET opened_at = COALESCE(opened_at, NOW())
       WHERE id = $1`,
      [invite.id]
    );

    return res.redirect(
      302,
      `/owner-simple.html?code=${encodeURIComponent(invite.code)}&plate=${encodeURIComponent(invite.plate || '')}&inviteToken=${encodeURIComponent(inviteToken)}`
    );
  } catch (err) {
    console.error('owner-invite error:', err);
    return res.status(500).send('Errore apertura invito.');
  }
});


app.get('/scopri-servizio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scopri-servizio.html'));
});



async function ensureCustomerFeedbacksTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_feedbacks (
      id BIGSERIAL PRIMARY KEY,
      public_id TEXT,
      code TEXT,
      plate TEXT,
      brand TEXT,
      vehicle_model TEXT,
      sentiment TEXT,
      reason TEXT,
      details TEXT,
      suggestions TEXT,
      contact_permission BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE customer_feedbacks ADD COLUMN IF NOT EXISTS suggestions TEXT");
}

app.get('/feedback/u/:public_id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

app.post('/api/feedback', async (req, res) => {
  try {
    await ensureCustomerFeedbacksTable();

    const body = req.body || {};
    const publicId = String(body.public_id || '').trim().toUpperCase() || null;
    const code = String(body.code || '').trim() || null;
    const plate = String(body.plate || '').trim().toUpperCase() || null;
    const brand = String(body.brand || '').trim() || null;
    const vehicleModel = String(body.vehicle_model || '').trim() || null;
    const sentiment = String(body.sentiment || '').trim() || 'neutral';
    const reason = String(body.reason || '').trim();
    const details = String(body.details || '').trim();
    const suggestions = String(body.suggestions || '').trim();
    const contactPermission = !!body.contact_permission;

    if (!reason) {
      return res.status(400).json({ success: false, error: 'Motivazione mancante.' });
    }

    await pool.query(
      `INSERT INTO customer_feedbacks
       (public_id, code, plate, brand, vehicle_model, sentiment, reason, details, suggestions, contact_permission, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [publicId, code, plate, brand, vehicleModel, sentiment, reason, details, suggestions, contactPermission]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('api feedback error:', err);
    return res.status(500).json({ success: false, error: 'Errore salvataggio feedback.' });
  }
});

app.get('/api/admin/feedbacks', requireAdmin, async (req, res) => {
  try {
    await ensureCustomerFeedbacksTable();

    const result = await pool.query(
      `SELECT id, public_id, code, plate, brand, vehicle_model, sentiment, reason, details, suggestions, contact_permission, created_at
       FROM customer_feedbacks
       ORDER BY created_at DESC
       LIMIT 200`
    );

    return res.json({ success: true, feedbacks: result.rows });
  } catch (err) {
    console.error('api admin feedbacks error:', err);
    return res.status(500).json({ success: false, error: 'Errore lettura feedback.' });
  }
});



app.get('/owner-manifest.json', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim();
    const plateFromQuery = String(req.query.plate || '').trim().toUpperCase();

    let appName = plateFromQuery || 'TARGA';

    if ((!plateFromQuery || plateFromQuery === 'TARGA') && code) {
      try {
        const result = await pool.query(
          `SELECT plate FROM sticker_codes WHERE code = $1 LIMIT 1`,
          [code]
        );
        if (result.rows && result.rows[0] && result.rows[0].plate) {
          appName = String(result.rows[0].plate).trim().toUpperCase();
        }
      } catch (e) {}
    }

    // Nome Web App: SOLO TARGA
    appName = String(appName || 'TARGA').trim().toUpperCase();

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.json({
      name: appName,
      short_name: appName,
      description: 'Contatto Veicolo',
      start_url: `/owner-app/${encodeURIComponent(code)}/${encodeURIComponent(appName)}`,
      scope: '/',
      display: 'standalone',
      background_color: '#07111c',
      theme_color: '#07111c',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/apple-touch-icon.png',
          sizes: '180x180',
          type: 'image/png'
        }
      ]
    });
  } catch (err) {
    console.error('owner-manifest error:', err);
    return res.status(500).json({ error: 'manifest error' });
  }
});



app.get('/owner-app/:code/:plate', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    const plate = String(req.params.plate || '').trim().toUpperCase();

    if (!code || !plate) {
      return res.redirect('/owner-login.html');
    }

    const filePath = path.join(__dirname, 'public', 'owner-simple.html');
    let html = fs.readFileSync(filePath, 'utf8');

    const safePlate = plate.replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[c]));

    const manifestHref = `/owner-manifest.json?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(plate)}&v=${Date.now()}`;

    html = html.replace(/<title>.*?<\/title>/is, `<title>${safePlate}</title>`);

    html = html.replace(
      /<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i,
      `<meta name="apple-mobile-web-app-title" content="${safePlate}">`
    );

    html = html.replace(
      /<link\s+id=["']ownerDynamicManifest["']\s+rel=["']manifest["'][^>]*>/i,
      `<link id="ownerDynamicManifest" rel="manifest" href="${manifestHref}">`
    );

    html = html.replace(
      /<link\s+rel=["']manifest["'][^>]*>/i,
      `<link id="ownerDynamicManifest" rel="manifest" href="${manifestHref}">`
    );

    html = html.replace(
      /<body([^>]*)>/i,
      `<body$1 data-owner-code="${code.replace(/"/g,'')}" data-owner-plate="${safePlate}">`
    );

    // Forza il link "Come funziona" a portare sempre il contesto veicolo.
    const howItWorksHref = `/come-funziona?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(plate)}`;
    html = html.replace(
      /<a([^>]*id=["']ownerHowItWorksLink["'][^>]*)href=["'][^"']*["']([^>]*)>/i,
      `<a$1href="${howItWorksHref}"$2>`
    );
    html = html.replace(
      /<a([^>]*class=["'][^"']*owner-service-intro-link[^"']*["'][^>]*)href=["'][^"']*["']([^>]*)>/i,
      `<a$1href="${howItWorksHref}"$2>`
    );

    // Se qualche script legge la querystring, garantiamo anche il redirect logico interno
    // senza cambiare URL visibile.
    html = html.replace(
      '</head>',
      `<script>
(function(){
  try {
    window.__OWNER_CODE__ = ${JSON.stringify(code)};
    window.__OWNER_PLATE__ = ${JSON.stringify(plate)};
    document.title = ${JSON.stringify(plate)};
  } catch(e) {}
})();
</script>
</head>`
    );

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(html);
  } catch (err) {
    console.error('owner-app plate route error:', err);
    return res.status(500).send('Errore apertura App proprietario.');
  }
});



app.get('/owner-simple.html', async (req, res, next) => {
  try {
    const code = String(req.query.code || '').trim();
    let plate = String(req.query.plate || '').trim().toUpperCase();

    // Se non ci sono code/plate, lascia servire il file statico normale.
    if (!code && !plate) {
      return next();
    }

    // Se ho il codice ma la targa manca, provo a leggerla dal DB.
    if (code && !plate) {
      try {
        const result = await pool.query(
          `SELECT plate FROM sticker_codes WHERE code = $1 LIMIT 1`,
          [code]
        );
        if (result.rows && result.rows[0] && result.rows[0].plate) {
          plate = String(result.rows[0].plate).trim().toUpperCase();
        }
      } catch (e) {}
    }

    const appName = plate || 'TARGA';

    const filePath = path.join(__dirname, 'public', 'owner-simple.html');
    let html = fs.readFileSync(filePath, 'utf8');

    const safeName = String(appName).replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#039;'
    }[c]));

    const safeCode = String(code).replace(/"/g, '');
    const safePlate = String(appName).replace(/"/g, '');

    const manifestHref = `/owner-manifest.json?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(appName)}&v=${Date.now()}`;

    html = html.replace(/<title>.*?<\/title>/is, `<title>${safeName}</title>`);

    if (/<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i.test(html)) {
      html = html.replace(
        /<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i,
        `<meta name="apple-mobile-web-app-title" content="${safeName}">`
      );
    } else {
      html = html.replace(
        '</title>',
        `</title>\n  <meta name="apple-mobile-web-app-title" content="${safeName}">`
      );
    }

    if (/<link\s+id=["']ownerDynamicManifest["'][^>]*>/i.test(html)) {
      html = html.replace(
        /<link\s+id=["']ownerDynamicManifest["'][^>]*>/i,
        `<link id="ownerDynamicManifest" rel="manifest" href="${manifestHref}">`
      );
    } else if (/<link\s+rel=["']manifest["'][^>]*>/i.test(html)) {
      html = html.replace(
        /<link\s+rel=["']manifest["'][^>]*>/i,
        `<link id="ownerDynamicManifest" rel="manifest" href="${manifestHref}">`
      );
    } else {
      html = html.replace(
        '</title>',
        `</title>\n  <link id="ownerDynamicManifest" rel="manifest" href="${manifestHref}">`
      );
    }

    html = html.replace(
      /<body([^>]*)>/i,
      `<body$1 data-owner-code="${safeCode}" data-owner-plate="${safePlate}">`
    );

    // Forza il link "Come funziona" anche nella route query legacy.
    const howItWorksHrefLegacy = `/come-funziona?code=${encodeURIComponent(code)}&plate=${encodeURIComponent(appName)}`;
    html = html.replace(
      /<a([^>]*id=["']ownerHowItWorksLink["'][^>]*)href=["'][^"']*["']([^>]*)>/i,
      `<a$1href="${howItWorksHrefLegacy}"$2>`
    );
    html = html.replace(
      /<a([^>]*class=["'][^"']*owner-service-intro-link[^"']*["'][^>]*)href=["'][^"']*["']([^>]*)>/i,
      `<a$1href="${howItWorksHrefLegacy}"$2>`
    );

    if (!html.includes('window.__OWNER_CODE__')) {
      html = html.replace(
        '</head>',
        `<script>
(function(){
  try {
    window.__OWNER_CODE__ = ${JSON.stringify(code)};
    window.__OWNER_PLATE__ = ${JSON.stringify(appName)};
    document.title = ${JSON.stringify(appName)};
  } catch(e) {}
})();
</script>
</head>`
      );
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.send(html);
  } catch (err) {
    console.error('dynamic owner-simple error:', err);
    return next();
  }
});



app.get('/api/temp-debug-plate/:plate', requireAdmin, async (req, res) => {
  try {
    const plate = String(req.params.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    const records = await pool.query(
      `SELECT id, code, public_id, plate, brand, vehicle_model, color, phone, qr_url,
              status, plan_type, expires_at, activated_at, created_at
       FROM sticker_codes
       WHERE UPPER(REPLACE(plate, ' ', '')) = $1
       ORDER BY id DESC`,
      [plate]
    );

    const codes = records.rows.map(r => r.code).filter(Boolean);
    const publicIds = records.rows.map(r => r.public_id).filter(Boolean);

    const messages = codes.length ? await pool.query(
      `SELECT id, code, plate, reason, message_text, location_shared,
              latitude, longitude, maps_url, ip_city, ip_region, ip_country,
              created_at, read_at
       FROM contact_message_logs
       WHERE code = ANY($1)
       ORDER BY created_at DESC
       LIMIT 80`,
      [codes]
    ) : { rows: [] };

    const subscriptions = codes.length ? await pool.query(
      `SELECT id, code, plate, endpoint, is_active, is_primary,
              app_saved_detected, app_saved_detected_at,
              last_seen_at, created_at, updated_at
       FROM push_subscriptions
       WHERE code = ANY($1)
          OR UPPER(REPLACE(COALESCE(plate,''), ' ', '')) = $2
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 80`,
      [codes, plate]
    ) : { rows: [] };

    const roles = codes.length ? await pool.query(
      `SELECT id, code, plate, endpoint, is_primary, is_active,
              created_at, updated_at
       FROM owner_device_vehicle_roles
       WHERE code = ANY($1)
          OR UPPER(REPLACE(COALESCE(plate,''), ' ', '')) = $2
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 80`,
      [codes, plate]
    ) : { rows: [] };

    return res.json({
      success: true,
      plate,
      records: records.rows,
      public_ids: publicIds,
      messages_count: messages.rows.length,
      latest_messages: messages.rows,
      push_subscriptions: subscriptions.rows.map(x => ({
        ...x,
        endpoint: x.endpoint ? x.endpoint.slice(0, 90) + '...' : null
      })),
      owner_device_vehicle_roles: roles.rows.map(x => ({
        ...x,
        endpoint: x.endpoint ? x.endpoint.slice(0, 90) + '...' : null
      }))
    });
  } catch (err) {
    console.error('temp-debug-plate error:', err);
    return res.status(500).json({ success:false, error: err.message });
  }
});



app.get('/come-funziona', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'come-funziona.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


let ownerQuickAccessDebug = {
  code: null,
  plate: null,
  saved_at: null
};

app.post('/api/debug-owner-quick-access', requireAdmin, express.json(), (req, res) => {
  try {
    const { code, plate } = req.body || {};
    ownerQuickAccessDebug = {
      code: code || null,
      plate: plate || null,
      saved_at: new Date().toISOString()
    };
    return res.json({ success: true, debug: ownerQuickAccessDebug });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
});


app.get('/api/debug-owner-quick-access-ping', requireAdmin, (req, res) => {
  try {
    const code = String(req.query.code || '');
    const plate = String(req.query.plate || '');
    ownerQuickAccessDebug = {
      code: code || null,
      plate: plate || null,
      saved_at: new Date().toISOString()
    };
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
});


app.get('/api/debug-owner-quick-access', requireAdmin, (req, res) => {
  return res.json({ success: true, debug: ownerQuickAccessDebug });
});





function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


app.get('/owner-print-sign.html', async (req, res) => {
  try {
    const escHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const cleanCode = String(req.query.code || '').trim().toUpperCase();
    const cleanPlate = String(req.query.plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const isDownloadFile = String(req.query.download || '') === '1';

    if (!cleanCode && !cleanPlate) {
      return res.status(400).send('Inserisci almeno codice o targa.');
    }

    let found;

    if (cleanCode) {
      found = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE code = $1
         LIMIT 1`,
        [cleanCode]
      );
    } else {
      found = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         ORDER BY activated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [cleanPlate]
      );
    }

    if (!found.rows.length) {
      return res.status(404).send('Record non trovato.');
    }

    let row = found.rows[0];
    let dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    // Android/PWA può conservare un vecchio code nel contesto salvato.
    // Se la targa è presente ma non corrisponde al code, proviamo a risolvere il record dalla targa.
    if (cleanPlate && dbPlate !== cleanPlate) {
      const fallbackByPlate = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         ORDER BY activated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [cleanPlate]
      );

      if (!fallbackByPlate.rows.length) {
        return res.status(401).send('Targa non corrispondente al codice.');
      }

      row = fallbackByPlate.rows[0];
      dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');
    }

    let qrValue = '';
    if (row.qr_url && String(row.qr_url).trim()) {
      qrValue = String(row.qr_url).trim();
    } else if (row.public_id && String(row.public_id).trim()) {
      const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com').replace(/\/$/, '');
      qrValue = `${baseUrl}/contact/u/${encodeURIComponent(String(row.public_id).trim())}`;
    } else {
      return res.status(400).send('QR URL o public_id mancante.');
    }

    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 900,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const vehicleLabel = [row.brand, row.vehicle_model].filter(Boolean).join(' ') || 'Veicolo';

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contatto Veicolo - Cartello V15 - ${escHtml(row.plate || '')}</title>
  <style>
    @page { size: A4; margin: 0; }

    @media print {
      html, body {
        width: 210mm;
        height: 297mm;
        margin: 0;
        background: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .no-print { display: none !important; }

      .a4-page {
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        width: 210mm !important;
        height: 297mm !important;
      }
    }

    body {
      background-color: #f1f5f9;
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .no-print {
      width: 100%;
      padding: 14px 22px;
      background: #0f172a;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 12px 28px rgba(0,0,0,.22);
      position: sticky;
      top: 0;
      z-index: 100;
      box-sizing: border-box;
    }

    .no-print-title {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #ffea00;
    }

    .no-print-sub {
      font-size: 12px;
      opacity: .72;
      margin-top: 3px;
    }

    .print-btn {
      background: #ffea00;
      color: #000;
      border: 0;
      padding: 12px 24px;
      border-radius: 999px;
      font-weight: 900;
      cursor: pointer;
    }

    .a4-page {
      width: 210mm;
      height: 297mm;
      background: white;
      margin: 20px auto;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    }

    .safety-yellow { background-color: #ffea00 !important; }

    .archivo-extra {
      font-family: Impact, "Arial Black", Arial, sans-serif;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .slot-cut {
      width: 32mm;
      height: 6px;
      background: black !important;
      margin: 8mm auto;
      border-radius: 2px;
      border: 1.5px solid white;
    }

    .driver-text-container {
      transform: rotate(90deg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 80mm;
      height: 60mm;
    }

    .tongue-shape {
      height: 32mm;
      background-color: #ffea00;
      border: 5px solid black;
      border-left: none;
      clip-path: polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%);
      width: 130mm;
      position: relative;
      z-index: 20;
    }

    .qr-border-slim { border: 6px solid black; }

    .top-block {
      position: relative;
      width: 190mm;
      margin-top: 10mm;
    }

    .cut-guide-main {
      position: absolute;
      top: -6mm;
      left: -6mm;
      width: 202mm;
      height: 170mm;
      border: 1.5px dashed #cbd5e1;
      border-radius: 40px;
      pointer-events: none;
    }

    .receiver-tab {
      width: 52mm;
      height: 60mm;
      margin: 0 auto;
      border-radius: 24px 24px 0 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: 4mm;
      border-left: 1px solid rgba(0,0,0,.05);
      border-right: 1px solid rgba(0,0,0,.05);
      box-sizing: border-box;
    }

    .main-sign {
      width: 190mm;
      height: 100mm;
      border-radius: 30px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 6mm;
      position: relative;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,.05);
      border-top: 1px solid rgba(0,0,0,.10);
      box-sizing: border-box;
    }

    .headline {
      font-size: 28pt;
      line-height: .92;
      color: #000;
      text-transform: uppercase;
      text-align: center;
      letter-spacing: -0.045em;
      margin: 2mm 0 0 0;
    }

    .center-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4mm;
    }

    .qr-box {
      width: 52mm;
      height: 52mm;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 30px;
      box-shadow: 0 14px 28px rgba(0,0,0,.22);
      padding: 4mm;
      box-sizing: border-box;
      overflow: hidden;
    }

    .qr-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .cta-main {
      font-size: 24pt;
      color: #000;
      text-transform: uppercase;
      line-height: .9;
      letter-spacing: -0.04em;
      margin: 0;
      text-align: center;
    }

    .bottom-claim {
      width: 100%;
      border-top: 3px solid rgba(0,0,0,.10);
      padding-top: 2mm;
      text-align: center;
      margin-bottom: 2mm;
    }

    .bottom-claim p {
      margin: 0;
      font-size: 11pt;
      font-weight: 900;
      color: #000;
      text-transform: uppercase;
      letter-spacing: .20em;
      opacity: .80;
    }

    .separator { height: 10mm; }

    .extension-area {
      position: relative;
      width: 100%;
      padding: 0 6mm;
      display: flex;
      justify-content: center;
      margin-top: 12mm;
      box-sizing: border-box;
    }

    .extension-inner {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      height: 85mm;
    }

    .driver-handle {
      width: 60mm;
      height: 85mm;
      border: 6px solid black;
      border-radius: 40px 0 0 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,.15);
      position: relative;
      z-index: 30;
      box-sizing: border-box;
    }

    .driver-arrow {
      width: 16mm;
      height: 16mm;
      margin-bottom: 4mm;
    }

    .driver-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1mm;
    }

    .driver-big {
      font-size: 22pt;
      color: #000;
      text-transform: uppercase;
      line-height: .9;
    }

    .driver-small {
      font-size: 10pt;
      font-weight: 900;
      color: rgba(0,0,0,.40);
      text-transform: uppercase;
      letter-spacing: .20em;
    }

    .guide-extension {
      position: absolute;
      top: -12mm;
      left: 4mm;
      right: 4mm;
      height: 110mm;
      border: 1.5px dashed #cbd5e1;
      border-radius: 45px;
      pointer-events: none;
      z-index: 0;
    }

    .footer {
      position: absolute;
      bottom: 8mm;
      width: 100%;
      padding: 0 12mm;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      opacity: .20;
      box-sizing: border-box;
    }

    .footer div {
      font-size: 8pt;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: #000;
    }
  </style>

${isDownloadFile ? `` : `<style id="owner-print-topbar-v1">
  .owner-print-topbar{
    position:fixed;
    top:0;
    left:0;
    right:0;
    z-index:999999;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:10px;
    padding:10px 12px;
    box-sizing:border-box;
    background:rgba(7,17,28,.92);
    backdrop-filter:blur(10px);
    border-bottom:1px solid rgba(255,255,255,.10);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }

  .owner-print-topbar-left,
  .owner-print-topbar-right{
    display:flex;
    gap:8px;
    align-items:center;
    flex-wrap:wrap;
  }

  .owner-print-action{
    min-height:38px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    border:0;
    border-radius:12px;
    padding:0 13px;
    font-size:13px;
    line-height:1;
    font-weight:850;
    text-decoration:none;
    cursor:pointer;
    white-space:nowrap;
    color:#ffffff;
    background:#2b6eea;
    box-shadow:0 8px 20px rgba(43,110,234,.22);
  }

  .owner-print-action.secondary{
    background:rgba(255,255,255,.10);
    color:#ffffff;
    border:1px solid rgba(255,255,255,.12);
    box-shadow:none;
  }

  .owner-print-action.download{
    background:#18a058;
    box-shadow:0 8px 20px rgba(24,160,88,.20);
  }

  .owner-print-page-offset{
    height:62px;
  }

  @media print{
    .owner-print-topbar,
    .owner-print-page-offset{
      display:none !important;
    }
  }

  @media(max-width:520px){
    .owner-print-topbar{
      align-items:stretch;
      flex-direction:column;
    }
    .owner-print-topbar-left,
    .owner-print-topbar-right{
      width:100%;
      justify-content:space-between;
    }
    .owner-print-action{
      flex:1;
      padding:0 10px;
    }
  }
</style>`}

</head>
<body>

${isDownloadFile ? `` : `<div class="owner-print-topbar" id="ownerPrintTopbar">
  <div class="owner-print-topbar-left">
    <button type="button" class="owner-print-action secondary" id="ownerPrintBackBtn">← Torna all’App</button>
  </div>
  <div class="owner-print-topbar-right">
    <button type="button" class="owner-print-action" id="ownerPrintNowBtn">Stampa</button>
    <a class="owner-print-action download" id="ownerPrintDownloadBtn" href="#" download>Scarica file</a>
  </div>
</div>
<div class="owner-print-page-offset"></div>`}

  <div class="no-print">
    <div>
      <div class="no-print-title">Contatto Veicolo — Cartello V15</div>
      <div class="no-print-sub">${escHtml(vehicleLabel)} · ${escHtml(row.plate || '')} · QR reale: ${escHtml(qrValue)}</div>
    </div>
    <button class="print-btn" onclick="window.print()">STAMPA PDF HD</button>
  </div>

  <div class="a4-page">
    <div class="top-block">
      <div class="cut-guide-main"></div>

      <div class="receiver-tab safety-yellow">
        <div class="slot-cut"></div>
        <div class="slot-cut"></div>
      </div>

      <div class="main-sign safety-yellow">
        <h2 class="headline archivo-extra">PROBLEMA CON QUESTO MEZZO?</h2>

        <div class="center-content">
          <div class="qr-box qr-border-slim">
            <img src="${qrDataUrl}" alt="QR Code Contatto Veicolo">
          </div>

          <p class="cta-main archivo-extra">Avvisa subito il proprietario</p>
        </div>

        <div class="bottom-claim">
          <p>ANONIMO • SICURO • IMMEDIATO</p>
        </div>
      </div>
    </div>

    <div class="separator"></div>

    <div class="extension-area">
      <div class="extension-inner">
        <div class="driver-handle safety-yellow">
          <div class="driver-text-container">
            <svg xmlns="http://www.w3.org/2000/svg" class="driver-arrow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>

            <div class="driver-stack">
              <h3 class="driver-big archivo-extra">ABBASSAMI</h3>
              <div class="driver-small">quando</div>
              <h3 class="driver-big archivo-extra">PARCHEGGI</h3>
            </div>
          </div>
        </div>

        <div class="tongue-shape"></div>
      </div>

      <div class="guide-extension"></div>
    </div>

    <div class="footer">
      <div>Contatto Veicolo System • Driver Perspective Optimized</div>
      <div>v15 Test Layout</div>
    </div>
  </div>

${isDownloadFile ? `` : `<script id="owner-print-topbar-script-v1">
(function(){
  function qs(name){
    try { return new URLSearchParams(window.location.search || '').get(name) || ''; }
    catch(e){ return ''; }
  }

  function cleanCode(v){
    return String(v || '').trim().toUpperCase();
  }

  function cleanPlate(v){
    return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  var code = cleanCode(qs('code'));
  var plate = cleanPlate(qs('plate'));

  var ownerAppUrl = (code && plate)
    ? '/owner-app/' + encodeURIComponent(code) + '/' + encodeURIComponent(plate)
    : '/owner-login.html';

  var pdfUrl = (code && plate)
    ? '/owner-print-sign.html?download=1&code=' + encodeURIComponent(code) + '&plate=' + encodeURIComponent(plate)
    : '#';

  var backBtn = document.getElementById('ownerPrintBackBtn');
  var printBtn = document.getElementById('ownerPrintNowBtn');
  var downloadBtn = document.getElementById('ownerPrintDownloadBtn');

  if (downloadBtn) {
    downloadBtn.href = pdfUrl;
    downloadBtn.setAttribute('download', plate ? ('contatto-veicolo-' + plate + '.pdf') : 'contatto-veicolo.pdf');
  }

  if (printBtn) {
    printBtn.addEventListener('click', function(){
      window.print();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', function(){
      try {
        if (window.history.length > 1 && document.referrer && document.referrer.indexOf(location.origin) === 0) {
          window.history.back();
          setTimeout(function(){
            if (!document.hidden) window.location.href = ownerAppUrl;
          }, 650);
          return;
        }
      } catch(e) {}

      window.location.href = ownerAppUrl;
    });
  }
})();
</script>`}

</body>
</html>`;

    return res.send(html);
  } catch (err) {
    console.error('owner-print-sign error:', err);
    return res.status(500).send(
      'Errore generazione cartello.\\n\\n' +
      'Dettaglio: ' + (err && err.message ? err.message : String(err))
    );
  }
});



app.get('/owner-print-kit.html', async (req, res) => {
  try {
    const cleanCode = String(req.query.code || '').trim().toUpperCase();
    const cleanPlate = String(req.query.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!cleanCode && !cleanPlate) {
      return res.status(400).send('Inserisci almeno codice o targa.');
    }

    let found;

    if (cleanCode) {
      found = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE code = $1
         LIMIT 1`,
        [cleanCode]
      );
    } else {
      found = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         ORDER BY activated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [cleanPlate]
      );
    }

    if (!found.rows.length) {
      return res.status(404).send('Record non trovato.');
    }

    let row = found.rows[0];
    let dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (cleanPlate && dbPlate !== cleanPlate) {
      const fallbackByPlate = await pool.query(
        `SELECT code, public_id, qr_url, plate, brand, vehicle_model
         FROM sticker_codes
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         ORDER BY activated_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [cleanPlate]
      );

      if (!fallbackByPlate.rows.length) {
        return res.status(401).send('Targa non corrispondente al codice.');
      }

      row = fallbackByPlate.rows[0];
      dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');
    }

    let qrValue = '';
    if (row.qr_url && String(row.qr_url).trim()) {
      qrValue = String(row.qr_url).trim();
    } else if (row.public_id && String(row.public_id).trim()) {
      const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com').replace(/\/$/, '');
      qrValue = `${baseUrl}/contact/u/${encodeURIComponent(String(row.public_id).trim())}`;
    } else {
      return res.status(400).send('QR URL o public_id mancante.');
    }

    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 900,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    const generateOwnerPrintKitHtml = require('./lib/generateOwnerPrintKitHtml');

    const html = generateOwnerPrintKitHtml({
      row,
      qrDataUrl,
      qrValue,
      code: row.code || cleanCode,
      plate: row.plate || cleanPlate
    });

    return res.send(html);
  } catch (err) {
    console.error('owner-print-kit error:', err);
    return res.status(500).send(
      'Errore generazione kit cartelli.\\n\\n' +
      'Dettaglio: ' + (err && err.message ? err.message : String(err))
    );
  }
});





app.get('/api/owner/sticker-print-pdf', async (req, res) => {
  try {
    const cleanCode = String(req.query.code || '').trim().toUpperCase();
    const cleanPlate = String(req.query.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!cleanCode || !cleanPlate) {
      return res.status(400).json({ success: false, error: 'Codice e targa obbligatori.' });
    }

    const found = await pool.query(
      `SELECT code, plate, public_id, qr_url
       FROM sticker_codes
       WHERE code = $1
       LIMIT 1`,
      [cleanCode]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = found.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    let qrValue = '';
    if (row.qr_url && String(row.qr_url).trim()) {
      qrValue = String(row.qr_url).trim();
    } else if (row.public_id && String(row.public_id).trim()) {
      const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com').replace(/\/$/, '');
      qrValue = `${baseUrl}/contact/u/${encodeURIComponent(String(row.public_id).trim())}`;
    } else {
      return res.status(400).json({ success: false, error: 'QR URL o public_id mancanti per questo codice.' });
    }

    const pdfBuffer = await generateStickerPrintPdf({ qrValue });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="adesivo-${cleanCode}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('owner sticker-print-pdf error:', err);
    return res.status(500).json({ success: false, error: 'Errore generazione PDF stampa adesivo.' });
  }
});

app.get('/api/admin/sticker-print-pdf/:code', requireAdmin, async (req, res) => {
  try {
    const cleanCode = String(req.params.code || '').trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ success: false, error: 'Codice mancante.' });
    }

    const found = await pool.query(
      `SELECT code, public_id, qr_url
       FROM sticker_codes
       WHERE code = $1
       LIMIT 1`,
      [cleanCode]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = found.rows[0];

    let qrValue = '';
    if (row.qr_url && String(row.qr_url).trim()) {
      qrValue = String(row.qr_url).trim();
    } else if (row.public_id && String(row.public_id).trim()) {
      const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com').replace(/\/$/, '');
      qrValue = `${baseUrl}/contact/u/${encodeURIComponent(String(row.public_id).trim())}`;
    } else {
      return res.status(400).json({ success: false, error: 'QR URL o public_id mancanti per questo codice.' });
    }

    const pdfBuffer = await generateStickerPrintPdf({ qrValue });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="adesivo-${cleanCode}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('sticker-print-pdf error:', err);
    return res.status(500).json({ success: false, error: 'Errore generazione PDF stampa adesivo.' });
  }
});


app.get('/health', (req, res) => {
  res.json({ ok: true });
});


app.post('/api/trial-request', async (req, res) => {
  try {
    const {
      phone, plate, brand, vehicle_model, color,
      privacy_consent, marketing_consent, privacy_version
    } = req.body || {};

    const phoneNorm = normalizeItalianMobileForOtp(phone);
    const cleanPhone = phoneNorm.e164;
    const cleanPhoneWhatsapp = phoneNorm.whatsapp;
    const cleanPlate = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanBrand = String(brand || '').trim();
    const cleanModel = String(vehicle_model || '').trim();
    const cleanColor = String(color || '').trim();
    const cleanPrivacyVersion = String(privacy_version || 'privacy-contatto-veicolo-2026-04-29').trim();

    if (!cleanPhone || !phoneNorm.isValid || !cleanPlate || !cleanBrand || !cleanModel || !privacy_consent) {
      return res.status(400).json({
        success: false,
        error: 'Inserisci cellulare valido, targa, marca, modello e accetta la privacy.'
      });
    }

    const otpCode = generateOtpCode();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const inserted = await pool.query(
      `INSERT INTO trial_requests
       (full_name, phone, email, plate, brand, vehicle_model, color, notes,
        privacy_consent, marketing_consent, source_page, created_at,
        otp_code, otp_expires_at, otp_status, phone_whatsapp, privacy_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        'Cliente',
        cleanPhone,
        null,
        cleanPlate,
        cleanBrand,
        cleanModel,
        cleanColor || null,
        null,
        !!privacy_consent,
        !!marketing_consent,
        '/prova-gratuita.html',
        otpCode,
        otpExpiresAt,
        'pending_otp',
        cleanPhoneWhatsapp,
        cleanPrivacyVersion
      ]
    );

    const trialRequestId = inserted.rows?.[0]?.id || null;

    try {
      const trialPushCode = 'AMC-E8493C7F';
      const trialPushPlate = 'GL740CH';
      const nowLabel = new Date().toLocaleString('it-IT');

      let insertedMessageId = null;
      try {
        const msgText = [
          'Nuova richiesta prova gratuita',
          `Data e ora: ${nowLabel}`,
          `Telefono: ${cleanPhone}`,
          `Targa: ${cleanPlate}`,
          `Veicolo: ${cleanBrand} ${cleanModel}`.trim(),
          cleanColor ? `Colore: ${cleanColor}` : null,
          `OTP: ${otpCode}`,
          trialRequestId ? `Richiesta ID: ${trialRequestId}` : null
        ].filter(Boolean).join('\n');

        const insertedMsg = await pool.query(
          `INSERT INTO contact_message_logs
           (code, plate, reason, message_text, location_shared, created_at)
           VALUES ($1, $2, $3, $4, FALSE, NOW())
           RETURNING id`,
          [trialPushCode, trialPushPlate, 'Nuova richiesta prova gratuita', msgText]
        );
        insertedMessageId = insertedMsg.rows?.[0]?.id || null;
      } catch (msgErr) {
        console.error('trial registration log message error:', msgErr);
      }

      if (vapidPublicKey && vapidPrivateKey) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth
           FROM push_subscriptions
           WHERE code = $1
             AND COALESCE(plate,'') = COALESCE($2,'')
             AND is_active = TRUE`,
          [trialPushCode, trialPushPlate]
        );

        const targetUrl = trialRequestId
          ? `/admin-otp.html?id=${encodeURIComponent(trialRequestId)}`
          : `/owner-simple.html?code=${encodeURIComponent(trialPushCode)}&plate=${encodeURIComponent(trialPushPlate)}${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

        for (const sub of subs.rows || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              },
              JSON.stringify({
                title: 'Nuova richiesta prova',
                body: `${cleanPlate} · ${cleanBrand} ${cleanModel}`.trim(),
                url: targetUrl,
                targetUrl,
                messageId: insertedMessageId,
                trialRequestId,
                channel: 'trial-registration-alert'
              })
            );
          } catch (pushErr) {
            console.error('trial registration push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);
          }
        }
      }
    } catch (pushBlockErr) {
      console.error('trial registration push block error:', pushBlockErr);
    }

    return res.json({
      success: true,
      message: 'Richiesta ricevuta. Riceverai un codice di verifica sul cellulare indicato.',
      request_id: trialRequestId
    });
  } catch (err) {
    console.error('trial-request error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore invio richiesta prova gratuita.',
      debug_message: err?.message || null,
      debug_detail: err?.detail || null,
      debug_code: err?.code || null
    });
  }
});


app.post('/api/create-code', requireAdmin, async (req, res) => {
  try {
    const { plan_type, offered_by } = req.body || {};
    const allowedPlans = ['always', '1week', '1month', '6months'];
    const selectedPlan = allowedPlans.includes(plan_type) ? plan_type : 'always';

    const code = generateCode();
    const publicId = await getUniquePublicId(pool);
    const ownerAccessToken = generateOwnerAccessToken();

    let expiresAt = null;
    if (selectedPlan === '1week') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else if (selectedPlan === '1month') {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (selectedPlan === '6months') {
      expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com').replace(/\/$/, '');
    const qrUrl = `${baseUrl}/contact/u/${encodeURIComponent(publicId)}`;

    await pool.query(
      'INSERT INTO sticker_codes (code, public_id, status, plan_type, expires_at, owner_access_token, qr_url, offered_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [code, publicId, 'new', selectedPlan, expiresAt, ownerAccessToken, qrUrl, offered_by ? String(offered_by).trim() : null]
    );

    return res.json({
      success: true,
      code,
      public_id: publicId,
      owner_access_token: ownerAccessToken,
      plan_type: selectedPlan,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore nella generazione del codice.' });
  }
});

app.post('/api/check-code', async (req, res) => {
  try {
    const { code } = req.body;

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Codice non valido' });
    }

    const row = result.rows[0];

    if (row.status === 'used') {
      return res.json({
        success: false,
        used: true,
        message: 'Codice già utilizzato'
      });
    }

    res.json({ success: true, message: 'Codice valido', data: row });
  } catch (err) {
    console.error('check-code error:', err);
    res.status(500).json({ success: false, error: 'Errore verifica codice' });
  }
});





app.post('/api/log-contact-view', async (req, res) => {
  try {
    const { code, plate, brand, vehicle_model, color } = req.body || {};

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || '').split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;
    const area = await lookupIpArea(ip);

    const cleanCode = code ? String(code).trim().toUpperCase() : null;
    const cleanPlate = plate ? String(plate).trim().toUpperCase().replace(/\s+/g, '') : null;

    const blocked = await pool.query(
      `SELECT id, block_type, block_value, reason
       FROM abuse_blocks
       WHERE is_active = TRUE
         AND COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
         AND (block_type = 'ip' AND block_value = COALESCE($3,''))
       ORDER BY id DESC
       LIMIT 1`,
      [cleanCode, cleanPlate, ip || '']
    );

    if (blocked.rows.length) {
      const block = blocked.rows[0];

      await logBlockedAttempt({
        code: cleanCode,
        plate: cleanPlate,
        public_flow: 'log-contact-view',
        block_id: block.id || null,
        matched_block_type: block.block_type || null,
        matched_block_value: block.block_value || null,
        matched_reason: block.reason || null,
        ip_address: ip || null,
        ip_city: area.city || null,
        ip_region: area.region || null,
        ip_country: area.country || null,
        user_agent: userAgent || null,
        reason: 'QR Visualizzato',
        message_text: `Data e ora: ${new Date().toLocaleString('it-IT')}`,
        location_shared: false
      });

      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Impossibile completare l’invio. Riprova più tardi.'
      });
    }

    await pool.query(
      `INSERT INTO contact_page_views
       (code, plate, brand, vehicle_model, color, ip_address, ip_city, ip_region, ip_country, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        code || null,
        plate || null,
        brand || null,
        vehicle_model || null,
        color || null,
        ip,
        area.city,
        area.region,
        area.country,
        userAgent
      ]
    );

    let insertedMessageId = null;
    const nowLabel = new Date().toLocaleString('it-IT');

    try {
      const insertedMessage = await pool.query(
        `INSERT INTO contact_message_logs
         (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, ip_address, ip_city, ip_region, ip_country, user_agent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8,$9,$10,$11,$12,NOW())
         RETURNING id`,
        [
          code || null,
          plate || null,
          brand || null,
          vehicle_model || null,
          color || null,
          'QR Visualizzato',
          `Data e ora: ${nowLabel}`,
          ip,
          area.city,
          area.region,
          area.country,
          userAgent
        ]
      );
      insertedMessageId = insertedMessage.rows?.[0]?.id || null;
    } catch (msgErr) {
      console.error('log-contact-view message insert error:', msgErr);
    }

    try {
      if (vapidPublicKey && vapidPrivateKey && cleanCode) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth
           FROM push_subscriptions
           WHERE code = $1
             AND is_active = TRUE
             AND receive_passenger_alerts = TRUE`,
          [cleanCode]
        );

        const targetUrl = `/owner-simple.html?code=${encodeURIComponent(cleanCode)}&plate=${encodeURIComponent(String(plate || '').trim())}${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

        for (const sub of subs.rows || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              },
              JSON.stringify({
                title: 'QR Visualizzato',
                body: `Data e ora: ${nowLabel}`,
                url: targetUrl,
                targetUrl,
                messageId: insertedMessageId,
                unreadCount,
                channel: 'qr-view-alert'
              })
            );
          } catch (pushErr) {
            console.error('log-contact-view push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);
            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              try {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              } catch (cleanupErr) {
                console.error('log-contact-view push cleanup error:', cleanupErr);
              }
            }
          }
        }
      }
    } catch (notifyErr) {
      console.error('log-contact-view push block error:', notifyErr);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('log-contact-view error:', err);
    return res.status(500).json({ success: false, error: 'Errore logging visualizzazione.' });
  }
});

app.post('/api/log-contact-message', async (req, res) => {
  try {
    const {
      code, plate, brand, vehicle_model, color,
      reason, message_text, location_shared,
      latitude, longitude, maps_url, sender_phone
    } = req.body || {};

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || '').split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;
    const area = await lookupIpArea(ip);

    const cleanCode = code ? String(code).trim().toUpperCase() : null;
    const cleanPlate = plate ? String(plate).trim().toUpperCase().replace(/\s+/g, '') : null;
    const cleanPhone = sender_phone ? String(sender_phone).trim() : null;

    const blocked = await pool.query(
      `SELECT id, block_type, block_value, reason
       FROM abuse_blocks
       WHERE is_active = TRUE
         AND COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
         AND (
           (block_type = 'ip' AND block_value = COALESCE($3,'')) OR
           (block_type = 'phone' AND block_value = COALESCE($4,''))
         )
       ORDER BY id DESC
       LIMIT 1`,
      [cleanCode, cleanPlate, ip || '', cleanPhone || '']
    );

    if (blocked.rows.length) {
      const block = blocked.rows[0];

      await logBlockedAttempt({
        code: cleanCode,
        plate: cleanPlate,
        public_flow: 'log-contact-message',
        block_id: block.id || null,
        matched_block_type: block.block_type || null,
        matched_block_value: block.block_value || null,
        matched_reason: block.reason || null,
        ip_address: ip || null,
        ip_city: area.city || null,
        ip_region: area.region || null,
        ip_country: area.country || null,
        sender_phone: cleanPhone || null,
        user_agent: userAgent || null,
        reason: reason || null,
        message_text: message_text || null,
        location_shared: !!location_shared,
        latitude: latitude || null,
        longitude: longitude || null,
        maps_url: maps_url || null
      });

      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Impossibile completare l’invio. Riprova più tardi.'
      });
    }

    const insertedMessage = await pool.query(
      `INSERT INTO contact_message_logs
       (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, latitude, longitude, maps_url, ip_address, ip_city, ip_region, ip_country, user_agent, sender_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        code || null,
        plate || null,
        brand || null,
        vehicle_model || null,
        color || null,
        reason || null,
        message_text || null,
        !!location_shared,
        latitude || null,
        longitude || null,
        maps_url || null,
        ip,
        area.city,
        area.region,
        area.country,
        userAgent,
        sender_phone || null
      ]
    );

    const insertedMessageId = insertedMessage.rows[0]?.id || null;

    try {
      if (vapidPublicKey && vapidPrivateKey && code) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE code = $1`,
          [String(code).trim().toUpperCase()]
        );

        const cleanPlateForPush = String(plate || '').trim();
        const cleanReasonForPush = String(reason || 'Segnalazione').trim();
        const title = cleanPlateForPush
          ? `${cleanReasonForPush} · ${cleanPlateForPush}`
          : cleanReasonForPush;
        const body = 'Segnalazione inviata da un utente. Tocca per leggere il messaggio.';

        const targetUrl = `/owner-app/${encodeURIComponent(String(code).trim().toUpperCase())}/${encodeURIComponent(String(plate || '').trim().toUpperCase())}?focus=messages${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

        const unreadRes = await pool.query(
          `SELECT COUNT(*)::int AS unread_count
           FROM contact_message_logs
           WHERE code = $1
             AND deleted_at IS NULL
             AND read_at IS NULL`,
          [String(code).trim().toUpperCase()]
        );

        const unreadCount = unreadRes.rows[0]?.unread_count || 0;

        for (const sub of subs.rows) {
          const payload = JSON.stringify({
            title,
            body,
            url: targetUrl,
            targetUrl,
            unreadCount,
            messageId: insertedMessageId || null,
            channel: 'user-message-alert',
            requireInteraction: true,
            renotify: true,
            tag: `user-message-${String(code).trim().toUpperCase()}`
          });

          const channel = String(sub.endpoint || '').includes('web.push.apple.com')
            ? 'apple-webpush'
            : String(sub.endpoint || '').includes('fcm.googleapis.com')
              ? 'fcm-webpush'
              : 'webpush';

          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, payload);

            await pool.query(
              `INSERT INTO push_delivery_logs (code, plate, endpoint, channel, status, error_text)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [cleanCode, cleanPlate, sub.endpoint, channel, 'sent', null]
            );
          } catch (pushErr) {
            const errText = String(pushErr.statusCode || '') + ' ' + String(pushErr.body || pushErr.message || pushErr);
            console.error('Push send error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);

            await pool.query(
              `INSERT INTO push_delivery_logs (code, plate, endpoint, channel, status, error_text)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [cleanCode, cleanPlate, sub.endpoint, channel, 'failed', errText]
            );

            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
            }
          }
        }
      }
    } catch (notifyErr) {
      console.error('Push notify block error:', notifyErr);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('log-contact-message error:', err);
    return res.status(500).json({ success: false, error: 'Errore logging messaggio.' });
  }
});






app.post('/api/owner/block-abuse', async (req, res) => {
  try {
    const { code, plate, block_type, block_value, reason } = req.body || {};
    const allowed = new Set(['ip', 'phone']);
    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }
    if (!block_type || !allowed.has(String(block_type))) {
      return res.status(400).json({ success: false, error: 'Tipo blocco non valido.' });
    }
    if (!block_value || !String(block_value).trim()) {
      return res.status(400).json({ success: false, error: 'Valore blocco mancante.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');
    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const cleanValue = String(block_value).trim();
    const cleanReason = reason ? String(reason).trim() : 'Uso improprio del servizio';

    const existing = await pool.query(
      `SELECT id
       FROM abuse_blocks
       WHERE COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
         AND block_type = $3
         AND block_value = $4
       LIMIT 1`,
      [cleanCode, cleanPlate, block_type, cleanValue]
    );

    let result;
    if (existing.rows.length) {
      result = await pool.query(
        `UPDATE abuse_blocks
         SET is_active = TRUE,
             reason = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, code, plate, block_type, block_value, reason, is_active, updated_at`,
        [cleanReason, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO abuse_blocks (code, plate, block_type, block_value, reason, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),NOW())
         RETURNING id, code, plate, block_type, block_value, reason, is_active, created_at, updated_at`,
        [cleanCode, cleanPlate, block_type, cleanValue, cleanReason]
      );
    }

    return res.json({ success: true, item: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore blocco abuso proprietario.' });
  }
});


app.post('/api/owner/delete-abuse-blocks-many', async (req, res) => {
  try {
    const { code, plate, ids } = req.body || {};

    if (!code || !plate || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');
    const cleanIds = ids.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);

    if (!cleanIds.length) {
      return res.status(400).json({ success: false, error: 'Nessun blocco valido da eliminare.' });
    }

    const vehicleRes = await pool.query(
      `SELECT plate
       FROM sticker_codes
       WHERE code = $1
       LIMIT 1`,
      [cleanCode]
    );

    if (!vehicleRes.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const dbPlate = String(vehicleRes.rows[0].plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente.' });
    }

    const deleted = await pool.query(
      `DELETE FROM abuse_blocks
       WHERE COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
         AND id = ANY($3::int[])
         AND COALESCE(is_active, false) = false
       RETURNING id`,
      [cleanCode, cleanPlate, cleanIds]
    );

    return res.json({
      success: true,
      deleted_count: deleted.rowCount || 0
    });
  } catch (err) {
    console.error('owner delete-abuse-blocks-many error:', err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione blocchi rimossi.' });
  }
});


app.post('/api/owner/unblock-abuse', async (req, res) => {
  try {
    const { code, plate, id } = req.body || {};
    if (!code || !plate || !id) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');
    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const result = await pool.query(
      `UPDATE abuse_blocks
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
         AND COALESCE(code,'') = COALESCE($2,'')
         AND COALESCE(plate,'') = COALESCE($3,'')
       RETURNING id, code, plate, block_type, block_value, reason, is_active, updated_at`,
      [id, cleanCode, cleanPlate]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Blocco non trovato.' });
    }

    return res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore sblocco abuso proprietario.' });
  }
});

app.post('/api/owner/list-abuse-blocks', async (req, res) => {
  try {
    const { code, plate } = req.body || {};
    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');
    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const rows = await pool.query(
      `SELECT id, code, plate, block_type, block_value, reason, is_active, created_at, updated_at
       FROM abuse_blocks
       WHERE COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
       ORDER BY is_active DESC, updated_at DESC, id DESC
       LIMIT 300`,
      [cleanCode, cleanPlate]
    );

    return res.json({ success: true, items: rows.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore elenco blocchi proprietario.' });
  }
});

app.post('/api/owner/list-blocked-attempts', async (req, res) => {
  try {
    const { code, plate } = req.body || {};
    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const rows = await pool.query(
      `SELECT id, code, plate, public_flow, block_id, matched_block_type, matched_block_value, matched_reason,
              ip_address, ip_city, ip_region, ip_country, sender_phone,
              reason, message_text, location_shared, latitude, longitude, maps_url, user_agent, created_at
       FROM blocked_attempt_logs
       WHERE COALESCE(code,'') = COALESCE($1,'')
         AND COALESCE(plate,'') = COALESCE($2,'')
       ORDER BY created_at DESC, id DESC
       LIMIT 300`,
      [cleanCode, cleanPlate]
    );

    return res.json({ success: true, items: rows.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore elenco tentativi bloccati.' });
  }
});

app.post('/api/owner/delete-blocked-attempt', async (req, res) => {
  try {
    const { code, plate, id } = req.body || {};
    if (!code || !plate || !id) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const result = await pool.query(
      `DELETE FROM blocked_attempt_logs
       WHERE id = $1
         AND COALESCE(code,'') = COALESCE($2,'')
         AND COALESCE(plate,'') = COALESCE($3,'')
       RETURNING id`,
      [id, cleanCode, cleanPlate]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Tentativo bloccato non trovato.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione tentativo bloccato.' });
  }
});

app.post('/api/owner/delete-blocked-attempts-many', async (req, res) => {
  try {
    const { code, plate, ids } = req.body || {};
    if (!code || !plate || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const owner = await pool.query(
      `SELECT code
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    const cleanIds = ids.map(x => Number(x)).filter(Boolean);
    if (!cleanIds.length) {
      return res.status(400).json({ success: false, error: 'Nessun ID valido selezionato.' });
    }

    await pool.query(
      `DELETE FROM blocked_attempt_logs
       WHERE id = ANY($1::bigint[])
         AND COALESCE(code,'') = COALESCE($2,'')
         AND COALESCE(plate,'') = COALESCE($3,'')`,
      [cleanIds, cleanCode, cleanPlate]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione tentativi bloccati.' });
  }
});

app.post('/api/admin/block-abuse', requireAdmin, async (req, res) => {
  try {
    const { code, plate, block_type, block_value, reason } = req.body || {};
    const allowed = new Set(['ip', 'phone']);
    if (!block_type || !allowed.has(String(block_type))) {
      return res.status(400).json({ success: false, error: 'Tipo blocco non valido.' });
    }
    if (!block_value || !String(block_value).trim()) {
      return res.status(400).json({ success: false, error: 'Valore blocco mancante.' });
    }

    const cleanCode = code ? String(code).trim().toUpperCase() : null;
    const cleanPlate = plate ? String(plate).trim().toUpperCase().replace(/\s+/g, '') : null;
    const cleanValue = String(block_value).trim();
    const cleanReason = reason ? String(reason).trim() : 'Uso improprio del servizio';

    const result = await pool.query(
      `INSERT INTO abuse_blocks (code, plate, block_type, block_value, reason, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),NOW())
       ON CONFLICT DO NOTHING
       RETURNING id, code, plate, block_type, block_value, reason, is_active, created_at`,
      [cleanCode, cleanPlate, block_type, cleanValue, cleanReason]
    );

    if (!result.rows.length) {
      const existing = await pool.query(
        `UPDATE abuse_blocks
         SET is_active = TRUE,
             reason = $5,
             updated_at = NOW()
         WHERE COALESCE(code,'') = COALESCE($1,'')
           AND COALESCE(plate,'') = COALESCE($2,'')
           AND block_type = $3
           AND block_value = $4
         RETURNING id, code, plate, block_type, block_value, reason, is_active, created_at`,
        [cleanCode, cleanPlate, block_type, cleanValue, cleanReason]
      );
      return res.json({ success: true, item: existing.rows[0] || null });
    }

    return res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore blocco abuso.' });
  }
});

app.post('/api/admin/unblock-abuse', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID blocco mancante.' });
    }

    const result = await pool.query(
      `UPDATE abuse_blocks
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, code, plate, block_type, block_value, reason, is_active, updated_at`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Blocco non trovato.' });
    }

    return res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore sblocco abuso.' });
  }
});

app.post('/api/admin/list-abuse-blocks', requireAdmin, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT id, code, plate, block_type, block_value, reason, is_active, created_at, updated_at
       FROM abuse_blocks
       ORDER BY is_active DESC, updated_at DESC, id DESC
       LIMIT 300`
    );
    return res.json({ success: true, items: rows.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore elenco blocchi.' });
  }
});

app.post('/api/owner-heartbeat', async (req, res) => {
  try {
    const {
      code,
      plate,
      is_standalone,
      platform,
      browser,
      push_endpoint,
      notification_permission
    } = req.body || {};

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }

    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPlateNorm = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const userAgent = req.headers['user-agent'] || null;
    const cleanPlatform = platform ? String(platform).slice(0, 80) : null;
    const cleanBrowser = browser ? String(browser).slice(0, 80) : null;
    const cleanPushEndpoint = push_endpoint ? String(push_endpoint).trim() : null;

    const result = await pool.query(
      `UPDATE sticker_codes
       SET owner_last_seen = NOW(),
           owner_app_detected_at = COALESCE(owner_app_detected_at, NOW()),
           owner_app_is_standalone = COALESCE(owner_app_is_standalone, FALSE) OR $3,
           owner_app_user_agent = COALESCE($4, owner_app_user_agent),
           owner_app_platform = COALESCE($5, owner_app_platform),
           owner_app_browser = COALESCE($6, owner_app_browser)
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
       RETURNING code, plate, owner_last_seen, owner_app_detected_at, owner_app_is_standalone`,
      [cleanCode, cleanPlateNorm, !!is_standalone, userAgent, cleanPlatform, cleanBrowser]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Record non trovato.' });
    }

    try {
      if (cleanPushEndpoint) {
        await pool.query(
          `UPDATE push_subscriptions
           SET last_seen_at = NOW(),
               app_saved_detected = COALESCE(app_saved_detected, FALSE) OR $2,
               app_saved_detected_at = CASE
                 WHEN $2 = TRUE THEN COALESCE(app_saved_detected_at, NOW())
                 ELSE app_saved_detected_at
               END,
               user_agent = COALESCE($3, user_agent)
           WHERE endpoint = $1`,
          [cleanPushEndpoint, !!is_standalone, userAgent]
        );
      }
    } catch (subErr) {
      console.error('owner-heartbeat push subscription update error:', subErr);
    }

    await pool.query(
      `UPDATE broadcast_notification_recipients
       SET status = 'opened',
           opened_at = COALESCE(opened_at, NOW())
       WHERE id = (
         SELECT id
         FROM broadcast_notification_recipients
         WHERE code = $1
           AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
           AND status = 'sent'
         ORDER BY id DESC
         LIMIT 1
       )`,
      [cleanCode, cleanPlateNorm]
    );

    return res.json({
      success: true,
      data: {
        ...result.rows[0],
        notification_permission: notification_permission || null
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore heartbeat proprietario.' });
  }
});

app.get('/api/public-owner-status/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      `SELECT code, public_id, owner_last_seen
       FROM sticker_codes
       WHERE public_id = $1
       LIMIT 1`,
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Riferimento non trovato.' });
    }

    const row = result.rows[0];
    let owner_online = false;

    if (row.owner_last_seen) {
      const diffMs = Date.now() - new Date(row.owner_last_seen).getTime();
      owner_online = diffMs <= 120000;
    }

    return res.json({
      success: true,
      data: {
        public_id: row.public_id,
        owner_online,
        owner_last_seen: row.owner_last_seen
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore controllo presenza proprietario.' });
  }
});




// FIX ROBUSTO: risolve sempre il record proprietario da code/targa prima di leggere dashboard o messaggi.
// Serve a evitare disallineamenti quando la Web App salvata conserva un vecchio code ma mostra la targa corretta.
async function resolveOwnerVehicleRecord(inputCode, inputPlate) {
  const code = String(inputCode || '').trim().toUpperCase();
  const plate = String(inputPlate || '').trim().toUpperCase().replace(/\s+/g, '');

  if (!code && !plate) return null;

  const result = await pool.query(
    `SELECT *
     FROM sticker_codes
     WHERE ($1 <> '' AND UPPER(code) = $1)
        OR ($2 <> '' AND UPPER(REPLACE(COALESCE(plate,''), ' ', '')) = $2)
     ORDER BY
       CASE WHEN $1 <> '' AND UPPER(code) = $1 THEN 0 ELSE 1 END,
       activated_at DESC NULLS LAST,
       id DESC
     LIMIT 1`,
    [code, plate]
  );

  return result.rows[0] || null;
}

app.post('/api/owner-messages', async (req, res, next) => {
  try {
    const body = req.body || {};
    const vehicle = await resolveOwnerVehicleRecord(body.code, body.plate);

    if (!vehicle || !vehicle.code) {
      return res.status(404).json({
        success: false,
        error: 'Record veicolo non trovato per questa targa o codice.',
        received: {
          code: body.code || null,
          plate: body.plate || null
        }
      });
    }

    const messages = await pool.query(
      `SELECT
         id,
         code,
         plate,
         brand,
         vehicle_model,
         color,
         reason,
         message_text,
         location_shared,
         latitude,
         longitude,
         maps_url,
         sender_phone,
         ip_address,
         created_at,
         read_at
       FROM contact_message_logs
       WHERE code = $1
         AND deleted_at IS NULL
         AND NOT (
           LOWER(COALESCE(reason,'')) LIKE '%aggiorna la tua app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%aggiorna app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%nuova versione%'
         )
       ORDER BY created_at DESC
       LIMIT 80`,
      [vehicle.code]
    );

    const unread = messages.rows.filter(x => !x.read_at).length;

    return res.json({
      success: true,
      resolved: {
        code: vehicle.code,
        plate: vehicle.plate,
        public_id: vehicle.public_id
      },
      unread_count: unread,
      items: messages.rows
    });
  } catch (err) {
    console.error('robust owner-messages error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore caricamento messaggi.',
      detail: err.message
    });
  }
});

app.post('/api/owner-dashboard', async (req, res, next) => {
  try {
    const body = req.body || {};
    const vehicle = await resolveOwnerVehicleRecord(body.code, body.plate);

    if (!vehicle || !vehicle.code) {
      return res.status(404).json({
        success: false,
        error: 'Record veicolo non trovato per questa targa o codice.',
        received: {
          code: body.code || null,
          plate: body.plate || null
        }
      });
    }

    const views = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM contact_message_logs
       WHERE code = $1
         AND reason IN ('QR Visualizzato', 'Visualizzazione pagina')`,
      [vehicle.code]
    );

    const messagesCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM contact_message_logs
       WHERE code = $1`,
      [vehicle.code]
    );

    const locations = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM contact_message_logs
       WHERE code = $1 AND location_shared = TRUE`,
      [vehicle.code]
    );

    const last = await pool.query(
      `SELECT MAX(created_at) AS last_activity
       FROM contact_message_logs
       WHERE code = $1`,
      [vehicle.code]
    );

    const events = await pool.query(
      `SELECT
         COALESCE(reason, 'Evento') AS type,
         created_at AS at,
         COALESCE(ip_city, '') AS ip_city,
         COALESCE(ip_region, '') AS ip_region,
         COALESCE(ip_country, '') AS ip_country,
         COALESCE(location_shared, FALSE) AS location_shared
       FROM contact_message_logs
       WHERE code = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [vehicle.code]
    );

    const areaCounts = { north: 0, center: 0, south: 0, islands: 0 };

    function activeDashboardAreaBucket(cityRaw, regionRaw, countryRaw) {
      const city = String(cityRaw || '').trim().toLowerCase();
      const region = String(regionRaw || '').trim().toLowerCase();
      const country = String(countryRaw || '').trim().toLowerCase();

      if (country && country !== 'it' && country !== 'italy' && country !== 'italia') return '';

      if (
        city.includes('milan') ||
        city.includes('milano') ||
        city.includes('monza') ||
        region.includes('lombardy') ||
        region.includes('lombardia') ||
        region.includes('piedmont') ||
        region.includes('piemonte') ||
        region.includes('veneto') ||
        region.includes('liguria') ||
        region.includes('emilia') ||
        region.includes('trentino') ||
        region.includes('friuli') ||
        region.includes('aosta')
      ) return 'north';

      if (
        city.includes('rome') ||
        city.includes('roma') ||
        city.includes('florence') ||
        city.includes('firenze') ||
        region.includes('lazio') ||
        region.includes('tuscany') ||
        region.includes('toscana') ||
        region.includes('umbria') ||
        region.includes('marche') ||
        region.includes('abruzzo')
      ) return 'center';

      if (
        region.includes('sicily') ||
        region.includes('sicilia') ||
        region.includes('sardinia') ||
        region.includes('sardegna')
      ) return 'islands';

      if (
        region.includes('campania') ||
        region.includes('puglia') ||
        region.includes('apulia') ||
        region.includes('calabria') ||
        region.includes('basilicata') ||
        region.includes('molise')
      ) return 'south';

      return 'north'; // fallback: evento reale senza geolocalizzazione precisa, lo conteggiamo comunque
    }

    for (const ev of events.rows || []) {
      const bucket = activeDashboardAreaBucket(ev.ip_city, ev.ip_region, ev.ip_country);
      if (bucket && areaCounts[bucket] !== undefined) areaCounts[bucket] += 1;
    }

    return res.json({
      success: true,
      data: {
        code: vehicle.code,
        status: vehicle.status,
        brand: vehicle.brand,
        vehicle_model: vehicle.vehicle_model,
        color: vehicle.color,
        plate: vehicle.plate,
        phone: vehicle.phone,
        offered_by: vehicle.offered_by,
        qr_url: vehicle.qr_url,
        public_id: vehicle.public_id,
        plan_type: vehicle.plan_type,
        expires_at: vehicle.expires_at,
        activated_at: vehicle.activated_at,
        viewsCount: views.rows[0]?.total || 0,
        messagesCount: messagesCount.rows[0]?.total || 0,
        locationsCount: locations.rows[0]?.total || 0,
        lastActivity: last.rows[0]?.last_activity || null,
        events: events.rows,
        areaCounts
      }
    });
  } catch (err) {
    console.error('robust owner-dashboard error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore caricamento dashboard.',
      detail: err.message
    });
  }
});



app.post('/api/owner-messages', async (req, res) => {
  try {
    const { code, plate } = req.body || {};
    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code, plate
       FROM sticker_codes
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [code, plate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({ success: false, error: 'Record proprietario non trovato.' });
    }

    await pool.query(
      `UPDATE contact_message_logs
       SET
         deleted_at = COALESCE(deleted_at, NOW()),
         read_at = COALESCE(read_at, NOW())
       WHERE code = $1
         AND deleted_at IS NULL
         AND (
           LOWER(COALESCE(reason,'')) LIKE '%aggiorna la tua app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%aggiorna app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%nuova versione%'
         )`,
      [code]
    );

    const rows = await pool.query(
      `SELECT
         id,
         code,
         plate,
         brand,
         vehicle_model,
         color,
         reason,
         message_text,
         location_shared,
         latitude,
         longitude,
         maps_url,
         sender_phone,
         ip_address,
         created_at,
         read_at
       FROM contact_message_logs
       WHERE code = $1
         AND deleted_at IS NULL
       ORDER BY
         CASE WHEN reason = 'QR Visualizzato' THEN 1 ELSE 0 END ASC,
         created_at DESC
       LIMIT 200`,
      [code]
    );

    const unread = rows.rows.filter(r => !r.read_at).length;

    return res.json({
      success: true,
      unread_count: unread,
      items: rows.rows
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore caricamento messaggi.' });
  }
});

app.post('/api/owner-messages/read', async (req, res) => {
  try {
    const { id } = req.body || {};
    const cleanId = Number(id || 0);

    if (!Number.isFinite(cleanId) || cleanId <= 0) {
      return res.status(400).json({ success: false, error: 'ID messaggio mancante.' });
    }

    const updated = await pool.query(
      `UPDATE contact_message_logs
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1
         AND deleted_at IS NULL
       RETURNING id, code, plate, read_at`,
      [cleanId]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ success: false, error: 'Messaggio non trovato.' });
    }

    return res.json({ success: true, item: updated.rows[0] });
  } catch (err) {
    console.error('owner-messages/read error:', err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento messaggio.' });
  }
});

app.post('/api/owner-messages/read-many', async (req, res) => {
  try {
    const { ids } = req.body || {};
    const cleanIds = Array.isArray(ids)
      ? ids.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
      : [];

    if (!cleanIds.length) {
      return res.status(400).json({ success: false, error: 'ID messaggi mancanti.' });
    }

    const updated = await pool.query(
      `UPDATE contact_message_logs
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = ANY($1::int[])
         AND deleted_at IS NULL
       RETURNING id`,
      [cleanIds]
    );

    return res.json({
      success: true,
      updated_count: updated.rows.length,
      updated_ids: updated.rows.map(r => r.id)
    });
  } catch (err) {
    console.error('owner-messages/read-many error:', err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento multiplo.' });
  }
});

app.post('/api/owner-messages/delete', async (req, res) => {
  try {
    const { code, plate, id } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPlate = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanId = Number(id);

    if (!cleanCode || !cleanPlate || !Number.isFinite(cleanId)) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code, plate
       FROM sticker_codes
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Record proprietario non trovato.',
        received: { code: cleanCode, plate: cleanPlate }
      });
    }

    const deleted = await pool.query(
      `UPDATE contact_message_logs
       SET deleted_at = NOW()
       WHERE id = $1
         AND code = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [cleanId, cleanCode]
    );

    if (!deleted.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Messaggio non trovato o già eliminato.',
        received: { code: cleanCode, plate: cleanPlate, id: cleanId }
      });
    }

    return res.json({ success: true, deleted_id: cleanId });
  } catch (err) {
    console.error('owner-messages/delete error:', err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione messaggio.' });
  }
});

app.post('/api/owner-messages/delete-many', async (req, res) => {
  try {
    const { code, plate, ids } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPlate = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanIds = Array.isArray(ids)
      ? ids.map(x => Number(x)).filter(x => Number.isFinite(x))
      : [];

    if (!cleanCode || !cleanPlate || !cleanIds.length) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code, plate
       FROM sticker_codes
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    if (!owner.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Record proprietario non trovato.',
        received: { code: cleanCode, plate: cleanPlate }
      });
    }

    const deleted = await pool.query(
      `UPDATE contact_message_logs
       SET deleted_at = NOW()
       WHERE code = $1
         AND id = ANY($2::int[])
         AND deleted_at IS NULL
       RETURNING id`,
      [cleanCode, cleanIds]
    );

    return res.json({
      success: true,
      deleted_count: deleted.rows.length,
      deleted_ids: deleted.rows.map(r => r.id)
    });
  } catch (err) {
    console.error('owner-messages/delete-many error:', err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione multipla.' });
  }
});


app.post('/api/owner-services/prova-push', async (req, res) => {
  try {
    const cleanCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : '';
    const cleanPlate = req.body?.plate ? String(req.body.plate).trim().toUpperCase().replace(/\s+/g, '') : '';
    const serviceType = req.body?.service_type ? String(req.body.service_type).trim().toLowerCase() : 'revisione';

    if (!cleanCode || !cleanPlate) {
      return res.status(400).json({ success: false, error: 'Code e targa sono obbligatori.' });
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      return res.status(500).json({ success: false, error: 'Configurazione push non disponibile.' });
    }

    const labels = {
      revisione: 'revisione',
      assicurazione: 'assicurazione',
      bollo: 'bollo',
      gomme: 'cambio gomme',
      tagliando: 'tagliando'
    };
    const serviceLabel = labels[serviceType] || 'scadenza veicolo';

    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE code = $1
         AND plate = $2
         AND is_active = TRUE
         AND receive_passenger_alerts = TRUE`,
      [cleanCode, cleanPlate]
    );

    if (!subs.rows.length) {
      return res.status(404).json({ success: false, error: 'Nessun dispositivo attivo trovato per l’invio push.' });
    }

    const title = '[TEST] Promemoria veicolo';
    const body = `[TEST] La ${serviceLabel} della tua vettura richiede attenzione. Apri i dettagli per controllare.`;
    const targetUrl = `/owner-dashboard.html?code=${encodeURIComponent(cleanCode)}&plate=${encodeURIComponent(cleanPlate)}&service=${encodeURIComponent(serviceType)}&provaPush=1`;

    let sentCount = 0;

    for (const sub of subs.rows) {
      const payload = JSON.stringify({
        title,
        body,
        url: targetUrl,
        serviceType,
        isTest: true
      });

      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);

        sentCount += 1;

        try {
          await pool.query(
            `INSERT INTO push_delivery_logs (code, plate, endpoint, channel, status, error_text, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [
              cleanCode,
              cleanPlate,
              sub.endpoint,
              sub.endpoint.includes('apple') ? 'apple-webpush-prova' : 'fcm-webpush-prova',
              'sent',
              null
            ]
          );
        } catch (e) {}
      } catch (pushErr) {
        console.error('owner-services/prova-push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);

        try {
          await pool.query(
            `INSERT INTO push_delivery_logs (code, plate, endpoint, channel, status, error_text, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [
              cleanCode,
              cleanPlate,
              sub.endpoint,
              sub.endpoint.includes('apple') ? 'apple-webpush-prova' : 'fcm-webpush-prova',
              'error',
              String(pushErr.body || pushErr.message || pushErr).slice(0, 500)
            ]
          );
        } catch (e) {}

        if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
          try {
            await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]);
          } catch (e) {}
        }
      }
    }

    return res.json({ success: true, sent_count: sentCount, service_type: serviceType });
  } catch (err) {
    console.error('owner-services/prova-push fatal error:', err);
    return res.status(500).json({ success: false, error: 'Errore invio push prova.' });
  }
});

app.post('/api/owner-services/get', async (req, res) => {
  try {
    const cleanCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : '';
    const cleanPlate = req.body?.plate ? String(req.body.plate).trim().toUpperCase().replace(/\s+/g, '') : '';

    if (!cleanCode || !cleanPlate) {
      return res.status(400).json({ success: false, error: 'Code e targa sono obbligatori.' });
    }

    const row = await pool.query(
      `SELECT
         code,
         plate,
         first_registration_date,
         last_review_date,
         next_review_date,
         insurance_expiry_date,
         tax_expiry_date,
         tires_expiry_date,
         service_expiry_date,
         notes,
         created_at,
         updated_at
       FROM vehicle_service_data
       WHERE code = $1 AND plate = $2
       LIMIT 1`,
      [cleanCode, cleanPlate]
    );

    return res.json({
      success: true,
      item: normalizeVehicleServiceRow(row.rows[0]) || {
        code: cleanCode,
        plate: cleanPlate,
        first_registration_date: null,
        last_review_date: null,
        next_review_date: null,
        insurance_expiry_date: null,
        tax_expiry_date: null,
        tires_expiry_date: null,
        service_expiry_date: null,
        notes: ''
      }
    });
  } catch (err) {
    console.error('owner-services/get error:', err);
    return res.status(500).json({ success: false, error: 'Errore caricamento servizi veicolo.' });
  }
});

app.post('/api/owner-services/save', async (req, res) => {
  try {
    const cleanCode = req.body?.code ? String(req.body.code).trim().toUpperCase() : '';
    const cleanPlate = req.body?.plate ? String(req.body.plate).trim().toUpperCase().replace(/\s+/g, '') : '';

    if (!cleanCode || !cleanPlate) {
      return res.status(400).json({ success: false, error: 'Code e targa sono obbligatori.' });
    }

    const firstRegistrationDate = req.body?.first_registration_date || null;
    const lastReviewDate = req.body?.last_review_date || null;
    const insuranceExpiryDate = req.body?.insurance_expiry_date || null;
    const taxExpiryDate = req.body?.tax_expiry_date || null;
    const tiresExpiryDate = req.body?.tires_expiry_date || null;
    const serviceExpiryDate = req.body?.service_expiry_date || null;
    const notes = req.body?.notes ? String(req.body.notes).trim() : '';

    const nextReviewDate = computeNextReviewDate(firstRegistrationDate, lastReviewDate);

    const saved = await pool.query(
      `INSERT INTO vehicle_service_data (
         code,
         plate,
         first_registration_date,
         last_review_date,
         next_review_date,
         insurance_expiry_date,
         tax_expiry_date,
         tires_expiry_date,
         service_expiry_date,
         notes,
         created_at,
         updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
       ON CONFLICT (code, plate)
       DO UPDATE SET
         first_registration_date = EXCLUDED.first_registration_date,
         last_review_date = EXCLUDED.last_review_date,
         next_review_date = EXCLUDED.next_review_date,
         insurance_expiry_date = EXCLUDED.insurance_expiry_date,
         tax_expiry_date = EXCLUDED.tax_expiry_date,
         tires_expiry_date = EXCLUDED.tires_expiry_date,
         service_expiry_date = EXCLUDED.service_expiry_date,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING
         code,
         plate,
         first_registration_date,
         last_review_date,
         next_review_date,
         insurance_expiry_date,
         tax_expiry_date,
         tires_expiry_date,
         service_expiry_date,
         notes,
         created_at,
         updated_at`,
      [
        cleanCode,
        cleanPlate,
        firstRegistrationDate || null,
        lastReviewDate || null,
        nextReviewDate || null,
        insuranceExpiryDate || null,
        taxExpiryDate || null,
        tiresExpiryDate || null,
        serviceExpiryDate || null,
        notes
      ]
    );

    return res.json({ success: true, item: normalizeVehicleServiceRow(saved.rows[0]) });
  } catch (err) {
    console.error('owner-services/save error:', err);
    return res.status(500).json({ success: false, error: 'Errore salvataggio servizi veicolo.' });
  }
});

app.post('/api/owner-dashboard', async (req, res) => {
  try {
    const { code, plate } = req.body;

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa sono obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    let ownerDashboardPhone = row.phone || null;

    if (!ownerDashboardPhone && row.owner_access_token) {
      try {
        const trialPhoneRes = await pool.query(
          `SELECT phone
           FROM trial_requests
           WHERE owner_access_token = $1
           LIMIT 1`,
          [row.owner_access_token]
        );

        if (trialPhoneRes.rows.length && trialPhoneRes.rows[0].phone) {
          ownerDashboardPhone = trialPhoneRes.rows[0].phone;
        }
      } catch (e) {}
    }

    let viewsCount = 0;
    let messagesCount = 0;
    let locationsCount = 0;
    let lastActivity = null;
    let events = [];
    let areaCounts = { north: 0, center: 0, south: 0, islands: 0 };

    function serverAreaBucket(cityRaw, regionRaw, countryRaw) {
      const city = String(cityRaw || '').trim().toLowerCase();
      const region = String(regionRaw || '').trim().toLowerCase();
      const country = String(countryRaw || '').trim().toLowerCase();

      if (country && country !== 'it' && country !== 'italy' && country !== 'italia') return '';

      if (
        city.includes('milan') ||
        city.includes('milano') ||
        city.includes('monza') ||
        region.includes('lombardy') ||
        region.includes('lombardia') ||
        region.includes('piedmont') ||
        region.includes('piemonte') ||
        region.includes('veneto') ||
        region.includes('liguria') ||
        region.includes('emilia') ||
        region.includes('trentino') ||
        region.includes('friuli') ||
        region.includes('aosta')
      ) return 'north';

      if (
        city.includes('rome') ||
        city.includes('roma') ||
        city.includes('florence') ||
        city.includes('firenze') ||
        region.includes('lazio') ||
        region.includes('tuscany') ||
        region.includes('toscana') ||
        region.includes('umbria') ||
        region.includes('marche') ||
        region.includes('abruzzo')
      ) return 'center';

      if (
        region.includes('sicily') ||
        region.includes('sicilia') ||
        region.includes('sardinia') ||
        region.includes('sardegna')
      ) return 'islands';

      if (
        region.includes('campania') ||
        region.includes('puglia') ||
        region.includes('apulia') ||
        region.includes('calabria') ||
        region.includes('basilicata') ||
        region.includes('molise')
      ) return 'south';

      return city || region || country ? 'north' : '';
    }

    try {
      const areaRows = await pool.query(
        `(SELECT
            COALESCE(ip_city, '') AS ip_city,
            COALESCE(ip_region, '') AS ip_region,
            COALESCE(ip_country, '') AS ip_country
          FROM contact_page_views
          WHERE code = $1)
         UNION ALL
         (SELECT
            COALESCE(ip_city, '') AS ip_city,
            COALESCE(ip_region, '') AS ip_region,
            COALESCE(ip_country, '') AS ip_country
          FROM contact_message_logs
          WHERE code = $1)`,
        [cleanCode]
      );

      for (const ev of areaRows.rows || []) {
        const bucket = serverAreaBucket(ev.ip_city, ev.ip_region, ev.ip_country);
        if (bucket && areaCounts[bucket] !== undefined) areaCounts[bucket] += 1;
      }
    } catch(e) {}

    try {
      const views = await pool.query(
        `SELECT COUNT(*)::int AS total, MAX(viewed_at) AS last_view
         FROM contact_page_views
         WHERE code = $1`,
        [cleanCode]
      );
      if (views.rows.length) {
        viewsCount = views.rows[0].total || 0;
        lastActivity = views.rows[0].last_view || null;
      }
    } catch (e) {}

    try {
      const messages = await pool.query(
        `SELECT COUNT(*)::int AS total, MAX(created_at) AS last_message
         FROM contact_message_logs
         WHERE code = $1`,
        [cleanCode]
      );
      if (messages.rows.length) {
        messagesCount = messages.rows[0].total || 0;
        if (!lastActivity || (messages.rows[0].last_message && messages.rows[0].last_message > lastActivity)) {
          lastActivity = messages.rows[0].last_message || lastActivity;
        }
      }
    } catch (e) {}

    try {
      const locations = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM contact_message_logs
         WHERE code = $1 AND location_shared = TRUE`,
        [cleanCode]
      );
      if (locations.rows.length) {
        locationsCount = locations.rows[0].total || 0;
      }
    } catch (e) {}

    try {
      const recentEvents = await pool.query(
        `(SELECT
            'Visualizzazione pagina' AS type,
            viewed_at AS at,
            COALESCE(ip_city, '') AS ip_city,
            COALESCE(ip_region, '') AS ip_region,
            COALESCE(ip_country, '') AS ip_country,
            FALSE AS location_shared
           FROM contact_page_views
           WHERE code = $1)
         UNION ALL
         (SELECT
            COALESCE(reason, 'Invio avviato') AS type,
            created_at AS at,
            COALESCE(ip_city, '') AS ip_city,
            COALESCE(ip_region, '') AS ip_region,
            COALESCE(ip_country, '') AS ip_country,
            COALESCE(location_shared, FALSE) AS location_shared
           FROM contact_message_logs
           WHERE code = $1)
         ORDER BY at DESC
         LIMIT 200`,
        [cleanCode]
      );
      events = recentEvents.rows || [];
    } catch (e) {}

    return res.json({
      success: true,
      data: {
        code: row.code,
        status: row.status,
        brand: row.brand,
        vehicle_model: row.vehicle_model,
        color: row.color,
        plate: row.plate,
        phone: ownerDashboardPhone || null,
        offered_by: row.offered_by || null,
        qr_url: row.qr_url,
        public_id: row.public_id,
        plan_type: row.plan_type,
        expires_at: row.expires_at,
        activated_at: row.activated_at,
        viewsCount,
        messagesCount,
        locationsCount,
        lastActivity,
        events,
        areaCounts
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});





app.post('/api/admin/update-trial-request', requireAdmin, async (req, res) => {
  try {
    const {
      id, full_name, phone, email, plate, brand, vehicle_model, color,
      notes, privacy_consent, marketing_consent
    } = req.body || {};

    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const cleanName = String(full_name || '').trim();
    const cleanPhone = String(phone || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPlate = String(plate || '').trim().toUpperCase();
    const cleanBrand = String(brand || '').trim();
    const cleanModel = String(vehicle_model || '').trim();
    const cleanColor = String(color || '').trim();
    const cleanNotes = String(notes || '').trim();

    if (!cleanName || !cleanPhone || !cleanPlate || !cleanBrand || !cleanModel) {
      return res.status(400).json({ success: false, error: 'Compila tutti i campi obbligatori.' });
    }

    const out = await pool.query(
      `UPDATE trial_requests
       SET full_name = $2,
           phone = $3,
           email = $4,
           plate = $5,
           brand = $6,
           vehicle_model = $7,
           color = $8,
           notes = $9,
           privacy_consent = $10,
           marketing_consent = $11
       WHERE id = $1
       RETURNING id`,
      [
        id,
        cleanName,
        cleanPhone,
        cleanEmail || null,
        cleanPlate,
        cleanBrand,
        cleanModel,
        cleanColor || null,
        cleanNotes || null,
        !!privacy_consent,
        !!marketing_consent
      ]
    );

    if (!out.rows.length) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('admin update-trial-request error:', err);
    return res.status(500).json({ success: false, error: 'Errore modifica richiesta prova gratuita.' });
  }
});



app.post('/api/admin/delete-trial-request', requireAdmin, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const out = await pool.query(
      `DELETE FROM trial_requests
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (!out.rows.length) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('admin delete-trial-request error:', err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione richiesta prova gratuita.' });
  }
});



app.post('/api/admin/generate-trial-code', requireAdmin, async (req, res) => {
  try {
    const host = req.get('host');
    const isRenderHost = /onrender\.com$/i.test(host || '');
    const baseUrl = isRenderHost ? `https://${host}` : `${req.protocol}://${host}`;

    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const trialRes = await pool.query(
      `SELECT * FROM trial_requests WHERE id = $1 LIMIT 1`,
      [id]
    );

    const trial = trialRes.rows[0];
    if (!trial) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    if (trial.code && trial.public_id && trial.owner_access_token) {
      const app_url = `${baseUrl.replace(/\/$/, '')}/owner-access/${trial.owner_access_token}`;
      return res.json({
        success: true,
        code: trial.code,
        public_id: trial.public_id,
        owner_access_token: trial.owner_access_token,
        app_url
      });
    }

    let code = null;
    let publicId = null;
    let ownerAccessToken = null;

    for (let i = 0; i < 20; i++) {
      const tryCode = generateCode();
      const tryPublicId = generatePublicId();
      const tryToken = generateOwnerAccessToken();

      const existsCode = await pool.query('SELECT 1 FROM sticker_codes WHERE code = $1 LIMIT 1', [tryCode]);
      const existsPid = await pool.query('SELECT 1 FROM sticker_codes WHERE public_id = $1 LIMIT 1', [tryPublicId]);
      if (!existsCode.rows.length && !existsPid.rows.length) {
        code = tryCode;
        publicId = tryPublicId;
        ownerAccessToken = tryToken;
        break;
      }
    }

    if (!code || !publicId || !ownerAccessToken) {
      return res.status(500).json({ success: false, error: 'Impossibile generare un codice univoco.' });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const qrUrl = `${baseUrl.replace(/\/$/, '')}/contact/u/${encodeURIComponent(publicId)}`;

    await pool.query(
      `INSERT INTO sticker_codes
       (code, public_id, status, plan_type, expires_at, owner_access_token, qr_url, offered_by,
        brand, plate, vehicle_model, color, phone, activated_at)
       VALUES
       ($1, $2, 'used', '1month', $3, $4, $5, $6,
        $7, $8, $9, $10, $11, NOW())`,
      [
        code,
        publicId,
        expiresAt,
        ownerAccessToken,
        qrUrl,
        'Prova gratuita',
        trial.brand || null,
        String(trial.plate || '').trim().toUpperCase(),
        trial.vehicle_model || null,
        trial.color || null,
        trial.phone || null
      ]
    );

    await pool.query(
      `UPDATE trial_requests
       SET code = $2,
           public_id = $3,
           owner_access_token = $4,
           generated_at = NOW()
       WHERE id = $1`,
      [id, code, publicId, ownerAccessToken]
    );

    const app_url = `${baseUrl.replace(/\/$/, '')}/owner-access/${ownerAccessToken}`;

    return res.json({
      success: true,
      code,
      public_id: publicId,
      owner_access_token: ownerAccessToken,
      app_url
    });
  } catch (err) {
    console.error('admin generate-trial-code error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore generazione codice prova.',
      debug_message: err?.message || null,
      debug_detail: err?.detail || null,
      debug_hint: err?.hint || null,
      debug_code: err?.code || null,
      debug_table: err?.table || null,
      debug_column: err?.column || null,
      debug_constraint: err?.constraint || null
    });
  }
});


app.get('/api/admin/trial-requests', requireAdmin, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT *
       FROM trial_requests
       ORDER BY created_at DESC, id DESC`
    );
    return res.json({ success: true, items: rows.rows || [] });
  } catch (err) {
    console.error('admin trial-requests error:', err);
    return res.status(500).json({ success: false, error: 'Errore caricamento richieste prova gratuita.' });
  }
});




async function generateTrialCodeFromRequestId(req, trialId) {
  const host = req.get('host');
  const isRenderHost = /onrender\.com$/i.test(host || '');
  const baseUrl = isRenderHost ? `https://${host}` : `${req.protocol}://${host}`;

  const trialRes = await pool.query(
    `SELECT * FROM trial_requests WHERE id = $1 LIMIT 1`,
    [trialId]
  );

  const trial = trialRes.rows[0];
  if (!trial) {
    const err = new Error('Richiesta non trovata.');
    err.statusCode = 404;
    throw err;
  }

  if (trial.code && trial.public_id && trial.owner_access_token) {
    const app_url = `${baseUrl.replace(/\/$/, '')}/owner-access/${trial.owner_access_token}`;
    return {
      code: trial.code,
      public_id: trial.public_id,
      owner_access_token: trial.owner_access_token,
      app_url,
      already_generated: true
    };
  }

  let code = null;
  let publicId = null;
  let ownerAccessToken = null;

  for (let i = 0; i < 20; i++) {
    const tryCode = generateCode();
    const tryPublicId = generatePublicId();
    const tryToken = generateOwnerAccessToken();

    const existsCode = await pool.query('SELECT 1 FROM sticker_codes WHERE code = $1 LIMIT 1', [tryCode]);
    const existsPid = await pool.query('SELECT 1 FROM sticker_codes WHERE public_id = $1 LIMIT 1', [tryPublicId]);

    if (!existsCode.rows.length && !existsPid.rows.length) {
      code = tryCode;
      publicId = tryPublicId;
      ownerAccessToken = tryToken;
      break;
    }
  }

  if (!code || !publicId || !ownerAccessToken) {
    throw new Error('Impossibile generare un codice univoco.');
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const qrUrl = `${baseUrl.replace(/\/$/, '')}/contact/u/${encodeURIComponent(publicId)}`;

  await pool.query(
    `INSERT INTO sticker_codes
     (code, public_id, status, plan_type, expires_at, owner_access_token, qr_url, offered_by,
      brand, plate, vehicle_model, color, phone, activated_at)
     VALUES
     ($1, $2, 'used', '1month', $3, $4, $5, $6,
      $7, $8, $9, $10, $11, NOW())`,
    [
      code,
      publicId,
      expiresAt,
      ownerAccessToken,
      qrUrl,
      'Prova gratuita',
      trial.brand || null,
      String(trial.plate || '').trim().toUpperCase().replace(/\s+/g, ''),
      trial.vehicle_model || null,
      trial.color || null,
      trial.phone || null
    ]
  );

  await pool.query(
    `UPDATE trial_requests
     SET code = $2,
         public_id = $3,
         owner_access_token = $4,
         generated_at = NOW(),
         otp_status = COALESCE(otp_status, 'verified')
     WHERE id = $1`,
    [trialId, code, publicId, ownerAccessToken]
  );

  const app_url = `${baseUrl.replace(/\/$/, '')}/owner-access/${ownerAccessToken}`;

  return {
    code,
    public_id: publicId,
    owner_access_token: ownerAccessToken,
    app_url,
    already_generated: false
  };
}


app.get('/api/trial-request/:id/public', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const result = await pool.query(
      `SELECT id, plate, brand, vehicle_model, color, otp_status, generated_at, created_at
       FROM trial_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    return res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error('public trial request detail error:', err);
    return res.status(500).json({ success: false, error: 'Errore caricamento richiesta.' });
  }
});


app.post('/api/trial-request/:id/verify-otp', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    const otp = String(req.body?.otp || '').trim().replace(/\D/g, '');

    if (!id || !otp) {
      return res.status(400).json({ success: false, error: 'Inserisci il codice OTP ricevuto.' });
    }

    const result = await pool.query(
      `SELECT *
       FROM trial_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    const trial = result.rows[0];

    if (!trial) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    if (trial.code && trial.public_id && trial.owner_access_token) {
      const generated = await generateTrialCodeFromRequestId(req, id);
      return res.json({
        success: true,
        already_verified: true,
        already_generated: true,
        app_url: generated.app_url,
        code: generated.code,
        public_id: generated.public_id
      });
    }

    if (!trial.otp_code || String(trial.otp_code).trim() !== otp) {
      return res.status(400).json({ success: false, error: 'Codice OTP non corretto.' });
    }

    if (trial.otp_expires_at && new Date(trial.otp_expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Codice OTP scaduto. Richiedi un nuovo codice.' });
    }

    await pool.query(
      `UPDATE trial_requests
       SET otp_verified_at = NOW(),
           otp_status = 'verified'
       WHERE id = $1`,
      [id]
    );

    const generated = await generateTrialCodeFromRequestId(req, id);

    try {
      const trialPushCode = 'AMC-E8493C7F';
      const trialPushPlate = 'GL740CH';
      const nowLabel = new Date().toLocaleString('it-IT');
      const msgText = [
        'Prova gratuita attivata automaticamente con OTP',
        `Data e ora: ${nowLabel}`,
        `Targa: ${String(trial.plate || '').trim().toUpperCase()}`,
        `Veicolo: ${[trial.brand, trial.vehicle_model].filter(Boolean).join(' ')}`,
        `Codice: ${generated.code}`
      ].filter(Boolean).join('\n');

      await pool.query(
        `INSERT INTO contact_message_logs
         (code, plate, reason, message_text, location_shared, created_at)
         VALUES ($1,$2,$3,$4,FALSE,NOW())`,
        [trialPushCode, trialPushPlate, 'Prova attivata con OTP', msgText]
      );
    } catch (notifyErr) {
      console.error('otp auto activation log error:', notifyErr);
    }

    return res.json({
      success: true,
      message: 'OTP verificato. Prova gratuita attivata.',
      app_url: generated.app_url,
      code: generated.code,
      public_id: generated.public_id
    });
  } catch (err) {
    console.error('verify otp trial request error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore verifica OTP.',
      debug_message: err?.message || null
    });
  }
});



app.get('/api/admin/trial-request/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const result = await pool.query(
      `SELECT *
       FROM trial_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    const item = result.rows[0];
    const phoneNorm = normalizeItalianMobileForOtp(item.phone);
    const whatsappNumber = item.phone_whatsapp || phoneNorm.whatsapp;
    const otpCode = item.otp_code || '';

    const host = req.get('host');
    const isRenderHost = /onrender\.com$/i.test(host || '');
    const baseUrl = isRenderHost ? `https://${host}` : `${req.protocol}://${host}`;
    const verifyUrl = `${baseUrl.replace(/\/$/, '')}/verifica-otp.html?id=${encodeURIComponent(item.id)}`;

    const whatsappText = [
      'Ciao, per completare l’attivazione della prova gratuita Contatto Veicolo inserisci questo codice:',
      '',
      otpCode,
      '',
      'Apri questa pagina e conferma:',
      verifyUrl
    ].join('\n');

    const whatsappUrl = whatsappNumber
      ? `https://wa.me/${encodeURIComponent(whatsappNumber)}?text=${encodeURIComponent(whatsappText)}`
      : '';

    return res.json({
      success: true,
      item,
      whatsapp_number: whatsappNumber,
      whatsapp_text: whatsappText,
      whatsapp_url: whatsappUrl
    });
  } catch (err) {
    console.error('admin trial-request detail error:', err);
    return res.status(500).json({ success: false, error: 'Errore caricamento richiesta OTP.' });
  }
});


app.post('/api/admin/trial-request/:id/mark-otp-sent', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    await pool.query(
      `UPDATE trial_requests
       SET otp_sent_at = NOW(),
           otp_status = COALESCE(NULLIF(otp_status,''), 'pending_otp')
       WHERE id = $1`,
      [id]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('admin mark otp sent error:', err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento invio OTP.' });
  }
});


app.post('/api/admin/trial-request/:id/regenerate-otp', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'ID richiesta obbligatorio.' });
    }

    const otpCode = generateOtpCode();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const updated = await pool.query(
      `UPDATE trial_requests
       SET otp_code = $2,
           otp_expires_at = $3,
           otp_sent_at = NULL,
           otp_status = 'pending_otp'
       WHERE id = $1
       RETURNING *`,
      [id, otpCode, otpExpiresAt]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ success: false, error: 'Richiesta non trovata.' });
    }

    return res.json({ success: true, item: updated.rows[0] });
  } catch (err) {
    console.error('admin regenerate otp error:', err);
    return res.status(500).json({ success: false, error: 'Errore rigenerazione OTP.' });
  }
});



app.get('/api/admin/list-stickers', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toUpperCase();

    let result;
    if (q) {
      result = await pool.query(
        `SELECT
           sc.code, sc.public_id, sc.plate, sc.brand, sc.vehicle_model, sc.color, sc.offered_by, sc.phone,
           sc.status, sc.qr_url, sc.plan_type, sc.expires_at, sc.activated_at,
           sc.invite_sent_to, sc.invite_channel, sc.invite_target, sc.invite_variant, sc.invite_sent_at,
           sc.feedback_bonus_used, sc.owner_last_seen,
           sc.owner_app_detected_at, sc.owner_app_is_standalone, sc.owner_app_user_agent,
           sc.owner_app_platform, sc.owner_app_browser,
           COALESCE(ps.push_active_count, 0) AS push_active_count,
           ps.push_last_seen_at,
           ps.push_updated_at,
           ps.push_user_agent,
           COALESCE(ps.app_devices, '[]'::json) AS app_devices,
           COALESCE(ps.hidden_old_devices_count, 0) AS hidden_old_devices_count
         FROM sticker_codes sc
         LEFT JOIN (
           SELECT
             code,
             REPLACE(UPPER(COALESCE(plate,'')), ' ', '') AS plate_norm,
             COUNT(*)::int AS push_active_count,
             MAX(last_seen_at) AS push_last_seen_at,
             MAX(updated_at) AS push_updated_at,
             (ARRAY_AGG(user_agent ORDER BY updated_at DESC NULLS LAST))[1] AS push_user_agent,
             COALESCE(
               json_agg(
                 json_build_object(
                   'endpoint', endpoint,
                   'is_active', is_active,
                   'is_primary', is_primary,
                   'receive_admin_alerts', receive_admin_alerts,
                   'receive_passenger_alerts', receive_passenger_alerts,
                   'app_saved_detected', app_saved_detected,
                   'app_saved_detected_at', app_saved_detected_at,
                   'last_seen_at', last_seen_at,
                   'updated_at', updated_at,
                   'user_agent', user_agent
                 )
                 ORDER BY COALESCE(last_seen_at, updated_at) DESC NULLS LAST
               ) FILTER (
                 WHERE COALESCE(last_seen_at, updated_at) >= NOW() - INTERVAL '30 days'
               ),
               '[]'::json
             ) AS app_devices,
             COUNT(*) FILTER (
               WHERE COALESCE(last_seen_at, updated_at) < NOW() - INTERVAL '30 days'
                  OR COALESCE(last_seen_at, updated_at) IS NULL
             )::int AS hidden_old_devices_count
           FROM push_subscriptions
           WHERE COALESCE(is_active, TRUE) = TRUE
             AND COALESCE(receive_passenger_alerts, TRUE) = TRUE
           GROUP BY code, REPLACE(UPPER(COALESCE(plate,'')), ' ', '')
         ) ps
           ON ps.code = sc.code
          AND ps.plate_norm = REPLACE(UPPER(COALESCE(sc.plate,'')), ' ', '')
         WHERE UPPER(COALESCE(sc.code,'')) LIKE $1
            OR UPPER(COALESCE(sc.public_id,'')) LIKE $1
            OR UPPER(REPLACE(COALESCE(sc.plate,''), ' ', '')) LIKE REPLACE($1, ' ', '')
         ORDER BY sc.activated_at DESC NULLS LAST, sc.code DESC`,
        [`%${q}%`]
      );
    } else {
      result = await pool.query(
        `SELECT
           sc.code, sc.public_id, sc.plate, sc.brand, sc.vehicle_model, sc.color, sc.offered_by, sc.phone,
           sc.status, sc.qr_url, sc.plan_type, sc.expires_at, sc.activated_at,
           sc.invite_sent_to, sc.invite_channel, sc.invite_target, sc.invite_variant, sc.invite_sent_at,
           sc.feedback_bonus_used, sc.owner_last_seen,
           sc.owner_app_detected_at, sc.owner_app_is_standalone, sc.owner_app_user_agent,
           sc.owner_app_platform, sc.owner_app_browser,
           COALESCE(ps.push_active_count, 0) AS push_active_count,
           ps.push_last_seen_at,
           ps.push_updated_at,
           ps.push_user_agent,
           COALESCE(ps.app_devices, '[]'::json) AS app_devices,
           COALESCE(ps.hidden_old_devices_count, 0) AS hidden_old_devices_count
         FROM sticker_codes sc
         LEFT JOIN (
           SELECT
             code,
             REPLACE(UPPER(COALESCE(plate,'')), ' ', '') AS plate_norm,
             COUNT(*)::int AS push_active_count,
             MAX(last_seen_at) AS push_last_seen_at,
             MAX(updated_at) AS push_updated_at,
             (ARRAY_AGG(user_agent ORDER BY updated_at DESC NULLS LAST))[1] AS push_user_agent,
             COALESCE(
               json_agg(
                 json_build_object(
                   'endpoint', endpoint,
                   'is_active', is_active,
                   'is_primary', is_primary,
                   'receive_admin_alerts', receive_admin_alerts,
                   'receive_passenger_alerts', receive_passenger_alerts,
                   'app_saved_detected', app_saved_detected,
                   'app_saved_detected_at', app_saved_detected_at,
                   'last_seen_at', last_seen_at,
                   'updated_at', updated_at,
                   'user_agent', user_agent
                 )
                 ORDER BY COALESCE(last_seen_at, updated_at) DESC NULLS LAST
               ) FILTER (
                 WHERE COALESCE(last_seen_at, updated_at) >= NOW() - INTERVAL '30 days'
               ),
               '[]'::json
             ) AS app_devices,
             COUNT(*) FILTER (
               WHERE COALESCE(last_seen_at, updated_at) < NOW() - INTERVAL '30 days'
                  OR COALESCE(last_seen_at, updated_at) IS NULL
             )::int AS hidden_old_devices_count
           FROM push_subscriptions
           WHERE COALESCE(is_active, TRUE) = TRUE
             AND COALESCE(receive_passenger_alerts, TRUE) = TRUE
           GROUP BY code, REPLACE(UPPER(COALESCE(plate,'')), ' ', '')
         ) ps
           ON ps.code = sc.code
          AND ps.plate_norm = REPLACE(UPPER(COALESCE(sc.plate,'')), ' ', '')
         ORDER BY sc.activated_at DESC NULLS LAST, sc.code DESC
         LIMIT 300`
      );
    }

    const kpi = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM sticker_codes WHERE status = 'used') AS active_count,
        (SELECT COUNT(*)::int FROM sticker_codes WHERE status = 'new') AS new_count,
        (SELECT COUNT(*)::int FROM sticker_codes WHERE status = 'disabled') AS disabled_count,
        (SELECT COUNT(*)::int FROM sticker_codes WHERE qr_url LIKE '%localhost%') AS localhost_count,
        (SELECT COUNT(*)::int FROM contact_page_views) AS total_views,
        (SELECT COUNT(*)::int FROM contact_message_logs) AS total_messages
    `);

    return res.json({
      success: true,
      items: result.rows,
      summary: kpi.rows[0] || {
        active_count: 0,
        new_count: 0,
        disabled_count: 0,
        localhost_count: 0,
        total_views: 0,
        total_messages: 0
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore caricamento codici admin.' });
  }
});

app.post('/api/admin/update-sticker', requireAdmin, async (req, res) => {
  try {
    const {
      code, brand, plate, vehicle_model, color, offered_by, phone,
      plan_type, expires_at
    } = req.body || {};

    if (!code) {
      return res.status(400).json({ success: false, error: 'Codice obbligatorio.' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    await pool.query(
      `UPDATE sticker_codes
       SET brand = $2,
           plate = $3,
           vehicle_model = $4,
           color = $5,
           offered_by = $6,
           phone = $7,
           plan_type = $8,
           expires_at = $9
       WHERE code = $1`,
      [
        cleanCode,
        brand || null,
        plate || null,
        vehicle_model || null,
        color || null,
        offered_by ? String(offered_by).trim() : null,
        phone || null,
        plan_type || null,
        expires_at || null
      ]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento record.' });
  }
});



app.get('/api/admin/collected-data', requireAdmin, async (req, res) => {
  try {
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM contact_page_views) AS total_views,
        (SELECT COUNT(*)::int FROM contact_message_logs) AS total_messages,
        (SELECT COUNT(*)::int FROM renewal_feedback) AS total_feedback,
        (SELECT COUNT(*)::int FROM sticker_codes WHERE status = 'used') AS active_codes
    `);

    const rows = await pool.query(`
      SELECT
        s.code,
        s.public_id,
        s.plate,
        s.status,
        s.plan_type,
        s.expires_at,
        COALESCE(v.views_count, 0) AS views_count,
        COALESCE(m.messages_count, 0) AS messages_count,
        COALESCE(f.feedback_count, 0) AS feedback_count,
        GREATEST(
          COALESCE(v.last_view, '1970-01-01'::timestamp),
          COALESCE(m.last_message, '1970-01-01'::timestamp),
          COALESCE(f.last_feedback, '1970-01-01'::timestamp)
        ) AS last_activity
      FROM sticker_codes s
      LEFT JOIN (
        SELECT code, COUNT(*)::int AS views_count, MAX(viewed_at) AS last_view
        FROM contact_page_views
        GROUP BY code
      ) v ON v.code = s.code
      LEFT JOIN (
        SELECT code, COUNT(*)::int AS messages_count, MAX(created_at) AS last_message
        FROM contact_message_logs
        GROUP BY code
      ) m ON m.code = s.code
      LEFT JOIN (
        SELECT code, COUNT(*)::int AS feedback_count, MAX(created_at) AS last_feedback
        FROM renewal_feedback
        GROUP BY code
      ) f ON f.code = s.code
      ORDER BY last_activity DESC NULLS LAST, s.code DESC
      LIMIT 200
    `);

    return res.json({
      success: true,
      summary: totals.rows[0] || {
        total_views: 0,
        total_messages: 0,
        total_feedback: 0,
        active_codes: 0
      },
      items: rows.rows || []
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore caricamento dati raccolti.' });
  }
});


app.post('/api/admin/delete-sticker', requireAdmin, async (req, res) => {
  try {
    const { code } = req.body || {};

    if (!code) {
      return res.status(400).json({ success: false, error: 'Codice obbligatorio.' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    const found = await pool.query(
      'SELECT code, status FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    await pool.query('DELETE FROM sticker_codes WHERE code = $1', [cleanCode]);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione codice.' });
  }
});


app.post('/api/admin/set-status', requireAdmin, async (req, res) => {
  try {
    const { code, status } = req.body || {};

    if (!code || !status) {
      return res.status(400).json({ success: false, error: 'Codice e stato obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const allowed = ['new', 'used', 'disabled', 'reactivated'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Stato non valido.' });
    }

    await pool.query(
      `UPDATE sticker_codes
       SET status = $2
       WHERE code = $1`,
      [cleanCode, status]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore cambio stato.' });
  }
});


app.post('/api/admin/save-invite', requireAdmin, async (req, res) => {
  try {
    const { code, invite_sent_to, invite_channel, invite_target, invite_variant } = req.body || {};

    if (!code) {
      return res.status(400).json({ success: false, error: 'Codice obbligatorio.' });
    }

    const cleanCode = String(code).trim().toUpperCase();

    await pool.query(
      `UPDATE sticker_codes
       SET invite_sent_to = $2,
           invite_channel = $3,
           invite_target = $4,
           invite_variant = $5,
           invite_sent_at = NOW()
       WHERE code = $1`,
      [
        cleanCode,
        invite_sent_to || null,
        invite_channel || null,
        invite_target || null,
        invite_variant || null
      ]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore salvataggio invito.' });
  }
});








app.post('/api/admin/cleanup-app-update-messages', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE contact_message_logs
       SET
         deleted_at = COALESCE(deleted_at, NOW()),
         read_at = COALESCE(read_at, NOW())
       WHERE deleted_at IS NULL
         AND (
           reason = 'Aggiorna la tua App'
           OR reason ILIKE '%aggiorna%app%'
           OR message_text ILIKE '%Aggiorna App%'
           OR message_text ILIKE '%È disponibile una nuova versione%'
           OR message_text ILIKE '%E disponibile una nuova versione%'
         )
       RETURNING id, code, plate, reason`
    );

    return res.json({
      success: true,
      cleaned_count: result.rows.length,
      cleaned_ids: result.rows.map(r => r.id)
    });
  } catch (err) {
    console.error('cleanup-app-update-messages error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore pulizia vecchi messaggi aggiornamento App.'
    });
  }
});


app.post('/api/admin/cleanup-old-app-update-messages', requireAdmin, async (req, res) => {
  try {
    const cleaned = await pool.query(
      `UPDATE contact_message_logs
       SET
         deleted_at = COALESCE(deleted_at, NOW()),
         read_at = COALESCE(read_at, NOW())
       WHERE deleted_at IS NULL
         AND (
           LOWER(COALESCE(reason,'')) LIKE '%aggiorna la tua app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%aggiorna app%'
           OR LOWER(COALESCE(message_text,'')) LIKE '%nuova versione%'
         )
       RETURNING id, code, plate, reason`
    );

    return res.json({
      success: true,
      cleaned_count: cleaned.rows.length,
      cleaned_ids: cleaned.rows.map(r => r.id),
      cleaned_items: cleaned.rows
    });
  } catch (err) {
    console.error('cleanup-old-app-update-messages error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore pulizia vecchi avvisi Aggiorna App.'
    });
  }
});


app.post('/api/admin/app-update-broadcast', requireAdmin, async (req, res) => {
  try {
    const cleanTitle = String(req.body?.title || 'Aggiorna la tua App').trim();
    const cleanMessage = String(req.body?.message || 'È disponibile una nuova versione. Apri la tua App e tocca “Aggiorna App”.').trim();

    const rows = await pool.query(
      `SELECT DISTINCT
         ps.endpoint,
         ps.p256dh,
         ps.auth,
         ps.code,
         ps.plate
       FROM push_subscriptions ps
       WHERE ps.is_active = TRUE`
    );

    if (!rows.rows.length) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows.rows) {
      const code = String(row.code || '').trim().toUpperCase();
      const plate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

      if (!code || !plate) {
        failed += 1;
        continue;
      }

      const targetUrl = `/owner-app/${encodeURIComponent(code)}/${encodeURIComponent(plate)}?forceAppUpdate=1`;

      const payload = JSON.stringify({
        title: cleanTitle,
        body: cleanMessage,
        url: targetUrl,
        targetUrl,
        channel: 'app-update-technical',
        type: 'app_update',
        appUpdate: true,
        requireInteraction: true,
        renotify: true,
        tag: `app-update-${code}`,
        icon: '/icons/android-chrome-192x192.png',
        badge: '/icons/favicon-32x32.png'
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth
            }
          },
          payload
        );
        sent += 1;
      } catch (pushErr) {
        failed += 1;
        console.error('app-update-broadcast push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);

        if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
          try {
            await pool.query('UPDATE push_subscriptions SET is_active = FALSE WHERE endpoint = $1', [row.endpoint]);
          } catch (cleanupErr) {
            console.error('app-update-broadcast cleanup error:', cleanupErr);
          }
        }
      }
    }

    return res.json({
      success: true,
      sent,
      failed,
      total: rows.rows.length
    });
  } catch (err) {
    console.error('app-update-broadcast error:', err);
    return res.status(500).json({ success: false, error: 'Errore invio aggiornamento App.' });
  }
});




// admin-broadcast-delete-endpoints-v1
app.get('/api/admin/broadcast-list', requireAdmin, async (req, res) => {
  try {
    const notifications = await pool.query(
      `SELECT *
       FROM broadcast_notifications
       ORDER BY created_at DESC NULLS LAST, id DESC
       LIMIT 200`
    );

    const recipientCounts = await pool.query(
      `SELECT
         broadcast_notification_id,
         COUNT(*)::int AS total_recipients,
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened_count
       FROM broadcast_notification_recipients
       GROUP BY broadcast_notification_id`
    ).catch(() => ({ rows: [] }));

    const countsMap = new Map();
    for (const r of recipientCounts.rows || []) {
      countsMap.set(Number(r.broadcast_notification_id), r);
    }

    const items = (notifications.rows || []).map(row => {
      const counts = countsMap.get(Number(row.id)) || {};
      return {
        id: row.id,
        title: row.title || row.notification_title || row.subject || 'Push amministratore',
        message: row.message || row.body || row.notification_message || '',
        audience: row.audience || row.channel || row.type || '',
        created_at: row.created_at || null,
        sent_count: row.sent_count ?? row.sent ?? null,
        failed_count: row.failed_count ?? row.failed ?? null,
        total_recipients: counts.total_recipients ?? row.total ?? null,
        opened_count: counts.opened_count ?? null
      };
    });

    return res.json({
      success: true,
      items
    });
  } catch (err) {
    console.error('admin broadcast-list error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore caricamento push inviate.',
      detail: err.message
    });
  }
});

app.post('/api/admin/broadcast-delete', requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
      : [];

    const cleanIds = [...new Set(ids)];

    if (!cleanIds.length) {
      return res.status(400).json({
        success: false,
        error: 'Nessuna push selezionata.',
        received_body: req.body || null
      });
    }

    /*
      IMPORTANTE:
      La colonna reale dei recipients va scoperta PRIMA della transazione.
      Se proviamo una colonna inesistente dentro BEGIN, PostgreSQL manda la transazione
      in stato aborted e poi tutte le query successive falliscono con 25P02.
    */
    const colInfo = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'broadcast_notification_recipients'
         AND column_name IN ('broadcast_notification_id', 'notification_id', 'broadcast_id')`
    );

    const availableCols = colInfo.rows.map(r => r.column_name);
    const recipientColumn =
      availableCols.includes('broadcast_notification_id') ? 'broadcast_notification_id' :
      availableCols.includes('notification_id') ? 'notification_id' :
      availableCols.includes('broadcast_id') ? 'broadcast_id' :
      null;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id
       FROM broadcast_notifications
       WHERE id = ANY($1::int[])
       ORDER BY id`,
      [cleanIds]
    );

    const foundIds = existing.rows.map(r => Number(r.id));

    if (!foundIds.length) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        deleted_count: 0,
        deleted_ids: [],
        recipients_deleted_count: 0,
        recipients_delete_mode: recipientColumn || 'none',
        available_recipient_columns: availableCols,
        requested_ids: cleanIds,
        found_ids: [],
        warning: 'Nessuna push trovata con gli ID richiesti.'
      });
    }

    let recipientsDeletedCount = 0;

    if (recipientColumn) {
      const deletedRecipients = await client.query(
        `DELETE FROM broadcast_notification_recipients
         WHERE ${recipientColumn} = ANY($1::int[])`,
        [foundIds]
      );

      recipientsDeletedCount = deletedRecipients.rowCount || 0;
    }

    const notificationsDeleted = await client.query(
      `DELETE FROM broadcast_notifications
       WHERE id = ANY($1::int[])
       RETURNING id`,
      [foundIds]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      deleted_count: notificationsDeleted.rows.length,
      deleted_ids: notificationsDeleted.rows.map(r => Number(r.id)),
      recipients_deleted_count: recipientsDeletedCount,
      recipients_delete_mode: recipientColumn || 'none',
      available_recipient_columns: availableCols,
      requested_ids: cleanIds,
      found_ids: foundIds
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e) {}
    console.error('admin broadcast-delete error:', err);

    return res.status(500).json({
      success: false,
      error: 'Errore eliminazione push.',
      detail: err.message,
      code: err.code || null,
      constraint: err.constraint || null,
      table: err.table || null,
      column: err.column || null,
      received_body: req.body || null
    });
  } finally {
    client.release();
  }
});
// /admin-broadcast-delete-endpoints-v1


app.post('/api/admin/push-broadcast', requireAdmin, async (req, res) => {
  try {
    const {
      title,
      message,
      url,
      audience = 'all'
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    const cleanMessage = String(message || '').trim();
    const cleanUrl = String(url || '').trim();
    const isAppUpdateBroadcast = req.body?.app_update === true || String(req.body?.type || '').trim() === 'app_update' || String(req.body?.audience || '').trim() === 'app_update';

    if (!cleanTitle) {
      return res.status(400).json({ success: false, error: 'Titolo mancante.' });
    }
    if (!cleanMessage) {
      return res.status(400).json({ success: false, error: 'Messaggio mancante.' });
    }

    let whereClause = '';
    if (audience === 'used') whereClause = "WHERE sc.status = 'used'";
    else if (audience === 'new') whereClause = "WHERE sc.status = 'new'";
    else if (audience === 'disabled') whereClause = "WHERE sc.status = 'disabled'";
    else if (audience === 'reactivated') whereClause = "WHERE sc.status = 'reactivated'";

    const rows = await pool.query(
      `
      SELECT DISTINCT
        ps.endpoint,
        ps.p256dh,
        ps.auth,
        ps.code,
        ps.plate
      FROM push_subscriptions ps
      LEFT JOIN sticker_codes sc ON sc.code = ps.code
      ${whereClause ? whereClause + " AND " : "WHERE "} ps.is_active = TRUE ${isAppUpdateBroadcast ? "" : "AND ps.receive_admin_alerts = TRUE"}
      `
    );

    const notificationInsert = await pool.query(
      `INSERT INTO broadcast_notifications
       (title, message_text, target_url, audience, total_targets)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [cleanTitle, cleanMessage, (!cleanUrl || cleanUrl === '/owner-login.html') ? '/owner-simple.html' : cleanUrl, audience, rows.rows.length]
    );

    const notificationId = notificationInsert.rows[0].id;

    if (!rows.rows.length) {
      return res.json({ success: true, sent: 0, failed: 0, total: 0, notification_id: notificationId });
    }

    let sent = 0;
    let failed = 0;

    for (const row of rows.rows) {
      const recipientInsert = await pool.query(
        `INSERT INTO broadcast_notification_recipients
         (notification_id, code, plate, endpoint, status)
         VALUES ($1,$2,$3,$4,'sent')
         RETURNING id`,
        [notificationId, row.code || null, row.plate || null, row.endpoint]
      );

      const recipientId = recipientInsert.rows[0].id;

      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      const directOwnerUrl = `/owner-simple.html?code=${encodeURIComponent(String(row.code || '').trim().toUpperCase())}&plate=${encodeURIComponent(String(row.plate || '').trim())}`;
      let resolvedOwnerUrl = (!cleanUrl || cleanUrl === '/owner-login.html') ? directOwnerUrl : cleanUrl;

      if (isAppUpdateBroadcast) {
        try {
          const updateUrl = new URL(directOwnerUrl, 'https://contatto-veicolo.local');
          updateUrl.searchParams.set('forceAppUpdate', '1');
          resolvedOwnerUrl = updateUrl.pathname + updateUrl.search;
        } catch(e) {
          resolvedOwnerUrl = directOwnerUrl + (directOwnerUrl.includes('?') ? '&' : '?') + 'forceAppUpdate=1';
        }
      }

      const payloadBase = {
        title: cleanTitle,
        body: cleanMessage,
        url: resolvedOwnerUrl,
        targetUrl: resolvedOwnerUrl,
        icon: '/icons/android-chrome-192x192.png',
        badge: '/icons/favicon-32x32.png',
        broadcastNotificationId: notificationId,
        broadcastRecipientId: recipientId
      };

      try {
        await pool.query(
          `INSERT INTO contact_message_logs (code, plate, reason, message_text, location_shared, created_at)
           VALUES ($1, $2, $3, $4, FALSE, NOW())`,
          [row.code, row.plate, cleanTitle || 'Messaggio admin', cleanMessage]
        );

        await webpush.sendNotification(subscription, JSON.stringify(payloadBase));
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error('Broadcast push failed:', row.code, row.endpoint, err?.message || err);

        await pool.query(
          `UPDATE broadcast_notification_recipients
           SET status = 'failed'
           WHERE id = $1`,
          [recipientId]
        );

        const statusCode = err?.statusCode || 0;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
          } catch (cleanupErr) {
            console.error('Failed removing expired push subscription:', cleanupErr?.message || cleanupErr);
          }
        }
      }
    }

    await pool.query(
      `UPDATE broadcast_notifications
       SET total_sent = $2, total_failed = $3
       WHERE id = $1`,
      [notificationId, sent, failed]
    );

    return res.json({
      success: true,
      sent,
      failed,
      total: rows.rows.length,
      notification_id: notificationId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore invio push massivo.' });
  }
});

app.post('/api/push/broadcast-opened', async (req, res) => {
  try {
    console.log('PUSH OPEN HIT', new Date().toISOString(), req.body);
    const { recipient_id, notification_id } = req.body || {};
    if (!recipient_id || !notification_id) {
      return res.status(400).json({ success: false, error: 'Dati tracking mancanti.' });
    }

    await pool.query(
      `UPDATE broadcast_notification_recipients
       SET status = 'opened',
           opened_at = COALESCE(opened_at, NOW())
       WHERE id = $1
         AND notification_id = $2`,
      [recipient_id, notification_id]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore tracking apertura push.' });
  }
});

app.get('/api/admin/last-broadcast-status', requireAdmin, async (req, res) => {
  try {
    const last = await pool.query(
      `SELECT *
       FROM broadcast_notifications
       ORDER BY id DESC
       LIMIT 1`
    );

    if (!last.rows.length) {
      return res.json({ success: true, notification: null, recipients: [] });
    }

    const notification = last.rows[0];

    const recipients = await pool.query(
      `SELECT
         id,
         code,
         plate,
         status,
         sent_at,
         opened_at
       FROM broadcast_notification_recipients
       WHERE notification_id = $1
       ORDER BY id DESC`,
      [notification.id]
    );

    return res.json({
      success: true,
      notification,
      recipients: recipients.rows
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore lettura ultima push.' });
  }
});



app.post('/api/admin/fix-qr-url', requireAdmin, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ success: false, error: 'Codice obbligatorio.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com';

    const found = await pool.query(
      'SELECT code, public_id FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = found.rows[0];
    if (!row.public_id) {
      return res.status(400).json({ success: false, error: 'Public ID mancante.' });
    }

    const qrUrl = `${baseUrl.replace(/\/$/, '')}/contact/u/${encodeURIComponent(row.public_id)}`;

    await pool.query(
      `UPDATE sticker_codes
       SET qr_url = $2
       WHERE code = $1`,
      [cleanCode, qrUrl]
    );

    return res.json({ success: true, qr_url: qrUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore correzione URL.' });
  }
});


app.post('/api/owner-disable', async (req, res) => {
  try {
    const { code, plate } = req.body;

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa sono obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    await pool.query(
      `UPDATE sticker_codes
       SET status = 'disabled',
           qr_url = NULL
       WHERE code = $1`,
      [cleanCode]
    );

    return res.json({ success: true, message: 'Adesivo disattivato correttamente.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});




app.get('/api/owner-prefill', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const plate = String(req.query.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa obbligatori.' });
    }

    const result = await pool.query(
      `SELECT
         sc.code,
         sc.plate,
         COALESCE(NULLIF(sc.phone, ''), NULLIF(tr.phone, '')) AS phone
       FROM sticker_codes sc
       LEFT JOIN trial_requests tr
         ON tr.owner_access_token = sc.owner_access_token
       WHERE sc.code = $1
       LIMIT 1`,
      [code]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== plate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente.' });
    }

    return res.json({
      success: true,
      code: row.code,
      plate: row.plate || '',
      phone: row.phone || ''
    });
  } catch (err) {
    console.error('owner-prefill error:', err);
    return res.status(500).json({ success: false, error: 'Errore recupero dati accesso.' });
  }
});


app.post('/api/owner-login-phone-plate', async (req, res) => {
  try {
    const phoneInput = req.body?.phone || '';
    const plateInput = req.body?.plate || '';

    const phone = normalizePhoneForOwnerLogin(phoneInput);
    const plate = normalizePlateForOwnerLogin(plateInput);

    if (!phone || !plate) {
      return res.status(400).json({ success: false, error: 'Inserisci cellulare e targa.' });
    }

    const found = await pool.query(
      `SELECT owner_access_token, code, plate, phone
       FROM sticker_codes
       WHERE owner_access_token IS NOT NULL
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
       ORDER BY activated_at DESC NULLS LAST
       LIMIT 50`,
      [plate]
    );

    const row = (found.rows || []).find(r => {
      const rowPhone = normalizePhoneForOwnerLogin(r.phone || '');
      return rowPhone && rowPhone === phone;
    });

    if (!row || !row.owner_access_token) {
      return res.status(401).json({ success: false, error: 'Cellulare o targa non riconosciuti.' });
    }

    return res.json({
      success: true,
      redirect_url: `/owner-access/${row.owner_access_token}`
    });
  } catch (err) {
    console.error('owner-login-phone-plate error:', err);
    return res.status(500).json({ success: false, error: 'Errore accesso proprietario.' });
  }
});


app.post('/api/owner-login', async (req, res) => {
  try {
    const { code, plate } = req.body;

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa sono obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    return res.json({
      success: true,
      data: {
        code: row.code,
        status: row.status,
        brand: row.brand,
        vehicle_model: row.vehicle_model,
        color: row.color,
        plate: row.plate,
        qr_url: row.qr_url,
        activated_at: row.activated_at
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});


app.post('/api/owner-login', async (req, res) => {
  try {
    const { code, plate } = req.body;

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa sono obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    return res.json({
      success: true,
      data: {
        code: row.code,
        status: row.status,
        brand: row.brand,
        vehicle_model: row.vehicle_model,
        color: row.color,
        plate: row.plate,
        qr_url: row.qr_url,
        activated_at: row.activated_at
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});


app.post('/api/owner-disable', async (req, res) => {
  try {
    const { code, plate } = req.body;

    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Codice e targa sono obbligatori.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase().replace(/\s+/g, '');

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Codice non trovato.' });
    }

    const row = result.rows[0];
    const dbPlate = String(row.plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (dbPlate !== cleanPlate) {
      return res.status(401).json({ success: false, error: 'Targa non corrispondente al codice.' });
    }

    await pool.query(
      `UPDATE sticker_codes
       SET status = 'disabled',
           qr_url = NULL
       WHERE code = $1`,
      [cleanCode]
    );

    return res.json({ success: true, message: 'Adesivo disattivato correttamente.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});


app.get('/api/code/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Codice non trovato' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('get code error:', err);
    res.status(500).json({ success: false, message: 'Errore interno' });
  }
});



app.get('/api/admin/qr-only/:code', requireAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const cleanCode = String(code || '').trim().toUpperCase();
    const wantDownload = String(req.query.download || '') === '1';

    if (!cleanCode) {
      return res.status(400).json({ success: false, error: 'Codice obbligatorio.' });
    }

    const result = await pool.query(
      'SELECT qr_url FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(404).send('Codice non trovato');
    }

    if (!row.qr_url) {
      return res.status(400).send('QR non ancora disponibile per questo codice');
    }

    const pngBuffer = await QRCode.toBuffer(row.qr_url, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 2000,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    if (wantDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="qr-${cleanCode}.png"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="qr-${cleanCode}.png"`);
    }
    res.send(pngBuffer);
  } catch (err) {
    console.error('Errore generazione QR HD:', err);
    res.status(500).send('Errore generazione QR');
  }
});

app.get('/api/qrcode/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Codice non trovato');
    }

    const row = result.rows[0];

    if (!row.qr_url) {
      return res.status(400).send('QR non ancora disponibile per questo codice');
    }

    const pngBuffer = await QRCode.toBuffer(row.qr_url, {
      type: 'png',
      width: 600,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch (err) {
    console.error('qrcode error:', err);
    res.status(500).send('Errore generazione QR');
  }
});

app.post('/api/activate-code', async (req, res) => {
  try {
    const { code, brand, plate, vehicle_model, color, phone } = req.body;

    if (!code || !plate || !vehicle_model || !phone) {
      return res.status(400).json({ success: false, error: 'Dati mancanti per l’attivazione.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = String(plate).trim().toUpperCase();
    const cleanPhone = String(phone).trim().replace(/\s+/g, '');

    const existing = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 LIMIT 1',
      [cleanCode]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Codice non valido.' });
    }

    const row = existing.rows[0];

    if (row.status === 'used') {
      return res.status(400).json({ success: false, error: 'Codice già utilizzato.' });
    }

    let publicId = row.public_id;
    if (!publicId || !String(publicId).trim()) {
      publicId = await getUniquePublicId(pool);
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://adesivo-auto.onrender.com';
    const qrUrl = `${baseUrl.replace(/\/$/, '')}/contact/u/${encodeURIComponent(publicId)}`;

    await pool.query(
      `UPDATE sticker_codes
       SET status = 'used',
           brand = $2,
           plate = $3,
           vehicle_model = $4,
           color = $5,
           phone = $6,
           qr_url = $7,
           public_id = $8,
           activated_at = NOW()
       WHERE code = $1`,
      [cleanCode, brand || null, cleanPlate, vehicle_model || null, color || null, cleanPhone, qrUrl, publicId]
    );

    return res.json({ success: true, qr_url: qrUrl, public_id: publicId });
  } catch (err) {
    console.error('activate-code error:', err);
    return res.status(500).json({ success: false, error: 'Errore attivazione codice.' });
  }
});


app.get('/api/public-contact/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      `SELECT public_id, code, plate, brand, vehicle_model, color, phone, status
       FROM sticker_codes
       WHERE public_id = $1
       LIMIT 1`,
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Contatto non trovato.' });
    }

    const row = result.rows[0];

    if (String(row.status || '') === 'disabled') {
      return res.status(410).json({ success: false, error: 'Adesivo non attivo.' });
    }

    return res.json({
      success: true,
      data: {
        public_id: row.public_id,
        code: row.code,
        plate: row.plate,
        brand: row.brand,
        vehicle_model: row.vehicle_model,
        color: row.color,
        phone: row.phone
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore recupero dati contatto.' });
  }
});






app.get('/owner-login-access/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();

    const result = await pool.query(
      `SELECT
         sc.code,
         sc.plate,
         COALESCE(NULLIF(sc.phone, ''), NULLIF(tr.phone, '')) AS phone
       FROM sticker_codes sc
       LEFT JOIN trial_requests tr
         ON tr.owner_access_token = sc.owner_access_token
       WHERE sc.owner_access_token = $1
       LIMIT 1`,
      [token]
    );

    if (!result.rows.length) {
      return res.redirect(302, '/owner-login.html');
    }

    const row = result.rows[0];

    const escapeAttr = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const loginPath = path.join(__dirname, 'public', 'owner-login.html');
    let html = fs.readFileSync(loginPath, 'utf8');

    const phoneValue = escapeAttr(row.phone || '');
    const plateValue = escapeAttr(row.plate || '');

    html = html.replace(
      /<input id="ownerPhone"([^>]*)>/,
      `<input id="ownerPhone"$1 value="${phoneValue}">`
    );

    html = html.replace(
      /<input id="ownerPlate"([^>]*)>/,
      `<input id="ownerPlate"$1 value="${plateValue}">`
    );

    html = html.replace(
      '<div id="ownerLoginResult"></div>',
      '<div id="ownerLoginResult">Dati veicolo recuperati. Controlla e conferma l’accesso.</div>'
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    console.error('owner-login-access render error:', err);
    return res.redirect(302, '/owner-login.html');
  }
});


app.get('/owner-access/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();

    const result = await pool.query(
      `SELECT
         sc.code,
         sc.plate,
         COALESCE(NULLIF(sc.phone, ''), NULLIF(tr.phone, '')) AS phone
       FROM sticker_codes sc
       LEFT JOIN trial_requests tr
         ON tr.owner_access_token = sc.owner_access_token
       WHERE sc.owner_access_token = $1
       LIMIT 1`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(404).send('Accesso non valido.');
    }

    const row = result.rows[0];

    const cookieOptions = {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      sameSite: 'Lax',
      secure: true
    };

    res.cookie('owner_saved_phone', String(row.phone || ''), cookieOptions);
    res.cookie('owner_saved_plate', String(row.plate || ''), cookieOptions);
    res.cookie('owner_saved_code', String(row.code || ''), cookieOptions);

    return res.redirect(302, `/owner-simple.html?code=${encodeURIComponent(row.code)}&plate=${encodeURIComponent(row.plate || '')}&ownerToken=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Errore di comunicazione con il server.');
  }
});


app.get('/renew/u/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      'SELECT public_id FROM sticker_codes WHERE public_id = $1 LIMIT 1',
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).send('Riferimento non trovato.');
    }

    return res.sendFile(require('path').join(__dirname, 'public', 'renew.html'));
  } catch (err) {
    console.error(err);
    return res.status(500).send('Errore di comunicazione con il server.');
  }
});

app.get('/api/public-renew/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();
    if (!publicId) {
      return res.status(400).json({ success: false, error: 'Public ID mancante.' });
    }

    const result = await pool.query(
      `SELECT code, public_id, plate, brand, vehicle_model, status, offered_by, plan_type, expires_at, activated_at
       FROM sticker_codes
       WHERE public_id = $1
       LIMIT 1`,
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Riferimento non trovato.' });
    }

    const row = result.rows[0];
    let days_left = null;
    let is_expired = false;

    if (row.expires_at) {
      const diffMs = new Date(row.expires_at).getTime() - Date.now();
      days_left = Math.floor(diffMs / 86400000);
      is_expired = diffMs < 0;
    }

    return res.json({
      success: true,
      data: {
        code: row.code,
        public_id: row.public_id,
        plate: row.plate,
        brand: row.brand,
        vehicle_model: row.vehicle_model,
        status: row.status,
        offered_by: row.offered_by || null,
        plan_type: row.plan_type,
        expires_at: row.expires_at,
        activated_at: row.activated_at,
        days_left,
        is_expired
      }
    });
  } catch (err) {
    console.error('public-renew error:', err);
    return res.status(500).json({ success: false, error: 'Errore lettura dati rinnovo.' });
  }
});

app.get('/feedback/u/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      'SELECT public_id FROM sticker_codes WHERE public_id = $1 LIMIT 1',
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).send('Riferimento non trovato.');
    }

    return res.sendFile(require('path').join(__dirname, 'public', 'feedback.html'));
  } catch (err) {
    console.error(err);
    return res.status(500).send('Errore di comunicazione con il server.');
  }
});

app.post('/api/public-feedback', async (req, res) => {
  try {
    const { public_id, reason, notes } = req.body || {};
    const publicId = String(public_id || '').trim().toUpperCase();

    if (!publicId) {
      return res.status(400).json({ success: false, error: 'Public ID mancante.' });
    }

    const found = await pool.query(
      `SELECT code, public_id, expires_at, feedback_bonus_used
       FROM sticker_codes
       WHERE public_id = $1
       LIMIT 1`,
      [publicId]
    );

    if (!found.rows.length) {
      return res.status(404).json({ success: false, error: 'Riferimento non trovato.' });
    }

    const row = found.rows[0];
    let bonusApplied = false;

    if (!row.feedback_bonus_used) {
      await pool.query(
        `UPDATE sticker_codes
         SET expires_at = CASE
           WHEN expires_at IS NULL OR expires_at < NOW() THEN NOW() + INTERVAL '1 month'
           ELSE expires_at + INTERVAL '1 month'
         END,
         feedback_bonus_used = TRUE
         WHERE public_id = $1`,
        [publicId]
      );
      bonusApplied = true;
    }

    await pool.query(
      `INSERT INTO renewal_feedback (code, public_id, reason, notes, bonus_applied)
       VALUES ($1,$2,$3,$4,$5)`,
      [row.code, row.public_id, reason || null, notes || null, bonusApplied]
    );

    return res.json({
      success: true,
      bonus_applied: bonusApplied
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore salvataggio feedback.' });
  }
});


app.get('/contact/u/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE public_id = $1 LIMIT 1',
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).send('Codice pubblico non trovato.');
    }

    const row = result.rows[0];

    if (String(row.status || '') === 'disabled') {
      return res.status(410).send('Adesivo non attivo.');
    }

    if (row.plan_type && row.plan_type !== 'always' && row.expires_at && new Date(row.expires_at) < new Date()) {
      if (row.public_id) {
        return res.redirect(302, `/renew/u/${encodeURIComponent(String(row.public_id).trim())}`);
      }
      return res.redirect(302, '/renew.html');
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || '').split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;
    const area = await lookupIpArea(ip);

    await pool.query(
      `INSERT INTO contact_page_views
       (code, plate, brand, vehicle_model, color, ip_address, ip_city, ip_region, ip_country, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.code || null,
        row.plate || null,
        row.brand || null,
        row.vehicle_model || null,
        row.color || null,
        ip,
        area.city,
        area.region,
        area.country,
        userAgent
      ]
    );

    try {
      const nowLabel = new Date().toLocaleString('it-IT');

      const insertedMessage = await pool.query(
        `INSERT INTO contact_message_logs
         (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, ip_address, ip_city, ip_region, ip_country, user_agent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8,$9,$10,$11,$12,NOW())
         RETURNING id`,
        [
          row.code || null,
          row.plate || null,
          row.brand || null,
          row.vehicle_model || null,
          row.color || null,
          'QR Visualizzato',
          `Data e ora: ${nowLabel}`,
          ip,
          area.city,
          area.region,
          area.country,
          userAgent
        ]
      );

      const insertedMessageId = insertedMessage.rows?.[0]?.id || null;

      const unreadRes = await pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM contact_message_logs
         WHERE code = $1
           AND deleted_at IS NULL
           AND read_at IS NULL`,
        [String(row.code || '').trim().toUpperCase()]
      );

      const unreadCount = unreadRes.rows[0]?.unread_count || 0;

      if (vapidPublicKey && vapidPrivateKey && row.code) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth
           FROM push_subscriptions
           WHERE code = $1
             AND is_active = TRUE
             AND receive_passenger_alerts = TRUE`,
          [String(row.code).trim().toUpperCase()]
        );

        const targetUrl = `/owner-simple.html?code=${encodeURIComponent(String(row.code).trim().toUpperCase())}&plate=${encodeURIComponent(String(row.plate || '').trim())}${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

        for (const sub of subs.rows || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              },
              JSON.stringify({
                title: 'QR Visualizzato',
                body: `Data e ora: ${nowLabel}`,
                url: targetUrl,
                targetUrl,
                messageId: insertedMessageId,
                unreadCount,
                channel: 'qr-view-alert'
              })
            );
          } catch (pushErr) {
            console.error('contact/u push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);
            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              try {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              } catch (cleanupErr) {
                console.error('contact/u push cleanup error:', cleanupErr);
              }
            }
          }
        }
      }
    } catch (notifyErr) {
      console.error('contact/u qr visualizzato error:', notifyErr);
    }

    return res.sendFile(require('path').join(__dirname, 'public', 'contact.html'));
  } catch (err) {
    console.error(err);
    return res.status(500).send('Errore di comunicazione con il server.');
  }
});



app.get('/contact-preview/u/:public_id', async (req, res) => {
  try {
    const publicId = String(req.params.public_id || '').trim().toUpperCase();

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE public_id = $1 LIMIT 1',
      [publicId]
    );

    if (!result.rows.length) {
      return res.status(404).send('Codice pubblico non trovato.');
    }

    const row = result.rows[0];

    if (String(row.status || '') === 'disabled') {
      return res.status(410).send('Adesivo non attivo.');
    }

    if (row.plan_type && row.plan_type !== 'always' && row.expires_at && new Date(row.expires_at) < new Date()) {
      if (row.public_id) {
        return res.redirect(302, `/renew/u/${encodeURIComponent(String(row.public_id).trim())}`);
      }
      return res.redirect(302, '/renew.html');
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || '').split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;
    const area = await lookupIpArea(ip);

    await pool.query(
      `INSERT INTO contact_page_views
       (code, plate, brand, vehicle_model, color, ip_address, ip_city, ip_region, ip_country, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.code || null,
        row.plate || null,
        row.brand || null,
        row.vehicle_model || null,
        row.color || null,
        ip,
        area.city,
        area.region,
        area.country,
        userAgent
      ]
    );

    try {
      const nowLabel = new Date().toLocaleString('it-IT');

      const insertedMessage = await pool.query(
        `INSERT INTO contact_message_logs
         (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, ip_address, ip_city, ip_region, ip_country, user_agent, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,$8,$9,$10,$11,$12,NOW())
         RETURNING id`,
        [
          row.code || null,
          row.plate || null,
          row.brand || null,
          row.vehicle_model || null,
          row.color || null,
          'QR Visualizzato',
          `Data e ora: ${nowLabel}`,
          ip,
          area.city,
          area.region,
          area.country,
          userAgent
        ]
      );

      const insertedMessageId = insertedMessage.rows?.[0]?.id || null;

      const unreadRes = await pool.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM contact_message_logs
         WHERE code = $1
           AND deleted_at IS NULL
           AND read_at IS NULL`,
        [String(row.code || '').trim().toUpperCase()]
      );

      const unreadCount = unreadRes.rows[0]?.unread_count || 0;

      if (vapidPublicKey && vapidPrivateKey && row.code) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth
           FROM push_subscriptions
           WHERE code = $1
             AND is_active = TRUE
             AND receive_passenger_alerts = TRUE`,
          [String(row.code).trim().toUpperCase()]
        );

        const targetUrl = `/owner-simple.html?code=${encodeURIComponent(String(row.code).trim().toUpperCase())}&plate=${encodeURIComponent(String(row.plate || '').trim())}${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

        for (const sub of subs.rows || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth
                }
              },
              JSON.stringify({
                title: 'QR Visualizzato',
                body: `Data e ora: ${nowLabel}`,
                url: targetUrl,
                targetUrl,
                messageId: insertedMessageId,
                channel: 'qr-view-alert'
              })
            );
          } catch (pushErr) {
            console.error('contact-preview/u push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);
            if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
              try {
                await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
              } catch (cleanupErr) {
                console.error('contact-preview/u push cleanup error:', cleanupErr);
              }
            }
          }
        }
      }
    } catch (notifyErr) {
      console.error('contact-preview/u qr visualizzato error:', notifyErr);
    }

    return res.sendFile(require('path').join(__dirname, 'public', 'contact-demo-owner.html'));
  } catch (err) {
    console.error(err);
    return res.status(500).send('Errore di comunicazione con il server.');
  }
});


app.get('/contact/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1 AND status = $2',
      [code, 'used']
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Codice non trovato o non attivo');
    }

    const row = result.rows[0];

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded ? String(forwarded).split(',')[0].trim() : req.socket.remoteAddress);

    await pool.query(
      'INSERT INTO qr_scans (code, user_agent, ip_address) VALUES ($1, $2, $3)',
      [code, req.headers['user-agent'] || null, ipAddress || null]
    );

    const cleanPhone = (row.phone || '').replace(/\D/g, '');
    const waText = encodeURIComponent(
      `Segnalazione urgente per il veicolo ${row.vehicle_model || ''} targa ${row.plate || ''}`
    );
    const redirectUrl = `/contact.html?phone=${encodeURIComponent(cleanPhone)}&plate=${encodeURIComponent(row.plate || '')}&brand=${encodeURIComponent(row.brand || '')}&vehicle=${encodeURIComponent(row.vehicle_model || '')}&color=${encodeURIComponent(row.color || '')}`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('contact error:', err);
    res.status(500).send('Errore interno');
  }
});

app.post('/api/admin/find-code', requireAdmin, async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }

    const result = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1',
      [code]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Codice non trovato' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('admin find error:', err);
    res.status(500).json({ success: false, message: 'Errore interno' });
  }
});

app.post('/api/admin/scan-stats', requireAdmin, async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }

    const scans = await pool.query(
      `SELECT id, code, scanned_at, user_agent, ip_address
       FROM qr_scans
       WHERE code = $1
       ORDER BY scanned_at DESC
       LIMIT 100`,
      [code]
    );

    const totals = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM qr_scans
       WHERE code = $1`,
      [code]
    );

    res.json({
      success: true,
      total: totals.rows[0].total,
      scans: scans.rows
    });
  } catch (err) {
    console.error('scan stats error:', err);
    res.status(500).json({ success: false, message: 'Errore interno' });
  }
});




app.post('/api/debug-fix-owner-device-roles-by-record', requireAdmin, async (req, res) => {
  try {
    const { code, public_id, plate, phone } = req.body || {};

    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPublicId = String(public_id || '').trim();
    const cleanPlateNorm = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanPhoneDigits = String(phone || '').replace(/\D/g, '');

    if (!cleanCode || !cleanPublicId || !cleanPlateNorm || !cleanPhoneDigits) {
      return res.status(400).json({ success: false, error: 'Dati record mancanti.' });
    }

    const vehicle = await pool.query(
      `SELECT code, public_id, plate, phone
       FROM sticker_codes
       WHERE code = $1
         AND public_id = $2
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $3
         AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = $4
       LIMIT 1`,
      [cleanCode, cleanPublicId, cleanPlateNorm, cleanPhoneDigits]
    );

    if (!vehicle.rows.length) {
      return res.status(404).json({ success: false, error: 'Record non trovato.' });
    }

    // Disattiva ruoli il cui endpoint non esiste più tra le push subscription attive.
    const ghostCleanup = await pool.query(
      `UPDATE owner_device_vehicle_roles r
       SET is_active = FALSE,
           is_primary = FALSE,
           updated_at = NOW()
       WHERE r.code = $1
         AND REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '') = $2
         AND NOT EXISTS (
           SELECT 1
           FROM push_subscriptions ps
           WHERE ps.endpoint = r.endpoint
             AND ps.code = r.code
             AND REPLACE(UPPER(COALESCE(ps.plate,'')), ' ', '') = REPLACE(UPPER(COALESCE(r.plate,'')), ' ', '')
             AND COALESCE(ps.is_active, TRUE) = TRUE
         )
       RETURNING id`,
      [cleanCode, cleanPlateNorm]
    );

    // Prende la subscription attiva più recente non invitata.
    const latestSub = await pool.query(
      `SELECT id, code, plate, endpoint
       FROM push_subscriptions
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
         AND COALESCE(is_active, TRUE) = TRUE
         AND invite_token IS NULL
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [cleanCode, cleanPlateNorm]
    );

    if (!latestSub.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna push subscription attiva trovata da promuovere.',
        ghost_roles_disabled: ghostCleanup.rowCount || 0
      });
    }

    const sub = latestSub.rows[0];

    // Azzera altri primary attivi per quel veicolo.
    await pool.query(
      `UPDATE owner_device_vehicle_roles
       SET is_primary = FALSE,
           updated_at = NOW()
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2`,
      [cleanCode, cleanPlateNorm]
    );

    // Promuove il ruolo del nuovo endpoint.
    const role = await pool.query(
      `INSERT INTO owner_device_vehicle_roles
       (code, plate, endpoint, is_primary, invite_token, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NULL, TRUE, NOW(), NOW())
       ON CONFLICT (code, plate, endpoint)
       DO UPDATE SET
         is_primary = TRUE,
         invite_token = NULL,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING id, code, plate, LEFT(endpoint, 80) AS endpoint_short, is_primary, is_active`,
      [cleanCode, cleanPlateNorm, sub.endpoint]
    );

    await pool.query(
      `UPDATE push_subscriptions
       SET is_primary = TRUE,
           receive_admin_alerts = TRUE,
           receive_passenger_alerts = TRUE,
           updated_at = NOW()
       WHERE endpoint = $1`,
      [sub.endpoint]
    );

    return res.json({
      success: true,
      ghost_roles_disabled: ghostCleanup.rowCount || 0,
      promoted_subscription_id: sub.id,
      promoted_role: role.rows[0]
    });
  } catch (err) {
    console.error('debug-fix-owner-device-roles-by-record error:', err);
    return res.status(500).json({ success: false, error: 'Errore fix ruoli record.' });
  }
});


app.post('/api/debug-owner-device-roles-by-record', requireAdmin, async (req, res) => {
  try {
    const { code, public_id, plate, phone } = req.body || {};

    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPublicId = String(public_id || '').trim();
    const cleanPlateNorm = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');
    const cleanPhoneDigits = String(phone || '').replace(/\D/g, '');

    if (!cleanCode || !cleanPublicId || !cleanPlateNorm || !cleanPhoneDigits) {
      return res.status(400).json({ success: false, error: 'Dati record mancanti.' });
    }

    const vehicle = await pool.query(
      `SELECT code, public_id, plate, phone, brand, vehicle_model, status
       FROM sticker_codes
       WHERE code = $1
         AND public_id = $2
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $3
         AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = $4
       LIMIT 1`,
      [cleanCode, cleanPublicId, cleanPlateNorm, cleanPhoneDigits]
    );

    if (!vehicle.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Record non trovato con code/public_id/targa/telefono indicati.'
      });
    }

    const codes = vehicle.rows.map(r => r.code);

    const pushSubs = await pool.query(
      `SELECT id, code, plate,
              LEFT(endpoint, 80) AS endpoint_short,
              is_primary,
              receive_admin_alerts,
              receive_passenger_alerts,
              is_active,
              invite_token,
              updated_at,
              last_seen_at
       FROM push_subscriptions
       WHERE code = ANY($1::text[])
       ORDER BY code, id DESC
       LIMIT 100`,
      [codes]
    );

    const roles = await pool.query(
      `SELECT id, code, plate,
              LEFT(endpoint, 80) AS endpoint_short,
              is_primary,
              invite_token,
              is_active,
              created_at,
              updated_at
       FROM owner_device_vehicle_roles
       WHERE code = ANY($1::text[])
       ORDER BY code, is_primary DESC, is_active DESC, updated_at DESC, id DESC
       LIMIT 100`,
      [codes]
    );

    const invites = await pool.query(
      `SELECT id, code, plate, invite_token, status,
              created_at, sent_at, opened_at, used_at, revoked_at, expires_at,
              LEFT(used_endpoint, 80) AS used_endpoint_short
       FROM owner_invites
       WHERE code = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT 100`,
      [codes]
    );

    return res.json({
      success: true,
      vehicle: vehicle.rows,
      push_subscriptions: pushSubs.rows,
      owner_device_vehicle_roles: roles.rows,
      owner_invites: invites.rows
    });
  } catch (err) {
    console.error('debug-owner-device-roles-by-record error:', err);
    return res.status(500).json({ success: false, error: 'Errore diagnostica record.' });
  }
});


app.post('/api/admin/debug-owner-device-roles', requireAdmin, async (req, res) => {
  try {
    const { code, plate } = req.body || {};
    const cleanCode = String(code || '').trim().toUpperCase();
    const cleanPlateNorm = String(plate || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!cleanCode && !cleanPlateNorm) {
      return res.status(400).json({ success: false, error: 'Inserisci code o plate.' });
    }

    const vehicle = await pool.query(
      `SELECT code, plate, brand, vehicle_model, status
       FROM sticker_codes
       WHERE ($1 = '' OR code = $1)
         AND ($2 = '' OR REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2)
       ORDER BY id DESC
       LIMIT 10`,
      [cleanCode, cleanPlateNorm]
    );

    const codes = vehicle.rows.map(r => r.code);

    const pushSubs = codes.length ? await pool.query(
      `SELECT id, code, plate, endpoint,
              is_primary, receive_admin_alerts, receive_passenger_alerts,
              is_active, invite_token, updated_at, last_seen_at,
              LEFT(endpoint, 70) AS endpoint_short
       FROM push_subscriptions
       WHERE code = ANY($1::text[])
       ORDER BY code, id DESC
       LIMIT 100`,
      [codes]
    ) : { rows: [] };

    const roles = codes.length ? await pool.query(
      `SELECT id, code, plate, endpoint,
              is_primary, invite_token, is_active,
              created_at, updated_at,
              LEFT(endpoint, 70) AS endpoint_short
       FROM owner_device_vehicle_roles
       WHERE code = ANY($1::text[])
       ORDER BY code, is_primary DESC, is_active DESC, updated_at DESC, id DESC
       LIMIT 100`,
      [codes]
    ) : { rows: [] };

    const invites = codes.length ? await pool.query(
      `SELECT id, code, plate, invite_token, status,
              created_at, sent_at, opened_at, used_at, revoked_at, expires_at,
              LEFT(used_endpoint, 70) AS used_endpoint_short
       FROM owner_invites
       WHERE code = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT 100`,
      [codes]
    ) : { rows: [] };

    return res.json({
      success: true,
      vehicle: vehicle.rows,
      push_subscriptions: pushSubs.rows,
      owner_device_vehicle_roles: roles.rows,
      owner_invites: invites.rows
    });
  } catch (err) {
    console.error('debug-owner-device-roles error:', err);
    return res.status(500).json({ success: false, error: 'Errore diagnostica ruoli.' });
  }
});


app.post('/api/admin/reactivate-code', requireAdmin, async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Non autorizzato' });
    }

    await pool.query(
      `UPDATE sticker_codes
       SET status = 'reactivated', brand = NULL, plate = NULL, vehicle_model = NULL, color = NULL, phone = NULL, qr_url = NULL,
           activated_at = NULL,
           reactivated_at = NOW()
       WHERE code = $1`,
      [code]
    );

    res.json({ success: true, message: 'Codice riattivato' });
  } catch (err) {
    console.error('admin reactivate error:', err);
    res.status(500).json({ success: false, message: 'Errore interno' });
  }
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sticker_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'new',
        plate VARCHAR(20),
        vehicle_model VARCHAR(100),
        phone VARCHAR(30),
        qr_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        activated_at TIMESTAMP,
        reactivated_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_scans (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL,
        scanned_at TIMESTAMP DEFAULT NOW(),
        user_agent TEXT,
        ip_address TEXT
      );
    `);

    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS brand TEXT");
    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS color TEXT");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abuse_blocks (
        id SERIAL PRIMARY KEY,
        code TEXT,
        plate TEXT,
        block_type TEXT NOT NULL,
        block_value TEXT NOT NULL,
        reason TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_delivery_logs (
        id SERIAL PRIMARY KEY,
        code TEXT,
        plate TEXT,
        endpoint TEXT,
        channel TEXT,
        status TEXT,
        error_text TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicle_service_data (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        plate TEXT NOT NULL,
        first_registration_date DATE,
        last_review_date DATE,
        next_review_date DATE,
        insurance_expiry_date DATE,
        tax_expiry_date DATE,
        tires_expiry_date DATE,
        service_expiry_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(code, plate)
      );
    `);

    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trial_requests (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        plate TEXT NOT NULL,
        brand TEXT NOT NULL,
        vehicle_model TEXT NOT NULL,
        color TEXT,
        notes TEXT,
        privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
        marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
        source_page TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS code TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS public_id TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS owner_access_token TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS generated_at TIMESTAMP");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS otp_code TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS otp_sent_at TIMESTAMP");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMP");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS otp_status TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS phone_whatsapp TEXT");
    await pool.query("ALTER TABLE trial_requests ADD COLUMN IF NOT EXISTS privacy_version TEXT");

    console.log('Tabella sticker_codes pronta');
    console.log('Tabella qr_scans pronta');
    console.log('Tabella abuse_blocks pronta');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blocked_attempt_logs (
        id BIGSERIAL PRIMARY KEY,
        code TEXT,
        plate TEXT,
        public_flow TEXT,
        block_id BIGINT,
        matched_block_type TEXT,
        matched_block_value TEXT,
        matched_reason TEXT,
        ip_address TEXT,
        ip_city TEXT,
        ip_region TEXT,
        ip_country TEXT,
        sender_phone TEXT,
        reason TEXT,
        message_text TEXT,
        location_shared BOOLEAN DEFAULT FALSE,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        maps_url TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_blocked_attempt_logs_code_plate_created
      ON blocked_attempt_logs (code, plate, created_at DESC)
    `);

    console.log('Tabella blocked_attempt_logs pronta');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_invites (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        plate TEXT NOT NULL,
        invite_token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by_endpoint TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        opened_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        used_endpoint TEXT,
        user_agent TEXT
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_invites_code_plate_created
      ON owner_invites (code, plate, created_at DESC)
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS followme_projects (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        public_id TEXT UNIQUE NOT NULL,
        label TEXT,
        owner_name TEXT,
        owner_email TEXT,
        owner_phone TEXT,
        active_url TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS followme_url_history (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES followme_projects(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        activated_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        scan_count INTEGER DEFAULT 0,
        UNIQUE(project_id, url)
      )
    `);



    await pool.query("ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS existing_qr_url TEXT");
    await pool.query("ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS existing_qr_status TEXT");
    await pool.query("ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS existing_qr_updated_at TIMESTAMPTZ");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS followme_push_subscriptions (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES followme_projects(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(project_id, endpoint)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS followme_scan_logs (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES followme_projects(id) ON DELETE CASCADE,
        url TEXT,
        ip_address TEXT,
        user_agent TEXT,
        referrer TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'vehicle'");

    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS invite_token TEXT");
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS invited_by_endpoint TEXT");
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS app_saved_detected BOOLEAN DEFAULT FALSE");
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS app_saved_detected_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ");

    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS owner_app_detected_at TIMESTAMPTZ");
    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS owner_app_is_standalone BOOLEAN DEFAULT FALSE");
    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS owner_app_user_agent TEXT");
    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS owner_app_platform TEXT");
    await pool.query("ALTER TABLE sticker_codes ADD COLUMN IF NOT EXISTS owner_app_browser TEXT");


    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_device_vehicle_roles (
        id BIGSERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        plate TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        invite_token TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(code, plate, endpoint)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_device_vehicle_roles_code_plate
      ON owner_device_vehicle_roles (code, plate, is_active)
    `);

    console.log('Tabella owner_device_vehicle_roles pronta');

    console.log('Tabella owner_invites pronta');

    console.log('Tabella push_delivery_logs pronta');
    await pool.query(`
      ALTER TABLE sticker_codes
      ADD COLUMN IF NOT EXISTS offered_by TEXT
    `);

    console.log('Tabella vehicle_service_data pronta');
  } catch (err) {
    console.error('Errore init DB:', err);
    throw err;
  }
}

async function startServer() {
  try {
    validateRuntimeEnv();
    await initDb();
    


// TEST PUSH SCADENZA - solo Audi A8 EY 018 SW
app.post('/api/test/deadline-push-ey018sw', async (req, res) => {
  try {
    const cleanPlate = 'EY018SW';

    const vehicleResult = await pool.query(
      `SELECT code, plate, brand, vehicle_model, color
       FROM sticker_codes
       WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
       ORDER BY activated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      [cleanPlate]
    );

    if (!vehicleResult.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Veicolo EY 018 SW non trovato.'
      });
    }

    const vehicle = vehicleResult.rows[0];
    const cleanCode = String(vehicle.code || '').trim().toUpperCase();
    const dbPlate = String(vehicle.plate || 'EY 018 SW').trim();

    const messageText = [
      'AVVISO SCADENZA',
      '',
      'Promemoria: una scadenza importante richiede attenzione.',
      '',
      'Comandi disponibili: Ricordamelo ancora, OK fatto, Cancella.'
    ].join('\n');

    const inserted = await pool.query(
      `INSERT INTO contact_message_logs
       (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW())
       RETURNING id`,
      [
        cleanCode,
        dbPlate,
        vehicle.brand || 'Audi',
        vehicle.vehicle_model || 'A8',
        vehicle.color || null,
        'AVVISO SCADENZA',
        messageText
      ]
    );

    const insertedMessageId = inserted.rows[0]?.id || null;

    const unreadRes = await pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM contact_message_logs
       WHERE code = $1
         AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
         AND read_at IS NULL
         AND deleted_at IS NULL`,
      [cleanCode, cleanPlate]
    );

    const unreadCount = unreadRes.rows[0]?.unread_count || 0;

    const ownerUrl =
      `/owner-app/${encodeURIComponent(cleanCode)}/${encodeURIComponent(cleanPlate)}` +
      `?focus=messages&from=deadline_alert${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}`;

    const payload = JSON.stringify({
      title: 'AVVISO SCADENZA',
      body: 'Hai una nuova scadenza da controllare nella tua App veicolo.',
      url: ownerUrl,
      targetUrl: ownerUrl,
      tag: 'deadline-alert-ey018sw-' + Date.now(),
      type: 'deadline_alert',
      unreadCount,
      messageId: insertedMessageId,
      badge: '/icons/icon-192.png',
      icon: '/icons/icon-192.png',
      requireInteraction: true,
      data: {
        type: 'deadline_alert',
        plate: 'EY 018 SW',
        messageId: insertedMessageId,
        unreadCount,
        url: ownerUrl,
        targetUrl: ownerUrl
      }
    });

    let subsResult;
    try {
      subsResult = await pool.query(
        `SELECT id, endpoint, p256dh, auth
         FROM push_subscriptions
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         ORDER BY id DESC`,
        [cleanPlate]
      );
    } catch (e) {
      subsResult = await pool.query(
        `SELECT id, push_endpoint AS endpoint, push_p256dh AS p256dh, push_auth AS auth
         FROM owner_device_vehicle_roles
         WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
           AND COALESCE(push_endpoint,'') <> ''
         ORDER BY is_primary DESC, id DESC`,
        [cleanPlate]
      );
    }

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const row of subsResult.rows) {
      try {
        const endpoint = row.endpoint;
        const p256dh = row.p256dh;
        const auth = row.auth;

        if (!endpoint || !p256dh || !auth) {
          failed += 1;
          errors.push({ id: row.id, error: 'Subscription incompleta.' });
          continue;
        }

        const subscription = {
          endpoint,
          keys: { p256dh, auth }
        };

        await webpush.sendNotification(subscription, payload);
        sent += 1;
      } catch (err) {
        failed += 1;
        errors.push({
          id: row.id,
          error: err && err.message ? err.message : String(err)
        });
      }
    }

    return res.json({
      success: true,
      title: 'AVVISO SCADENZA',
      plate: 'EY 018 SW',
      inserted_message_id: insertedMessageId,
      unread_count: unreadCount,
      push_subscriptions_found: subsResult.rows.length,
      sent,
      failed,
      errors,
      targetUrl: ownerUrl
    });
  } catch (err) {
    console.error('deadline push error:', err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  }
});






// =====================================================
// OWNER DEADLINES - SYNC + SCHEDULER PUSH
// Prima versione: sincronizza le scadenze dal browser al server
// e invia AVVISO SCADENZA su App principale quando un avviso è dovuto.
// =====================================================

async function ensureOwnerDeadlinesTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_deadline_items (
      id SERIAL PRIMARY KEY,
      code TEXT,
      plate TEXT,
      plate_norm TEXT,
      local_id TEXT,
      payload JSONB NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (plate_norm, local_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS owner_deadline_alert_sent (
      id SERIAL PRIMARY KEY,
      plate_norm TEXT NOT NULL,
      local_id TEXT NOT NULL,
      alert_key TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT NOW(),
      message_id INTEGER,
      UNIQUE (plate_norm, local_id, alert_key)
    )
  `);

  await pool.query(`
    ALTER TABLE sticker_codes
    ADD COLUMN IF NOT EXISTS enable_deadline_message_cleanup BOOLEAN DEFAULT FALSE
  `);

  console.log('Tabelle owner_deadline_items / owner_deadline_alert_sent pronte');
}

function normalizePlateValue(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getRomeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});

  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minuteKey: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  };
}

function parseDateOnlyLocal(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function daysBetweenDateKeys(targetDateStr) {
  const nowParts = getRomeParts(new Date());
  const today = new Date(nowParts.y, nowParts.m - 1, nowParts.d, 12, 0, 0);
  const target = parseDateOnlyLocal(targetDateStr);
  if (!target) return null;
  return Math.round((target - today) / 86400000);
}

function parseAlertDays(alertText) {
  const t = String(alertText || '').toLowerCase();

  if (t.includes('giorno stesso') || t.includes('giorno scadenza')) return 0;

  const m = t.match(/(\d+)\s+giorn/);
  if (m && t.includes('prima')) return Number(m[1]);

  return null;
}

function shouldSendDeadlineAlert(payload, now = new Date()) {
  if (!payload || payload.status === 'deleted' || payload.status === 'completed' || payload.status === 'disabled') return null;

  const localId = String(payload.id || payload.local_id || '').trim();
  if (!localId) return null;

  const name = String(payload.name || 'Scadenza').trim();
  const type = String(payload.type || '').trim();
  const category = String(payload.category || '').trim();

  // 1) FARMACI OGNI X MINUTI: verifica reale e rapido
  if (
    type === 'Medicine' &&
    payload.extra &&
    payload.extra.medicineMode === 'every_x_minutes'
  ) {
    const interval = Math.max(1, Number(payload.extra.medicineIntervalMinutes || 5));
    const duration = Math.max(interval, Number(payload.extra.medicineDurationMinutes || 30));

    const start = payload.createdAt ? new Date(payload.createdAt) : new Date();
    if (Number.isNaN(start.getTime())) return null;

    const elapsedMs = now.getTime() - start.getTime();
    if (elapsedMs < interval * 60000) return null;
    if (elapsedMs > duration * 60000) return null;

    const slot = Math.floor(elapsedMs / (interval * 60000));
    const alertKey = `medicine-minutes-${localId}-${interval}-${slot}`;

    return {
      alertKey,
      title: 'AVVISO SCADENZA',
      reason: 'AVVISO SCADENZA',
      messageText:
        'AVVISO SCADENZA\n\n' +
        `Promemoria farmaco: ${name}.\n\n` +
        `Programmazione: ogni ${interval} minuti per ${duration} minuti.\n\n` +
        'Comandi disponibili: Ricordamelo ancora, OK fatto, Cancella.',
      body: `Promemoria farmaco: ${name}.`
    };
  }


  // 2) RICHIAMI PROMEMORIA RAPIDI: ripeti finché non confermo.
  // Questo blocco deve stare PRIMA del primo avviso rapido:
  // dopo il primo intervallo deve generare quick-repeat, non continuare a restituire quick-due già inviato.
  if (
    payload.extra &&
    payload.extra.quickReminder === true &&
    payload.extra.dueAt &&
    payload.extra.repeatUntilHandled === true
  ) {
    const due = new Date(payload.extra.dueAt);
    if (!Number.isNaN(due.getTime()) && now.getTime() >= due.getTime()) {
      const value = Math.max(1, Number(payload.extra.repeatIntervalValue || 5));
      const unit = String(payload.extra.repeatIntervalUnit || 'minutes');

      let intervalMs = value * 60000;
      if (unit === 'hours') intervalMs = value * 3600000;
      if (unit === 'days') intervalMs = value * 86400000;

      const elapsed = now.getTime() - due.getTime();

      if (elapsed >= intervalMs) {
        const slot = Math.floor(elapsed / intervalMs);

        if (slot >= 1) {
          const alertKey = `quick-repeat-${localId}-${intervalMs}-${slot}`;

          return {
            alertKey,
            localId,
            deadlineId: localId,
            title: name || 'PROMEMORIA IMPORTANTE',
            reason: name || 'Promemoria rapido',
            messageText:
              `${name}\n\n` +
              `Richiamo automatico: ogni ${value} ${unit === 'hours' ? 'ore' : unit === 'days' ? 'giorni' : 'minuti'} finché non lo segni come fatto o lo cancelli.\n\n` +
              'Comandi disponibili: Ricordamelo ancora, OK fatto, Cancella.',
            body: `${name}: promemoria ancora attivo.`
          };
        }
      }
    }
  }

  // 2) PROMEMORIA RAPIDI: usa extra.dueAt come orario reale del promemoria
  // Esempi gestiti:
  // - Tra 10 minuti
  // - Oggi alle 10:00
  // - Domani alle 09:00
  // - Data scelta + ora
  if (
    payload.extra &&
    payload.extra.quickReminder === true &&
    payload.extra.dueAt
  ) {
    const due = new Date(payload.extra.dueAt);
    if (Number.isNaN(due.getTime())) return null;

    if (now.getTime() < due.getTime()) return null;

    const alertKey = `quick-due-${localId}`;

    const whenLabel = payload.extra.quickWhenMode === 'absolute'
      ? String(payload.notes || '').replace(/^Promemoria rapido:\s*/i, '').split('.')[0]
      : String(payload.notes || '').replace(/^Promemoria rapido:\s*/i, '').split('.')[0];

    return {
      alertKey,
      localId,
      deadlineId: localId,
      title: name || 'PROMEMORIA IMPORTANTE',
      reason: name || 'Promemoria rapido',
      messageText:
        `${name}\n\n` +
        (whenLabel ? `Quando: ${whenLabel}\n\n` : '') +
        'Comandi disponibili: Ricordamelo ancora, OK fatto, Cancella.',
      body: `${name}`
    };
  }

  // 2) SCADENZE STANDARD: giorno stesso / X giorni prima
  const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];
  const daysLeft = daysBetweenDateKeys(payload.date);
  if (daysLeft === null) return null;

  for (const a of alerts) {
    const beforeDays = parseAlertDays(a);
    if (beforeDays === null) continue;

    if (daysLeft === beforeDays) {
      const preferredTime = String(payload.time || '09:00');
      const [hh, mm] = preferredTime.split(':').map(Number);
      const nowParts = getRomeParts(now);

      // invia dal minuto impostato in poi, una sola volta al giorno per quel tipo avviso
      if (
        Number.isFinite(hh) &&
        Number.isFinite(mm) &&
        (nowParts.hh < hh || (nowParts.hh === hh && nowParts.mm < mm))
      ) {
        continue;
      }

      const alertKey = `date-${localId}-${nowParts.dateKey}-${beforeDays}`;

      return {
        alertKey,
        localId,
        deadlineId: localId,
        title: 'AVVISO SCADENZA',
        reason: 'AVVISO SCADENZA',
        messageText:
          'AVVISO SCADENZA\n\n' +
          `${name}\n\n` +
          `Categoria: ${category || 'Scadenza'}\n` +
          `Tipo: ${type || 'Promemoria'}\n` +
          `Avviso programmato: ${a}\n\n` +
          'Comandi disponibili: Ricordamelo ancora, OK fatto, Cancella.',
        body: `${name}: ${a}.`
      };
    }
  }

  return null;
}

async function resolveVehicleByPlateNorm(plateNorm) {
  const r = await pool.query(
    `SELECT code, plate, brand, vehicle_model, color
     FROM sticker_codes
     WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
     ORDER BY activated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [plateNorm]
  );

  return r.rows[0] || null;
}

async function insertOwnerMessageAndPushDeadline({ vehicle, plateNorm, alert }) {
  const cleanCode = String(vehicle.code || '').trim().toUpperCase();
  const dbPlate = String(vehicle.plate || plateNorm).trim();

  const inserted = await pool.query(
    `INSERT INTO contact_message_logs
     (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW())
     RETURNING id`,
    [
      cleanCode,
      dbPlate,
      vehicle.brand || null,
      vehicle.vehicle_model || null,
      vehicle.color || null,
      alert.reason || 'AVVISO SCADENZA',
      alert.messageText
    ]
  );

  const insertedMessageId = inserted.rows[0]?.id || null;

  const unreadRes = await pool.query(
    `SELECT COUNT(*)::int AS unread_count
     FROM contact_message_logs
     WHERE code = $1
       AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2
       AND read_at IS NULL
       AND deleted_at IS NULL`,
    [cleanCode, plateNorm]
  );

  const unreadCount = unreadRes.rows[0]?.unread_count || 0;

  const deadlineId = alert.localId || alert.deadlineId || '';

  const ownerUrl =
    `/owner-app/${encodeURIComponent(cleanCode)}/${encodeURIComponent(plateNorm)}` +
    `?focus=messages&from=deadline_alert` +
    `${insertedMessageId ? `&messageId=${encodeURIComponent(insertedMessageId)}` : ''}` +
    `${deadlineId ? `&deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;

  const payload = JSON.stringify({
    title: alert.title || 'PROMEMORIA IMPORTANTE',
    body: alert.body || 'Hai una scadenza importante da controllare nella tua App veicolo.',
    url: ownerUrl,
    targetUrl: ownerUrl,

    // Tag stabile per questo avviso: se viene reinviato, aggiorna/renotifica invece di creare confusione.
    tag: alert.alertKey ? `deadline-alert-${plateNorm}-${alert.alertKey}` : 'deadline-alert-' + plateNorm + '-' + Date.now(),

    type: 'deadline_alert',
    unreadCount,
    messageId: insertedMessageId,
    badge: '/icons/icon-192.png',
    icon: '/icons/icon-192.png',

    // Massima insistenza consentita dal browser/sistema operativo.
    requireInteraction: true,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [220, 120, 220, 120, 320],

    data: {
      type: 'deadline_alert',
      priority: 'high',
      persistent: true,
      requireInteraction: true,
      plate: dbPlate,
      messageId: insertedMessageId,
      unreadCount,
      url: ownerUrl,
      targetUrl: ownerUrl,
      deadlineId: alert.localId || alert.deadlineId || null,
      alertKey: alert.alertKey || null
    }
  });

  let subsResult;
  try {
    subsResult = await pool.query(
      `SELECT id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
       ORDER BY id DESC`,
      [plateNorm]
    );
  } catch (e) {
    subsResult = await pool.query(
      `SELECT id, push_endpoint AS endpoint, push_p256dh AS p256dh, push_auth AS auth
       FROM owner_device_vehicle_roles
       WHERE REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $1
         AND COALESCE(push_endpoint,'') <> ''
       ORDER BY is_primary DESC, id DESC`,
      [plateNorm]
    );
  }

  let sent = 0;
  let failed = 0;

  for (const row of subsResult.rows) {
    try {
      if (!row.endpoint || !row.p256dh || !row.auth) {
        failed += 1;
        continue;
      }

      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth
          }
        },
        payload
      );

      sent += 1;
    } catch (err) {
      failed += 1;
      console.error('deadline push send error:', err.statusCode || '', err.body || err.message || err);
    }
  }

  return { messageId: insertedMessageId, unreadCount, sent, failed };
}



function normalizeFollowMeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeFollowMePublicId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeUrlForFollowMe(value) {
  let url = String(value || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function makeFollowMeCode() {
  return 'FM-' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

function makeFollowMePublicId() {
  return 'FM' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function sendFollowMeScanPush(project) {
  try {
    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM followme_push_subscriptions
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [project.id]
    );

    const payload = JSON.stringify({
      title: "Follow Me QR 👀",
      body: "Hanno appena inquadrato il tuo QR 👀",
      url: `/fm/app/${encodeURIComponent(project.code)}?focus=scans`,
      targetUrl: `/fm/app/${encodeURIComponent(project.code)}?focus=scans`,
      type: 'followme_scan',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      timestamp: Date.now(),
      data: {
        type: 'followme_scan',
        code: project.code,
        url: `/fm/app/${encodeURIComponent(project.code)}?focus=scans`
      }
    });

    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload
        );
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        } else {
          console.error('followme push error:', err.statusCode || '', err.body || err.message || err);
        }
      }
    }
  } catch (err) {
    console.error('sendFollowMeScanPush error:', err.message || err);
  }
}


app.get('/fm/manifest/:code.json', async (req, res) => {
  try {
    const rawCode = String(req.params.code || 'FOLLOWME').trim();
    const cleanCode = rawCode.replace(/[^a-z0-9_-]/gi, '').toUpperCase() || 'FOLLOWME';

    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.json({
      name: 'FollowMe QR',
      short_name: 'FollowMe QR',
      description: 'Follow Me - QR dinamico',
      start_url: `/fm/app/${encodeURIComponent(cleanCode)}?source=pwa&v=followme-dynamic-qr-v5`,
      scope: '/fm/',
      display: 'standalone',
      background_color: '#101820',
      theme_color: '#101820',
      orientation: 'portrait',
      icons: [
        {
          src: '/images/followme/icons/followme-icon-192.png?v=followme-dynamic-qr-v5',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: '/images/followme/icons/followme-icon-512.png?v=followme-dynamic-qr-v5',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    });
  } catch (err) {
    console.error('followme manifest error:', err);
    return res.status(500).json({ error: 'manifest_error' });
  }
});


app.get('/fm/app/:code', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  try {
    const code = normalizeFollowMeCode(req.params.code);
    const fs = require('fs');
    const filePath = require('path').join(__dirname, 'public', 'followme-app.html');

    let html = fs.readFileSync(filePath, 'utf8');

    const projectRes = await pool.query(
      `SELECT id, code, public_id, label, active_url, status
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.send(html);
    }

    const project = projectRes.rows[0];
    const activeUrl = String(project.active_url || '').trim().replace(/\/+$/, '');

    const statsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_scans,
         COUNT(*) FILTER (WHERE COALESCE(url,'') = COALESCE($2,''))::int AS current_url_scans
       FROM followme_scan_logs
       WHERE project_id = $1`,
      [project.id, project.active_url || '']
    );

    const historyRes = await pool.query(
      `SELECT url, activated_at, last_used_at, scan_count
       FROM followme_url_history
       WHERE project_id = $1
       ORDER BY
         CASE WHEN regexp_replace(COALESCE(url,''), '/+$', '') = $2 THEN 0 ELSE 1 END,
         activated_at DESC NULLS LAST,
         last_used_at DESC NULLS LAST
       LIMIT 10`,
      [project.id, activeUrl]
    );

    const esc = (v) => String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const clean = (v) => String(v || '').trim().replace(/\/+$/, '');

    const formatDateIt = (v) => {
      if (!v) return 'mai';
      try {
        return new Date(v).toLocaleString('it-IT');
      } catch (e) {
        return 'mai';
      }
    };

    const historyHtml = historyRes.rows.length
      ? historyRes.rows.map((x) => {
          const url = String(x.url || '');
          const isActive = clean(url) === activeUrl;
          const scans = Number(x.scan_count || 0);
          const last = formatDateIt(x.last_used_at);
          const encoded = encodeURIComponent(url);

          return `
        <div class="history-item${isActive ? ' history-row-active' : ''}">
          <div>
            <strong>${esc(url)}</strong>
            <span>${scans} scansioni · ultimo uso: ${esc(last)}</span>
          </div>
          ${
            isActive
              ? `<button class="btn-history-active-now" type="button" disabled>Attivo ora</button>`
              : `<button class="btn small secondary" type="button" onclick="reactivateUrl('${encoded}')">Attivalo</button>`
          }
        </div>`;
        }).join('')
      : `<div class="empty">Nessun link ancora registrato.</div>`;

    const stats = statsRes.rows[0] || { total_scans: 0, current_url_scans: 0 };

    html = html.replace(
      /<strong id="totalScans">[\s\S]*?<\/strong>/,
      `<strong id="totalScans">${Number(stats.total_scans || 0)}</strong>`
    );

    html = html.replace(
      /<strong id="currentScans">[\s\S]*?<\/strong>/,
      `<strong id="currentScans">${Number(stats.current_url_scans || 0)}</strong>`
    );

    html = html.replace(
      /<div class="history" id="historyList">[\s\S]*?<\/div>\s*<\/section>/,
      `<div class="history" id="historyList">${historyHtml}
      </div>
    </section>`
    );

    const previewUrl = String(project.active_url || '').trim();
    const previewUrlEsc = esc(previewUrl);

    if (previewUrl) {
      html = html.replace(
        /<iframe id="simpleDestinationPreviewFrame" src="[^"]*" loading="lazy"><\/iframe>/,
        `<iframe id="simpleDestinationPreviewFrame" src="${previewUrlEsc}" loading="lazy"></iframe>`
      );

      html = html.replace(
        /<div class="simple-preview-empty" id="simpleDestinationPreviewEmpty">[\s\S]*?<\/div>/,
        `<div class="simple-preview-empty" id="simpleDestinationPreviewEmpty" style="display:none;">Imposta una destinazione per vedere cosa stai trasmettendo.</div>`
      );

      html = html.replace(
        /<a class="btn secondary simple-preview-open" id="simpleDestinationPreviewOpen" href="[^"]*" target="_blank" rel="noopener">/,
        `<a class="btn secondary simple-preview-open" id="simpleDestinationPreviewOpen" href="${previewUrlEsc}" target="_blank" rel="noopener">`
      );
    }

    return res.send(html);
  } catch (err) {
    console.error('fm/app server-side history error:', err);
    return res.sendFile(path.join(__dirname, 'public', 'followme-app.html'));
  }
});

app.get('/fm/u/:public_id', async (req, res) => {
  try {
    const publicId = normalizeFollowMePublicId(req.params.public_id);

    const q = await pool.query(
      `SELECT *
       FROM followme_projects
       WHERE public_id = $1
         AND COALESCE(status,'active') = 'active'
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) {
      return res.status(404).send('Follow Me QR non trovato.');
    }

    const project = q.rows[0];
    const activeUrl = normalizeUrlForFollowMe(project.active_url);

    await pool.query(
      `INSERT INTO followme_scan_logs
       (project_id, url, ip_address, user_agent, referrer)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        project.id,
        activeUrl || null,
        req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
        req.headers['user-agent'] || null,
        req.headers['referer'] || req.headers['referrer'] || null
      ]
    );

    if (activeUrl) {
      await pool.query(
        `INSERT INTO followme_url_history
         (project_id, url, activated_at, last_used_at, scan_count)
         VALUES ($1,$2,NOW(),NOW(),1)
         ON CONFLICT (project_id, url)
         DO UPDATE SET
           last_used_at = NOW(),
           scan_count = COALESCE(followme_url_history.scan_count,0) + 1`,
        [project.id, activeUrl]
      );
    }

    sendFollowMeScanPush(project).catch(() => {});

    if (!activeUrl) {
      return res.send(`
        <!doctype html>
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Follow Me QR</title>
        <style>body{font-family:Arial,sans-serif;background:#0d0d14;color:#fff;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}h1{font-size:42px;margin:0}p{color:#aaa;line-height:1.4}</style>
        </head><body><div><h1>Follow Me</h1><p>Questo QR non ha ancora una destinazione attiva.</p></div></body></html>
      `);
    }

    return res.redirect(302, activeUrl);
  } catch (err) {
    console.error('fm/u error:', err);
    return res.status(500).send('Errore Follow Me QR.');
  }
});


async function cleanupFollowMeUrlHistory(projectId, activeUrl) {
  try {
    const normalizedActiveUrl = normalizeUrlForFollowMe(activeUrl || '');

    /*
      Regola storico FollowMe:
      - massimo 20 destinazioni memorizzate per progetto
      - non eliminare mai l'URL attualmente attivo
      - se ci sono più di 20 record, elimina prima quelli meno utili:
        1) meno scansioni
        2) mai usati / usati meno recentemente
        3) attivati da più tempo
    */
    await pool.query(
      `WITH overflow AS (
         SELECT GREATEST(COUNT(*) - 20, 0)::int AS excess
         FROM followme_url_history
         WHERE project_id = $1
       ),
       candidates AS (
         SELECT id
         FROM followme_url_history
         WHERE project_id = $1
           AND LOWER(TRIM(url)) <> LOWER(TRIM($2))
         ORDER BY
           COALESCE(scan_count, 0) ASC,
           last_used_at ASC NULLS FIRST,
           activated_at ASC NULLS FIRST,
           id ASC
         LIMIT (SELECT excess FROM overflow)
       )
       DELETE FROM followme_url_history
       WHERE id IN (SELECT id FROM candidates)`,
      [projectId, normalizedActiveUrl]
    );
  } catch (err) {
    console.error('cleanupFollowMeUrlHistory error:', err);
  }
}


app.get('/api/followme/:code/status', async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);

    const q = await pool.query(
      `SELECT *
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    const project = q.rows[0];

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM followme_scan_logs
       WHERE project_id = $1`,
      [project.id]
    );

    const currentRes = await pool.query(
      `SELECT COALESCE(scan_count,0)::int AS scans
       FROM followme_url_history
       WHERE project_id = $1 AND url = $2
       LIMIT 1`,
      [project.id, normalizeUrlForFollowMe(project.active_url)]
    );

    const hist = await pool.query(
      `SELECT url, activated_at, last_used_at, COALESCE(scan_count,0)::int AS scan_count
       FROM followme_url_history
       WHERE project_id = $1
       ORDER BY last_used_at DESC NULLS LAST, activated_at DESC
       LIMIT 20`,
      [project.id]
    );

    return res.json({
      success:true,
      project:{
        code: project.code,
        public_id: project.public_id,
        label: project.label,
        active_url: project.active_url,
        status: project.status,
        existing_qr_url: project.existing_qr_url || '',
        existing_qr_status: project.existing_qr_status || ''
      },
      stats:{
        total_scans: totalRes.rows[0]?.total || 0,
        current_url_scans: currentRes.rows[0]?.scans || 0
      },
      history: hist.rows
    });
  } catch (err) {
    console.error('followme status error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});


app.post('/api/followme/:code/update-existing-qr', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);
    const rawUrl = String(req.body?.existing_qr_url || '').trim();

    if (!rawUrl) {
      return res.status(400).json({
        success:false,
        error:'URL del QR esistente obbligatorio.'
      });
    }

    let url = rawUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    let status = 'external_not_controllable';

    try {
      const parsed = new URL(url);
      const path = parsed.pathname || '';

      if (path.match(/^\/fm\/u\/[^\/?#]+/i) || url.includes('/fm/u/')) {
        status = 'followme_compatible';
      } else if (parsed.hostname.includes('adesivo-auto.onrender.com')) {
        status = 'same_domain_review_required';
      }
    } catch(e) {
      return res.status(400).json({
        success:false,
        error:'URL non valido.'
      });
    }

    const updated = await pool.query(
      `UPDATE followme_projects
       SET existing_qr_url = $2,
           existing_qr_status = $3,
           existing_qr_updated_at = NOW(),
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING code, public_id, label, active_url, existing_qr_url, existing_qr_status`,
      [code, url, status]
    );

    if (!updated.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Follow Me QR non trovato.'
      });
    }

    return res.json({
      success:true,
      project: updated.rows[0],
      compatible: status === 'followme_compatible',
      status
    });
  } catch (err) {
    console.error('followme update-existing-qr error:', err);
    return res.status(500).json({
      success:false,
      error: err.message || String(err)
    });
  }
});


app.post('/api/followme/:code/update-url', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);
    const url = normalizeUrlForFollowMe(req.body?.url);

    if (!url) {
      return res.status(400).json({ success:false, error:'URL obbligatorio.' });
    }

    const q = await pool.query(
      `UPDATE followme_projects
       SET active_url = $2,
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING *`,
      [code, url]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    await pool.query(
      `INSERT INTO followme_url_history
       (project_id, url, activated_at, last_used_at, scan_count)
       VALUES ($1,$2,NOW(),NULL,0)
       ON CONFLICT (project_id, url)
       DO UPDATE SET activated_at = NOW()`,
      [q.rows[0].id, url]
    );

    return res.json({ success:true, project:q.rows[0] });
  } catch (err) {
    console.error('followme update-url error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});


app.post('/api/followme/:code/history/delete', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);
    const url = normalizeUrlForFollowMe(req.body?.url);

    if (!url) {
      return res.status(400).json({ success:false, error:'URL obbligatorio.' });
    }

    const projectRes = await pool.query(
      `SELECT id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    const project = projectRes.rows[0];
    const activeUrl = normalizeUrlForFollowMe(project.active_url);

    if (activeUrl && activeUrl === url) {
      return res.status(400).json({
        success:false,
        error:'Non puoi eliminare il link attivo. Attiva prima un altro link.'
      });
    }

    const del = await pool.query(
      `DELETE FROM followme_url_history
       WHERE project_id = $1 AND url = $2
       RETURNING url`,
      [project.id, url]
    );

    return res.json({
      success:true,
      deleted: del.rowCount || 0
    });
  } catch (err) {
    console.error('followme history delete error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});



app.post('/api/followme/:code/existing-qr/delete', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);

    const q = await pool.query(
      `UPDATE followme_projects
       SET existing_qr_url = NULL,
           existing_qr_status = NULL,
           existing_qr_updated_at = NOW(),
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING code, public_id, existing_qr_url, existing_qr_status`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    return res.json({
      success:true,
      project:q.rows[0]
    });
  } catch (err) {
    console.error('followme existing qr delete error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});


app.post('/api/followme/:code/subscribe', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);
    const subscription = req.body?.subscription;

    if (!code || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ success:false, error:'Dati subscription mancanti.' });
    }

    const projectRes = await pool.query(
      `SELECT id, code
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    const project = projectRes.rows[0];

    await pool.query(
      `INSERT INTO followme_push_subscriptions
       (project_id, code, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (project_id, endpoint)
       DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()`,
      [
        project.id,
        code,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        req.headers['user-agent'] || null
      ]
    );

    return res.json({ success:true, saved:true, table:'followme_push_subscriptions' });
  } catch (err) {
    console.error('followme subscribe error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});




app.post('/api/followme/:code/unsubscribe', express.json(), async (req, res) => {
  try {
    const code = normalizeFollowMeCode(req.params.code);
    const endpoint = String(req.body?.endpoint || '').trim();

    if (!code || !endpoint) {
      return res.status(400).json({ success:false, error:'Dati unsubscribe mancanti.' });
    }

    const projectRes = await pool.query(
      `SELECT id, code, public_id
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'Follow Me QR non trovato.' });
    }

    const project = projectRes.rows[0];

    await pool.query(
      `DELETE FROM followme_push_subscriptions
       WHERE project_id = $1 AND endpoint = $2`,
      [project.id, endpoint]
    );

    // Pulizia prudenziale anche della vecchia tabella condivisa, se l'endpoint era stato salvato lì.
    await pool.query(
      `DELETE FROM push_subscriptions
       WHERE endpoint = $1`,
      [endpoint]
    );

    return res.json({ success:true, unsubscribed:true });
  } catch (err) {
    console.error('followme unsubscribe error:', err);
    return res.status(500).json({ success:false, error:'Errore disattivazione notifiche.' });
  }
});


app.post('/api/debug/followme/subscription-diagnosis', express.json(), async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim();
    const expected = process.env.FOLLOWME_DEBUG_KEY || process.env.ADMIN_PASSWORD || '';

    if (!expected || key !== expected) {
      return res.status(401).json({
        success: false,
        error: 'Chiave debug non valida.'
      });
    }

    const code = normalizeFollowMeCode(req.body?.code || 'FM-DEMO');

    const projectRes = await pool.query(
      `SELECT id, code, public_id, label, active_url, status
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    let dedicatedExists = false;
    let dedicatedSubs = { rows: [] };

    const tableCheck = await pool.query(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'followme_push_subscriptions'
      ) AS exists`
    );

    dedicatedExists = tableCheck.rows[0]?.exists === true;

    if (dedicatedExists && projectRes.rows.length) {
      dedicatedSubs = await pool.query(
        `SELECT id, project_id, code, updated_at,
                LEFT(endpoint, 90) AS endpoint_preview
         FROM followme_push_subscriptions
         WHERE project_id = $1 OR code = $2
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT 30`,
        [projectRes.rows[0].id, code]
      );
    }

    const legacySubs = await pool.query(
      `SELECT id, code, plate, updated_at, COALESCE(product_type,'vehicle') AS product_type,
              LEFT(endpoint, 90) AS endpoint_preview
       FROM push_subscriptions
       WHERE code = $1
          OR COALESCE(product_type,'vehicle') = 'follow_me'
          OR plate = 'FOLLOWME'
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 30`,
      [code]
    );

    return res.json({
      success: true,
      code,
      project_found: projectRes.rows.length > 0,
      project: projectRes.rows[0] || null,
      followme_push_subscriptions_table_exists: dedicatedExists,
      matches_in_followme_push_subscriptions: dedicatedSubs.rows,
      matches_in_push_subscriptions: legacySubs.rows
    });
  } catch (err) {
    console.error('debug followme subscription-diagnosis error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});



app.post('/api/debug/followme/link-latest-device', express.json(), async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim();
    const expected = process.env.FOLLOWME_DEBUG_KEY || process.env.ADMIN_PASSWORD || '';

    if (!expected || key !== expected) {
      return res.status(401).json({
        success: false,
        error: 'Chiave debug non valida.'
      });
    }

    const code = normalizeFollowMeCode(req.body?.code || 'FM-DEMO');

    const projectRes = await pool.query(
      `SELECT id, code, label
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Follow Me QR non trovato.'
      });
    }

    const project = projectRes.rows[0];

    const latestSub = await pool.query(
      `SELECT id, code, plate, endpoint, p256dh, auth, user_agent, updated_at,
              COALESCE(product_type,'vehicle') AS product_type
       FROM push_subscriptions
       WHERE endpoint IS NOT NULL
         AND p256dh IS NOT NULL
         AND auth IS NOT NULL
       ORDER BY 
         CASE WHEN endpoint LIKE 'https://web.push.apple.com/%' THEN 0 ELSE 1 END,
         updated_at DESC NULLS LAST,
         id DESC
       LIMIT 1`
    );

    if (!latestSub.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna subscription esistente trovata.'
      });
    }

    const sub = latestSub.rows[0];

    const inserted = await pool.query(
      `INSERT INTO followme_push_subscriptions
       (project_id, code, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (project_id, endpoint)
       DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()
       RETURNING id, project_id, code, updated_at, LEFT(endpoint, 90) AS endpoint_preview`,
      [
        project.id,
        project.code,
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        sub.user_agent || null
      ]
    );

    return res.json({
      success: true,
      mode: 'linked_existing_push_subscription_to_followme',
      followme_project: project,
      source_subscription: {
        id: sub.id,
        code: sub.code,
        plate: sub.plate,
        product_type: sub.product_type,
        updated_at: sub.updated_at,
        endpoint_preview: String(sub.endpoint || '').slice(0, 90)
      },
      saved_followme_subscription: inserted.rows[0]
    });
  } catch (err) {
    console.error('debug followme link-latest-device error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});


app.post('/api/debug/followme/test-push', express.json(), async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim();
    const expected = process.env.FOLLOWME_DEBUG_KEY || process.env.ADMIN_PASSWORD || '';

    if (!expected || key !== expected) {
      return res.status(401).json({
        success: false,
        error: 'Chiave debug non valida.'
      });
    }

    const code = normalizeFollowMeCode(req.body?.code || 'FM-DEMO');

    const projectRes = await pool.query(
      `SELECT *
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Follow Me QR non trovato.'
      });
    }

    const project = projectRes.rows[0];

    const subsRes = await pool.query(
      `SELECT id, endpoint, p256dh, auth, updated_at
       FROM followme_push_subscriptions
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [project.id]
    );

    const payload = JSON.stringify({
      title: req.body?.title || 'Follow Me QR 👀',
      body: req.body?.body || 'Notifica Follow Me dedicata.',
      url: `/fm/app/${encodeURIComponent(code)}?focus=test-push`,
      targetUrl: `/fm/app/${encodeURIComponent(code)}?focus=test-push`,
      type: 'followme_test_push',
      icon: '/followme/icons/icon-192.png',
      badge: '/followme/icons/icon-192.png',
      timestamp: Date.now(),
      data: {
        type: 'followme_test_push',
        code,
        url: `/fm/app/${encodeURIComponent(code)}?focus=test-push`
      }
    });

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const sub of subsRes.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          },
          payload
        );

        sent++;
        results.push({
          id: sub.id,
          ok: true,
          endpoint_preview: String(sub.endpoint || '').slice(0, 70)
        });
      } catch (err) {
        failed++;

        results.push({
          id: sub.id,
          ok: false,
          statusCode: err.statusCode || null,
          error: err.body || err.message || String(err),
          endpoint_preview: String(sub.endpoint || '').slice(0, 70)
        });

        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        }
      }
    }

    return res.json({
      success: true,
      mode: 'followme_dedicated',
      code,
      label: project.label,
      subscriptions_found: subsRes.rows.length,
      sent,
      failed,
      results
    });
  } catch (err) {
    console.error('debug followme test-push error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});


app.post('/api/admin/followme/create', requireAdmin, express.json(), async (req, res) => {
  try {
    let code = normalizeFollowMeCode(req.body?.code) || makeFollowMeCode();
    let publicId = normalizeFollowMePublicId(req.body?.public_id) || makeFollowMePublicId();
    const label = String(req.body?.label || 'Follow Me QR').trim();
    const activeUrl = normalizeUrlForFollowMe(req.body?.active_url || 'https://app-me.it');

    for (let i = 0; i < 8; i++) {
      const exists = await pool.query(
        `SELECT 1 FROM followme_projects WHERE code = $1 OR public_id = $2 LIMIT 1`,
        [code, publicId]
      );
      if (!exists.rows.length) break;
      code = makeFollowMeCode();
      publicId = makeFollowMePublicId();
    }

    const inserted = await pool.query(
      `INSERT INTO followme_projects
       (code, public_id, label, active_url, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING *`,
      [code, publicId, label, activeUrl]
    );

    await pool.query(
      `INSERT INTO followme_url_history
       (project_id, url, activated_at, scan_count)
       VALUES ($1,$2,NOW(),0)
       ON CONFLICT (project_id, url) DO NOTHING`,
      [inserted.rows[0].id, activeUrl]
    );

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;

    return res.json({
      success:true,
      project: inserted.rows[0],
      public_url: `${baseUrl.replace(/\/$/, '')}/fm/u/${encodeURIComponent(publicId)}`,
      owner_url: `${baseUrl.replace(/\/$/, '')}/fm/app/${encodeURIComponent(code)}`
    });
  } catch (err) {
    console.error('admin followme create error:', err);
    return res.status(500).json({ success:false, error:err.message || String(err) });
  }
});


app.post('/api/owner-deadlines/sync', async (req, res) => {
  try {
    const cleanCode = String(req.body.code || '').trim().toUpperCase();
    const plateNorm = normalizePlateValue(req.body.plate);
    const incoming = Array.isArray(req.body.deadlines) ? req.body.deadlines : [];

    if (!plateNorm) {
      return res.status(400).json({ success: false, error: 'Targa obbligatoria.' });
    }

    let code = cleanCode;
    if (!code) {
      const vehicle = await resolveVehicleByPlateNorm(plateNorm);
      code = vehicle ? String(vehicle.code || '').trim().toUpperCase() : '';
    }

    let upserted = 0;

    for (const d of incoming) {
      if (!d || !d.id) continue;

      const localId = String(d.id);
      let status = ['deleted','completed','disabled','active'].includes(String(d.status || '').toLowerCase())
        ? String(d.status || '').toLowerCase()
        : 'active';

      const existingStatusRes = await pool.query(
        `SELECT status
         FROM owner_deadline_items
         WHERE plate_norm = $1
           AND local_id = $2
         LIMIT 1`,
        [plateNorm, localId]
      );

      const existingStatus = String(existingStatusRes.rows[0]?.status || '').toLowerCase();

      // Protezione anti-riattivazione:
      // se il server ha già completato/cancellato/disabilitato una scadenza,
      // un vecchio localStorage non può riportarla ad active.
      if (
        ['completed','deleted','disabled'].includes(existingStatus) &&
        status === 'active'
      ) {
        status = existingStatus;
      }

      d.status = status;

      await pool.query(
        `INSERT INTO owner_deadline_items
         (code, plate, plate_norm, local_id, payload, status, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW())
         ON CONFLICT (plate_norm, local_id)
         DO UPDATE SET
           code = EXCLUDED.code,
           plate = EXCLUDED.plate,
           payload = EXCLUDED.payload,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [
          code || null,
          req.body.plate || plateNorm,
          plateNorm,
          localId,
          JSON.stringify(d),
          status
        ]
      );

      upserted += 1;
    }

    return res.json({
      success: true,
      synced: upserted,
      plate: plateNorm
    });
  } catch (err) {
    console.error('owner-deadlines/sync error:', err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

let ownerDeadlineSchedulerRunning = false;

async function checkDueOwnerDeadlineAlerts() {
  if (ownerDeadlineSchedulerRunning) return;
  ownerDeadlineSchedulerRunning = true;

  try {
    const rows = await pool.query(
      `SELECT id, code, plate, plate_norm, local_id, payload
       FROM owner_deadline_items
       WHERE COALESCE(status,'active') NOT IN ('deleted','completed','disabled')
       ORDER BY updated_at DESC
       LIMIT 500`
    );

    const now = new Date();

    for (const row of rows.rows) {
      try {
        const payload = row.payload || {};
        const alert = shouldSendDeadlineAlert(payload, now);
        if (!alert || !alert.alertKey) continue;

        const already = await pool.query(
          `SELECT id
           FROM owner_deadline_alert_sent
           WHERE plate_norm = $1 AND local_id = $2 AND alert_key = $3
           LIMIT 1`,
          [row.plate_norm, row.local_id, alert.alertKey]
        );

        if (already.rows.length) continue;

        const vehicle = await resolveVehicleByPlateNorm(row.plate_norm);
        if (!vehicle) continue;

        const result = await insertOwnerMessageAndPushDeadline({
          vehicle,
          plateNorm: row.plate_norm,
          alert
        });

        await pool.query(
          `INSERT INTO owner_deadline_alert_sent
           (plate_norm, local_id, alert_key, message_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (plate_norm, local_id, alert_key) DO NOTHING`,
          [row.plate_norm, row.local_id, alert.alertKey, result.messageId || null]
        );

        console.log('Deadline alert sent:', row.plate_norm, row.local_id, alert.alertKey, result);
      } catch (innerErr) {
        console.error('deadline scheduler item error:', innerErr.message || innerErr);
      }
    }
  } catch (err) {
    console.error('deadline scheduler error:', err.message || err);
  } finally {
    ownerDeadlineSchedulerRunning = false;
  }
}

ensureOwnerDeadlinesTables()
  .then(() => {
    setInterval(checkDueOwnerDeadlineAlerts, 30000);
    setTimeout(checkDueOwnerDeadlineAlerts, 8000);
  })
  .catch(err => console.error('ensureOwnerDeadlinesTables error:', err.message || err));





// Disattiva futuri avvisi di una scadenza partendo dal messaggio ricevuto


app.post('/api/owner-deadlines/stop-quick-reminders', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();
    const nameContains = String(req.body.nameContains || '').trim().toLowerCase();

    if (!plateNorm && !cleanCode) {
      return res.status(400).json({
        success: false,
        error: 'Serve almeno targa o codice.'
      });
    }

    const params = [];
    let where = [];

    if (plateNorm) {
      params.push(plateNorm);
      where.push(`plate_norm = $${params.length}`);
    }

    if (cleanCode) {
      params.push(cleanCode);
      where.push(`UPPER(COALESCE(code,'')) = $${params.length}`);
    }

    let nameFilter = '';
    if (nameContains) {
      params.push('%' + nameContains + '%');
      nameFilter = `AND LOWER(COALESCE(payload->>'name','')) LIKE $${params.length}`;
    }

    const whereSql = where.length ? '(' + where.join(' OR ') + ')' : 'TRUE';

    const updateSql = `
      UPDATE owner_deadline_items
      SET status = 'completed',
          payload = jsonb_set(
            jsonb_set(
              COALESCE(payload, '{}'::jsonb),
              '{status}',
              '"completed"'::jsonb,
              true
            ),
            '{emergencyStoppedAt}',
            to_jsonb(NOW()::text),
            true
          ),
          updated_at = NOW()
      WHERE ${whereSql}
        ${nameFilter}
        AND COALESCE(status,'active') NOT IN ('deleted','completed','disabled')
        AND COALESCE((payload->'extra'->>'quickReminder')::boolean, false) = true
      RETURNING local_id, payload->>'name' AS name
    `;

    const updated = await pool.query(updateSql, params);

    const localIds = updated.rows.map(r => String(r.local_id)).filter(Boolean);

    let deletedMessages = 0;

    if (localIds.length) {
      const msgRes = await pool.query(
        `SELECT DISTINCT message_id
         FROM owner_deadline_alert_sent
         WHERE local_id = ANY($1::text[])
           AND message_id IS NOT NULL`,
        [localIds]
      );

      const messageIds = msgRes.rows.map(r => Number(r.message_id)).filter(Boolean);

      if (messageIds.length) {
        const delRes = await pool.query(
          `UPDATE contact_message_logs
           SET deleted_at = COALESCE(deleted_at, NOW()),
               read_at = COALESCE(read_at, NOW())
           WHERE id = ANY($1::int[])`,
          [messageIds]
        );

        deletedMessages = delRes.rowCount || 0;
      }
    }

    return res.json({
      success: true,
      stopped: updated.rowCount || 0,
      deleted_messages: deletedMessages,
      items: updated.rows
    });
  } catch (err) {
    console.error('owner-deadlines/stop-quick-reminders error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});



app.post('/api/owner-deadlines/update-status', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();
    const localId = String(req.body.deadlineId || req.body.local_id || '').trim();
    const wantedStatus = String(req.body.status || '').trim().toLowerCase();

    const allowed = new Set(['completed', 'deleted', 'disabled', 'active']);
    if (!plateNorm || !localId || !allowed.has(wantedStatus)) {
      return res.status(400).json({
        success:false,
        error:'plate, deadlineId e status valido sono obbligatori.'
      });
    }

    const jsonStatus = JSON.stringify(wantedStatus);

    const updateRes = await pool.query(
      `UPDATE owner_deadline_items
       SET status = $3,
           payload = jsonb_set(
             jsonb_set(
               COALESCE(payload, '{}'::jsonb),
               '{status}',
               $4::jsonb,
               true
             ),
             CASE
               WHEN $3 = 'completed' THEN '{completedAt}'
               WHEN $3 = 'deleted' THEN '{deletedAt}'
               ELSE '{statusUpdatedAt}'
             END,
             to_jsonb(NOW()::text),
             true
           ),
           updated_at = NOW()
       WHERE plate_norm = $1
         AND local_id = $2
       RETURNING local_id, status, payload->>'name' AS name`,
      [plateNorm, localId, wantedStatus, jsonStatus]
    );

    let deletedMessages = 0;

    if (wantedStatus === 'completed' || wantedStatus === 'deleted' || wantedStatus === 'disabled') {
      const msgRes = await pool.query(
        `SELECT DISTINCT message_id
         FROM owner_deadline_alert_sent
         WHERE plate_norm = $1
           AND local_id = $2
           AND message_id IS NOT NULL`,
        [plateNorm, localId]
      );

      const messageIds = msgRes.rows.map(r => Number(r.message_id)).filter(Boolean);

      if (messageIds.length) {
        const delRes = await pool.query(
          `UPDATE contact_message_logs
           SET deleted_at = COALESCE(deleted_at, NOW()),
               read_at = COALESCE(read_at, NOW())
           WHERE id = ANY($1::int[])
             AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2`,
          [messageIds, plateNorm]
        );

        deletedMessages = delRes.rowCount || 0;
      }
    }

    if (!updateRes.rows.length) {
      // Se il record non esiste ancora sul server ma arriva dal client,
      // non generiamo errore critico: probabilmente non era mai stato sincronizzato.
      return res.json({
        success:true,
        updated:0,
        deleted_messages:deletedMessages,
        warning:'Record server non trovato; nessuna scadenza attiva da fermare.'
      });
    }

    return res.json({
      success:true,
      updated:updateRes.rowCount || 0,
      deleted_messages:deletedMessages,
      item:updateRes.rows[0]
    });
  } catch (err) {
    console.error('owner-deadlines/update-status error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || String(err)
    });
  }
});


app.post('/api/owner-deadlines/status-list', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();

    if (!plateNorm) {
      return res.status(400).json({ success:false, error:'Targa obbligatoria.' });
    }

    const rows = await pool.query(
      `SELECT local_id, status, updated_at, payload->>'name' AS name
       FROM owner_deadline_items
       WHERE plate_norm = $1
          OR ($2 <> '' AND code = $2)
       ORDER BY updated_at DESC
       LIMIT 1000`,
      [plateNorm, cleanCode]
    );

    return res.json({
      success:true,
      items: rows.rows
    });
  } catch (err) {
    console.error('owner-deadlines/status-list error:', err);
    return res.status(500).json({ success:false, error: err.message || String(err) });
  }
});




async function isDeadlineMessageCleanupEnabled({ plateNorm, code }) {
  const cleanPlate = normalizePlateValue(plateNorm);
  const cleanCode = String(code || '').trim().toUpperCase();

  if (!cleanPlate && !cleanCode) return false;

  const params = [];
  const where = [];

  if (cleanPlate) {
    params.push(cleanPlate);
    where.push(`REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $${params.length}`);
  }

  if (cleanCode) {
    params.push(cleanCode);
    where.push(`UPPER(COALESCE(code,'')) = $${params.length}`);
  }

  const q = `
    SELECT COALESCE(enable_deadline_message_cleanup, FALSE) AS enabled
    FROM sticker_codes
    WHERE ${where.join(' OR ')}
    ORDER BY activated_at DESC NULLS LAST, id DESC
    LIMIT 1
  `;

  const r = await pool.query(q, params);
  return r.rows[0]?.enabled === true;
}



app.post('/api/admin/deadline-cleanup-flag', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();
    const enabled = req.body.enabled === true || req.body.enabled === 'true' || req.body.enabled === 1 || req.body.enabled === '1';

    if (!plateNorm && !cleanCode) {
      return res.status(400).json({
        success:false,
        error:'Inserisci targa o codice.'
      });
    }

    const params = [];
    const where = [];

    if (plateNorm) {
      params.push(plateNorm);
      where.push(`REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $${params.length}`);
    }

    if (cleanCode) {
      params.push(cleanCode);
      where.push(`UPPER(COALESCE(code,'')) = $${params.length}`);
    }

    params.push(enabled);
    const enabledParam = `$${params.length}`;

    const r = await pool.query(
      `UPDATE sticker_codes
       SET enable_deadline_message_cleanup = ${enabledParam}
       WHERE ${where.join(' OR ')}
       RETURNING code, plate, brand, vehicle_model, enable_deadline_message_cleanup`,
      params
    );

    return res.json({
      success:true,
      updated:r.rowCount || 0,
      enabled,
      items:r.rows
    });
  } catch (err) {
    console.error('admin/deadline-cleanup-flag error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || String(err)
    });
  }
});

app.post('/api/admin/deadline-cleanup-flag/status', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();

    if (!plateNorm && !cleanCode) {
      return res.status(400).json({
        success:false,
        error:'Inserisci targa o codice.'
      });
    }

    const params = [];
    const where = [];

    if (plateNorm) {
      params.push(plateNorm);
      where.push(`REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $${params.length}`);
    }

    if (cleanCode) {
      params.push(cleanCode);
      where.push(`UPPER(COALESCE(code,'')) = $${params.length}`);
    }

    const r = await pool.query(
      `SELECT code, plate, brand, vehicle_model, COALESCE(enable_deadline_message_cleanup, FALSE) AS enable_deadline_message_cleanup
       FROM sticker_codes
       WHERE ${where.join(' OR ')}
       ORDER BY activated_at DESC NULLS LAST, id DESC
       LIMIT 20`,
      params
    );

    return res.json({
      success:true,
      items:r.rows
    });
  } catch (err) {
    console.error('admin/deadline-cleanup-flag/status error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || String(err)
    });
  }
});



app.post('/api/owner-deadlines/feature-status', async (req, res) => {
  try {
    const plateNorm = normalizePlateValue(req.body.plate);
    const cleanCode = String(req.body.code || '').trim().toUpperCase();

    if (!plateNorm && !cleanCode) {
      return res.status(400).json({
        success:false,
        enabled:false,
        error:'Targa o codice obbligatorio.'
      });
    }

    const params = [];
    const where = [];

    if (plateNorm) {
      params.push(plateNorm);
      where.push(`REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $${params.length}`);
    }

    if (cleanCode) {
      params.push(cleanCode);
      where.push(`UPPER(COALESCE(code,'')) = $${params.length}`);
    }

    const r = await pool.query(
      `SELECT code, plate, brand, vehicle_model,
              COALESCE(enable_deadline_message_cleanup, FALSE) AS enable_deadline_message_cleanup
       FROM sticker_codes
       WHERE ${where.join(' OR ')}
       ORDER BY activated_at DESC NULLS LAST, id DESC
       LIMIT 1`,
      params
    );

    if (!r.rows.length) {
      return res.json({
        success:true,
        found:false,
        enabled:false
      });
    }

    const row = r.rows[0];

    return res.json({
      success:true,
      found:true,
      enabled: row.enable_deadline_message_cleanup === true,
      code: row.code || cleanCode || '',
      plate: row.plate || plateNorm || '',
      brand: row.brand || '',
      vehicle_model: row.vehicle_model || ''
    });
  } catch (err) {
    console.error('owner-deadlines/feature-status error:', err);
    return res.status(500).json({
      success:false,
      enabled:false,
      error:err.message || String(err)
    });
  }
});


app.post('/api/owner-deadlines/message-link-status', async (req, res) => {
  try {
    const messageId = Number(req.body.messageId || 0);
    const plateNorm = normalizePlateValue(req.body.plate);

    if (!messageId || !plateNorm) {
      return res.status(400).json({
        success: false,
        linked: false,
        error: 'messageId e targa sono obbligatori.'
      });
    }

    const cleanupEnabled = await isDeadlineMessageCleanupEnabled({
      plateNorm,
      code: req.body.code || ''
    });

    if (!cleanupEnabled) {
      return res.json({
        success: true,
        linked: false,
        enabled: false
      });
    }

    const linkedRes = await pool.query(
      `SELECT s.plate_norm, s.local_id, s.alert_key, s.message_id,
              i.status,
              i.payload->>'name' AS name
       FROM owner_deadline_alert_sent s
       LEFT JOIN owner_deadline_items i
         ON i.plate_norm = s.plate_norm
        AND i.local_id = s.local_id
       WHERE s.message_id = $1
         AND s.plate_norm = $2
       ORDER BY s.sent_at DESC
       LIMIT 1`,
      [messageId, plateNorm]
    );

    if (!linkedRes.rows.length) {
      return res.json({
        success: true,
        linked: false
      });
    }

    const row = linkedRes.rows[0];

    return res.json({
      success: true,
      linked: true,
      local_id: row.local_id,
      alert_key: row.alert_key,
      status: row.status || 'active',
      name: row.name || null
    });
  } catch (err) {
    console.error('owner-deadlines/message-link-status error:', err);
    return res.status(500).json({
      success: false,
      linked: false,
      error: err.message || String(err)
    });
  }
});


app.post('/api/owner-deadlines/disable-from-message', async (req, res) => {
  try {
    const messageId = Number(req.body.messageId || 0);
    const code = String(req.body.code || '').trim().toUpperCase();
    const plateNorm = normalizePlateValue(req.body.plate);

    if (!messageId || !plateNorm) {
      return res.status(400).json({
        success: false,
        error: 'messageId e targa sono obbligatori.'
      });
    }

    const cleanupEnabled = await isDeadlineMessageCleanupEnabled({
      plateNorm,
      code
    });

    if (!cleanupEnabled) {
      return res.status(403).json({
        success: false,
        error: 'La chiusura massiva degli avvisi non è abilitata per questa vettura.'
      });
    }

    const sentRes = await pool.query(
      `SELECT plate_norm, local_id, alert_key, message_id
       FROM owner_deadline_alert_sent
       WHERE message_id = $1
         AND plate_norm = $2
       ORDER BY sent_at DESC
       LIMIT 1`,
      [messageId, plateNorm]
    );

    if (!sentRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Scadenza collegata a questo messaggio non trovata.'
      });
    }

    const linked = sentRes.rows[0];

    const updateRes = await pool.query(
      `UPDATE owner_deadline_items
       SET status = 'completed',
           payload = jsonb_set(
             jsonb_set(
               COALESCE(payload, '{}'::jsonb),
               '{status}',
               '"completed"'::jsonb,
               true
             ),
             '{completedFromMessageAt}',
             to_jsonb(NOW()::text),
             true
           ),
           updated_at = NOW()
       WHERE plate_norm = $1
         AND local_id = $2
       RETURNING id, local_id, payload->>'name' AS name`,
      [linked.plate_norm, linked.local_id]
    );

    if (!updateRes.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Promemoria non trovato o già disattivato.'
      });
    }

    const allMessagesRes = await pool.query(
      `SELECT DISTINCT message_id
       FROM owner_deadline_alert_sent
       WHERE plate_norm = $1
         AND local_id = $2
         AND message_id IS NOT NULL`,
      [linked.plate_norm, linked.local_id]
    );

    const messageIds = allMessagesRes.rows
      .map(r => Number(r.message_id))
      .filter(Boolean);

    let deletedMessages = 0;

    if (messageIds.length) {
      const delRes = await pool.query(
        `UPDATE contact_message_logs
         SET deleted_at = COALESCE(deleted_at, NOW()),
             read_at = COALESCE(read_at, NOW())
         WHERE id = ANY($1::int[])
           AND REPLACE(UPPER(COALESCE(plate,'')), ' ', '') = $2`,
        [messageIds, plateNorm]
      );

      deletedMessages = delRes.rowCount || 0;
    }

    return res.json({
      success: true,
      completed: true,
      disabled: true,
      deleted_messages: deletedMessages,
      message_ids: messageIds,
      message_id: messageId,
      local_id: linked.local_id,
      deadline_name: updateRes.rows[0].name || null
    });
  } catch (err) {
    console.error('owner-deadlines/disable-from-message error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || String(err)
    });
  }
});



app.listen(PORT, () => {
      console.log(`Server attivo su ${BASE_URL}`);
    });
  } catch (err) {
    console.error('Errore avvio server:', err);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer, initDb, validateRuntimeEnv };
