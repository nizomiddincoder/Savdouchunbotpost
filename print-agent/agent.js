// Chek print agenti — do'kondagi 24/7 yoniq Windows kompyuterda ishlaydi.
// Serverga WebSocket orqali ulanib turadi, yangi savdo tushishi bilan chekni chop etadi.
// USB XPrinter: Windows'da oddiy printer sifatida o'rnatiladi, agent ESC/POS baytlarni
// to'g'ridan-to'g'ri Windows print spooler orqali (winspool RAW) yuboradi.
// Chek 80mm termal qog'oz (Font A = 48 belgi) uchun optimallashtirilgan.
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
let PRINTER_NAME = process.env.PRINTER_NAME || 'POSPrinter POS-80C'; // Windows'dagi printer nomi (aniq nomini Printers & scanners'dan oling)
const HOST0 = process.env.PRINTER_HOST || '192.168.1.50';
let PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
const SHARE = process.env.PRINTER_SHARE || '';

let HOST = HOST0;

const PS_SCRIPT = path.join(__dirname, 'print-raw.ps1');

/* ===== 80mm ESC/POS yordamchi funksiyalari ===== */

// 80mm termal printer Font A: qatorda 48 belgi
const W = 48;
// Jadval ustunlari — ustunlar orasida '|' chizig'i turadi (4 ta): 2+18+5+9+10+4 = 48
const COL_NO = 2, COL_NAME = 18, COL_QTY = 5, COL_PRICE = 9, COL_SUM = 10;

/* ===== Lotin <-> Kirill translit (chek yozuvi uchun) ===== */
let RSCRIPT = 'lat';   // 'lat' | 'cyr' — buildEscpos har safar o'rnatadi

const CYR_D = { 'sh': 'ш', 'ch': 'ч', 'yo': 'ё', 'yu': 'ю', 'ya': 'я', 'ye': 'е', "o'": 'ў', 'o`': 'ў', "g'": 'ғ', 'g`': 'ғ', 'ng': 'нг' };
const CYR_L = { a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з' };
const LAT_M = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': "g'", 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'қ': 'q', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ў': "o'", 'ф': 'f', 'х': 'x', 'ҳ': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ь': '', 'ы': 'i', 'э': 'e', 'ю': 'yu', 'я': 'ya' };

function latinToCyr(s) {
  let out = '', i = 0;
  const low = s.toLowerCase();
  while (i < s.length) {
    const d = CYR_D[low.slice(i, i + 2)];
    if (d) { out += s[i] === low[i] ? d : d.charAt(0).toUpperCase() + d.slice(1); i += 2; continue; }
    const cl = low[i];
    if (cl === 'y' && low[i + 1] === 'i') { out += 'й'; i++; continue; }
    if (CYR_L[cl] !== undefined) { out += s[i] === cl ? CYR_L[cl] : CYR_L[cl].toUpperCase(); i++; continue; }
    out += s[i]; i++;
  }
  return out;
}
function cyrToLat(s) {
  let out = '';
  for (const c of String(s)) {
    const l = c.toLowerCase();
    if (LAT_M[l] === undefined) { out += c; continue; }
    const t = LAT_M[l];
    out += !t ? '' : (c === l ? t : t.charAt(0).toUpperCase() + t.slice(1));
  }
  return out;
}

function sanitize(s) {
  let t = String(s == null ? '' : s)
    .replace(/[\u2018\u2019\u02BC\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\u0400-\u04FF]/g, '');
  if (RSCRIPT === 'cyr') {
    // Kirillda chop: lotin -> kirill. CP866da yo'q harflar (ўқғҳ) mos harflarga o'tkaziladi
    t = latinToCyr(t)
      .replace(/ў/g, 'у').replace(/Ў/g, 'У')
      .replace(/қ/g, 'к').replace(/Қ/g, 'К')
      .replace(/ғ/g, 'г').replace(/Ғ/g, 'Г')
      .replace(/ҳ/g, 'х').replace(/Ҳ/g, 'Х');
  } else {
    // Lotinda chop: kirill matnlar (masalan kirillcha kiritilgan mahsulot nomi) lotinga o'giriladi
    t = cyrToLat(t);
  }
  return t;
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

// UZS: bo'sh joy bilan raqam guruhlash (2 596 / 77 880 / 1 541 080)
function formatMoney(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
// USD: 130,60 $
function formatUsd(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' $'; }

// Telefon: 998912041009 / 912041009 -> +998 91 204 10 09
function formatPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 9) d = '998' + d;
  if (d.length === 12 && d.startsWith('998')) return '+998 ' + d.slice(3, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8, 10) + ' ' + d.slice(10, 12);
  return '+' + d;
}

// Sana: '2026-09-16 12:23' -> '16.09.2026 12:23'
function formatDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] : String(s || '');
}

// Ustunli jadval qatori: ustunlar orasiga '|' chizig'i qo'yiladi
function tableRow(cells) {
  let s = '';
  cells.forEach((c, i) => {
    const t = sanitize(String(c.t == null ? '' : c.t));
    s += c.right ? padLeft(t, c.w) : padRight(t, c.w);
    if (i < cells.length - 1) s += '|';
  });
  return s;
}

// Jadval qatori: nomi uzun bo'lsa keyingi qatorga ko'chadi, summa ustunlari o'ngga tekislanadi
function formatReceiptRow(no, name, qty, price, sum) {
  const nameLines = wrapText(name, COL_NAME);
  const out = [];
  nameLines.forEach((ln, i) => {
    const cells = [
      { t: i === 0 ? no : '', w: COL_NO },
      { t: ln, w: COL_NAME }
    ];
    if (i === 0) {
      cells.push({ t: qty, w: COL_QTY, right: true },
        { t: price, w: COL_PRICE, right: true },
        { t: sum, w: COL_SUM, right: true });
    } else {
      cells.push({ t: '', w: COL_QTY }, { t: '', w: COL_PRICE }, { t: '', w: COL_SUM });
    }
    out.push(tableRow(cells));
  });
  return out;
}

/* ===== ESC/POS chek (80mm) ===== */
function buildEscpos(r, reprint) {
  RSCRIPT = r.receipt_script === 'cyrillic' ? 'cyr' : 'lat';
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
  // Ikki ustunli sarlavha qatori: chap + o'ng (eski dastur chekidagidek)
  const twoCol = (l, rt, lw) => {
    lw = lw || 25;
    l = sanitize(l); rt = sanitize(rt);
    if (l.length > lw) l = l.slice(0, lw - 3) + '...';
    if (rt.length > W - lw) rt = rt.slice(0, W - lw - 3) + '...';
    text(l + ' '.repeat(Math.max(1, W - l.length - rt.length)) + rt);
    nl();
  };
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
  // Yuqorida DASTUR NOMI chiqadi (admin panel > Sozlamalar > Chek sarlavhasi)
  push(0x1b, 0x61, 0x01);      // center
  bold(1); push(0x1d, 0x21, 0x11); // bold + ikki barobar shrift
  center(r.receipt_title || 'SAVDO', 24);
  push(0x1d, 0x21, 0x00); bold(0);
  // Ikkita aloqador telefon — sarlavha ostida yonma-yon (mijoz shularga qo'ng'iroq qiladi)
  const tel1 = formatPhone(r.shop_phone || r.phone_1);
  const tel2 = formatPhone(r.phone_2);
  if (tel1 && tel2) twoCol(tel1, tel2, 23);
  else if (tel1) center(tel1);
  else if (tel2) center(tel2);
  push(0x1b, 0x61, 0x00);      // left
  sep();
  // Ikki ustunli ma'lumot bloki
  twoCol('Chek №' + (r.receipt_no != null ? 'Ср-' + String(r.receipt_no).padStart(6, '0') : ''),
    'Сана: ' + formatDate(r.datetime_local));
  if (Number(r.usd_rate) > 0) twoCol('', '$ : ' + formatMoney(r.usd_rate));
  const selTel = formatPhone(r.seller_phone);
  twoCol('Sotuvchi: ' + r.seller_name, selTel ? 'Tel: ' + selTel : '');
  const custTel = formatPhone(r.customer_phone);
  twoCol('Xaridor: ' + r.customer_name, custTel ? 'Tel: ' + custTel : '');
  field('Manzil', r.customer_address);
  field('Mo`ljall', r.customer_landmark);
  sep();

  // === MAHSULOTLAR JADVALI — ustunlar '|' chizig'i bilan ajratilgan ===
  text(tableRow([
    { t: '№', w: COL_NO },
    { t: 'Nomi', w: COL_NAME },
    { t: 'Soni', w: COL_QTY, right: true },
    { t: 'Narxi', w: COL_PRICE, right: true },
    { t: 'Summa', w: COL_SUM, right: true }
  ]));
  nl();
  text('-'.repeat(W)); nl();
  (r.items || []).forEach((it, idx) => {
    for (const ln of formatReceiptRow((idx + 1) + '.', it.name,
      formatMoney(it.qty), formatMoney(it.price_uzs), formatMoney(it.line_total_uzs))) {
      text(ln); nl();
    }
  });
  sep();

  // === JAMI ===
  bold(1);
  if (hasUsd) lr('Jami:', formatUsd(usdOf(r.total_uzs)) + ' ' + formatMoney(r.total_uzs) + ' so`m');
  else lr('Jami:', formatMoney(r.total_uzs) + ' so`m');
  bold(0);
  const oldDebt = Number(r.old_debt_uzs || 0);
  if (oldDebt > 0) {
    if (hasUsd) lr('Eski qarz:', formatUsd(usdOf(oldDebt)) + ' ' + formatMoney(oldDebt) + ' so`m');
    else lr('Eski qarz:', formatMoney(oldDebt) + ' so`m');
  }
  if (r.payment_method === 'nasiya') {
    const tot = r.total_with_debt_uzs != null ? Number(r.total_with_debt_uzs) : Number(r.total_uzs) + oldDebt;
    if (hasUsd) lr('Olingan Yuk:', formatUsd(usdOf(tot)) + ' ' + formatMoney(tot) + ' so`m');
    else lr('Olingan Yuk:', formatMoney(tot) + ' сум');
  }
  text('To`lov uslubi: ' + ({ naqd: 'Naqd', karta: 'Plastik karta', nasiya: 'Nasiya' }[r.payment_method] || 'Naqd')); nl();

  if (r.is_cancelled) {
    bold(1); push(0x1b, 0x61, 0x01); center('*** BEKOR QILINGAN ***'); push(0x1b, 0x61, 0x00); bold(0);
  }
  if (reprint) { push(0x1b, 0x61, 0x01); center('[Qayta chop etilgan]'); push(0x1b, 0x61, 0x00); }

  // === QO'SHIMCHA MA'LUMOT ===
  sep();
  field('Tayyorlovchi', r.prepared_by);
  field('Yetkaz', r.delivery_status);
  push(0x1b, 0x61, 0x01); // center
  center('Kamchilik va xatolar uchun 3 kun ichida murojaat qiling! +998705240706');
  center('Shafyorlar: Nizomiddin: +998935172520 ; Yaxyoxon: +998999999999');
  push(0x1b, 0x61, 0x00);

  nl(); nl(); nl(); nl();
  push(0x1d, 0x56, 0x42, 0x00); // qog'ozni kesish
  return Buffer.from(a);
}

// Test cheki — { type: 'test-print' } kelganda yoki `node agent.js --test` bilan chop etiladi
function buildTestReceipt() {
  RSCRIPT = 'lat';
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
  center(process.env.RECEIPT_TITLE || 'SAVDO', 24);
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
    console.log('[PRINT] Sending to Windows printer...');
    console.log('[PRINT] Printer name: ' + name);
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-PrinterName', name, '-FilePath', tmp],
      { timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        const out = String(stdout || '');
        if (!err && /PRINTED/.test(out)) {
          console.log('[PRINT] Print job completed');
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

/* Windows'dagi o'rnatilgan printerni ro'yxati (xato bo'lsa yordam uchun) */
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
  console.log('[PRINT] ESC/POS buffer size: ' + buf.length + ' bytes');
  if (MODE === 'windows') {
    try {
      await printWindows(PRINTER_NAME, buf);
    } catch (e) {
      console.error('[PRINT ERROR] ' + e.message);
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
    }
  } else if (MODE === 'network') {
    const s = net.connect(PORT, HOST, () => {
      s.write(buf);
      s.end();
      console.log('[PRINT] Print job completed (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
    });
    s.on('error', e => console.error('[PRINT ERROR] Printer xatosi:', e.message));
  } else if (MODE === 'share' && SHARE) {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '.bin');
    fs.writeFileSync(tmp, buf);
    execFile('cmd', ['/c', 'copy', '/b', tmp, SHARE], err => {
      if (err) console.error('[PRINT ERROR] Windows ulash printeri xatosi (SHARE nomini tekshiring):', err.message);
      else console.log('[PRINT] Print job completed (Windows ulash):', SHARE, 'chek', r.receipt_no);
      fs.unlink(tmp, () => {});
    });
  } else {
    console.log('[PRINT] (console rejimi — chop etilmadi) Chek', r.receipt_no, formatMoney(r.total_uzs), "so'm");
  }
}

/* Server config xabari: { type: 'config', config: { mode, printerName, ... } } */
function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  if (cfg.mode) {
    let m = String(cfg.mode).toLowerCase();
    // Server host'siz 'network' rejim yuborsa — bu rejim baribir ishlamaydi
    // (ulanadigan manzil yo'q). Bunday holda .env dagi 'windows' rejim qoladi.
    if (m === 'network' && !cfg.host && MODE === 'windows') {
      console.log('[PRINT] Server network rejimini yubordi, lekin host bo\'sh — windows rejim qoladi');
    } else {
      MODE = m;
      console.log('[PRINT] Printer mode (server config): ' + MODE);
    }
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
        console.log('[PRINT] Receipt generated');
        console.log('[PRINT] Paper width: 80mm');
        console.log('[PRINT] Printer: ' + PRINTER_NAME);
        printBuf(buildEscpos(d.receipt, d.reprint), d.receipt || {});
      } else if (d.type === 'test-print') {
        console.log('[PRINT] Test print command received');
        console.log('[PRINT] Receipt generated (test)');
        console.log('[PRINT] Paper width: 80mm');
        console.log('[PRINT] Printer: ' + PRINTER_NAME);
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
}

/* Test chop: node agent.js --test */
if (require.main === module) {
  if (process.argv.includes('--test')) {
    console.log('[PRINT] Test chek yuborilmoqda...');
    console.log('[PRINT] Paper width: 80mm');
    console.log('[PRINT] Printer: ' + PRINTER_NAME);
    printBuf(buildTestReceipt(), { receipt_no: 'TEST' }).then(() => process.exit(0));
  } else {
    console.log('[PRINT] Printer mode: ' + MODE);
    console.log('[PRINT] Printer: ' + PRINTER_NAME);
    // Bir vaqtda ikki nusxa ishlamasin — aks holda har chek ikki marta chop etiladi.
    // Lokal portni "qulflash" orqali tekshiramiz: port band bo'lsa, demak agent allaqachon yoniq.
    const LOCK_PORT = parseInt(process.env.AGENT_LOCK_PORT || '47811', 10);
    const lock = net.createServer();
    lock.on('error', () => {
      console.log('[PRINT] Agent allaqachon ishlayapti — bu nusxa yopiladi.');
      process.exit(42); // 42 = "boshqa nusxa bor" — bat fayl buni tanib, qayta urinmaydi
    });
    lock.listen(LOCK_PORT, '127.0.0.1', () => {
      console.log('[PRINT] Agent yagona nusxa sifatida ishga tushdi');
      connect();
    });
  }
} else {
  // Modul sifatida chaqirilganda (dizaynni tekshirish uchun)
  module.exports = { buildEscpos, buildTestReceipt };
}
