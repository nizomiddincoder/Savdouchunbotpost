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
    else lr('Olingan Yuk:', formatMoney(tot) + ' so`m');
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
  center('Shafyorlar: Nizomiddin: +998935172520 ; Yaxyoxon: +998987771011');
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
    const done = err => { fs.unlink(tmp, () => {}); err ? reject(err) : resolve(); };
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-PrinterName', name, '-FilePath', tmp];
    if (/^(1|true|yes)$/i.test(String(process.env.PRINTER_NO_QUEUE_CLEAN || ''))) args.push('-NoClean');
    console.log('[PRINT] Sending to Windows printer...');
    console.log('[PRINT] Printer name: ' + name);
    execFile('powershell.exe', args, { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout || '');
      const lines = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const cleaned = lines.find(l => /^CLEANED /.test(l));
      if (cleaned) console.log('[PRINT] Navbatdagi tiqilgan ish tozalandi: ' + cleaned.replace('CLEANED ', '') + ' ta');
      const status = lines.find(l => /^STATUS /.test(l));
      if (status) console.log('[PRINT] Printer holati: ' + status.replace('STATUS ', ''));
      const code = err ? err.code : 0;
      if (!err && /PRINTED/.test(out)) { console.log('[PRINT] Print job completed'); return done(null); }
      if (code === 'ETIMEDOUT' || (err && err.killed)) return done(new Error('PowerShell 60 soniyada tugamadi — printer yoki spooler javob bermayapti'));
      if (code === 3 || /OPENFAIL/.test(out)) return done(new Error('Windows printer topilmadi: "' + name + '". Printers & scanners dagi aniq nomini PRINTER_NAME ga yozing.'));
      if (code === 5 || /EMPTYFILE/.test(out)) return done(new Error('Chop etish fayli bo\'sh'));
      if (code === 7 || /STUCK/.test(out)) return done(new Error('Chek spooler navbatida tiqilib qoldi (printer qog\'ozi, kabeli va holatini tekshiring)'));
      done(new Error('Windows chop etish xatosi (kod ' + (code || '?') + '): ' + (psError(stderr) || out.trim() || 'nomalum')));
    });
  });
}

/* Windows'dagi o'rnatilgan printerlar ro'yxati (xato bo'lsa yordam uchun) */
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

/* ===== Tarmoq (9100), Windows ulash (share) va konsol rejimlari ===== */
function printNetwork(buf, r) {
  return new Promise((resolve, reject) => {
    const s = net.connect(PORT, HOST);
    const t = setTimeout(() => { try { s.destroy(); } catch (e) {} reject(new Error('Printer ' + HOST + ':' + PORT + ' javob bermadi (timeout)')); }, 10000);
    s.on('connect', () => {
      s.end(buf, () => {
        clearTimeout(t);
        console.log('[PRINT] Print job completed (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
        resolve();
      });
    });
    s.on('error', e => { clearTimeout(t); reject(new Error('Printer xatosi: ' + e.message)); });
  });
}

function printShare(buf, r) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.bin');
    try { fs.writeFileSync(tmp, buf); } catch (e) { return reject(new Error('Vaqtinchalik fayl yozib bo\'lmadi: ' + e.message)); }
    execFile('cmd', ['/c', 'copy', '/b', tmp, SHARE], { timeout: 20000, windowsHide: true }, err => {
      fs.unlink(tmp, () => {});
      if (err) return reject(new Error('Windows ulash printeri xatosi (SHARE nomini tekshiring): ' + err.message));
      console.log('[PRINT] Print job completed (Windows ulash):', SHARE, 'chek', r.receipt_no);
      resolve();
    });
  });
}

/* ===== Umumiy yuborish — xato bo'lsa THROW qiladi (navbat qayta urinadi) ===== */
async function printBuf(buf, r) {
  console.log('[PRINT] ESC/POS buffer size: ' + buf.length + ' bytes');
  if (MODE === 'windows') return printWindows(PRINTER_NAME, buf);
  if (MODE === 'network') return printNetwork(buf, r);
  if (MODE === 'share' && SHARE) return printShare(buf, r);
  console.log('[PRINT] (console rejimi — chop etilmadi) Chek', r.receipt_no, formatMoney(r.total_uzs), "so'm");
}

/* ===== Chop etish navbati =====
   Avvalgi kod chekni "otib yuborardi": bitta xato (spooler band, printer uyg'onishi,
   PowerShell timeout) bo'lsa chek jimgina yo'qolardi va ketma-ket savdolarda bir
   nechta PowerShell bir vaqtda ishga tushib, spooler'ni tiqib qo'yardi — aynan
   "2 chek chiqdi, keyin hech narsa chiqmayapti" holati. Endi:
   - cheklar navbatga turadi va KETMA-KET yuboriladi (bir vaqtda bitta ish);
   - xato bo'lsa bir necha marta qayta uriniladi (1.5s, 6s, 13s, ... ~2 daqiqa);
   - chop etilmagan chek diskda saqlanadi va agent qayta ishga tushganda yuboriladi. */
const QUEUE_DIR = path.join(__dirname, 'queue');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function createQueue(send, opts = {}) {
  const say = opts.log || (() => {});
  const dir = opts.dir || QUEUE_DIR;
  const maxAttempts = opts.maxAttempts || 8;
  const backoff = opts.backoff || (n => Math.min(30000, 1500 * n * n));
  const maxQueued = opts.maxQueued || 50;
  const persistOf = j => (opts.persist ? !!opts.persist(j) : false);
  const list = [];
  let running = false;

  const fileOf = j => path.join(dir, j.id + '.json');
  const label = j => j.kind === 'test' ? 'TEST' : (j.receipt && j.receipt.receipt_no != null ? j.receipt.receipt_no : '?');

  function ensureDir() {
    try { fs.mkdirSync(dir, { recursive: true }); return true; } catch (e) { return false; }
  }
  function save(j) {
    if (!persistOf(j) || !ensureDir()) return;
    try {
      fs.writeFileSync(fileOf(j), JSON.stringify({ receipt: j.receipt, reprint: !!j.reprint, createdAt: j.createdAt }));
    } catch (e) { say('[PRINT ERROR] Chekni diskka saqlab bo\'lmadi: ' + e.message); }
  }
  function unsave(j) {
    if (!persistOf(j)) return;
    try { fs.unlinkSync(fileOf(j)); } catch (e) { /* allaqachon yo'q */ }
  }

  function add(job) {
    const j = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      kind: job.kind || 'print',
      receipt: job.receipt,
      reprint: !!job.reprint,
      maxAttempts: job.maxAttempts || maxAttempts
    };
    while (list.length >= maxQueued) {
      const old = list.shift();
      unsave(old);
      say('[PRINT ERROR] Navbat to\'lib ketdi — eng eski chek o\'chirildi (chek ' + label(old) + ')');
    }
    save(j);
    list.push(j);
    start();
    return j;
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      while (list.length) {
        const job = list[0];
        let ok = false;
        let lastErr = '';
        const attempts = job.maxAttempts || maxAttempts;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            await send(job);
            ok = true;
            break;
          } catch (e) {
            lastErr = e.message;
            say('[PRINT ERROR] Chek ' + label(job) + ' — urinish ' + attempt + '/' + attempts + ': ' + e.message);
            if (attempt < attempts) await sleep(backoff(attempt));
          }
        }
        list.shift();
        if (ok) {
          unsave(job);
          say('[PRINT] Chek chop etildi: ' + label(job));
        } else {
          say('[PRINT ERROR] Chek ' + label(job) + ' chop etilmadi: ' + lastErr);
          if (persistOf(job)) say('[PRINT ERROR] Chek diskda saqlandi (print-agent/queue) — agent qayta ishga tushganda qayta yuboriladi');
          if (opts.onGiveUp) { try { await opts.onGiveUp(job, lastErr); } catch (e) { /* ignore */ } }
        }
      }
    } finally {
      running = false;
    }
  }

  function start() {
    run().catch(e => say('[PRINT ERROR] Navbat xatosi: ' + (e && e.message)));
  }

  function loadLeftovers() {
    if (!opts.persist || !ensureDir()) return 0;
    let files = [];
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch (e) { return 0; }
    const items = [];
    const now = Date.now();
    for (const f of files) {
      const p = path.join(dir, f);
      let d;
      try { d = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { try { fs.unlinkSync(p); } catch (_) { /* ignore */ } continue; }
      const t = typeof d.createdAt === 'number' ? d.createdAt : Date.parse(d.createdAt);
      // 3 kundan eski yoki buzilgan yozuvlar o'chiriladi
      if (!d.receipt || !t || now - t > 3 * 24 * 3600 * 1000) { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } continue; }
      items.push({ id: f.replace(/\.json$/, ''), createdAt: t, kind: 'print', receipt: d.receipt, reprint: !!d.reprint, maxAttempts });
    }
    items.sort((a, b) => a.createdAt - b.createdAt);
    const keep = items.slice(-20);
    for (const it of items.slice(0, Math.max(0, items.length - 20))) { try { fs.unlinkSync(fileOf(it)); } catch (e) { /* ignore */ } }
    keep.forEach(j => list.push(j));
    return keep.length;
  }

  async function idle() {
    while (running || list.length) await sleep(200);
  }

  return { add, run, start, idle, loadLeftovers, size: () => list.length };
}

const QUEUE = createQueue(
  job => job.kind === 'test'
    ? printBuf(buildTestReceipt(), { receipt_no: 'TEST' })
    : printBuf(buildEscpos(job.receipt, job.reprint), job.receipt || {}),
  {
    log: msg => (/ERROR/.test(msg) ? console.error(msg) : console.log(msg)),
    persist: job => job.kind === 'print' && MODE !== 'console',
    onGiveUp: async () => {
      if (MODE !== 'windows') return;
      const list = await listWindowsPrinters();
      if (!list.length) {
        console.error('[PRINT ERROR] Windows\'da printer topilmadi. USB kabel, printer quvvati va Windows\'da o\'rnatilganini tekshiring.');
        return;
      }
      console.error('[PRINT ERROR] Windows\'dagi printerlar:');
      for (const p of list) {
        const hit = /xprinter|pos|thermal|58|80/i.test(p) ? '  <=== ehtimol shu' : '';
        console.error('   - "' + p + '"' + hit);
      }
      console.error('[PRINT ERROR] Kerakli nomni admin panel > Sozlamalar > "Windows printer nomi" ga yozing (yoki print-agent/.env: PRINTER_NAME=...)');
    }
  }
);

/* Server config xabari: { type: 'config', config: { mode, printerName, ... } } */
function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  if (cfg.mode) {
    const m = String(cfg.mode).toLowerCase();
    // Server host'siz 'network' rejim yuborsa — bu rejim baribir ishlamaydi
    // (ulanadigan manzil yo'q). Bunday holda .env dagi 'windows' rejim qoladi.
    if (m === 'network' && !cfg.host && MODE === 'windows') {
      console.log('[PRINT] Server network rejimini yubordi, lekin host bo\'sh — windows rejim qoladi');
    } else if (m !== MODE) {
      MODE = m;
      console.log('[PRINT] Printer mode (server config): ' + MODE);
    }
  }
  if (typeof cfg.printerName === 'string' && cfg.printerName.trim() && cfg.printerName.trim() !== PRINTER_NAME) {
    PRINTER_NAME = cfg.printerName.trim();
    console.log('[PRINT] Printer name (server config): ' + PRINTER_NAME);
  }
  if (cfg.port) PORT = parseInt(cfg.port, 10) || PORT;
  if (typeof cfg.host === 'string' && cfg.host) HOST = cfg.host;
}

/* ===== WebSocket: qayta ulanish + osilib qolgan ulanishni aniqlash ===== */
let RECONNECT_DELAY = 3000;
let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('[PRINT] Qayta ulanish ' + Math.round(RECONNECT_DELAY / 1000) + ' soniyadan keyin...');
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_DELAY);
  RECONNECT_DELAY = Math.min(30000, Math.round(RECONNECT_DELAY * 1.5));
}

function connect() {
  const url = SERVER_URL.replace(/\/+$/, '') + '/ws?token=' + encodeURIComponent(TOKEN);
  console.log('Ulanmoqda:', url);
  const ws = new WebSocket(url, { handshakeTimeout: 15000, perMessageDeflate: false });
  let lastTraffic = Date.now();
  let hb = null;

  ws.on('open', () => {
    lastTraffic = Date.now();
    RECONNECT_DELAY = 3000;
    console.log('[PRINT] WebSocket connected. Chek kutulmoqda...');
    // Internet uzilib TCP "osilib" qolsa 'close' hodisasi kelmasligi mumkin —
    // agent ulangan deb o'ylab turadi va chek chiqmaydi. Shuning uchun har 25 s
    // ping yuboramiz, 90 s javob bo'lmasa ulanishni uzamiz va qayta ulanamiz.
    hb = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastTraffic > 90000) {
        console.error('[PRINT] Serverdan 90 soniya javob yo\'q — ulanish osilgan, qayta ulanaman');
        clearInterval(hb);
        try { ws.terminate(); } catch (e) { /* ignore */ }
        return;
      }
      try { ws.ping(); } catch (e) { /* ignore */ }
    }, 25000);
  });

  ws.on('ping', () => { lastTraffic = Date.now(); });
  ws.on('pong', () => { lastTraffic = Date.now(); });

  ws.on('message', m => {
    lastTraffic = Date.now();
    try {
      const d = JSON.parse(m);
      if (d.type === 'print') {
        if (!d.receipt) { console.error('[PRINT ERROR] print xabari cheksiz keldi'); return; }
        console.log('[PRINT] Print command received (chek ' + d.receipt.receipt_no + ')');
        console.log('[PRINT] Receipt generated');
        console.log('[PRINT] Paper width: 80mm');
        console.log('[PRINT] Printer: ' + PRINTER_NAME);
        QUEUE.add({ kind: 'print', receipt: d.receipt, reprint: !!d.reprint });
      } else if (d.type === 'test-print') {
        console.log('[PRINT] Test print command received');
        QUEUE.add({ kind: 'test' });
      } else if (d.type === 'config') {
        applyConfig(d.config);
      } else if (d.type === 'hello') {
        // server salomi — hech narsa qilish shart emas
      }
    } catch (e) { console.error('[PRINT ERROR] Xabar qayta ishlashda xato:', e.message); }
  });

  ws.on('close', () => {
    if (hb) clearInterval(hb);
    console.log('[PRINT] WebSocket uzildi');
    scheduleReconnect();
  });

  ws.on('error', e => console.error('[PRINT ERROR] WebSocket:', e.message));
  return ws;
}

/* ===== Log fayli — do'kondagi kompyuterda muammoni tekshirish uchun ===== */
const LOG_FILE = path.join(__dirname, 'agent.log');
function startFileLog() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
      try { fs.unlinkSync(LOG_FILE + '.1'); } catch (e) { /* ignore */ }
      fs.renameSync(LOG_FILE, LOG_FILE + '.1');
    }
    const st = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' });
    const fmt = a => a.map(x => {
      if (typeof x === 'string') return x;
      if (x && x.stack) return x.stack;
      try { return JSON.stringify(x); } catch (e) { return String(x); }
    }).join(' ');
    const ol = console.log.bind(console);
    const oe = console.error.bind(console);
    console.log = (...a) => { ol(...a); try { st.write('[' + stamp() + '] ' + fmt(a) + '\n'); } catch (e) { /* ignore */ } };
    console.error = (...a) => { oe(...a); try { st.write('[' + stamp() + '] XATO: ' + fmt(a) + '\n'); } catch (e) { /* ignore */ } };
  } catch (e) { /* log yozilmasa ham agent ishlashda davom etadi */ }
}

/* Test chop: node agent.js --test */
if (require.main === module) {
  startFileLog();
  process.on('uncaughtException', e => console.error('[PRINT FATAL] Kutilmagan xato (agent ishlashda davom etadi):', e && (e.stack || e.message)));
  process.on('unhandledRejection', e => console.error('[PRINT FATAL] Ushlanmagan promise:', e && (e.stack || e.message)));

  if (process.argv.includes('--test')) {
    console.log('[PRINT] Test chek yuborilmoqda...');
    console.log('[PRINT] Paper width: 80mm');
    console.log('[PRINT] Printer: ' + PRINTER_NAME);
    QUEUE.add({ kind: 'test', maxAttempts: 2 });
    QUEUE.idle().then(() => process.exit(0));
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
      const n = QUEUE.loadLeftovers();
      if (n) console.log('[PRINT] Chop etilmagan ' + n + ' ta chek topildi — qayta yuborilmoqda');
      QUEUE.start();
      connect();
    });
  }
} else {
  // Modul sifatida chaqirilganda (dizaynni va navbatni tekshirish uchun)
  module.exports = { buildEscpos, buildTestReceipt, printBuf, createQueue };
}
