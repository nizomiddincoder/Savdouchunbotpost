const router = require('express').Router();
const ExcelJS = require('exceljs');
const { q, getSettings } = require('../db');
const { middleware, hashPin, checkPin } = require('../auth');

const anyAuth = middleware();
const adminOnly = middleware('admin');
const TZ = 'Asia/Tashkent';
const TODAY = `(now() AT TIME ZONE '${TZ}')::date`;
const MONTH_START = `date_trunc('month', now() AT TIME ZONE '${TZ}')`;

/* ================= Sotuvchilar ================= */
function genPin() { return String(Math.floor(1000 + Math.random() * 9000)); }

async function uniquePin(excludeId) {
  const { rows } = await q('SELECT id, pin_hash FROM sellers WHERE is_active = true AND id <> COALESCE($1, 0)', [excludeId || null]);
  for (let i = 0; i < 300; i++) {
    const p = genPin();
    if (!rows.some(r => checkPin(p, r.pin_hash))) return p;
  }
  throw new Error('PIN yaratib bo\'lmadi, qayta urinib ko\'ring');
}

router.get('/sellers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT s.id, s.name, s.is_active,
        (SELECT count(*) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}) AS today_c,
        (SELECT coalesce(sum(v.total_uzs), 0) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}) AS today_s,
        (SELECT count(*) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}) AS month_c,
        (SELECT coalesce(sum(v.total_uzs), 0) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}) AS month_s
      FROM sellers s ORDER BY s.name`);
    res.json({
      sellers: rows.map(r => ({
        id: r.id, name: r.name, is_active: r.is_active,
        today_c: Number(r.today_c), today_s: Number(r.today_s),
        month_c: Number(r.month_c), month_s: Number(r.month_s)
      }))
    });
  } catch (e) { next(e); }
});

router.post('/sellers', adminOnly, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new Error('Sotuvchi ismini kiriting');
    const pin = await uniquePin();
    const { rows } = await q('INSERT INTO sellers (name, pin_hash) VALUES ($1, $2) RETURNING id', [name, hashPin(pin)]);
    res.json({ id: rows[0].id, pin });
  } catch (e) { next(e); }
});

router.post('/sellers/:id/reset-pin', adminOnly, async (req, res, next) => {
  try {
    const pin = await uniquePin(+req.params.id);
    await q('UPDATE sellers SET pin_hash = $1 WHERE id = $2', [hashPin(pin), req.params.id]);
    res.json({ pin });
  } catch (e) { next(e); }
});

router.patch('/sellers/:id', adminOnly, async (req, res, next) => {
  try {
    if (typeof req.body.is_active === 'boolean') await q('UPDATE sellers SET is_active = $1 WHERE id = $2', [req.body.is_active, req.params.id]);
    if (req.body.name) await q('UPDATE sellers SET name = $1 WHERE id = $2', [String(req.body.name).trim().slice(0, 60), req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= Xaridorlar ================= */
router.get('/customers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT c.id, c.name, c.phone, s.name AS first_seller,
        to_char((c.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS first_seen,
        count(v.id) FILTER (WHERE v.is_cancelled = false) AS visits,
        coalesce(sum(v.total_uzs) FILTER (WHERE v.is_cancelled = false), 0) AS total_spent,
        to_char(max(v.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS last_visit
      FROM customers c
      LEFT JOIN sellers s ON s.id = c.first_seller_id
      LEFT JOIN sales v ON v.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, s.name, c.created_at
      ORDER BY max(v.created_at) DESC NULLS LAST
      LIMIT 500`);
    res.json({
      customers: rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone, first_seller: r.first_seller, first_seen: r.first_seen,
        visits: Number(r.visits), total_spent: Number(r.total_spent), last_visit: r.last_visit
      }))
    });
  } catch (e) { next(e); }
});

router.get('/customers/names', anyAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT name, phone FROM customers ORDER BY created_at DESC LIMIT 300');
    res.json({ names: rows.map(r => ({ name: r.name, phone: r.phone })) });
  } catch (e) { next(e); }
});

/* ================= Dashboard ================= */
router.get('/stats/dashboard', adminOnly, async (req, res, next) => {
  try {
    const day = (await q(`SELECT count(*) FILTER (WHERE is_cancelled = false) AS c,
        coalesce(sum(total_uzs) FILTER (WHERE is_cancelled = false), 0) AS s,
        count(*) FILTER (WHERE is_cancelled) AS cc,
        coalesce(sum(total_uzs) FILTER (WHERE is_cancelled), 0) AS cs
      FROM sales WHERE (created_at AT TIME ZONE '${TZ}')::date = ${TODAY}`)).rows[0];
    const month = (await q(`SELECT count(*) FILTER (WHERE is_cancelled = false) AS c,
        coalesce(sum(total_uzs) FILTER (WHERE is_cancelled = false), 0) AS s
      FROM sales WHERE (created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}`)).rows[0];
    const sellers = (await q(`SELECT sel.name, count(*) AS c, coalesce(sum(v.total_uzs), 0) AS s
      FROM sales v JOIN sellers sel ON sel.id = v.seller_id
      WHERE v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}
      GROUP BY sel.name ORDER BY s DESC`)).rows;
    const top = (await q(`SELECT si.product_name AS name, sum(si.qty) AS qty, sum(si.line_total_uzs) AS s
      FROM sale_items si JOIN sales v ON v.id = si.sale_id
      WHERE v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}
      GROUP BY si.product_name ORDER BY s DESC LIMIT 10`)).rows;
    const cust = (await q(`SELECT
        count(DISTINCT c.id) FILTER (WHERE (c.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}) AS new_today,
        count(DISTINCT v.customer_id) FILTER (WHERE v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}
          AND (c.created_at AT TIME ZONE '${TZ}')::date < ${TODAY}) AS returning_today
      FROM customers c LEFT JOIN sales v ON v.customer_id = c.id`)).rows[0];
    const st = await getSettings();
    res.json({
      day: { c: Number(day.c), s: Number(day.s), cc: Number(day.cc), cs: Number(day.cs) },
      month: { c: Number(month.c), s: Number(month.s) },
      sellers: sellers.map(x => ({ name: x.name, c: Number(x.c), s: Number(x.s) })),
      top: top.map(x => ({ name: x.name, qty: Number(x.qty), s: Number(x.s) })),
      customers: { new_today: Number(cust.new_today), returning_today: Number(cust.returning_today) },
      usd_rate: Number(st.usd_rate), shop_name: st.shop_name, shop_phone: st.shop_phone
    });
  } catch (e) { next(e); }
});

/* ================= Sozlamalar ================= */
router.get('/settings', adminOnly, async (req, res, next) => {
  try {
    const st = await getSettings();
    res.json({ shop_name: st.shop_name, shop_phone: st.shop_phone, usd_rate: Number(st.usd_rate) });
  } catch (e) { next(e); }
});

router.put('/settings', adminOnly, async (req, res, next) => {
  try {
    const { shop_name, shop_phone, usd_rate } = req.body;
    if (!(Number(usd_rate) > 0)) throw new Error('USD kursi noto\'g\'ri');
    await q('UPDATE settings SET shop_name = $1, shop_phone = $2, usd_rate = $3 WHERE id = 1',
      [String(shop_name || '').trim().slice(0, 100) || 'Mening dokoni', String(shop_phone || '').trim().slice(0, 30), usd_rate]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= Excel hisobotlar ================= */
async function buildReport(period, value, res, filename) {
  const where = period === 'day'
    ? `(v.created_at AT TIME ZONE '${TZ}')::date = $1::date`
    : `to_char((v.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM') = $1`;
  const sales = (await q(`
    SELECT v.id, to_char((v.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD HH24:MI') AS t,
      sel.name AS seller, v.customer_name, v.total_uzs, v.is_cancelled, v.cancelled_by, v.cancel_reason,
      (SELECT string_agg(si.product_name || ' x' || si.qty, ', ') FROM sale_items si WHERE si.sale_id = v.id) AS items
    FROM sales v JOIN sellers sel ON sel.id = v.seller_id WHERE ${where} ORDER BY v.id`, [value])).rows;
  const prods = (await q(`
    SELECT si.product_name AS name, sum(si.qty) AS qty, sum(si.line_total_uzs) AS s
    FROM sale_items si JOIN sales v ON v.id = si.sale_id
    WHERE v.is_cancelled = false AND ${where} GROUP BY si.product_name ORDER BY s DESC`, [value])).rows;
  const sels = (await q(`
    SELECT sel.name, count(*) AS c, coalesce(sum(v.total_uzs), 0) AS s
    FROM sales v JOIN sellers sel ON sel.id = v.seller_id
    WHERE v.is_cancelled = false AND ${where} GROUP BY sel.name ORDER BY s DESC`, [value])).rows;
  const custs = (await q(`
    SELECT c.name, s.name AS first_seller,
      to_char((c.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS first_seen,
      count(v.id) FILTER (WHERE v.is_cancelled = false) AS c,
      coalesce(sum(v.total_uzs) FILTER (WHERE v.is_cancelled = false), 0) AS s
    FROM customers c
    LEFT JOIN sellers s ON s.id = c.first_seller_id
    LEFT JOIN sales v ON v.customer_id = c.id AND ${where}
    GROUP BY c.id, c.name, s.name, c.created_at
    HAVING count(v.id) > 0
    ORDER BY s DESC`, [value])).rows;

  const wb = new ExcelJS.Workbook();
  const mk = (name, cols, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols;
    rows.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  mk('Savdolar', [
    { header: 'Chek #', key: 'id', width: 9 },
    { header: 'Sana/vaqt', key: 't', width: 17 },
    { header: 'Sotuvchi', key: 'seller', width: 18 },
    { header: 'Xaridor', key: 'customer', width: 20 },
    { header: 'Mahsulotlar', key: 'items', width: 55 },
    { header: "Summa (so'm)", key: 'sum', width: 15 },
    { header: 'Holat', key: 'status', width: 24 }
  ], sales.map(s => ({
    id: s.id, t: s.t, seller: s.seller, customer: s.customer_name, items: s.items || '',
    sum: s.is_cancelled ? 0 : Number(s.total_uzs),
    status: s.is_cancelled ? 'BEKOR (' + (s.cancelled_by || '') + (s.cancel_reason ? ': ' + s.cancel_reason : '') + ')' : 'sotilgan'
  })));
  mk('Mahsulotlar', [
    { header: 'Nomi', key: 'name', width: 35 },
    { header: 'Soni', key: 'qty', width: 10 },
    { header: "Summa (so'm)", key: 's', width: 16 }
  ], prods.map(p => ({ name: p.name, qty: Number(p.qty), s: Number(p.s) })));
  mk('Sotuvchilar', [
    { header: 'Nomi', key: 'name', width: 25 },
    { header: 'Savdolar', key: 'c', width: 12 },
    { header: "Summa (so'm)", key: 's', width: 16 }
  ], sels.map(s => ({ name: s.name, c: Number(s.c), s: Number(s.s) })));
  mk('Xaridorlar', [
    { header: 'Nomi', key: 'name', width: 25 },
    { header: 'Savdolar', key: 'c', width: 12 },
    { header: "Summa (so'm)", key: 's', width: 16 },
    { header: 'Holati', key: 'st', width: 10 },
    { header: 'Birinchi sotuvchi', key: 'fs', width: 18 }
  ], custs.map(c => ({
    name: c.name, c: Number(c.c), s: Number(c.s),
    st: (period === 'day' ? c.first_seen === value : c.first_seen.slice(0, 7) === value) ? 'yangi' : 'eski',
    fs: c.first_seller || ''
  })));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  await wb.xlsx.write(res);
  res.end();
}

router.get('/reports/daily.xlsx', adminOnly, async (req, res, next) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date
      : new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
    await buildReport('day', date, res, 'savdo-' + date + '.xlsx');
  } catch (e) { next(e); }
});

router.get('/reports/monthly.xlsx', adminOnly, async (req, res, next) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month
      : new Date().toLocaleDateString('sv-SE', { timeZone: TZ }).slice(0, 7);
    await buildReport('month', month, res, 'savdo-' + month + '.xlsx');
  } catch (e) { next(e); }
});

module.exports = router;
