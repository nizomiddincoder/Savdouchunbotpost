const router = require('express').Router();
const ExcelJS = require('exceljs');
const { pool, q, getSettings } = require('../db');
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
      SELECT s.id, s.name, s.phone, s.is_active,
        (SELECT count(*) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}) AS today_c,
        (SELECT coalesce(sum(v.total_uzs), 0) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}')::date = ${TODAY}) AS today_s,
        (SELECT count(*) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}) AS month_c,
        (SELECT coalesce(sum(v.total_uzs), 0) FROM sales v WHERE v.seller_id = s.id AND v.is_cancelled = false AND (v.created_at AT TIME ZONE '${TZ}') >= ${MONTH_START}) AS month_s
      FROM sellers s ORDER BY s.name`);
    res.json({
      sellers: rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone || '', is_active: r.is_active,
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
    const phone = String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 15);
    const pin = await uniquePin();
    const { rows } = await q('INSERT INTO sellers (name, phone, pin_hash) VALUES ($1, $2, $3) RETURNING id', [name, phone, hashPin(pin)]);
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
    if (req.body.phone !== undefined) await q('UPDATE sellers SET phone = $1 WHERE id = $2', [String(req.body.phone || '').replace(/[^\d+]/g, '').slice(0, 15), req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= Xaridorlar ================= */
router.get('/customers', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT c.id, c.name, c.phone, c.debt_uzs, s.name AS first_seller,
        to_char((c.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS first_seen,
        count(v.id) FILTER (WHERE v.is_cancelled = false) AS visits,
        coalesce(sum(v.total_uzs) FILTER (WHERE v.is_cancelled = false), 0) AS total_spent,
        to_char(max(v.created_at) AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI') AS last_visit
      FROM customers c
      LEFT JOIN sellers s ON s.id = c.first_seller_id
      LEFT JOIN sales v ON v.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.debt_uzs, s.name, c.created_at
      ORDER BY max(v.created_at) DESC NULLS LAST
      LIMIT 500`);
    res.json({
      customers: rows.map(r => ({
        id: r.id, name: r.name, phone: r.phone, first_seller: r.first_seller, first_seen: r.first_seen,
        visits: Number(r.visits), total_spent: Number(r.total_spent), last_visit: r.last_visit,
        debt_uzs: Number(r.debt_uzs)
      }))
    });
  } catch (e) { next(e); }
});

router.get('/customers/names', anyAuth, async (req, res, next) => {
  try {
    const { rows } = await q('SELECT name, phone, debt_uzs FROM customers ORDER BY created_at DESC LIMIT 300');
    res.json({ names: rows.map(r => ({ name: r.name, phone: r.phone, debt: Number(r.debt_uzs) })) });
  } catch (e) { next(e); }
});

/* Xaridorning to'liq tarixi: savdolar + qarz harakatlari (faqat admin) */
router.get('/customers/:id/history', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await q(`
      SELECT c.id, c.name, c.phone, c.debt_uzs, s.name AS first_seller,
        to_char((c.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS first_seen
      FROM customers c LEFT JOIN sellers s ON s.id = c.first_seller_id
      WHERE c.id = $1`, [req.params.id]);
    const c = rows[0];
    if (!c) throw new Error('Xaridor topilmadi');
    const sales = (await q(`
      SELECT v.id, v.total_uzs, v.old_debt_uzs, v.payment_method, v.is_cancelled, v.cancelled_by,
        to_char((v.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD HH24:MI') AS t,
        sel.name AS seller_name,
        (SELECT count(*) FROM sale_items si WHERE si.sale_id = v.id) AS items_count
      FROM sales v JOIN sellers sel ON sel.id = v.seller_id
      WHERE v.customer_id = $1 ORDER BY v.id DESC LIMIT 200`, [req.params.id])).rows;
    const payments = (await q(`
      SELECT id, amount_uzs, kind, note, by_name, debt_after_uzs,
        to_char((created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD HH24:MI') AS t
      FROM customer_payments WHERE customer_id = $1 ORDER BY id DESC LIMIT 200`, [req.params.id])).rows;
    res.json({
      customer: {
        id: c.id, name: c.name, phone: c.phone, debt_uzs: Number(c.debt_uzs),
        first_seller: c.first_seller, first_seen: c.first_seen
      },
      sales: sales.map(s => ({
        id: s.id, t: s.t, total_uzs: Number(s.total_uzs), old_debt_uzs: Number(s.old_debt_uzs),
        payment_method: s.payment_method, is_cancelled: s.is_cancelled, cancelled_by: s.cancelled_by,
        seller_name: s.seller_name, items_count: Number(s.items_count)
      })),
      payments: payments.map(p => ({
        id: p.id, t: p.t, amount_uzs: Number(p.amount_uzs), kind: p.kind, note: p.note,
        by_name: p.by_name, debt_after_uzs: Number(p.debt_after_uzs)
      }))
    });
  } catch (e) { next(e); }
});

/* Qarz to'lovini qayd etish (qarz kamayadi) */
router.post('/customers/:id/pay-debt', adminOnly, async (req, res, next) => {
  try {
    const amount = Math.round(Number(req.body.amount));
    if (!(amount > 0)) throw new Error("To'lov summasini kiriting");
    const note = String(req.body.note || '').trim().slice(0, 200) || null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const c = (await client.query('SELECT id, debt_uzs FROM customers WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!c) throw new Error('Xaridor topilmadi');
      const debt = Number(c.debt_uzs);
      if (debt <= 0) throw new Error("Bu xaridorning qarzi yo'q");
      if (amount > debt) throw new Error("To'lov qarzdan katta bo'lmasligi kerak (qarz: " + debt + " so'm)");
      const upd = (await client.query('UPDATE customers SET debt_uzs = debt_uzs - $1 WHERE id = $2 RETURNING debt_uzs', [amount, c.id])).rows[0];
      await client.query(
        `INSERT INTO customer_payments (customer_id, amount_uzs, kind, note, by_name, debt_after_uzs)
         VALUES ($1, $2, 'payment', $3, $4, $5)`,
        [c.id, -amount, note, req.user.name, Number(upd.debt_uzs)]);
      await client.query('COMMIT');
      res.json({ ok: true, debt_uzs: Number(upd.debt_uzs) });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) { next(e); }
});

/* Qarzni qo'lda tuzatish (admin istalgan qiymatga o'zgartiradi) */
router.patch('/customers/:id/debt', adminOnly, async (req, res, next) => {
  try {
    const newDebt = Math.round(Number(req.body.debt_uzs));
    if (!isFinite(newDebt) || newDebt < 0) throw new Error("Qarz summasi noto'g'ri");
    const reason = String(req.body.reason || '').trim().slice(0, 200) || 'admin tuzatdi';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const c = (await client.query('SELECT id, debt_uzs FROM customers WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!c) throw new Error('Xaridor topilmadi');
      const delta = newDebt - Number(c.debt_uzs);
      if (delta !== 0) {
        await client.query('UPDATE customers SET debt_uzs = $1 WHERE id = $2', [newDebt, c.id]);
        await client.query(
          `INSERT INTO customer_payments (customer_id, amount_uzs, kind, note, by_name, debt_after_uzs)
           VALUES ($1, $2, 'adjust', $3, $4, $5)`,
          [c.id, delta, reason, req.user.name, newDebt]);
      }
      await client.query('COMMIT');
      res.json({ ok: true, debt_uzs: newDebt });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
    res.json({ shop_name: st.shop_name, shop_phone: st.shop_phone, usd_rate: Number(st.usd_rate), printer_name: st.printer_name || '',
      phone_1: st.phone_1 || '', phone_2: st.phone_2 || '', receipt_title: st.receipt_title || 'SAVDO' });
  } catch (e) { next(e); }
});

router.put('/settings', adminOnly, async (req, res, next) => {
  try {
    const { shop_name, shop_phone, usd_rate, printer_name, phone_1, phone_2, receipt_title } = req.body;
    if (!(Number(usd_rate) > 0)) throw new Error('USD kursi noto\'g\'ri');
    await q('UPDATE settings SET shop_name = $1, shop_phone = $2, usd_rate = $3, printer_name = $4, phone_1 = $5, phone_2 = $6, receipt_title = $7 WHERE id = 1',
      [String(shop_name || '').trim().slice(0, 100) || 'Mening dokoni', String(shop_phone || '').trim().slice(0, 30),
       usd_rate, String(printer_name || '').trim().slice(0, 120),
       String(phone_1 || '').trim().slice(0, 30), String(phone_2 || '').trim().slice(0, 30),
       (String(receipt_title || '').trim().slice(0, 24).toUpperCase() || 'SAVDO')]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* Print-agent test cheki — ulangan agentga { type: 'test-print' } yuboradi */
router.post('/printer/test', anyAuth, async (req, res, next) => {
  try {
    const { agentOnline, broadcast } = require('../ws');
    if (!agentOnline()) {
      return res.status(503).json({ error: 'Print-agent ulanmagan. Do\'kondagi kompyuterda print-agent ishga tushirilganini tekshiring (node agent.js).' });
    }
    broadcast({ type: 'test-print' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ================= Excel hisobotlar ================= */
async function buildReport(period, value, res, filename) {
  const dateWhere = a => period === 'day'
    ? `(${a}.created_at AT TIME ZONE '${TZ}')::date = $1::date`
    : `to_char((${a}.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM') = $1`;
  const where = dateWhere('v');
  const sales = (await q(`
    SELECT v.id, to_char((v.created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD HH24:MI') AS t,
      sel.name AS seller, v.customer_name, v.total_uzs, v.old_debt_uzs, v.payment_method, v.is_cancelled, v.cancelled_by, v.cancel_reason,
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
    { header: "To'lov", key: 'pay', width: 13 },
    { header: 'Eski nasiya', key: 'olddebt', width: 13 },
    { header: 'Umumiy nasiya', key: 'totdebt', width: 14 },
    { header: 'Holat', key: 'status', width: 24 }
  ], sales.map(s => ({
    id: s.id, t: s.t, seller: s.seller, customer: s.customer_name, items: s.items || '',
    sum: s.is_cancelled ? 0 : Number(s.total_uzs),
    pay: { naqd: 'Naqd', karta: 'Karta', nasiya: 'Nasiya' }[s.payment_method] || 'Naqd',
    olddebt: s.payment_method === 'nasiya' ? Number(s.old_debt_uzs || 0) : '',
    totdebt: s.payment_method === 'nasiya' ? Number(s.old_debt_uzs || 0) + Number(s.total_uzs) : '',
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
  // Qarzdor xaridorlar — hozirgi qarz va shu davrda qilingan to'lovlar
  const debts = (await q(`
    SELECT c.name, c.phone, c.debt_uzs,
      (SELECT coalesce(sum(-p.amount_uzs), 0) FROM customer_payments p
        WHERE p.customer_id = c.id AND p.kind = 'payment' AND ${dateWhere('p')})
    FROM customers c WHERE c.debt_uzs > 0 ORDER BY c.debt_uzs DESC`, [value])).rows;
  mk('Qarzlar', [
    { header: 'Xaridor', key: 'name', width: 25 },
    { header: 'Telefon', key: 'phone', width: 18 },
    { header: "Hozirgi qarz (so'm)", key: 'debt', width: 20 },
    { header: "To'langan (so'm)", key: 'paid', width: 18 }
  ], debts.map(d => ({
    name: d.name, phone: d.phone || '', debt: Number(d.debt_uzs), paid: Number(d.paid)
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
