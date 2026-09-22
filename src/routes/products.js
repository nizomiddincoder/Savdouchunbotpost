const router = require('express').Router();
const { q, getSettings } = require('../db');
const { middleware } = require('../auth');

const anyAuth = middleware();
const adminOnly = middleware('admin');

const NORM_SQL = `lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))`;

router.get('/', anyAuth, async (req, res, next) => {
  try {
    const st = await getSettings();
    const rate = Number(st.usd_rate);
    const { rows } = await q(`
      SELECT p.id, p.name, p.price, p.currency, p.created_at,
             p.image IS NOT NULL AS has_image, s.name AS created_by
      FROM products p LEFT JOIN sellers s ON s.id = p.created_by
      WHERE p.is_deleted = false
      ORDER BY p.created_at DESC`);
    const products = rows.map(r => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      currency: r.currency,
      price_uzs: r.currency === 'USD' ? Math.round(Number(r.price) * rate) : Math.round(Number(r.price)),
      has_image: r.has_image,
      created_by: r.created_by
    }));
    res.json({ products, usd_rate: rate, shop_name: st.shop_name, shop_phone: st.shop_phone });
  } catch (e) { next(e); }
});

// Rasm brauzer <img> tegida ochiladi, auth talab qilmaydi
router.get('/:id/image', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT image, image_mime FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0] || !rows[0].image) return res.status(404).end();
    res.set('Content-Type', rows[0].image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].image);
  } catch (e) { next(e); }
});

async function checkDup(name, excludeId) {
  const norm = String(name).trim();
  const { rows } = await q(`SELECT id FROM products WHERE is_deleted = false AND ${NORM_SQL} = lower($1) AND id <> COALESCE($2, 0)`, [norm, excludeId || null]);
  if (rows.length) throw new Error('Bunday nomli mahsulot allaqachon mavjud');
}

// Sotuvchi ham, admin ham yangi mahsulot qo'shadi
router.post('/', anyAuth, async (req, res, next) => {
  try {
    const { name, price, currency, image, image_mime } = req.body;
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Mahsulot nomi kerak');
    if (!(Number(price) > 0)) throw new Error('Narx noto\'g\'ri');
    if (!['UZS', 'USD'].includes(currency)) throw new Error('Valyuta UZS yoki USD bo\'lishi kerak');
    await checkDup(clean);
    const img = image ? Buffer.from(String(image).split(',').pop(), 'base64') : null;
    const createdBy = req.user.role === 'seller' ? req.user.id : null;
    const { rows } = await q(
      `INSERT INTO products (name, price, currency, image, image_mime, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [clean, price, currency, img, image ? (image_mime || 'image/jpeg') : null, createdBy]);
    res.json({ id: rows[0].id });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Bunday nomli mahsulot allaqachon mavjud' });
    next(e);
  }
});

// Faqat admin tahrirlaydi
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const { name, price, currency, image, image_mime } = req.body;
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Mahsulot nomi kerak');
    if (!(Number(price) > 0)) throw new Error('Narx noto\'g\'ri');
    if (!['UZS', 'USD'].includes(currency)) throw new Error('Valyuta UZS yoki USD bo\'lishi kerak');
    await checkDup(clean, req.params.id);
    const img = image ? Buffer.from(String(image).split(',').pop(), 'base64') : null;
    await q(`UPDATE products SET name = $1, price = $2, currency = $3,
             image = COALESCE($4, image), image_mime = CASE WHEN $4 IS NULL THEN image_mime ELSE $5 END
             WHERE id = $6 AND is_deleted = false`,
      [clean, price, currency, img, image ? (image_mime || 'image/jpeg') : null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Faqat admin o'chiradi
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    await q('UPDATE products SET is_deleted = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
