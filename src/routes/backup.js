const express = require('express');
const router = express.Router();
const { q, pool } = require('../db');
const { middleware } = require('../auth');

const adminOnly = middleware('admin');

// Backup fayllari katta bo'ladi (rasmlar ham bazada) — shuning uchun alohida limit
router.use(express.json({ limit: '120mb' }));

/* Har bir jadval uchun aniq ustunlar. Import ham aynan shu tartibda yozadi,
   shuning uchun backup faylida ortiqcha/yetishmayotgan ustun muammo bo'lmaydi. */
const TABLES = [
  { name: 'sellers', columns: ['id', 'name', 'pin_hash', 'is_active', 'created_at', 'phone', 'pin_view'] },
  { name: 'products', columns: ['id', 'name', 'price', 'currency', 'image', 'image_mime', 'created_by', 'created_at', 'is_deleted'], binary: ['image'] },
  { name: 'customers', columns: ['id', 'name', 'phone', 'first_seller_id', 'created_at', 'debt_uzs'] },
  { name: 'sales', columns: ['id', 'seller_id', 'customer_id', 'customer_name', 'total_uzs', 'usd_rate', 'is_cancelled', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'reprint_count', 'created_at', 'payment_method', 'old_debt_uzs', 'receipt_script'] },
  { name: 'sale_items', columns: ['id', 'sale_id', 'product_id', 'product_name', 'qty', 'price_orig', 'currency', 'price_uzs', 'line_total_uzs', 'base_price_uzs'] },
  { name: 'customer_payments', columns: ['id', 'customer_id', 'amount_uzs', 'kind', 'note', 'by_name', 'debt_after_uzs', 'created_at'] },
  { name: 'settings', columns: ['id', 'shop_name', 'shop_phone', 'usd_rate', 'jwt_secret', 'admin_password_hash', 'phone_1', 'phone_2', 'receipt_title', 'printer_mode', 'printer_host', 'printer_port', 'printer_share', 'printer_name'], single: true }
];

const DATA_TABLES = TABLES.filter(t => !t.single);

async function insertRows(client, t, rows) {
  for (const raw of rows) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const params = [];
    const vals = t.columns.map(c => {
      let v = row[c];
      // settings.id majburiy — eski fayllarda bo'lmasa 1 deb olinadi
      if (v === undefined && t.single && c === 'id') v = 1;
      if (v === undefined) return 'DEFAULT';
      if (t.binary && t.binary.includes(c)) v = v ? Buffer.from(String(v), 'base64') : null;
      params.push(v);
      return '$' + params.length;
    });
    await client.query(
      `INSERT INTO ${t.name} (${t.columns.join(', ')}) VALUES (${vals.join(', ')})`, params);
  }
}

/* ================= EXPORT ================= */
router.get('/export', adminOnly, async (req, res, next) => {
  try {
    const tables = {};
    for (const t of TABLES) {
      const { rows } = await q(`SELECT ${t.columns.map(c => '"' + c + '"').join(', ')} FROM ${t.name} ORDER BY id`);
      tables[t.name] = rows.map(row => {
        const o = {};
        for (const c of t.columns) {
          let v = row[c];
          if (v instanceof Date) v = v.toISOString();
          else if (t.binary && t.binary.includes(c)) v = v ? Buffer.from(v).toString('base64') : null;
          o[c] = v === undefined ? null : v;
        }
        return o;
      });
    }
    const counts = {};
    for (const name of Object.keys(tables)) counts[name] = tables[name].length;
    const payload = {
      app: 'savdo',
      version: 1,
      exported_at: new Date().toISOString(),
      counts,
      tables
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="savdo-backup-' + stamp + '.json"');
    res.send(JSON.stringify(payload));
  } catch (e) { next(e); }
});

/* ================= IMPORT (bazani almashtirish) ================= */
router.post('/import', adminOnly, async (req, res, next) => {
  // Frontend to'g'ridan-to'g'ri JSON yuboradi; tayyor fayl { backup: {...} } ichida ham bo'lishi mumkin
  const data = req.body && typeof req.body === 'object' && req.body.backup ? req.body.backup : req.body;
  if (!data || data.app !== 'savdo' || !data.tables || typeof data.tables !== 'object') {
    return res.status(400).json({ error: 'Bu savdo backup fayli emas. Dastur orqali yuklab olingan .json faylni tanlang.' });
  }
  for (const t of TABLES) {
    const rows = data.tables[t.name];
    if (rows !== undefined && !Array.isArray(rows)) {
      return res.status(400).json({ error: 'Backup fayli buzilgan: "' + t.name + '" bo\'limi noto\'g\'ri' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Joriy sessiya uzilib qolmasligi uchun eski maxfiy kalitni eslab qolamiz
    const prevSecret = (await client.query('SELECT jwt_secret FROM settings WHERE id = 1')).rows[0];
    const keepSecret = prevSecret ? prevSecret.jwt_secret : null;

    // Barcha ma'lumot jadvallari tozalanadi (tranzaksiya ichida — xato bo'lsa hammasi qaytadi)
    await client.query(
      'TRUNCATE TABLE sale_items, sales, customer_payments, customers, products, sellers RESTART IDENTITY CASCADE');

    const imported = {};
    for (const t of DATA_TABLES) {
      const rows = data.tables[t.name] || [];
      await insertRows(client, t, rows);
      imported[t.name] = rows.length;
    }

    // Sozlamalar: backupda bo'lsa tiklanadi, bo'lmasa hozirgisi qoladi
    const stRows = data.tables.settings || [];
    if (stRows.length) {
      await client.query('DELETE FROM settings');
      await insertRows(client, TABLES.find(t => t.single), stRows);
      imported.settings = stRows.length;
      if (keepSecret) await client.query('UPDATE settings SET jwt_secret = $1 WHERE id = 1', [keepSecret]);
    }
    await client.query('INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    if (!imported.settings) imported.settings = 1;

    // ID'lar to'qnashmasligi uchun ketma-ketliklar tiklanadi
    for (const t of DATA_TABLES) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${t.name}', 'id'),
           coalesce((SELECT max(id) FROM ${t.name}), 0) + 1, false)`);
    }

    await client.query('COMMIT');
    res.json({ ok: true, imported });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23503') {
      return res.status(400).json({ error: 'Backup fayli to\'liq emas yoki buzilgan (bog\'lanish xatosi). Hech narsa o\'zgartirilmadi.' });
    }
    if (e.code === '23505') {
      return res.status(400).json({ error: 'Backup faylida takrorlangan yozuvlar bor. Hech narsa o\'zgartirilmadi.' });
    }
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
