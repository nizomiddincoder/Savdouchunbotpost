const router = require('express').Router();
const ExcelJS = require('exceljs');
const { q, pool, getSettings } = require('../db');
const { middleware } = require('../auth');

const anyAuth = middleware();
const adminOnly = middleware('admin');
const TZ = 'Asia/Tashkent';

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

// Barcha mahsulotlarni ommaviy o'chirish — faqat admin (savdo tarixi saqlanadi)
router.delete('/', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await q('UPDATE products SET is_deleted = true WHERE is_deleted = false RETURNING id');
    res.json({ ok: true, deleted: rows.length });
  } catch (e) { next(e); }
});

/* ================= Excel import ================= */
// Excel katakchasidagi turli qiymat turlarini oddiy matnga aylantiramiz
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.result !== undefined) return String(v.result);
    if (v.text !== undefined) return String(v.text);
    if (v instanceof Date) return '';
    return String(v);
  }
  return String(v);
}

// Excelga o'xshash fayldan raqam o'qish: 12500, "12 500", "12,500", "12.500", 12.5 — hammasi to'g'ri tushuniladi
function parseNum(v) {
  if (v && typeof v === 'object') {
    if (v.richText) v = v.richText.map(t => t.text).join('');
    else if (v.result !== undefined) v = v.result;
    else if (v.text !== undefined) v = v.text;
  }
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[\s\u00a0']/g, '').replace(/[^0-9.,]/g, '');
  if (!s) return null;
  const hasC = s.includes(','), hasD = s.includes('.');
  if (hasC && hasD) {
    // Oxirgi ajratuvchi kasr, qolganlari minglik: 1,234.56 yoki 1.234,56
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    s = s.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.');
  } else if (hasC) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  } else if (hasD) {
    // 12.500 — minglik, 12.5 — kasr
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

// Valyuta yacheykasi: USD/$/dollar, UZS/so'm/sum — aks holda null (qator xato emas, default olinadi)
function parseCur(v) {
  const s = cellText(v).toLowerCase();
  if (/\$|usd|долл|dollar/.test(s)) return 'USD';
  if (/uzs|so.?m|сум|sum/.test(s)) return 'UZS';
  return null;
}

// Fayl va bazadagi nomlarni checkDup bilan bir xil qoidada solishtiramiz
function normName(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Bir faylda ham, bazada ham dublikat bo'lmasligi uchun yordamchi
function colIndex(headerRow, patterns) {
  return headerRow.findIndex(c => patterns.some(p => p.test(String(c == null ? '' : c).toLowerCase())));
}

function readProductsFromWorkbook(wb) {
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount < 2) throw new Error('Faylda mahsulot qatorlari topilmadi (1-qator ustun nomlari, 2-qatordan ma\'lumot bo\'lishi kerak)');
  const header = ws.getRow(1).values.slice(1); // exceljs 1-indeksdan boshlaydi
  const iName = colIndex(header, [/^nom/i, /mahsulot/i, /^name/i, /product/i, /ном/i, /наимен/i, /товар/i]);
  const iPrice = colIndex(header, [/нарх/i, /цена/i, /^narx/i, /price/i, /стоим/i, /summa/i]);
  const iCur = colIndex(header, [/валют/i, /currency/i, /valyuta/i, /usd|uzs|so.?m|doll/i]);
  if (iName < 0 || iPrice < 0) {
    throw new Error('Ustunlar topilmadi. 1-qatorda "Nomi" va "Narxi" ustunlari bo\'lishi kerak (namuna fayldan foydalaning)');
  }
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return;
    const clean = cellText(row.getCell(iName + 1).value).trim().replace(/\s+/g, ' ');
    if (!clean) return; // bo'sh qatorlarni tashlab yuboramiz
    const price = parseNum(row.getCell(iPrice + 1).value);
    const currency = iCur >= 0 ? (parseCur(row.getCell(iCur + 1).value) || 'UZS') : 'UZS';
    out.push({ row: num, name: clean, price, currency });
  });
  if (!out.length) throw new Error('Faylda birorta ham to\'ldirilgan qator topilmadi');
  return out;
}

// Namuna fayl — admin yuklab olib to'ldiradi
router.get('/import/template.xlsx', anyAuth, async (req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mahsulotlar');
    ws.columns = [
      { header: 'Nomi', key: 'name', width: 35 },
      { header: 'Narxi', key: 'price', width: 14 },
      { header: 'Valyuta (UZS/USD)', key: 'currency', width: 18 }
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ['Kofta', 'Shim', 'Kyepka'].forEach(n => ws.addRow({ name: n, price: '', currency: 'UZS' }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mahsulot-namuna.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

// Excel orqali ommaviy qo'shish — faqat admin
router.post('/import', adminOnly, async (req, res) => {
  const { file_b64 } = req.body || {};
  if (!file_b64) return res.status(400).json({ error: 'Fayl yuborilmadi' });
  let wb;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(String(file_b64).split(',').pop(), 'base64'));
  } catch (e) {
    return res.status(400).json({ error: 'Faylni o\'qib bo\'lmadi. .xlsx yoki .xlsm formatida yuboring' });
  }
  let items;
  try {
    items = readProductsFromWorkbook(wb);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // Bazadagi mavjud nomlar — dublikatlarni o'tkazib yuborish uchun
  const { rows: existing } = await q('SELECT id, name FROM products WHERE is_deleted = false');
  const dbNames = new Map(existing.map(r => [normName(r.name), r.id]));
  const seen = new Map(); // shu fayl ichidagi takrorlanishlar
  const inserted = [];
  const skipped = [];
  const failed = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      const key = normName(it.name);
      if (dbNames.has(key)) { skipped.push({ row: it.row, name: it.name, reason: 'Bazada mavjud' }); continue; }
      if (seen.has(key)) { skipped.push({ row: it.row, name: it.name, reason: 'Faylda takrorlangan' }); continue; }
      if (!(it.price > 0)) { failed.push({ row: it.row, name: it.name, reason: 'Narx noto\'g\'ri (bo\'sh yoki 0 dan katta emas)' }); continue; }
      try {
        const r = await client.query(
          'INSERT INTO products (name, price, currency) VALUES ($1, $2, $3) RETURNING id',
          [it.name, it.price, it.currency]);
        seen.set(key, r.rows[0].id);
        inserted.push({ row: it.row, name: it.name });
      } catch (e) {
        if (e.code === '23505') skipped.push({ row: it.row, name: it.name, reason: 'Bazada mavjud' });
        else failed.push({ row: it.row, name: it.name, reason: 'Saqlashda xato' });
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    return res.status(500).json({ error: 'Bazaga yozishda xato' });
  }
  client.release();

  res.json({ added: inserted.length, skipped, failed, total: items.length });
});

/* ================= Mahsulotlar ro'yxatini yuklab olish ================= */
async function productList() {
  const st = await getSettings();
  const rate = Number(st.usd_rate);
  const { rows } = await q(`
    SELECT p.id, p.name, p.price, p.currency, s.name AS created_by
    FROM products p LEFT JOIN sellers s ON s.id = p.created_by
    WHERE p.is_deleted = false ORDER BY p.name`);
  return {
    rate,
    shop_name: st.shop_name,
    items: rows.map(r => ({
      name: r.name,
      price: Number(r.price),
      currency: r.currency,
      price_uzs: r.currency === 'USD' ? Math.round(Number(r.price) * rate) : Math.round(Number(r.price)),
      created_by: r.created_by || 'Admin'
    }))
  };
}

// Excel formatida yuklab olish
router.get('/export.xlsx', anyAuth, async (req, res, next) => {
  try {
    const { rate, shop_name, items } = await productList();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mahsulotlar');
    ws.columns = [
      { header: '№', key: 'no', width: 6 },
      { header: 'Nomi', key: 'name', width: 35 },
      { header: 'Narxi', key: 'price', width: 14 },
      { header: 'Valyuta', key: 'currency', width: 10 },
      { header: "So'mdagi narxi", key: 'uzs', width: 18 },
      { header: 'Qo\'shgan', key: 'by', width: 18 }
    ];
    items.forEach((it, i) => ws.addRow({ no: i + 1, name: it.name, price: it.price, currency: it.currency, uzs: it.price_uzs, by: it.created_by }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.eachRow((row, n) => { if (n > 1) { row.getCell(3).numFmt = '#,##0.##'; row.getCell(5).numFmt = '#,##0'; } });
    ws.addRow({});
    ws.addRow({ name: 'USD kursi:', price: rate });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="mahsulotlar.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

/* Minimal PDF generator (qo'shimcha kutubxonasiz) */
const CYR = { А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ё:'Yo',Ж:'J',З:'Z',И:'I',Й:'Y',К:'K',Л:'L',М:'M',Н:'N',О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'H',Ц:'Ts',Ч:'Ch',Ш:'Sh',Щ:'Sh',Ъ:'',Ы:'I',Ь:'',Э:'E',Ю:'Yu',Я:'Ya',Ў:'O',Қ:'Q',Ғ:'G',Ҳ:'H' };
function pdfText(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const up = ch.toUpperCase();
    if (CYR[up] !== undefined) out += ch === up ? CYR[up] : CYR[up].toLowerCase();
    else if (ch === '—' || ch === '–' || ch === '\u2019' || ch === '\u02BC') out += ch === '\u2019' || ch === '\u02BC' ? "'" : '-';
    else { const c = ch.codePointAt(0); out += (c >= 32 && c <= 255) ? ch : ''; }
  }
  return out.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function moneyStr(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

// PDF formatida yuklab olish
router.get('/export.pdf', anyAuth, async (req, res, next) => {
  try {
    const { rate, shop_name, items } = await productList();
    const date = new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
    const COLS = [
      { x: 40, t: '№', r: false },
      { x: 62, t: 'Nomi', w: 175 },
      { x: 250, t: 'Narxi', r: true, w: 55 },
      { x: 318, t: 'Valyuta', r: false },
      { x: 385, t: "So'mda", r: true, w: 75 },
      { x: 480, t: "Qo'shgan", r: false, w: 75 }
    ];
    // Sahifa kontenti (bir necha sahifali)
    const TOP = 800, BOT = 55, RH = 19, PER = Math.floor((TOP - BOT) / RH);
    const streams = [];
    let ops = [], y = 0;
    const head = first => {
      let o = '';
      if (first) {
        y = TOP + 26;
        o += 'BT /F2 15 Tf 40 ' + y + ' Td (' + pdfText('MAHSULOTLAR RO\'YXATI') + ') Tj ET\n';
        y -= 18;
        o += 'BT /F1 9 Tf 40 ' + y + ' Td (' + pdfText(shop_name + ' • ' + date + ' • jami: ' + items.length + ' ta • $=' + moneyStr(rate)) + ") Tj ET\n";
        y -= 14;
      } else { y = 805; o += 'BT /F1 8 Tf 40 ' + (y + 14) + ' Td (' + pdfText(shop_name + ' — davomi') + ') Tj ET\n'; }
      o += '0.7 w 40 ' + y + ' m 555 ' + y + ' l S\n';
      y -= 14;
      COLS.forEach(c => { o += 'BT /F2 9 Tf ' + c.x + ' ' + y + ' Td (' + pdfText(c.t) + ') Tj ET\n'; });
      y -= 4;
      o += '0.4 w 40 ' + y + ' m 555 ' + y + ' l S\n';
      y -= RH - 2;
      return o;
    };
    ops.push(head(true));
    items.forEach((it, i) => {
      if ((i % PER) === 0 && i > 0) { streams.push(ops.join('')); ops = []; ops.push(head(false)); }
      const vals = [
        String(i + 1) + '.',
        it.name.length > 38 ? it.name.slice(0, 37) + '.' : it.name,
        it.currency === 'USD' ? (Number(it.price) || 0).toFixed(2).replace('.', ',') + ' $' : moneyStr(it.price),
        it.currency,
        moneyStr(it.price_uzs),
        it.created_by.slice(0, 14)
      ];
      let o = '';
      COLS.forEach((c, j) => {
        const t = pdfText(vals[j]);
        const x = c.r && c.w ? Math.max(c.x, c.x + c.w - t.length * 4.7) : c.x;
        o += 'BT /F1 9 Tf ' + x.toFixed(0) + ' ' + y + ' Td (' + t + ') Tj ET\n';
      });
      ops.push(o);
      y -= RH;
    });
    streams.push(ops.join(''));

    // PDF yig'ish
    const objs = [];
    const pageIds = streams.map((_, i) => 5 + i * 2);
    objs.push('<< /Type /Catalog /Pages 2 0 R >>');
    objs.push('<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + streams.length + ' >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    streams.forEach((st, i) => {
      objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (6 + i * 2) + ' 0 R >>');
      objs.push('<< /Length ' + Buffer.byteLength(st) + ' >>\nstream\n' + st + 'endstream');
    });
    let pdf = '%PDF-1.4\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(off => { pdf += String(off).padStart(10, '0') + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="mahsulotlar.pdf"');
    res.send(Buffer.from(pdf, 'binary'));
  } catch (e) { next(e); }
});

module.exports = router;
