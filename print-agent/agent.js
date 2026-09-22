// Chek print agenti — do'kondagi 24/7 yoniq kompyuterda ishlaydi.
// Serverga WebSocket orqali ulanib turadi, yangi savdo tushishi bilan chekni chop etadi.
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
const MODE = (process.env.PRINTER_MODE || 'console').toLowerCase(); // network | windows | console
const HOST = process.env.PRINTER_HOST || '192.168.1.50';
const PORT = parseInt(process.env.PRINTER_PORT || '9100', 10);
const SHARE = process.env.PRINTER_SHARE || '';

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

// ESC/POS — termal printerlar uchun umumiy protokol
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
  sep();
  for (const it of (r.items || [])) {
    for (const ln of wrap(it.name, W)) { text(ln); nl(); }
    lr('  ' + it.qty + ' x ' + fmt(it.price_uzs), fmt(it.line_total_uzs));
  }
  sep();
  bold(1); lr('JAMI:', fmt(r.total_uzs) + " so'm"); bold(0);
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

function printBuf(buf, r) {
  if (MODE === 'network') {
    const s = net.connect(PORT, HOST, () => {
      s.write(buf);
      s.end();
      console.log('✅ Chop etildi (tarmoq):', HOST + ':' + PORT, 'chek', r.receipt_no);
    });
    s.on('error', e => console.error('❌ Printer xatosi:', e.message));
  } else if (MODE === 'windows' && SHARE) {
    const tmp = path.join(os.tmpdir(), 'chek-' + Date.now() + '.bin');
    fs.writeFileSync(tmp, buf);
    execFile('cmd', ['/c', 'copy', '/b', tmp, SHARE], err => {
      if (err) console.error('❌ Windows printer xatosi (SHARE nomini tekshiring):', err.message);
      else console.log('✅ Chop etildi (Windows ulash):', SHARE, 'chek', r.receipt_no);
      fs.unlink(tmp, () => {});
    });
  } else {
    console.log('--- CHEK (konsol rejimi, PRINTER_MODE ni tanlang) ---');
    console.log(r.shop_name, '#' + r.receipt_no, r.total_uzs, "so'm");
  }
}

function connect() {
  const url = SERVER_URL.replace(/\/+$/, '') + '/ws?token=' + encodeURIComponent(TOKEN);
  console.log('Ulanmoqda:', url);
  const ws = new WebSocket(url);
  ws.on('open', () => console.log('✅ Serverga ulandi. Chek kutulmoqda...'));
  ws.on('message', m => {
    try {
      const d = JSON.parse(m);
      if (d.type === 'print') printBuf(buildEscpos(d.receipt, d.reprint), d.receipt);
    } catch (e) { console.error('Xato:', e.message); }
  });
  ws.on('close', () => {
    console.log('⚠️ Uzildi, 5 soniyadan keyin qayta urinaman...');
    setTimeout(connect, 5000);
  });
  ws.on('error', () => {});
}
connect();
