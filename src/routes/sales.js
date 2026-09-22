const router = require('express').Router();
const { pool, q, getSettings } = require('../db');
const { middleware } = require('../auth');
const { broadcast } = require('../ws');
const { notifySale, notifyCancel } = require('../bot');

const anyAuth = middleware();
const adminOnly = middleware('admin');
const TZ = 'Asia/Tashkent';

async function buildReceipt(saleId) {
  const { rows } = await q(`SELECT s.*, sel.name AS seller_name, c.phone AS customer_phone
    FROM sales s JOIN sellers sel ON sel.id = s.seller_id
    LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`, [saleId]);
  const s = rows[0];
  if (!s) throw new Error('Savdo topilmadi');
  const items = (await q('SELECT product_name, qty, price_uzs, line_total_uzs FROM sale_items WHERE sale_id = $1', [saleId])).rows;
  const st = await getSettings();
  const dt = new Date(s.created_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16);
  return {
    receipt_no: s.id,
    shop_name: st.shop_name,
    shop_phone: st.shop_phone,
    datetime_local: dt,
    seller_name: s.seller_name,
    customer_name: s.customer_name,
    customer_phone: s.customer_phone || null,
    payment_method: s.payment_method || 'naqd',
    usd_rate: Number(s.usd_rate) || null,
    items: items.map(i => ({ name: i.product_name, qty: i.qty, price_uzs: Number(i.price_uzs), line_total_uzs: Number(i.line_total_uzs) })),
    total_uzs: Number(s.total_uzs),
    old_debt_uzs: Number(s.old_debt_uzs || 0),
    total_with_debt_uzs: Number(s.old_debt_uzs || 0) + Number(s.total_uzs),
    is_cancelled: s.is_cancelled,
    cancelled_by: s.cancelled_by,
    cancelled_at: s.cancelled_at ? new Date(s.cancelled_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16) : null,
    cancel_reason: s.cancel_reason
  };
}

const PAY_METHODS = ['naqd', 'karta', 'nasiya'];
function cleanPhone(v) {
  const ph = String(v || '').replace(/[^\d+]/g, '');
  if (!ph) return null;
  if (!/^\+?\d{7,15}$/.test(ph)) throw new Error('Telefon raqam noto\'g\'ri (masalan: 901234567 yoki +998901234567)');
  return ph;
}

// Yangi savdo
router.post('/', anyAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'seller') throw new Error('Savdoni faqat sotuvchi amalga oshiradi');
    const { items, customer_name, customer_phone } = req.body;
    const cname = String(customer_name || '').trim().replace(/\s+/g, ' ');
    if (!cname) throw new Error('Xaridor ismini kiriting');
    if (!Array.isArray(items) || !items.length) throw new Error('Savat bo\'sh');
    const pay = PAY_METHODS.includes(req.body.payment_method) ? req.body.payment_method : 'naqd';
    const phone = cleanPhone(customer_phone);
    const st = await getSettings();
    const rate = Number(st.usd_rate);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let c = (await client.query(`SELECT id FROM customers WHERE lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = lower($1)`, [cname])).rows[0];
      if (!c) {
        try {
          c = (await client.query('INSERT INTO customers (name, phone, first_seller_id) VALUES ($1, $2, $3) RETURNING id', [cname, phone, req.user.id])).rows[0];
        } catch (e) {
          // Ikki sotuvchi bir vaqtda bir xil xaridor kiritganda
          if (e.code === '23505') c = (await client.query(`SELECT id FROM customers WHERE lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = lower($1)`, [cname])).rows[0];
          else throw e;
        }
      } else if (phone) {
        // Mavjud xaridorning raqami yangilansa — saqlaymiz
        await client.query('UPDATE customers SET phone = $1 WHERE id = $2 AND phone IS DISTINCT FROM $1', [phone, c.id]);
      }
      // Xaridorning eski nasiyasi (har safar ko'rsatiladi, faqat nasiya savdosida qarzga qo'shiladi)
      const oldDebt = Number((await client.query('SELECT debt_uzs FROM customers WHERE id = $1', [c.id])).rows[0].debt_uzs || 0);
      let total = 0;
      const lines = [];
      for (const it of items) {
        const qty = Math.max(1, parseInt(it.qty) || 1);
        const p = (await client.query('SELECT id, name, price, currency FROM products WHERE id = $1 AND is_deleted = false', [it.product_id])).rows[0];
        if (!p) throw new Error('Mahsulot topilmadi (ID ' + it.product_id + ')');
        const baseUzs = p.currency === 'USD' ? Math.round(Number(p.price) * rate) : Math.round(Number(p.price));
        let priceUzs = baseUzs;
        // Nasiya savdosida sotuvchi har bir mahsulot narxini o'zgartira oladi
        if (pay === 'nasiya' && it.price_uzs !== undefined && it.price_uzs !== null && it.price_uzs !== '') {
          const cp = Math.round(Number(it.price_uzs));
          if (!isFinite(cp) || cp < 0) throw new Error(p.name + " — nasiya narxi noto'g'ri kiritilgan");
          priceUzs = cp;
        }
        const lineTotal = priceUzs * qty;
        total += lineTotal;
        lines.push({ p, qty, priceUzs, baseUzs, lineTotal });
      }
      const sale = (await client.query(
        `INSERT INTO sales (seller_id, customer_id, customer_name, total_uzs, usd_rate, payment_method, old_debt_uzs)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [req.user.id, c.id, cname, total, rate, pay, oldDebt])).rows[0];
      for (const l of lines) {
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, product_name, qty, price_orig, currency, price_uzs, line_total_uzs, base_price_uzs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [sale.id, l.p.id, l.p.name, l.qty, l.p.price, l.p.currency, l.priceUzs, l.lineTotal, l.baseUzs]);
      }
      // Nasiya savdo summasi xaridor qarziga qo'shiladi
      if (pay === 'nasiya' && total > 0) {
        await client.query('UPDATE customers SET debt_uzs = debt_uzs + $1 WHERE id = $2', [total, c.id]);
      }
      await client.query('COMMIT');
      const receipt = await buildReceipt(sale.id);
      broadcast({ type: 'print', receipt });
      notifySale(receipt).catch(() => {});
      res.json({ ok: true, receipt });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

// Savdolar ro'yxati
router.get('/', anyAuth, async (req, res, next) => {
  try {
    const params = [];
    let where = 'TRUE';
    if (req.query.from) { params.push(req.query.from); where += ` AND (v.created_at AT TIME ZONE '${TZ}')::date >= $${params.length}::date`; }
    if (req.query.to) { params.push(req.query.to); where += ` AND (v.created_at AT TIME ZONE '${TZ}')::date <= $${params.length}::date`; }
    let sellerFilter = '';
    if (req.user.role === 'seller') {
      params.push(req.user.id);
      sellerFilter = ` AND v.seller_id = $${params.length}`;
    } else if (req.query.seller_id) {
      params.push(req.query.seller_id);
      sellerFilter = ` AND v.seller_id = $${params.length}`;
    }
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    params.push(limit);
    const { rows } = await q(`
      SELECT v.id, v.created_at, v.customer_name, v.total_uzs, v.is_cancelled, v.payment_method,
             v.cancelled_by, v.cancelled_at, v.cancel_reason, v.reprint_count,
             sel.name AS seller_name,
             (SELECT count(*) FROM sale_items si WHERE si.sale_id = v.id) AS items_count
      FROM sales v JOIN sellers sel ON sel.id = v.seller_id
      WHERE ${where}${sellerFilter}
      ORDER BY v.id DESC LIMIT $${params.length}`, params);
    res.json({ sales: rows.map(r => ({
      ...r,
      total_uzs: Number(r.total_uzs),
      items_count: Number(r.items_count),
      reprint_count: Number(r.reprint_count),
      created_at: new Date(r.created_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16),
      cancelled_at: r.cancelled_at ? new Date(r.cancelled_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16) : null
    })) });
  } catch (e) { next(e); }
});

router.get('/my-stats', middleware('seller'), async (req, res, next) => {
  try {
    const id = req.user.id;
    const today = (await q(`SELECT count(*) AS c, coalesce(sum(total_uzs),0) AS s FROM sales
      WHERE seller_id = $1 AND is_cancelled = false AND (created_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`, [id])).rows[0];
    const month = (await q(`SELECT count(*) AS c, coalesce(sum(total_uzs),0) AS s FROM sales
      WHERE seller_id = $1 AND is_cancelled = false AND (created_at AT TIME ZONE '${TZ}') >= date_trunc('month', now() AT TIME ZONE '${TZ}')`, [id])).rows[0];
    const top = (await q(`SELECT si.product_name AS name, sum(si.qty) AS qty, sum(si.line_total_uzs) AS s
      FROM sale_items si JOIN sales v ON v.id = si.sale_id
      WHERE v.seller_id = $1 AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= date_trunc('month', now() AT TIME ZONE '${TZ}')
      GROUP BY si.product_name ORDER BY s DESC LIMIT 10`, [id])).rows;
    const recent = (await q(`SELECT v.id, v.created_at, v.customer_name, v.total_uzs, v.is_cancelled, v.cancelled_by, v.cancelled_at, v.cancel_reason, v.payment_method,
             (SELECT count(*) FROM sale_items si WHERE si.sale_id = v.id) AS items_count
      FROM sales v WHERE v.seller_id = $1 ORDER BY v.id DESC LIMIT 30`, [id])).rows;
    res.json({
      today: { c: Number(today.c), s: Number(today.s) },
      month: { c: Number(month.c), s: Number(month.s) },
      top: top.map(t => ({ name: t.name, qty: Number(t.qty), s: Number(t.s) })),
      recent: recent.map(r => ({
        ...r,
        total_uzs: Number(r.total_uzs),
        items_count: Number(r.items_count),
        created_at: new Date(r.created_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16),
        cancelled_at: r.cancelled_at ? new Date(r.cancelled_at).toLocaleString('sv-SE', { timeZone: TZ }).replace('T', ' ').slice(0, 16) : null
      }))
    });
  } catch (e) { next(e); }
});

router.get('/:id/receipt', anyAuth, async (req, res, next) => {
  try { res.json(await buildReceipt(req.params.id)); } catch (e) { next(e); }
});

// Sotuvchi faqat o'z savdosini, admin xohlagan savdoni bekor qiladi
router.post('/:id/cancel', anyAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM sales WHERE id = $1', [req.params.id]);
    const s = rows[0];
    if (!s) throw new Error('Savdo topilmadi');
    if (s.is_cancelled) throw new Error('Bu savdo allaqachon bekor qilingan');
    if (req.user.role === 'seller' && s.seller_id !== req.user.id) throw new Error('Faqat o\'z savdongizni bekor qila olasiz');
    const byName = req.user.role === 'admin' ? 'Admin' : req.user.name;
    await q('UPDATE sales SET is_cancelled = true, cancelled_by = $1, cancelled_at = now(), cancel_reason = $2 WHERE id = $3',
      [byName, String(req.body.reason || '').trim().slice(0, 200) || null, s.id]);
    // Nasiya savdo bekor qilinsa — qarzdan ham yechiladi va tarixga yoziladi
    if (s.payment_method === 'nasiya' && s.customer_id && Number(s.total_uzs) > 0) {
      const upd = await q('UPDATE customers SET debt_uzs = GREATEST(debt_uzs - $1, 0) WHERE id = $2 RETURNING debt_uzs',
        [Number(s.total_uzs), s.customer_id]);
      if (upd.rows[0]) {
        await q(`INSERT INTO customer_payments (customer_id, amount_uzs, kind, note, by_name, debt_after_uzs)
          VALUES ($1, $2, 'cancel', $3, $4, $5)`,
          [s.customer_id, -Number(s.total_uzs), 'Chek #' + s.id + ' bekor qilindi' + (req.body.reason ? ' (' + String(req.body.reason).slice(0, 150) + ')' : ''), byName, Number(upd.rows[0].debt_uzs)]);
      }
    }
    const receipt = await buildReceipt(s.id);
    notifyCancel(receipt, byName, req.body.reason).catch(() => {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Chekni qayta chop etish
router.post('/:id/reprint', anyAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT id FROM sales WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new Error('Savdo topilmadi');
    await q('UPDATE sales SET reprint_count = reprint_count + 1 WHERE id = $1', [req.params.id]);
    const receipt = await buildReceipt(req.params.id);
    broadcast({ type: 'print', receipt, reprint: true });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
