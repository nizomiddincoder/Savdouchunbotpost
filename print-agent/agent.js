// Chek print agenti — do'kondagi 24/7 yoniq Windows kompyuterda ishlaydi.
// Serverga WebSocket orqali ulanib turadi, yangi savdo tushishi bilan chekni chop etadi.
// USB XPrinter: Windows'da oddiy printer sifatida o'rnatiladi, agent ESC/POS baytlarni
// to'g'ridan-to'g'ri Windows print spooler orqali (winspool RAW) yuboradi.
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
let PRINTER_NAME = process.env.PRINTER_NAME || '';                    // Windows'dagi printer nomi (bo'sh joy bo'lsa ham bo'ladi)
const HOST0 = process.env.PRINTER_HOST || '192.168.1.50';
let PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
const SHARE = process.env.PRINTER_SHARE || '';

let HOST = HOST0;

const PS_SCRIPT = path.join(__dirname, 'print-raw.ps1');

function sanitize(s) {
  return String(s == null ? '' : s)
    .replace(/[\u2018\u2019\u02BC\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E]/g, '');
}
function fmt(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function wrap(t, w) {
  const words = sanitize(t).split(' ');
  const lines = [];
  let cur = '';
  for (const wd of words) {
    if ((cur + (cur ? ' ' : '') + wd).length <= w) cur += (cur ? ' ' : '') + wd;
    else { if (cur) lines.push(cur); cur = wd.slice(0, w); }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// ESC/POS — termal printerlar uchun umumiy protokol (o'zgarmas)
function buildEscpos(r, reprint) {
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
  const lr = (l, rt) => {
    l = sanitize(l); rt = sanitize(rt);
    if (l.length > W - rt.length - 1) l = l.slice(0, W - rt.length - 1);
    text(l + ' '.repeat(Math.max(1, W - l.length - rt.length)) + rt);
    nl();
  };
  const sep = () => { text('-'.repeat(W)); nl(); };
  const bold = on => push(0x1b, 0x45, on ? 1 : 0);

  push(0x1b, 0x40); // init
  push(0x1b, 0x61, 0x01); bold(1); center(r.shop_name || 'CHEK'); bold(0);
  if (r.shop_phone) center(r.shop_phone);
  push(0x1b, 0x61, 0x00);
  sep();
  lr('Chek #' + String(r.receipt_no).padStart(6, '0'), sanitize(r.datetime_local || '').slice(0, 16));
  text('Sotuvchi: ' + (r.seller_name || '')); nl();
  text('Xaridor: ' + (r.customer_name || '')); nl();
  if (r.customer_phone) { text('Tel: ' + r.customer_phone); nl(); }
  sep();
  for (const it of (r.items || [])) {
    for (const ln of wrap(it.name, W)) { text(ln); nl(); }
    lr('  ' + it.qty + ' x ' + fmt(it.price_uzs), fmt(it.line_total_uzs));
  }
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
  if (r.is_cancelled) {
    bold(1); push(0x1b, 0x61, 0x01); center('*** BEKOR QILINGAN ***'); push(0x1b, 0x61, 0x00); bold(0);
  }
  if (reprint) { push(0x1b, 0x61, 0x01); center('[qayta chop etilgan]'); push(0x1b, 0x61, 0x00); }
  sep();
  push(0x1b, 0x61, 0x01); center('Rahmat! Yana kutamiz!'); push(0x1b, 0x61, 0x00);
  nl(); nl(); nl();
  push(0x1d, 0x56, 0x42, 0x00); // chekni kesish
  return Buffer.from(a);
}

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
    console.log('[PRINT] Sending ESC/POS data...');
    console.log('[PRINT] Printer name: ' + name);
    execFile('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, '-PrinterName', name, '-FilePath', tmp],
      { timeout: 30000, windowsHide: true },
      (err, stdout, stderr) => {
        const out = String(stdout || '');
        if (!err && /PRINTED/.test(out)) {
          console.log('[PRINT] Print job sent successfully (Windows spooler)');
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

/* Windows'dagi o'rnatilgan printerni ro'yxati (PRINTER_NAME berilmaganda yordam uchun) */
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
    try {
      await printWindows(PRINTER_NAME, buf);
    } catch (e) {
      console.error('[PRINT ERROR] ' + e.message);
    }
  } else if (MODE === 'network') {
    const s = net.connect(PORT, HOST, () => {
      s.write(buf);
      s.end();
      console.log('[PRINT] Print job sent successfully (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
    });
    s.on('error', e => console.error('[PRINT ERROR] Printer xatosi:', e.message));
  } else if (MODE === 'share' && SHARE) {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '.bin');
    fs.writeFileSync(tmp, buf);
    execFile('cmd', ['/c', 'copy', '/b', tmp, SHARE], err => {
      if (err) console.error('[PRINT ERROR] Windows ulash printeri xatosi (SHARE nomini tekshiring):', err.message);
      else console.log('[PRINT] Print job sent successfully (Windows ulash):', SHARE, 'chek', r.receipt_no);
      fs.unlink(tmp, () => {});
    });
  } else {
    console.log('[PRINT] (console rejimi — chop etilmadi) Chek', r.receipt_no, fmt(r.total_uzs), "so'm");
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
        console.log('[PRINT] Printer mode: ' + MODE);
        printBuf(buildEscpos(d.receipt, d.reprint), d.receipt || {});
      } else if (d.type === 'test-print') {
        console.log('[PRINT] Test print command received');
        console.log('[PRINT] Printer mode: ' + MODE);
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
