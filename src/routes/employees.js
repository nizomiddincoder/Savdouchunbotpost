/* Taklif havolasi (ochiq) va xodimning o'z maosh sahifasi endpointlari */
const router = require('express').Router();
const { pool, q, getSettings } = require('../db');
const { sign, middleware, hashPin, checkPin } = require('../auth');

const sellerOnly = middleware('seller');
const TZ = 'Asia/Tashkent';

function genPin() { return String(Math.floor(1000 + Math.random() * 9000)); }
async function uniquePin(client) {
  const { rows } = await client.query('SELECT pin_hash FROM sellers WHERE is_active = true');
  for (let i = 0; i < 400; i++) {
    const p = genPin();
    if (!rows.some(r => checkPin(p, r.pin_hash))) return p;
  }
  throw new Error('PIN yaratib bo\'lmadi, qayta urinib ko\'ring');
}

/* ===== Taklif havolasi ===== */
// Havola haqida ma'lumot (xodim ochganda ko'rsatish uchun) — ochiq
router.get('/invite/:token', async (req, res, next) => {
  try {
    const { rows } = await q(
      `SELECT name, phone, salary_amount, salary_currency, used_by, expires_at < now() AS expired
       FROM invites WHERE token = $1`, [req.params.token]);
    const i = rows[0];
    if (!i) return res.status(404).json({ error: 'Havola topilmadi' });
    if (i.used_by) return res.status(410).json({ error: 'Bu havola allaqachon ishlatilgan' });
    if (i.expired) return res.status(410).json({ error: 'Havola muddati tugagan' });
    const st = await getSettings();
    res.json({ ok: true, name: i.name || '', phone: i.phone || '', shop_name: st.shop_name });
  } catch (e) { next(e); }
});

// Taklifni qabul qilish — xodim akkaunti yaratiladi, PIN beriladi va kiradi
router.post('/invite/:token/accept', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query('SELECT * FROM invites WHERE token = $1 FOR UPDATE', [req.params.token])).rows[0];
    if (!inv) throw new Error('Havola topilmadi');
    if (inv.used_by) throw new Error('Bu havola allaqachon ishlatilgan');
    if (new Date(inv.expires_at) < new Date()) throw new Error('Havola muddati tugagan');
    const name = String(req.body.name || inv.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new Error('Ismingizni kiriting');
    const phone = String(req.body.phone || inv.phone || '').replace(/[^\d+]/g, '');
    if (!/^\+?\d{7,15}$/.test(phone)) throw new Error('Telefon raqamini kiriting (masalan: 901234567)');
    const tg = req.body.tg_chat_id ? String(req.body.tg_chat_id).slice(0, 32) : null;
    const pin = await uniquePin(client);
    const seller = (await client.query(
      `INSERT INTO sellers (name, phone, pin_hash, pin_view, salary_amount, salary_currency, hired_at, tg_chat_id)
       VALUES ($1, $2, $3, $4, $5, $6, (now() AT TIME ZONE '${TZ}')::date, $7) RETURNING id, name`,
      [name, phone, hashPin(pin), pin, inv.salary_amount, inv.salary_currency, tg])).rows[0];
    await client.query('UPDATE invites SET used_by = $1, used_at = now() WHERE id = $2', [seller.id, inv.id]);
    await client.query('COMMIT');
    const token = await sign({ role: 'seller', id: seller.id, name: seller.name });
    res.json({ ok: true, pin, token, me: { role: 'seller', id: seller.id, name: seller.name } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

/* ===== Xodimning o'z maosh sahifasi ===== */
// Telegram chat id ni saqlash (mini app orqali, kirgandan keyin)
router.post('/me/tg', sellerOnly, async (req, res, next) => {
  try {
    const tg = req.body.tg_chat_id ? String(req.body.tg_chat_id).slice(0, 32) : null;
    if (tg) await q('UPDATE sellers SET tg_chat_id = $1 WHERE id = $2', [tg, req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me/salary', sellerOnly, async (req, res, next) => {
  try {
    const s = (await q(`SELECT id, name, phone, salary_amount, salary_currency, to_char(hired_at,'YYYY-MM-DD') AS hired_at, salary_seen_at FROM sellers WHERE id = $1`, [req.user.id])).rows[0];
    if (!s) throw new Error('Xodim topilmadi');
    const txs = (await q(`
      SELECT id, type, amount_uzs, orig_amount, currency, note, created_at,
        to_char((created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD HH24:MI') AS t
      FROM employee_tx WHERE seller_id = $1 ORDER BY id DESC LIMIT 300`, [req.user.id])).rows;
    const bal = Number((await q(`SELECT coalesce(sum(CASE WHEN type='oylik' THEN amount_uzs ELSE -amount_uzs END), 0) AS b FROM employee_tx WHERE seller_id = $1`, [req.user.id])).rows[0].b);
    const sums = (await q(`SELECT
        coalesce(sum(amount_uzs) FILTER (WHERE type='oylik'),0) AS oylik,
        coalesce(sum(amount_uzs) FILTER (WHERE type='avans'),0) AS avans FROM employee_tx WHERE seller_id = $1`, [req.user.id])).rows[0];
    const seenAt = s.salary_seen_at ? new Date(s.salary_seen_at).getTime() : 0;
    const unread = txs.filter(t => new Date(t.created_at).getTime() > seenAt).length;
    const st = await getSettings();
    res.json({
      name: s.name, phone: s.phone || '', hired_at: s.hired_at,
      salary_amount: Number(s.salary_amount), salary_currency: s.salary_currency || 'UZS',
      balance_uzs: bal, total_oylik: Number(sums.oylik), total_avans: Number(sums.avans),
      usd_rate: Number(st.usd_rate), unread,
      txs: txs.map(t => ({ id: t.id, type: t.type, amount_uzs: Number(t.amount_uzs), orig_amount: Number(t.orig_amount), currency: t.currency, note: t.note, t: t.t }))
    });
  } catch (e) { next(e); }
});

// Xabarlarni "o'qildi" deb belgilash
router.post('/me/seen', sellerOnly, async (req, res, next) => {
  try {
    await q('UPDATE sellers SET salary_seen_at = now() WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
