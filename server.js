// SECURITY PATCH 1
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const pool = require('./db');

const app = express();
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
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/create-code', async (req, res) => {
  try {
    const code = 'AMC-' + uuidv4().slice(0, 8).toUpperCase();

    await pool.query(
      'INSERT INTO sticker_codes (code, status) VALUES ($1, $2)',
      [code, 'new']
    );

    res.json({ success: true, code });
  } catch (err) {
    console.error('create-code error:', err);
    res.status(500).json({ success: false, error: 'Errore creazione codice' });
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
    const { code, plate, vehicle_model, phone } = req.body;

    const existing = await pool.query(
      'SELECT * FROM sticker_codes WHERE code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return res.json({ success: false, message: 'Codice non valido' });
    }

    const row = existing.rows[0];

    if (row.status === 'used') {
      return res.json({ success: false, message: 'Codice già utilizzato' });
    }

    const qrUrl = `${BASE_URL}/contact/${encodeURIComponent(code)}`;

    await pool.query(
      `UPDATE sticker_codes
       SET status = $1,
           plate = $2,
           vehicle_model = $3,
           phone = $4,
           qr_url = $5,
           activated_at = NOW()
       WHERE code = $6`,
      ['used', plate, vehicle_model, phone, qrUrl, code]
    );

    res.json({ success: true, qr_url: qrUrl });
  } catch (err) {
    console.error('activate-code error:', err);
    res.status(500).json({ success: false, error: 'Errore attivazione codice' });
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
    const redirectUrl = `/contact.html?phone=${encodeURIComponent(cleanPhone)}&plate=${encodeURIComponent(row.plate || '')}&vehicle=${encodeURIComponent(row.vehicle_model || '')}`;
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
       SET status = 'reactivated',
           plate = NULL,
           vehicle_model = NULL,
           phone = NULL,
           qr_url = NULL,
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
