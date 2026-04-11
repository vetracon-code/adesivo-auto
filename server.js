// SECURITY PATCH 1
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const pool = require('./db');



const app = express();

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

function requireAdmin(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!verifyAdminSession(token)) {
    return res.status(401).json({ success: false, error: 'Non autorizzato.' });
  }
  next();
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


app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

    let expiresAt = null;
    if (selectedPlan === '1week') {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else if (selectedPlan === '1month') {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else if (selectedPlan === '6months') {
      expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    }

    await pool.query(
      'INSERT INTO sticker_codes (code, public_id, status, plan_type, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [code, publicId, 'new', selectedPlan, expiresAt]
    );

    return res.json({
      success: true,
      code,
      public_id: publicId,
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
      latitude, longitude, maps_url
    } = req.body || {};

    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(forwardedFor) ? forwardedFor[0] : (forwardedFor || '').split(',')[0].trim()) ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers['user-agent'] || null;
    const area = await lookupIpArea(ip);

    await pool.query(
      `INSERT INTO contact_message_logs
       (code, plate, brand, vehicle_model, color, reason, message_text, location_shared, latitude, longitude, maps_url, ip_address, ip_city, ip_region, ip_country, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
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
        userAgent
      ]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('log-contact-message error:', err);
    return res.status(500).json({ success: false, error: 'Errore logging messaggio.' });
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
            FALSE AS location_shared
           FROM contact_page_views
           WHERE code = $1)
         UNION ALL
         (SELECT
            COALESCE(reason, 'Invio avviato') AS type,
            created_at AS at,
            COALESCE(ip_city, '') AS ip_city,
            COALESCE(ip_region, '') AS ip_region,
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

    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
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
    console.log('Tabella sticker_codes pronta');
    console.log('Tabella qr_scans pronta');
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
