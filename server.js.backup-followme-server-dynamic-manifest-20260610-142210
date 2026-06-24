
require('dotenv').config();
const express = require('express')
const multer = require('multer');
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



// followme-dynamic-no-cache-20260526
// No-cache solo per pagine/API dinamiche FollowMe.
// Non tocca upload immagini/PDF/QR/statici, così non rompe PWA e asset.
app.use((req, res, next) => {
  try {
    const path = String(req.path || "");

    const dynamicFollowMe =
      path === "/followme-app.html" ||
      path.startsWith("/api/followme/") ||
      path.startsWith("/api/admin/");

    const keepCached =
      path.startsWith("/uploads/") ||
      path.startsWith("/followme/qrs/") ||
      path.startsWith("/static/") ||
      path.startsWith("/images/") ||
      path.endsWith(".css") ||
      path.endsWith(".js") ||
      path.endsWith(".png") ||
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".webp") ||
      path.endsWith(".gif") ||
      path.endsWith(".svg") ||
      path.endsWith(".pdf");

    if (dynamicFollowMe && !keepCached) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
  } catch (e) {}

  next();
});

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

<script id="FOLLOWME_INFO_PUBLIC_AUDIO_PLAYER_LIKE_CHAT_V2_20260528">
(function(){
  "use strict";

  const data = window.FOLLOWME_INFO_DATA || {};
  const v = data.voice_message || null;

  if(!v || !v.file_url) return;

  function esc(x){
    return String(x || "").replace(/[<>&"]/g,function(c){
      return c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;";
    });
  }

  function ensurePlayer(){
    const oldBtn = document.getElementById("voiceBtn");
    if(!oldBtn || oldBtn.dataset.audioPlayerPatched === "1") return;

    oldBtn.dataset.audioPlayerPatched = "1";

    const wrap = document.createElement("div");
    wrap.id = "followmePublicVoicePlayer20260528";
    wrap.style.margin = "10px 0 0";
    wrap.style.padding = "10px";
    wrap.style.borderRadius = "18px";
    wrap.style.background = "rgba(255,255,255,.72)";
    wrap.style.border = "1px solid rgba(15,23,42,.10)";
    wrap.style.boxShadow = "0 10px 28px rgba(15,23,42,.08)";

    wrap.innerHTML =
      '<audio id="followmePublicVoiceAudio20260528" controls preload="metadata" playsinline style="width:100%;height:38px">' +
      '  <source src="' + esc(v.file_url) + '" type="' + esc(v.mime_type || "audio/mp4") + '">' +
      '</audio>' +
      '<div id="followmePublicVoiceError20260528" style="display:none;margin-top:7px;font-size:12px;font-weight:800;color:#b91c1c">Formato audio non riproducibile da questo dispositivo.</div>';

    oldBtn.insertAdjacentElement("afterend", wrap);

    const audio = document.getElementById("followmePublicVoiceAudio20260528");
    const err = document.getElementById("followmePublicVoiceError20260528");

    oldBtn.onclick = async function(ev){
      try{
        ev.preventDefault();
        oldBtn.disabled = true;
        oldBtn.textContent = "Riproduco...";

        await fetch("/api/followme/" + encodeURIComponent(data.code) + "/voice-messages/" + encodeURIComponent(v.id) + "/listened", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({})
        }).catch(function(){});

        await audio.play();
      }catch(e){
        if(err) err.style.display = "block";
      }finally{
        oldBtn.disabled = false;
        oldBtn.textContent = "▶ Ascolta il messaggio";
      }
    };

    audio.addEventListener("play", function(){
      fetch("/api/followme/" + encodeURIComponent(data.code) + "/voice-messages/" + encodeURIComponent(v.id) + "/listened", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({})
      }).catch(function(){});
    }, { once:true });

    audio.addEventListener("error", function(){
      if(err) err.style.display = "block";
    });
  }

  document.addEventListener("DOMContentLoaded", ensurePlayer);
  setTimeout(ensurePlayer, 300);
  setTimeout(ensurePlayer, 900);
})();
</script>

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

// FOLLOWME_SERVER_BLOCK_LEGACY_CHAT_WAITING_20260528
app.use(function(req, res, next) {
  try {
    const path = String(req.path || '');
    const q = req.query || {};

    /*
      La vecchia WebApp non deve più restare in chatWaiting.
      Se arriva qualsiasi richiesta /fm/app/CODICE?chatWaiting=1&focus=chat-waiting,
      il server manda direttamente alla nuova admin Chat V2.
    */
    const m = path.match(/^\/fm\/app\/([^\/?#]+)/i);
    if (m && (String(q.chatWaiting || '') === '1' || String(q.focus || '') === 'chat-waiting')) {
      const code = decodeURIComponent(m[1] || '').trim() || 'FM-DEMO';
      return res.redirect(302, '/fm/chat-v2/admin/' + encodeURIComponent(code) + '?v=' + Date.now());
    }

    /*
      Se qualche vecchio link punta ancora alla vecchia chat pubblica /fm/chat/c/TOKEN,
      lo portiamo alla nuova pagina utente Chat V2 con lo stesso token.
    */
    const oldChat = path.match(/^\/fm\/chat\/c\/([^\/?#]+)/i);
    if (oldChat) {
      const token = decodeURIComponent(oldChat[1] || '').trim();
      if (token) {
        return res.redirect(302, '/fm/chat-v2/c/' + encodeURIComponent(token) + '?v=' + Date.now());
      }
    }
  } catch (e) {}

  return next();
});


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


// FollowMe temporary attachment cleanup.

// followme-chat-persistent-attachments-guard-20260519
async function isFollowMeChatUploadReferenced(storedFileName) {
  try {
    const file = String(storedFileName || '').trim();
    if (!file) return false;

    const url = '/uploads/followme-chat/' + file;

    const q = await pool.query(
      `SELECT 1
       FROM followme_chat_messages
       WHERE message LIKE $1
       LIMIT 1`,
      ['%' + url + '%']
    );

    return q.rows.length > 0;
  } catch (err) {
    console.warn('isFollowMeChatUploadReferenced error:', err.message || err);
    // In caso di dubbio NON cancelliamo.
    return true;
  }
}

// Cancella automaticamente i file caricati in public/uploads/followme-chat dopo 2 minuti.
const FOLLOWME_ATTACHMENT_TTL_MS = 2 * 60 * 1000;
const FOLLOWME_ATTACHMENT_CLEANUP_INTERVAL_MS = 30 * 1000;

function cleanupFollowMeTemporaryAttachments() {
  try {
    const fs = require('fs');
    const path = require('path');

    const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat');
    if (!fs.existsSync(uploadDir)) return;

    const now = Date.now();
    const files = fs.readdirSync(uploadDir);

    for (const file of files) {
      const fullPath = path.join(uploadDir, file);

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }

      if (!stat.isFile()) continue;

      const age = now - stat.mtimeMs;

      if (age > FOLLOWME_ATTACHMENT_TTL_MS) {
        try {
          // followme-chat-persistent-skip-delete-20260519
          // Allegati FollowMe Chat persistenti: non cancellare automaticamente.
          return;
          fs.unlinkSync(fullPath);
          console.log('[followme cleanup] deleted temporary attachment:', file);
        } catch (e) {
          console.warn('[followme cleanup] cannot delete temporary attachment:', file, e.message || e);
        }
      }
    }
  } catch (err) {
    console.warn('[followme cleanup] error:', err.message || err);
  }
}

if (!global.__followMeAttachmentCleanupStarted) {
  global.__followMeAttachmentCleanupStarted = true;

  setTimeout(cleanupFollowMeTemporaryAttachments, 5000);
  setInterval(cleanupFollowMeTemporaryAttachments, FOLLOWME_ATTACHMENT_CLEANUP_INTERVAL_MS);
}



/*
  FollowMe documenti PDF persistenti.
  In locale salva dentro public/uploads.
  Su Render, se FOLLOWME_STORAGE_DIR è impostato, salva sul Persistent Disk.
  Nel tuo servizio Render il disco è montato su:
  FOLLOWME_STORAGE_DIR=/data
*/
const FOLLOWME_STORAGE_ROOT = process.env.FOLLOWME_STORAGE_DIR
  ? path.resolve(process.env.FOLLOWME_STORAGE_DIR)
  : path.join(__dirname, 'public');

const FOLLOWME_DOCUMENTS_DISK_DIR = path.join(FOLLOWME_STORAGE_ROOT, 'uploads', 'followme-documents');

/*
  IMPORTANTE:
  questa route deve stare PRIMA di express.static(public),
  altrimenti eventuali vecchi PDF dentro public/uploads vengono serviti
  prima dei PDF corretti salvati nel Persistent Disk.
*/
app.use(
  '/uploads/followme-documents',
  express.static(FOLLOWME_DOCUMENTS_DISK_DIR, {
    fallthrough: false,
    immutable: false,
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  })
);


// CITOFONAMI_NO_CACHE_MIDDLEWARE
app.use('/citofonami', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

app.use('/api/citofonami', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
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




// start-admin-followme-projects-api-20260525

// start-followme-trial-request-backend-20260525
async function ensureFollowMeTrialRequestsTable20260525() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_trial_requests (
      id BIGSERIAL PRIMARY KEY,
      full_name TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_whatsapp TEXT,
      initial_url TEXT,
      otp_code TEXT NOT NULL,
      otp_expires_at TIMESTAMPTZ NOT NULL,
      otp_sent_at TIMESTAMPTZ,
      otp_verified_at TIMESTAMPTZ,
      otp_status TEXT NOT NULL DEFAULT 'pending_otp',
      status TEXT NOT NULL DEFAULT 'pending_otp',
      privacy_consent BOOLEAN NOT NULL DEFAULT FALSE,
      terms_consent BOOLEAN NOT NULL DEFAULT FALSE,
      marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
      anti_bot_score INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      source TEXT DEFAULT 'followme-prova',
      code TEXT,
      public_id TEXT,
      trial_started_at TIMESTAMPTZ,
      trial_expires_at TIMESTAMPTZ,
      plan_override TEXT,
      admin_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS phone_whatsapp TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS initial_url TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS otp_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS otp_verified_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS otp_status TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS status TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS code TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS public_id TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS plan_override TEXT`);
  await pool.query(`ALTER TABLE followme_trial_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS followme_trial_requests_status_idx
    ON followme_trial_requests(status, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS followme_trial_requests_email_phone_idx
    ON followme_trial_requests(LOWER(email), phone)
  `);
}

function normalizeFollowMeTrialEmail20260525(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeFollowMeTrialPhone20260525(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');

  if (!digits) {
    return { raw, e164:'', whatsapp:'', isValid:false };
  }

  let e164 = '';

  if (digits.startsWith('39') && digits.length >= 11) {
    e164 = '+' + digits;
  } else if (digits.startsWith('0039') && digits.length >= 13) {
    e164 = '+' + digits.slice(2);
  } else if (digits.length >= 9 && digits.length <= 11) {
    e164 = '+39' + digits;
  } else {
    e164 = '+' + digits;
  }

  const whatsapp = e164.replace(/\D/g, '');
  const isValid = whatsapp.length >= 10 && whatsapp.length <= 15;

  return { raw, e164, whatsapp, isValid };
}

function normalizeFollowMeInitialUrl20260525(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    const u = new URL(withProtocol);

    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch(e) {
    return '';
  }
}

function makeFollowMeTrialOtp20260525() {
  return String(Math.floor(100000 + Math.random() * 900000));
}


// followme-trial-admin-push-20260525
async function sendFollowMeTrialRequestAdminPush20260525(req, trialRow) {
  try {
    const requestId = trialRow?.id;
    if (!requestId) return;

    const baseUrl = String(
      (typeof getPublicBaseUrl === 'function')
        ? getPublicBaseUrl(req)
        : ((req.protocol || 'https') + '://' + (req.get('host') || 'adesivo-auto.onrender.com'))
    ).replace(/^http:\/\//i, 'https://');

    const targetUrl = `/admin.html?followmeTrialRequest=${encodeURIComponent(requestId)}#adminFollowMeFrame20260525`;
    const absoluteTargetUrl = `${baseUrl.replace(/\/$/, '')}${targetUrl}`;

    const fullName = String(trialRow.full_name || '').trim();
    const phone = String(trialRow.phone || '').trim();
    const email = String(trialRow.email || '').trim();

    const trialPushCode = 'AMC-E8493C7F';
    const trialPushPlate = 'GL740CH';
    const nowLabel = new Date().toLocaleString('it-IT');

    let insertedMessageId = null;

    const msgText = [
      'Richiesta nuova prova FollowMe QR',
      `Data e ora: ${nowLabel}`,
      fullName ? `Nome: ${fullName}` : null,
      phone ? `WhatsApp: ${phone}` : null,
      email ? `Email: ${email}` : null,
      `Richiesta ID: ${requestId}`,
      `Apri admin: ${absoluteTargetUrl}`
    ].filter(Boolean).join('\\n');

    try {
      const insertedMsg = await pool.query(
        `INSERT INTO contact_message_logs
         (code, plate, reason, message_text, location_shared, created_at)
         VALUES ($1, $2, $3, $4, FALSE, NOW())
         RETURNING id`,
        [trialPushCode, trialPushPlate, 'Richiesta nuova prova FollowMe QR', msgText]
      );

      insertedMessageId = insertedMsg.rows?.[0]?.id || null;
    } catch (msgErr) {
      console.error('followme trial admin log message error:', msgErr);
    }

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('followme trial admin push skipped: VAPID non configurate.');
      return;
    }

    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE code = $1
         AND COALESCE(plate,'') = COALESCE($2,'')
         AND is_active = TRUE`,
      [trialPushCode, trialPushPlate]
    );

    console.log('followme trial admin push subscriptions:', subs.rows.length);

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
            title: 'Richiesta nuova prova FollowMe QR',
            body: [fullName || 'Nuova richiesta', phone || email || ''].filter(Boolean).join(' · '),
            url: targetUrl,
            targetUrl,
            messageId: insertedMessageId,
            trialRequestId: requestId,
            channel: 'followme-trial-request-alert'
          })
        );
      } catch (pushErr) {
        console.error('followme trial admin push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);

        if (pushErr && (pushErr.statusCode === 404 || pushErr.statusCode === 410)) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]).catch(() => null);
        }
      }
    }
  } catch(err) {
    console.error('followme trial admin push block error:', err.message || err);
  }
}
// end-followme-trial-admin-push-20260525


app.post('/api/followme/trial/request', express.json({ limit:'80kb' }), async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const startedAt = Number(req.body?.started_at || 0);
    const now = Date.now();
    const elapsedMs = startedAt ? now - startedAt : 0;

    const honeypot = String(req.body?.company_website || '').trim();
    if (honeypot) {
      return res.status(200).json({ success:true, message:'Richiesta ricevuta.' });
    }

    if (elapsedMs > 0 && elapsedMs < 2500) {
      return res.status(429).json({
        success:false,
        error:'Invio troppo rapido. Riprova tra qualche secondo.'
      });
    }

    const fullName = String(req.body?.full_name || '').trim().slice(0, 120);
    const email = normalizeFollowMeTrialEmail20260525(req.body?.email);
    const phoneNorm = normalizeFollowMeTrialPhone20260525(req.body?.phone);
    const initialUrl = normalizeFollowMeInitialUrl20260525(req.body?.initial_url);
    const privacyConsent = !!req.body?.privacy_consent;
    const termsConsent = !!req.body?.terms_consent;
    const marketingConsent = !!req.body?.marketing_consent;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success:false, error:'Inserisci una email valida.' });
    }

    if (!phoneNorm.isValid) {
      return res.status(400).json({ success:false, error:'Inserisci un numero WhatsApp valido.' });
    }

    if (!privacyConsent || !termsConsent) {
      return res.status(400).json({
        success:false,
        error:'Devi accettare privacy e condizioni d’uso per richiedere la prova.'
      });
    }

    /*
      Protezioni anti-bot / anti-abuso:
      - max 5 richieste dallo stesso IP in 24 ore
      - max 2 richieste con stessa email in 30 giorni
      - max 2 richieste con stesso telefono in 30 giorni
      - blocco invii troppo rapidi già gestito sopra
    */
    const ipAddress = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

    const ipLimit = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM followme_trial_requests
       WHERE ip_address = $1
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [ipAddress || null]
    );

    if ((ipLimit.rows[0]?.n || 0) >= 5) {
      return res.status(429).json({
        success:false,
        error:'Troppe richieste da questa connessione. Riprova più tardi.'
      });
    }

    const emailLimit = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM followme_trial_requests
       WHERE LOWER(email) = LOWER($1)
         AND created_at > NOW() - INTERVAL '30 days'`,
      [email]
    );

    if ((emailLimit.rows[0]?.n || 0) >= 2) {
      return res.status(409).json({
        success:false,
        error:'Hai già richiesto la prova con questa email. Contattaci su WhatsApp per proseguire.'
      });
    }

    const phoneLimit = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM followme_trial_requests
       WHERE (phone = $1 OR phone_whatsapp = $2)
         AND created_at > NOW() - INTERVAL '30 days'`,
      [phoneNorm.e164, phoneNorm.whatsapp]
    );

    if ((phoneLimit.rows[0]?.n || 0) >= 2) {
      return res.status(409).json({
        success:false,
        error:'Hai già richiesto la prova con questo numero WhatsApp. Contattaci per proseguire.'
      });
    }

    /*
      Regola prova:
      - una richiesta per email/telefono può esistere;
      - se già attiva o verificata, non creiamo duplicati.
      In futuro qui applicheremo la regola: prova concessa una sola volta.
    */
    const existing = await pool.query(
      `SELECT id, status, otp_status, code, trial_expires_at
       FROM followme_trial_requests
       WHERE LOWER(email) = LOWER($1)
          OR phone = $2
          OR phone_whatsapp = $3
       ORDER BY id DESC
       LIMIT 1`,
      [email, phoneNorm.e164, phoneNorm.whatsapp]
    );

    if (existing.rows.length) {
      const ex = existing.rows[0];
      if (['verified','active','pending_otp','otp_sent'].includes(String(ex.status || '').toLowerCase())) {
        return res.status(409).json({
          success:false,
          error:'Esiste già una richiesta FollowMe per questa email o questo numero. Contattaci su WhatsApp per proseguire.'
        });
      }
    }

    const otpCode = makeFollowMeTrialOtp20260525();
    const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const inserted = await pool.query(
      `INSERT INTO followme_trial_requests
       (full_name, email, phone, phone_whatsapp, initial_url,
        otp_code, otp_expires_at, otp_status, status,
        privacy_consent, terms_consent, marketing_consent,
        anti_bot_score, ip_address, user_agent, source,
        created_at, updated_at)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,'pending_otp','pending_otp',
        $8,$9,$10,$11,$12,$13,'followme-prova',NOW(),NOW())
       RETURNING id, email, phone, phone_whatsapp, otp_status, status, created_at`,
      [
        fullName || null,
        email,
        phoneNorm.e164,
        phoneNorm.whatsapp,
        initialUrl || null,
        otpCode,
        otpExpiresAt,
        privacyConsent,
        termsConsent,
        marketingConsent,
        elapsedMs > 0 ? 1 : 0,
        ipAddress || null,
        req.headers['user-agent'] || null
      ]
    );

    sendFollowMeTrialRequestAdminPush20260525(req, {
      ...inserted.rows[0],
      full_name: fullName || null,
      email,
      phone: phoneNorm.e164
    }).catch(() => null);

    return res.json({
      success:true,
      message:'Richiesta ricevuta. Riceverai un codice di verifica via WhatsApp.',
      request_id: inserted.rows[0].id
    });

  } catch (err) {
    console.error('followme trial request error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore invio richiesta prova FollowMe.'
    });
  }
});
// end-followme-trial-request-backend-20260525

// start-admin-followme-trial-requests-api-20260525
app.get('/api/admin/followme/trial-requests', requireAdmin, async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const r = await pool.query(
      `SELECT id, full_name, email, phone, phone_whatsapp, initial_url,
              otp_code, otp_expires_at, otp_sent_at, otp_verified_at,
              otp_status, status, code, public_id,
              trial_started_at, trial_expires_at, plan_override,
              admin_notes, created_at, updated_at
       FROM followme_trial_requests
       ORDER BY created_at DESC, id DESC
       LIMIT 120`
    );

    let baseUrl = (typeof getPublicBaseUrl === 'function')
      ? getPublicBaseUrl(req)
      : ((req.protocol || 'https') + '://' + (req.get('host') || 'adesivo-auto.onrender.com'));

    baseUrl = String(baseUrl || 'https://adesivo-auto.onrender.com').replace(/^http:\/\//i, 'https://');

    const rows = r.rows.map(item => {
      const whatsappNumber = item.phone_whatsapp || String(item.phone || '').replace(/\D/g, '');
      const verifyUrl = `${baseUrl.replace(/\/$/, '')}/followme-verifica.html?id=${encodeURIComponent(item.id)}`;

      const whatsappText = [
        'Ciao, per completare l’attivazione della prova gratuita FollowMe inserisci questo codice:',
        '',
        String(item.otp_code || ''),
        '',
        'Link verifica:',
        verifyUrl,
        '',
        'La prova dura 14 giorni. Dopo la prova potrai acquistare FollowMe al prezzo lancio di 9,90 € / anno.'
      ].join('\n');

      return {
        ...item,
        whatsapp_number: whatsappNumber,
        whatsapp_text: whatsappText,
        whatsapp_url: whatsappNumber
          ? `https://wa.me/${encodeURIComponent(whatsappNumber)}?text=${encodeURIComponent(whatsappText)}`
          : '',
        verify_url: verifyUrl
      };
    });

    return res.json({ success:true, requests:rows });
  } catch (err) {
    console.error('admin followme trial requests error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore caricamento richieste prova FollowMe.',
      detail: err && err.message ? err.message : String(err || '')
    });
  }
});

app.post('/api/admin/followme/trial-request/:id/mark-otp-sent', requireAdmin, express.json(), async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ success:false, error:'ID richiesta mancante.' });

    const r = await pool.query(
      `UPDATE followme_trial_requests
       SET otp_sent_at = NOW(),
           otp_status = 'otp_sent',
           status = CASE WHEN status = 'pending_otp' THEN 'otp_sent' ELSE status END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Richiesta non trovata.' });
    }

    return res.json({ success:true, request:r.rows[0] });
  } catch (err) {
    console.error('admin followme mark otp sent error:', err);
    return res.status(500).json({ success:false, error:'Errore aggiornamento invio codice.' });
  }
});

app.post('/api/admin/followme/trial-request/:id/regenerate-otp', requireAdmin, express.json(), async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ success:false, error:'ID richiesta mancante.' });

    const otpCode = makeFollowMeTrialOtp20260525();
    const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const r = await pool.query(
      `UPDATE followme_trial_requests
       SET otp_code = $2,
           otp_expires_at = $3,
           otp_sent_at = NULL,
           otp_status = 'pending_otp',
           status = 'pending_otp',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, otpCode, otpExpiresAt]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Richiesta non trovata.' });
    }

    return res.json({ success:true, request:r.rows[0] });
  } catch (err) {
    console.error('admin followme regenerate otp error:', err);
    return res.status(500).json({ success:false, error:'Errore rigenerazione codice.' });
  }
});

app.post('/api/admin/followme/trial-request/:id/delete', requireAdmin, express.json(), async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ success:false, error:'ID richiesta mancante.' });

    const r = await pool.query(
      `DELETE FROM followme_trial_requests
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Richiesta non trovata.' });
    }

    return res.json({ success:true, deleted:true, id });
  } catch (err) {
    console.error('admin followme delete trial request error:', err);
    return res.status(500).json({ success:false, error:'Errore eliminazione richiesta.' });
  }
});
// end-admin-followme-trial-requests-api-20260525

// start-followme-trial-verify-api-20260525
app.post('/api/followme/trial/:id/verify', express.json({ limit:'20kb' }), async (req, res) => {
  try {
    await ensureFollowMeTrialRequestsTable20260525();

    const id = Number(req.params.id || 0);
    const otp = String(req.body?.otp || '').trim().replace(/\D/g, '');

    if (!id || !otp) {
      return res.status(400).json({ success:false, error:'Inserisci il codice ricevuto via WhatsApp.' });
    }

    const trialRes = await pool.query(
      `SELECT *
       FROM followme_trial_requests
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    const trial = trialRes.rows[0];

    if (!trial) {
      return res.status(404).json({ success:false, error:'Richiesta non trovata.' });
    }

    if (trial.code && trial.public_id) {
      return res.json({
        success:true,
        already_active:true,
        code:trial.code,
        public_id:trial.public_id,
        public_url:`/fm/${trial.public_id || trial.code}`,
        manage_url:`/followme-app.html?code=${encodeURIComponent(trial.code)}`
      });
    }

    if (!trial.otp_code || String(trial.otp_code).trim() !== otp) {
      return res.status(400).json({ success:false, error:'Codice non corretto.' });
    }

    if (trial.otp_expires_at && new Date(trial.otp_expires_at) < new Date()) {
      return res.status(400).json({ success:false, error:'Codice scaduto. Richiedi un nuovo codice.' });
    }

    const baseCode = 'FMTRIAL';
    let code = null;
    let publicId = null;

    for (let i = 0; i < 40; i++) {
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
      code = `${baseCode}${suffix}`;
      publicId = code;

      const exists = await pool.query(
        `SELECT 1 FROM followme_projects WHERE code = $1 OR public_id = $2 LIMIT 1`,
        [code, publicId]
      );

      if (!exists.rows.length) break;

      code = null;
      publicId = null;
    }

    if (!code || !publicId) {
      return res.status(500).json({ success:false, error:'Impossibile generare un QR univoco.' });
    }

    const rawInitialUrl = String(trial.initial_url || '').trim();
    let initialUrl = rawInitialUrl || 'https://771717.appmecard.it/communication';

    if (initialUrl && !/^https?:\/\//i.test(initialUrl) && !initialUrl.startsWith('/')) {
      initialUrl = 'https://' + initialUrl;
    }
    const trialStartedAt = new Date();
    const trialExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const projectIns = await pool.query(
      `INSERT INTO followme_projects
       (code, public_id, label, active_url, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'active',NOW(),NOW())
       RETURNING id, code, public_id, active_url`,
      [
        code,
        publicId,
        trial.full_name ? `Prova - ${trial.full_name}` : 'Prova FollowMe',
        initialUrl
      ]
    );

    await pool.query(
      `INSERT INTO followme_url_history
       (project_id, url, activated_at, last_used_at, scan_count)
       VALUES ($1,$2,NOW(),NULL,0)
       ON CONFLICT DO NOTHING`,
      [projectIns.rows[0].id, initialUrl]
    ).catch(() => null);

    await pool.query(
      `UPDATE followme_trial_requests
       SET otp_verified_at = NOW(),
           otp_status = 'verified',
           status = 'active',
           code = $2,
           public_id = $3,
           trial_started_at = $4,
           trial_expires_at = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [id, code, publicId, trialStartedAt, trialExpiresAt]
    );

    return res.json({
      success:true,
      active:true,
      code,
      public_id:publicId,
      public_url:`/fm/${publicId}`,
      manage_url:`/followme-app.html?code=${encodeURIComponent(code)}`,
      trial_expires_at:trialExpiresAt.toISOString()
    });

  } catch (err) {
    console.error('followme trial verify error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore attivazione prova FollowMe.',
      detail: err && err.message ? err.message : String(err || '')
    });
  }
});
// end-followme-trial-verify-api-20260525




app.get('/api/admin/followme/projects', requireAdmin, async (req, res) => {
  try {
    await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS blocked_reason TEXT`).catch(() => null);
    await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`).catch(() => null);
    const q = await pool.query(`
      SELECT
        p.id,
        p.code,
        p.public_id,
        p.label,
        p.active_url,
        p.status,
        p.created_at,
        p.updated_at,
        COALESCE(scan_stats.total_scans, 0)::int AS total_scans,
        COALESCE(current_stats.current_url_scans, 0)::int AS current_url_scans,
        scan_stats.last_scan_at,
        COALESCE(history_stats.history_count, 0)::int AS history_count
      FROM followme_projects p
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*)::int AS total_scans,
          MAX(created_at) AS last_scan_at
        FROM followme_scan_logs
        GROUP BY project_id
      ) scan_stats ON scan_stats.project_id = p.id
      LEFT JOIN (
        SELECT
          project_id,
          url,
          COALESCE(scan_count, 0)::int AS current_url_scans
        FROM followme_url_history
      ) current_stats
        ON current_stats.project_id = p.id
       AND LOWER(TRIM(COALESCE(current_stats.url,''))) = LOWER(TRIM(COALESCE(p.active_url,'')))
      LEFT JOIN (
        SELECT
          project_id,
          COUNT(*)::int AS history_count
        FROM followme_url_history
        GROUP BY project_id
      ) history_stats ON history_stats.project_id = p.id
      ORDER BY
        p.updated_at DESC NULLS LAST,
        p.created_at DESC NULLS LAST,
        p.id DESC
      LIMIT 200
    `);

    return res.json({
      success: true,
      projects: q.rows
    });
  } catch (err) {
    console.error('admin followme projects error:', err);
    return res.status(500).json({
      success: false,
      error: 'Errore caricamento progetti FollowMe.'
    });
  }
});


// start-admin-followme-isolated-provisioning-api-20260609
function followMeSafeSlug20260609(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function followMeRandomPart20260609(length) {
  const crypto = require('crypto');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(Math.max(16, length * 2));
  let out = '';
  for (let i = 0; i < bytes.length && out.length < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  while (out.length < length) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function makeFollowMeAdminRandomCode20260609() {
  return 'FM-' + followMeRandomPart20260609(8);
}

function makeFollowMeAdminRandomPublicId20260609(code) {
  const clean = followMeSafeSlug20260609(code).replace(/^FM-?/, '');
  return 'FM' + clean + followMeRandomPart20260609(3);
}

function getFollowMeProvisioningRoot20260609() {
  const path = require('path');
  const root = process.env.FOLLOWME_STORAGE_DIR
    ? path.resolve(process.env.FOLLOWME_STORAGE_DIR)
    : path.join(__dirname, 'data');

  return path.join(root, 'followme', 'projects');
}

function followMeProjectFolderName20260609(projectId, code) {
  const safeId = String(projectId || '0').replace(/[^0-9]/g, '') || '0';
  const safeCode = followMeSafeSlug20260609(code || 'FM');
  return safeId + '-' + safeCode;
}

async function ensureFollowMeProvisioningColumns20260609() {
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS activation_token TEXT`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS activation_locked BOOLEAN DEFAULT FALSE`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS storage_path TEXT`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS storage_key TEXT`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS created_by_role TEXT`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_mode_enabled BOOLEAN DEFAULT FALSE`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_public_token TEXT`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_token_rotated_at TIMESTAMPTZ`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT FALSE`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS info_requests_enabled BOOLEAN DEFAULT FALSE`).catch(() => null);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`).catch(() => null);
}

function createFollowMeProvisioningFolders20260609(projectRoot) {
  const fs = require('fs');
  const path = require('path');

  [
    'qr',
    'documents',
    'documents/thumbs',
    'images',
    'images/original',
    'images/preview',
    'voice',
    'voice/messages',
    'voice/active',
    'voice/archive',
    'chat',
    'chat/attachments',
    'chat/voice',
    'chat/exports',
    'exports',
    'logs'
  ].forEach((dir) => {
    fs.mkdirSync(path.join(projectRoot, dir), { recursive:true });
  });
}

function followMeSimplePage20260609(title, heading, text, code, actionHtml) {
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${esc(title)}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:22px}
    .card{width:min(520px,100%);border-radius:28px;background:#fff;border:1px solid rgba(17,24,39,.08);box-shadow:0 24px 70px rgba(17,24,39,.12);padding:28px}
    .kicker{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#3f79d8;margin-bottom:10px}
    h1{font-size:28px;line-height:1.04;margin:0 0 12px;letter-spacing:-.05em}
    p{font-size:15px;line-height:1.55;color:#4b5563;margin:0 0 12px}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
    a{border-radius:999px;padding:12px 15px;background:#111827;color:#fff;text-decoration:none;font-weight:900;font-size:14px}
    .secondary{background:#eef2ff;color:#233876}
    .code{margin-top:14px;font-size:12px;font-weight:800;color:#6b7280;word-break:break-word}
  </style>
</head>
<body>
  <main class="card">
    <div class="kicker">FollowMe QR</div>
    <h1>${esc(heading)}</h1>
    <p>${esc(text)}</p>
    <div class="code">Codice QR: ${esc(code)}</div>
    <div class="actions">${actionHtml || ''}</div>
  </main>
</body>
</html>`;
}

app.get('/followme/qrs/:code/:filename', async (req, res) => {
  try {
    await ensureFollowMeProvisioningColumns20260609();

    const code = followMeSafeSlug20260609(req.params.code || '');
    const filename = String(req.params.filename || '').trim();

    if (!code || !/^followme-[A-Z0-9_-]+-qr\.(png|svg)$/i.test(filename)) {
      return res.status(400).send('QR non valido.');
    }

    const q = await pool.query(
      `SELECT id, code, public_id, storage_path
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length || !q.rows[0].storage_path) {
      return res.status(404).send('QR non trovato.');
    }

    const path = require('path');
    const full = path.join(q.rows[0].storage_path, 'qr', filename);

    if (!full.startsWith(path.join(q.rows[0].storage_path, 'qr'))) {
      return res.status(400).send('Percorso non valido.');
    }

    return res.sendFile(full);
  } catch (err) {
    console.error('followme isolated qr file error:', err);
    return res.status(500).send('Errore caricamento QR.');
  }
});

app.get('/fm/expired/:public_id', async (req, res) => {
  const publicId = String(req.params.public_id || '').trim().toUpperCase();
  return res.status(402).send(followMeSimplePage20260609(
    'FollowMe QR scaduto',
    'QR non attivo',
    'Questo FollowMe QR è scaduto o deve essere rinnovato. Per riattivarlo sarà necessario procedere con un rinnovo o un pagamento.',
    publicId,
    `<a href="/fm/renew/${encodeURIComponent(publicId)}">Procedi al rinnovo</a>`
  ));
});

app.get('/fm/pending/:public_id', async (req, res) => {
  const publicId = String(req.params.public_id || '').trim().toUpperCase();
  return res.status(200).send(followMeSimplePage20260609(
    'FollowMe QR in attesa',
    'QR in attesa di attivazione',
    'Questo QR è stato creato, ma deve ancora essere completato con i dati richiesti. La procedura di attivazione verrà abilitata nella fase successiva.',
    publicId,
    `<a class="secondary" href="/">Torna al sito</a>`
  ));
});

app.get('/fm/not-configured/:public_id', async (req, res) => {
  const publicId = String(req.params.public_id || '').trim().toUpperCase();
  return res.status(200).send(followMeSimplePage20260609(
    'FollowMe QR pronto',
    'QR attivo, non ancora configurato',
    'Questo QR FollowMe è già attivo, ma non trasmette ancora una destinazione. Apri l’area gestione per impostare link, documento, immagine, chat o messaggio vocale.',
    publicId,
    `<a class="secondary" href="/">Torna al sito</a>`
  ));
});

app.get('/fm/renew/:public_id', async (req, res) => {
  const publicId = String(req.params.public_id || '').trim().toUpperCase();
  return res.status(200).send(followMeSimplePage20260609(
    'Rinnova FollowMe QR',
    'Rinnovo FollowMe QR',
    'Questa è la pagina predisposta per rinnovo o pagamento. Il collegamento al sistema di pagamento verrà aggiunto nella fase successiva.',
    publicId,
    `<a class="secondary" href="/">Torna al sito</a>`
  ));
});

app.post('/api/admin/followme/create-blank', requireAdmin, express.json({ limit:'32kb' }), async (req, res) => {
  try {
    if (typeof ensureFollowMeSchema === 'function') {
      await ensureFollowMeSchema();
    }

    await ensureFollowMeProvisioningColumns20260609();

    if (typeof ensureFollowMeChatV2Runtime === 'function') {
      await ensureFollowMeChatV2Runtime();
    } else if (typeof ensureFollowMeChatSchemaFast === 'function') {
      await ensureFollowMeChatSchemaFast();
    }

    const path = require('path');
    const fs = require('fs');
    const crypto = require('crypto');
    const QRCodeLib = QRCode || require('qrcode');

    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
    const validDaysRaw = Number(req.body?.valid_days || 365);
    const validDays = Number.isFinite(validDaysRaw) && validDaysRaw > 0 && validDaysRaw <= 3650 ? Math.floor(validDaysRaw) : 365;
    const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
    const activationToken = crypto.randomBytes(24).toString('hex');

    let created = null;
    let lastErr = null;

    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        const code = makeFollowMeAdminRandomCode20260609();
        const publicId = makeFollowMeAdminRandomPublicId20260609(code);
        const label = String(req.body?.label || '').trim() || 'Nuovo FollowMe QR';

        const chatToken = typeof makeFollowMeChatV2Token === 'function'
          ? makeFollowMeChatV2Token()
          : crypto.randomBytes(18).toString('hex').toUpperCase();

        const ins = await pool.query(
          `INSERT INTO followme_projects
           (code, public_id, label, active_url, status, expires_at,
            activation_token, activation_locked, created_by_role,
            chat_mode_enabled, chat_public_token, chat_token_rotated_at,
            bot_enabled, info_requests_enabled, created_at, updated_at)
           VALUES
           ($1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, NOW(),
            $12, $13, NOW(), NOW())
           RETURNING id, code, public_id, label, active_url, status, expires_at,
                     activation_token, activation_locked, storage_path, storage_key,
                     chat_mode_enabled, chat_public_token, bot_enabled,
                     info_requests_enabled, created_at, updated_at`,
          [
            code,
            publicId,
            label,
            '',
            'active',
            expiresAt,
            activationToken,
            false,
            'admin',
            false,
            chatToken,
            false,
            false
          ]
        );

        const project = ins.rows[0];
        const storageRoot = getFollowMeProvisioningRoot20260609();
        const folderName = followMeProjectFolderName20260609(project.id, project.code);
        const projectRoot = path.join(storageRoot, folderName);

        createFollowMeProvisioningFolders20260609(projectRoot);

        const safePublicId = followMeSafeSlug20260609(project.public_id);
        const safeCode = followMeSafeSlug20260609(project.code);

        const publicUrl = `/fm/u/${encodeURIComponent(project.public_id)}`;
        const fullPublicUrl = `${baseUrl}${publicUrl}`;
        const manageUrl = `/followme-app.html?code=${encodeURIComponent(project.code)}`;
        const activationUrl = `/fm/activate/${encodeURIComponent(project.public_id)}?token=${encodeURIComponent(activationToken)}`;

        const pngFile = `followme-${safePublicId}-qr.png`;
        const svgFile = `followme-${safePublicId}-qr.svg`;
        const pngPath = path.join(projectRoot, 'qr', pngFile);
        const svgPath = path.join(projectRoot, 'qr', svgFile);

        await QRCodeLib.toFile(pngPath, fullPublicUrl, {
          type:'png',
          width:1200,
          margin:2,
          errorCorrectionLevel:'H',
          color:{ dark:'#111111', light:'#FFFFFF' }
        });

        await QRCodeLib.toFile(svgPath, fullPublicUrl, {
          type:'svg',
          margin:2,
          errorCorrectionLevel:'H',
          color:{ dark:'#111111', light:'#FFFFFF' }
        });

        const manifest = {
          version:'followme-isolated-provisioning-20260609',
          project_id:project.id,
          code:project.code,
          public_id:project.public_id,
          status:'active',
          created_by_role:'admin',
          created_at:new Date().toISOString(),
          expires_at:expiresAt.toISOString(),
          public_url:fullPublicUrl,
          manage_url:`${baseUrl}${manageUrl}`,
          activation_url:`${baseUrl}${activationUrl}`,
          storage_key:folderName,
          folders:[
            'qr',
            'documents',
            'documents/thumbs',
            'images',
            'images/original',
            'images/preview',
            'voice/messages',
            'voice/active',
            'voice/archive',
            'chat/attachments',
            'chat/voice',
            'chat/exports',
            'exports',
            'logs'
          ],
          files:{
            qr_png:path.join('qr', pngFile),
            qr_svg:path.join('qr', svgFile)
          }
        };

        fs.writeFileSync(path.join(projectRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        await pool.query(
          `UPDATE followme_projects
           SET storage_path = $2,
               storage_key = $3,
               updated_at = NOW()
           WHERE id = $1`,
          [project.id, projectRoot, folderName]
        );

        created = {
          project:{
            ...project,
            storage_path:projectRoot,
            storage_key:folderName,
            expires_at:expiresAt.toISOString()
          },
          code:project.code,
          public_id:project.public_id,
          status:'active',
          expires_at:expiresAt.toISOString(),
          valid_days:validDays,
          public_url:publicUrl,
          full_public_url:fullPublicUrl,
          manage_url:manageUrl,
          full_manage_url:`${baseUrl}${manageUrl}`,
          activation_url:activationUrl,
          full_activation_url:`${baseUrl}${activationUrl}`,
          qr_png_url:`/followme/qrs/${encodeURIComponent(safeCode)}/${encodeURIComponent(pngFile)}`,
          qr_svg_url:`/followme/qrs/${encodeURIComponent(safeCode)}/${encodeURIComponent(svgFile)}`,
          storage_key:folderName,
          storage_path:projectRoot,
          chat_public_token:chatToken,
          chat_ready:true,
          chat_mode_enabled:false,
          voice_ready:true,
          documents_ready:true,
          images_ready:true
        };

        break;
      } catch (err) {
        lastErr = err;
        if (err && err.code === '23505') continue;
        throw err;
      }
    }

    if (!created) {
      console.error('admin followme isolated create duplicate attempts failed:', lastErr);
      return res.status(500).json({
        success:false,
        error:'Non sono riuscito a generare un QR FollowMe casuale univoco.'
      });
    }

    return res.json({ success:true, ...created });
  } catch (err) {
    console.error('admin followme isolated create error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore creazione QR FollowMe isolato.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


// start-followme-url-only-activation-20260609
function normalizeFollowMeActivationUrl20260609(value) {
  let url = String(value || '').trim();

  if (!url) {
    return '';
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    throw new Error('Inserisci un indirizzo valido.');
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error('Sono ammessi solo link http o https.');
  }

  return parsed.toString();
}

function followMeActivateUrlPage20260609(project, errorMessage) {
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));

  const publicId = project && (project.public_id || project.code) ? String(project.public_id || project.code) : '';
  const action = '/api/followme/' + encodeURIComponent(publicId) + '/activate-url';

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Attiva il tuo FollowMe QR</title>
  <style>
    :root{
      --bg:#f5f7fb;
      --card:#ffffff;
      --text:#111827;
      --muted:#64748b;
      --line:rgba(17,24,39,.09);
      --blue:#3f79d8;
      --dark:#111827;
      --err:#b91c1c;
      --errbg:#fef2f2;
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      min-height:100vh;
      display:grid;
      place-items:center;
      background:
        radial-gradient(circle at top left, rgba(63,121,216,.16), transparent 34%),
        var(--bg);
      color:var(--text);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      padding:22px;
    }
    .card{
      width:min(520px,100%);
      border-radius:30px;
      background:var(--card);
      border:1px solid var(--line);
      box-shadow:0 24px 80px rgba(17,24,39,.13);
      padding:28px;
    }
    .kicker{
      display:inline-flex;
      border-radius:999px;
      padding:7px 10px;
      background:#eef4ff;
      color:#2459a8;
      font-size:12px;
      font-weight:950;
      letter-spacing:.08em;
      text-transform:uppercase;
      margin-bottom:14px;
    }
    h1{
      margin:0 0 10px;
      font-size:30px;
      line-height:1.02;
      letter-spacing:-.055em;
    }
    p{
      margin:0 0 18px;
      color:var(--muted);
      font-size:15px;
      line-height:1.5;
      font-weight:650;
    }
    label{
      display:block;
      font-size:13px;
      font-weight:950;
      margin:0 0 8px;
      color:#263142;
    }
    input{
      width:100%;
      border:1px solid rgba(15,23,42,.14);
      border-radius:18px;
      padding:15px 15px;
      font-size:16px;
      outline:none;
      background:#fff;
      color:#111827;
      box-shadow:0 1px 0 rgba(15,23,42,.02);
    }
    input:focus{
      border-color:rgba(63,121,216,.65);
      box-shadow:0 0 0 4px rgba(63,121,216,.12);
    }
    .hint{
      margin-top:8px;
      font-size:12px;
      color:#7b8798;
      font-weight:700;
      line-height:1.4;
    }
    .err{
      margin:0 0 14px;
      padding:12px 13px;
      border-radius:16px;
      background:var(--errbg);
      color:var(--err);
      font-size:13px;
      line-height:1.4;
      font-weight:850;
      border:1px solid rgba(185,28,28,.16);
    }
    button{
      width:100%;
      margin-top:18px;
      border:0;
      border-radius:999px;
      padding:15px 16px;
      background:var(--dark);
      color:white;
      font-size:15px;
      font-weight:950;
      cursor:pointer;
    }
    button:disabled{opacity:.65;cursor:wait}
    .code{
      margin-top:16px;
      font-size:12px;
      color:#8a94a6;
      font-weight:800;
      word-break:break-word;
      text-align:center;
    }
    .small{
      margin-top:16px;
      padding-top:14px;
      border-top:1px solid rgba(15,23,42,.08);
      color:#7b8798;
      font-size:12px;
      line-height:1.45;
      font-weight:700;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="kicker">FollowMe QR</div>
    <h1>Attiva il tuo QR</h1>
    <p>Inserisci il primo link che vuoi trasmettere. Dopo l’attivazione potrai modificarlo e scoprire le altre funzioni dalla tua Web App.</p>

    ${errorMessage ? `<div class="err">${esc(errorMessage)}</div>` : ''}

    <form id="followmeActivateForm" method="post" action="${esc(action)}">
      <label for="initialUrl">Link da trasmettere</label>
      <input id="initialUrl" name="initial_url" type="url" inputmode="url" autocomplete="url" placeholder="https://www.tuosito.it" required>
      <div class="hint">Puoi inserire un sito, una pagina social, un catalogo, un documento online o qualsiasi link pubblico.</div>
      <button id="submitBtn" type="submit">Attiva QR</button>
    </form>

    <div class="code">Codice QR: ${esc(publicId)}</div>
    <div class="small">Ti porteremo subito alla Web App di gestione, dove potrai salvare l’app sul dispositivo e attivare le notifiche.</div>
  </main>

  <script>
    (function(){
      var form = document.getElementById('followmeActivateForm');
      var btn = document.getElementById('submitBtn');
      if(!form) return;

      form.addEventListener('submit', async function(ev){
        ev.preventDefault();

        if(btn){
          btn.disabled = true;
          btn.textContent = 'Attivo...';
        }

        try{
          var fd = new FormData(form);
          var res = await fetch(form.action, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body:JSON.stringify({ initial_url: fd.get('initial_url') || '' })
          });

          var data = await res.json().catch(function(){ return {}; });

          if(!res.ok || !data.success){
            throw new Error(data.error || 'Non è stato possibile attivare il QR.');
          }

          window.location.href = data.manage_url || '/followme-app.html?code=' + encodeURIComponent(data.code || '') + '&onboarding=1';
        }catch(err){
          alert(err.message || err);
          if(btn){
            btn.disabled = false;
            btn.textContent = 'Attiva QR';
          }
        }
      });
    })();
  </script>
</body>
</html>`;
}

app.get('/fm/activate/:public_id', async (req, res) => {
  try {
    if (typeof ensureFollowMeProvisioningColumns20260609 === 'function') {
      await ensureFollowMeProvisioningColumns20260609();
    }

    const raw = String(req.params.public_id || '').trim();
    const publicId = typeof normalizeFollowMePublicId === 'function'
      ? normalizeFollowMePublicId(raw)
      : raw.toUpperCase();

    const q = await pool.query(
      `SELECT id, code, public_id, status, active_url, expires_at, activation_locked, blocked_at
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) {
      return res.status(404).send(followMeSimplePage20260609(
        'FollowMe QR non trovato',
        'QR non trovato',
        'Questo QR FollowMe non risulta registrato.',
        publicId,
        '<a class="secondary" href="/">Torna al sito</a>'
      ));
    }

    const project = q.rows[0];

    if (project.blocked_at || String(project.status || '').toLowerCase() === 'blocked') {
      return res.redirect(302, '/fm/expired/' + encodeURIComponent(project.public_id || project.code || publicId));
    }

    if (project.expires_at && new Date(project.expires_at).getTime() <= Date.now()) {
      return res.redirect(302, '/fm/expired/' + encodeURIComponent(project.public_id || project.code || publicId));
    }

    if (project.activation_locked === true) {
      return res.status(403).send(followMeSimplePage20260609(
        'FollowMe QR bloccato',
        'Attivazione bloccata',
        'L’attivazione pubblica di questo QR è stata bloccata dall’amministratore.',
        project.public_id || project.code || publicId,
        '<a class="secondary" href="/">Torna al sito</a>'
      ));
    }

    return res.status(200).send(followMeActivateUrlPage20260609(project));
  } catch (err) {
    console.error('followme activate page error:', err);
    return res.status(500).send('Errore apertura attivazione FollowMe.');
  }
});

app.post('/api/followme/:public_id/activate-url', express.json({ limit:'32kb' }), async (req, res) => {
  try {
    if (typeof ensureFollowMeProvisioningColumns20260609 === 'function') {
      await ensureFollowMeProvisioningColumns20260609();
    }

    const raw = String(req.params.public_id || '').trim();
    const publicId = typeof normalizeFollowMePublicId === 'function'
      ? normalizeFollowMePublicId(raw)
      : raw.toUpperCase();

    const initialUrl = normalizeFollowMeActivationUrl20260609(req.body && req.body.initial_url);

    if (!initialUrl) {
      return res.status(400).json({
        success:false,
        error:'Inserisci il link da trasmettere.'
      });
    }

    const q = await pool.query(
      `SELECT id, code, public_id, status, active_url, expires_at, activation_locked, blocked_at
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) {
      return res.status(404).json({
        success:false,
        error:'QR FollowMe non trovato.'
      });
    }

    const project = q.rows[0];

    if (project.blocked_at || String(project.status || '').toLowerCase() === 'blocked') {
      return res.status(403).json({
        success:false,
        error:'Questo QR non è attivo.'
      });
    }

    if (project.expires_at && new Date(project.expires_at).getTime() <= Date.now()) {
      try {
        await pool.query(
          `UPDATE followme_projects
           SET status = CASE WHEN LOWER(COALESCE(status,'')) = 'active' THEN 'expired' ELSE status END,
               updated_at = NOW()
           WHERE id = $1`,
          [project.id]
        );
      } catch(e) {}

      return res.status(402).json({
        success:false,
        error:'Questo QR è scaduto. Procedi al rinnovo.'
      });
    }

    if (project.activation_locked === true) {
      return res.status(403).json({
        success:false,
        error:'L’attivazione pubblica è bloccata dall’amministratore.'
      });
    }

    const upd = await pool.query(
      `UPDATE followme_projects
       SET active_url = $2,
           status = 'active',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, code, public_id, active_url, status`,
      [project.id, initialUrl]
    );

    const row = upd.rows[0];
    const manageUrl = '/followme-app.html?code=' + encodeURIComponent(row.code) + '&onboarding=1&activated=1';

    return res.json({
      success:true,
      code:row.code,
      public_id:row.public_id,
      active_url:row.active_url,
      status:row.status,
      manage_url:manageUrl
    });
  } catch (err) {
    console.error('followme activate url error:', err);
    return res.status(400).json({
      success:false,
      error:String(err && err.message ? err.message : 'Errore attivazione QR.')
    });
  }
});
// end-followme-url-only-activation-20260609


// end-admin-followme-isolated-provisioning-api-20260609


// end-admin-followme-projects-api-20260525

// start-admin-followme-block-unblock-api-20260525
app.post('/api/admin/followme/project/:code/block', requireAdmin, express.json(), async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!code) {
      return res.status(400).json({ success:false, error:'Codice QR mancante.' });
    }

    const q = await pool.query(
      `UPDATE followme_projects
       SET status = 'blocked',
           blocked_reason = COALESCE(NULLIF($2,''), blocked_reason),
           blocked_at = NOW(),
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING id, code, public_id, label, active_url, status, blocked_reason, blocked_at`,
      [code, reason]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'QR FollowMe non trovato.' });
    }

    return res.json({
      success:true,
      project:q.rows[0],
      // FOLLOWME_UPDATE_URL_RETURN_SAFE_BROWSING_RESULT_20260528
      url_security:req.followmeUrlSecurity20260528 || null
    });
  } catch (err) {
    console.error('admin followme block error:', err);
    return res.status(500).json({ success:false, error:'Errore blocco QR FollowMe.' });
  }
});

app.post('/api/admin/followme/project/:code/unblock', requireAdmin, express.json(), async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({ success:false, error:'Codice QR mancante.' });
    }

    const q = await pool.query(
      `UPDATE followme_projects
       SET status = 'active',
           blocked_reason = NULL,
           blocked_at = NULL,
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING id, code, public_id, label, active_url, status, blocked_reason, blocked_at`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'QR FollowMe non trovato.' });
    }

    return res.json({ success:true, project:q.rows[0] });
  } catch (err) {
    console.error('admin followme unblock error:', err);
    return res.status(500).json({ success:false, error:'Errore sblocco QR FollowMe.' });
  }
});
// end-admin-followme-block-unblock-api-20260525


// start-admin-followme-delete-project-api-20260525
app.post('/api/admin/followme/project/:code/delete', requireAdmin, express.json(), async (req, res) => {
  const client = await pool.connect();

  try {
    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({ success:false, error:'Codice QR mancante.' });
    }

    await client.query('BEGIN');

    const projectRes = await client.query(
      `SELECT id, code, public_id, label, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success:false, error:'QR FollowMe non trovato.' });
    }

    const project = projectRes.rows[0];

    const safeDelete = async (sql, params) => {
      try {
        await client.query(sql, params);
      } catch (e) {
        console.warn('followme delete optional table warning:', e.message);
      }
    };

    await safeDelete(`DELETE FROM followme_content_reviews WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_usage_events WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_scan_logs WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_url_history WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_documents WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_image_cards WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_chat_messages WHERE project_id = $1`, [project.id]);
    await safeDelete(`DELETE FROM followme_chat_sessions WHERE project_id = $1`, [project.id]);

    await client.query(`DELETE FROM followme_projects WHERE id = $1`, [project.id]);

    await client.query('COMMIT');

    return res.json({
      success:true,
      deleted:true,
      project:{
        id:project.id,
        code:project.code,
        public_id:project.public_id,
        label:project.label
      }
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e) {}
    console.error('admin followme delete project error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore eliminazione definitiva QR FollowMe.'
    });
  } finally {
    client.release();
  }
});
// end-admin-followme-delete-project-api-20260525



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



// CITOFONAMI_LATEST_ANSWERED_OPEN_FIX_20260609
// Rende interrogabile l'ultima chiamata anche dopo che l'admin ha risposto.
// Serve al clone leggero: la chiamata non deve sparire appena passa da pending ad answered.
app.get('/api/citofonami/:code/calls/latest-open', (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();

    if (!global.citofonamiCalls) {
      global.citofonamiCalls = {};
    }

    const all = Object.values(global.citofonamiCalls || {})
      .filter(call => String(call.code || '').trim().toUpperCase() === code)
      .filter(call => ['pending', 'answered', 'open', 'ringing'].includes(String(call.status || '').toLowerCase()))
      .sort((a, b) => {
        const ad = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bd = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bd - ad;
      });

    const call = all[0];

    if (!call) {
      return res.status(404).json({
        ok: false,
        error: 'Chiamata aperta non trovata'
      });
    }

    return res.json({
      ok: true,
      code,
      call
    });
  } catch (err) {
    console.error('citofonami latest-open error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Errore lettura ultima chiamata aperta'
    });
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

  /*
    FIX FOLLOWME 20260520:
    Se la destinazione è una rotta interna, deve restare relativa.
    Esempio:
      /fm/document/FMDEMO
    NON deve diventare:
      https:///fm/document/FMDEMO
  */
  if (url.startsWith('/')) return url;

  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

function makeFollowMeCode() {
  return 'FM-' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

function makeFollowMePublicId() {
  return 'FM' + Math.random().toString(36).slice(2, 10).toUpperCase();
}



// FOLLOWME_PUSH_BADGE_UNREAD_COUNT_20260529
async function getFollowMeUnreadActivityCount20260529(projectId) {
  try {
    await ensureFollowMeActivityCounters20260529();

    const q = await pool.query(
      `SELECT
         COALESCE(activity_reset_total_scans,0)::int AS scan_base,
         COALESCE(activity_reset_chat_requests,0)::int AS chat_base
       FROM followme_projects
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    );

    const snap = await getFollowMeActivitySnapshot20260529(projectId);
    const scanBase = Number(q.rows[0]?.scan_base || 0);
    const chatBase = Number(q.rows[0]?.chat_base || 0);

    return Math.max(0,
      Math.max(0, snap.total_scans - scanBase) +
      Math.max(0, snap.total_chat_requests - chatBase)
    );
  } catch(e) {
    return 1;
  }
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

    const unreadCount = await getFollowMeUnreadActivityCount20260529(project.id);

    const payload = JSON.stringify({
      title: "Follow Me QR 👀",
      body: "Hanno appena inquadrato il tuo QR 👀",
      unreadCount: unreadCount,
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



// FOLLOWME_PLACEHOLDER_MANIFEST_20260609
app.get('/fm/manifest/placeholder.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res.json({
    name:'FollowMe QR',
    short_name:'FollowMe',
    start_url:'/followme-app.html',
    scope:'/',
    display:'standalone',
    background_color:'#0f172a',
    theme_color:'#0f172a',
    icons:[
      { src:'/icons/icon-192.png', sizes:'192x192', type:'image/png' },
      { src:'/icons/icon-512.png', sizes:'512x512', type:'image/png' }
    ]
  });
});

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




// FOLLOWME_CLEAN_QR_APP_ROUTE_20260610
app.get('/fm/app-new/:public_id', async (req, res) => {
  try {
    res.set({
      'Cache-Control':'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma':'no-cache',
      'Expires':'0',
      'Surrogate-Control':'no-store'
    });
    return res.sendFile(path.join(__dirname, 'public', 'followme-qr-app.html'));
  } catch (err) {
    console.error('followme clean qr app route error:', err);
    return res.status(500).send('Errore apertura FollowMe QR App');
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
       LIMIT 20`,
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



/* ============================================================
   FOLLOWME REAL CHAT MODE - STEP 1
   ============================================================ */

async function ensureFollowMeChatSchema() {
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_mode_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_public_token TEXT`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_token_rotated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  // followme-bot-default-off-db-normalize-20260527
  await pool.query(`UPDATE followme_projects SET bot_enabled = FALSE WHERE bot_enabled IS NULL`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_chat_sessions (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      chat_public_token TEXT NOT NULL,
      visitor_label TEXT,
      display_name TEXT,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ,
      owner_opened_at TIMESTAMPTZ
    )
  `);

  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS display_name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES followme_chat_sessions(id) ON DELETE CASCADE,
      project_id BIGINT NOT NULL,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS followme_projects_chat_public_token_uq ON followme_projects(chat_public_token) WHERE chat_public_token IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS followme_chat_sessions_project_idx ON followme_chat_sessions(project_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS followme_chat_messages_session_idx ON followme_chat_messages(session_id, id ASC)`);
}

function makeFollowMeChatToken() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}


/* followme-bot-off-hard-guard-20260527 */
function followMeBotAllowed20260527(project) {
  return project && project.bot_enabled === true;
}

function followMeOwnerInformedMessage20260527() {
  return 'Il proprietario è stato informato. Attendi una risposta.';
}


async function ensureFollowMeChatToken(projectId) {
  await ensureFollowMeChatSchemaFast();

  const current = await pool.query(
    `SELECT chat_public_token FROM followme_projects WHERE id = $1 LIMIT 1`,
    [projectId]
  );

  if (current.rows[0]?.chat_public_token) {
    return current.rows[0].chat_public_token;
  }

  for (let i = 0; i < 8; i++) {
    const token = makeFollowMeChatToken();
    try {
      await pool.query(
        `UPDATE followme_projects
         SET chat_public_token = $2, chat_token_rotated_at = NOW()
         WHERE id = $1`,
        [projectId, token]
      );
      return token;
    } catch (err) {
      if (!String(err.message || '').includes('duplicate')) throw err;
    }
  }

  throw new Error('Impossibile generare token chat.');
}

async function sendFollowMeNewChatPush(project, sessionId) {
  try {
    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM followme_push_subscriptions
       WHERE project_id = $1
       ORDER BY updated_at DESC
       LIMIT 20`,
      [project.id]
    );

    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || 'https://adesivo-auto.onrender.com';
    const canonicalCode = String(project.code || '').trim().toUpperCase();
    const relativeTargetUrl = `/fm/app/${encodeURIComponent(canonicalCode)}?chatSession=${encodeURIComponent(sessionId)}&focus=chat`;
    const targetUrl = baseUrl.replace(/\/$/, '') + relativeTargetUrl;

    const payload = JSON.stringify({
      title: 'Nuovo utente in chat 💬',
      body: 'Una nuova persona si è collegata al tuo FollowMe QR.',
      url: targetUrl,
      targetUrl,
      relativeTargetUrl,
      type: 'followme_chat_new_user',
      code: canonicalCode,
      session_id: sessionId,
      icon: '/images/followme/icons/followme-icon-192.png',
      badge: '/images/followme/icons/followme-icon-192.png',
      timestamp: Date.now(),
      data: {
        type: 'followme_chat_new_user',
        code: canonicalCode,
        session_id: sessionId,
        url: targetUrl,
        targetUrl,
        relativeTargetUrl
      }
    });

    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
        } else {
          console.error('followme chat push error:', err.statusCode || '', err.body || err.message || err);
        }
      }
    }
  } catch (err) {
    console.error('sendFollowMeNewChatPush error:', err.message || err);
  }
}

/* Intercetta il QR pubblico FollowMe: se chat attiva, apre URL chat randomizzato. */
app.get('/__disabled_legacy_fm_u/:public_id', async (req, res, next) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const publicId = normalizeFollowMePublicId(req.params.public_id);

    const projectRes = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token, bot_enabled
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!projectRes.rows.length) return next();

    const project = projectRes.rows[0];

    if (project.chat_mode_enabled === true) {
      /*
        Chat V2 attiva: il QR pubblico deve aprire subito la nuova chat utente.
        Niente vecchia /fm/chat/c, niente return appeso.
      */
      await ensureFollowMeChatV2Runtime();

      let token = project.chat_public_token;
      if (!token) {
        token = await ensureFollowMeChatV2Token(project.id);
      }

      return res.redirect(302, '/fm/chat-v2/c/' + encodeURIComponent(token));
    }

    return next();
  } catch (err) {
    console.error('followme chat intercept error:', err);
    return next();
  }
});


// FOLLOWME_LEGACY_CHAT_ENABLE_TO_V2_20260528
app.post('/api/followme/:code/chat/enable', express.json(), async function(req, res) {
  try {
    /*
      BLOCCO DEFINITIVO VECCHIA CHAT FOLLOWME.
      Qualsiasi vecchio pulsante/frontend che chiama /chat/enable
      viene forzato alla Chat V2.
    */

    if (typeof ensureFollowMeChatV2Runtime === 'function') {
      await ensureFollowMeChatV2Runtime();
    }

    const rawCode = String(req.params.code || '').trim();
    const code = typeof normalizeFollowMeChatV2Code === 'function'
      ? normalizeFollowMeChatV2Code(rawCode)
      : rawCode;

    const q = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({
        success:false,
        error:'FollowMe QR non trovato.'
      });
    }

    const project = q.rows[0];

    let token = String(project.chat_public_token || '').trim();

    if (!token) {
      if (typeof rotateFollowMeChatV2Token === 'function') {
        token = await rotateFollowMeChatV2Token(project.id);
      } else if (typeof ensureFollowMeChatV2Token === 'function') {
        token = await ensureFollowMeChatV2Token(project.id);
      } else {
        token = Math.random().toString(36).slice(2, 14).toUpperCase();
        await pool.query(
          `UPDATE followme_projects
           SET chat_public_token = $2,
               chat_token_rotated_at = NOW(),
               updated_at = NOW()
           WHERE id = $1`,
          [project.id, token]
        );
      }
    }

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = TRUE,
           bot_enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [project.id]
    );

    return res.json({
      success:true,
      forced_v2:true,
      legacy_chat_disabled:true,
      chat_mode_enabled:true,
      bot_enabled:false,
      project_code:project.code,
      public_id:project.public_id,
      chat_public_token:token,
      chat_url:'/fm/chat-v2/c/' + encodeURIComponent(token),
      admin_url:'/fm/chat-v2/admin/' + encodeURIComponent(project.code || code)
    });
  } catch (err) {
    console.error('legacy followme chat enable forced to v2 error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore attivazione Chat V2 da vecchio percorso.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


app.post('/api/followme/:code/chat/enable', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const projectRes = await pool.query(
      `SELECT id, code, public_id, bot_enabled FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];
    const token = await ensureFollowMeChatToken(project.id);

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = TRUE,
           bot_enabled = FALSE
       WHERE id = $1`,
      [project.id]
    );

    return res.json({
      success:true,
      chat_mode_enabled:true,
      bot_enabled:false,
      chat_public_token:token,
      chat_url:`/fm/chat/c/${token}`
    });
  } catch (err) {
    console.error('followme chat enable error:', err);
    return res.status(500).json({ success:false, error:'Errore attivazione chat.' });
  }
});



app.post('/api/followme/:code/chat/session/:session_id/reset', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const projectRes = await pool.query(
      `SELECT id, code
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];

    const sessionCheck = await pool.query(
      `SELECT id
       FROM followme_chat_sessions
       WHERE id = $1 AND project_id = $2
       LIMIT 1`,
      [sessionId, project.id]
    );

    if (!sessionCheck.rows.length) {
      return res.status(404).json({ success:false, error:'Chat non trovata.' });
    }

    const deletedMessages = await pool.query(
      `DELETE FROM followme_chat_messages
       WHERE session_id = $1 AND project_id = $2
       RETURNING id`,
      [sessionId, project.id]
    );

    const deletedSession = await pool.query(
      `DELETE FROM followme_chat_sessions
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [sessionId, project.id]
    );

    return res.json({
      success:true,
      reset:'single',
      project_code:project.code,
      deleted_sessions:deletedSession.rows.length,
      deleted_messages:deletedMessages.rows.length
    });
  } catch (err) {
    console.error('followme chat single reset error:', err);
    return res.status(500).json({ success:false, error:'Errore pulizia chat corrente.' });
  }
});

app.post('/api/followme/:code/chat/reset', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);

    const projectRes = await pool.query(
      `SELECT id, code
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];

    const deletedMessages = await pool.query(
      `DELETE FROM followme_chat_messages
       WHERE project_id = $1
       RETURNING id`,
      [project.id]
    );

    const deletedSessions = await pool.query(
      `DELETE FROM followme_chat_sessions
       WHERE project_id = $1
       RETURNING id`,
      [project.id]
    );

    return res.json({
      success:true,
      reset:true,
      project_code:project.code,
      deleted_sessions:deletedSessions.rows.length,
      deleted_messages:deletedMessages.rows.length
    });
  } catch (err) {
    console.error('followme chat reset error:', err);
    return res.status(500).json({ success:false, error:'Errore pulizia chat.' });
  }
});

app.post('/api/followme/:code/chat/disable', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const projectRes = await pool.query(
      `SELECT id FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = FALSE
       WHERE id = $1`,
      [projectRes.rows[0].id]
    );

    return res.json({ success:true, chat_mode_enabled:false });
  } catch (err) {
    console.error('followme chat disable error:', err);
    return res.status(500).json({ success:false, error:'Errore spegnimento chat.' });
  }
});

app.post('/api/followme/:code/chat/rotate-token', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const projectRes = await pool.query(
      `SELECT id FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const projectId = projectRes.rows[0].id;

    let token = '';
    for (let i = 0; i < 8; i++) {
      token = makeFollowMeChatToken();
      try {
        await pool.query(
          `UPDATE followme_projects
           SET chat_public_token = $2, chat_token_rotated_at = NOW()
           WHERE id = $1`,
          [projectId, token]
        );
        break;
      } catch (err) {
        if (i === 7) throw err;
      }
    }

    return res.json({ success:true, chat_public_token:token, chat_url:`/fm/chat/c/${token}` });
  } catch (err) {
    console.error('followme chat rotate-token error:', err);
    return res.status(500).json({ success:false, error:'Errore rigenerazione URL chat.' });
  }
});


// followme-selected-closed-static-page-final-20260519
app.get('/fm/chat/closed', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  return res.send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Conversazione conclusa</title>
  <style>
    html,body{
      margin:0;
      padding:0;
      min-height:100%;
      background:#020617;
      overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    }

    body{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:28px;
      box-sizing:border-box;
      color:#f8fafc;
      background:
        radial-gradient(circle at 50% 18%, rgba(59,130,246,.26), transparent 33%),
        radial-gradient(circle at 20% 82%, rgba(168,85,247,.18), transparent 31%),
        linear-gradient(145deg, #020617 0%, #0f172a 48%, #020617 100%);
    }

    .shell{
      position:relative;
      width:min(430px,100%);
      border-radius:32px;
      padding:38px 28px 34px;
      text-align:center;
      background:rgba(15,23,42,.72);
      border:1px solid rgba(255,255,255,.12);
      box-shadow:
        0 28px 90px rgba(0,0,0,.42),
        inset 0 1px 0 rgba(255,255,255,.08);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
      overflow:hidden;
    }

    .shell:before{
      content:"";
      position:absolute;
      inset:0;
      background:linear-gradient(120deg, rgba(255,255,255,.16), transparent 34%, transparent 70%, rgba(255,255,255,.06));
      pointer-events:none;
    }

    .orb{
      width:62px;
      height:62px;
      border-radius:999px;
      margin:0 auto 20px;
      background:
        radial-gradient(circle at 35% 28%, #ffffff, #93c5fd 30%, #2563eb 68%, #1e1b4b 100%);
      box-shadow:
        0 0 0 8px rgba(59,130,246,.10),
        0 20px 48px rgba(37,99,235,.42);
    }

    .kicker{
      position:relative;
      z-index:1;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:26px;
      padding:0 12px;
      border-radius:999px;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);
      color:#bfdbfe;
      font-weight:900;
      font-size:12px;
      letter-spacing:.08em;
      text-transform:uppercase;
      margin-bottom:16px;
    }

    h1{
      position:relative;
      z-index:1;
      margin:0 0 12px;
      color:#ffffff;
      font-size:34px;
      line-height:1.02;
      letter-spacing:-.055em;
      font-weight:950;
    }

    .lead{
      position:relative;
      z-index:1;
      margin:0 auto;
      max-width:320px;
      color:#cbd5e1;
      font-size:17px;
      line-height:1.42;
      font-weight:650;
    }

    .small{
      position:relative;
      z-index:1;
      margin:18px 0 0;
      color:#94a3b8;
      font-size:13px;
      line-height:1.35;
      font-weight:700;
    }
  </style>
</head>
<body>
  <section class="shell">
    <div class="orb"></div>
    <div class="kicker">FollowMe Chat</div>
    <h1>Conversazione conclusa</h1>
    <p class="lead">Questa chat è stata chiusa dal proprietario.</p>
    <p class="small">Grazie per averci contattato.</p>
  </section>
</body>
</html>`);
});
// end-followme-selected-closed-static-page-final-20260519



// followme-document-thumbnail-server-final-20260520
async function ensureFollowMeDocumentThumbnailColumn20260520() {
  await ensureFollowMeDocumentTable20260520();
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS thumbnail_path TEXT`);
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS thumbnail_data_url TEXT`);
}

function followmeCleanBase64Image20260520(v) {
  v = String(v || '').trim();
  if (!v) return null;

  const m = v.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!m) return null;

  const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  const base64 = m[2];

  if (!base64 || base64.length > 1800000) return null;

  try {
    return {
      ext: ext === 'jpeg' ? 'jpg' : ext,
      buffer: Buffer.from(base64, 'base64')
    };
  } catch(e) {
    return null;
  }
}

async function saveFollowMeDocumentThumbnail20260520(projectId, documentId, thumbnailBase64) {
  const img = followmeCleanBase64Image20260520(thumbnailBase64);
  if (!img || !img.buffer || !img.buffer.length) return null;

  /*
    Thumbnail PDF FollowMe persistente:
    usa lo stesso storage del PDF principale.
    In locale: public/uploads/followme-documents/thumbs
    Su Render: /var/data/uploads/followme-documents/thumbs se FOLLOWME_STORAGE_DIR=/var/data
  */
  const projectThumbDirName = `project-${projectId}`;
  const dir = path.join(FOLLOWME_DOCUMENTS_DISK_DIR, 'thumbs', projectThumbDirName);
  await fs.promises.mkdir(dir, { recursive:true });

  /*
    Nome fisso per QR/progetto:
    ogni nuovo PDF sostituisce la preview precedente.
    Prima puliamo eventuali preview vecchie, anche quelle generate con il vecchio schema.
  */
  try {
    const files = await fs.promises.readdir(dir).catch(() => []);
    await Promise.all(
      files
        .filter(file => /^preview\.(jpg|jpeg|png|webp|svg)$/i.test(file))
        .map(file => fs.promises.unlink(path.join(dir, file)).catch(() => null))
    );

    const legacyDir = path.join(FOLLOWME_DOCUMENTS_DISK_DIR, 'thumbs');
    const legacyFiles = await fs.promises.readdir(legacyDir).catch(() => []);
    await Promise.all(
      legacyFiles
        .filter(file => file.startsWith(`followme-doc-${projectId}-`) && /-thumb\.(jpg|jpeg|png|webp|svg)$/i.test(file))
        .map(file => fs.promises.unlink(path.join(legacyDir, file)).catch(() => null))
    );
  } catch(e) {}

  const filename = `preview.${img.ext}`;
  const full = path.join(dir, filename);

  await fs.promises.writeFile(full, img.buffer);

  return `/uploads/followme-documents/thumbs/${projectThumbDirName}/${filename}`;
}

function escapeFollowMeSvg20260520(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function createFollowMeDocumentFallbackThumbnail20260520(projectId, documentId, originalName, pageCount, qrFolder) {
  /*
    Preview documento FollowMe.
    Nuova regola:
    - se conosciamo il codice QR, la preview vive nello stesso spazio del QR:
      /uploads/followme-documents/CODICE/document-preview.svg
    - fallback compatibile:
      /uploads/followme-documents/thumbs/project-ID/preview.svg
  */
  const safeQrFolder = String(qrFolder || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  const safeName = String(originalName || 'Documento PDF')
    .replace(/[<>&"]/g, '')
    .slice(0, 90);

  const pagesText = pageCount ? `${pageCount} pag.` : 'PDF';

  let thumbDir;
  let publicPath;

  if (safeQrFolder) {
    thumbDir = followmeDocumentPath.join(FOLLOWME_DOCUMENT_UPLOAD_DIR, safeQrFolder);
    publicPath = `/uploads/followme-documents/${safeQrFolder}/document-preview.svg`;
  } else {
    thumbDir = followmeDocumentPath.join(FOLLOWME_DOCUMENT_UPLOAD_DIR, 'thumbs', `project-${projectId}`);
    publicPath = `/uploads/followme-documents/thumbs/project-${projectId}/preview.svg`;
  }

  await followmeDocumentFsp.mkdir(thumbDir, { recursive:true });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="440" viewBox="0 0 720 440">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="#c8ff2e"/>
      <stop offset="1" stop-color="#5ee7ff"/>
    </linearGradient>
  </defs>
  <rect width="720" height="440" rx="34" fill="url(#bg)"/>
  <rect x="34" y="34" width="652" height="372" rx="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)"/>
  <rect x="70" y="70" width="88" height="110" rx="14" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.18)"/>
  <path d="M94 102h40M94 126h40M94 150h28" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity=".72"/>
  <text x="188" y="112" fill="#c8ff2e" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial" font-size="24" font-weight="900" letter-spacing="2">DOCUMENTO PDF</text>
  <text x="188" y="162" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial" font-size="34" font-weight="900">${safeName}</text>
  <text x="188" y="210" fill="rgba(255,255,255,.62)" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial" font-size="22" font-weight="700">${pagesText} • pronto per la consultazione</text>
  <rect x="70" y="316" width="580" height="12" rx="6" fill="rgba(255,255,255,.12)"/>
  <rect x="70" y="316" width="260" height="12" rx="6" fill="url(#accent)"/>
</svg>`;

  const filePath = followmeDocumentPath.join(thumbDir, safeQrFolder ? 'document-preview.svg' : 'preview.svg');
  await followmeDocumentFsp.writeFile(filePath, svg, 'utf8');

  return publicPath;
}
// end-followme-document-thumbnail-server-final-20260520




// followme-dynamic-svg-thumbnail-route-20260520
app.get('/followme-documents/followme-doc-:projectId-:documentId-thumb.svg', async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();
    await ensureFollowMeDocumentPreparedColumns20260520();

    const projectId = Number(req.params.projectId || 0);
    const documentId = Number(req.params.documentId || 0);

    if (!projectId || !documentId) {
      return res.status(404).send('Thumbnail non disponibile.');
    }

    const r = await pool.query(
      `SELECT id, project_id, original_name, page_count
       FROM followme_documents
       WHERE id = $1
         AND project_id = $2
       LIMIT 1`,
      [documentId, projectId]
    );

    if (!r.rows.length) {
      return res.status(404).send('Thumbnail non disponibile.');
    }

    const doc = r.rows[0];

    const cleanName = String(doc.original_name || 'Documento PDF')
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();

    const shortName = cleanName.length > 42 ? cleanName.slice(0, 39) + '…' : cleanName;
    const pages = doc.page_count ? `${doc.page_count} pagine` : 'Documento PDF';

    const safeName = escapeFollowMeSvg20260520(shortName);
    const safePages = escapeFollowMeSvg20260520(pages);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="900" height="1200" viewBox="0 0 900 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#101018"/>
      <stop offset="55%" stop-color="#172033"/>
      <stop offset="100%" stop-color="#05070d"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c8ff2e"/>
      <stop offset="100%" stop-color="#5ee7ff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="32" flood-color="#000000" flood-opacity="0.38"/>
    </filter>
  </defs>

  <rect width="900" height="1200" rx="70" fill="url(#bg)"/>
  <circle cx="150" cy="120" r="190" fill="#c8ff2e" opacity="0.12"/>
  <circle cx="760" cy="70" r="210" fill="#5ee7ff" opacity="0.10"/>

  <rect x="115" y="145" width="670" height="910" rx="42" fill="#ffffff" filter="url(#shadow)"/>
  <rect x="165" y="210" width="570" height="24" rx="12" fill="#e5e7eb"/>
  <rect x="165" y="270" width="420" height="18" rx="9" fill="#d1d5db"/>
  <rect x="165" y="326" width="540" height="14" rx="7" fill="#e5e7eb"/>
  <rect x="165" y="370" width="510" height="14" rx="7" fill="#e5e7eb"/>
  <rect x="165" y="414" width="545" height="14" rx="7" fill="#e5e7eb"/>
  <rect x="165" y="458" width="390" height="14" rx="7" fill="#e5e7eb"/>

  <rect x="165" y="560" width="570" height="260" rx="28" fill="#f3f4f6"/>
  <path d="M300 715 L397 620 L480 705 L538 650 L650 775 H250 Z" fill="#d1d5db"/>
  <circle cx="610" cy="625" r="34" fill="#cbd5e1"/>

  <rect x="165" y="880" width="570" height="18" rx="9" fill="#e5e7eb"/>
  <rect x="165" y="925" width="470" height="18" rx="9" fill="#e5e7eb"/>

  <rect x="115" y="145" width="670" height="910" rx="42" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2"/>

  <rect x="95" y="70" width="260" height="54" rx="27" fill="url(#accent)"/>
  <text x="225" y="105" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="900" fill="#101018">DOCUMENTO PDF</text>

  <text x="450" y="1110" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#ffffff">${safeName}</text>
  <text x="450" y="1154" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#94a3b8">${safePages}</text>
</svg>`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.send(svg);
  } catch (err) {
    console.error('followme dynamic svg thumbnail error:', err);
    return res.status(500).send('Errore thumbnail.');
  }
});
// end-followme-dynamic-svg-thumbnail-route-20260520


// followme-document-prepare-publish-definitive-final-20260520
async function ensureFollowMeDocumentPreparedColumns20260520() {
  await ensureFollowMeDocumentTable20260520();
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS thumbnail_path TEXT`);
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS thumbnail_data_url TEXT`);
}

function normalizeFollowMeDocumentForClient20260520(doc, extra = {}) {
  if (!doc) return null;
  return {
    ...doc,
    thumbnail_data_url: doc.thumbnail_data_url || null,
    thumbnail_url: doc.thumbnail_path || doc.thumbnail_data_url || null,
    prepared: !!extra.prepared,
    published: !!extra.published,
    is_published: !!doc.is_published
  };
}
// end-followme-document-prepare-publish-definitive-final-20260520

// followme-consegna-documento-premium-final-20260520
const followmeDocumentPath = require('path');
const followmeDocumentFs = require('fs');
const followmeDocumentFsp = followmeDocumentFs.promises;

/*
  Upload PDF FollowMe.
  Deve usare lo stesso percorso esposto da:
  /uploads/followme-documents
  In locale: public/uploads/followme-documents
  Su Render: /var/data/uploads/followme-documents se FOLLOWME_STORAGE_DIR=/var/data
*/
const FOLLOWME_DOCUMENT_UPLOAD_DIR = FOLLOWME_DOCUMENTS_DISK_DIR;

const followmeDocumentUploadMulter20260520 = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 18 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();

    if (!name.endsWith('.pdf')) {
      return cb(new Error('Formato non supportato. Carica solo PDF.'));
    }

    /*
      Alcuni browser inviano application/octet-stream.
      Accettiamo il file se l'estensione è PDF, poi verifichiamo i magic bytes.
    */
    if (mime && mime !== 'application/pdf' && mime !== 'application/octet-stream') {
      return cb(new Error('Formato non supportato. Carica solo PDF.'));
    }

    cb(null, true);
  }
});


async function ensureFollowMeDocumentDir20260520() {
  await followmeDocumentFsp.mkdir(FOLLOWME_DOCUMENT_UPLOAD_DIR, { recursive:true });
}

async function ensureFollowMeDocumentTable20260520() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_documents (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      public_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      page_count INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      views_count BIGINT NOT NULL DEFAULT 0,
      downloads_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS followme_documents_project_status_idx
    ON followme_documents(project_id, status, id DESC)
  `);
}

function sanitizeFollowMeDocumentName20260520(name) {
  return String(name || 'documento.pdf')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'documento.pdf';
}

function isLikelyPdfBase6420260520(base64) {
  try {
    /*
      Alcuni PDF reali possono avere pochi byte/BOM/spazi prima di %PDF-.
      Controlliamo i primi 1KB decodificati.
    */
    const head = Buffer.from(String(base64 || '').slice(0, 2000), 'base64');
    return head.indexOf(Buffer.from('%PDF-')) >= 0;
  } catch(e) {
    return false;
  }
}

function countPdfPagesRough20260520(buffer) {
  try {
    const txt = buffer.toString('latin1');
    const matches = txt.match(/\/Type\s*\/Page\b/g);
    return matches ? matches.length : null;
  } catch(e) {
    return null;
  }
}

async function getFollowMeProjectByCode20260520(code) {
  const r = await pool.query(
    `SELECT id, code, public_id
     FROM followme_projects
     WHERE code = $1 OR public_id = $1
     LIMIT 1`,
    [code]
  );
  return r.rows[0] || null;
}

app.post('/api/followme/:code/document/upload', followmeDocumentUploadMulter20260520.single('document'), async (req, res) => {
  try {
    await ensureFollowMeDocumentDir20260520();
    await ensureFollowMeDocumentTable20260520();
    await ensureFollowMeDocumentPreparedColumns20260520();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    const file = req.file;

    if (!file || !file.buffer) {
      return res.status(400).json({ success:false, error:'File mancante.' });
    }

    const originalName = sanitizeFollowMeDocumentName20260520(file.originalname || 'documento.pdf');
    const buffer = file.buffer;

    const maxBytes = 18 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(413).json({
        success:false,
        error:'PDF troppo pesante. Limite attuale: 18 MB.'
      });
    }

    const pdfMarkerPosition = buffer.slice(0, 1024).indexOf(Buffer.from('%PDF-'));

    if (pdfMarkerPosition < 0) {
      return res.status(415).json({
        success:false,
        error:'Controllo sicurezza fallito: il file non contiene una intestazione PDF valida.'
      });
    }

    /*
      Salvataggio definitivo:
      ogni QR ha la propria cartella stabile.
      Il PDF si chiama sempre documento.pdf, quindi ogni nuovo caricamento
      sostituisce automaticamente il precedente.
    */
    const qrFolder = String(project.code || code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || String(project.id);
    const storedName = 'documento.pdf';
    const projectDocumentDir = followmeDocumentPath.join(FOLLOWME_DOCUMENT_UPLOAD_DIR, qrFolder);
    const diskPath = followmeDocumentPath.join(projectDocumentDir, storedName);
    const publicPath = `/uploads/followme-documents/${qrFolder}/${storedName}`;

    await followmeDocumentFsp.mkdir(projectDocumentDir, { recursive:true });
    await followmeDocumentFsp.writeFile(diskPath, buffer);

    const pageCount = countPdfPagesRough20260520(buffer);

    await pool.query(
      `UPDATE followme_documents
       SET status = 'replaced',
           thumbnail_path = NULL,
           thumbnail_data_url = NULL,
           updated_at = NOW()
       WHERE project_id = $1
         AND status = 'active'`,
      [project.id]
    );

    const inserted = await pool.query(
      `INSERT INTO followme_documents
       (project_id, original_name, stored_name, public_path, mime_type, size_bytes, page_count, status, is_published, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'application/pdf',$5,$6,'active',TRUE,NOW(),NOW())
       RETURNING id, project_id, original_name, public_path, mime_type, size_bytes, page_count, status, is_published, published_at, views_count, downloads_count, thumbnail_path, thumbnail_data_url, created_at, updated_at`,
      [project.id, originalName, storedName, publicPath, buffer.length, pageCount]
    );

    let insertedDoc = inserted.rows[0];

    if (!insertedDoc.thumbnail_path) {
      try {
        const fallbackThumb = await createFollowMeDocumentFallbackThumbnail20260520(
          project.id,
          insertedDoc.id,
          insertedDoc.original_name,
          insertedDoc.page_count,
          qrFolder
        );

        const updThumb = await pool.query(
          `UPDATE followme_documents
           SET thumbnail_path = $1,
               updated_at = NOW()
           WHERE id = $2
           RETURNING id, project_id, original_name, public_path, mime_type, size_bytes, page_count, status, is_published, published_at, views_count, downloads_count, thumbnail_path, thumbnail_data_url, created_at, updated_at`,
          [fallbackThumb, insertedDoc.id]
        );

        insertedDoc = updThumb.rows[0] || insertedDoc;
      } catch(e) {
        console.error('followme fallback thumbnail upload error:', e);
      }
    }

    const activeDocumentUrl = `/fm/document/${project.public_id || project.code}`;

    /*
      Pubblicazione immediata:
      - il PDF reale è salvato nello spazio riservato del QR
      - il QR viene puntato alla route controllata /fm/document/CODICE
      - la history registra la destinazione documento
    */
    await pool.query(
      `UPDATE followme_projects
       SET active_url = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [activeDocumentUrl, project.id]
    );

    await pool.query(
      `INSERT INTO followme_url_history
        (project_id, url, activated_at, last_used_at, scan_count)
       VALUES
        ($1, $2, NOW(), NOW(), 0)
       ON CONFLICT DO NOTHING`,
      [project.id, activeDocumentUrl]
    ).catch(() => null);

    return res.json({
      success:true,
      prepared:true,
      published:true,
      active_url:activeDocumentUrl,
      document:normalizeFollowMeDocumentForClient20260520(insertedDoc, { prepared:true, published:true }),
      public_url:`/fm/document/${project.public_id || project.code}`
    });

  } catch(err) {
    console.error('followme document upload multipart error:', err);

    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success:false,
        error:'PDF troppo pesante. Limite attuale: 18 MB.'
      });
    }

    return res.status(500).json({
      success:false,
      error: err.message || 'Errore caricamento documento.'
    });
  }
});

app.get('/api/followme/:code/document/current', async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();
    await ensureFollowMeDocumentPreparedColumns20260520();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    const r = await pool.query(
      `SELECT id, project_id, original_name, public_path, mime_type, size_bytes, page_count, status, is_published, published_at, views_count, downloads_count, thumbnail_path, thumbnail_data_url, created_at, updated_at
       FROM followme_documents
       WHERE project_id = $1
         AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [project.id]
    );

    let doc = r.rows[0] || null;

    if (doc && !doc.thumbnail_path) {
      try {
        const fallbackThumb = await createFollowMeDocumentFallbackThumbnail20260520(
          project.id,
          doc.id,
          doc.original_name,
          doc.page_count,
          qrFolder
        );

        const updThumb = await pool.query(
          `UPDATE followme_documents
           SET thumbnail_path = $1,
               updated_at = NOW()
           WHERE id = $2
           RETURNING id, project_id, original_name, public_path, mime_type, size_bytes, page_count, status, is_published, published_at, views_count, downloads_count, thumbnail_path, thumbnail_data_url, created_at, updated_at`,
          [fallbackThumb, doc.id]
        );

        doc = updThumb.rows[0] || doc;
      } catch(e) {
        console.error('followme fallback thumbnail current error:', e);
      }
    }

    return res.json({
      success:true,
      document:normalizeFollowMeDocumentForClient20260520(doc, {
        prepared: !!doc,
        published: !!(doc && doc.is_published)
      }),
      public_url:`/fm/document/${project.public_id || project.code}`
    });

  } catch(err) {
    console.error('followme document current error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura documento.' });
  }
});

app.post('/api/followme/:code/document/disable', express.json(), async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    await pool.query(
      `UPDATE followme_documents
       SET status = 'disabled',
           updated_at = NOW()
       WHERE project_id = $1
         AND status = 'active'`,
      [project.id]
    );

    return res.json({ success:true });

  } catch(err) {
    console.error('followme document disable error:', err);
    return res.status(500).json({ success:false, error:'Errore spegnimento documento.' });
  }
});

app.post('/api/followme/document/:document_id/view', express.json(), async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();

    const id = Number(req.params.document_id || 0);
    if (!id) return res.status(400).json({ success:false });

    const r = await pool.query(
      `UPDATE followme_documents
       SET views_count = views_count + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING views_count`,
      [id]
    );

    return res.json({ success:true, views_count:r.rows[0]?.views_count || 0 });
  } catch(err) {
    return res.status(500).json({ success:false });
  }
});

app.get('/api/followme/document/:document_id/download', async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();

    const id = Number(req.params.document_id || 0);
    if (!id) return res.status(400).send('Documento non valido.');

    const r = await pool.query(
      `UPDATE followme_documents
       SET downloads_count = downloads_count + 1,
           updated_at = NOW()
       WHERE id = $1
         AND status = 'active'
       RETURNING original_name, public_path`,
      [id]
    );

    if (!r.rows.length) {
      return res.status(404).send('Documento non disponibile.');
    }

    const row = r.rows[0];
    const relativePublicPath = String(row.public_path || '').replace(/^\//, '');
    const filePath = relativePublicPath.startsWith('uploads/followme-documents/')
      ? path.join(FOLLOWME_STORAGE_ROOT, relativePublicPath)
      : followmeDocumentPath.join(__dirname, 'public', relativePublicPath);

    return res.download(filePath, row.original_name || 'documento.pdf');
  } catch(err) {
    console.error('followme document download error:', err);
    return res.status(500).send('Errore download documento.');
  }
});




// followme-image-card-single-upload-final-20260522
const followmeImageCardUploadMulter20260522 = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();

    const allowedMime = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ];

    const allowedExt = [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif'
    ];

    const extOk = allowedExt.some(ext => name.endsWith(ext));
    const mimeOk = allowedMime.includes(mime);

    if (!mimeOk && !extOk) {
      return cb(new Error('Formato non supportato. Carica una immagine JPG, PNG, WEBP o GIF.'));
    }

    cb(null, true);
  }
});

async function ensureFollowMeImageCardTable20260522() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_image_cards (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      public_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      views_count BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS followme_image_cards_project_status_idx
    ON followme_image_cards(project_id, status, id DESC)
  `);
}

function sanitizeFollowMeImageName20260522(name) {
  return String(name || 'immagine')
    .replace(/[^\\w.\\-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'immagine';
}

function followMeImageExtFromMime20260522(mime, originalName) {
  const cleanMime = String(mime || '').toLowerCase().split(';')[0].trim();
  const name = String(originalName || '').toLowerCase();

  if (cleanMime === 'image/jpeg') return 'jpg';
  if (cleanMime === 'image/png') return 'png';
  if (cleanMime === 'image/webp') return 'webp';
  if (cleanMime === 'image/gif') return 'gif';

  if (name.endsWith('.jpeg') || name.endsWith('.jpg')) return 'jpg';
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.webp')) return 'webp';
  if (name.endsWith('.gif')) return 'gif';

  return '';
}

function isLikelySupportedImageBuffer20260522(buffer, ext) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  const head = buffer.slice(0, 16);

  if (ext === 'jpg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }

  if (ext === 'png') {
    return head.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  }

  if (ext === 'webp') {
    return head.slice(0, 4).toString('ascii') === 'RIFF' &&
           buffer.slice(8, 12).toString('ascii') === 'WEBP';
  }

  if (ext === 'gif') {
    const h = head.slice(0, 6).toString('ascii');
    return h === 'GIF87a' || h === 'GIF89a';
  }

  return false;
}

function normalizeFollowMeImageCardForClient20260522(row) {
  if (!row) return null;

  return {
    ...row,
    image_url: row.public_path || null,
    public_url: row.public_path || null,
    title: 'Immagine',
    card_type: 'image'
  };
}

app.post('/api/followme/:code/image-card/upload', followmeImageCardUploadMulter20260522.single('image'), async (req, res) => {
  try {
    await ensureFollowMeImageCardTable20260522();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    const file = req.file;

    if (!file || !file.buffer) {
      return res.status(400).json({ success:false, error:'Immagine mancante.' });
    }

    const originalName = sanitizeFollowMeImageName20260522(file.originalname || 'immagine');
    const buffer = file.buffer;
    const ext = followMeImageExtFromMime20260522(file.mimetype, originalName);

    if (!ext) {
      return res.status(415).json({
        success:false,
        error:'Formato immagine non supportato. Usa JPG, PNG, WEBP o GIF.'
      });
    }

    const maxBytes = 12 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(413).json({
        success:false,
        error:'Immagine troppo pesante. Limite attuale: 12 MB.'
      });
    }

    if (!isLikelySupportedImageBuffer20260522(buffer, ext)) {
      return res.status(415).json({
        success:false,
        error:'Controllo sicurezza fallito: il file non sembra una immagine valida.'
      });
    }

    const qrFolder = String(project.code || code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '') || String(project.id);

    const projectImageDir = followmeDocumentPath.join(FOLLOWME_DOCUMENT_UPLOAD_DIR, qrFolder, 'image');
    await followmeDocumentFsp.mkdir(projectImageDir, { recursive:true });

    /*
      Una sola immagine attiva per QR:
      prima cancelliamo eventuali immagini precedenti con estensione diversa.
    */
    try {
      const files = await followmeDocumentFsp.readdir(projectImageDir).catch(() => []);
      await Promise.all(
        files
          .filter(name => /^immagine\\.(jpg|jpeg|png|webp|gif)$/i.test(name))
          .map(name => followmeDocumentFsp.unlink(followmeDocumentPath.join(projectImageDir, name)).catch(() => null))
      );
    } catch(e) {}

    const storedName = `immagine.${ext}`;
    const diskPath = followmeDocumentPath.join(projectImageDir, storedName);
    const publicPath = `/uploads/followme-documents/${qrFolder}/image/${storedName}`;

    await followmeDocumentFsp.writeFile(diskPath, buffer);

    /*
      Preview immagine stabile nello spazio riservato del QR.
      Per ora è una copia dell'immagine reale; in futuro potrà essere compressa/ridimensionata.
    */
    const previewDiskPath = followmeDocumentPath.join(projectImageDir, 'preview.jpg');
    const previewPublicPath = `/uploads/followme-documents/${qrFolder}/image/preview.jpg`;

    if (ext === 'jpg') {
      await followmeDocumentFsp.writeFile(previewDiskPath, buffer);
    } else {
      /*
        Per PNG/WEBP/GIF manteniamo comunque un riferimento preview:
        se non convertiamo, copiamo il file nel nome preview.jpg solo quando è JPEG.
        Le conversioni reali si faranno in una patch successiva con sharp/canvas se necessario.
      */
    }

    await pool.query(
      `UPDATE followme_image_cards
       SET status = 'replaced',
           updated_at = NOW()
       WHERE project_id = $1
         AND status = 'active'`,
      [project.id]
    );

    const inserted = await pool.query(
      `INSERT INTO followme_image_cards
       (project_id, original_name, stored_name, public_path, mime_type, size_bytes, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'active',NOW(),NOW())
       RETURNING id, project_id, original_name, stored_name, public_path, mime_type, size_bytes, status, views_count, created_at, updated_at`,
      [project.id, originalName, storedName, publicPath, file.mimetype || `image/${ext}`, buffer.length]
    );

    const publicUrl = `/fm/image/${project.public_id || project.code}`;

    /*
      Per la prova la rendiamo subito destinazione attiva.
      Così il QR trasmette immediatamente la card immagine.
    */
    await pool.query(
      `UPDATE followme_projects
       SET active_url = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [project.id, publicUrl]
    );

    await pool.query(
      `INSERT INTO followme_url_history (project_id, url, activated_at, last_used_at, scan_count)
       VALUES ($1, $2, NOW(), NULL, 0)
       ON CONFLICT (project_id, url)
       DO UPDATE SET activated_at = NOW()`,
      [project.id, publicUrl]
    );

    const image = normalizeFollowMeImageCardForClient20260522(inserted.rows[0]);

    return res.json({
      success:true,
      published:true,
      image,
      image_url: image.image_url,
      public_url: publicUrl
    });

  } catch(err) {
    console.error('followme image card upload error:', err);

    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success:false,
        error:'Immagine troppo pesante. Limite attuale: 12 MB.'
      });
    }

    return res.status(500).json({
      success:false,
      error: err.message || 'Errore caricamento immagine.'
    });
  }
});

app.get('/api/followme/:code/image-card/current', async (req, res) => {
  try {
    await ensureFollowMeImageCardTable20260522();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    const r = await pool.query(
      `SELECT id, project_id, original_name, stored_name, public_path, mime_type, size_bytes, status, views_count, created_at, updated_at
       FROM followme_image_cards
       WHERE project_id = $1
         AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [project.id]
    );

    return res.json({
      success:true,
      image:normalizeFollowMeImageCardForClient20260522(r.rows[0] || null),
      public_url:`/fm/image/${project.public_id || project.code}`
    });

  } catch(err) {
    console.error('followme image card current error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura immagine.' });
  }
});

app.post('/api/followme/:code/image-card/disable', express.json(), async (req, res) => {
  try {
    await ensureFollowMeImageCardTable20260522();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    await pool.query(
      `UPDATE followme_image_cards
       SET status = 'disabled',
           updated_at = NOW()
       WHERE project_id = $1
         AND status = 'active'`,
      [project.id]
    );

    return res.json({ success:true });

  } catch(err) {
    console.error('followme image card disable error:', err);
    return res.status(500).json({ success:false, error:'Errore spegnimento immagine.' });
  }
});

app.post('/api/followme/image-card/:image_id/view', express.json(), async (req, res) => {
  try {
    await ensureFollowMeImageCardTable20260522();

    const id = Number(req.params.image_id || 0);
    if (!id) return res.status(400).json({ success:false });

    const r = await pool.query(
      `UPDATE followme_image_cards
       SET views_count = views_count + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING views_count`,
      [id]
    );

    return res.json({ success:true, views_count:r.rows[0]?.views_count || 0 });
  } catch(err) {
    return res.status(500).json({ success:false });
  }
});

app.get('/fm/image/:code', async (req, res) => {
  try {
    await ensureFollowMeImageCardTable20260522();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).send('Immagine non disponibile.');
    }

    const r = await pool.query(
      `SELECT id, original_name, public_path, mime_type, size_bytes, views_count
       FROM followme_image_cards
       WHERE project_id = $1
         AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [project.id]
    );

    if (!r.rows.length) {
      return res.redirect(302, '/fm/document-closed');
    }

    const img = r.rows[0];

    await pool.query(
      `UPDATE followme_image_cards
       SET views_count = views_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [img.id]
    ).catch(() => null);

    const esc = (v) => String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const imageUrl = String(img.public_path || '');
    const manageUrl20260526 = `/followme-app.html?code=${encodeURIComponent(project.code || project.public_id || code)}`;
    const title = esc(String(img.original_name || 'Immagine').replace(/\\.(jpg|jpeg|png|webp|gif)$/i, ''));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>${title}</title>
  <style>
    :root{
      --bg:#05070d;
      --card:#101018;
      --text:#ffffff;
      --muted:rgba(255,255,255,.68);
      --line:rgba(255,255,255,.12);
      --accent:#c8ff2e;
    }
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%}
    body{
      min-height:100vh;
      padding:18px;
      background:
        radial-gradient(circle at 20% 0%, rgba(200,255,46,.16), transparent 32%),
        radial-gradient(circle at 90% 8%, rgba(94,231,255,.12), transparent 30%),
        linear-gradient(145deg,#020617,#0f172a 48%,#020617);
      color:var(--text);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .wrap{
      width:min(520px,100%);
    }
    .card{
      overflow:hidden;
      border-radius:34px;
      background:rgba(255,255,255,.06);
      border:1px solid var(--line);
      box-shadow:0 28px 90px rgba(0,0,0,.42);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
      padding-bottom:18px;
    }
    .image{
      width:100%;
      background:#000;
      display:block;
    }
    .image img{
      width:100%;
      height:auto;
      display:block;
    }
  </style>

<style id="followme-public-image-download-only-css-20260522">
  .followme-public-image-download-btn-20260522{
    width:min(420px, calc(100vw - 32px));
    min-height:54px;
    margin:18px auto 0 auto;
    padding:0 20px;
    border:0;
    border-radius:999px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    background:linear-gradient(135deg,#9bd61e,#5ee7ff);
    color:#101018;
    font-size:15px;
    font-weight:950;
    line-height:1.05;
    text-decoration:none;
    box-shadow:0 14px 32px rgba(34,120,42,.22);
    box-sizing:border-box;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
  }
  .followme-public-image-back-app-btn-20260526{
    width:min(420px, calc(100vw - 32px));
    min-height:54px;
    margin:10px auto 0 auto;
    padding:0 20px;
    border:1px solid rgba(255,255,255,.18);
    border-radius:999px;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    background:rgba(255,255,255,.08);
    color:#fff;
    font-size:15px;
    font-weight:950;
    line-height:1.05;
    text-decoration:none;
    box-sizing:border-box;
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
  }

  .followme-public-image-download-btn-20260522 svg{
    width:22px;
    height:22px;
    flex:0 0 22px;
  }

  .followme-ios-save-note-20260522{
    display:none;
    width:min(420px, calc(100vw - 32px));
    margin:10px auto 0 auto;
    color:rgba(255,255,255,.82);
    font-size:12px;
    line-height:1.35;
    font-weight:700;
    text-align:center;
  }

  body.followme-ios-device-20260522 .followme-ios-save-note-20260522{
    display:block;
  }
</style>

</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="image">
        <img src="${esc(imageUrl)}?v=${Date.now()}" alt="${title}">
      </div>

      <a class="followme-public-image-download-btn-20260522" id="followmePublicImageDownloadBtn20260522" href="${esc(imageUrl)}?v=${img.id}" data-original-image-url="${esc(imageUrl)}?v=${img.id}" download target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v10.2m0 0 4-4m-4 4-4-4M5 17.5V20h14v-2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>Salva immagine</span>
      </a>
      <a class="followme-public-image-back-app-btn-20260526" id="followmePublicImageBackAppBtn20260526" href="${esc(manageUrl20260526)}">
        Torna all’App
      </a>

      <div class="followme-ios-save-note-20260522" id="followmeIosSaveNote20260522">
        Su iPhone: apri l’immagine, tieni premuto e scegli “Salva in Foto”.
      </div>
    </section>
  </main>

<script id="followme-public-image-save-ux-final-20260522">
(function(){
  "use strict";

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if(isIOS){
    document.body.classList.add("followme-ios-device-20260522");

    var btn = document.getElementById("followmePublicImageDownloadBtn20260522");
    var img = document.querySelector(".image img");

    /*
      iOS Safari non permette a una pagina web di salvare direttamente nel rullino.
      Apriamo l'immagine reale: l'utente usa pressione lunga / condividi / Salva in Foto.
    */
    if(btn && img){
      btn.removeAttribute("download");
      btn.href = btn.getAttribute("data-original-image-url") || img.currentSrc || img.src || btn.href;
      btn.target = "_blank";
      btn.rel = "noopener";
    }
  }
})();
</script>

</body>
</html>`);
  } catch(err) {
    console.error('followme image public page error:', err);
    return res.status(500).send('Errore apertura immagine.');
  }
});
// end-followme-image-card-single-upload-final-20260522



// followme-document-closed-page-final-exact-20260520
app.get('/fm/document-closed', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res.send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Grazie</title>
  <style>
    html,body{
      margin:0;
      min-height:100%;
      background:#020202;
      overflow:hidden;
    }

    body{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:28px;
      box-sizing:border-box;
      color:#d8d8d8;
      background:
        radial-gradient(circle at 50% 18%, rgba(220,220,220,.16), transparent 32%),
        radial-gradient(circle at 18% 82%, rgba(255,255,255,.07), transparent 34%),
        linear-gradient(145deg,#000 0%,#111 48%,#030303 100%);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    }

    .card{
      width:min(520px,100%);
      text-align:center;
      border-radius:34px;
      padding:46px 30px 42px;
      background:rgba(255,255,255,.035);
      border:1px solid rgba(220,220,220,.18);
      box-shadow:
        0 30px 90px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.10);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
    }

    .line{
      width:86px;
      height:1px;
      margin:0 auto 24px;
      background:linear-gradient(90deg,transparent,#d9d9d9,transparent);
    }

    h1{
      margin:0;
      font-family:"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive;
      font-size:56px;
      line-height:1;
      font-weight:400;
      color:#e4e4e4;
      text-shadow:0 0 30px rgba(255,255,255,.14);
    }

    p{
      margin:20px auto 0;
      max-width:360px;
      font-size:15px;
      line-height:1.55;
      color:#bdbdbd;
      font-weight:600;
    }

    .saluto{
      margin-top:28px;
      font-family:"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive;
      font-size:33px;
      color:#dcdcdc;
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="line"></div>
    <h1>Grazie</h1>
    <p>Il documento è stato chiuso correttamente.</p>
    <div class="saluto">A presto</div>
  </section>
</body>
</html>`);
});
// end-followme-document-closed-page-final-exact-20260520


// followme-document-thumbnail-endpoint-async-final-20260520
app.post('/api/followme/document/:document_id/thumbnail', express.json({ limit:'3mb' }), async (req, res) => {
  try {
    await ensureFollowMeDocumentPreparedColumns20260520();

    const documentId = Number(req.params.document_id || 0);
    if (!documentId) {
      return res.status(400).json({ success:false, error:'Documento non valido.' });
    }

    const thumbnailBase64 = String((req.body && req.body.thumbnail_base64) || '').trim();

    if (!thumbnailBase64) {
      return res.status(400).json({ success:false, error:'Thumbnail mancante.' });
    }

    const docRes = await pool.query(
      `SELECT id, project_id
       FROM followme_documents
       WHERE id = $1
       LIMIT 1`,
      [documentId]
    );

    if (!docRes.rows.length) {
      return res.status(404).json({ success:false, error:'Documento non trovato.' });
    }

    const doc = docRes.rows[0];

    const thumbnailPath = await saveFollowMeDocumentThumbnail20260520(
      doc.project_id,
      doc.id,
      thumbnailBase64
    );

    if (!thumbnailPath) {
      return res.status(400).json({ success:false, error:'Thumbnail non valida.' });
    }

    /* FollowMe thumbnail persistente DB 20260520 */
    const upd = await pool.query(
      `UPDATE followme_documents
       SET thumbnail_path = $1,
           thumbnail_data_url = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, project_id, original_name, public_path, mime_type, size_bytes, page_count,
                 status, is_published, published_at, views_count, downloads_count,
                 thumbnail_path, thumbnail_data_url, created_at, updated_at`,
      [thumbnailPath, thumbnailBase64, documentId]
    );

    const updatedDoc = upd.rows[0];

    return res.json({
      success:true,
      document:normalizeFollowMeDocumentForClient20260520(updatedDoc, {
        prepared:true,
        published:!!updatedDoc.is_published
      }),
      thumbnail_url:thumbnailPath
    });

  } catch(err) {
    console.error('followme document thumbnail async error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore salvataggio thumbnail documento.'
    });
  }
});
// end-followme-document-thumbnail-endpoint-async-final-20260520

app.get('/fm/document/:code', async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();
    await ensureFollowMeDocumentPreparedColumns20260520();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.redirect(302, '/fm/document-closed');
    }

    const r = await pool.query(
      `SELECT id, original_name, public_path, mime_type, size_bytes, views_count
       FROM followme_documents
       WHERE project_id = $1
         AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [project.id]
    );

    if (!r.rows.length) {
      return res.redirect(302, '/fm/document-closed');
    }

    const doc = r.rows[0];

    await pool.query(
      `UPDATE followme_documents
       SET views_count = views_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [doc.id]
    ).catch(() => null);

    const fileUrl = String(doc.public_path || '');

    if (!fileUrl) {
      return res.redirect(302, '/fm/document-closed');
    }

    const viewerUrl = '/pdf-viewer.html?file=' + encodeURIComponent(fileUrl);
    return res.redirect(302, viewerUrl);

  } catch(err) {
    console.error('followme document public route error:', err);
    return res.status(500).send('Errore apertura documento.');
  }
});


app.get('/fm/document/closed', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res.send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Grazie</title>
  <style>
    html,body{
      margin:0;
      min-height:100%;
      background:#020202;
      color:#d7d7d7;
      overflow:hidden;
    }

    body{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:28px;
      box-sizing:border-box;
      background:
        radial-gradient(circle at 50% 18%, rgba(210,210,210,.16), transparent 32%),
        radial-gradient(circle at 18% 82%, rgba(255,255,255,.07), transparent 34%),
        linear-gradient(145deg,#000 0%,#111 48%,#030303 100%);
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    }

    .card{
      width:min(520px,100%);
      text-align:center;
      border-radius:34px;
      padding:44px 30px 40px;
      background:rgba(255,255,255,.035);
      border:1px solid rgba(220,220,220,.18);
      box-shadow:
        0 30px 90px rgba(0,0,0,.52),
        inset 0 1px 0 rgba(255,255,255,.10);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
    }

    .line{
      width:82px;
      height:1px;
      margin:0 auto 24px;
      background:linear-gradient(90deg,transparent,#d4d4d4,transparent);
    }

    h1{
      margin:0;
      font-family:"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive;
      font-size:54px;
      line-height:1;
      font-weight:400;
      color:#e3e3e3;
      text-shadow:0 0 30px rgba(255,255,255,.14);
    }

    p{
      margin:20px auto 0;
      max-width:360px;
      font-size:15px;
      line-height:1.55;
      color:#bdbdbd;
      font-weight:600;
    }

    .saluto{
      margin-top:28px;
      font-family:"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive;
      font-size:32px;
      color:#d9d9d9;
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="line"></div>
    <h1>Grazie</h1>
    <p>Il documento è stato chiuso correttamente.</p>
    <div class="saluto">A presto</div>
  </section>
</body>
</html>`);
});
// end-followme-document-user-close-elegant-final-20260520


// followme-document-publish-flow-final-20260520
async function ensureFollowMeDocumentPublishColumns20260520() {
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_documents ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE`);
}

app.post('/api/followme/:code/document/publish', express.json(), async (req, res) => {
  try {
    await ensureFollowMeDocumentTable20260520();
    await ensureFollowMeDocumentPublishColumns20260520();

    const code = String(req.params.code || '').trim();
    const project = await getFollowMeProjectByCode20260520(code);

    if (!project) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    const documentId = Number((req.body && req.body.document_id) || 0);

    const docRes = await pool.query(
      `SELECT id, project_id, original_name, public_path, mime_type, size_bytes, page_count, status, is_published, published_at, views_count, downloads_count, thumbnail_path
       FROM followme_documents
       WHERE project_id = $1
         AND status = 'active'
         AND ($2::BIGINT = 0 OR id = $2::BIGINT)
       ORDER BY id DESC
       LIMIT 1`,
      [project.id, documentId]
    );

    if (!docRes.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Prima carica un PDF valido.'
      });
    }

    const doc = docRes.rows[0];
    const publicUrl = `/fm/document/${project.public_id || project.code}`;

    await pool.query(
      `UPDATE followme_documents
       SET is_published = FALSE,
           updated_at = NOW()
       WHERE project_id = $1`,
      [project.id]
    );

    await pool.query(
      `UPDATE followme_documents
       SET is_published = TRUE,
           published_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [doc.id]
    );

    /*
      Proviamo ad aggiornare la destinazione principale del QR in modo elastico,
      perché nei prototipi FollowMe possono esistere nomi colonna diversi.
      Se nessuna colonna compatibile esiste, il documento resta pubblicato
      e la URL /fm/document/... è comunque disponibile.
    */
    const colsRes = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'followme_projects'`
    );

    const cols = new Set(colsRes.rows.map(r => r.column_name));
    const candidates = [
      'target_url',
      'destination_url',
      'current_url',
      'redirect_url',
      'url',
      'link_url',
      'active_url'
    ];

    let updatedDestinationColumn = null;

    for (const col of candidates) {
      if (!cols.has(col)) continue;

      try {
        await pool.query(
          `UPDATE followme_projects SET ${col} = $1, updated_at = NOW() WHERE id = $2`,
          [publicUrl, project.id]
        );
        updatedDestinationColumn = col;
        break;
      } catch(e) {}
    }

    /*
      FOLLOWME DOCUMENT PRESERVE PREVIOUS ACTIVE FRAME 20260520
      Prima di sostituire active_url con il Documento PDF, salvo la destinazione precedente
      nello storico. Così nel carosello il documento crea un proprio frame e la vecchia
      destinazione rimane subito accanto come frame riattivabile.
    */
    try {
      const previousRes = await pool.query(
        `SELECT active_url
         FROM followme_projects
         WHERE id = $1
         LIMIT 1`,
        [project.id]
      );

      const previousUrl = String(previousRes.rows[0]?.active_url || '').trim();
      const nextUrl = String(publicUrl || '').trim();

      if (
        previousUrl &&
        previousUrl !== nextUrl &&
        !previousUrl.includes('/fm/document/')
      ) {
        await pool.query(
          `INSERT INTO followme_url_history
           (project_id, url, activated_at, last_used_at, scan_count)
           VALUES ($1, $2, NOW(), NOW(), 0)
           ON CONFLICT (project_id, url)
           DO UPDATE SET
             activated_at = COALESCE(followme_url_history.activated_at, NOW()),
             last_used_at = NOW()`,
          [project.id, previousUrl]
        );
      }
    } catch(e) {
      console.error('followme preserve previous active frame error:', e);
    }
    /*
      END FOLLOWME DOCUMENT PRESERVE PREVIOUS ACTIVE FRAME 20260520
    */

    /*
      FOLLOWME DOCUMENT FORCE ACTIVE_URL FINAL 20260520
      La tabella reale followme_projects usa active_url.
      Quando pubblico o riattivo il documento, il QR deve trasmettere subito la pagina documento.
    */
    try {
      await pool.query(
        `UPDATE followme_projects
         SET active_url = $1,
             chat_mode_enabled = FALSE,
             updated_at = NOW()
         WHERE id = $2`,
        [publicUrl, project.id]
      );

      updatedDestinationColumn = 'active_url';
    } catch(e) {
      console.error('followme document force active_url update error:', e);
    }
    /*
      END FOLLOWME DOCUMENT FORCE ACTIVE_URL FINAL 20260520
    */

    /*
      Spegne la chat se presente, perché ora il QR deve consegnare il PDF.
    */
    try {
      await pool.query(
        `UPDATE followme_projects
         SET chat_mode_enabled = FALSE,
             updated_at = NOW()
         WHERE id = $1`,
        [project.id]
      );
    } catch(e) {}

    return res.json({
      success:true,
      published:true,
      document:normalizeFollowMeDocumentForClient20260520({ ...doc, is_published:true, published_at:new Date().toISOString() }, { prepared:true, published:true }),
      public_url:publicUrl,
      destination_column:updatedDestinationColumn,
      warning: updatedDestinationColumn ? null : 'Documento pubblicato, ma non ho trovato automaticamente la colonna destinazione QR.'
    });

  } catch(err) {
    console.error('followme document publish error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore pubblicazione documento.'
    });
  }
});

app.get('/fm/document/closed', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res.send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow">
  <title>Grazie</title>
  <style>
    html,body{
      margin:0;
      min-height:100%;
      background:#020202;
      color:#d9d9d9;
      font-family:"Snell Roundhand","Apple Chancery","Segoe Script","Brush Script MT",cursive;
      overflow:hidden;
    }

    body{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:30px;
      box-sizing:border-box;
      background:
        radial-gradient(circle at 50% 18%, rgba(192,192,192,.16), transparent 30%),
        radial-gradient(circle at 20% 82%, rgba(255,255,255,.08), transparent 32%),
        linear-gradient(145deg,#000 0%,#111 48%,#020202 100%);
    }

    .card{
      width:min(520px,100%);
      text-align:center;
      border-radius:34px;
      padding:42px 30px;
      background:rgba(255,255,255,.035);
      border:1px solid rgba(220,220,220,.16);
      box-shadow:0 30px 90px rgba(0,0,0,.50), inset 0 1px 0 rgba(255,255,255,.10);
      backdrop-filter:blur(18px);
      -webkit-backdrop-filter:blur(18px);
    }

    .line{
      width:72px;
      height:1px;
      margin:0 auto 22px;
      background:linear-gradient(90deg,transparent,#c0c0c0,transparent);
    }

    h1{
      margin:0;
      font-size:48px;
      line-height:1;
      font-weight:400;
      color:#e7e7e7;
      text-shadow:0 0 28px rgba(255,255,255,.14);
    }

    p{
      margin:18px auto 0;
      max-width:360px;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
      font-size:15px;
      line-height:1.5;
      color:#bdbdbd;
      font-weight:600;
    }

    .silver{
      margin-top:26px;
      font-size:28px;
      color:#d8d8d8;
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="line"></div>
    <h1>Grazie</h1>
    <p>Il documento è stato chiuso. Puoi tornare alla pagina precedente o continuare la navigazione dal tuo dispositivo.</p>
    <div class="silver">A presto</div>
  </section>
</body>
</html>`);
});
// end-followme-document-publish-flow-final-20260520


app.get('/fm/chat/c/:chat_token', async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const token = String(req.params.chat_token || '').trim().toUpperCase();

    const projectRes = await pool.query(
      `SELECT id, code, chat_mode_enabled
       FROM followme_projects
       WHERE chat_public_token = $1
       LIMIT 1`,
      [token]
    );

    if (!projectRes.rows.length || projectRes.rows[0].chat_mode_enabled !== true) {
      return res.status(404).send('Chat non disponibile.');
    }

    return res.sendFile(require('path').join(__dirname, 'public', 'followme-chat-public.html'));
  } catch (err) {
    console.error('followme public chat page error:', err);
    return res.status(500).send('Errore apertura chat.');
  }
});



// followme-bot-enabled-admin-only-20260521
async function ensureFollowMeBotEnabledColumn20260521() {
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT FALSE`);
}

/*
  Stato BOT lato admin per singolo QR.
  Usato dalla WebApp proprietario /fm/app/:code.
*/
app.get('/api/followme/:code/bot-state', async (req, res) => {
  try {
    await ensureFollowMeBotEnabledColumn20260521();

    const code = String(req.params.code || '').trim();

    const r = await pool.query(
      `SELECT code, public_id, COALESCE(bot_enabled, FALSE) AS bot_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    return res.json({
      success:true,
      bot_enabled: r.rows[0].bot_enabled === true,
      project: {
        code: r.rows[0].code,
        public_id: r.rows[0].public_id
      }
    });
  } catch (err) {
    console.error('followme bot-state get error:', err);
    return res.status(500).json({ success:false, error:'Errore stato BOT.' });
  }
});

app.post('/api/followme/:code/bot-state', express.json(), async (req, res) => {
  try {
    await ensureFollowMeBotEnabledColumn20260521();

    const code = String(req.params.code || '').trim();
    const enabled = req.body && typeof req.body.bot_enabled === 'boolean'
      ? req.body.bot_enabled
      : true;

    const r = await pool.query(
      `UPDATE followme_projects
       SET bot_enabled = $2,
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING code, public_id, COALESCE(bot_enabled, FALSE) AS bot_enabled`,
      [code, enabled]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Progetto non trovato.' });
    }

    return res.json({
      success:true,
      bot_enabled: r.rows[0].bot_enabled === true,
      project: {
        code: r.rows[0].code,
        public_id: r.rows[0].public_id
      }
    });
  } catch (err) {
    console.error('followme bot-state post error:', err);
    return res.status(500).json({ success:false, error:'Errore aggiornamento BOT.' });
  }
});

/*
  Stato BOT lato chat pubblica.
  L'utente NON vede il pulsante, ma la pagina pubblica legge qui se mostrare
  o nascondere i testi descrittivi.
*/
app.get('/api/followme/chat/:chat_token/bot-state', async (req, res) => {
  try {
    await ensureFollowMeBotEnabledColumn20260521();

    const token = String(req.params.chat_token || '').trim();

    const r = await pool.query(
      `SELECT code, public_id, COALESCE(bot_enabled, FALSE) AS bot_enabled
       FROM followme_projects
       WHERE chat_public_token = $1
       LIMIT 1`,
      [token]
    );

    if (!r.rows.length) {
      return res.status(404).json({ success:false, error:'Chat non trovata.' });
    }

    return res.json({
      success:true,
      bot_enabled: r.rows[0].bot_enabled === true,
      project: {
        code: r.rows[0].code,
        public_id: r.rows[0].public_id
      }
    });
  } catch (err) {
    console.error('followme public bot-state error:', err);
    return res.status(500).json({ success:false, error:'Errore stato BOT pubblico.' });
  }
});
// end-followme-bot-enabled-admin-only-20260521


app.post('/api/followme/chat/:chat_token/session', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const chatToken = String(req.params.chat_token || '').trim();

    const projectRes = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token, bot_enabled
       FROM followme_projects
       WHERE chat_public_token = $1
       LIMIT 1`,
      [chatToken]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'Chat non trovata.' });
    }

    const project = projectRes.rows[0];

    if (project.chat_mode_enabled !== true) {
      return res.status(403).json({ success:false, error:'Chat non attiva.' });
    }

    // Ogni nuovo accesso pubblico crea una nuova sessione autonoma.
    // NON riusiamo più l'ultima sessione open del progetto:
    // utenti diversi devono sempre finire in chat separate.

    const visitorLabel = 'Utente ' + Math.random().toString(36).slice(2, 6).toUpperCase();

    const inserted = await pool.query(
      `INSERT INTO followme_chat_sessions
       (project_id, chat_public_token, visitor_label, status, created_at, last_seen_at)
       VALUES ($1,$2,$3,'open',NOW(),NOW())
       RETURNING id, visitor_label, display_name, uploads_enabled, is_blocked, status, created_at, last_seen_at`,
      [project.id, chatToken, visitorLabel]
    );

    const session = inserted.rows[0];

    sendFollowMeNewChatPush(project, session).catch(() => {});

    return res.json({
      success:true,
      reused:false,
      project_code:project.code,
      public_id:project.public_id,
      session_id:session.id,
      session
    });
  } catch (err) {
    console.error('followme chat create/reuse single session error:', err);
    return res.status(500).json({ success:false, error:'Errore creazione chat.' });
  }
});


async function ensureFollowMeChatDisplayNameColumn() {
  try {
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS display_name TEXT`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  } catch (err) {
    console.warn('ensureFollowMeChatDisplayNameColumn error:', err.message || err);
  }
}




// followme-user-paused-columns-20260519
async function ensureFollowMeUserPausedColumns() {
  try {
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS is_user_paused BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS user_paused_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  } catch (err) {
    console.warn('ensureFollowMeUserPausedColumns error:', err.message || err);
  }
}

async function ensureFollowMeChatUserManagementColumns() {
  try {
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS uploads_enabled BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS is_user_paused BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS user_paused_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  } catch (err) {
    console.warn('ensureFollowMeChatUserManagementColumns error:', err.message || err);
  }
}



// followme-public-close-session-20260519
app.post('/api/followme/chat/session/:session_id/close', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione mancante.'
      });
    }

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           updated_at = NOW(),
           last_seen_at = NOW()
       WHERE id = $1
       RETURNING id, status, updated_at`,
      [sessionId]
    );

    if (!updated.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Sessione non trovata.'
      });
    }

    return res.json({
      success:true,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme public close session error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore chiusura chat.'
    });
  }
});



// followme-public-pause-session-20260519
app.post('/api/followme/chat/session/:session_id/pause', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);
    const isPaused = req.body && typeof req.body.is_user_paused === 'boolean'
      ? req.body.is_user_paused
      : true;

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione mancante.'
      });
    }

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET is_user_paused = $2,
           user_paused_at = CASE WHEN $2 = TRUE THEN NOW() ELSE NULL END,
           updated_at = NOW(),
           last_seen_at = NOW()
       WHERE id = $1
       RETURNING id, is_user_paused, user_paused_at, updated_at`,
      [sessionId, isPaused]
    );

    if (!updated.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Sessione non trovata.'
      });
    }

    return res.json({
      success:true,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme public pause session error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore aggiornamento pausa chat.'
    });
  }
});


// followme-server-side-chat-files-export-final-20260519
function followMeTarPad(value, length, padChar) {
  value = String(value || '');
  if (value.length >= length) return value.slice(0, length);
  return value + String(padChar || '\0').repeat(length - value.length);
}

function followMeTarOctal(value, length) {
  const s = Math.max(0, Number(value || 0)).toString(8);
  return followMeTarPad(s, length - 1, ' ') + '\0';
}

function followMeTarHeader(name, size, mode, mtime, typeflag) {
  const buf = Buffer.alloc(512, 0);
  const safeName = String(name || 'file').replace(/^\/+/, '').slice(0, 100);

  buf.write(followMeTarPad(safeName, 100, '\0'), 0, 100, 'utf8');
  buf.write(followMeTarOctal(mode || 0o644, 8), 100, 8, 'ascii');
  buf.write(followMeTarOctal(0, 8), 108, 8, 'ascii');
  buf.write(followMeTarOctal(0, 8), 116, 8, 'ascii');
  buf.write(followMeTarOctal(size || 0, 12), 124, 12, 'ascii');
  buf.write(followMeTarOctal(Math.floor((mtime || Date.now()) / 1000), 12), 136, 12, 'ascii');

  // checksum placeholder
  for (let i = 148; i < 156; i++) buf[i] = 0x20;

  buf.write(String(typeflag || '0'), 156, 1, 'ascii');
  buf.write('ustar', 257, 5, 'ascii');
  buf.write('00', 263, 2, 'ascii');

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];

  const chk = followMeTarOctal(sum, 8);
  buf.write(chk, 148, 8, 'ascii');

  return buf;
}

function followMeTarFile(name, content) {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ''), 'utf8');
  const header = followMeTarHeader(name, data.length, 0o644, Date.now(), '0');
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512, 0);
  return Buffer.concat([header, data, pad]);
}

function followMeSafeArchiveName(name) {
  return String(name || 'file')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';
}

function followMeParseAttachment(message) {
  try {
    const obj = JSON.parse(String(message || ''));
    if (obj && obj.__followme_attachment === true) return obj;
  } catch(e) {}
  return null;
}

function followMeAttachmentFileNameFromUrl(url) {
  const m = String(url || '').match(/\/uploads\/followme-chat\/([^"'\s/?#]+)/);
  return m ? m[1] : '';
}

function followMeAttachmentLocalPathFromPayload(payload) {
  const path = require('path');
  const file = followMeAttachmentFileNameFromUrl(payload && payload.url);
  if (!file) return '';

  return path.join(__dirname, 'public', 'uploads', 'followme-chat', file);
}

function followMeCleanChatMessageForExport(message) {
  const att = followMeParseAttachment(message);

  if (att) {
    const kind = att.kind || 'allegato';
    const label = att.label || att.filename || 'file';
    const url = att.url || '';
    return '[ALLEGATO: ' + kind + '] ' + label + (url ? ' - ' + url : '');
  }

  return String(message || '');
}

function followMeBuildChatTxt(sessionId, rows) {
  const lines = [];

  lines.push('FOLLOWME CHAT - ESPORTAZIONE SERVER');
  lines.push('Sessione: ' + sessionId);
  lines.push('Data esportazione: ' + new Date().toLocaleString('it-IT'));
  lines.push('------------------------------------------------------------');
  lines.push('');

  for (const row of rows) {
    const sender = String(row.sender || '').toLowerCase() === 'owner' ? 'ADMIN' : 'UTENTE';
    const date = row.created_at ? new Date(row.created_at).toLocaleString('it-IT') : '';
    lines.push('[' + date + '] ' + sender);
    lines.push(followMeCleanChatMessageForExport(row.message));
    lines.push('');
  }

  lines.push('------------------------------------------------------------');
  lines.push('Fine esportazione.');

  return lines.join('\n');
}

app.get('/api/followme/chat/session/:session_id/export-server-files', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const zlib = require('zlib');

    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione mancante.'
      });
    }

    const messagesResult = await pool.query(
      `SELECT id, session_id, sender, message, created_at
       FROM followme_chat_messages
       WHERE session_id = $1
       ORDER BY id ASC
       LIMIT 10000`,
      [sessionId]
    );

    const rows = messagesResult.rows || [];

    const manifest = {
      session_id:String(sessionId),
      exported_at:new Date().toISOString(),
      total_messages:rows.length,
      attachments:[],
      missing:[]
    };

    const parts = [];

    parts.push(followMeTarFile('chat.txt', followMeBuildChatTxt(sessionId, rows)));

    let index = 1;

    for (const row of rows) {
      const att = followMeParseAttachment(row.message);
      if (!att || !att.url) continue;

      const localPath = followMeAttachmentLocalPathFromPayload(att);
      const base = followMeSafeArchiveName(att.filename || att.label || ('allegato-' + index));
      const archiveName = 'allegati/' + String(index).padStart(3, '0') + '-' + base;

      const item = {
        message_id:row.id,
        created_at:row.created_at,
        sender:row.sender,
        kind:att.kind || null,
        label:att.label || att.filename || null,
        mime:att.mime || null,
        url:att.url || null,
        local_file:localPath ? path.basename(localPath) : null,
        saved_as:archiveName
      };

      try {
        if (localPath && fs.existsSync(localPath)) {
          const data = fs.readFileSync(localPath);
          parts.push(followMeTarFile(archiveName, data));
          item.size_bytes = data.length;
          item.available = true;
          manifest.attachments.push(item);
        } else {
          item.available = false;
          item.error = 'File non presente sul filesystem Render al momento dell’esportazione.';
          manifest.missing.push(item);
        }
      } catch(err) {
        item.available = false;
        item.error = err.message || String(err);
        manifest.missing.push(item);
      }

      index++;
    }

    parts.push(followMeTarFile('manifest.json', JSON.stringify(manifest, null, 2)));

    if (manifest.missing.length) {
      const missingLines = [
        'ALLEGATI NON DISPONIBILI',
        'Sessione: ' + sessionId,
        'Data: ' + new Date().toLocaleString('it-IT'),
        ''
      ];

      for (const item of manifest.missing) {
        missingLines.push('- ' + (item.label || 'file') + ' | ' + (item.url || '') + ' | ' + (item.error || 'non disponibile'));
      }

      parts.push(followMeTarFile('allegati-non-disponibili.txt', missingLines.join('\n')));
    }

    // Fine tar: due blocchi da 512 zero
    parts.push(Buffer.alloc(1024, 0));

    const tar = Buffer.concat(parts);
    const gz = zlib.gzipSync(tar, { level: 6 });

    const filename = 'followme-chat-sessione-' + sessionId + '-server-files-' +
      new Date().toISOString().slice(0,19).replace(/[:T]/g, '-') +
      '.tar.gz';

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Cache-Control', 'no-store');

    return res.send(gz);

  } catch(err) {
    console.error('followme server side export files error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore esportazione server files.'
    });
  }
});
// end-followme-server-side-chat-files-export-final-20260519


// followme-close-all-service-final-20260519
app.get('/api/followme/chat/session/:session_id/service-state', async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione mancante.'
      });
    }

    const r = await pool.query(
      `SELECT
         s.id,
         s.status,
         s.uploads_enabled,
         s.is_blocked,
         COALESCE(s.is_user_paused, FALSE) AS is_user_paused,
         p.code AS project_code,
         p.public_id,
         COALESCE(p.chat_mode_enabled, FALSE) AS chat_mode_enabled
       FROM followme_chat_sessions s
       JOIN followme_projects p ON p.id = s.project_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!r.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Sessione non trovata.'
      });
    }

    return res.json({
      success:true,
      session:r.rows[0]
    });
  } catch(err) {
    console.error('followme service-state error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore stato servizio.'
    });
  }
});


// followme-close-selected-chat-final-20260519
app.post('/api/followme/chat/session/:session_id/close-selected', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione non valida.'
      });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Sessione non trovata.'
      });
    }

    const session = sessionRes.rows[0];

    await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    /*
      Messaggio tecnico/visibile nella chat corretta.
      Non spegne chat_mode_enabled del progetto.
      Non tocca altre sessioni.
    */
    await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,'owner',$3,NOW())`,
      [
        sessionId,
        session.project_id,
        JSON.stringify({
          __followme_selected_chat_closed:true,
          session_id:String(sessionId),
          text:'Questa chat è stata chiusa dal proprietario.',
          created_at:new Date().toISOString()
        })
      ]
    );

    return res.json({
      success:true,
      mode:'close_selected_chat',
      session:{
        id:sessionId,
        project_id:session.project_id,
        visitor_label:session.visitor_label,
        display_name:session.display_name,
        status:'closed'
      }
    });
  } catch(err) {
    console.error('followme close selected chat error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore chiusura chat selezionata.'
    });
  }
});
// end-followme-close-selected-chat-final-20260519


// followme-close-all-with-reset-final-20260519
app.post('/api/followme/:code/chat/close-all-with-reset', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    if (typeof ensureFollowMeExtraRequestsTable20260519 === 'function') {
      await ensureFollowMeExtraRequestsTable20260519();
    }

    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({
        success:false,
        error:'Codice progetto mancante.'
      });
    }

    const projectRes = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Progetto non trovato.'
      });
    }

    const project = projectRes.rows[0];

    /*
      1) Chiude tutte le sessioni del progetto.
      Non le cancelliamo qui, così le pagine utente possono ancora leggere
      lo stato "closed" e mostrare la pagina di chiusura corretta.
    */
    const closedSessions = await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           uploads_enabled = FALSE,
           is_blocked = FALSE,
           is_user_paused = FALSE,
           user_paused_at = NULL,
           blocked_at = NULL,
           updated_at = NOW()
       WHERE project_id = $1
       RETURNING id`,
      [project.id]
    );

    /*
      2) Spegne il servizio chat generale.
    */
    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [project.id]
    );

    /*
      3) Reset richieste Extra: chiude tutto quello che è pendente.
      Manteniamo lo storico ma non lasciamo richieste appese.
    */
    try {
      await pool.query(
        `UPDATE followme_extra_requests
         SET status = CASE WHEN status = 'pending' THEN 'closed_by_reset' ELSE status END,
             responded_at = COALESCE(responded_at, NOW()),
             response_message = COALESCE(response_message, 'Servizio chat chiuso.')
         WHERE project_id = $1`,
        [project.id]
      );
    } catch(e) {
      /*
        Tabella assente su vecchi ambienti: non bloccare la chiusura.
      */
    }

    /*
      4) Messaggio tecnico sulle sessioni chiuse.
      Utile se qualche client legge ancora i messaggi prima del redirect/stato.
    */
    for (const row of closedSessions.rows) {
      try {
        await pool.query(
          `INSERT INTO followme_chat_messages
           (session_id, project_id, sender, message, created_at)
           VALUES ($1,$2,'owner',$3,NOW())`,
          [
            row.id,
            project.id,
            JSON.stringify({
              __followme_all_chats_closed_with_reset:true,
              session_id:String(row.id),
              text:'Servizio chat chiuso dal proprietario.',
              created_at:new Date().toISOString()
            })
          ]
        );
      } catch(e) {}
    }

    return res.json({
      success:true,
      mode:'close_all_with_reset',
      project:{
        id:project.id,
        code:project.code,
        public_id:project.public_id,
        chat_mode_enabled:false
      },
      closed_sessions:closedSessions.rows.length,
      message:'Tutte le chat sono state chiuse e il servizio è stato spento.'
    });
  } catch(err) {
    console.error('followme close all with reset error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore chiusura totale con reset.'
    });
  }
});
// end-followme-close-all-with-reset-final-20260519

app.post('/api/followme/:code/chat/close-all', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({
        success:false,
        error:'Codice progetto mancante.'
      });
    }

    const project = await pool.query(
      `SELECT id, code, public_id
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!project.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Progetto non trovato.'
      });
    }

    const projectId = project.rows[0].id;

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [projectId]
    );

    const closed = await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           updated_at = NOW()
       WHERE project_id = $1
         AND COALESCE(status, 'open') <> 'closed'
       RETURNING id`,
      [projectId]
    );

    return res.json({
      success:true,
      mode:'close_all',
      project:project.rows[0],
      closed_sessions:closed.rows.length,
      message:'Servizio chat chiuso.'
    });
  } catch(err) {
    console.error('followme close all error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore chiusura servizio chat.'
    });
  }
});
// end-followme-close-all-service-final-20260519

// followme-reopen-service-final-20260519
app.post('/api/followme/:code/chat/reopen-service', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({
        success:false,
        error:'Codice progetto mancante.'
      });
    }

    const project = await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = TRUE,
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING id, code, public_id, chat_mode_enabled, updated_at`,
      [code]
    );

    if (!project.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Progetto non trovato.'
      });
    }

    /*
      Non cancelliamo lo storico.
      Le sessioni closed restano chiuse; il QR creerà nuove sessioni.
    */
    return res.json({
      success:true,
      mode:'reopen_service',
      project:project.rows[0],
      message:'Servizio chat riaperto.'
    });
  } catch(err) {
    console.error('followme reopen service error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore riapertura servizio chat.'
    });
  }
});
// end-followme-reopen-service-final-20260519





// followme-extra-request-dedicated-final-20260519
async function ensureFollowMeExtraRequestsTable20260519() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_extra_requests (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES followme_chat_sessions(id) ON DELETE CASCADE,
      project_id BIGINT NOT NULL,
      request_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      response_message TEXT
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS followme_extra_requests_request_id_uq
    ON followme_extra_requests(request_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS followme_extra_requests_session_status_idx
    ON followme_extra_requests(session_id, status, id DESC)
  `);
}

app.post('/api/followme/chat/session/:session_id/request-extra', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    await ensureFollowMeExtraRequestsTable20260519();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione non valida.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, uploads_enabled, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const session = sessionRes.rows[0];

    if (session.status !== 'open') {
      return res.status(409).json({ success:false, error:'Sessione non aperta.' });
    }

    if (session.uploads_enabled === true) {
      return res.json({
        success:true,
        already_enabled:true,
        session_id:session.id,
        message:'Extra già attivo.'
      });
    }

    /* followme-extra-fast-server-guard-20260527
       Se esiste già una richiesta Extra pendente per questa sessione,
       non ne creiamo altre. Evita rallentamenti, doppioni e pannelli duplicati.
    */
    const pendingExtra20260527 = await pool.query(
      `SELECT id, session_id, project_id, request_id, status, created_at, responded_at, response_message
       FROM followme_extra_requests
       WHERE session_id = $1
         AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
      [session.id]
    );

    if (pendingExtra20260527.rows.length) {
      return res.json({
        success:true,
        existing_pending:true,
        request:pendingExtra20260527.rows[0],
        session:{
          id:session.id,
          visitor_label:session.visitor_label,
          display_name:session.display_name,
          uploads_enabled:session.uploads_enabled
        }
      });
    }

    const requestId = String(
      req.body && req.body.request_id
        ? req.body.request_id
        : `extra-${session.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    const inserted = await pool.query(
      `INSERT INTO followme_extra_requests
       (session_id, project_id, request_id, status, created_at)
       VALUES ($1,$2,$3,'pending',NOW())
       ON CONFLICT (request_id) DO UPDATE
       SET status = followme_extra_requests.status
       RETURNING id, session_id, project_id, request_id, status, created_at`,
      [session.id, session.project_id, requestId]
    );

    /*
      Inseriamo anche un messaggio visibile nella chat corretta, ma l'azione admin
      NON userà più il DOM: userà la tabella dedicata sopra.
    */
    await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,'visitor',$3,NOW())`,
      [
        session.id,
        session.project_id,
        JSON.stringify({
          __followme_extra_request_notice:true,
          request_id:requestId,
          session_id:String(session.id),
          text:'Richiesta Extra ricevuta.',
          created_at:new Date().toISOString()
        })
      ]
    );

    return res.json({
      success:true,
      request:inserted.rows[0],
      session:{
        id:session.id,
        visitor_label:session.visitor_label,
        display_name:session.display_name,
        uploads_enabled:session.uploads_enabled
      }
    });
  } catch(err) {
    console.error('followme request-extra error:', err);
    return res.status(500).json({ success:false, error:'Errore richiesta Extra.' });
  }
});

app.get('/api/followme/chat/session/:session_id/extra-requests', async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    await ensureFollowMeExtraRequestsTable20260519();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione non valida.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, uploads_enabled, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const requests = await pool.query(
      `SELECT id, session_id, project_id, request_id, status, created_at, responded_at, response_message
       FROM followme_extra_requests
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT 10`,
      [sessionId]
    );

    return res.json({
      success:true,
      session:sessionRes.rows[0],
      requests:requests.rows
    });
  } catch(err) {
    console.error('followme extra-requests list error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura richieste Extra.' });
  }
});

app.post('/api/followme/chat/session/:session_id/extra-request/:request_id/respond', express.json(), async (req, res) => {
  try {
    if (typeof ensureFollowMeRuntimeFast === 'function') {
      await ensureFollowMeRuntimeFast();
    } else if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }

    await ensureFollowMeExtraRequestsTable20260519();

    const sessionId = Number(req.params.session_id || 0);
    const requestId = String(req.params.request_id || '').trim();
    const action = String((req.body && req.body.action) || '').trim().toLowerCase();

    if (!sessionId || !requestId) {
      return res.status(400).json({ success:false, error:'Richiesta non valida.' });
    }

    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ success:false, error:'Azione non valida.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, uploads_enabled, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const session = sessionRes.rows[0];

    const reqRes = await pool.query(
      `SELECT id, session_id, project_id, request_id, status
       FROM followme_extra_requests
       WHERE session_id = $1
         AND request_id = $2
       LIMIT 1`,
      [sessionId, requestId]
    );

    if (!reqRes.rows.length) {
      return res.status(404).json({ success:false, error:'Richiesta Extra non trovata per questa sessione.' });
    }

    /* followme-extra-fast-respond-idempotent-20260527
       Se la richiesta è già stata approvata/rifiutata, rispondiamo subito
       senza reinserire messaggi e senza rifare update inutili.
    */
    if (reqRes.rows[0].status && reqRes.rows[0].status !== 'pending') {
      const freshSessionAlready = await pool.query(
        `SELECT id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, status
         FROM followme_chat_sessions
         WHERE id = $1
         LIMIT 1`,
        [sessionId]
      );

      return res.json({
        success:true,
        already_responded:true,
        action:reqRes.rows[0].status === 'accepted' ? 'accept' : 'reject',
        request:reqRes.rows[0],
        session:freshSessionAlready.rows[0] || session
      });
    }

    const responseMessage = action === 'accept'
      ? 'Richiesta accettata. Ora puoi inviare foto, messaggi audio, posizione e altri allegati.'
      : 'In questo momento non è possibile abilitare l’invio Extra. Riprova più tardi.';

    if (action === 'accept') {
      await pool.query(
        `UPDATE followme_chat_sessions
         SET uploads_enabled = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }

    const updatedReq = await pool.query(
      `UPDATE followme_extra_requests
       SET status = $3,
           responded_at = NOW(),
           response_message = $4
       WHERE session_id = $1
         AND request_id = $2
       RETURNING id, session_id, request_id, status, responded_at, response_message`,
      [sessionId, requestId, action === 'accept' ? 'accepted' : 'rejected', responseMessage]
    );

    await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,'owner',$3,NOW())`,
      [sessionId, session.project_id, responseMessage]
    );

    const freshSession = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    return res.json({
      success:true,
      action,
      request:updatedReq.rows[0],
      session:freshSession.rows[0]
    });
  } catch(err) {
    console.error('followme extra-request respond error:', err);
    return res.status(500).json({ success:false, error:'Errore risposta richiesta Extra.' });
  }
});
// end-followme-extra-request-dedicated-final-20260519

app.get('/api/followme/chat/session/:session_id/messages', async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);
    const after = Number(req.query.after || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const rows = await pool.query(
      `SELECT id, sender, message, created_at
       FROM followme_chat_messages
       WHERE session_id = $1 AND id > $2
       ORDER BY id ASC
       LIMIT 100`,
      [sessionId, after]
    );

    return res.json({ success:true, messages:rows.rows });
  } catch (err) {
    console.error('followme chat messages error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura messaggi.' });
  }
});



app.get('/api/followme/debug/temp-attachments', async (req, res) => {
  try {
    const key = String(req.query.key || '').trim();
    const expected = process.env.FOLLOWME_DEBUG_KEY || process.env.ADMIN_PASSWORD || '';

    if (!expected || key !== expected) {
      return res.status(401).json({ success:false, error:'Chiave debug non valida.' });
    }

    const fs = require('fs');
    const path = require('path');

    const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat');
    const now = Date.now();

    if (!fs.existsSync(uploadDir)) {
      return res.json({
        success:true,
        ttl_seconds:120,
        files:[]
      });
    }

    const files = fs.readdirSync(uploadDir)
      .map(file => {
        const fullPath = path.join(uploadDir, file);
        const stat = fs.statSync(fullPath);

        return {
          file,
          size_bytes: stat.size,
          age_seconds: Math.round((now - stat.mtimeMs) / 1000),
          delete_in_seconds: Math.max(0, Math.round((FOLLOWME_ATTACHMENT_TTL_MS - (now - stat.mtimeMs)) / 1000))
        };
      })
      .sort((a,b) => b.age_seconds - a.age_seconds);

    return res.json({
      success:true,
      ttl_seconds:120,
      files
    });
  } catch (err) {
    return res.status(500).json({
      success:false,
      error:err.message || String(err)
    });
  }
});



app.post('/api/followme/chat/session/:session_id/attachment-raw', express.raw({
  type: '*/*',
  limit: '25mb'
}), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const fs = require('fs');
    const path = require('path');

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.headers['x-followme-sender'] || 'owner').trim();
    const kind = String(req.headers['x-followme-kind'] || '').trim();
    const filenameHeader = String(req.headers['x-followme-filename'] || '').trim();
    const mime = String(req.headers['content-type'] || req.headers['x-followme-mime'] || '').trim();

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success:false, error:'File mancante.' });
    }

    const maxBytes = 20 * 1024 * 1024;
    if (req.body.length > maxBytes) {
      return res.status(413).json({ success:false, error:'File troppo grande. Limite 20 MB.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({
        success:false,
        session_closed:true,
        error:'Chat chiusa dal proprietario.'
      });
    }

    const session = sessionRes.rows[0];

    if (session.is_blocked === true) {
      return res.status(403).json({
        success:false,
        blocked:true,
        error:'Servizio momentaneamente non disponibile. Riprova più tardi.'
      });
    }

    if (sender === 'visitor' && session.uploads_enabled !== true) {
      return res.status(403).json({
        success:false,
        uploads_enabled:false,
        error:'Caricamento extra non abilitato per questo utente.'
      });
    }

    let safeFilename = decodeURIComponent(filenameHeader || '')
      .replace(/[^\w.\-àèéìòùÀÈÉÌÒÙ ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);

    if (!safeFilename) {
      safeFilename = `${kind || 'allegato'}_${Date.now()}`;
    }

    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'audio/webm': '.webm',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'application/pdf': '.pdf'
    };

    const cleanMime = mime.split(';')[0].trim();
    const ext = path.extname(safeFilename) || extByMime[cleanMime] || '';
    const base = path.basename(safeFilename, path.extname(safeFilename)).replace(/[^\w.\-]+/g, '_') || (kind || 'file');
    const storedName = `${Date.now()}_${Math.random().toString(16).slice(2,8)}_${base}${ext}`;

    const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat');
    fs.mkdirSync(uploadDir, { recursive:true });

    const fullPath = path.join(uploadDir, storedName);
    fs.writeFileSync(fullPath, req.body);

    const attachmentUrl = `/uploads/followme-chat/${storedName}`;

    const payload = {
      __followme_attachment: true,
      temporary: false,
      persistent: true,
      kind: kind || (cleanMime.startsWith('image/') ? 'image' : cleanMime.startsWith('audio/') ? 'audio' : 'document'),
      url: attachmentUrl,
      filename: safeFilename,
      mime: cleanMime,
      label: safeFilename,
      created_at: new Date().toISOString()
    };

    const inserted = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, session_id, project_id, sender, message, created_at`,
      [sessionId, session.project_id, sender, JSON.stringify(payload)]
    );

    return res.json({
      success:true,
      mode:'raw_binary',
      size_bytes:req.body.length,
      message: inserted.rows[0],
      attachment: payload
    });
  } catch (err) {
    console.error('followme raw attachment upload error:', err);
    return res.status(500).json({ success:false, error:'Errore invio allegato raw.' });
  }
});


app.post('/api/followme/chat/session/:session_id/attachment', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const fs = require('fs');
    const path = require('path');

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.body?.sender || 'owner').trim();
    const kind = String(req.body?.kind || '').trim();
    const filenameRaw = String(req.body?.filename || '').trim();
    const mime = String(req.body?.mime || '').trim();
    const dataUrl = String(req.body?.data_url || '').trim();
    const url = String(req.body?.url || '').trim();
    const label = String(req.body?.label || '').trim();

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    if (!['owner','visitor','system'].includes(sender)) {
      return res.status(400).json({ success:false, error:'Sender non valido.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const session = sessionRes.rows[0];

    if (session.is_blocked === true) {
      return res.status(403).json({
        success:false,
        blocked:true,
        error:'Servizio momentaneamente non disponibile. Riprova più tardi.'
      });
    }

    if (sender === 'visitor' && session.uploads_enabled !== true) {
      return res.status(403).json({
        success:false,
        uploads_enabled:false,
        error:'Caricamento extra non abilitato per questo utente.'
      });
    }

    let attachmentUrl = url || '';
    let safeFilename = filenameRaw
      .replace(/[^\w.\-àèéìòùÀÈÉÌÒÙ ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 80);

    if (!safeFilename) {
      safeFilename = kind + '_' + Date.now();
    }

    if (dataUrl) {
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        return res.status(400).json({ success:false, error:'Formato file non valido.' });
      }

      const realMime = mime || m[1];
      const base64 = m[2];
      const buffer = Buffer.from(base64, 'base64');

      const maxBytes = 20 * 1024 * 1024;
      if (buffer.length > maxBytes) {
        return res.status(413).json({ success:false, error:'File troppo grande. Limite 20 MB.' });
      }

      const extByMime = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'audio/webm': '.webm',
        'audio/mp4': '.m4a',
        'audio/mpeg': '.mp3',
        'application/pdf': '.pdf'
      };

      const ext = path.extname(safeFilename) || extByMime[realMime] || '';
      const base = path.basename(safeFilename, path.extname(safeFilename)).replace(/[^\w.\-]+/g, '_') || kind;
      const storedName = `${Date.now()}_${Math.random().toString(16).slice(2,8)}_${base}${ext}`;

      const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat');
      fs.mkdirSync(uploadDir, { recursive:true });

      const fullPath = path.join(uploadDir, storedName);
      fs.writeFileSync(fullPath, buffer);

    // FOLLOWME_VOICE_PERSISTENT_DISK_VERIFY_FINAL_20260529
    if (typeof followMeVoiceAssertWrittenPersistentFinal20260529 === 'function') {
      followMeVoiceAssertWrittenPersistentFinal20260529(fullPath, Math.min(buffer.length, 1));
    }

      attachmentUrl = `/uploads/followme-chat/${storedName}`;
      safeFilename = filenameRaw || storedName;
    }

    if (!attachmentUrl && kind !== 'location') {
      return res.status(400).json({ success:false, error:'Allegato mancante.' });
    }

    const payload = {
      __followme_attachment: true,
      temporary: false,
      persistent: true,
      kind,
      url: attachmentUrl,
      filename: safeFilename,
      mime,
      label: label || safeFilename,
      created_at: new Date().toISOString()
    };

    const inserted = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, session_id, project_id, sender, message, created_at`,
      [sessionId, session.project_id, sender, JSON.stringify(payload)]
    );

    return res.json({
      success:true,
      message: inserted.rows[0],
      attachment: payload
    });
  } catch (err) {
    console.error('followme attachment upload error:', err);
    return res.status(500).json({ success:false, error:'Errore invio allegato.' });
  }
});

app.post('/api/followme/chat/session/:session_id/message', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.body?.sender || '').trim() === 'owner' ? 'owner' : 'visitor';
    const message = String(req.body?.message || '').trim();

    if (!sessionId || !message) {
      return res.status(400).json({ success:false, error:'Messaggio mancante.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, is_blocked, status FROM followme_chat_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    if (sender === 'visitor' && sessionRes.rows[0].is_blocked === true) {
      return res.status(403).json({
        success:false,
        blocked:true,
        error:'Servizio momentaneamente non disponibile. Riprova più tardi.'
      });
    }

    /* followme-server-message-block-closed-session-20260527 */
    if (String(sessionRes.rows[0].status || '').toLowerCase() === 'closed') {
      return res.status(409).json({
        success:false,
        closed:true,
        chat_closed:true,
        error:'Chat chiusa.'
      });
    }

    const projectId = sessionRes.rows[0].project_id;

    
    /* followme-server-message-dedupe-before-insert-20260527
       Protezione server-side:
       se il front-end manda lo stesso messaggio più volte in pochi secondi,
       NON creiamo righe duplicate nel database.
    */
    const existingRecentMessage = await pool.query(
      `SELECT id, sender, message, created_at
       FROM followme_chat_messages
       WHERE session_id = $1
         AND project_id = $2
         AND sender = $3
         AND message = $4
         AND created_at > NOW() - INTERVAL '4 seconds'
       ORDER BY id DESC
       LIMIT 1`,
      [sessionId, projectId, sender, message]
    );

    if (existingRecentMessage.rows.length) {
      await pool.query(
        `UPDATE followme_chat_sessions SET last_seen_at = NOW() WHERE id = $1`,
        [sessionId]
      );

      return res.json({
        success:true,
        duplicate_ignored:true,
        message:existingRecentMessage.rows[0]
      });
    }

const inserted = await pool.query(
      
    

`INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, sender, message, created_at`,
      [sessionId, projectId, sender, message]
    );

    await pool.query(
      `UPDATE followme_chat_sessions SET last_seen_at = NOW() WHERE id = $1`,
      [sessionId]
    );

    return res.json({ success:true, message:inserted.rows[0] });
  } catch (err) {
    console.error('followme chat post message error:', err);
    return res.status(500).json({ success:false, error:'Errore invio messaggio.' });
  }
});




/* disabled old followme session name endpoint */



/* disabled duplicate followme name endpoint */




/* disabled duplicate followme session settings endpoint */



/* disabled duplicate followme settings endpoint */





// followme-user-set-explicit-clean-20260519
app.post('/api/followme/chat/session/:session_id/set-user-control-clean', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const hasUploads = typeof req.body?.uploads_enabled === 'boolean';
    const hasBlocked = typeof req.body?.is_blocked === 'boolean';

    if (!hasUploads && !hasBlocked) {
      return res.status(400).json({ success:false, error:'Nessuna impostazione valida.' });
    }

    const currentRes = await pool.query(
      `SELECT id, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1 AND status = 'open'
       LIMIT 1`,
      [sessionId]
    );

    if (!currentRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata o chiusa.' });
    }

    const current = currentRes.rows[0];

    const nextUploads = hasUploads ? req.body.uploads_enabled : !!current.uploads_enabled;
    const nextBlocked = hasBlocked ? req.body.is_blocked : !!current.is_blocked;

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET uploads_enabled = $2,
           is_blocked = $3,
           blocked_at = CASE WHEN $3 = TRUE THEN COALESCE(blocked_at, NOW()) ELSE NULL END,
           updated_at = NOW(),
           last_seen_at = COALESCE(last_seen_at, NOW())
       WHERE id = $1
         AND status = 'open'
       RETURNING id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, blocked_at, status, updated_at, last_seen_at`,
      [sessionId, nextUploads, nextBlocked]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non aggiornata.' });
    }

    return res.json({
      success:true,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme clean explicit user control error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore aggiornamento utente.'
    });
  }
});



// followme-ensure-cache-fast-final-20260519
let __followMeChatSchemaEnsuredOnce = false;
let __followMeChatSchemaEnsuringPromise = null;

async function ensureFollowMeChatSchemaFast() {
  if (__followMeChatSchemaEnsuredOnce) return;

  if (__followMeChatSchemaEnsuringPromise) {
    await __followMeChatSchemaEnsuringPromise;
    return;
  }

  __followMeChatSchemaEnsuringPromise = (async () => {
    if (typeof ensureFollowMeChatSchema === 'function') {
      await ensureFollowMeChatSchema();
    }
    __followMeChatSchemaEnsuredOnce = true;
  })();

  try {
    await __followMeChatSchemaEnsuringPromise;
  } finally {
    __followMeChatSchemaEnsuringPromise = null;
  }
}

let __followMeUserColumnsEnsuredOnce = false;
let __followMeUserColumnsEnsuringPromise = null;

async function ensureFollowMeChatUserManagementColumnsFast() {
  if (__followMeUserColumnsEnsuredOnce) return;

  if (__followMeUserColumnsEnsuringPromise) {
    await __followMeUserColumnsEnsuringPromise;
    return;
  }

  __followMeUserColumnsEnsuringPromise = (async () => {
    if (typeof ensureFollowMeChatUserManagementColumns === 'function') {
      await ensureFollowMeChatUserManagementColumns();
    }
    if (typeof ensureFollowMeUserPausedColumns === 'function') {
      await ensureFollowMeUserPausedColumns();
    }
    __followMeUserColumnsEnsuredOnce = true;
  })();

  try {
    await __followMeUserColumnsEnsuringPromise;
  } finally {
    __followMeUserColumnsEnsuringPromise = null;
  }
}

async function ensureFollowMeRuntimeFast() {
  await ensureFollowMeChatSchemaFast();
  await ensureFollowMeChatUserManagementColumnsFast();
}
// end-followme-ensure-cache-fast-final-20260519

app.get('/api/followme/chat/session/:session_id/state', async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const result = await pool.query(
      `SELECT id, display_name, visitor_label, uploads_enabled, is_blocked, blocked_at, is_user_paused, user_paused_at, updated_at, owner_opened_at, last_seen_at, status
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    return res.json({
      success:true,
      session:result.rows[0]
    });
  } catch (err) {
    console.error('followme chat session state error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore lettura stato utente.'
    });
  }
});





// followme-user-set-explicit-20260518
app.post('/api/followme/chat/session/:session_id/set-user-control', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const hasUploads = typeof req.body?.uploads_enabled === 'boolean';
    const hasBlocked = typeof req.body?.is_blocked === 'boolean';

    if (!hasUploads && !hasBlocked) {
      return res.status(400).json({ success:false, error:'Nessuna impostazione valida.' });
    }

    const existing = await pool.query(
      `SELECT id, project_id, display_name, visitor_label, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const current = existing.rows[0];

    const nextUploads = hasUploads ? req.body.uploads_enabled : !!current.uploads_enabled;
    const nextBlocked = hasBlocked ? req.body.is_blocked : !!current.is_blocked;

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET uploads_enabled = $2,
           is_blocked = $3,
           blocked_at = CASE WHEN $3 = TRUE THEN COALESCE(blocked_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, display_name, visitor_label, uploads_enabled, is_blocked, blocked_at, updated_at`,
      [sessionId, nextUploads, nextBlocked]
    );

    return res.json({
      success:true,
      mode:'explicit',
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme explicit user control error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore aggiornamento utente.'
    });
  }
});


// followme-user-toggle-atomic-20260518
app.post('/api/followme/chat/session/:session_id/toggle-user-control', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);
    const action = String(req.body?.action || '').trim();

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    if (!['uploads','block'].includes(action)) {
      return res.status(400).json({ success:false, error:'Azione non valida.' });
    }

    const existing = await pool.query(
      `SELECT id, project_id, display_name, visitor_label, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    let updated;

    if (action === 'uploads') {
      updated = await pool.query(
        `UPDATE followme_chat_sessions
         SET uploads_enabled = NOT COALESCE(uploads_enabled, FALSE),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, project_id, display_name, visitor_label, uploads_enabled, is_blocked, blocked_at, updated_at`,
        [sessionId]
      );
    } else {
      updated = await pool.query(
        `UPDATE followme_chat_sessions
         SET is_blocked = NOT COALESCE(is_blocked, FALSE),
             blocked_at = CASE
               WHEN NOT COALESCE(is_blocked, FALSE) = TRUE THEN NOW()
               ELSE NULL
             END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, project_id, display_name, visitor_label, uploads_enabled, is_blocked, blocked_at, updated_at`,
        [sessionId]
      );
    }

    return res.json({
      success:true,
      action,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme atomic user toggle error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore aggiornamento utente.'
    });
  }
});

app.post('/api/followme/chat/session/:session_id/settings', express.json(), async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const sessionId = Number(req.params.session_id || 0);

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const hasUploads = typeof req.body?.uploads_enabled === 'boolean';
    const hasBlocked = typeof req.body?.is_blocked === 'boolean';

    if (!hasUploads && !hasBlocked) {
      return res.status(400).json({ success:false, error:'Nessuna impostazione valida.' });
    }

    const existing = await pool.query(
      `SELECT id, project_id, display_name, visitor_label, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const current = existing.rows[0];

    const uploadsEnabled = hasUploads ? req.body.uploads_enabled : !!current.uploads_enabled;
    const isBlocked = hasBlocked ? req.body.is_blocked : !!current.is_blocked;

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET uploads_enabled = $2,
           is_blocked = $3,
           blocked_at = CASE WHEN $3 = TRUE THEN COALESCE(blocked_at, NOW()) ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, display_name, visitor_label, uploads_enabled, is_blocked, blocked_at, updated_at`,
      [sessionId, uploadsEnabled, isBlocked]
    );

    const updatedSession = updated.rows[0];


    return res.json({
      success:true,
      session:updatedSession
    });
  } catch (err) {
    console.error('followme chat session settings error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore aggiornamento impostazioni utente.'
    });
  }
});


app.post('/api/followme/chat/session/:session_id/name', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const sessionId = Number(req.params.session_id || 0);
    let displayName = String(req.body?.display_name || '').trim();

    if (!sessionId) {
      return res.status(400).json({
        success:false,
        error:'Sessione mancante.'
      });
    }

    displayName = displayName
      .replace(/[<>"]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 40)
      .trim();

    if (!displayName || displayName.length < 2) {
      return res.status(400).json({
        success:false,
        error:'Nome non valido.'
      });
    }

    // Garantisce la colonna, senza dipendere da funzioni precedenti.
    await pool.query(`
      ALTER TABLE followme_chat_sessions
      ADD COLUMN IF NOT EXISTS display_name TEXT
    `);

    // Verifica che la sessione esista prima dell'update.
    const existing = await pool.query(
      `SELECT id
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success:false,
        error:'Sessione non trovata.',
        session_id:sessionId
      });
    }

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET display_name = $2,
           updated_at = NOW(),
           last_seen_at = NOW()
       WHERE id = $1
       RETURNING id, display_name, updated_at`,
      [sessionId, displayName]
    );

    return res.json({
      success:true,
      session:updated.rows[0]
    });

  } catch (err) {
    console.error('followme session name final error:', err);
    return res.status(500).json({
      success:false,
      error:err.message || 'Errore salvataggio nome.'
    });
  }
});


app.get('/api/followme/:code/chat/sessions', async (req, res) => {
  try {
    await ensureFollowMeRuntimeFast();

    const code = normalizeFollowMeCode(req.params.code);

    const projectRes = await pool.query(
      `SELECT id, code, chat_mode_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];

    const sessionsRes = await pool.query(
      `WITH ordered_sessions AS (
         SELECT
           s.*,
           ROW_NUMBER() OVER (ORDER BY s.created_at ASC, s.id ASC) AS display_index
         FROM followme_chat_sessions s
         WHERE s.project_id = $1
           AND s.status = 'open'
       )
       SELECT
         s.id,
         s.display_index,
         s.visitor_label,
         s.display_name,
             uploads_enabled,
             is_blocked,
             COALESCE(is_user_paused, FALSE) AS is_user_paused,
             user_paused_at,
         s.status,
         s.created_at,
         s.last_seen_at,
         s.owner_opened_at,
         (
           SELECT m.message
           FROM followme_chat_messages m
           WHERE m.session_id = s.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS last_message,
         (
           SELECT m.sender
           FROM followme_chat_messages m
           WHERE m.session_id = s.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS last_sender,
         (
           SELECT MAX(m.id)
           FROM followme_chat_messages m
           WHERE m.session_id = s.id
         ) AS last_message_id
       FROM ordered_sessions s
       ORDER BY s.created_at ASC, s.id ASC
       LIMIT 20`,
      [project.id]
    );

    return res.json({
      success:true,
      chat_mode_enabled: project.chat_mode_enabled === true,
      project_code: project.code,
      sessions: sessionsRes.rows
    });
  } catch (err) {
    console.error('followme chat sessions list error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura chat attive.' });
  }
});

app.get('/api/followme/:code/chat/latest-open-session', async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);

    const projectRes = await pool.query(
      `SELECT id, code, chat_mode_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];

    if (project.chat_mode_enabled !== true) {
      return res.json({ success:true, chat_mode_enabled:false, session:null });
    }

    const sessionRes = await pool.query(
      `SELECT id, visitor_label, status, created_at, last_seen_at, owner_opened_at
       FROM followme_chat_sessions
       WHERE project_id = $1
         AND status = 'open'
       ORDER BY created_at DESC
       LIMIT 1`,
      [project.id]
    );

    return res.json({
      success:true,
      chat_mode_enabled:true,
      project_code:project.code,
      session:sessionRes.rows[0] || null
    });
  } catch (err) {
    console.error('followme latest open chat session error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura ultima chat.' });
  }
});


app.post('/api/followme/:code/chat/session/:session_id/rename', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const sessionId = Number(req.params.session_id || 0);
    let displayName = String(req.body?.display_name || '').trim();

    displayName = displayName
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 32);

    if (!sessionId || !displayName) {
      return res.status(400).json({ success:false, error:'Nome mancante.' });
    }

    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .'-]{2,32}$/.test(displayName)) {
      return res.status(400).json({ success:false, error:'Nome non valido.' });
    }

    const projectRes = await pool.query(
      `SELECT id, code
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET display_name = $3,
           updated_at = NOW(),
           last_seen_at = NOW()
       WHERE id = $1 AND project_id = $2
       RETURNING id, visitor_label, display_name, updated_at`,
      [sessionId, project.id, displayName]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    return res.json({
      success:true,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme chat rename session error:', err);
    return res.status(500).json({ success:false, error:'Errore rinomina utente.' });
  }
});

app.get('/api/followme/:code/chat/session/:session_id', async (req, res) => {
  try {
    await ensureFollowMeChatSchemaFast();

    const code = normalizeFollowMeCode(req.params.code);
    const sessionId = Number(req.params.session_id || 0);

    const projectRes = await pool.query(
      `SELECT id, code, chat_mode_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!projectRes.rows.length || !sessionId) {
      return res.status(404).json({ success:false, error:'Chat non trovata.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, status, created_at, last_seen_at
       FROM followme_chat_sessions
       WHERE id = $1 AND project_id = $2
       LIMIT 1`,
      [sessionId, projectRes.rows[0].id]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    await pool.query(
      `UPDATE followme_chat_sessions SET owner_opened_at = NOW() WHERE id = $1`,
      [sessionId]
    );

    return res.json({
      success:true,
      project:projectRes.rows[0],
      session:sessionRes.rows[0]
    });
  } catch (err) {
    console.error('followme owner chat session error:', err);
    return res.status(500).json({ success:false, error:'Errore apertura chat proprietario.' });
  }
});




// FOLLOWME_INFO_REQUESTS_BACKEND_20260528
async function ensureFollowMeInfoRequestsRuntime20260528() {
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS info_requests_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS source_type TEXT`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS source_url TEXT`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS source_label TEXT`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
}

function followMeShortSourceLabel20260528(rawUrl) {
  try {
    const value = String(rawUrl || '').trim();
    if (!value) return 'contenuto';

    if (value.startsWith('/fm/document/')) return 'documento';
    if (value.startsWith('/fm/image/')) return 'immagine';

    const u = new URL(value, 'https://adesivo-auto.onrender.com');
    let label = String(u.hostname || '').replace(/^www\./, '');

    if (!label || label === 'adesivo-auto.onrender.com') {
      label = String(u.pathname || '').split('/').filter(Boolean)[0] || 'contenuto';
    }

    label = label.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (label.length > 14) label = label.slice(0, 14) + '…';
    return label || 'contenuto';
  } catch(e) {
    const cleaned = String(rawUrl || 'contenuto').replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    return cleaned.slice(0, 14) + (cleaned.length > 14 ? '…' : '');
  }
}

async function sendFollowMeInfoRequestPush20260528(project, sessionId, sourceLabel) {
  try {
    if (!project || !project.id || !project.code || !sessionId) return { sent:0, failed:0 };

    if (typeof webpush === 'undefined' || !webpush || typeof webpush.sendNotification !== 'function') {
      return { sent:0, failed:0, skipped:true };
    }

    const adminUrl = `/fm/chat-v2/admin/${encodeURIComponent(project.code)}?session=${encodeURIComponent(sessionId)}`;
    const label = String(sourceLabel || 'contenuto').slice(0, 18);

    const unreadCount = await getFollowMeUnreadActivityCount20260529(project.id);

    const payload = JSON.stringify({
      title: 'Richiesta informazioni',
      body: 'Richiesta informazioni da utente per sito: ' + label,
      unreadCount: unreadCount,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `followme-info-request-${project.id}-${sessionId}`,
      renotify: true,
      requireInteraction: false,
      vibrate: [120, 60, 120],
      url: adminUrl,
      targetUrl: adminUrl,
      relativeTargetUrl: adminUrl,
      data: {
        type: 'followme_info_request',
        code: project.code,
        public_id: project.public_id || project.code,
        session_id: String(sessionId),
        source_label: label,
        url: adminUrl,
        targetUrl: adminUrl,
        relativeTargetUrl: adminUrl
      }
    });

    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM followme_push_subscriptions
       WHERE project_id = $1
       LIMIT 200`,
      [project.id]
    );

    let sent = 0;
    let failed = 0;

    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          try { await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]); } catch(e) {}
        } else {
          console.error('followme info request push error:', err.statusCode || '', err.body || err.message || err);
        }
      }
    }

    return { sent, failed };
  } catch (err) {
    console.error('sendFollowMeInfoRequestPush error:', err.message || err);
    return { sent:0, failed:1, error:String(err.message || err) };
  }
}

app.post('/api/followme/:code/info-requests/toggle', express.json(), async function(req, res) {
  try {
    await ensureFollowMeInfoRequestsRuntime20260528();

    const code = String(req.params.code || '').trim();
    const enabled = req.body && typeof req.body.enabled === 'boolean'
      ? req.body.enabled
      : !!(req.body && req.body.info_requests_enabled);

    const q = await pool.query(
      `UPDATE followme_projects
       SET info_requests_enabled = $2,
           updated_at = NOW()
       WHERE code = $1 OR public_id = $1
       RETURNING id, code, public_id, info_requests_enabled`,
      [code, enabled]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    return res.json({
      success:true,
      project:q.rows[0],
      info_requests_enabled:q.rows[0].info_requests_enabled === true
    });
  } catch (err) {
    console.error('followme info requests toggle error:', err);
    return res.status(500).json({ success:false, error:'Errore aggiornamento richieste informazioni.' });
  }
});




// FOLLOWME_ACTIVITY_COUNTERS_20260529
async function ensureFollowMeActivityCounters20260529() {
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS activity_reset_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS activity_reset_total_scans INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS activity_reset_chat_requests INTEGER DEFAULT 0`);
}

async function getFollowMeActivitySnapshot20260529(projectId) {
  const scans = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM followme_scan_logs
     WHERE project_id = $1`,
    [projectId]
  );

  const chats = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM followme_chat_sessions
     WHERE project_id = $1
       AND source_type = 'info_request'`,
    [projectId]
  );

  return {
    total_scans:Number(scans.rows[0]?.n || 0),
    total_chat_requests:Number(chats.rows[0]?.n || 0)
  };
}

app.get('/api/followme/:code/activity-counters', async function(req, res) {
  try {
    await ensureFollowMeActivityCounters20260529();

    const code = String(req.params.code || '').trim();

    const q = await pool.query(
      `SELECT id, code, public_id, activity_reset_at,
              COALESCE(activity_reset_total_scans,0)::int AS activity_reset_total_scans,
              COALESCE(activity_reset_chat_requests,0)::int AS activity_reset_chat_requests
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = q.rows[0];
    const snap = await getFollowMeActivitySnapshot20260529(project.id);

    return res.json({
      success:true,
      activity_reset_at:project.activity_reset_at || null,
      counters:{
        new_views:Math.max(0, snap.total_scans - Number(project.activity_reset_total_scans || 0)),
        new_chat_requests:Math.max(0, snap.total_chat_requests - Number(project.activity_reset_chat_requests || 0)),
        total_scans:snap.total_scans,
        total_chat_requests:snap.total_chat_requests
      }
    });
  } catch (err) {
    console.error('followme activity counters error:', err);
    return res.status(500).json({ success:false, error:'Errore contatori attività.' });
  }
});

app.post('/api/followme/:code/activity-counters/reset', express.json({ limit:'16kb' }), async function(req, res) {
  try {
    await ensureFollowMeActivityCounters20260529();

    const code = String(req.params.code || '').trim();

    const q0 = await pool.query(
      `SELECT id, code, public_id
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q0.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const snap = await getFollowMeActivitySnapshot20260529(q0.rows[0].id);

    await pool.query(
      `UPDATE followme_projects
       SET activity_reset_at = NOW(),
           activity_reset_total_scans = $2,
           activity_reset_chat_requests = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [q0.rows[0].id, snap.total_scans, snap.total_chat_requests]
    );

    return res.json({
      success:true,
      counters:{
        new_views:0,
        new_chat_requests:0,
        total_scans:snap.total_scans,
        total_chat_requests:snap.total_chat_requests
      }
    });
  } catch (err) {
    console.error('followme activity counters reset error:', err);
    return res.status(500).json({ success:false, error:'Errore reset contatori attività.' });
  }
});


app.get('/api/followme/:code/info-requests/status', async function(req, res) {
  try {
    await ensureFollowMeInfoRequestsRuntime20260528();

    const code = String(req.params.code || '').trim();
    const q = await pool.query(
      `SELECT id, code, public_id, info_requests_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    return res.json({
      success:true,
      project:q.rows[0],
      info_requests_enabled:q.rows[0].info_requests_enabled === true
    });
  } catch (err) {
    console.error('followme info requests status error:', err);
    return res.status(500).json({ success:false, error:'Errore stato richieste informazioni.' });
  }
});

app.get('/fm/info/:public_id', async function(req, res) {
  try {
    await ensureFollowMeInfoRequestsRuntime20260528();

    const publicId = String(req.params.public_id || '').trim();

    const q = await pool.query(
      `SELECT id, code, public_id, label, active_url, info_requests_enabled
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) return res.status(404).send('FollowMe QR non trovato.');

    const project = q.rows[0];
    const activeUrl = String(project.active_url || '').trim();
    const sourceLabel = followMeShortSourceLabel20260528(activeUrl);

    // FOLLOWME_INFO_CONTAINER_ACTIVE_VOICE_20260528
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const voiceRes = await pool.query(
      `SELECT id, source_url, source_label, file_url, mime_type, duration_seconds
       FROM followme_voice_messages
       WHERE project_id = $1
         AND is_active = TRUE
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [project.id]
    );

    const activeVoice = voiceRes.rows[0] || null;

    const voiceHtml = activeVoice
      ? '<button class="premium-btn ghost" id="voiceBtn" type="button">▶ Ascolta</button>'
      : '';

    if (!activeUrl) {
      return res.redirect(302, '/fm/app/' + encodeURIComponent(project.code || publicId));
    }

    const safeJson = JSON.stringify({
      code: project.code,
      public_id: project.public_id,
      active_url: activeUrl,
      source_label: sourceLabel,
      voice_message: activeVoice
    }).replace(/</g, '\\u003c');

    return res.send(`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>FollowMe - Informazioni</title>
<style>
  :root{
    --bg:#07070b;
    --glass:rgba(255,255,255,.78);
    --line:rgba(255,255,255,.22);
    --text:#111827;
    --muted:#64748b;
    --green:#16a34a;
    --shadow:0 24px 80px rgba(0,0,0,.28);
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:var(--bg);color:var(--text)}
  .topbar{
    position:fixed;z-index:20;top:0;left:0;right:0;
    padding:calc(10px + env(safe-area-inset-top)) 12px 10px;
    background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.76));
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    border-bottom:1px solid rgba(15,23,42,.08);
    box-shadow:0 10px 30px rgba(15,23,42,.10);
  }
  .bar-inner{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap}
  .premium-btn{
    appearance:none;border:1px solid rgba(15,23,42,.10);
    border-radius:999px;background:#fff;color:#111827;
    min-height:34px;padding:8px 13px;
    display:inline-flex;align-items:center;gap:7px;justify-content:center;
    font-weight:850;font-size:12.5px;letter-spacing:-.01em;
    box-shadow:0 8px 22px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.9);
    cursor:pointer;
  }
  .premium-btn.green{background:rgba(17,137,67,.08);color:#0f7a37;border-color:rgba(17,137,67,.14);box-shadow:none}
  .premium-btn.ghost{background:rgba(255,255,255,.82)}
  .content{
    position:fixed;inset:0;padding-top:76px;background:#fff;
  }
  iframe{width:100%;height:100%;border:0;background:#fff}
  .fallback{
    display:none;min-height:100%;place-items:center;text-align:center;padding:24px;
    background:radial-gradient(circle at top,#ffffff,#eef2ff);
  }
  .fallback-card{
    width:min(520px,100%);border-radius:28px;background:rgba(255,255,255,.82);
    border:1px solid rgba(15,23,42,.08);box-shadow:var(--shadow);padding:24px;
  }
  .fallback-card h1{font-size:22px;margin:0 0 8px}
  .fallback-card p{color:var(--muted);line-height:1.45;margin:0 0 18px}
  .bottom-open{
    position:fixed;z-index:15;left:0;right:0;bottom:0;
    padding:10px 12px calc(10px + env(safe-area-inset-bottom));
    background:linear-gradient(0deg,rgba(255,255,255,.94),rgba(255,255,255,.62));
    backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
    border-top:1px solid rgba(15,23,42,.08);
    text-align:center;
  }
  .chat-overlay{
    position:fixed;z-index:40;inset:0;display:none;
    background:rgba(2,6,23,.34);
    backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    align-items:flex-end;justify-content:center;
  }
  .chat-overlay.show{display:flex}
  .chat-sheet{
    width:min(560px,100%);max-height:76vh;background:#fff;
    border-radius:28px 28px 0 0;box-shadow:0 -24px 90px rgba(0,0,0,.32);
    overflow:hidden;border:1px solid rgba(255,255,255,.22);
  }
  .chat-head{padding:14px 16px;border-bottom:1px solid rgba(15,23,42,.08);display:flex;justify-content:space-between;gap:12px;align-items:center}
  .chat-title{font-weight:900;font-size:15px}
  .chat-sub{font-size:12px;color:var(--muted);margin-top:2px}
  .xbtn{border:0;background:#f1f5f9;border-radius:999px;width:32px;height:32px;font-size:18px}
  .messages{height:calc(76vh - 132px);min-height:280px;overflow:auto;background:#f8fafc;padding:14px;display:flex;flex-direction:column;gap:8px}
  .bubble{max-width:86%;padding:10px 12px;border-radius:16px;font-size:14px;line-height:1.35}
  .bubble.owner{align-self:flex-start;background:#fff;border:1px solid rgba(15,23,42,.08)}
  .bubble.visitor{align-self:flex-end;background:#dcfce7;color:#052e16}
  .composer{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(15,23,42,.08);background:#fff}
  .composer textarea{flex:1;border:1px solid rgba(15,23,42,.12);border-radius:18px;padding:10px 12px;resize:none;min-height:42px;font:inherit}
  .send{border:0;border-radius:18px;background:#16a34a;color:#fff;font-weight:900;padding:0 16px}
  .attachment-card{display:grid;gap:6px}
  .attachment-card img{max-width:240px;width:100%;border-radius:12px;display:block}
  .attachment-file{
    display:flex;
    align-items:center;
    gap:8px;
    padding:9px 10px;
    border-radius:12px;
    background:rgba(255,255,255,.72);
    color:#111827;
    text-decoration:none;
    font-weight:850;
    border:1px solid rgba(15,23,42,.08);
  }
  .attachment-file span{
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    max-width:220px;
  }
  .voice-card{display:grid;gap:7px;min-width:210px}
  .voice-row{
    display:flex;
    align-items:center;
    gap:8px;
    padding:8px;
    border-radius:14px;
    background:rgba(255,255,255,.72);
    border:1px solid rgba(15,23,42,.08);
  }
  .voice-row audio{width:190px;max-width:100%;height:34px}
  .map-preview-card{min-width:240px;max-width:280px}
  .map-preview-link{
    position:relative;
    display:block;
    width:100%;
    height:150px;
    overflow:hidden;
    border-radius:14px;
    background:#dfe5e7;
    box-shadow:0 1px 2px rgba(0,0,0,.10);
  }
  .map-preview-frame{
    width:100%;
    height:100%;
    border:0;
    display:block;
    pointer-events:none;
  }
  .map-preview-overlay{
    position:absolute;
    right:8px;
    bottom:8px;
    padding:6px 9px;
    border-radius:999px;
    background:rgba(17,27,33,.82);
    color:#fff;
    font-size:11px;
    font-weight:900;
    box-shadow:0 6px 18px rgba(0,0,0,.24);
  }
  .time{
    display:block;
    margin-top:3px;
    font-size:10px;
    color:#64748b;
    text-align:right;
  }
  @media(min-width:760px){
    .chat-overlay{align-items:center}
    .chat-sheet{border-radius:28px;max-height:720px}
    .messages{height:420px}
  }

  /* FOLLOWME_INFO_INLINE_TRUST_SOFT_REAL_ROUTE_20260529 */
  .premium-actions{
    width:calc(100% - 20px);
    max-width:410px;
    margin:0 auto 8px;
    padding:0;
    display:grid;
    grid-template-columns:1fr;
    gap:7px;
    box-sizing:border-box;
  }
  .premium-actions:has(#voiceBtn):has(#infoBtn){
    grid-template-columns:1fr 1fr;
  }
  .premium-btn{
    min-height:38px;
    border-radius:13px;
    padding:8px 10px;
    font-size:12.7px;
    font-weight:610;
    letter-spacing:-.08px;
    line-height:1.1;
    box-shadow:0 5px 14px rgba(16,24,40,.045);
    white-space:nowrap;
  }
  #voiceBtn{
    background:#fff;
    color:#101828;
    border:1px solid rgba(16,24,40,.08);
    box-shadow:0 5px 14px rgba(16,24,40,.045);
  }
  #infoBtn,
  #fallbackInfo,
  .premium-btn.green{
    background:rgba(17,137,67,.08);
    color:#0f7a37;
    border:1px solid rgba(17,137,67,.14);
    box-shadow:none;
  }
  .premium-btn.ghost{
    background:rgba(255,255,255,.86);
    color:#101828;
  }
  a.premium-btn[target="_blank"]{
    margin:10px auto 0;
    min-height:34px;
    max-width:410px;
    border-radius:12px;
    background:#fff;
    color:#667085;
    border:1px solid rgba(16,24,40,.08);
    box-shadow:none;
    font-size:12px;
    font-weight:520;
  }
  a.premium-btn[target="_blank"]::before{
    content:"↗";
    font-size:12px;
    opacity:.72;
  }

</style>
</head>
<body>
<div class="topbar">
  <div class="bar-inner">
    ${voiceHtml}
    <button class="premium-btn green" id="infoBtn" type="button">Chiedi info</button>
  </div>
</div>

<div class="content" id="contentBox">
  <iframe id="contentFrame" src="${activeUrl.replace(/"/g, '&quot;')}" loading="eager"></iframe>
  <div class="fallback" id="fallback">
    <div class="fallback-card">
      <h1>Contenuto disponibile</h1>
      <p>Se la pagina non viene visualizzata qui, puoi aprirla in una nuova scheda. Puoi comunque chiedere informazioni al proprietario.</p>
      <button class="premium-btn green" id="fallbackInfo" type="button">Chiedi info</button>
    </div>
  </div>
</div>

<div class="bottom-open">
  <a class="premium-btn ghost" href="${activeUrl.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">Apri in nuova pagina</a>
</div>

<div class="chat-overlay" id="chatOverlay">
  <div class="chat-sheet">
    <div class="chat-head">
      <div>
        <div class="chat-title">Richiesta informazioni</div>
        <div class="chat-sub">Su: ${sourceLabel}</div>
      </div>
      <button class="xbtn" id="closeChat" type="button">×</button>
    </div>
    <div class="messages" id="messages"></div>
    <div class="composer">
      <textarea id="textInput" rows="1" placeholder="Scrivi un messaggio..."></textarea>
      <button class="send" id="sendBtn" type="button">Invia</button>
    </div>
  </div>
</div>

<script>
window.FOLLOWME_INFO_DATA = ${safeJson};

(function(){
  const data = window.FOLLOWME_INFO_DATA || {};
  let sessionId = "";
  let lastMessageId = 0;
  let pollTimer = null;

  const overlay = document.getElementById("chatOverlay");
  const messages = document.getElementById("messages");
  const input = document.getElementById("textInput");

  const renderedMessageIds = new Set();

  function escHtml(value){
    return String(value || "").replace(/[&<>"']/g, function(c){
      if(c === "&") return "&amp;";
      if(c === "<") return "&lt;";
      if(c === ">") return "&gt;";
      if(c === '"') return "&quot;";
      if(c === "'") return "&#39;";
      return c;
    });
  }

  function timeOf(value){
    try{
      return new Date(value).toLocaleTimeString("it-IT", { hour:"2-digit", minute:"2-digit" });
    }catch(e){
      return "";
    }
  }

  function parseAttachmentV2(raw){
    try{
      const obj = JSON.parse(String(raw || ""));
      if(obj && obj.__followme_attachment_v2 === true) return obj;
    }catch(e){}
    return null;
  }

  function mapCoords(att){
    const lat = Number(att.latitude || att.lat || 0);
    const lng = Number(att.longitude || att.lng || att.lon || 0);
    if(Number.isFinite(lat) && Number.isFinite(lng) && lat && lng){
      return { lat, lng };
    }

    const raw = String(att.url || att.maps_url || "");
    const m = raw.match(/q=([^&]+)/i);
    if(m && m[1]){
      const q = decodeURIComponent(m[1]).trim();
      const mm = q.match(/(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)/);
      if(mm) return { lat:Number(mm[1]), lng:Number(mm[2]) };
    }

    return null;
  }

  function mapOpenUrl(att){
    const coords = mapCoords(att);
    if(!coords) return String(att.url || att.maps_url || "https://maps.google.com");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(coords.lat + "," + coords.lng);
  }

  function mapEmbedUrl(att){
    const coords = mapCoords(att);
    if(!coords) return "";
    return "https://maps.google.com/maps?q=" + encodeURIComponent(coords.lat + "," + coords.lng) + "&z=16&output=embed";
  }

  function renderAttachmentV2(att, createdAt){
    const kind = String(att.kind || "");
    const mime = String(att.mime || "");
    const url = escHtml(att.url || "#");
    const label = escHtml(att.label || att.filename || "Allegato");
    const when = escHtml(timeOf(createdAt));

    if(kind === "location"){
      const open = escHtml(mapOpenUrl(att));
      const embed = escHtml(mapEmbedUrl(att));
      const acc = att.accuracy_m ? " · precisione " + Math.round(Number(att.accuracy_m)) + " m" : "";

      return '' +
        '<div class="attachment-card map-preview-card">' +
          (embed ? '<a class="map-preview-link" href="' + open + '" target="_blank" rel="noopener">' +
            '<iframe class="map-preview-frame" src="' + embed + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
            '<span class="map-preview-overlay">Apri in Maps</span>' +
          '</a>' : '') +
          '<a class="attachment-file" href="' + open + '" target="_blank" rel="noopener">📍 <span>Posizione condivisa' + escHtml(acc) + '</span></a>' +
          '<span class="time">' + when + '</span>' +
        '</div>';
    }

    if(kind === "voice" || mime.startsWith("audio/")){
      return '' +
        '<div class="voice-card">' +
          '<div class="voice-row">🎙️ <audio controls preload="metadata" src="' + url + '"></audio></div>' +
          '<a class="attachment-file" href="' + url + '" target="_blank" rel="noopener">Apri audio</a>' +
          '<span class="time">' + when + '</span>' +
        '</div>';
    }

    if(mime.startsWith("image/")){
      return '' +
        '<div class="attachment-card">' +
          '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" alt="' + label + '"></a>' +
          '<a class="attachment-file" href="' + url + '" target="_blank" rel="noopener">📎 <span>' + label + '</span></a>' +
          '<span class="time">' + when + '</span>' +
        '</div>';
    }

    return '' +
      '<div class="attachment-card">' +
        '<a class="attachment-file" href="' + url + '" target="_blank" rel="noopener">📎 <span>' + label + '</span></a>' +
        '<span class="time">' + when + '</span>' +
      '</div>';
  }

  function addBubble(m){
    if(!m) return;

    const id = String(m.id || "").trim();
    if(id){
      if(renderedMessageIds.has(id)) return;
      renderedMessageIds.add(id);
      if(messages.querySelector('[data-message-id="' + CSS.escape(id) + '"]')) return;
    }

    const div = document.createElement("div");
    div.className = "bubble " + (m.sender === "owner" ? "owner" : "visitor");
    if(id) div.setAttribute("data-message-id", id);

    const att = parseAttachmentV2(m.message);
    if(att){
      div.innerHTML = renderAttachmentV2(att, m.created_at);
    }else{
      div.textContent = m.message || "";
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    lastMessageId = Math.max(lastMessageId, Number(m.id || 0));
  }

  async function postJson(url, body){
    const res = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body || {})
    });
    const json = await res.json().catch(()=>null);
    if(!res.ok || !json || json.success === false){
      throw new Error((json && (json.error || json.label)) || "Errore richiesta.");
    }
    return json;
  }

  async function api(url){
    const res = await fetch(url, { cache:"no-store" });
    const json = await res.json().catch(()=>null);
    if(!res.ok || !json || json.success === false){
      throw new Error((json && json.error) || "Errore rete.");
    }
    return json;
  }

  function addSystemBubble(text){
    const div = document.createElement("div");
    div.className = "bubble system";
    div.textContent = text || "";
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  let closeRedirectTimer = null;

  function closeChatAndReturn(){
    try{ if(pollTimer) clearInterval(pollTimer); }catch(e){}
    try{ input.disabled = true; }catch(e){}
    try{ sendBtn.disabled = true; }catch(e){}

    if(closeRedirectTimer) return;

    closeRedirectTimer = setTimeout(function(){
      const target = data.active_url || "/";
      try{
        overlay.classList.remove("show");
        window.location.href = target;
      }catch(e){
        window.location.href = "/";
      }
    }, 8000);
  }

  async function openInfoChat(){
    overlay.classList.add("show");

    if(!sessionId){
      addSystemBubble("Abbiamo informato che è in attesa, prego attendere...");

      const created = await postJson("/api/followme/" + encodeURIComponent(data.code) + "/info-request/session", {
        source_url:data.active_url,
        source_label:data.source_label
      });
      sessionId = String(created.session_id || "");
      messages.innerHTML = "";
      renderedMessageIds.clear();
      lastMessageId = 0;

      addSystemBubble("Abbiamo informato che è in attesa, prego attendere...");

      if(created.initial_message) addBubble(created.initial_message);
    }

    await loadMessages();
    if(pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(loadMessages, 650);
    setTimeout(()=>input.focus(), 250);
  }

  let closedFlowStarted = false;

  async function forceFinalClosedMessages(){
    // FOLLOWME_CHAT_V2_FINAL_CLOSED_FETCH_20260529
    try{
      const d = await api("/api/followme/chat-v2/session/" + encodeURIComponent(sessionId) + "/messages?after=0&v=" + Date.now());
      let hasThanks = false;

      (d.messages || []).forEach(function(m){
        if(String(m.message || "").indexOf("Grazie per averci contattato") >= 0){
          hasThanks = true;
        }
        addBubble(m);
      });

      if(!hasThanks && String(messages.textContent || "").indexOf("Grazie per averci contattato") < 0){
        addSystemBubble("Grazie per averci contattato.");
      }
    }catch(e){
      if(String(messages.textContent || "").indexOf("Grazie per averci contattato") < 0){
        addSystemBubble("Grazie per averci contattato.");
      }
    }
  }

  async function loadMessages(){
    if(!sessionId) return;
    const d = await api("/api/followme/chat-v2/session/" + encodeURIComponent(sessionId) + "/messages?after=" + lastMessageId + "&v=" + Date.now());
    (d.messages || []).forEach(addBubble);

    if(d.session_status === "closed" && !closedFlowStarted){
      closedFlowStarted = true;

      try{ input.disabled = true; }catch(e){}
      try{ sendBtn.disabled = true; }catch(e){}

      await forceFinalClosedMessages();

      closeChatAndReturn();
    }
  }

  async function send(){
    if(input.disabled) return;
    const text = String(input.value || "").trim();
    if(!text || !sessionId) return;
    input.value = "";
    const d = await postJson("/api/followme/chat-v2/session/" + encodeURIComponent(sessionId) + "/message", {
      sender:"visitor",
      message:text
    });
    if(d.message) addBubble(d.message);
  }

  document.getElementById("infoBtn").onclick = openInfoChat;
  document.getElementById("fallbackInfo").onclick = openInfoChat;
  document.getElementById("sendBtn").onclick = send;
  document.getElementById("closeChat").onclick = function(){
    overlay.classList.remove("show");
    if(pollTimer) clearInterval(pollTimer);
  };
  const voiceBtn = document.getElementById("voiceBtn");
  if(voiceBtn){
    voiceBtn.onclick = async function(){
      try{
        const v = data.voice_message;
        if(!v || !v.file_url) return;

        voiceBtn.disabled = true;
        voiceBtn.textContent = "Riproduco...";

        const audio = new Audio(v.file_url);
        audio.onended = function(){
          voiceBtn.disabled = false;
          voiceBtn.textContent = "▶ Ascolta il messaggio";
        };
        audio.onerror = function(){
          voiceBtn.disabled = false;
          voiceBtn.textContent = "▶ Ascolta il messaggio";
          alert("Non riesco a riprodurre il messaggio.");
        };

        await fetch("/api/followme/" + encodeURIComponent(data.code) + "/voice-messages/" + encodeURIComponent(v.id) + "/listened", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({})
        }).catch(()=>null);

        await audio.play();
      }catch(e){
        voiceBtn.disabled = false;
        voiceBtn.textContent = "▶ Ascolta il messaggio";
        alert("Non riesco a riprodurre il messaggio.");
      }
    };
  }

  input.addEventListener("keydown", function(e){
    if(e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      send();
    }
  });

  setTimeout(function(){
    document.getElementById("fallback").style.display = "grid";
  }, 2200);

  const frame = document.getElementById("contentFrame");
  frame.onload = function(){
    document.getElementById("fallback").style.display = "none";
  };
})();
</script>
<script id="FOLLOWME_QR_VERIFIED_SCANNER_REAL_INFO_ROUTE_20260529" src="/followme-qr-verified-scanner.js?v=official-inline-trust-20260529"></script>
</body>
</html>`);
  } catch (err) {
    console.error('followme info container error:', err);
    return res.status(500).send('Errore apertura contenuto FollowMe.');
  }
});

app.post('/api/followme/:code/info-request/session', express.json({ limit:'64kb' }), async function(req, res) {
  try {
    await ensureFollowMeInfoRequestsRuntime20260528();

    const code = String(req.params.code || '').trim();
    const q = await pool.query(
      `SELECT id, code, public_id, active_url, info_requests_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });

    const project = q.rows[0];

    if (project.info_requests_enabled !== true) {
      return res.status(403).json({ success:false, error:'Richieste informazioni non attive.' });
    }

    const sourceUrl = String(req.body?.source_url || project.active_url || '').trim();
    const sourceLabel = followMeShortSourceLabel20260528(req.body?.source_label || sourceUrl);

    const inserted = await pool.query(
      `INSERT INTO followme_chat_sessions
       (project_id, chat_public_token, visitor_label, display_name, status, created_at, last_seen_at, uploads_enabled, is_blocked, source_type, source_url, source_label, updated_at)
       VALUES ($1,$2,$3,NULL,'open',NOW(),NOW(),FALSE,FALSE,'info_request',$4,$5,NOW())
       RETURNING id, project_id, visitor_label, status, created_at, source_type, source_url, source_label`,
      [
        project.id,
        'INFO-' + Math.random().toString(36).slice(2, 12).toUpperCase(),
        'Info ' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        sourceUrl,
        sourceLabel
      ]
    );

    const session = inserted.rows[0];

    const initial = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,'visitor',$3,NOW())
       RETURNING id, sender, message, created_at`,
      [
        session.id,
        project.id,
        'Richiesta informazioni per: ' + sourceLabel
      ]
    );

    const push = await sendFollowMeInfoRequestPush20260528(project, session.id, sourceLabel);

    return res.json({
      success:true,
      session_id:session.id,
      session,
      initial_message:initial.rows[0],
      push
    });
  } catch (err) {
    console.error('followme info request session error:', err);
    return res.status(500).json({ success:false, error:'Errore apertura richiesta informazioni.' });
  }
});



// FOLLOWME_VOICE_MESSAGES_BACKEND_20260528
const FOLLOWME_VOICE_STORAGE_DIR_20260528 = require('path').join(
  process.env.FOLLOWME_STORAGE_DIR || '/var/data',
  'followme-voice-messages'
);

async function ensureFollowMeVoiceMessagesRuntime20260528() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS followme_voice_messages (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES followme_projects(id) ON DELETE CASCADE,
      source_url TEXT,
      source_label TEXT,
      file_url TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      duration_seconds NUMERIC,
      is_active BOOLEAN DEFAULT FALSE,
      listened_count INTEGER DEFAULT 0,
      last_listened_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS followme_voice_messages_project_idx ON followme_voice_messages(project_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS followme_voice_messages_active_idx ON followme_voice_messages(project_id, is_active)`);
}

function followMeVoiceSafeCode20260528(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80);
}

function followMeVoiceMimeExt20260528(mime) {
  mime = String(mime || '').toLowerCase();
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}


// FOLLOWME_VOICE_IPHONE_DATAURL_DECODER_FINAL_20260528
function followMeVoiceDecodeDataUrl20260528(audioDataUrl) {
  const raw = String(audioDataUrl || '').trim();

  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) {
    throw new Error('Formato audio non valido. Il file non contiene un audio leggibile.');
  }

  let mime = String(m[1] || '').toLowerCase().trim();
  const b64 = String(m[2] || '').trim();

  if (!b64 || b64.length < 64) {
    throw new Error('Audio vuoto o incompleto.');
  }

  /*
    iPhone/Safari può produrre audio dentro contenitore MP4
    dichiarandolo anche come video/mp4. Lo accettiamo e lo trattiamo
    come audio/mp4.
  */
  if (mime === 'video/mp4' || mime === 'application/mp4') {
    mime = 'audio/mp4';
  }

  if (mime === 'audio/x-m4a' || mime === 'audio/m4a') {
    mime = 'audio/mp4';
  }

  const allowed = new Set([
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/aac',
    'audio/x-aac',
    'audio/x-caf',
    'audio/caf'
  ]);

  if (!allowed.has(mime) && !mime.startsWith('audio/')) {
    throw new Error('Formato audio non supportato. Usa M4A, MP4, MP3, WAV, WEBM o OGG.');
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch (e) {
    throw new Error('Audio non decodificabile.');
  }

  if (!buffer || buffer.length < 512) {
    throw new Error('Audio troppo breve o danneggiato.');
  }

  const maxBytes = 8 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    throw new Error('File audio troppo grande. Limite massimo 8 MB.');
  }

  let ext = 'webm';

  if (mime.includes('wav')) ext = 'wav';
  else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
  else if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) ext = 'm4a';
  else if (mime.includes('caf')) ext = 'caf';
  else if (mime.includes('ogg')) ext = 'ogg';
  else if (mime.includes('webm')) ext = 'webm';

  return {
    buffer,
    mime_type: mime,
    mime,
    ext,
    size_bytes: buffer.length
  };
}


function followMeVoicePublicUrl20260528(code, filename) {
  return '/followme-voice/' + encodeURIComponent(code) + '/' + encodeURIComponent(filename);
}

async function sendFollowMeVoiceListenedPush20260528(project, voiceRow) {
  try {
    if (!project || !project.id || !project.code || !voiceRow) return { sent:0, failed:0 };

    if (typeof webpush === 'undefined' || !webpush || typeof webpush.sendNotification !== 'function') {
      return { sent:0, failed:0, skipped:true };
    }

    const label = String(voiceRow.source_label || 'contenuto').slice(0, 18);
    const adminUrl = `/fm/app/${encodeURIComponent(project.code)}`;

    const payload = JSON.stringify({
      title: 'FollowMe',
      body: label
        ? "L'utente ha ascoltato il tuo messaggio per: " + label
        : "L'utente ha ascoltato il tuo messaggio.",
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `followme-voice-listened-${project.id}-${voiceRow.id}-${Math.floor(Date.now()/60000)}`,
      renotify: false,
      requireInteraction: false,
      vibrate: [90, 40, 90],
      url: adminUrl,
      targetUrl: adminUrl,
      relativeTargetUrl: adminUrl,
      data: {
        type: 'followme_voice_listened',
        code: project.code,
        public_id: project.public_id || project.code,
        voice_id: String(voiceRow.id),
        source_label: label,
        url: adminUrl,
        targetUrl: adminUrl,
        relativeTargetUrl: adminUrl
      }
    });

    const subs = await pool.query(
      `SELECT endpoint, p256dh, auth
       FROM followme_push_subscriptions
       WHERE project_id = $1
       LIMIT 200`,
      [project.id]
    );

    let sent = 0;
    let failed = 0;

    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          try { await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]); } catch(e) {}
        } else {
          console.error('followme voice listened push error:', err.statusCode || '', err.body || err.message || err);
        }
      }
    }

    return { sent, failed };
  } catch (err) {
    console.error('sendFollowMeVoiceListenedPush error:', err.message || err);
    return { sent:0, failed:1, error:String(err.message || err) };
  }
}


// FOLLOWME_VOICE_SERVE_FROM_DB_FILEPATH_FINAL_20260529
app.get('/followme-voice/:code/:filename', async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const path = require('path');
    const fs = require('fs');

    const code = String(req.params.code || '').trim();
    const filename = String(req.params.filename || '').trim();

    if (!code || !filename) {
      return res.status(404).send('Audio non trovato.');
    }

    const decodedFileUrl = '/followme-voice/' + code + '/' + filename;
    const encodedFileUrl = '/followme-voice/' + encodeURIComponent(code) + '/' + encodeURIComponent(filename);

    const q = await pool.query(
      `SELECT
         vm.id,
         vm.file_url,
         vm.file_path,
         vm.mime_type,
         p.code,
         p.public_id
       FROM followme_voice_messages vm
       JOIN followme_projects p ON p.id = vm.project_id
       WHERE (p.code = $1 OR p.public_id = $1)
         AND (
           vm.file_url = $2
           OR vm.file_url = $3
           OR vm.file_url LIKE $4
           OR vm.file_path LIKE $4
         )
       ORDER BY vm.updated_at DESC NULLS LAST, vm.created_at DESC
       LIMIT 1`,
      [
        code,
        decodedFileUrl,
        encodedFileUrl,
        '%' + filename
      ]
    );

    let filePath = '';

    if (q.rows.length && q.rows[0].file_path) {
      filePath = String(q.rows[0].file_path);
    } else {
      const safeCode = followMeVoiceSafeCode20260528(code);
      filePath = path.join(FOLLOWME_VOICE_STORAGE_DIR_20260528, safeCode, filename);
    }

    const candidates = [];

    if (filePath) candidates.push(filePath);

    if (filePath.startsWith('/data/')) {
      candidates.push(filePath.replace(/^\/data\//, '/var/data/'));
    }

    if (filePath.startsWith('/var/data/')) {
      candidates.push(filePath.replace(/^\/var\/data\//, '/data/'));
    }

    const roots = [
      process.env.FOLLOWME_STORAGE_DIR || '/var/data',
      '/data',
      '/var/data'
    ].map(x => path.resolve(x));

    let found = '';

    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      const safe = roots.some(root => resolved === root || resolved.startsWith(root + path.sep));

      if (!safe) continue;

      if (fs.existsSync(resolved)) {
        found = resolved;
        break;
      }
    }

    if (!found) {
      console.error('[followme voice missing file]', {
        code,
        filename,
        db_file_path: q.rows[0] ? q.rows[0].file_path : null,
        db_file_url: q.rows[0] ? q.rows[0].file_url : null,
        candidates
      });

      return res.status(404).send('Audio non trovato.');
    }

    const lower = String(found || filename).toLowerCase();

    let contentType = q.rows[0]?.mime_type || 'application/octet-stream';

    if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) contentType = 'audio/mp4';
    else if (lower.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (lower.endsWith('.wav')) contentType = 'audio/wav';
    else if (lower.endsWith('.webm')) contentType = 'audio/webm';
    else if (lower.endsWith('.ogg')) contentType = 'audio/ogg';
    else if (lower.endsWith('.aac')) contentType = 'audio/aac';
    else if (lower.endsWith('.caf')) contentType = 'audio/x-caf';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=300');

    return res.sendFile(found);

  } catch (err) {
    console.error('followme voice serve error:', err);
    return res.status(500).send('Errore lettura audio.');
  }
});






// FOLLOWME_VOICE_STORAGE_DIAGNOSTIC_20260529
app.get('/api/followme/:code/voice-messages/storage-diagnostic', async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const fs = require('fs');
    const path = require('path');

    const codeParam = String(req.params.code || '').trim();

    const projectRes = await pool.query(
      `SELECT id, code, public_id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [codeParam]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = projectRes.rows[0];
    const safeCode = followMeVoiceSafeCode20260528(project.code || project.public_id || codeParam);

    const storageRoot = process.env.FOLLOWME_STORAGE_DIR || '/var/data';
    const voiceStorageDir = FOLLOWME_VOICE_STORAGE_DIR_20260528;
    const projectVoiceDir = path.join(voiceStorageDir, safeCode);

    let diskFiles = [];
    try {
      if (fs.existsSync(projectVoiceDir)) {
        diskFiles = fs.readdirSync(projectVoiceDir).map(name => {
          const full = path.join(projectVoiceDir, name);
          let st = null;
          try { st = fs.statSync(full); } catch(e) {}

          return {
            name,
            path: full,
            size_bytes: st ? st.size : null,
            modified_at: st ? st.mtime.toISOString() : null
          };
        });
      }
    } catch(e) {
      diskFiles = [{ error:String(e.message || e) }];
    }

    const dbRes = await pool.query(
      `SELECT id, source_url, source_label, file_url, file_path, mime_type,
              duration_seconds, is_active, listened_count, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [project.id]
    );

    const dbMessages = dbRes.rows.map(row => {
      let exists = false;
      let checked_paths = [];

      try {
        if (row.file_path) {
          checked_paths.push(String(row.file_path));
        }

        if (row.file_url) {
          const m = String(row.file_url).match(/\/followme-voice\/([^\/?#]+)\/([^\/?#]+)/);
          if (m) {
            const c = decodeURIComponent(m[1]);
            const f = decodeURIComponent(m[2]);
            checked_paths.push(path.join(voiceStorageDir, c, f));
            checked_paths.push(path.join('/data', 'followme-voice-messages', c, f));
            checked_paths.push(path.join('/var/data', 'followme-voice-messages', c, f));
          }
        }

        exists = checked_paths.some(p => {
          try { return p && fs.existsSync(p); } catch(e) { return false; }
        });
      } catch(e) {}

      return {
        ...row,
        physical_exists: exists,
        checked_paths
      };
    });

    return res.json({
      success:true,
      project:{
        id: project.id,
        code: project.code,
        public_id: project.public_id,
        active_url: project.active_url
      },
      env:{
        FOLLOWME_STORAGE_DIR: process.env.FOLLOWME_STORAGE_DIR || null,
        NODE_ENV: process.env.NODE_ENV || null
      },
      storage:{
        storage_root: storageRoot,
        voice_storage_dir: voiceStorageDir,
        project_voice_dir: projectVoiceDir,
        voice_storage_dir_exists: fs.existsSync(voiceStorageDir),
        project_voice_dir_exists: fs.existsSync(projectVoiceDir)
      },
      disk_files: diskFiles,
      db_messages: dbMessages
    });

  } catch (err) {
    console.error('followme voice storage diagnostic error:', err);
    return res.status(500).json({
      success:false,
      error:String(err && err.message ? err.message : err)
    });
  }
});



// FOLLOWME_VOICE_PERSISTENT_DISK_VERIFY_FINAL_20260529
function followMeVoiceFileExistsPersistentFinal20260529(row) {
  try {
    if (!row) return false;

    const fs = require('fs');
    const path = require('path');

    const candidates = [];

    if (row.file_path) {
      candidates.push(String(row.file_path));
    }

    if (row.file_url) {
      const m = String(row.file_url).match(/\/followme-voice\/([^\/?#]+)\/([^\/?#]+)/);
      if (m) {
        const code = decodeURIComponent(m[1]);
        const filename = decodeURIComponent(m[2]);

        candidates.push(path.join(FOLLOWME_VOICE_STORAGE_DIR_20260528, code, filename));
        candidates.push(path.join('/data', 'followme-voice-messages', code, filename));
        candidates.push(path.join('/var/data', 'followme-voice-messages', code, filename));
      }
    }

    return candidates.some(candidate => {
      try {
        return candidate && fs.existsSync(candidate) && fs.statSync(candidate).size > 0;
      } catch(e) {
        return false;
      }
    });
  } catch (err) {
    console.error('followMeVoiceFileExistsPersistentFinal20260529 error:', err.message || err);
    return false;
  }
}

function followMeVoiceAssertWrittenPersistentFinal20260529(filePath, expectedMinBytes) {
  const fs = require('fs');
  const path = require('path');

  const resolved = path.resolve(String(filePath || ''));
  const allowedRoots = [
    path.resolve(process.env.FOLLOWME_STORAGE_DIR || '/var/data'),
    path.resolve('/data'),
    path.resolve('/var/data')
  ];

  const safe = allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep));

  if (!safe) {
    throw new Error('Percorso audio non sicuro: ' + resolved);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('Audio non scritto sul disco persistente.');
  }

  const st = fs.statSync(resolved);
  const min = Number(expectedMinBytes || 1);

  if (!st.size || st.size < min) {
    throw new Error('Audio scritto ma vuoto o incompleto.');
  }

  return {
    path: resolved,
    size_bytes: st.size
  };
}

app.get('/api/followme/:code/voice-messages/status', async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const code = String(req.params.code || '').trim();
    const q = await pool.query(
      `SELECT id, code, public_id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });

    const project = q.rows[0];

    const list = await pool.query(
      `SELECT id, source_url, source_label, file_url, file_path, mime_type, duration_seconds, is_active,
              listened_count, last_listened_at, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [project.id]
    );

    let rows = list.rows || [];
    let active = rows.find(r => r.is_active === true) || null;

    // FOLLOWME_VOICE_STATUS_LIST_ROWS_PHYSICAL_CHECK_20260529
    // La route status reale usa list.rows. Se il DB indica un audio attivo
    // ma il file fisico non esiste su /data, non lo restituisco come attivo.
    if (active && !followMeVoiceFileExistsPersistentFinal20260529(active)) {
      console.warn('followme voice status: audio attivo mancante su disco persistente, lo disattivo', {
        id: active.id,
        file_url: active.file_url,
        file_path: active.file_path
      });

      try {
        await pool.query(
          `UPDATE followme_voice_messages
           SET is_active = FALSE, updated_at = NOW()
           WHERE id = $1`,
          [active.id]
        );
      } catch(e) {
        console.error('followme voice status deactivate missing file error:', e.message || e);
      }

      rows = rows.map(r =>
        String(r.id) === String(active.id)
          ? Object.assign({}, r, { is_active:false })
          : r
      );

      active = null;
    }

    return res.json({
      success:true,
      project,
      has_active_voice:!!active,
      active_voice:active,
      messages:rows,
      max_messages:3
    });
  } catch (err) {
    console.error('followme voice status error:', err);
    return res.status(500).json({ success:false, error:'Errore stato messaggi vocali.' });
  }
});


// FOLLOWME_VOICE_ACCEPT_IPHONE_FORMATS_20260528
function normalizeFollowMeVoiceDataUrl20260528(audioDataUrl) {
  const raw = String(audioDataUrl || '').trim();

  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (!m) {
    return { ok:false, error:'Formato audio non valido o non supportato. Su iPhone riprova oppure carica un file M4A/MP3.' };
  }

  let mime = String(m[1] || '').toLowerCase().trim();
  const b64 = String(m[2] || '').trim();

  const allowed = new Set([
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'video/mp4'
  ]);

  /*
    Safari/iPhone a volte produce audio dentro contenitore MP4
    oppure usa MIME non perfettamente standard.
  */
  if (mime === 'video/mp4') mime = 'audio/mp4';

  if (!allowed.has(mime) && !mime.startsWith('audio/')) {
    return { ok:false, error:'Formato audio non supportato. Usa MP3, M4A, MP4, WAV, WEBM o OGG.' };
  }

  let ext = 'webm';

  if (mime.includes('wav')) ext = 'wav';
  else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
  else if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'm4a';
  else if (mime.includes('ogg')) ext = 'ogg';
  else if (mime.includes('webm')) ext = 'webm';

  return { ok:true, mime, ext, b64 };
}



// FOLLOWME_VOICE_SMART_FILENAME_FINAL_20260528
function followMeVoiceSlug20260528(value) {
  let v = String(value || '').trim().toLowerCase();

  v = v.replace(/^https?:\/\//i, '');
  v = v.replace(/^www\./i, '');
  v = v.split(/[\/?#]/)[0] || v;

  v = v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);

  return v || 'messaggio-vocale';
}

async function followMeVoiceNextFilename20260528(projectId, sourceLabel, sourceUrl, ext) {
  const base = followMeVoiceSlug20260528(sourceLabel || sourceUrl || 'messaggio-vocale');
  const safeExt = String(ext || 'm4a').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'm4a';

  const q = await pool.query(
    `SELECT file_url
     FROM followme_voice_messages
     WHERE project_id = $1
       AND (
         source_label = $2
         OR source_url = $3
         OR file_url ILIKE $4
       )
     ORDER BY created_at ASC`,
    [projectId, String(sourceLabel || ''), String(sourceUrl || ''), '%/' + base + '-%']
  );

  const n = (q.rows.length || 0) + 1;
  return base + '-' + n + '.' + safeExt;
}



// FOLLOWME_VOICE_MESSAGES_RAW_UPLOAD_LIKE_CHAT_ADMIN_20260528
app.post('/api/followme/:code/voice-messages/upload-raw', express.raw({
  type: '*/*',
  limit: '80mb'
}), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const codeParam = String(req.params.code || '').trim();

    const projectRes = await pool.query(
      `SELECT id, code, public_id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [codeParam]
    );

    if (!projectRes.rows.length) {
      return res.status(404).json({ success:false, error:'Progetto FollowMe non trovato.' });
    }

    const project = projectRes.rows[0];
    const projectCode = followMeVoiceSafeCode20260528(project.code || project.public_id || codeParam);

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    if (!buffer.length) {
      return res.status(400).json({ success:false, error:'Audio vuoto o mancante.' });
    }

    const maxBytes = 8 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(413).json({ success:false, error:'File audio troppo grande. Limite massimo 8 MB.' });
    }

    let mime = String(req.headers['content-type'] || req.query.mime || 'application/octet-stream')
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (mime === 'video/mp4' || mime === 'application/mp4') mime = 'audio/mp4';
    if (mime === 'audio/x-m4a' || mime === 'audio/m4a') mime = 'audio/mp4';

    const allowed = new Set([
      'audio/wav',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/aac',
      'audio/x-aac',
      'audio/caf',
      'audio/x-caf'
    ]);

    if (!allowed.has(mime) && !mime.startsWith('audio/')) {
      return res.status(400).json({
        success:false,
        error:'Formato audio non supportato. Usa M4A, MP4, MP3, WAV, WEBM o OGG.'
      });
    }

    // FOLLOWME_VOICE_RAW_EXTENSION_LIKE_CHAT_V2_20260528
    let ext = 'webm';

    /*
      Stessa logica pratica della Chat V2:
      - se il browser produce mp4/aac/m4a, salviamo .m4a
      - se produce webm, salviamo .webm
      - gli altri formati mantengono estensione coerente.
    */
    if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) ext = 'm4a';
    else if (mime.includes('webm')) ext = 'webm';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
    else if (mime.includes('ogg')) ext = 'ogg';
    else if (mime.includes('caf')) ext = 'caf';

    const duration = Number(req.query.duration_seconds || req.headers['x-followme-duration'] || 0);
    if (duration > 34) {
      return res.status(400).json({ success:false, error:'Audio troppo lungo. Durata massima 30 secondi.' });
    }

    const sourceUrl = String(req.query.source_url || req.headers['x-followme-source-url'] || project.active_url || '').trim();
    const sourceLabel = followMeShortSourceLabel20260528(req.query.source_label || req.headers['x-followme-source-label'] || sourceUrl);

    const replaceId = Number(req.query.replace_id || req.headers['x-followme-replace-id'] || 0);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM followme_voice_messages WHERE project_id = $1`,
      [project.id]
    );

    const count = Number(countRes.rows[0]?.n || 0);

    if (count >= 3 && !replaceId) {
      return res.status(409).json({
        success:false,
        error:'Hai già 3 messaggi salvati. Seleziona quale sostituire prima di pubblicarne uno nuovo.'
      });
    }

    const path = require('path');
    const fs = require('fs');

    const dir = path.join(FOLLOWME_VOICE_STORAGE_DIR_20260528, projectCode);
    fs.mkdirSync(dir, { recursive:true });

    const filename = await followMeVoiceNextFilename20260528(project.id, sourceLabel, sourceUrl, ext);
    const fullPath = path.join(dir, filename);
    const fileUrl = followMeVoicePublicUrl20260528(projectCode, filename);

    fs.writeFileSync(fullPath, buffer);

    // FOLLOWME_VOICE_PERSISTENT_DISK_VERIFY_FINAL_20260529
    if (typeof followMeVoiceAssertWrittenPersistentFinal20260529 === 'function') {
      followMeVoiceAssertWrittenPersistentFinal20260529(fullPath, Math.min(buffer.length, 1));
    }

    // FOLLOWME_VOICE_RAW_WRITE_VERIFY_FINAL_20260529
    if (!fs.existsSync(fullPath)) {
      return res.status(500).json({
        success:false,
        error:'Audio non salvato sul disco. Riprova tra poco.'
      });
    }

    await pool.query(
      `UPDATE followme_voice_messages
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE project_id = $1`,
      [project.id]
    );

    let row;

    if (replaceId) {
      const old = await pool.query(
        `SELECT id, file_path
         FROM followme_voice_messages
         WHERE id = $1 AND project_id = $2
         LIMIT 1`,
        [replaceId, project.id]
      );

      if (!old.rows.length) {
        try { fs.unlinkSync(fullPath); } catch(e) {}
        return res.status(404).json({ success:false, error:'Messaggio da sostituire non trovato.' });
      }

      try {
        if (old.rows[0].file_path) fs.unlinkSync(old.rows[0].file_path);
      } catch(e) {}

      const upd = await pool.query(
        `UPDATE followme_voice_messages
         SET source_url = $3,
             source_label = $4,
             file_url = $5,
             file_path = $6,
             mime_type = $7,
             duration_seconds = $8,
             is_active = TRUE,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2
         RETURNING id, source_url, source_label, file_url, mime_type, duration_seconds,
                   is_active, listened_count, last_listened_at, created_at, updated_at`,
        [replaceId, project.id, sourceUrl, sourceLabel, fileUrl, fullPath, mime, duration || null]
      );

      row = upd.rows[0];
    } else {
      const ins = await pool.query(
        `INSERT INTO followme_voice_messages
         (project_id, source_url, source_label, file_url, file_path, mime_type, duration_seconds, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),NOW())
         RETURNING id, source_url, source_label, file_url, mime_type, duration_seconds,
                   is_active, listened_count, last_listened_at, created_at, updated_at`,
        [project.id, sourceUrl, sourceLabel, fileUrl, fullPath, mime, duration || null]
      );

      row = ins.rows[0];
    }

    const list = await pool.query(
      `SELECT id, source_url, source_label, file_url, mime_type, duration_seconds,
              is_active, listened_count, last_listened_at, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [project.id]
    );

    return res.json({
      success:true,
      message:row,
      messages:list.rows,
      has_active_voice:true,
      active_voice:row
    });

  } catch (err) {
    console.error('followme voice raw upload error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore salvataggio audio.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


app.post('/api/followme/:code/voice-messages/upload', express.json({ limit:'10mb' }), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const fs = require('fs');
    const path = require('path');

    const codeParam = String(req.params.code || '').trim();
    const q = await pool.query(
      `SELECT id, code, public_id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [codeParam]
    );

    if (!q.rows.length) return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });

    const project = q.rows[0];
    const projectCode = followMeVoiceSafeCode20260528(project.code || project.public_id || codeParam);

    const duration = Number(req.body?.duration_seconds || 0);
    if (!duration || duration > 32) {
      return res.status(400).json({ success:false, error:'Il messaggio vocale deve durare massimo 30 secondi.' });
    }

    const replaceId = Number(req.body?.replace_id || 0);

    const currentCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM followme_voice_messages WHERE project_id = $1`,
      [project.id]
    );

    if (!replaceId && Number(currentCount.rows[0]?.n || 0) >= 3) {
      return res.status(409).json({
        success:false,
        max_reached:true,
        error:'Hai già 3 messaggi salvati. Scegli quale sostituire.'
      });
    }

    const decoded = followMeVoiceDecodeDataUrl20260528(req.body?.audio_data_url);
    const ext = followMeVoiceMimeExt20260528(decoded.mime);
    const sourceUrl = String(req.body?.source_url || project.active_url || '').trim();
    const sourceLabel = followMeShortSourceLabel20260528(req.body?.source_label || sourceUrl);

    const dir = path.join(FOLLOWME_VOICE_STORAGE_DIR_20260528, projectCode);
    fs.mkdirSync(dir, { recursive:true });

    const filename = await followMeVoiceNextFilename20260528(project.id, sourceLabel, sourceUrl, decoded.ext);
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, decoded.buffer);

    const fileUrl = followMeVoicePublicUrl20260528(projectCode, filename);

    await pool.query(
      `UPDATE followme_voice_messages
       SET is_active = FALSE, updated_at = NOW()
       WHERE project_id = $1`,
      [project.id]
    );

    let row;

    if (replaceId) {
      const old = await pool.query(
        `SELECT id, file_path
         FROM followme_voice_messages
         WHERE id = $1 AND project_id = $2
         LIMIT 1`,
        [replaceId, project.id]
      );

      if (!old.rows.length) {
        try { fs.unlinkSync(filePath); } catch(e) {}
        return res.status(404).json({ success:false, error:'Messaggio da sostituire non trovato.' });
      }

      try { if (old.rows[0].file_path) fs.unlinkSync(old.rows[0].file_path); } catch(e) {}

      const upd = await pool.query(
        `UPDATE followme_voice_messages
         SET source_url = $3,
             source_label = $4,
             file_url = $5,
             file_path = $6,
             mime_type = $7,
             duration_seconds = $8,
             is_active = TRUE,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2
         RETURNING id, source_url, source_label, file_url, mime_type, duration_seconds, is_active, listened_count, last_listened_at, created_at, updated_at`,
        [replaceId, project.id, sourceUrl, sourceLabel, fileUrl, filePath, decoded.mime, duration]
      );
      row = upd.rows[0];
    } else {
      const ins = await pool.query(
        `INSERT INTO followme_voice_messages
         (project_id, source_url, source_label, file_url, file_path, mime_type, duration_seconds, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),NOW())
         RETURNING id, source_url, source_label, file_url, mime_type, duration_seconds, is_active, listened_count, last_listened_at, created_at, updated_at`,
        [project.id, sourceUrl, sourceLabel, fileUrl, filePath, decoded.mime, duration]
      );
      row = ins.rows[0];
    }

    const list = await pool.query(
      `SELECT id, source_url, source_label, file_url, mime_type, duration_seconds, is_active,
              listened_count, last_listened_at, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [project.id]
    );

    return res.json({
      success:true,
      message:row,
      messages:list.rows,
      has_active_voice:true,
      active_voice:row
    });
  } catch (err) {
    console.error('followme voice upload error:', err);
    return res.status(500).json({ success:false, error:err.message || 'Errore salvataggio messaggio vocale.' });
  }
});

app.post('/api/followme/:code/voice-messages/:id/select', express.json({ limit:'64kb' }), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const code = String(req.params.code || '').trim();
    const id = Number(req.params.id || 0);

    const q = await pool.query(
      `SELECT id, code, public_id, active_url
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length || !id) return res.status(404).json({ success:false, error:'Dati non trovati.' });

    const project = q.rows[0];
    const sourceUrl = String(project.active_url || '').trim();
    const sourceLabel = followMeShortSourceLabel20260528(sourceUrl);

    await pool.query(`UPDATE followme_voice_messages SET is_active = FALSE, updated_at = NOW() WHERE project_id = $1`, [project.id]);

    const upd = await pool.query(
      `UPDATE followme_voice_messages
       SET is_active = TRUE,
           source_url = $3,
           source_label = $4,
           updated_at = NOW()
       WHERE id = $1 AND project_id = $2
       RETURNING id, source_url, source_label, file_url, mime_type, duration_seconds, is_active, listened_count, last_listened_at, created_at, updated_at`,
      [id, project.id, sourceUrl, sourceLabel]
    );

    if (!upd.rows.length) return res.status(404).json({ success:false, error:'Messaggio vocale non trovato.' });

    return res.json({ success:true, active_voice:upd.rows[0], message:upd.rows[0] });
  } catch (err) {
    console.error('followme voice select error:', err);
    return res.status(500).json({ success:false, error:'Errore selezione messaggio vocale.' });
  }
});


// FOLLOWME_VOICE_MESSAGES_DISABLE_ACTIVE_FINAL_20260528
app.post('/api/followme/:code/voice-messages/disable', express.json({ limit:'32kb' }), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const code = String(req.params.code || '').trim();

    const q = await pool.query(
      `SELECT id, code, public_id
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = q.rows[0];

    await pool.query(
      `UPDATE followme_voice_messages
       SET is_active = FALSE,
           updated_at = NOW()
       WHERE project_id = $1`,
      [project.id]
    );

    const list = await pool.query(
      `SELECT id, source_url, source_label, file_url, mime_type, duration_seconds, is_active,
              listened_count, last_listened_at, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 3`,
      [project.id]
    );

    return res.json({
      success:true,
      has_active_voice:false,
      active_voice:null,
      messages:list.rows,
      message:'Messaggio vocale spento. I messaggi salvati restano disponibili.'
    });
  } catch (err) {
    console.error('followme voice disable error:', err);
    return res.status(500).json({ success:false, error:'Errore spegnimento messaggio vocale.' });
  }
});


app.post('/api/followme/:code/voice-messages/:id/delete', express.json({ limit:'64kb' }), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const fs = require('fs');
    const code = String(req.params.code || '').trim();
    const id = Number(req.params.id || 0);

    const q = await pool.query(
      `SELECT id FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!q.rows.length || !id) return res.status(404).json({ success:false, error:'Dati non trovati.' });

    const del = await pool.query(
      `DELETE FROM followme_voice_messages
       WHERE id = $1 AND project_id = $2
       RETURNING file_path`,
      [id, q.rows[0].id]
    );

    if (del.rows[0]?.file_path) {
      try { fs.unlinkSync(del.rows[0].file_path); } catch(e) {}
    }

    const active = await pool.query(
      `SELECT id, source_url, source_label, file_url, mime_type, duration_seconds, is_active,
              listened_count, last_listened_at, created_at, updated_at
       FROM followme_voice_messages
       WHERE project_id = $1 AND is_active = TRUE
       ORDER BY updated_at DESC
       LIMIT 1`,
      [q.rows[0].id]
    );

    return res.json({
      success:true,
      deleted:del.rowCount || 0,
      has_active_voice:!!active.rows.length,
      active_voice:active.rows[0] || null
    });
  } catch (err) {
    console.error('followme voice delete error:', err);
    return res.status(500).json({ success:false, error:'Errore cancellazione messaggio vocale.' });
  }
});

app.post('/api/followme/:code/voice-messages/:id/listened', express.json({ limit:'32kb' }), async function(req, res) {
  try {
    await ensureFollowMeVoiceMessagesRuntime20260528();

    const code = String(req.params.code || '').trim();
    const id = Number(req.params.id || 0);

    const q = await pool.query(
      `SELECT id, code, public_id
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length || !id) return res.status(404).json({ success:false, error:'Dati non trovati.' });

    const project = q.rows[0];

    const upd = await pool.query(
      `UPDATE followme_voice_messages
       SET listened_count = COALESCE(listened_count,0) + 1,
           last_listened_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND project_id = $2
       RETURNING id, source_label, listened_count, last_listened_at`,
      [id, project.id]
    );

    if (!upd.rows.length) return res.status(404).json({ success:false, error:'Messaggio vocale non trovato.' });

    const pushKey = '__followmeVoiceListened_' + project.id + '_' + id;
    const nowMs = Date.now();
    const lastMs = Number(global[pushKey] || 0);
    let push = { skipped:true, reason:'anti_spam' };

    if (nowMs - lastMs > 60000) {
      global[pushKey] = nowMs;
      push = await sendFollowMeVoiceListenedPush20260528(project, upd.rows[0]);
    }

    return res.json({
      success:true,
      listened:true,
      voice:upd.rows[0],
      push
    });
  } catch (err) {
    console.error('followme voice listened error:', err);
    return res.status(500).json({ success:false, error:'Errore notifica ascolto messaggio.' });
  }
});




// FOLLOWME_PUBLIC_STATUS_EXPIRY_PENDING_GUARD_20260609
// Ordine pubblico ufficiale:
// 1) scaduto/bloccato -> pagina rinnovo
// 2) pending -> pagina attesa attivazione
// 3) active senza active_url -> pagina QR pronto/non configurato
// poi prosegue verso chat/info/documenti/immagini/active_url.
app.get('/fm/u/:public_id', async function followMePublicStatusExpiryPendingGuard20260609(req, res, next) {
  try {
    if (typeof ensureFollowMeProvisioningColumns20260609 === 'function') {
      await ensureFollowMeProvisioningColumns20260609();
    }

    const rawPublicId = String(req.params.public_id || '').trim();
    const publicId = typeof normalizeFollowMePublicId === 'function'
      ? normalizeFollowMePublicId(rawPublicId)
      : rawPublicId.toUpperCase();

    if (!publicId) return next();

    const q = await pool.query(
      `SELECT id, code, public_id, status, active_url, expires_at, blocked_reason, blocked_at
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) return next();

    const p = q.rows[0];
    const status = String(p.status || '').trim().toLowerCase();
    const activeUrl = String(p.active_url || '').trim();

    if (status === 'blocked' || status === 'expired' || p.blocked_at) {
      return res.redirect(302, '/fm/expired/' + encodeURIComponent(p.public_id || p.code || publicId));
    }

    if (p.expires_at && new Date(p.expires_at).getTime() <= Date.now()) {
      try {
        await pool.query(
          `UPDATE followme_projects
           SET status = CASE WHEN LOWER(COALESCE(status,'')) = 'active' THEN 'expired' ELSE status END,
               updated_at = NOW()
           WHERE id = $1`,
          [p.id]
        );
      } catch(e) {}
      return res.redirect(302, '/fm/expired/' + encodeURIComponent(p.public_id || p.code || publicId));
    }

    if (status === 'pending') {
      return res.redirect(302, '/fm/activate/' + encodeURIComponent(p.public_id || p.code || publicId));
    }

    if (status === 'active' && !activeUrl) {
      return res.redirect(302, '/fm/activate/' + encodeURIComponent(p.public_id || p.code || publicId));
    }

    return next();
  } catch (err) {
    console.error('followme public status/expiry guard error:', err);
    return next();
  }
});


// FOLLOWME_PUBLIC_FM_U_CHAT_PRIORITY_RESTORE_20260530
// Priorità corretta QR pubblico:
// - se "Parla con gli utenti" è acceso, /fm/u/:public_id apre Chat V2;
// - se è spento, passa alla rotta esistente e torna al redirect normale verso active_url.
app.get('/fm/u/:public_id', async function followMePublicQrChatPriority20260530(req, res, next) {
  try {
    if (typeof ensureFollowMeChatV2Runtime === 'function') {
      await ensureFollowMeChatV2Runtime();
    } else if (typeof ensureFollowMeChatSchemaFast === 'function') {
      await ensureFollowMeChatSchemaFast();
    }

    const rawPublicId = String(req.params.public_id || '').trim();
    const publicId = typeof normalizeFollowMePublicId === 'function'
      ? normalizeFollowMePublicId(rawPublicId)
      : rawPublicId.toUpperCase();

    if (!publicId) return next();

    const q = await pool.query(
      `SELECT id, code, public_id, active_url, chat_mode_enabled, chat_public_token
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) return next();

    const project = q.rows[0];

    if (project.chat_mode_enabled === true) {
      let token = String(project.chat_public_token || '').trim();

      if (!token) {
        if (typeof ensureFollowMeChatV2Token === 'function') {
          token = await ensureFollowMeChatV2Token(project.id);
        } else if (typeof rotateFollowMeChatV2Token === 'function') {
          token = await rotateFollowMeChatV2Token(project.id);
        }
      }

      if (token) {
        return res.redirect(302, '/fm/chat-v2/c/' + encodeURIComponent(token) + '?v=' + Date.now());
      }

      console.warn('followme public chat priority: chat attiva ma token mancante per progetto', project.code || publicId);
    }

    return next();
  } catch (err) {
    console.error('followme public /fm/u chat priority guard error:', err);
    return next();
  }
});


// FOLLOWME_FAST_PUBLIC_QR_CHAT_V2_20260528
app.get('/fm/u/:public_id', async function(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const raw = String(req.params.public_id || '').trim();
    if (!raw) return next();

    const q = await pool.query(
      `SELECT id, code, public_id, active_url, chat_mode_enabled, chat_public_token, COALESCE(info_requests_enabled, FALSE) AS info_requests_enabled
       FROM followme_projects
       WHERE public_id = $1 OR code = $1
       LIMIT 1`,
      [raw]
    );

    if (!q.rows.length) return next();

    const row = q.rows[0];

    /*
      FOLLOWME_PUBLIC_QR_NO_AUTO_CHAT_20260529
      Il QR pubblico NON deve aprire automaticamente la chat solo perché
      chat_mode_enabled è true.

      Flusso corretto:
      - registra scansione;
      - se Richieste informazioni è ON, apre /fm/info/CODICE con contenuto + Chiedi info;
      - altrimenti apre active_url.
      La chat parte solo dal pulsante Chiedi info.
    */
    const activeUrl = String(row.active_url || '').trim();

    // FOLLOWME_FAST_FMU_SCAN_LOG_AND_PUSH_20260528
    /*
      La route veloce /fm/u deve fare anche quello che faceva la route storica:
      - registrare la scansione
      - aggiornare history/scan_count
      - inviare push QR scansionato
      Altrimenti il redirect funziona, ma il proprietario non riceve notifica.
    */
    try {
      const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;
      const referrer = req.headers['referer'] || req.headers['referrer'] || null;

      await pool.query(
        `INSERT INTO followme_scan_logs
         (project_id, url, ip_address, user_agent, referrer)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          row.id,
          activeUrl || null,
          ipAddress,
          userAgent,
          referrer
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
          [row.id, activeUrl]
        );
      }

      /*
        Anti-spam push:
        invio massimo una notifica per QR ogni 60 secondi.
        La scansione viene comunque registrata sempre.
      */
      const pushKey = '__followmeScanPushLast_' + String(row.id);
      const nowMs = Date.now();
      const lastMs = Number(global[pushKey] || 0);

      if (typeof sendFollowMeScanPush === 'function' && nowMs - lastMs > 60000) {
        global[pushKey] = nowMs;
        sendFollowMeScanPush(row).catch(function(err){
          console.error('followme fast /fm/u scan push error:', err && err.message ? err.message : err);
        });
      }
    } catch (scanErr) {
      console.error('followme fast /fm/u scan log/push error:', scanErr && scanErr.message ? scanErr.message : scanErr);
    }

    if (activeUrl) {
      // FOLLOWME_FAST_FMU_INFO_REQUESTS_REDIRECT_20260528
      if (row.info_requests_enabled === true) {
        return res.redirect(302, '/fm/info/' + encodeURIComponent(row.public_id || row.code || raw));
      }
      return res.redirect(302, activeUrl);
    }

    return res.redirect(302, '/fm/app/' + encodeURIComponent(row.code || raw));
  } catch (err) {
    console.error('followme fast public qr route error:', err && err.message ? err.message : err);
    return next();
  }
});


app.get('/__disabled_duplicate_fm_u_no_auto_chat_20260529/:public_id', async (req, res) => {

    /*
      FOLLOWME_DISABLE_DUPLICATE_FM_U_ROUTE_20260529
      Questa seconda route /fm/u era duplicata e conteneva ancora il redirect
      diretto alla Chat V2. La route pubblica valida resta quella precedente.
    */

  try {
    const publicId = normalizeFollowMePublicId(req.params.public_id);

    const q = await pool.query(
      `SELECT *
       FROM followme_projects
       WHERE (public_id = $1 OR code = $1)
       LIMIT 1`,
      [publicId]
    );

    if (!q.rows.length) {
      return res.status(404).send('Follow Me QR non trovato.');
    }

    const project = q.rows[0];

    if (String(project.status || 'active').toLowerCase() === 'blocked') {
      return sendFollowMeBlockedPage20260525(res);
    }

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

    const activeUrlLower = String(activeUrl || '').toLowerCase();

    if (
      activeUrl &&
      (
        activeUrlLower.includes('/uploads/followme-documents/') ||
        activeUrlLower.includes('/uploads/followme-docs/') ||
        activeUrlLower.includes('/api/followme/document/') ||
        activeUrlLower.endsWith('.pdf')
      )
    ) {
      const viewerUrl = '/pdf-viewer.html?file=' + encodeURIComponent(activeUrl);
      return res.redirect(302, viewerUrl);
    }

    return res.redirect(302, activeUrl);
  } catch (err) {
    console.error('fm/u error:', err);
    return res.status(500).send('Errore Follow Me QR.');
  }
});




// followme-public-blocked-page-20260525
function sendFollowMeBlockedPage20260525(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  return res.status(403).send(`<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>QR bloccato</title>
  <style>
    body{
      margin:0;
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:24px;
      box-sizing:border-box;
      background:
        radial-gradient(circle at 20% 0%, rgba(255,90,111,.22), transparent 34%),
        linear-gradient(145deg,#07070d,#111323 58%,#050508);
      color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
      text-align:center;
    }
    .card{
      width:min(520px,100%);
      border-radius:30px;
      padding:34px 24px;
      background:rgba(255,255,255,.07);
      border:1px solid rgba(255,255,255,.13);
      box-shadow:0 28px 80px rgba(0,0,0,.38);
    }
    .badge{
      display:inline-flex;
      min-height:30px;
      align-items:center;
      padding:0 13px;
      border-radius:999px;
      background:rgba(255,90,111,.18);
      color:#ffb4bf;
      font-size:12px;
      font-weight:950;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    h1{
      margin:16px 0 8px;
      font-size:34px;
      line-height:1;
      letter-spacing:-.05em;
    }
    p{
      margin:0 auto;
      max-width:360px;
      color:rgba(255,255,255,.68);
      font-size:15px;
      line-height:1.45;
      font-weight:650;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Bloccato</div>
    <h1>QR temporaneamente bloccato</h1>
    <p>Questo contenuto non è al momento disponibile perché è stato bloccato dal sistema.</p>
  </main>
</body>
</html>`);
}


// start-followme-public-fm-code-route-20260525
/*
  Alias pubblico QR FollowMe:
  /fm/CODICE -> /fm/u/CODICE

  La route /fm/u/:public_id contiene già la logica completa:
  - cerca code o public_id
  - registra scan
  - aggiorna history
  - gestisce PDF viewer
  - redirige active_url
*/
app.get('/fm/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(404).send('QR FollowMe non trovato.');
    }

    return res.redirect(302, '/fm/u/' + encodeURIComponent(code));
  } catch (err) {
    console.error('followme public /fm/:code alias error:', err);
    return res.status(500).send('Errore apertura QR FollowMe.');
  }
});
// end-followme-public-fm-code-route-20260525


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



// FOLLOWME_ENFORCE_GOOGLE_SAFE_BROWSING_ON_URL_SAVE_20260528
async function followMeRequireSafeUrlBeforeSave20260528(req, res, next) {
  try {
    /*
      Controllo invisibile lato server:
      prima di salvare un nuovo URL FollowMe, lo verifichiamo con Google Safe Browsing.
      La UI non mostra pannelli tecnici: riceve solo messaggi chiari.
    */

    const body = req.body || {};

    const candidate =
      body.url ||
      body.active_url ||
      body.target_url ||
      body.targetUrl ||
      body.redirect_url ||
      body.redirectUrl ||
      body.new_url ||
      body.newUrl ||
      body.link ||
      '';

    const rawUrl = String(candidate || '').trim();

    /*
      Se questa chiamata non contiene un URL, lasciamo proseguire.
      Serve per non bloccare endpoint che usano lo stesso percorso per altri dati.
    */
    if (!rawUrl) {
      return next();
    }

    if (typeof normalizeFollowMeSecurityUrl20260528 !== 'function' ||
        typeof googleSafeBrowsingCheck20260528 !== 'function') {
      return res.status(503).json({
        success:false,
        status:'unknown',
        safe:false,
        blocked:true,
        provider:'Google Safe Browsing',
        error:'Controllo Google Safe Browsing non disponibile.',
        label:'Impossibile verificare la sicurezza del link. Per proteggere gli utenti, FollowMe non consente la pubblicazione automatica di questo URL.'
      });
    }

    const normalized = normalizeFollowMeSecurityUrl20260528(rawUrl);

    if (!normalized.ok) {
      return res.status(400).json({
        success:false,
        status:normalized.status || 'invalid',
        safe:false,
        blocked:true,
        provider:'Google Safe Browsing',
        url:rawUrl,
        error:normalized.error || 'URL non valido.',
        label:normalized.error || 'URL non valido. FollowMe non può pubblicare questo link.'
      });
    }

    const result = await googleSafeBrowsingCheck20260528(normalized.url);

    /*
      Regola severa:
      se non è esplicitamente safe:true/status:safe, blocchiamo.
      Quindi dangerous, unknown, errori API e verifiche incomplete vengono rifiutati.
    */
    if (!(result && result.success === true && result.safe === true && result.status === 'safe')) {
      return res.status(422).json({
        success:false,
        status:(result && result.status) || 'unknown',
        safe:false,
        blocked:true,
        provider:'Google Safe Browsing',
        url:normalized.url,
        hostname:normalized.hostname,
        error:(result && result.error) || 'URL non verificabile.',
        label:
          (result && result.status === 'dangerous')
            ? 'URL bloccato. Google Safe Browsing segnala questo link come potenzialmente pericoloso. FollowMe non lo pubblicherà.'
            : 'Impossibile verificare la sicurezza del link con Google Safe Browsing. Per proteggere gli utenti, FollowMe non consente la pubblicazione automatica di questo URL.',
        matches:(result && result.matches) || [],
        checked_at:new Date().toISOString()
      });
    }

    /*
      Esito positivo: salviamo l'esito nella request.
      La route originale potrà continuare senza cambiare UI.
    */
    req.followmeUrlSecurity20260528 = {
      success:true,
      status:'safe',
      safe:true,
      provider:'Google Safe Browsing',
      url:normalized.url,
      hostname:normalized.hostname,
      label:'Nessuna minaccia nota rilevata da Google Safe Browsing al momento della verifica.',
      checked_at:result.checked_at || new Date().toISOString()
    };

    return next();
  } catch (err) {
    console.error('followme safe browsing enforcement error:', err);
    return res.status(500).json({
      success:false,
      status:'unknown',
      safe:false,
      blocked:true,
      provider:'Google Safe Browsing',
      error:'Errore durante il controllo sicurezza URL.',
      label:'Impossibile verificare la sicurezza del link. Per proteggere gli utenti, FollowMe non consente la pubblicazione automatica di questo URL.',
      detail:String(err && err.message ? err.message : err)
    });
  }
}

/*
  Endpoint FollowMe protetti:
  - aggiornamento URL attivo
  - sostituzione URL collegato a QR esistente

  Il controllo resta nascosto: l'admin vede solo il messaggio di esito.
*/
app.post('/api/followme/:code/update-existing-qr', express.json({ limit:'128kb' }), followMeRequireSafeUrlBeforeSave20260528);
app.post('/api/followme/:code/update-url', express.json({ limit:'128kb' }), followMeRequireSafeUrlBeforeSave20260528);


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

    return res.json({
      success:true,
      project:q.rows[0],
      // FOLLOWME_UPDATE_URL_REAL_ROUTE_RETURN_SAFE_BROWSING_20260528
      url_security:req.followmeUrlSecurity20260528 || null
    });
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

    const userAgent = req.headers['user-agent'] || null;

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
        userAgent
      ]
    );

    /*
      Evita notifiche duplicate dopo reinstallazioni PWA/iPhone:
      per lo stesso progetto e lo stesso user_agent conserva solo la subscription più recente.
      Non tocca altri progetti e non tocca le subscription Auto.
    */
    await pool.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (
                  PARTITION BY project_id, COALESCE(user_agent, '')
                  ORDER BY
                    CASE WHEN endpoint = $2 THEN 0 ELSE 1 END,
                    updated_at DESC NULLS LAST,
                    id DESC
                ) AS rn
         FROM followme_push_subscriptions
         WHERE project_id = $1
           AND COALESCE(user_agent, '') = COALESCE($3, '')
       )
       DELETE FROM followme_push_subscriptions
       WHERE id IN (
         SELECT id FROM ranked WHERE rn > 1
       )`,
      [project.id, subscription.endpoint, userAgent]
    );

    return res.json({ success:true, saved:true, table:'followme_push_subscriptions', deduped:true });
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
  return res.status(410).json({
    success: false,
    disabled: true,
    error: 'Route disabilitata: non è consentito collegare subscription Auto a FollowMe.'
  });
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





/* ============================================================
   FOLLOWME STORAGE AUDIT 20260527
   Endpoint protetto per controllare spazio e residui temporanei.
   Richiede env FOLLOWME_AUDIT_TOKEN.
   ============================================================ */

function getDirectorySizeAndFiles20260527(dirPath, options = {}) {
  const fs = require('fs');
  const path = require('path');

  const maxFiles = options.maxFiles || 80;
  const baseDir = path.resolve(dirPath);

  const result = {
    path: dirPath,
    exists: false,
    bytes: 0,
    files_count: 0,
    directories_count: 0,
    newest_files: [],
    largest_files: []
  };

  if (!fs.existsSync(baseDir)) return result;

  result.exists = true;
  const files = [];

  function walk(current) {
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes:true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      let st;
      try {
        st = fs.statSync(full);
      } catch (e) {
        continue;
      }

      if (entry.isDirectory()) {
        result.directories_count += 1;
        walk(full);
      } else if (entry.isFile()) {
        result.files_count += 1;
        result.bytes += st.size;

        files.push({
          name: path.relative(baseDir, full),
          bytes: st.size,
          mtime: st.mtime.toISOString()
        });
      }
    }
  }

  walk(baseDir);

  result.newest_files = files
    .slice()
    .sort((a,b) => String(b.mtime).localeCompare(String(a.mtime)))
    .slice(0, maxFiles);

  result.largest_files = files
    .slice()
    .sort((a,b) => b.bytes - a.bytes)
    .slice(0, maxFiles);

  return result;
}

function getDiskInfo20260527(targetPath) {
  const fs = require('fs');

  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync(targetPath);
      const total = Number(st.blocks) * Number(st.bsize);
      const free = Number(st.bavail) * Number(st.bsize);
      const used = total - free;

      return {
        path: targetPath,
        supported: true,
        total_bytes: total,
        free_bytes: free,
        used_bytes: used,
        used_percent: total ? Math.round((used / total) * 10000) / 100 : null
      };
    }
  } catch (e) {
    return {
      path: targetPath,
      supported: false,
      error: String(e.message || e)
    };
  }

  return {
    path: targetPath,
    supported: false,
    error: 'fs.statfsSync non disponibile in questa versione Node.'
  };
}

app.get('/api/followme/admin/storage-audit', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    const expected = process.env.FOLLOWME_AUDIT_TOKEN || '';
    const provided = String(req.query.token || req.headers['x-followme-audit-token'] || '');

    if (!expected) {
      return res.status(403).json({
        success:false,
        error:'FOLLOWME_AUDIT_TOKEN non configurato su Render.'
      });
    }

    if (!provided || provided !== expected) {
      return res.status(401).json({
        success:false,
        error:'Token audit non valido.'
      });
    }

    await ensureFollowMeChatV2Runtime();

    if (String(req.query.cleanup || '') === '1' && typeof cleanupExpiredFollowMeChatV2Attachments === 'function') {
      await cleanupExpiredFollowMeChatV2Attachments();
    }

    const chatV2Dir = path.join(__dirname, 'public', 'uploads', 'followme-chat-v2');
    const chatOldDir = path.join(__dirname, 'public', 'uploads', 'followme-chat');
    const publicUploadsDir = path.join(__dirname, 'public', 'uploads');
    const followmeDocumentsDir = path.join(__dirname, 'public', 'uploads', 'followme-documents');
    const persistentDir = process.env.FOLLOWME_STORAGE_DIR || '/var/data';

    const dbRows = await pool.query(
      `SELECT id, session_id, sender, message, created_at
       FROM followme_chat_messages
       WHERE message LIKE '%__followme_attachment_v2%'
       ORDER BY id DESC
       LIMIT 500`
    );

    const now = Date.now();
    const attachmentMessages = [];
    const referencedUrls = new Set();
    const expiredInDb = [];

    for (const row of dbRows.rows) {
      let payload = null;
      try {
        payload = JSON.parse(String(row.message || ''));
      } catch(e) {
        continue;
      }

      if (!payload || payload.__followme_attachment_v2 !== true) continue;

      const expiresAtMs = payload.expires_at ? Date.parse(payload.expires_at) : null;
      const isExpired = !!expiresAtMs && expiresAtMs <= now;
      const url = String(payload.url || '');

      if (url) referencedUrls.add(url);

      const item = {
        id: row.id,
        session_id: row.session_id,
        sender: row.sender,
        kind: payload.kind || null,
        url,
        filename: payload.filename || null,
        bytes: payload.size_bytes || null,
        created_at: row.created_at,
        expires_at: payload.expires_at || null,
        expired: isExpired,
        listen_count: payload.listen_count ?? null,
        max_listens: payload.max_listens ?? null
      };

      attachmentMessages.push(item);
      if (isExpired) expiredInDb.push(item);
    }

    const orphanFiles = [];

    if (fs.existsSync(chatV2Dir)) {
      const files = fs.readdirSync(chatV2Dir);

      for (const filename of files) {
        const full = path.join(chatV2Dir, filename);
        let st;

        try {
          st = fs.statSync(full);
        } catch(e) {
          continue;
        }

        if (!st.isFile()) continue;

        const url = '/uploads/followme-chat-v2/' + filename;

        if (!referencedUrls.has(url)) {
          orphanFiles.push({
            filename,
            url,
            bytes: st.size,
            mtime: st.mtime.toISOString()
          });
        }
      }
    }

    return res.json({
      success:true,
      cleanup_requested:String(req.query.cleanup || '') === '1',
      generated_at:new Date().toISOString(),
      disk:{
        root:getDiskInfo20260527('/'),
        app:getDiskInfo20260527(__dirname),
        persistent:getDiskInfo20260527(persistentDir)
      },
      directories:{
        chat_v2:getDirectorySizeAndFiles20260527(chatV2Dir),
        old_chat:getDirectorySizeAndFiles20260527(chatOldDir),
        public_uploads:getDirectorySizeAndFiles20260527(publicUploadsDir, { maxFiles:30 }),
        followme_documents:getDirectorySizeAndFiles20260527(followmeDocumentsDir, { maxFiles:30 }),
        persistent_storage:getDirectorySizeAndFiles20260527(persistentDir, { maxFiles:30 })
      },
      chat_v2_attachments:{
        db_attachment_messages_count:attachmentMessages.length,
        expired_in_db_count:expiredInDb.length,
        expired_in_db:expiredInDb.slice(0, 80),
        orphan_files_count:orphanFiles.length,
        orphan_files:orphanFiles.slice(0, 80),
        latest_attachment_messages:attachmentMessages.slice(0, 80)
      }
    });
  } catch (err) {
    console.error('followme storage audit error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore storage audit.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


// ==============================
// CITOFONAMI - BACKEND ISOLATO
// ==============================
const CITOFONAMI_STORAGE_DIR = process.env.CITOFONAMI_STORAGE_DIR || process.env.FOLLOWME_STORAGE_DIR || path.join(__dirname, 'data');
const CITOFONAMI_DB_FILE = path.join(CITOFONAMI_STORAGE_DIR, 'citofonami-db.json');

function ensureCitofonamiStorage() {
  try {
    fs.mkdirSync(CITOFONAMI_STORAGE_DIR, { recursive: true });
    if (!fs.existsSync(CITOFONAMI_DB_FILE)) {
      fs.writeFileSync(CITOFONAMI_DB_FILE, JSON.stringify({ configs: {}, subscriptions: {}, events: [] }, null, 2));
    }
  } catch (error) {
    console.error('Errore storage Citofonami:', error);
  }
}

function readCitofonamiDb() {
  ensureCitofonamiStorage();

  try {
    return JSON.parse(fs.readFileSync(CITOFONAMI_DB_FILE, 'utf8'));
  } catch (error) {
    return { configs: {}, subscriptions: {}, events: [] };
  }
}

function writeCitofonamiDb(db) {
  ensureCitofonamiStorage();
  fs.writeFileSync(CITOFONAMI_DB_FILE, JSON.stringify(db, null, 2));
}

function normalizeCitofonamiCode(code) {
  return String(code || 'DEMO').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'DEMO';
}

function defaultCitofonamiConfig(code) {
  return {
    firstName: 'Mario',
    lastName: 'Rossi',
    locationName: 'Studio Mario Rossi',
    publicText: 'Premi il pulsante per parlare con il proprietario. Nessun numero telefonico verrà mostrato.',
    qrCode: normalizeCitofonamiCode(code),
    buttonLabel: 'Mario Rossi',
    address: 'Monza, Italia',
    radius: 50,
    radiusPreset: '50',
    hours: '08:00 - 20:00',
    latitude: 45.584500,
    longitude: 9.274400,
    enabled: true,
    pushEnabled: true,
    fallbackEnabled: true,
    requireLocation: true,
    doors: [
      { name: 'Mario Rossi', description: 'Citofono principale' }
    ],
    updatedAt: new Date().toISOString()
  };
}

function toRad(value) {
  return value * Math.PI / 180;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function sendCitofonamiPush(subscription, payload) {
  if (typeof webpush === 'undefined' || !webpush || typeof webpush.sendNotification !== 'function') {
    return { ok: false, error: 'webpush non disponibile in server.js' };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

app.get('/api/citofonami/vapid-public-key', (req, res) => {
  const publicKey =
    process.env.VAPID_PUBLIC_KEY ||
    process.env.PUBLIC_VAPID_KEY ||
    process.env.WEB_PUSH_PUBLIC_KEY ||
    '';

  if (!publicKey) {
    return res.json({
      ok: false,
      error: 'VAPID public key non configurata',
      hint: 'Imposta VAPID_PUBLIC_KEY su Render con la chiave pubblica web-push corretta.'
    });
  }

  const cleaned = String(publicKey).trim();

  if (!/^[A-Za-z0-9_-]+$/.test(cleaned) || cleaned.length < 60) {
    return res.json({
      ok: false,
      error: 'VAPID public key presente ma non valida',
      hint: 'La chiave deve essere base64url, senza spazi, senza virgolette e senza prefissi.'
    });
  }

  res.json({ ok: true, publicKey: cleaned });
});

app.get('/api/citofonami/:code/config', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = readCitofonamiDb();

  const config = db.configs[code] || defaultCitofonamiConfig(code);

  res.json({
    ok: true,
    code,
    config
  });
});

app.post('/api/citofonami/:code/config', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const body = req.body || {};
  const defaultConfig = defaultCitofonamiConfig(code);

  const buttonLabel = String(
    body.buttonLabel ||
    (Array.isArray(body.doors) && body.doors[0] && body.doors[0].name) ||
    `${body.firstName || 'Mario'} ${body.lastName || 'Rossi'}`
  ).slice(0, 80);

  const config = {
    ...defaultConfig,
    ...body,
    qrCode: code,
    firstName: String(body.firstName || defaultConfig.firstName).slice(0, 60),
    lastName: String(body.lastName || defaultConfig.lastName).slice(0, 60),
    locationName: String(body.locationName || defaultConfig.locationName).slice(0, 120),
    publicText: String(body.publicText || defaultConfig.publicText).slice(0, 240),
    buttonLabel,
    address: String(body.address || '').slice(0, 240),
    radius: Number(body.radius || 50),
    radiusPreset: String(body.radius || 50),
    hours: String(body.hours || defaultConfig.hours).slice(0, 60),
    latitude: Number(body.latitude || 0),
    longitude: Number(body.longitude || 0),
    enabled: body.enabled !== false,
    pushEnabled: body.pushEnabled !== false,
    fallbackEnabled: body.fallbackEnabled !== false,
    requireLocation: body.requireLocation !== false,
    doors: [
      {
        name: buttonLabel,
        description: 'Premi per parlare'
      }
    ],
    updatedAt: new Date().toISOString()
  };

  const db = readCitofonamiDb();
  db.configs[code] = config;
  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    config
  });
});

app.post('/api/citofonami/:code/subscribe', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const body = req.body || {};
  const subscription = body.subscription;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ ok: false, error: 'Subscription mancante' });
  }

  const db = readCitofonamiDb();
  db.subscriptions[code] = db.subscriptions[code] || [];

  const existingIndex = db.subscriptions[code].findIndex((item) => {
    return item.subscription && item.subscription.endpoint === subscription.endpoint;
  });

  const item = {
    role: body.role || 'admin',
    subscription,
    createdAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || ''
  };

  if (existingIndex >= 0) {
    db.subscriptions[code][existingIndex] = item;
  } else {
    db.subscriptions[code].push(item);
  }

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    subscriptions: db.subscriptions[code].length
  });
});

app.post('/api/citofonami/:code/ring', express.json({ limit: '1mb' }), async (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = readCitofonamiDb();
  const config = db.configs[code] || defaultCitofonamiConfig(code);

  if (config.enabled === false) {
    return res.status(403).json({ ok: false, error: 'Citofono disattivato' });
  }

  const body = req.body || {};
  const adminRequiresLocation = config.requireLocation !== false;
  const previousCallCount = Number((existingContact && existingContact.callCount) || 0);

  // Regola Citofonami:
  // - se admin NON richiede geolocalizzazione: non chiederla mai;
  // - se admin richiede geolocalizzazione: prima chiamata libera, dalla seconda obbligatoria.
  const requireLocation = adminRequiresLocation && previousCallCount >= 1;

  let distance = null;
  let allowed = true;
  let lat = body.lat === null || body.lat === undefined ? null : Number(body.lat);
  let lng = body.lng === null || body.lng === undefined ? null : Number(body.lng);

  if (requireLocation) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        ok: false,
        error: 'Posizione richiesta',
        requireLocation: true,
        firstCallFree: false,
        previousCallCount
      });
    }

    const configuredLat = Number(config.latitude);
    const configuredLng = Number(config.longitude);
    const radius = Number(config.radius || 50);

    if (Number.isFinite(configuredLat) && Number.isFinite(configuredLng) && configuredLat !== 0 && configuredLng !== 0) {
      distance = distanceMeters(lat, lng, configuredLat, configuredLng);
      allowed = distance <= radius;
    }
  }

  const event = {
    id: 'citofonami_' + Date.now(),
    code,
    door: body.door || null,
    lat,
    lng,
    accuracy: body.accuracy || null,
    distance,
    allowed,
    requireLocation,
    createdAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || body.userAgent || ''
  };

  db.events = Array.isArray(db.events) ? db.events : [];
  db.events.unshift(event);
  db.events = db.events.slice(0, 500);
  writeCitofonamiDb(db);

  if (!allowed) {
    return res.json({
      ok: true,
      allowed: false,
      distance,
      radius: Number(config.radius || 50)
    });
  }

  const subscriptions = (db.subscriptions[code] || []).filter((item) => item.role === 'admin');

  const owner = `${config.firstName || ''} ${config.lastName || ''}`.trim() || 'proprietario';
  const doorName =
    body.door && body.door.name
      ? body.door.name
      : (config.buttonLabel || owner || 'Citofonami');

  const payload = {
    title: 'Citofonami',
    body: `${doorName}: qualcuno sta suonando.`,
    tag: 'citofonami-ring-' + code,
    url: '/citofonami-admin'
  };

  const pushResults = [];

  if (config.pushEnabled !== false) {
    for (const item of subscriptions) {
      const result = await sendCitofonamiPush(item.subscription, payload);
      pushResults.push(result);
    }
  }

  res.json({
    ok: true,
    allowed: true,
    distance,
    radius: Number(config.radius || 50),
    requireLocation,
    pushed: pushResults.filter(r => r.ok).length,
    subscriptions: subscriptions.length
  });
});

// ==============================
// CITOFONAMI - ADMIN
// ==============================
app.get('/citofonami-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'citofonami-admin.html'));
});

// ==============================

// CITOFONAMI_SERVER_SIDE_USER_CONFIG
function escapeHtmlCitofonami(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderCitofonamiUserHtml(code) {
  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const config = db.configs[code] || defaultCitofonamiConfig(code);

  const firstName = config.firstName || '';
  const lastName = config.lastName || '';
  const fallbackName = `${firstName} ${lastName}`.trim() || 'Citofonami';
  const buttonLabel = config.buttonLabel || fallbackName;
  const publicText = config.publicText || 'Premi e chiama.';

  const htmlPath = path.join(__dirname, 'public', 'citofonami-app.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const safeName = escapeHtmlCitofonami(buttonLabel);
  const safeText = escapeHtmlCitofonami(publicText);

  // Sostituzioni visive principali, anche se l'HTML contiene ancora vecchi valori.
  html = html.replace(/Mario Rossi/g, safeName);
  html = html.replace(/Suona/g, 'Citofona');
  html = html.replace(/premi per parlare/g, 'premi e chiama');
  html = html.replace(/Premi il pulsante per parlare con il proprietario\./g, safeText);
  html = html.replace(/Premi il pulsante per chiamare\./g, safeText);

  // Se esistono elementi specifici, li forziamo.
  html = html.replace(
    /(<span[^>]*id=["']buttonName["'][^>]*>)([\s\S]*?)(<\/span>)/,
    `$1${safeName}$3`
  );

  html = html.replace(
    /(<[^>]*id=["']ownerName["'][^>]*>)([\s\S]*?)(<\/[^>]+>)/,
    `$1${safeName}$3`
  );

  html = html.replace(
    /(<[^>]*id=["']publicText["'][^>]*>)([\s\S]*?)(<\/[^>]+>)/,
    `$1${safeText}$3`
  );

  // Espone anche la config iniziale al JS, così non parte mai con valori vecchi.
  const injected = `
<script>
window.CITOFONAMI_SERVER_CONFIG = ${JSON.stringify(config)};
window.CITOFONAMI_SERVER_CODE = ${JSON.stringify(code)};
</script>
`;

  html = html.replace('</head>', injected + '\n</head>');

  return html;
}


// CITOFONAMI - WEB APP PUBBLICA UTENTE
// ==============================
app.get('/citofonami/:code', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  try {
    const html = renderCitofonamiUserHtml(code);
    res.type('html').send(html);
  } catch (error) {
    console.error('Errore render pagina Citofonami utente:', error);
    res.sendFile(path.join(__dirname, 'public', 'citofonami-app.html'));
  }
});

app.get('/citofonami', (req, res) => {
  res.redirect('/citofonami/DEMO');
});

// ==============================
function ensureCitofonamiDbShape(db) {
  db.configs = db.configs || {};
  db.subscriptions = db.subscriptions || {};
  db.events = Array.isArray(db.events) ? db.events : [];
  db.blocked = db.blocked || {};
  db.contacts = db.contacts || {};
  db.voicemails = db.voicemails || {};
  return db;
}

function getCitofonamiContacts(db, code) {
  ensureCitofonamiDbShape(db);
  db.contacts[code] = db.contacts[code] || {};
  return db.contacts[code];
}

function getCitofonamiVoicemails(db, code) {
  ensureCitofonamiDbShape(db);
  db.voicemails[code] = db.voicemails[code] || [];
  return db.voicemails[code];
}

function getCitofonamiContact(db, code, callerId) {
  const contacts = getCitofonamiContacts(db, code);
  return contacts[callerId] || null;
}

function upsertCitofonamiContact(db, code, callerId, patch) {
  const contacts = getCitofonamiContacts(db, code);
  const now = new Date().toISOString();

  const existing = contacts[callerId] || {
    callerId,
    displayName: '',
    firstSeenAt: now,
    lastSeenAt: now,
    callCount: 0,
    blocked: false,
    notes: ''
  };

  contacts[callerId] = {
    ...existing,
    ...patch,
    callerId,
    updatedAt: now
  };

  return contacts[callerId];
}

function sortCitofonamiContacts(list) {
  return list.sort((a, b) => {
    const ca = Number(a.callCount || 0);
    const cb = Number(b.callCount || 0);
    if (cb !== ca) return cb - ca;
    return String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
  });
}

function getCitofonamiEvent(db, code, callId) {
  return (db.events || []).find((item) => item.code === code && item.id === callId);
}

function safeCitofonamiFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

app.get('/api/citofonami/:code/contacts', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const contacts = Object.values(getCitofonamiContacts(db, code));

  const active = sortCitofonamiContacts(contacts.filter((item) => !item.blocked));
  const blocked = sortCitofonamiContacts(contacts.filter((item) => item.blocked));

  res.json({
    ok: true,
    code,
    active,
    blocked
  });
});

app.post('/api/citofonami/:code/contacts/:callerId', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const body = req.body || {};

  const contact = upsertCitofonamiContact(db, code, callerId, {
    displayName: String(body.displayName || '').slice(0, 100),
    notes: String(body.notes || '').slice(0, 500)
  });

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.delete('/api/citofonami/:code/contacts/:callerId', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const contacts = getCitofonamiContacts(db, code);

  delete contacts[callerId];

  db.blocked[code] = (db.blocked[code] || []).filter((item) => item.callerId !== callerId);

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    deleted: callerId
  });
});

app.post('/api/citofonami/:code/contacts/:callerId/block', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const contact = upsertCitofonamiContact(db, code, callerId, {
    blocked: true,
    blockedAt: new Date().toISOString()
  });

  const list = getCitofonamiBlockedList(db, code);
  const already = list.some((item) => item.callerId === callerId);

  if (!already) {
    list.push({
      callerId,
      createdAt: new Date().toISOString(),
      reason: 'Bloccato da rubrica admin'
    });
  }

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.post('/api/citofonami/:code/contacts/:callerId/unblock', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const contact = upsertCitofonamiContact(db, code, callerId, {
    blocked: false,
    blockedAt: null
  });

  db.blocked[code] = (db.blocked[code] || []).filter((item) => item.callerId !== callerId);

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.post('/api/citofonami/:code/calls/:callId/voicemail', express.json({ limit: '20mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = safeCitofonamiFileName(req.params.callId);
  const body = req.body || {};

  const callerId = normalizeCitofonamiCallerId(body.callerId);
  const audioBase64 = String(body.audioBase64 || '');
  const mimeType = String(body.mimeType || 'audio/webm').slice(0, 80);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  if (!audioBase64) {
    return res.status(400).json({ ok: false, error: 'Audio mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const event = getCitofonamiEvent(db, code, callId);

  if (!event) {
    return res.status(404).json({ ok: false, error: 'Chiamata non trovata' });
  }

  if (event.callerId !== callerId) {
    return res.status(403).json({ ok: false, error: 'Chiamata non autorizzata' });
  }

  const matches = audioBase64.match(/^data:([^;]+);base64,(.+)$/);
  const cleanBase64 = matches ? matches[2] : audioBase64;
  const detectedMime = matches ? matches[1] : mimeType;

  const buffer = Buffer.from(cleanBase64, 'base64');

  if (!buffer.length) {
    return res.status(400).json({ ok: false, error: 'Audio vuoto' });
  }

  if (buffer.length > 18 * 1024 * 1024) {
    return res.status(413).json({ ok: false, error: 'Audio troppo grande' });
  }

  const voicemailDir = path.join(CITOFONAMI_STORAGE_DIR, 'citofonami-voicemails', code);
  fs.mkdirSync(voicemailDir, { recursive: true });

  const ext = detectedMime.includes('mp4') ? 'm4a' : 'webm';
  const fileName = `${callId}-${Date.now()}.${ext}`;
  const filePath = path.join(voicemailDir, fileName);

  fs.writeFileSync(filePath, buffer);

  const publicPath = `/api/citofonami/${encodeURIComponent(code)}/voicemails/${encodeURIComponent(fileName)}`;

  event.status = 'voicemail_received';
  event.voicemailPath = filePath;
  event.voicemailPublicPath = publicPath;
  event.updatedAt = new Date().toISOString();

  const contact = upsertCitofonamiContact(db, code, callerId, {
    lastSeenAt: new Date().toISOString()
  });

  const record = {
    id: 'vm_' + Date.now(),
    code,
    callId,
    callerId,
    contactName: contact.displayName || '',
    fileName,
    filePath,
    publicPath,
    mimeType: detectedMime,
    size: buffer.length,
    createdAt: new Date().toISOString()
  };

  const voicemails = getCitofonamiVoicemails(db, code);
  voicemails.unshift(record);
  db.voicemails[code] = voicemails.slice(0, 300);

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId,
    voicemail: {
      id: record.id,
      publicPath,
      mimeType: detectedMime,
      size: buffer.length
    }
  });
});

app.get('/api/citofonami/:code/voicemails', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const voicemails = getCitofonamiVoicemails(db, code).map((item) => ({
    id: item.id,
    callId: item.callId,
    callerId: item.callerId,
    contactName: item.contactName,
    publicPath: item.publicPath,
    mimeType: item.mimeType,
    size: item.size,
    createdAt: item.createdAt
  }));

  res.json({
    ok: true,
    code,
    voicemails
  });
});

app.get('/api/citofonami/:code/voicemails/:fileName', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const fileName = safeCitofonamiFileName(req.params.fileName);
  const filePath = path.join(CITOFONAMI_STORAGE_DIR, 'citofonami-voicemails', code, fileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Voicemail not found');
  }

  res.sendFile(filePath);
});



// ==============================
// CITOFONAMI - CALL CONTROL V2 RESTORE
// ==============================
function normalizeCitofonamiCallerId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
}

function ensureCitofonamiDbShape(db) {
  db.configs = db.configs || {};
  db.subscriptions = db.subscriptions || {};
  db.events = Array.isArray(db.events) ? db.events : [];
  db.blocked = db.blocked || {};
  db.contacts = db.contacts || {};
  db.voicemails = db.voicemails || {};
  return db;
}

function getCitofonamiBlockedList(db, code) {
  ensureCitofonamiDbShape(db);
  db.blocked[code] = db.blocked[code] || [];
  return db.blocked[code];
}

function getCitofonamiContacts(db, code) {
  ensureCitofonamiDbShape(db);
  db.contacts[code] = db.contacts[code] || {};
  return db.contacts[code];
}

function getCitofonamiContact(db, code, callerId) {
  const contacts = getCitofonamiContacts(db, code);
  return contacts[callerId] || null;
}

function upsertCitofonamiContact(db, code, callerId, patch) {
  const contacts = getCitofonamiContacts(db, code);
  const now = new Date().toISOString();

  const existing = contacts[callerId] || {
    callerId,
    displayName: '',
    firstSeenAt: now,
    lastSeenAt: now,
    callCount: 0,
    blocked: false,
    notes: ''
  };

  contacts[callerId] = {
    ...existing,
    ...patch,
    callerId,
    updatedAt: now
  };

  return contacts[callerId];
}

function isCitofonamiCallerBlocked(db, code, callerId) {
  if (!callerId) return false;

  const contact = getCitofonamiContact(db, code, callerId);
  if (contact && contact.blocked) return true;

  const list = getCitofonamiBlockedList(db, code);
  return list.some((item) => item.callerId === callerId);
}

function sortCitofonamiContacts(list) {
  return list.sort((a, b) => {
    const ca = Number(a.callCount || 0);
    const cb = Number(b.callCount || 0);
    if (cb !== ca) return cb - ca;
    return String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
  });
}

function getCitofonamiVoicemails(db, code) {
  ensureCitofonamiDbShape(db);
  db.voicemails[code] = db.voicemails[code] || [];
  return db.voicemails[code];
}

function getCitofonamiEvent(db, code, callId) {
  return (db.events || []).find((item) => item.code === code && item.id === callId);
}

function safeCitofonamiFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
}

app.post('/api/citofonami/:code/ring-v2', express.json({ limit: '1mb' }), async (req, res) => {

  // CITOFONAMI_LIGHT_CLONE_NO_LOCATION_20260608
  // Il clone leggero "Il mio citofono" non deve mai richiedere posizione:
  // flusso utente = QR -> SUONA -> microfono -> chiamata.
  try {
    const body = req.body || {};
    const ua = String(body.userAgent || req.headers['user-agent'] || '');
    const isLightClone =
      body.lightClone === true ||
      body.source === 'il-mio-citofono' ||
      ua.includes('IL_MIO_CITOFONO_LIGHT_CLONE');

    if (isLightClone) {
      body.locationEnabled = false;
      body.geofenceEnabled = false;
      body.requireLocation = false;
      body.radiusDisabled = true;
      body.radius = 0;
      body.radiusPreset = '0';
      body.lat = undefined;
      body.lng = undefined;
      body.accuracy = undefined;
      req.body = body;
    }
  } catch (e) {
    console.warn('CITOFONAMI_LIGHT_CLONE_NO_LOCATION_20260608 error:', e && e.message ? e.message : e);
  }

  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const config = db.configs[code] || defaultCitofonamiConfig(code);
  const body = req.body || {};

  const callerId = normalizeCitofonamiCallerId(body.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'Dispositivo non identificato' });
  }

  const existingContact = getCitofonamiContact(db, code, callerId);

  if (isCitofonamiCallerBlocked(db, code, callerId)) {
    return res.status(403).json({
      ok: false,
      blocked: true,
      error: 'Sei stato bloccato dal sistema.'
    });
  }

  if (config.enabled === false) {
    return res.status(403).json({ ok: false, error: 'Citofono disattivato' });
  }

  const adminRequiresLocation = config.requireLocation !== false;
  const previousCallCount = Number((existingContact && existingContact.callCount) || 0);

  // Regola richiesta: se admin abilita geolocalizzazione,
  // la prima chiamata dello stesso dispositivo passa senza posizione;
  // dalla seconda in poi chiede posizione.
  const requireLocation = adminRequiresLocation && previousCallCount >= 1;

  let distance = null;
  let allowed = true;
  let lat = body.lat === null || body.lat === undefined ? null : Number(body.lat);
  let lng = body.lng === null || body.lng === undefined ? null : Number(body.lng);

  if (requireLocation) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        ok: false,
        error: 'Posizione richiesta',
        requireLocation: true,
        previousCallCount
      });
    }

    const configuredLat = Number(config.latitude);
    const configuredLng = Number(config.longitude);
    const radius = Number(config.radius || 50);

    if (Number.isFinite(configuredLat) && Number.isFinite(configuredLng) && configuredLat !== 0 && configuredLng !== 0) {
      distance = distanceMeters(lat, lng, configuredLat, configuredLng);
      allowed = distance <= radius;
    }
  }

  if (!allowed) {
    return res.json({
      ok: true,
      allowed: false,
      distance,
      radius: Number(config.radius || 50)
    });
  }

  const owner = `${config.firstName || ''} ${config.lastName || ''}`.trim() || 'proprietario';
  const defaultDoorName = config.buttonLabel || owner || 'Citofonami';
  const contact = upsertCitofonamiContact(db, code, callerId, {
    lastSeenAt: new Date().toISOString(),
    callCount: previousCallCount + 1,
    lastUserAgent: req.headers['user-agent'] || body.userAgent || '',
    lastIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  });

  const displayDoorName = contact.displayName || defaultDoorName;
  const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  const event = {
    id: callId,
    type: 'call',
    status: 'ringing',
    code,
    callerId,
    contactName: contact.displayName || '',
    callCount: Number(contact.callCount || 0),
    door: body.door || { name: displayDoorName, description: 'Citofono principale' },
    lat,
    lng,
    accuracy: body.accuracy || null,
    distance,
    allowed: true,
    requireLocation,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || body.userAgent || '',
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
  };

  db.events.unshift(event);
  db.events = db.events.slice(0, 500);
  writeCitofonamiDb(db);

  const subscriptions = (db.subscriptions[code] || []).filter((item) => item.role === 'admin');

  const payload = {
    title: 'Citofonami',
    body: `${displayDoorName}: qualcuno sta suonando.`,
    tag: 'citofonami-ring-' + code,
    url: `/citofonami-admin?code=${encodeURIComponent(code)}&call=${encodeURIComponent(callId)}`
  };

  const pushResults = [];

  if (config.pushEnabled !== false) {
    for (const item of subscriptions) {
      const result = await sendCitofonamiPush(item.subscription, payload);
      pushResults.push(result);
    }
  }

  res.json({
    ok: true,
    allowed: true,
    callId,
    status: 'ringing',
    requireLocation,
    firstCallFree: adminRequiresLocation && previousCallCount === 0,
    previousCallCount,
    currentCallCount: Number(contact.callCount || 0),
    pushed: pushResults.filter(r => r.ok).length,
    subscriptions: subscriptions.length
  });
});

app.get('/api/citofonami/:code/calls/pending', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const calls = (db.events || [])
    .filter((event) => event.code === code && event.type === 'call' && event.status === 'ringing')
    .slice(0, 10);

  res.json({
    ok: true,
    code,
    calls
  });
});




// ==============================
// CITOFONAMI - NON AMBIGUOUS LATEST CALLS
// ==============================
app.get('/api/citofonami/:code/calls-list/latest', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const calls = (db.events || [])
    .filter((event) => event.code === code && event.type === 'call')
    .slice(0, 20);

  res.json({
    ok: true,
    code,
    calls
  });
});

app.get('/api/citofonami/:code/calls-list/by-caller/:callerId/latest', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = String(req.params.callerId || '');

  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const calls = (db.events || [])
    .filter((event) =>
      event.code === code &&
      event.type === 'call' &&
      String(event.callerId || '') === callerId
    )
    .slice(0, 20);

  res.json({
    ok: true,
    code,
    callerId,
    call: calls[0] || null,
    calls
  });
});


app.get('/api/citofonami/:code/calls/:callId', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const event = getCitofonamiEvent(db, code, callId);

  if (!event) {
    return res.status(404).json({ ok: false, error: 'Chiamata non trovata' });
  }

  res.json({
    ok: true,
    code,
    call: event
  });
});

app.get('/api/citofonami/:code/calls/:callId/status', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const callerId = normalizeCitofonamiCallerId(req.query.callerId || '');

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const event = getCitofonamiEvent(db, code, callId);

  if (!event) {
    return res.status(404).json({ ok: false, error: 'Chiamata non trovata' });
  }

  if (event.callerId && callerId && event.callerId !== callerId) {
    return res.status(403).json({ ok: false, error: 'Chiamata non autorizzata' });
  }

  res.json({
    ok: true,
    code,
    callId,
    status: event.status,
    blocked: isCitofonamiCallerBlocked(db, code, event.callerId),
    updatedAt: event.updatedAt
  });
});

app.post('/api/citofonami/:code/calls/:callId/action', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const action = String((req.body || {}).action || '').trim();

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const event = getCitofonamiEvent(db, code, callId);

  if (!event) {
    return res.status(404).json({ ok: false, error: 'Chiamata non trovata' });
  }

  if (!['answer', 'close', 'block', 'voicemail'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'Azione non valida' });
  }

  if (action === 'answer') {
    event.status = 'answered';
  }

  if (action === 'voicemail') {
    event.status = 'voicemail_requested';
  }

  if (action === 'close') {
    event.status = 'closed';
  }

  if (action === 'block') {
    event.status = 'blocked';

    if (event.callerId) {
      upsertCitofonamiContact(db, code, event.callerId, {
        blocked: true,
        blockedAt: new Date().toISOString()
      });
    }

    const list = getCitofonamiBlockedList(db, code);
    const alreadyBlocked = list.some((item) => item.callerId === event.callerId);

    if (!alreadyBlocked && event.callerId) {
      list.push({
        callerId: event.callerId,
        createdAt: new Date().toISOString(),
        userAgent: event.userAgent || '',
        ip: event.ip || '',
        reason: 'Bloccato da admin'
      });
    }
  }

  event.updatedAt = new Date().toISOString();
  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId,
    status: event.status
  });
});

app.get('/api/citofonami/:code/blocked', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  res.json({
    ok: true,
    code,
    blocked: getCitofonamiBlockedList(db, code)
  });
});

app.get('/api/citofonami/:code/contacts', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const contacts = Object.values(getCitofonamiContacts(db, code));

  const active = sortCitofonamiContacts(contacts.filter((item) => !item.blocked));
  const blocked = sortCitofonamiContacts(contacts.filter((item) => item.blocked));

  res.json({
    ok: true,
    code,
    active,
    blocked
  });
});

app.post('/api/citofonami/:code/contacts/:callerId', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const body = req.body || {};

  const contact = upsertCitofonamiContact(db, code, callerId, {
    displayName: String(body.displayName || '').slice(0, 100),
    notes: String(body.notes || '').slice(0, 500)
  });

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.post('/api/citofonami/:code/contacts/:callerId/block', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const contact = upsertCitofonamiContact(db, code, callerId, {
    blocked: true,
    blockedAt: new Date().toISOString()
  });

  const list = getCitofonamiBlockedList(db, code);
  const already = list.some((item) => item.callerId === callerId);

  if (!already) {
    list.push({
      callerId,
      createdAt: new Date().toISOString(),
      reason: 'Bloccato da rubrica admin'
    });
  }

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.post('/api/citofonami/:code/contacts/:callerId/unblock', express.json({ limit: '1mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  if (!callerId) {
    return res.status(400).json({ ok: false, error: 'callerId mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const contact = upsertCitofonamiContact(db, code, callerId, {
    blocked: false,
    blockedAt: null
  });

  db.blocked[code] = (db.blocked[code] || []).filter((item) => item.callerId !== callerId);

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    contact
  });
});

app.delete('/api/citofonami/:code/contacts/:callerId', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callerId = normalizeCitofonamiCallerId(req.params.callerId);

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const contacts = getCitofonamiContacts(db, code);

  delete contacts[callerId];

  db.blocked[code] = (db.blocked[code] || []).filter((item) => item.callerId !== callerId);

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    deleted: callerId
  });
});



// ==============================
// CITOFONAMI - WEBRTC AUDIO SIGNALING V1
// ==============================
function ensureCitofonamiWebrtcStore(db) {
  db.webrtc = db.webrtc || {};
  return db;
}

function getCitofonamiWebrtcSession(db, code, callId) {
  ensureCitofonamiWebrtcStore(db);

  const key = code + ':' + callId;

  db.webrtc[key] = db.webrtc[key] || {
    code,
    callId,
    offer: null,
    answer: null,
    ice: {
      admin: [],
      user: []
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return db.webrtc[key];
}

function normalizeCitofonamiWebrtcRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return role === 'admin' ? 'admin' : 'user';
}

app.post('/api/citofonami/:code/calls/:callId/webrtc/offer', express.json({ limit: '2mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const offer = (req.body || {}).offer;

  if (!callId || !offer || offer.type !== 'offer') {
    return res.status(400).json({ ok: false, error: 'Offer WebRTC non valida' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  session.offer = offer;
  session.answer = null;
  session.ice = { admin: [], user: [] };
  session.updatedAt = new Date().toISOString();

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId
  });
});

app.get('/api/citofonami/:code/calls/:callId/webrtc/offer', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  res.json({
    ok: true,
    code,
    callId,
    offer: session.offer || null
  });
});

app.post('/api/citofonami/:code/calls/:callId/webrtc/answer', express.json({ limit: '2mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const answer = (req.body || {}).answer;

  if (!callId || !answer || answer.type !== 'answer') {
    return res.status(400).json({ ok: false, error: 'Answer WebRTC non valida' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  session.answer = answer;
  session.updatedAt = new Date().toISOString();

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId
  });
});

app.get('/api/citofonami/:code/calls/:callId/webrtc/answer', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  res.json({
    ok: true,
    code,
    callId,
    answer: session.answer || null
  });
});

app.post('/api/citofonami/:code/calls/:callId/webrtc/ice', express.json({ limit: '2mb' }), (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const role = normalizeCitofonamiWebrtcRole((req.body || {}).role);
  const candidate = (req.body || {}).candidate;

  if (!callId || !candidate) {
    return res.status(400).json({ ok: false, error: 'ICE candidate mancante' });
  }

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  session.ice[role] = session.ice[role] || [];

  const key = JSON.stringify(candidate);
  const exists = session.ice[role].some((item) => JSON.stringify(item) === key);

  if (!exists) {
    session.ice[role].push(candidate);
  }

  session.ice[role] = session.ice[role].slice(-80);
  session.updatedAt = new Date().toISOString();

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId,
    role,
    count: session.ice[role].length
  });
});

app.get('/api/citofonami/:code/calls/:callId/webrtc/ice', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const role = normalizeCitofonamiWebrtcRole(req.query.role);
  const otherRole = role === 'admin' ? 'user' : 'admin';

  const db = ensureCitofonamiDbShape(readCitofonamiDb());
  const session = getCitofonamiWebrtcSession(db, code, callId);

  res.json({
    ok: true,
    code,
    callId,
    role,
    candidates: session.ice[otherRole] || []
  });
});

app.delete('/api/citofonami/:code/calls/:callId/webrtc', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const callId = String(req.params.callId || '');
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  ensureCitofonamiWebrtcStore(db);

  const key = code + ':' + callId;
  delete db.webrtc[key];

  writeCitofonamiDb(db);

  res.json({
    ok: true,
    code,
    callId
  });
});




// ==============================
// CITOFONAMI - LATEST CALLS DEBUG
// ==============================
app.get('/api/citofonami/:code/calls/latest', (req, res) => {
  const code = normalizeCitofonamiCode(req.params.code);
  const db = ensureCitofonamiDbShape(readCitofonamiDb());

  const calls = (db.events || [])
    .filter((event) => event.code === code && event.type === 'call')
    .slice(0, 20);

  res.json({
    ok: true,
    code,
    calls
  });
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


/* ============================================================
   FOLLOWME CHAT V2 CLEAN 20260527
   Frontend nuovo, tabelle esistenti, bot spento.
   ============================================================ */

async function ensureFollowMeChatV2Runtime() {
  if (typeof ensureFollowMeRuntimeFast === 'function') {
    await ensureFollowMeRuntimeFast();
  } else if (typeof ensureFollowMeChatSchemaFast === 'function') {
    await ensureFollowMeChatSchemaFast();
  } else if (typeof ensureFollowMeChatSchema === 'function') {
    await ensureFollowMeChatSchema();
  }

  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_mode_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_public_token TEXT`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS chat_token_rotated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_projects ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`UPDATE followme_projects SET bot_enabled = FALSE WHERE bot_enabled IS NULL`);

  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS display_name TEXT`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS uploads_enabled BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS owner_opened_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE followme_chat_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`);

  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS followme_projects_chat_public_token_uq ON followme_projects(chat_public_token) WHERE chat_public_token IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS followme_chat_sessions_project_open_v2_idx ON followme_chat_sessions(project_id, status, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS followme_chat_messages_session_id_v2_idx ON followme_chat_messages(session_id, id ASC)`);
}

function normalizeFollowMeChatV2Code(raw) {
  try {
    if (typeof normalizeFollowMeCode === 'function') {
      return normalizeFollowMeCode(raw);
    }
  } catch (e) {}

  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

function makeFollowMeChatV2Token() {
  return Math.random().toString(36).slice(2, 8).toUpperCase() +
         Math.random().toString(36).slice(2, 8).toUpperCase();
}


async function rotateFollowMeChatV2Token(projectId) {
  await ensureFollowMeChatV2Runtime();

  for (let i = 0; i < 12; i++) {
    const token = makeFollowMeChatV2Token();

    try {
      await pool.query(
        `UPDATE followme_projects
         SET chat_public_token = $2,
             chat_token_rotated_at = NOW(),
             bot_enabled = FALSE,
             updated_at = NOW()
         WHERE id = $1`,
        [projectId, token]
      );

      return token;
    } catch (err) {
      if (!String(err.message || '').toLowerCase().includes('duplicate')) {
        throw err;
      }
    }
  }

  throw new Error('Impossibile ruotare token Chat V2.');
}

async function ensureFollowMeChatV2Token(projectId) {
  await ensureFollowMeChatV2Runtime();

  const current = await pool.query(
    `SELECT chat_public_token FROM followme_projects WHERE id = $1 LIMIT 1`,
    [projectId]
  );

  if (current.rows[0]?.chat_public_token) return current.rows[0].chat_public_token;

  for (let i = 0; i < 8; i++) {
    const token = makeFollowMeChatV2Token();
    try {
      await pool.query(
        `UPDATE followme_projects
         SET chat_public_token = $2, chat_token_rotated_at = NOW(), bot_enabled = FALSE
         WHERE id = $1`,
        [projectId, token]
      );
      return token;
    } catch (err) {
      if (!String(err.message || '').includes('duplicate')) throw err;
    }
  }

  throw new Error('Impossibile generare token chat V2.');
}


/* FOLLOWME_CHAT_V2_RUNTIME_ONCE_CACHE_20260528
   Cache runtime Chat V2: evita di rifare inizializzazioni/schema su ogni richiesta.
*/
try {
  if (typeof ensureFollowMeChatV2Runtime === 'function' && !global.__followmeChatV2RuntimeOnceWrapped20260528) {
    global.__followmeChatV2RuntimeOnceWrapped20260528 = true;

    const __originalEnsureFollowMeChatV2Runtime20260528 = ensureFollowMeChatV2Runtime;

    ensureFollowMeChatV2Runtime = async function ensureFollowMeChatV2RuntimeCached20260528() {
      if (global.__followmeChatV2RuntimeReady20260528) return;

      if (!global.__followmeChatV2RuntimePromise20260528) {
        global.__followmeChatV2RuntimePromise20260528 = Promise.resolve()
          .then(() => __originalEnsureFollowMeChatV2Runtime20260528())
          .then((result) => {
            global.__followmeChatV2RuntimeReady20260528 = true;
            return result;
          })
          .catch((err) => {
            global.__followmeChatV2RuntimePromise20260528 = null;
            throw err;
          });
      }

      return global.__followmeChatV2RuntimePromise20260528;
    };

    setTimeout(() => {
      ensureFollowMeChatV2Runtime().catch((err) => {
        console.error('followme chat v2 runtime warmup error:', err && err.message ? err.message : err);
      });
    }, 500);
  }
} catch (err) {
  console.error('followme chat v2 runtime cache wrapper install error:', err && err.message ? err.message : err);
}


app.get('/fm/chat-v2/admin/:code', async (req, res) => {
  return res.sendFile(require('path').join(__dirname, 'public', 'followme-chat-v2-admin.html'));
});

app.get('/fm/chat-v2/c/:chat_token', async (req, res) => {
  return res.sendFile(require('path').join(__dirname, 'public', 'followme-chat-v2-user.html'));
});



/* FOLLOWME CHAT V2 ACTIVATION GUARD 20260527 */
app.use('/api/followme/:code/chat-v2/enable', function(req, res, next){
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } catch(e) {}
  next();
});



// followme-chat-v2-ready-priority-fix-20260528-start
app.get('/api/followme/:code/chat-v2/ready', async function(req, res){
  try {
    const code = String(req.params.code || '').trim();

    if (!code) {
      return res.status(400).json({
        success:false,
        ready:false,
        error:'Codice FollowMe mancante.'
      });
    }

    /*
      Route volutamente snella:
      non chiama funzioni runtime pesanti e non usa colonne dubbie.
      Serve solo a verificare se la Chat V2 è realmente pronta.
    */
    const q = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({
        success:false,
        ready:false,
        error:'Progetto FollowMe non trovato.'
      });
    }

    const row = q.rows[0];
    const token = String(row.chat_public_token || '').trim();
    const enabled = row.chat_mode_enabled === true;

    return res.json({
      success:true,
      ready:!!(enabled && token),
      chat_mode_enabled:enabled,
      chat_public_token:token || null,
      code:row.code,
      public_id:row.public_id,
      chat_url: token ? '/fm/chat-v2/c/' + encodeURIComponent(token) : null,
      admin_url:'/fm/chat-v2/admin/' + encodeURIComponent(row.code || code)
    });
  } catch (err) {
    console.error('followme chat-v2 ready priority error:', err);
    return res.status(500).json({
      success:false,
      ready:false,
      error:err.message || 'Errore verifica stato chat.'
    });
  }
});
// followme-chat-v2-ready-priority-fix-20260528-end

app.get('/api/followme/:code/chat-v2/ready', async function(req, res){
  try {
    if (typeof ensureFollowMeChatV2Runtime === 'function') {
      await ensureFollowMeChatV2Runtime();
    }

    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success:false, ready:false, error:'Codice FollowMe mancante.' });
    }

    const q = await pool.query(
      `SELECT id, code, chat_enabled, chat_public_token
       FROM followme_projects
       WHERE UPPER(code) = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, ready:false, error:'Progetto FollowMe non trovato.' });
    }

    const row = q.rows[0];
    const token = String(row.chat_public_token || '').trim();

    if (!token) {
      return res.json({
        success:true,
        ready:false,
        chat_enabled:!!row.chat_enabled,
        error:'Chat non ancora pronta.'
      });
    }

    return res.json({
      success:true,
      ready:true,
      chat_enabled:!!row.chat_enabled,
      chat_url:'/fm/chat-v2/c/' + encodeURIComponent(token),
      admin_url:'/fm/chat-v2/admin/' + encodeURIComponent(row.code || code)
    });
  } catch(err) {
    console.error('followme chat-v2 ready error:', err);
    return res.status(500).json({
      success:false,
      ready:false,
      error:'Errore verifica stato chat.'
    });
  }
});
/* END FOLLOWME CHAT V2 ACTIVATION GUARD 20260527 */



// FOLLOWME_GOOGLE_SAFE_BROWSING_URL_CHECK_20260528
function normalizeFollowMeSecurityUrl20260528(rawUrl) {
  const value = String(rawUrl || '').trim();

  if (!value) {
    return { ok:false, status:'invalid', error:'URL mancante.' };
  }

  if (value.length > 4096) {
    return { ok:false, status:'invalid', error:'URL troppo lungo.' };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch (err) {
    return { ok:false, status:'invalid', error:'URL non valido.' };
  }

  const protocol = String(parsed.protocol || '').toLowerCase();

  if (protocol !== 'https:' && protocol !== 'http:') {
    return {
      ok:false,
      status:'dangerous',
      error:'Protocollo non consentito. Sono ammessi solo http e https.'
    };
  }

  const blockedProtocols = ['javascript:', 'data:', 'file:', 'intent:', 'ftp:', 'blob:'];
  if (blockedProtocols.includes(protocol)) {
    return {
      ok:false,
      status:'dangerous',
      error:'Protocollo potenzialmente pericoloso.'
    };
  }

  return {
    ok:true,
    url: parsed.toString(),
    hostname: parsed.hostname,
    protocol
  };
}

function googleSafeBrowsingCheck20260528(urlToCheck) {
  return new Promise((resolve) => {
    const https = require('https');

    const apiKey = String(process.env.GOOGLE_SAFE_BROWSING_API_KEY || '').trim();

    if (!apiKey) {
      return resolve({
        success:false,
        status:'unknown',
        safe:false,
        provider:'Google Safe Browsing',
        error:'GOOGLE_SAFE_BROWSING_API_KEY non configurata.'
      });
    }

    const payload = JSON.stringify({
      client: {
        clientId: 'followme',
        clientVersion: '1.0'
      },
      threatInfo: {
        threatTypes: [
          'MALWARE',
          'SOCIAL_ENGINEERING',
          'UNWANTED_SOFTWARE',
          'POTENTIALLY_HARMFUL_APPLICATION'
        ],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [
          { url: urlToCheck }
        ]
      }
    });

    const req = https.request(
      'https://safebrowsing.googleapis.com/v4/threatMatches:find?key=' + encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 12000
      },
      (res) => {
        let body = '';

        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let data = {};
          try {
            data = body ? JSON.parse(body) : {};
          } catch (err) {
            return resolve({
              success:false,
              status:'unknown',
              safe:false,
              provider:'Google Safe Browsing',
              http_status:res.statusCode,
              error:'Risposta Google Safe Browsing non valida.'
            });
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return resolve({
              success:false,
              status:'unknown',
              safe:false,
              provider:'Google Safe Browsing',
              http_status:res.statusCode,
              error:data.error && data.error.message ? data.error.message : 'Errore Google Safe Browsing.',
              raw:data
            });
          }

          const matches = Array.isArray(data.matches) ? data.matches : [];

          if (matches.length) {
            return resolve({
              success:true,
              status:'dangerous',
              safe:false,
              provider:'Google Safe Browsing',
              label:'URL potenzialmente pericoloso segnalato da Google Safe Browsing.',
              matches,
              checked_at:new Date().toISOString()
            });
          }

          return resolve({
            success:true,
            status:'safe',
            safe:true,
            provider:'Google Safe Browsing',
            label:'Nessuna minaccia nota rilevata da Google Safe Browsing al momento della verifica.',
            matches:[],
            checked_at:new Date().toISOString()
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Timeout Google Safe Browsing.'));
    });

    req.on('error', (err) => {
      return resolve({
        success:false,
        status:'unknown',
        safe:false,
        provider:'Google Safe Browsing',
        error:String(err && err.message ? err.message : err)
      });
    });

    req.write(payload);
    req.end();
  });
}

app.post('/api/followme/url-security/check', express.json({ limit:'64kb' }), async function(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const rawUrl = req.body && req.body.url ? req.body.url : '';
    const normalized = normalizeFollowMeSecurityUrl20260528(rawUrl);

    if (!normalized.ok) {
      return res.status(400).json({
        success:false,
        status:normalized.status || 'invalid',
        safe:false,
        provider:'internal',
        url:String(rawUrl || '').trim(),
        error:normalized.error || 'URL non valido.',
        label:normalized.error || 'URL non valido.'
      });
    }

    const result = await googleSafeBrowsingCheck20260528(normalized.url);

    return res.json({
      success:result.success === true,
      url:normalized.url,
      hostname:normalized.hostname,
      provider:'Google Safe Browsing',
      status:result.status,
      safe:result.safe === true,
      label:result.label || result.error || 'Controllo sicurezza URL completato.',
      matches:result.matches || [],
      checked_at:result.checked_at || new Date().toISOString(),
      error:result.error || null
    });
  } catch (err) {
    console.error('followme url security check error:', err);
    return res.status(500).json({
      success:false,
      status:'unknown',
      safe:false,
      provider:'Google Safe Browsing',
      error:'Errore controllo sicurezza URL.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


app.post('/api/followme/:code/chat-v2/enable', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const code = normalizeFollowMeChatV2Code(req.params.code);
    const q = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = q.rows[0];

    /*
      Chat V2: ogni nuova attivazione dopo Reset deve generare un token nuovo.
      Se la chat è già attiva e ha già un token, lo manteniamo.
      Se è spenta o senza token, ruotiamo.
    */
    const token = (project.chat_mode_enabled === true && project.chat_public_token)
      ? project.chat_public_token
      : await rotateFollowMeChatV2Token(project.id);

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = TRUE,
           bot_enabled = FALSE,
           updated_at = NOW()
       WHERE id = $1`,
      [project.id]
    );

    return res.json({
      success:true,
      chat_mode_enabled:true,
      bot_enabled:false,
      project_code:project.code,
      chat_public_token:token,
      chat_url:`/fm/chat-v2/c/${token}`,
      admin_url:`/fm/chat-v2/admin/${encodeURIComponent(project.code)}`
    });
  } catch (err) {
    console.error('followme chat-v2 enable error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore attivazione Chat V2.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});

app.post('/api/followme/:code/chat-v2/reset', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const code = normalizeFollowMeChatV2Code(req.params.code);
    const q = await pool.query(
      `SELECT id, code, public_id FROM followme_projects WHERE code = $1 OR public_id = $1 LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = q.rows[0];

    const closed = await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           uploads_enabled = FALSE,
           is_blocked = FALSE,
           blocked_at = NULL,
           updated_at = NOW()
       WHERE project_id = $1
         AND status = 'open'
       RETURNING id`,
      [project.id]
    );

    await pool.query(
      `UPDATE followme_projects
       SET chat_mode_enabled = FALSE,
           bot_enabled = FALSE,
           chat_public_token = NULL,
           chat_token_rotated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [project.id]
    );

    return res.json({
      success:true,
      project_code:project.code,
      closed_sessions:closed.rows.length,
      chat_mode_enabled:false,
      bot_enabled:false
    });
  } catch (err) {
    console.error('followme chat-v2 reset error:', err);
    return res.status(500).json({ success:false, error:'Errore reset Chat V2.' });
  }
});

app.get('/api/followme/:code/chat-v2/sessions', async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const code = normalizeFollowMeChatV2Code(req.params.code);
    const q = await pool.query(
      `SELECT id, code, chat_mode_enabled
       FROM followme_projects
       WHERE code = $1 OR public_id = $1
       LIMIT 1`,
      [code]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'FollowMe QR non trovato.' });
    }

    const project = q.rows[0];

    const sessions = await pool.query(
      `WITH ordered AS (
        SELECT
          s.*,
          ROW_NUMBER() OVER (ORDER BY s.created_at ASC, s.id ASC) AS display_index
        FROM followme_chat_sessions s
        WHERE s.project_id = $1
          AND s.status = 'open'
      )
      SELECT
        id,
        display_index,
        visitor_label,
        display_name,
        COALESCE(uploads_enabled, FALSE) AS uploads_enabled,
        COALESCE(is_blocked, FALSE) AS is_blocked,
        blocked_at,
        status,
        created_at,
        last_seen_at,
        owner_opened_at,
        updated_at
      FROM ordered
      ORDER BY created_at ASC, id ASC
      LIMIT 50`,
      [project.id]
    );

    return res.json({
      success:true,
      project_code:project.code,
      chat_mode_enabled:project.chat_mode_enabled === true,
      sessions:sessions.rows
    });
  } catch (err) {
    console.error('followme chat-v2 sessions error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura sessioni Chat V2.' });
  }
});



/* ============================================================
   FOLLOWME CHAT V2 NEW USER PUSH 20260527
   Avvisa i possessori iscritti quando un nuovo utente entra in chat.
   ============================================================ */

async function sendFollowMeChatV2NewUserPush(project, sessionId) {
  try {
    if (!project || !project.id || !project.code || !sessionId) return { sent:0, failed:0 };

    if (typeof webpush === 'undefined' || !webpush || typeof webpush.sendNotification !== 'function') {
      console.warn('followme chat-v2 new user push skipped: webpush non disponibile');
      return { sent:0, failed:0, skipped:true };
    }

    const adminUrl = `/fm/chat-v2/admin/${encodeURIComponent(project.code)}?session=${encodeURIComponent(sessionId)}`;

    const payload = JSON.stringify({
      title: 'FollowMe',
      body: 'HAI UN NUOVO CONNESSO IN CHAT',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `followme-chat-v2-new-user-${project.id}-${sessionId}`,
      renotify: true,
      requireInteraction: false,
      vibrate: [120, 60, 120],
      url: adminUrl,
      targetUrl: adminUrl,
      relativeTargetUrl: adminUrl,
      data: {
        type: 'followme_chat_v2_new_user',
        code: project.code,
        public_id: project.public_id || project.code,
        session_id: String(sessionId),
        url: adminUrl,
        targetUrl: adminUrl,
        relativeTargetUrl: adminUrl
      }
    });

    /*
      Recupero iscrizioni push robusto:
      la tabella può avere schema vecchio, quindi non assumiamo is_active/project_id/code/public_id.
    */
    const colInfo = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'followme_push_subscriptions'`
    );

    const cols = new Set(colInfo.rows.map(r => r.column_name));

    const where = [];
    const params = [];

    if (cols.has('is_active')) {
      where.push(`is_active IS DISTINCT FROM FALSE`);
    }

    const projectFilters = [];

    if (cols.has('project_id')) {
      params.push(project.id);
      projectFilters.push(`project_id = $${params.length}`);
    }

    if (cols.has('code')) {
      params.push(project.code);
      projectFilters.push(`code = $${params.length}`);
    }

    if (cols.has('public_id')) {
      params.push(project.public_id || project.code);
      projectFilters.push(`public_id = $${params.length}`);
    }

    /*
      Se esistono colonne progetto, filtro sul progetto.
      Se non esistono, mando a tutte le subscription disponibili:
      è coerente con la richiesta "tutti i possessori che hanno salvato l'app".
    */
    if (projectFilters.length) {
      where.push(`(${projectFilters.join(' OR ')})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const subs = await pool.query(
      `SELECT id, endpoint, p256dh, auth
       FROM followme_push_subscriptions
       ${whereSql}
       LIMIT 200`,
      params
    );

    let sent = 0;
    let failed = 0;

    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err) {
        failed += 1;

        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          try {
            await pool.query('DELETE FROM followme_push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
          } catch(e) {}
        } else {
          console.error('followme chat-v2 new user push error:', err.statusCode || '', err.body || err.message || err);
        }
      }
    }

    return { sent, failed };
  } catch (err) {
    console.error('sendFollowMeChatV2NewUserPush error:', err.message || err);
    return { sent:0, failed:1, error:String(err.message || err) };
  }
}


app.post('/api/followme/chat-v2/c/:chat_token/session', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const token = String(req.params.chat_token || '').trim();

    const q = await pool.query(
      `SELECT id, code, public_id, chat_mode_enabled, chat_public_token
       FROM followme_projects
       WHERE chat_public_token = $1
       LIMIT 1`,
      [token]
    );

    if (!q.rows.length || q.rows[0].chat_mode_enabled !== true) {
      return res.status(404).json({ success:false, error:'Chat non disponibile.' });
    }

    const project = q.rows[0];
    const existingId = Number(req.body?.session_id || 0);

    if (existingId) {
      const existing = await pool.query(
        `SELECT id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, status, created_at, last_seen_at
         FROM followme_chat_sessions
         WHERE id = $1 AND project_id = $2
         LIMIT 1`,
        [existingId, project.id]
      );

      if (existing.rows.length) {
        await pool.query(`UPDATE followme_chat_sessions SET last_seen_at = NOW() WHERE id = $1`, [existingId]);
        return res.json({
          success:true,
          reused:true,
          project_code:project.code,
          session_id:existing.rows[0].id,
          session:existing.rows[0]
        });
      }
    }

    const visitorLabel = 'Utente ' + Math.random().toString(36).slice(2, 6).toUpperCase();

    const inserted = await pool.query(
      `INSERT INTO followme_chat_sessions
       (project_id, chat_public_token, visitor_label, status, created_at, last_seen_at, uploads_enabled, is_blocked)
       VALUES ($1,$2,$3,'open',NOW(),NOW(),FALSE,FALSE)
       RETURNING id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, status, created_at, last_seen_at`,
      [project.id, token, visitorLabel]
    );

    const pushResult = await sendFollowMeChatV2NewUserPush(project, inserted.rows[0].id);

    return res.json({
      success:true,
      reused:false,
      project_code:project.code,
      session_id:inserted.rows[0].id,
      session:inserted.rows[0],
      push:pushResult
    });
  } catch (err) {
    console.error('followme chat-v2 create session error:', err);
    return res.status(500).json({ success:false, error:'Errore creazione sessione Chat V2.' });
  }
});


// FOLLOWME_CHAT_V2_CLOSE_THANKS_RETURN_20260528
app.post('/api/followme/chat-v2/session/:session_id/close-thanks', express.json({ limit:'64kb' }), async (req, res) => {
  try {
    const sessionId = Number(req.params.session_id || 0);
    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione non valida.' });
    }

    const q = await pool.query(
      `SELECT
          s.id,
          s.project_id,
          s.visitor_label,
          s.display_name,
          s.status,
          s.source_url,
          s.source_label,
          p.active_url,
          p.code,
          p.public_id
       FROM followme_chat_sessions s
       JOIN followme_projects p ON p.id = s.project_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!q.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const row = q.rows[0];

    const thanksMessage =
      String(req.body?.message || '').trim() ||
      'Grazie per averci contattato.';

    const returnUrl =
      String(row.source_url || '').trim() ||
      String(row.active_url || '').trim() ||
      ('/fm/u/' + encodeURIComponent(row.public_id || row.code));

    await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,'system',$3,NOW())`,
      [sessionId, row.project_id, thanksMessage]
    );

    const upd = await pool.query(
      `UPDATE followme_chat_sessions
       SET status = 'closed',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, visitor_label, display_name, status,
                 source_url, source_label, updated_at`,
      [sessionId]
    );

    return res.json({
      success:true,
      session:upd.rows[0],
      message:thanksMessage,
      return_url:returnUrl
    });
  } catch (err) {
    console.error('followme chat-v2 close-thanks error:', err);
    return res.status(500).json({ success:false, error:'Errore chiusura chat.' });
  }
});


app.get('/api/followme/chat-v2/session/:session_id/state', async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const sessionId = Number(req.params.session_id || 0);
    if (!sessionId) return res.status(400).json({ success:false, error:'Sessione mancante.' });

    const q = await pool.query(
      `SELECT id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, blocked_at, status, created_at, last_seen_at, updated_at
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!q.rows.length) return res.status(404).json({ success:false, error:'Sessione non trovata.' });

    await pool.query(`UPDATE followme_chat_sessions SET last_seen_at = NOW() WHERE id = $1`, [sessionId]);

    return res.json({ success:true, session:q.rows[0] });
  } catch (err) {
    console.error('followme chat-v2 state error:', err);
    return res.status(500).json({ success:false, error:'Errore stato Chat V2.' });
  }
});

app.get('/api/followme/chat-v2/session/:session_id/messages', async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();
    await cleanupExpiredFollowMeChatV2Attachments();

    const sessionId = Number(req.params.session_id || 0);
    const after = Number(req.query.after || 0);

    if (!sessionId) return res.status(400).json({ success:false, error:'Sessione mancante.' });

    const s = await pool.query(
      `SELECT id, project_id, status FROM followme_chat_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );

    if (!s.rows.length) return res.status(404).json({ success:false, error:'Sessione non trovata.' });

    const messages = await pool.query(
      `SELECT id, sender, message, created_at
       FROM followme_chat_messages
       WHERE session_id = $1
         AND id > $2
       ORDER BY id ASC
       LIMIT 100`,
      [sessionId, after]
    );

    return res.json({
      success:true,
      session_status:s.rows[0].status,
      messages:messages.rows
    });
  } catch (err) {
    console.error('followme chat-v2 messages error:', err);
    return res.status(500).json({ success:false, error:'Errore lettura messaggi Chat V2.' });
  }
});

app.post('/api/followme/chat-v2/session/:session_id/message', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.body?.sender || '') === 'owner' ? 'owner' : 'visitor';
    const message = String(req.body?.message || '').trim();

    if (!sessionId || !message) {
      return res.status(400).json({ success:false, error:'Messaggio mancante.' });
    }

    const q = await pool.query(
      `SELECT id, project_id, status, is_blocked, uploads_enabled
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!q.rows.length) return res.status(404).json({ success:false, error:'Sessione non trovata.' });

    const session = q.rows[0];

    if (session.status !== 'open') {
      return res.status(409).json({ success:false, closed:true, error:'Chat chiusa.' });
    }

    /*
      FOLLOWME_CHAT_V2_USER_EXTRA_UPLOAD_PERMISSION_20260528
      Admin/owner può sempre inviare allegati.
      Visitor può inviare allegati solo quando admin ha attivato Extra sulla sua sessione.
    */
    if (sender === 'visitor' && session.is_blocked === true) {
      return res.status(403).json({ success:false, blocked:true, error:'Servizio momentaneamente non disponibile. Riprova più tardi.' });
    }

    if (sender === 'visitor' && session.is_blocked === true) {
      return res.status(403).json({ success:false, blocked:true, error:'Servizio momentaneamente non disponibile. Riprova più tardi.' });
    }

    /* followme-chat-v2-visitor-json-attachment-extra-guard-20260528
       Blocca posizione/allegati JSON lato utente quando Extra non è attivo.
       L'admin resta libero; il visitatore dipende da uploads_enabled.
    */
    if (sender === 'visitor') {
      let maybeAttachmentV2 = null;
      try {
        maybeAttachmentV2 = JSON.parse(String(message || ''));
      } catch (e) {}

      if (
        maybeAttachmentV2 &&
        maybeAttachmentV2.__followme_attachment_v2 === true &&
        session.uploads_enabled !== true
      ) {
        return res.status(403).json({
          success:false,
          uploads_enabled:false,
          error:'Funzioni Extra non abilitate dal proprietario.'
        });
      }
    }

    const inserted = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, sender, message, created_at`,
      [session.id, session.project_id, sender, message]
    );

    await pool.query(`UPDATE followme_chat_sessions SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`, [session.id]);

    return res.json({
      success:true,
      message:inserted.rows[0]
    });
  } catch (err) {
    console.error('followme chat-v2 post message error:', err);
    return res.status(500).json({ success:false, error:'Errore invio messaggio Chat V2.' });
  }
});





async function cleanupExpiredFollowMeChatV2Attachments() {
  try {
    const path = require('path');
    const fs = require('fs');

    const q = await pool.query(
      `SELECT id, message
       FROM followme_chat_messages
       WHERE message LIKE '%__followme_attachment_v2%'
       ORDER BY id ASC
       LIMIT 300`
    );

    const now = Date.now();
    const toDelete = [];

    for (const row of q.rows) {
      let payload = null;

      try {
        payload = JSON.parse(String(row.message || ''));
      } catch (e) {
        continue;
      }

      if (!payload || payload.__followme_attachment_v2 !== true) continue;

      const expiresAt = payload.expires_at ? Date.parse(payload.expires_at) : 0;
      const listenCount = Number(payload.listen_count || 0);
      const maxListens = Number(payload.max_listens || 0);
      const expiredByTime = !!expiresAt && expiresAt <= now;
      const expiredByListens = !!maxListens && listenCount >= maxListens;

      if (!expiredByTime && !expiredByListens) continue;

      const url = String(payload.url || '');

      /*
        Sicurezza: cancelliamo solo file dentro la cartella pubblica prevista.
      */
      if (url.startsWith('/uploads/followme-chat-v2/')) {
        const filename = path.basename(url);
        const fullPath = path.join(__dirname, 'public', 'uploads', 'followme-chat-v2', filename);

        try {
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch (e) {
          console.error('followme chat-v2 attachment unlink error:', e.message || e);
        }
      }

      toDelete.push(Number(row.id));
    }

    if (toDelete.length) {
      await pool.query(
        `DELETE FROM followme_chat_messages
         WHERE id = ANY($1::int[])`,
        [toDelete]
      );
    }

    return { success:true, deleted:toDelete.length };
  } catch (err) {
    console.error('cleanupExpiredFollowMeChatV2Attachments error:', err);
    return { success:false, deleted:0, error:String(err.message || err) };
  }
}

function startFollowMeChatV2AttachmentCleanupOnce() {
  if (global.__followmeChatV2AttachmentCleanupStarted) return;
  global.__followmeChatV2AttachmentCleanupStarted = true;

  setInterval(function(){
    cleanupExpiredFollowMeChatV2Attachments().catch(function(err){
      console.error('followme chat-v2 cleanup interval error:', err);
    });
  }, 30000);
}

startFollowMeChatV2AttachmentCleanupOnce();






/* ============================================================
   FOLLOWME CHAT V2 VOICE TEMPORARY 20260527
   Vocale Admin: max 20s lato client, scadenza 60s oppure 2 ascolti.
   ============================================================ */

async function registerFollowMeChatV2VoiceListen(messageId) {
  const path = require('path');
  const fs = require('fs');

  const q = await pool.query(
    `SELECT id, message
     FROM followme_chat_messages
     WHERE id = $1
     LIMIT 1`,
    [messageId]
  );

  if (!q.rows.length) {
    return { success:false, gone:true, error:'Messaggio non trovato.' };
  }

  let payload = null;
  try {
    payload = JSON.parse(String(q.rows[0].message || ''));
  } catch (e) {
    return { success:false, error:'Payload non valido.' };
  }

  if (!payload || payload.__followme_attachment_v2 !== true || payload.kind !== 'voice') {
    return { success:false, error:'Non è un vocale temporaneo.' };
  }

  const now = Date.now();
  const expiresAt = payload.expires_at ? Date.parse(payload.expires_at) : 0;
  const currentCount = Number(payload.listen_count || 0);
  const maxListens = Number(payload.max_listens || 2);

  if (expiresAt && expiresAt <= now) {
    await cleanupExpiredFollowMeChatV2Attachments();
    return { success:false, gone:true, expired:true, error:'Vocale scaduto.' };
  }

  const nextCount = currentCount + 1;
  payload.listen_count = nextCount;
  payload.last_listened_at = new Date().toISOString();

  if (nextCount >= maxListens) {
    const url = String(payload.url || '');

    if (url.startsWith('/uploads/followme-chat-v2/')) {
      const filename = path.basename(url);
      const fullPath = path.join(__dirname, 'public', 'uploads', 'followme-chat-v2', filename);

      try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (e) {
        console.error('followme chat-v2 voice unlink error:', e.message || e);
      }
    }

    await pool.query(
      `DELETE FROM followme_chat_messages WHERE id = $1`,
      [messageId]
    );

    return {
      success:true,
      deleted:true,
      listen_count:nextCount,
      max_listens:maxListens
    };
  }

  await pool.query(
    `UPDATE followme_chat_messages
     SET message = $2
     WHERE id = $1`,
    [messageId, JSON.stringify(payload)]
  );

  return {
    success:true,
    deleted:false,
    listen_count:nextCount,
    max_listens:maxListens,
    payload
  };
}

app.post('/api/followme/chat-v2/message/:message_id/listen', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const messageId = Number(req.params.message_id || 0);
    if (!messageId) {
      return res.status(400).json({ success:false, error:'Messaggio mancante.' });
    }

    const result = await registerFollowMeChatV2VoiceListen(messageId);

    if (!result.success && result.gone) {
      return res.status(410).json(result);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('followme chat-v2 listen register error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore registrazione ascolto.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


/* ============================================================
   FOLLOWME CHAT V2 ADMIN RAW BINARY ATTACHMENTS 20260527
   Upload binario diretto: evita base64/JSON e riduce errori 413 su iPhone.
   ============================================================ */
app.post('/api/followme/chat-v2/session/:session_id/attachment-raw', express.raw({
  type: '*/*',
  limit: '80mb'
}), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.query.sender || req.headers['x-followme-sender'] || 'owner') === 'owner' ? 'owner' : 'visitor';

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    /*
      Fase attuale: allegati binari solo da Admin.
    */
const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    if (!buffer.length) {
      return res.status(400).json({ success:false, error:'File vuoto o mancante.' });
    }

    const maxBytes = 55 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(413).json({ success:false, error:'File troppo grande. Limite 55 MB.' });
    }

    const kind = String(req.query.kind || req.headers['x-followme-kind'] || 'file').trim().toLowerCase();
    const originalName = String(req.query.filename || req.headers['x-followme-filename'] || 'allegato').trim();
    const mime = String(req.headers['content-type'] || req.query.mime || 'application/octet-stream').split(';')[0].trim();
    const label = String(req.query.label || originalName || 'Allegato').trim();

    const sessionRes = await pool.query(
      `SELECT id, project_id, status, is_blocked, uploads_enabled
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const session = sessionRes.rows[0];

    if (session.status !== 'open') {
      return res.status(409).json({ success:false, closed:true, error:'Chat chiusa.' });
    }

    if (sender === 'visitor' && session.is_blocked === true) {
      return res.status(403).json({
        success:false,
        blocked:true,
        error:'Servizio momentaneamente non disponibile. Riprova più tardi.'
      });
    }

    if (sender === 'visitor' && session.uploads_enabled !== true) {
      return res.status(403).json({
        success:false,
        uploads_enabled:false,
        error:'Extra non abilitato dal proprietario.'
      });
    }

    /*
      FOLLOWME_CHAT_V2_USER_EXTRA_UPLOAD_PERMISSION_20260528
      Admin/owner può sempre inviare allegati.
      Visitor può inviare allegati solo quando admin ha attivato Extra sulla sua sessione.
    */
    if (sender === 'visitor' && session.is_blocked === true) {
      return res.status(403).json({ success:false, blocked:true, error:'Servizio momentaneamente non disponibile. Riprova più tardi.' });
    }

    if (sender === 'visitor' && session.uploads_enabled !== true) {
      return res.status(403).json({
        success:false,
        uploads_enabled:false,
        error:'Caricamento extra non abilitato per questo utente.'
      });
    }

    const path = require('path');
    const fs = require('fs');

    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'text/plain': '.txt'
    };

    const safeOriginal = originalName
      .replace(/[^\w.\-àèéìòùÀÈÉÌÒÙ ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 90) || 'allegato';

    const currentExt = path.extname(safeOriginal);
    const ext = currentExt || extByMime[mime] || '';
    const base = path.basename(safeOriginal, currentExt).replace(/[^\w.\-]+/g, '_') || 'allegato';

    const storedName = `${Date.now()}_${Math.random().toString(16).slice(2,8)}_${base}${ext}`;
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat-v2');

    fs.mkdirSync(uploadDir, { recursive:true });

    const fullPath = path.join(uploadDir, storedName);
    fs.writeFileSync(fullPath, buffer);

    // FOLLOWME_VOICE_PERSISTENT_DISK_VERIFY_FINAL_20260529
    if (typeof followMeVoiceAssertWrittenPersistentFinal20260529 === 'function') {
      followMeVoiceAssertWrittenPersistentFinal20260529(fullPath, Math.min(buffer.length, 1));
    }

    const publicUrl = `/uploads/followme-chat-v2/${storedName}`;

    const isVoice = kind === 'voice';
    /*
      Regola corretta 20260528:
      Gli allegati restano salvati per admin.
      Lato utente vengono solo NASCOSTI dopo 600 secondi.
      La cancellazione fisica avviene solo al reset admin.
    */
    const ttlSeconds = 600;

    const payload = {
      __followme_attachment_v2: true,
      temporary: true,
      ttl_seconds: ttlSeconds,
      kind,
      sender,
      url: publicUrl,
      filename: safeOriginal,
      mime,
      label,
      size_bytes: buffer.length,
      listen_count: isVoice ? 0 : undefined,
      max_listens: isVoice ? 2 : undefined,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString()
    };

    const inserted = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, sender, message, created_at`,
      [session.id, session.project_id, sender, JSON.stringify(payload)]
    );

    await pool.query(
      `UPDATE followme_chat_sessions SET updated_at = NOW(), last_seen_at = NOW() WHERE id = $1`,
      [session.id]
    );
    /* Nessun cleanup automatico: gli allegati si eliminano solo al reset admin. */

    return res.json({
      success:true,
      message:inserted.rows[0],
      attachment:payload
    });
  } catch (err) {
    console.error('followme chat-v2 raw attachment error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore invio allegato binario Chat V2.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


/* ============================================================
   FOLLOWME CHAT V2 ADMIN ATTACHMENTS 20260527
   Allegati inviati da Admin verso utente.
   ============================================================ */
app.post('/api/followme/chat-v2/session/:session_id/attachment', express.json({ limit:'28mb' }), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const sessionId = Number(req.params.session_id || 0);
    const sender = String(req.body?.sender || '') === 'owner' ? 'owner' : 'visitor';

    if (!sessionId) {
      return res.status(400).json({ success:false, error:'Sessione mancante.' });
    }

    const kind = String(req.body?.kind || 'file').trim().toLowerCase();
    const dataUrl = String(req.body?.data_url || '');
    const originalName = String(req.body?.filename || 'allegato').trim();
    const mime = String(req.body?.mime || '').trim();
    const label = String(req.body?.label || originalName || 'Allegato').trim();

    if (!dataUrl || !/^data:[^;]+;base64,/.test(dataUrl)) {
      return res.status(400).json({ success:false, error:'File non valido.' });
    }

    const sessionRes = await pool.query(
      `SELECT id, project_id, status, is_blocked, uploads_enabled
       FROM followme_chat_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRes.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata.' });
    }

    const session = sessionRes.rows[0];

    if (session.status !== 'open') {
      return res.status(409).json({ success:false, closed:true, error:'Chat chiusa.' });
    }

    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      return res.status(400).json({ success:false, error:'Formato file non valido.' });
    }

    const realMime = mime || m[1];
    const buffer = Buffer.from(m[2], 'base64');

    const maxBytes = 20 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return res.status(413).json({ success:false, error:'File troppo grande. Limite 20 MB.' });
    }

    const path = require('path');
    const fs = require('fs');

    const extByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/heic': '.heic',
      'image/heif': '.heif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'application/pdf': '.pdf',
      'text/plain': '.txt'
    };

    const safeOriginal = originalName
      .replace(/[^\w.\-àèéìòùÀÈÉÌÒÙ ]+/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 90) || 'allegato';

    const currentExt = path.extname(safeOriginal);
    const ext = currentExt || extByMime[realMime] || '';
    const base = path.basename(safeOriginal, currentExt).replace(/[^\w.\-]+/g, '_') || 'allegato';

    const storedName = `${Date.now()}_${Math.random().toString(16).slice(2,8)}_${base}${ext}`;
    const uploadDir = path.join(__dirname, 'public', 'uploads', 'followme-chat-v2');

    fs.mkdirSync(uploadDir, { recursive:true });

    const fullPath = path.join(uploadDir, storedName);
    fs.writeFileSync(fullPath, buffer);

    // FOLLOWME_VOICE_PERSISTENT_DISK_VERIFY_FINAL_20260529
    if (typeof followMeVoiceAssertWrittenPersistentFinal20260529 === 'function') {
      followMeVoiceAssertWrittenPersistentFinal20260529(fullPath, Math.min(buffer.length, 1));
    }

    const publicUrl = `/uploads/followme-chat-v2/${storedName}`;

    const payload = {
      __followme_attachment_v2: true,
      temporary: true,
      ttl_seconds: 120,
      kind,
      sender,
      url: publicUrl,
      filename: safeOriginal,
      mime: realMime,
      label,
      size_bytes: buffer.length,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 120000).toISOString()
    };

    const inserted = await pool.query(
      `INSERT INTO followme_chat_messages
       (session_id, project_id, sender, message, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id, sender, message, created_at`,
      [session.id, session.project_id, sender, JSON.stringify(payload)]
    );

    await pool.query(
      `UPDATE followme_chat_sessions SET updated_at = NOW(), last_seen_at = NOW() WHERE id = $1`,
      [session.id]
    );

    /*
      Cleanup mirato: prova a cancellare poco dopo la scadenza.
      Il cleanup globale ogni 30s copre comunque riavvii/ritardi.
    */
    /* Nessun cleanup automatico: gli allegati si eliminano solo al reset admin. */

    return res.json({
      success:true,
      message:inserted.rows[0],
      attachment:payload
    });
  } catch (err) {
    console.error('followme chat-v2 admin attachment error:', err);
    return res.status(500).json({
      success:false,
      error:'Errore invio allegato Chat V2.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});


app.post('/api/followme/chat-v2/session/:session_id/settings', express.json(), async (req, res) => {
  try {
    await ensureFollowMeChatV2Runtime();

    const sessionId = Number(req.params.session_id || 0);
    if (!sessionId) return res.status(400).json({ success:false, error:'Sessione mancante.' });

    const hasUploads = typeof req.body?.uploads_enabled === 'boolean';
    const hasBlocked = typeof req.body?.is_blocked === 'boolean';

    if (!hasUploads && !hasBlocked) {
      return res.status(400).json({ success:false, error:'Nessuna impostazione valida.' });
    }

    const current = await pool.query(
      `SELECT id, project_id, uploads_enabled, is_blocked
       FROM followme_chat_sessions
       WHERE id = $1 AND status = 'open'
       LIMIT 1`,
      [sessionId]
    );

    if (!current.rows.length) {
      return res.status(404).json({ success:false, error:'Sessione non trovata o chiusa.' });
    }

    const row = current.rows[0];
    const nextUploads = hasUploads ? req.body.uploads_enabled : !!row.uploads_enabled;
    const nextBlocked = hasBlocked ? req.body.is_blocked : !!row.is_blocked;

    const updated = await pool.query(
      `UPDATE followme_chat_sessions
       SET uploads_enabled = $2,
           is_blocked = $3,
           blocked_at = CASE WHEN $3 = TRUE THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, visitor_label, display_name, uploads_enabled, is_blocked, blocked_at, status, updated_at`,
      [sessionId, nextUploads, nextBlocked]
    );

    return res.json({
      success:true,
      session:updated.rows[0]
    });
  } catch (err) {
    console.error('followme chat-v2 settings error:', err);
    return res.status(500).json({ success:false, error:'Errore impostazioni Chat V2.' });
  }
});


// FOLLOWME_CHAT_V2_NEUTRAL_BLOCK_TEXT_20260528
