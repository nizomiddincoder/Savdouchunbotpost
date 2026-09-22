// Chek print agenti — do'kondagi 24/7 yoniq Windows kompyuterda ishlaydi.
// Serverga WebSocket orqali ulanib turadi, yangi savdo tushishi bilan chekni chop etadi.
// USB XPrinter: Windows'da oddiy printer sifatida o'rnatiladi, agent ESC/POS baytlarni
// to'g'ridan-to'g'ri Windows print spooler orqali (winspool RAW) yuboradi.

// Chek 80mm termal qog'oz (Font A = 48 belgi) uchun optimallashtirilgan.

 b0680c9d51eca093b33b00b2a70ce6e9011466ba
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { execFile } = require('child_process');
const WebSocket = require('ws');

(function loadEnv() {
  try {
    const f = path.join(__dirname, '.env');
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { /* ignore */ }
})();

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000';
const TOKEN = process.env.AGENT_TOKEN || 'savdo-agent-token';

// USB Windows printer — asosiy rejim. Server "config" xabari bilan bu qiymatlarni
// istalgan vaqtda yangilashi mumkin (agentni qayta yozish shart emas).
let MODE = (process.env.PRINTER_MODE || 'windows').toLowerCase();     // windows | network | share | console
<<<<<<< HEAD
let PRINTER_NAME = process.env.PRINTER_NAME || 'POSPrinter POS-80C';      // Windows'dagi printer nomi
=======
let PRINTER_NAME = process.env.PRINTER_NAME || 'POSPrinter POS-80C';                    // Windows'dagi printer nomi (bo'sh joy bo'lsa ham bo'ladi)
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
const HOST0 = process.env.PRINTER_HOST || '192.168.1.50';
let PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
const SHARE = process.env.PRINTER_SHARE || '';

let HOST = HOST0;

const PS_SCRIPT = path.join(__dirname, 'print-raw.ps1');

<<<<<<< HEAD
/* ===== 80mm ESC/POS yordamchi funksiyalari ===== */

// 80mm termal printer Font A: qatorda 48 belgi
const W = 48;
// Jadval ustunlari kengliklari (jami 48: 3+17+5+4+9+10)
const COL_NO = 2, COL_NAME = 17, COL_PACK = 5, COL_QTY = 4, COL_PRICE = 9, COL_SUM = 10;

=======
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
function sanitize(s) {
  return String(s == null ? '' : s)
    .replace(/[\u2018\u2019\u02BC\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    // CP866 da yo'q o'zbek harflarini mos harflarga o'tkazamiz ( printer ham shunday chiqaradi)
    .replace(/\u040E/g, 'У').replace(/\u045E/g, 'у')   // Ў ў
    .replace(/\u049A/g, 'К').replace(/\u049B/g, 'к')   // Қ қ
    .replace(/\u0492/g, 'Г').replace(/\u0493/g, 'г')   // Ғ ғ
    .replace(/\u04B2/g, 'Х').replace(/\u04B3/g, 'х')   // Ҳ ҳ
    .replace(/\u2116/g, '#')                            // №
    .replace(/[^\x20-\x7E\u0400-\u04FF]/g, '');
}

// Kirillni CP866 baytiga o'tkazish (ESC t 17 kod sahifasi bilan)
function cp866Byte(ch) {
  const c = ch.codePointAt(0);
  if (c < 128) return c;
  if (c === 0x0401) return 0xF0; // Ё
  if (c === 0x0451) return 0xF1; // ё
  if (c >= 0x0410 && c <= 0x043F) return 0x80 + (c - 0x0410); // А..п
  if (c >= 0x0440 && c <= 0x044F) return 0xE0 + (c - 0x0440); // р..я
  return 0x3F; // '?'
}

function padRight(s, w) { s = sanitize(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); }
function padLeft(s, w) { s = sanitize(s); return s.length >= w ? s.slice(-w) : ' '.repeat(w - s.length) + s; }

// Uzin matnni so'z bo'yicha, kerak bo'lsa so'zni ham uzib, qatorlarga bo'lish
function wrapText(t, w) {
  const words = sanitize(t).split(' ').filter(x => x !== '');
  const lines = [];
  let cur = '';
  for (let wd of words) {
    while (wd.length > w) {
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(wd.slice(0, w));
      wd = wd.slice(w);
    }
    if ((cur + (cur ? ' ' : '') + wd).length <= w) cur += (cur ? ' ' : '') + wd;
    else { if (cur) lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

<<<<<<< HEAD
// UZS: bo'sh joy bilan raqam guruhlash (2 596 / 77 880 / 1 541 080)
function formatMoney(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
// USD: 130,60 $
function formatUsd(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' $'; }

// Jadval qatori: nomi uzun bo'lsa keyingi qatorga ko'chadi, summa ustunlari o'ngga tekislanadi
function formatReceiptRow(no, name, pack, qty, price, sum) {
  const nameLines = wrapText(name, COL_NAME);
  const out = [];
  nameLines.forEach((ln, i) => {
    const prefix = i === 0 ? padRight(no, COL_NO) + ' ' : ' '.repeat(COL_NO + 1);
    if (i === nameLines.length - 1) {
      out.push(padRight(prefix + ln, COL_NO + 1 + COL_NAME)
        + padLeft(pack, COL_PACK) + padLeft(qty, COL_QTY)
        + padLeft(price, COL_PRICE) + padLeft(sum, COL_SUM));
    } else {
      out.push(prefix + ln);
    }
  });
  return out;
}

/* ===== ESC/POS chek (80mm) ===== */
=======
// ESC/POS — termal printerlar uchun umumiy protokol (o'zgarmas)
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
function buildEscpos(r, reprint) {
  const a = [];
  const push = (...bs) => bs.forEach(b => a.push(b & 0xff));
  const text = s => { for (const ch of sanitize(s)) a.push(cp866Byte(ch)); };
  const nl = () => push(0x0a);
  const center = (s, w) => {
    w = w || W;
    const t = sanitize(s);
    const lines = wrapText(t, w);
    for (const ln of lines) { text(' '.repeat(Math.max(0, Math.floor((w - ln.length) / 2))) + ln); nl(); }
  };
  const lr = (l, rt) => {
    l = sanitize(l); rt = sanitize(rt);
    if (l.length > W - rt.length - 1) l = l.slice(0, W - rt.length - 1);
    text(l + ' '.repeat(Math.max(1, W - l.length - rt.length)) + rt);
    nl();
  };
  const sep = () => { text('-'.repeat(W)); nl(); };
  const sep2 = () => { text('='.repeat(W)); nl(); };
  const bold = on => push(0x1b, 0x45, on ? 1 : 0);
  // "Манзил: ..." kabi maydon — bo'sh bo'lsa chop etilmaydi, uzun qiymat qatorga bo'linadi
  const field = (label, value) => {
    if (value === undefined || value === null || String(value).trim() === '') return;
    const labelStr = label + ': ';
    wrapText(value, W - labelStr.length).forEach((ln, i) => {
      text(i ? ' '.repeat(labelStr.length) + ln : labelStr + ln); nl();
    });
  };

  const hasUsd = Number(r.usd_rate) > 0;
  const usdOf = uzs => hasUsd ? Number(uzs) / Number(r.usd_rate) : 0;

  push(0x1b, 0x40);            // init
  push(0x1b, 0x74, 0x11);      // kod sahifasi CP866 (kirill)
  push(0x1b, 0x32);            // standart qator orasi

  // === HEADER ===
  push(0x1b, 0x61, 0x01);      // center
  bold(1); push(0x1d, 0x21, 0x11); // bold + ikki barobar shrift
  center(r.shop_name || 'MEXMASH', 24);
  push(0x1d, 0x21, 0x00); bold(0);
  if (r.shop_phone) center(r.shop_phone);
  push(0x1b, 0x61, 0x00);      // left
  sep();
  field('Чек №', r.receipt_no != null ? ('Ср-' + String(r.receipt_no).padStart(6, '0')) : '');
  field('Сана', r.datetime_local);
  field('Сотувчи', r.seller_name);
  field('Харидор', r.customer_name);
  field('Тел', r.customer_phone);
  if (Number(r.old_debt_uzs) > 0) field('Ески карз', formatMoney(r.old_debt_uzs));
  field('Манзил', r.customer_address);
  field('Мулжал', r.customer_landmark);
  sep();

  // === MAHSULOTLAR JADVALI ===
  text(padRight('№', COL_NO) + ' ' + padRight('Номи', COL_NAME)
    + padRight('Упак', COL_PACK) + padLeft('Сони', COL_QTY)
    + padLeft('Нархи', COL_PRICE) + padLeft('Сумма', COL_SUM));
  nl();
  text('-'.repeat(W)); nl();
  (r.items || []).forEach((it, idx) => {
    for (const ln of formatReceiptRow(String(idx + 1), it.name,
      it.pack_qty != null ? String(it.pack_qty) : '',
      formatMoney(it.qty), formatMoney(it.price_uzs), formatMoney(it.line_total_uzs))) {
      text(ln); nl();
    }
  });
  sep();

  // === JAMI ===
  bold(1);
  if (hasUsd) lr('Жами:', formatUsd(usdOf(r.total_uzs)) + ' ' + formatMoney(r.total_uzs) + ' сум');
  else lr('Жами:', formatMoney(r.total_uzs) + ' сум');
  bold(0);
  const oldDebt = Number(r.old_debt_uzs || 0);
  if (oldDebt > 0) {
    if (hasUsd) lr('Ески карз:', formatUsd(usdOf(oldDebt)) + ' ' + formatMoney(oldDebt) + ' сум');
    else lr('Ески карз:', formatMoney(oldDebt) + ' сум');
  }
<<<<<<< HEAD
  if (r.payment_method === 'nasiya') {
    const tot = r.total_with_debt_uzs != null ? Number(r.total_with_debt_uzs) : Number(r.total_uzs) + oldDebt;
    if (hasUsd) lr('Колган карз:', formatUsd(usdOf(tot)) + ' ' + formatMoney(tot) + ' сум');
    else lr('Колган карз:', formatMoney(tot) + ' сум');
  }
  text('Толув: ' + ({ naqd: 'Naqd', karta: 'Plastik karta', nasiya: 'Nasiya' }[r.payment_method] || 'Naqd')); nl();

=======
  sep();
  bold(1); lr('JAMI:', fmt(r.total_uzs) + " so'm"); bold(0);
  const oldDebt = Number(r.old_debt_uzs || 0);
  if (oldDebt > 0) lr('Eski nasiya:', fmt(oldDebt) + " so'm");
  if (r.payment_method === 'nasiya') {
    if (oldDebt > 0) {
      const tot = r.total_with_debt_uzs != null ? Number(r.total_with_debt_uzs) : Number(r.total_uzs) + oldDebt;
      bold(1); lr('UMUMIY NASIYA:', fmt(tot) + " so'm"); bold(0);
    }
  }
  text('Tolov: ' + ({ naqd: 'Naqd', karta: 'Plastik karta', nasiya: 'Nasiya' }[r.payment_method] || 'Naqd')); nl();
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
  if (r.is_cancelled) {
    bold(1); push(0x1b, 0x61, 0x01); center('*** БЕКОР КИЛИНГАН ***'); push(0x1b, 0x61, 0x00); bold(0);
  }
  if (reprint) { push(0x1b, 0x61, 0x01); center('[кайта чоп этилган]'); push(0x1b, 0x61, 0x00); }

  // === QO'SHIMCHA MA'LUMOT ===
  sep();
  field('Тайёрловчи', r.prepared_by);
  field('Етказ', r.delivery_status);
  push(0x1b, 0x61, 0x01); // center
  center('Камчилик ва хатолар учун 3 кун ичида мурожаат килинг!');
  center('Майда хизматдаги пуллар учун рази буланг.');
  push(0x1b, 0x61, 0x00);

  nl(); nl(); nl(); nl();
  push(0x1d, 0x56, 0x42, 0x00); // qog'ozni kesish
  return Buffer.from(a);
}

<<<<<<< HEAD
// Test cheki — { type: 'test-print' } kelganda yoki `node agent.js --test` bilan chop etiladi
function buildTestReceipt() {
  const a = [];
  const push = (...bs) => bs.forEach(b => a.push(b & 0xff));
  const text = s => { for (const ch of sanitize(s)) a.push(cp866Byte(ch)); };
  const nl = () => push(0x0a);
  const center = (s, w) => {
    w = w || W;
    const t = sanitize(s);
    text(' '.repeat(Math.max(0, Math.floor((w - t.length) / 2))) + t);
    nl();
  };
  push(0x1b, 0x40);           // init
  push(0x1b, 0x74, 0x11);     // CP866
  push(0x1b, 0x32);           // qator orasi
  center('='.repeat(31));
  push(0x1d, 0x21, 0x11);     // ikki barobar shrift
  center(r.shop_name || 'MEXMASH', 24);
  center('PRINTER TEST', 24);
  push(0x1d, 0x21, 0x00);
  center('='.repeat(31));
  nl();
  center('Printer:');
  center(PRINTER_NAME);
  nl();
  center('80mm PAPER TEST');
  nl();
  center('='.repeat(31));
  nl(); nl(); nl(); nl();
  push(0x1d, 0x56, 0x42, 0x00); // qog'ozni kesish
=======
// Test cheki — { type: 'test-print' } kelganda chop etiladi
function buildTestReceipt() {
  const W = 32;
  const a = [];
  const push = (...bs) => bs.forEach(b => a.push(b & 0xff));
  const text = s => { for (const ch of sanitize(s)) a.push(ch.charCodeAt(0) & 0xff); };
  const nl = () => push(0x0a);
  const center = s => {
    const t = sanitize(s).slice(0, W);
    text(' '.repeat(Math.max(0, Math.floor((W - t.length) / 2))) + t);
    nl();
  };
  push(0x1b, 0x40); // init
  push(0x1b, 0x61, 0x01);
  center('==============================');
  center('PRINTER TEST');
  center('XPrinter OK');
  center('==============================');
  push(0x1b, 0x61, 0x00);
  nl(); nl();
  push(0x1d, 0x56, 0x42, 0x00); // kesish
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
  return Buffer.from(a);
}

/* ===== Windows print spooler orqali raw chop etish ===== */
function psError(stderr) {
  return String(stderr || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
}
function printWindows(name, buf) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.bin');
    try { fs.writeFileSync(tmp, buf); } catch (e) { return reject(new Error('Vaqtinchalik fayl yozib bo\'lmadi: ' + e.message)); }
    const done = (err, code) => { fs.unlink(tmp, () => {}); err ? reject(err) : resolve(); };
<<<<<<< HEAD
    console.log('[PRINT] Sending to Windows printer...');
=======
    console.log('[PRINT] Sending ESC/POS data...');
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
    console.log('[PRINT] Printer name: ' + name);
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-PrinterName', name, '-FilePath', tmp],
      { timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        const out = String(stdout || '');
        if (!err && /PRINTED/.test(out)) {
<<<<<<< HEAD
          console.log('[PRINT] Print job completed');
=======
          console.log('[PRINT] Print job sent successfully (Windows spooler)');
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
          return done(null);
        }
        const code = err ? err.code : '';
        if (code === 3 || /OPENFAIL/.test(out)) {
          return done(new Error('Windows printer topilmadi: "' + name + '". Printers & scanners dagi aniq nomini PRINTER_NAME ga yozing.'));
        }
        if (code === 5 || /EMPTYFILE/.test(out)) return done(new Error('Chop etish fayli bo\'sh'));
        done(new Error('Windows chop etish xatosi (kod ' + (code || '?') + '): ' + (psError(stderr) || out.trim() || 'nomalum')));
      });
  });
}

<<<<<<< HEAD
/* Windows'dagi o'rnatilgan printerni ro'yxati (xato bo'lsa yordam uchun) */
=======
/* Windows'dagi o'rnatilgan printerni ro'yxati (PRINTER_NAME berilmaganda yordam uchun) */
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
function listWindowsPrinters() {
  return new Promise(resolve => {
    execFile('powershell.exe',
      ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
      { timeout: 20000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve([]);
        resolve(String(stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean));
      });
  });
}

/* ===== Umumiy yuborish ===== */
async function printBuf(buf, r) {
<<<<<<< HEAD
  console.log('[PRINT] ESC/POS buffer size: ' + buf.length + ' bytes');
  if (MODE === 'windows') {
=======
  if (MODE === 'windows') {
    if (!PRINTER_NAME) {
      console.error('[PRINT ERROR] PRINTER_NAME kiritilmagan. Windows printerni o\'rnating va print-agent/.env ga nomini yozing.');
      const list = await listWindowsPrinters();
      if (list.length) {
        console.error('[PRINT ERROR] Windows\'dagi printerlar:');
        for (const p of list) {
          const hit = /xprinter|pos|thermal|58|80/i.test(p) ? '  <=== ehtimol shu' : '';
          console.error('   - "' + p + '"' + hit);
        }
        console.error('[PRINT ERROR] Kerakli nomni .env ga yozing: PRINTER_NAME=<yuqoridagi aniq nom>');
      } else {
        console.error('[PRINT ERROR] Windows\'da printer topilmadi — XPrinter drayverini o\'rnating.');
      }
      return;
    }
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
    try {
      await printWindows(PRINTER_NAME, buf);
    } catch (e) {
      console.error('[PRINT ERROR] ' + e.message);
<<<<<<< HEAD
      if (/topilmadi/.test(e.message)) {
        const list = await listWindowsPrinters();
        if (list.length) {
          console.error('[PRINT ERROR] Windows\'dagi printerlar:');
          for (const p of list) {
            const hit = /xprinter|pos|thermal|58|80/i.test(p) ? '  <=== ehtimol shu' : '';
            console.error('   - "' + p + '"' + hit);
          }
          console.error('[PRINT ERROR] Kerakli nomni print-agent/.env ga yozing: PRINTER_NAME=<yuqoridagi aniq nom>');
        }
      }
=======
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
    }
  } else if (MODE === 'network') {
    const s = net.connect(PORT, HOST, () => {
      s.write(buf);
      s.end();
<<<<<<< HEAD
      console.log('[PRINT] Print job completed (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
=======
      console.log('[PRINT] Print job sent successfully (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
    });
    s.on('error', e => console.error('[PRINT ERROR] Printer xatosi:', e.message));
  } else if (MODE === 'share' && SHARE) {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '.bin');
    fs.writeFileSync(tmp, buf);
    execFile('cmd', ['/c', 'copy', '/b', tmp, SHARE], err => {
      if (err) console.error('[PRINT ERROR] Windows ulash printeri xatosi (SHARE nomini tekshiring):', err.message);
<<<<<<< HEAD
      else console.log('[PRINT] Print job completed (Windows ulash):', SHARE, 'chek', r.receipt_no);
      fs.unlink(tmp, () => {});
    });
  } else {
    console.log('[PRINT] (console rejimi — chop etilmadi) Chek', r.receipt_no, formatMoney(r.total_uzs), "so'm");
=======
      else console.log('[PRINT] Print job sent successfully (Windows ulash):', SHARE, 'chek', r.receipt_no);
      fs.unlink(tmp, () => {});
    });
  } else {
    console.log('[PRINT] (console rejimi — chop etilmadi) Chek', r.receipt_no, fmt(r.total_uzs), "so'm");
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
  }
}

/* Server config xabari: { type: 'config', config: { mode, printerName, ... } } */
function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  if (cfg.mode) {
    MODE = String(cfg.mode).toLowerCase();
    console.log('[PRINT] Printer mode (server config): ' + MODE);
  }
  if (typeof cfg.printerName === 'string' && cfg.printerName.trim()) {
    PRINTER_NAME = cfg.printerName.trim();
    console.log('[PRINT] Printer name (server config): ' + PRINTER_NAME);
  }
  if (cfg.port) PORT = parseInt(cfg.port, 10) || PORT;
  if (typeof cfg.host === 'string' && cfg.host) HOST = cfg.host;
}

function connect() {
  const url = SERVER_URL.replace(/\/+$/, '') + '/ws?token=' + encodeURIComponent(TOKEN);
  console.log('Ulanmoqda:', url);
  const ws = new WebSocket(url);
  ws.on('open', () => console.log('[PRINT] WebSocket connected. Chek kutulmoqda...'));
  ws.on('message', m => {
    try {
      const d = JSON.parse(m);
      if (d.type === 'print') {
        console.log('[PRINT] Print command received (chek ' + (d.receipt && d.receipt.receipt_no) + ')');
<<<<<<< HEAD
        console.log('[PRINT] Receipt generated');
        console.log('[PRINT] Paper width: 80mm');
        console.log('[PRINT] Printer: ' + PRINTER_NAME);
        printBuf(buildEscpos(d.receipt, d.reprint), d.receipt || {});
      } else if (d.type === 'test-print') {
        console.log('[PRINT] Test print command received');
        console.log('[PRINT] Receipt generated (test)');
        console.log('[PRINT] Paper width: 80mm');
        console.log('[PRINT] Printer: ' + PRINTER_NAME);
=======
        console.log('[PRINT] Printer mode: ' + MODE);
        printBuf(buildEscpos(d.receipt, d.reprint), d.receipt || {});
      } else if (d.type === 'test-print') {
        console.log('[PRINT] Test print command received');
        console.log('[PRINT] Printer mode: ' + MODE);
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
        printBuf(buildTestReceipt(), { receipt_no: 'TEST' });
      } else if (d.type === 'config') {
        applyConfig(d.config);
      } else if (d.type === 'hello') {
        // server salomi — hech narsa qilish shart emas
      }
    } catch (e) { console.error('[PRINT ERROR] Xabar qayta ishlashda xato:', e.message); }
  });
  ws.on('close', () => {
    console.log('[PRINT] WebSocket uzildi, 5 soniyadan keyin qayta urinaman...');
    setTimeout(connect, 5000);
  });
  ws.on('error', e => console.error('[PRINT ERROR] WebSocket:', e.message));
<<<<<<< HEAD
}

/* Test chop: node agent.js --test */
if (process.argv.includes('--test')) {
  console.log('[PRINT] Test chek yuborilmoqda...');
  console.log('[PRINT] Paper width: 80mm');
  console.log('[PRINT] Printer: ' + PRINTER_NAME);
  printBuf(buildTestReceipt(), { receipt_no: 'TEST' }).then(() => process.exit(0));
} else {
  console.log('[PRINT] Printer mode: ' + MODE);
  console.log('[PRINT] Printer: ' + PRINTER_NAME);
  connect();
}
=======
}

/* Ishga tushishda tekshiruv: windows rejimida PRINTER_NAME bo'lmasa — ro'yxat ko'rsatamiz */
(async () => {
  console.log('[PRINT] Printer mode: ' + MODE);
  if (MODE === 'windows' && !PRINTER_NAME) {
    console.log('[PRINT] PRINTER_NAME kiritilmagan — Windows\'dagi printerlar tekshirilmoqda...');
    const list = await listWindowsPrinters();
    if (list.length) {
      console.log('[PRINT] O\'rnatilgan printerlar:');
      for (const p of list) {
        const hit = /xprinter|pos|thermal|58|80/i.test(p) ? '  <=== ehtimol shu' : '';
        console.log('   - "' + p + '"' + hit);
      }
      console.log('[PRINT] print-agent/.env fayliga yozing: PRINTER_NAME=<yuqoridagi aniq nom>');
      console.log('[PRINT] Qayta ishga tushiring: node agent.js');
    } else {
      console.log('[PRINT] Windows\'da printer topilmadi. XPrinter drayverini o\'rnating (README ga qarang).');
    }
    console.log('[PRINT] Eslatma: agent ishlashda davom etadi, lekin PRINTER_NAME kirguncha chek chop etilmaydi.');
  }
  connect();
})();
>>>>>>> b0680c9d51eca093b33b00b2a70ce6e9011466ba
