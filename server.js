// SECURITY PATCH 1
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const pool = require('./db');



const app = express();

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:test@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}


const ADMIN_COOKIE_NAME = 'admin_session';

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
  const crypto = require('crypto');
  const sig = crypto.createHmac('sha256', getAdminSecret()).update(value).digest('hex');
  return `${value}.${sig}`;
}

function verifyAdminSession(token) {
  const crypto = require('crypto');
  if (!token || !token.includes('.')) return false;
  const idx = token.lastIndexOf('.');
  const value = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', getAdminSecret()).update(value).digest('hex');
  return sig === expected && value === 'admin-authenticated';
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
  const crypto = require('crypto');
  return crypto.randomBytes(18).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

function generateCode() {
  const crypto = require('crypto');
  return 'AMC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
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

app.use(cors());
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
    const { code, plate, subscription } = req.body || {};
    if (!code || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return res.status(400).json({ success: false, error: 'Dati subscription mancanti.' });
    }

    const cleanCode = String(code).trim().toUpperCase();
    const cleanPlate = plate || null;

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

    const isFirstDevice = existing.rows.length === 0;

    await pool.query(
      `INSERT INTO push_subscriptions
       (code, plate, endpoint, p256dh, auth, user_agent, updated_at, is_primary, receive_admin_alerts, receive_passenger_alerts, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, TRUE, TRUE)
       ON CONFLICT (endpoint)
       DO UPDATE SET
         code = EXCLUDED.code,
         plate = EXCLUDED.plate,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = NOW()`,
      [
        cleanCode,
        cleanPlate,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        req.headers['user-agent'] || null,
        isFirstDevice,
        isFirstDevice
      ]
    );

    return res.json({ success: true, is_primary: isFirstDevice });
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
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore unsubscribe.' });
  }
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

app.post('/api/debug-owner-quick-access', express.json(), (req, res) => {
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


app.get('/api/debug-owner-quick-access-ping', (req, res) => {
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


app.get('/api/debug-owner-quick-access', (req, res) => {
  return res.json({ success: true, debug: ownerQuickAccessDebug });
});


app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/create-code', async (req, res) => {
  try {
    const { plan_type } = req.body || {};
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
      'INSERT INTO sticker_codes (code, public_id, status, plan_type, expires_at, owner_access_token, qr_url) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [code, publicId, 'new', selectedPlan, expiresAt, ownerAccessToken, qrUrl]
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
      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Questo accesso è stato bloccato per uso improprio del servizio. I dati tecnici dell’evento sono stati registrati e potranno essere segnalati alle autorità competenti.'
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
      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Questo accesso è stato bloccato per uso improprio del servizio. I dati tecnici dell’evento sono stati registrati e potranno essere segnalati alle autorità competenti.'
      });
    }

    await pool.query(
      `INSERT INTO contact_message_logs
       (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, latitude, longitude, maps_url, ip_address, ip_city, ip_region, ip_country, user_agent, sender_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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

    try {
      if (vapidPublicKey && vapidPrivateKey && code) {
        const subs = await pool.query(
          `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE code = $1`,
          [String(code).trim().toUpperCase()]
        );

        const title = 'Nuova segnalazione ricevuta';
        const body = plate
          ? `Controlla il nuovo messaggio per ${plate}`
          : 'Apri la Web App per leggere il nuovo messaggio.';

        const targetUrl = `/owner-simple.html?code=${encodeURIComponent(String(code).trim().toUpperCase())}&plate=${encodeURIComponent(String(plate || '').trim())}`;

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
            unreadCount
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
             reason = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, code, plate, block_type, block_value, reason, is_active, updated_at`,
        [cleanCode, cleanPlate, block_type, cleanValue, cleanReason, existing.rows[0].id]
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
    const { code, plate } = req.body || {};
    if (!code || !plate) {
      return res.status(400).json({ success: false, error: 'Code o plate mancanti.' });
    }

    const result = await pool.query(
      `UPDATE sticker_codes
       SET owner_last_seen = NOW()
       WHERE code = $1 AND plate = $2
       RETURNING code, plate, owner_last_seen`,
      [code, plate]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Record non trovato.' });
    }

    await pool.query(
      `UPDATE broadcast_notification_recipients
       SET status = 'opened',
           opened_at = COALESCE(opened_at, NOW())
       WHERE id = (
         SELECT id
         FROM broadcast_notification_recipients
         WHERE code = $1
           AND plate = $2
           AND status = 'sent'
         ORDER BY id DESC
         LIMIT 1
       )`,
      [code, plate]
    );

    return res.json({ success: true, data: result.rows[0] });
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
       ORDER BY created_at DESC
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
    const { code, plate, id } = req.body || {};
    if (!code || !plate || !id) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code
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
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND code = $2`,
      [id, code]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento messaggio.' });
  }
});

app.post('/api/owner-messages/read-many', async (req, res) => {
  try {
    const { code, plate, ids } = req.body || {};
    if (!code || !plate || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code
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
       SET read_at = COALESCE(read_at, NOW())
       WHERE code = $1
         AND id = ANY($2::int[])`,
      [code, ids]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore aggiornamento multiplo.' });
  }
});

app.post('/api/owner-messages/delete', async (req, res) => {
  try {
    const { code, plate, id } = req.body || {};
    if (!code || !plate || !id) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code
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
       SET deleted_at = NOW()
       WHERE id = $1 AND code = $2`,
      [id, code]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione messaggio.' });
  }
});

app.post('/api/owner-messages/delete-many', async (req, res) => {
  try {
    const { code, plate, ids } = req.body || {};
    if (!code || !plate || !Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'Dati mancanti.' });
    }

    const owner = await pool.query(
      `SELECT code
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
       SET deleted_at = NOW()
       WHERE code = $1
         AND id = ANY($2::int[])`,
      [code, ids]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore eliminazione multipla.' });
  }
});


app.post('/api/owner-services/test-push', async (req, res) => {
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
    const targetUrl = `/owner-dashboard.html?code=${encodeURIComponent(cleanCode)}&plate=${encodeURIComponent(cleanPlate)}&service=${encodeURIComponent(serviceType)}&testPush=1`;

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
              sub.endpoint.includes('apple') ? 'apple-webpush-test' : 'fcm-webpush-test',
              'sent',
              null
            ]
          );
        } catch (e) {}
      } catch (pushErr) {
        console.error('owner-services/test-push error:', pushErr.statusCode || '', pushErr.body || pushErr.message || pushErr);

        try {
          await pool.query(
            `INSERT INTO push_delivery_logs (code, plate, endpoint, channel, status, error_text, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
            [
              cleanCode,
              cleanPlate,
              sub.endpoint,
              sub.endpoint.includes('apple') ? 'apple-webpush-test' : 'fcm-webpush-test',
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
    console.error('owner-services/test-push fatal error:', err);
    return res.status(500).json({ success: false, error: 'Errore invio push test.' });
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

    let viewsCount = 0;
    let messagesCount = 0;
    let locationsCount = 0;
    let lastActivity = null;
    let events = [];

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
         LIMIT 12`,
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
        qr_url: row.qr_url,
        public_id: row.public_id,
        plan_type: row.plan_type,
        expires_at: row.expires_at,
        activated_at: row.activated_at,
        viewsCount,
        messagesCount,
        locationsCount,
        lastActivity,
        events
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Errore di comunicazione con il server.' });
  }
});



app.get('/api/admin/list-stickers', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toUpperCase();

    let result;
    if (q) {
      result = await pool.query(
        `SELECT
           code, public_id, plate, brand, vehicle_model, color, phone,
           status, qr_url, plan_type, expires_at, activated_at,
           invite_sent_to, invite_channel, invite_target, invite_variant, invite_sent_at
         FROM sticker_codes
         WHERE UPPER(COALESCE(code,'')) LIKE $1
            OR UPPER(COALESCE(public_id,'')) LIKE $1
            OR UPPER(REPLACE(COALESCE(plate,''), ' ', '')) LIKE REPLACE($1, ' ', '')
         ORDER BY activated_at DESC NULLS LAST, code DESC`,
        [`%${q}%`]
      );
    } else {
      result = await pool.query(
        `SELECT
           code, public_id, plate, brand, vehicle_model, color, phone,
           status, qr_url, plan_type, expires_at, activated_at,
           invite_sent_to, invite_channel, invite_target, invite_variant, invite_sent_at
         FROM sticker_codes
         ORDER BY activated_at DESC NULLS LAST, code DESC
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
      code, brand, plate, vehicle_model, color, phone,
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
           phone = $6,
           plan_type = $7,
           expires_at = $8
       WHERE code = $1`,
      [
        cleanCode,
        brand || null,
        plate || null,
        vehicle_model || null,
        color || null,
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
      ${whereClause ? whereClause + " AND " : "WHERE "} ps.is_active = TRUE AND ps.receive_admin_alerts = TRUE
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
      const resolvedOwnerUrl = (!cleanUrl || cleanUrl === '/owner-login.html') ? directOwnerUrl : cleanUrl;

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




app.get('/owner-access/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();

    const result = await pool.query(
      `SELECT code, plate
       FROM sticker_codes
       WHERE owner_access_token = $1
       LIMIT 1`,
      [token]
    );

    if (!result.rows.length) {
      return res.status(404).send('Accesso non valido.');
    }

    const row = result.rows[0];
    return res.redirect(302, `/owner-simple.html?code=${encodeURIComponent(row.code)}&plate=${encodeURIComponent(row.plate || '')}`);
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

    return res.sendFile(require('path').join(__dirname, 'public', 'contact.html'));
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

app.post('/api/admin/find-code', async (req, res) => {
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

app.post('/api/admin/scan-stats', async (req, res) => {
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

app.post('/api/admin/reactivate-code', async (req, res) => {
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

    console.log('Tabella sticker_codes pronta');
    console.log('Tabella qr_scans pronta');
    console.log('Tabella abuse_blocks pronta');
    console.log('Tabella push_delivery_logs pronta');
    console.log('Tabella vehicle_service_data pronta');
  } catch (err) {
    console.error('Errore init DB:', err);
    throw err;
  }
}

async function startServer() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`Server attivo su ${BASE_URL}`);
    });
  } catch (err) {
    console.error('Errore avvio server:', err);
  }
}

startServer();
