'use strict';
/* ===== Savdo — Telegram Mini App + Admin panel + POS ===== */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }

const app = document.getElementById('app');
const $ = id => document.getElementById(id);
let TOKEN = localStorage.getItem('token') || '';
let ME = null;
let CACHE = { products: [], usd_rate: 0, shop_name: '', shop_phone: '' };
let cart = {};          // sotuvchi savati: product_id -> qty
let custCache = [];     // oxirgi yuklangan mijozlar ro'yxati
let custTotal = 0;
let ADMIN_TAB = 'dash';
const QTY_MAX = 999999;

/* ===== SVG ikonlar (bir xil uslubdagi chiziqli ikonlar) ===== */
const IC = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.3a1.8 1.8 0 0 0 1.8 1.4h8.6a1.8 1.8 0 0 0 1.7-1.3L21.5 7.5H6"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  box: '<path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5z"/><path d="M3 8.5 12 14l9-5.5M12 14v7"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userPlus: '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 13.5-4.5M19 14v6M16 17h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M15 8l2 2"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5" rx="1"/><rect x="12" y="8" width="3" height="9" rx="1"/><rect x="17" y="5" width="3" height="12" rx="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  sheet: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8M12 11v8"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 14h6M9 17h4"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v13H5a2 2 0 0 1-2-2V5"/><path d="M16 13.5h.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  arrowUR: '<path d="M7 17 17 7M8 7h9v9"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  store: '<path d="M3 9 4.5 4h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
  trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  backspace: '<path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m17 9-6 6M11 9l6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  sort: '<path d="M3 6h18M6 12h12M10 18h4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};
function icon(n, cls) {
  return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';
}

/* ===== Yordamchilar ===== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function money(n) { return fmt(n) + " so'm"; }
function fmtUsd(n) { return (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ','); }
function fmtShort(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '').replace('.', ',') + ' mlrd';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '').replace('.', ',') + ' mln';
  if (n >= 1e3) return Math.round(n / 1e3) + ' ming';
  return String(Math.round(n));
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
const AV_COLORS = ['#178a4f', '#e08a12', '#3b6fd8', '#c2417a', '#7c4fd6', '#0f8b8d', '#b8572a'];
function avatar(name, size) {
  let h = 0; for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return '<span class="avatar"' + ' style="background:' + AV_COLORS[h % AV_COLORS.length] + (size ? ';width:' + size + 'px;height:' + size + 'px' : '') + '">' + esc(initials(name)) + '</span>';
}
const PAY = {
  naqd: { label: 'Naqd', ic: 'cash' },
  karta: { label: 'Karta', ic: 'card' },
  nasiya: { label: 'Nasiya', ic: 'book' }
};
function payLabel(k) { return (PAY[k] || PAY.naqd).label; }
function chekNo(n) { return '#' + String(n).padStart(6, '0'); }
const UZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const UZ_WD = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
function todayStr() { return new Date().toLocaleDateString('sv-SE'); }
function niceDate(d) { const x = new Date(d); return x.getDate() + ' ' + UZ_MONTHS[x.getMonth()] + ', ' + x.getFullYear(); }

/* ===== Tungi rejim ===== */
let THEME = localStorage.getItem('theme') || 'light';
function applyTheme() { document.body.classList.toggle('dark', THEME === 'dark'); }
function toggleTheme() {
  THEME = THEME === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', THEME);
  applyTheme();
  document.querySelectorAll('.btnTheme').forEach(b => {
    b.innerHTML = icon(THEME === 'dark' ? 'sun' : 'moon');
    b.title = THEME === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim';
  });
}
function themeBtnHtml() {
  return '<button class="icon-btn btnTheme" title="' + (THEME === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim') + '" aria-label="Rejimni almashtirish">' + icon(THEME === 'dark' ? 'sun' : 'moon') + '</button>';
}
document.addEventListener('click', e => { if (e.target.closest('.btnTheme')) toggleTheme(); });
applyTheme();

/* ===== Lotin / Kirill yozuv ===== */
let SCRIPT = localStorage.getItem('script') || 'latin';
const CYR_SKIP = /\b(Excel|PDF|PIN|USD|UZS|OK|ID|IP|Ctrl|Enter|F2)\b/gi;
const CYR_D = { 'sh': 'ш', 'ch': 'ч', 'yo': 'ё', 'yu': 'ю', 'ya': 'я', 'ye': 'е', "o'": 'ў', 'o`': 'ў', "g'": 'ғ', 'g`': 'ғ', 'ng': 'нг' };
const CYR_L = { a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з' };
const LAT_M = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': "g'", 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'қ': 'q', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ў': "o'", 'ф': 'f', 'х': 'x', 'ҳ': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ь': '', 'ы': 'i', 'э': 'e', 'ю': 'yu', 'я': 'ya' };

function latinToCyr(s) {
  s = String(s);
  if (!/[a-zA-Z]/.test(s)) return s;
  const keep = [];
  s = s.replace(CYR_SKIP, m => '\u0001' + (keep.push(m) - 1) + '\u0001');
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
  return out.replace(/\u0001(\d+)\u0001/g, (_, n) => keep[+n]);
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
function tsc(s) { return SCRIPT === 'cyrillic' ? latinToCyr(s) : cyrToLat(s); }

function walkScript(root) {
  if (!root || root.nodeType !== 1) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.parentElement && n.parentElement.closest('.no-trans')) continue;
    const v = tsc(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  root.querySelectorAll('input[placeholder]').forEach(i => {
    const v = tsc(i.placeholder);
    if (v !== i.placeholder) i.placeholder = v;
  });
}
const scriptMo = new MutationObserver(ms => {
  for (const m of ms) {
    if (m.type === 'childList') m.addedNodes.forEach(n => {
      if (n.nodeType === 3) {
        if (n.parentElement && n.parentElement.closest('.no-trans')) return;
        const v = tsc(n.nodeValue);
        if (v !== n.nodeValue) n.nodeValue = v;
      } else if (n.nodeType === 1) walkScript(n);
    });
    else if (m.type === 'characterData') {
      if (m.target.parentElement && m.target.parentElement.closest('.no-trans')) return;
      const v = tsc(m.target.nodeValue);
      if (v !== m.target.nodeValue) m.target.nodeValue = v;
    }
  }
});
scriptMo.observe(document.body, { childList: true, subtree: true, characterData: true });

function scriptBtnHtml() {
  return '<button class="icon-btn btnScript no-trans" title="Lotin / Кирилл" aria-label="Yozuvni almashtirish">' + (SCRIPT === 'latin' ? 'Кир' : 'Лот') + '</button>';
}
function toggleScript() {
  SCRIPT = SCRIPT === 'latin' ? 'cyrillic' : 'latin';
  localStorage.setItem('script', SCRIPT);
  walkScript(document.body);
  document.querySelectorAll('.btnScript').forEach(b => b.textContent = b.classList.contains('link-btn')
    ? (SCRIPT === 'latin' ? 'Кирилл' : 'Lotin') : (SCRIPT === 'latin' ? 'Кир' : 'Лот'));
}
document.addEventListener('click', e => { if (e.target.closest('.btnScript')) toggleScript(); });

/* Qidiruv: so'zning lotin/kirill variantlari — "ali" yozilsa "Али" ham topiladi */
function qVariants(w) {
  w = String(w || '').toLowerCase().replace(/[`ʻʼ‘’]/g, "'");
  return [...new Set([w, latinToCyr(w).toLowerCase(), cyrToLat(w).toLowerCase()].filter(Boolean))];
}
function matchQ(text, q) {
  const words = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const t = String(text || '').toLowerCase();
  return words.every(w => qVariants(w).some(v => t.includes(v)));
}
// Topilgan qismni ajratib ko'rsatish (lotin/kirill variantlari bilan)
function hl(text, q) {
  text = String(text == null ? '' : text);
  const words = String(q || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return esc(text);
  const parts = [];
  words.forEach(w => qVariants(w).forEach(v => parts.push(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  const digits = String(q).replace(/\D/g, '');
  if (digits.length >= 2) parts.push(digits);
  const re = new RegExp('(' + parts.join('|') + ')', 'gi');
  return text.split(re).map((p, i) => i % 2 ? '<mark>' + esc(p) + '</mark>' : esc(p)).join('');
}

let toastT;
function toast(msg, ok) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.innerHTML = (ok ? icon('checkCircle', 's') : '') + '<span>' + esc(msg) + '</span>';
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && TOKEN) { TOKEN = ''; localStorage.removeItem('token'); renderLogin(); }
    throw new Error(d.error || 'Xato: ' + r.status);
  }
  return d;
}

async function compressImage(file) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const MAX = 500;
  const sc = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * sc));
  c.height = Math.max(1, Math.round(img.height * sc));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

function productThumb(p, cls) {
  return '<div class="' + (cls || 'thumb') + '">' +
    (p.has_image ? '<img loading="lazy" alt="" src="/api/products/' + p.id + '/image" onerror="this.remove()">' : '') +
    (p.has_image ? '' : '<span class="ph">' + icon('box') + '</span>') + '</div>';
}

/* ===== Modal ===== */
function openModal(html, wide) {
  let root = $('modalRoot');
  if (!root) { root = document.createElement('div'); root.id = 'modalRoot'; document.body.appendChild(root); }
  root.innerHTML = '<div class="modal-back" id="modalBack"><div class="modal' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
  $('modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack') closeModal(); });
}
function closeModal() {
  const r = $('modalRoot');
  if (r) r.innerHTML = '';
}
function modalOpen() { const r = $('modalRoot'); return !!(r && r.innerHTML); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOpen()) closeModal(); });

function askModal(title, opts = {}) {
  return new Promise(resolve => {
    openModal(
      '<h3>' + (opts.danger ? icon('alert') : '') + esc(title) + '</h3>' +
      (opts.text ? '<div class="muted">' + esc(opts.text) + '</div>' : '') +
      (opts.input ? '<input class="inp" id="askInp" placeholder="' + esc(opts.placeholder || '') + '"' + (opts.numeric ? ' inputmode="numeric"' : '') + '>' : '') +
      '<div class="modal-btns">' +
      '<button class="btn ghost" id="askNo">Bekor qilish</button>' +
      '<button class="btn ' + (opts.danger ? 'danger' : '') + '" id="askYes">' + esc(opts.okText || 'Tasdiqlash') + '</button></div>'
    );
    const done = v => { closeModal(); resolve(v); };
    $('askNo').onclick = () => done(null);
    $('askYes').onclick = () => done(opts.input ? $('askInp').value.trim() : true);
    if (opts.input) {
      $('askInp').focus();
      $('askInp').onkeydown = e => { if (e.key === 'Enter') $('askYes').click(); };
    }
  });
}

/* ===== Kirish ===== */
function saveLogin(d) {
  TOKEN = d.token;
  ME = d.me;
  localStorage.setItem('token', TOKEN);
  cart = {};
  boot();
}
function logout() {
  TOKEN = '';
  ME = null;
  localStorage.removeItem('token');
  renderLogin();
}
async function confirmLogout() { if (await askModal('Tizimdan chiqmoqchimisiz?', { okText: 'Chiqish' })) logout(); }

function renderLogin() {
  app.innerHTML =
    '<div class="login-wrap"><div class="login-card">' +
    '<div class="logo">' + icon('cart') + '</div><h2>Savdo</h2>' +
    '<div class="muted sm">Sotuvchi PIN kodini kiriting</div>' +
    '<div class="pin-dots" id="pinDots" aria-live="polite"></div>' +
    '<div class="numpad" id="numpad">' +
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button class="np-btn" data-k="' + n + '">' + n + '</button>').join('') +
    '<button class="np-btn" data-k="del" aria-label="O\'chirish">' + icon('backspace') + '</button>' +
    '<button class="np-btn" data-k="0">0</button>' +
    '<button class="np-btn ok" data-k="ok" aria-label="Tasdiqlash">' + icon('check') + '</button>' +
    '</div>' +
    '<button class="link-btn" id="adminToggle">' + icon('lock', 's') + 'Admin kirish</button>' +
    '<form id="adminForm" class="admin-form" hidden>' +
    '<input class="inp" id="aUser" placeholder="Login" autocomplete="username">' +
    '<input class="inp" id="aPass" type="password" placeholder="Parol" autocomplete="current-password">' +
    '<button class="btn big" type="submit">Kirish</button></form>' +
    '<div><button class="link-btn btnScript no-trans">' + (SCRIPT === 'latin' ? 'Кирилл' : 'Lotin') + '</button></div>' +
    '</div></div>';

  let pin = '';
  const dots = $('pinDots');
  const upd = () => { dots.innerHTML = [0, 1, 2, 3].map(i => '<span class="dot' + (i < pin.length ? ' on' : '') + '"></span>').join(''); };
  upd();
  const press = async k => {
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') return;
    else if (pin.length < 4) pin += k;
    upd();
    if (pin.length === 4) {
      try { saveLogin(await api('/auth/login-pin', { method: 'POST', body: { pin } })); }
      catch (err) { toast(err.message); pin = ''; upd(); }
    }
  };
  $('numpad').onclick = e => { const b = e.target.closest('.np-btn'); if (b) press(b.dataset.k); };
  document.onkeydown = e => {
    if (!$('numpad') || document.activeElement.tagName === 'INPUT') return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  $('adminToggle').onclick = () => { const f = $('adminForm'); f.hidden = !f.hidden; if (!f.hidden) $('aUser').focus(); };
  $('adminForm').onsubmit = async e => {
    e.preventDefault();
    try {
      saveLogin(await api('/auth/login-admin', { method: 'POST', body: { username: $('aUser').value, password: $('aPass').value } }));
    } catch (err) { toast(err.message); }
  };
}

/* ==========================================================
   SOTUVCHI (Telegram mini app)
   ========================================================== */
async function renderSeller() {
  document.onkeydown = null;
  let d;
  try { d = await api('/products'); } catch (e) { return; }
  CACHE = d;
  cart = {};
  app.innerHTML =
    '<header class="topbar">' +
    '<div><div class="shop-name">' + esc(d.shop_name) + '</div><div class="muted sm">' + esc(ME.name) + '</div></div>' +
    '<div class="tb-right">' +
    '<button class="icon-btn" id="btnRefresh" title="Yangilash" aria-label="Yangilash">' + icon('refresh') + '</button>' +
    '<button class="icon-btn" id="btnAddP" title="Mahsulot qo\'shish" aria-label="Mahsulot qo\'shish">' + icon('plus') + '</button>' +
    '<button class="icon-btn" id="btnKab" title="Kabinetim" aria-label="Kabinetim">' + icon('chart') + '</button>' +
    scriptBtnHtml() + themeBtnHtml() +
    '<button class="icon-btn danger" id="btnLogout" title="Chiqish" aria-label="Chiqish">' + icon('logout') + '</button>' +
    '</div></header>' +
    '<div class="wrap" id="mainWrap">' +
    '<div class="search-box" style="margin:6px 0 12px">' + icon('search') + '<input id="search" class="search" placeholder="Mahsulot izlash..." autocomplete="off"></div>' +
    '<div id="grid" class="grid"></div>' +
    '</div>' +
    '<div id="cartBar" class="cart-bar" hidden></div>';

  renderGrid('');
  $('search').oninput = e => renderGrid(e.target.value);
  $('btnRefresh').onclick = () => renderSeller();
  $('btnAddP').onclick = () => openAddProduct(null);
  $('btnKab').onclick = () => renderKabinet();
  $('btnLogout').onclick = confirmLogout;
  $('grid').onclick = e => { const c = e.target.closest('.card'); if (c) addToCart(+c.dataset.id); };
  $('cartBar').onclick = e => { if (e.target.closest('#btnCart')) openCart(); };
}

function renderGrid(filter) {
  const grid = $('grid');
  if (!grid) return;
  const list = CACHE.products.filter(p => matchQ(p.name, filter));
  grid.innerHTML = list.length ? list.map(p =>
    '<div class="card' + (cart[p.id] ? ' in-cart' : '') + '" data-id="' + p.id + '" role="button" tabindex="0">' +
    (cart[p.id] ? '<span class="qty-badge">' + cart[p.id] + '</span>' : '') +
    productThumb(p) +
    '<div class="pname">' + esc(p.name) + '</div>' +
    '<div class="pprice">' + fmt(p.price_uzs) + " so'm</div>" +
    (p.currency === 'USD' ? '<div class="porig">$' + fmtUsd(p.price) + '</div>' : '') +
    '</div>'
  ).join('') : '<div class="empty">' + icon('search') + 'Mahsulot topilmadi</div>';
}

function addToCart(id) {
  cart[id] = Math.min((cart[id] || 0) + 1, QTY_MAX);
  updateCartBar();
  renderGrid($('search') ? $('search').value : '');
}
function cartItems() {
  return Object.keys(cart).map(k => ({ p: CACHE.products.find(x => x.id === +k), qty: cart[k] })).filter(x => x.p);
}
function cartTotal() { return cartItems().reduce((a, it) => a + it.p.price_uzs * it.qty, 0); }
function updateCartBar() {
  const bar = $('cartBar');
  if (!bar) return;
  const items = cartItems();
  if (!items.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  const count = items.reduce((a, it) => a + it.qty, 0);
  bar.hidden = false;
  bar.innerHTML =
    '<div class="cb-info"><b>' + count + ' ta mahsulot</b><span class="muted sm">' + money(cartTotal()) + '</span></div>' +
    '<button class="btn" id="btnCart">' + icon('cart', 's') + 'Savat' + icon('arrowR', 's') + '</button>';
}

async function loadCustomers(qv, limit) {
  try {
    const d = await api('/customers/list?limit=' + (limit || 300) + (qv ? '&q=' + encodeURIComponent(qv) : ''));
    custCache = d.customers || [];
    custTotal = d.total || 0;
  } catch (e) {
    custCache = [];
    custTotal = 0;
  }
  return custCache;
}

function custPickRow(c, q, active) {
  return '<div class="cust-pick' + (active ? ' act' : '') + '" data-cid="' + c.id + '" role="option">' +
    avatar(c.name, 34) +
    '<div class="cp-main"><b>' + hl(c.name, q) + '</b>' +
    '<div class="muted sm">' + (c.phone ? hl(c.phone, q) : 'telefon yo\'q') +
    ' · ' + c.visits + ' ta savdo' + (c.last_visit ? ' · ' + esc(c.last_visit.slice(0, 10)) : '') + '</div></div>' +
    (Number(c.debt) > 0 ? '<span class="badge b-no nodot">' + fmtShort(c.debt) + '</span>' : '') +
    '</div>';
}

/* Narxni o'zgartirish maydoni (savat qatori uchun) */
function priceEditor(pid, base, cur) {
  const changed = cur !== base;
  return '<div class="price-line muted sm">' +
    '<input class="price-inp' + (changed ? ' changed' : '') + '" data-pid="' + pid + '" type="number" min="0" step="1" inputmode="numeric" value="' + cur + '" aria-label="Narx" title="Narxni o\'zgartirish">' +
    ' so\'m' + (changed ? ' <span class="old-price">' + fmt(base) + '</span>' : '') + '</div>';
}

async function openCart() {
  const items = cartItems();
  if (!items.length) return;
  let pay = 'naqd';
  const customPrice = {};   // product_id -> sotuvchi o'zgartirgan narx (UZS)
  openModal(
    '<h3>' + icon('cart') + 'Savat</h3>' +
    '<div id="cartList"></div>' +
    '<div class="hint">' + icon('tag') + 'Narxni o\'zgartirish uchun narx maydoniga yangi summani yozing</div>' +
    '<label class="lbl">Xaridor *</label>' +
    '<div class="cust-actions">' +
    '<button type="button" class="btn ghost" id="btnOldCust">' + icon('user', 's') + 'Eski mijoz</button>' +
    '<button type="button" class="btn ghost" id="btnNewCust">' + icon('userPlus', 's') + 'Yangi mijoz</button>' +
    '</div>' +
    '<div id="custSelected" class="cust-box" hidden></div>' +
    '<div id="custNewBox" hidden>' +
    '<input id="newCustName" class="inp" placeholder="Ismi *" autocomplete="off" style="margin-top:10px">' +
    '<input id="newCustPhone" class="inp" type="tel" inputmode="tel" placeholder="Telefon raqami * (masalan: 901234567)" autocomplete="off" style="margin-top:8px">' +
    '<button type="button" class="btn big" id="btnCreateCust" style="margin-top:8px">' + icon('check', 's') + 'Mijozni yaratish</button>' +
    '</div>' +
    '<div id="custPicker" hidden>' +
    '<div class="search-box" style="margin-top:10px">' + icon('search') + '<input id="custSearch" class="search" placeholder="Ism yoki telefon bo\'yicha izlash..." autocomplete="off"></div>' +
    '<div class="cust-list" id="custList" role="listbox"></div>' +
    '</div>' +
    '<div class="debt-box" id="debtBox" hidden></div>' +
    '<label class="lbl">To\'lov usuli</label>' +
    '<div class="seg" id="paySel">' +
    Object.keys(PAY).map(k => '<button type="button" class="' + (k === 'naqd' ? 'on' : '') + '" data-pay="' + k + '">' + icon(PAY[k].ic) + PAY[k].label + '</button>').join('') +
    '</div>' +
    '<div class="total-row"><span>Jami:</span><b id="cartTotalEl"></b></div>' +
    '<div class="total-row total-debt" id="debtTotalRow" hidden><span>Umumiy (eski nasiya bilan):</span><b id="debtTotalEl"></b></div>' +
    '<button class="btn big" id="btnSell" style="margin-top:10px">' + icon('check') + 'Sotish</button>'
  );

  let selected = null;
  let busyCust = false;
  let actIdx = -1;
  const selectedEl = $('custSelected');
  const pickerEl = $('custPicker');
  const newBox = $('custNewBox');
  const priceOf = it => (customPrice[it.p.id] != null ? customPrice[it.p.id] : it.p.price_uzs);
  const total = () => cartItems().reduce((a, it) => a + priceOf(it) * it.qty, 0);

  const renderRows = () => {
    $('cartList').innerHTML = cartItems().map(it => {
      const pr = priceOf(it);
      return '<div class="cart-row" data-id="' + it.p.id + '">' +
        '<div class="cr-name">' + esc(it.p.name) + priceEditor(it.p.id, it.p.price_uzs, pr) + '</div>' +
        '<div class="cr-qty"><button class="qbtn" data-act="minus" aria-label="Kamaytirish">' + icon('minus') + '</button>' +
        '<input class="qv-inp" data-pid="' + it.p.id + '" type="number" min="1" max="' + QTY_MAX + '" step="1" inputmode="numeric" value="' + it.qty + '" aria-label="Soni">' +
        '<button class="qbtn" data-act="plus" aria-label="Ko\'paytirish">' + icon('plus') + '</button></div>' +
        '<div class="cr-sum" data-sum="' + it.p.id + '">' + money(pr * it.qty) + '</div>' +
        '</div>';
    }).join('');
  };
  const recalc = () => {
    $('cartTotalEl').textContent = money(total());
    const old = selected ? Number(selected.debt || 0) : 0;
    const box = $('debtBox');
    if (old > 0) { box.hidden = false; box.innerHTML = icon('book', 's') + '<span>' + esc(selected.name) + 'ning eski nasiyasi: <b>' + money(old) + '</b></span>'; }
    else box.hidden = true;
    const row = $('debtTotalRow');
    if (pay === 'nasiya' && old > 0) { row.hidden = false; $('debtTotalEl').textContent = money(total() + old); }
    else row.hidden = true;
  };
  const updSum = pid => {
    const it = cartItems().find(x => x.p.id === pid);
    const sumEl = document.querySelector('#cartList [data-sum="' + pid + '"]');
    if (it && sumEl) sumEl.textContent = money(priceOf(it) * it.qty);
  };

  const showSelected = () => {
    if (!selected) { selectedEl.hidden = true; selectedEl.innerHTML = ''; recalc(); return; }
    selectedEl.hidden = false;
    selectedEl.innerHTML =
      '<div style="display:flex;gap:10px;align-items:center">' + avatar(selected.name, 34) + '<div><b>' + esc(selected.name) + '</b>' +
      '<div class="muted sm">' + (selected.phone ? esc(selected.phone) : 'telefon kiritilmagan') +
      (Number(selected.debt) > 0 ? ' · qarz: ' + money(selected.debt) : '') + (selected.isNew ? ' · yangi mijoz' : '') + '</div></div></div>' +
      '<button type="button" class="icon-btn sm" id="btnClearCust" title="Boshqa mijoz tanlash" aria-label="Boshqa mijoz">' + icon('x') + '</button>';
    $('btnClearCust').onclick = () => { selected = null; showSelected(); };
    recalc();
  };

  const renderCustList = () => {
    const raw = $('custSearch').value.trim();
    const shown = custCache.length;
    const more = !raw && custTotal > shown ? '<div class="hint" style="padding:8px 12px">Jami ' + custTotal + ' ta mijozdan oxirgi ' + shown + ' tasi — ism yoki telefon bilan izlang</div>' : '';
    $('custList').innerHTML = (shown ? custCache.map((c, i) => custPickRow(c, raw, i === actIdx)).join('')
      : '<div class="empty">' + icon('search') + 'Mijoz topilmadi — "Yangi mijoz" tugmasidan qo\'shing</div>') + more;
  };
  let custSearchT = null;
  let custSeq = 0;
  const loadAndRender = async () => {
    const seq = ++custSeq;
    await loadCustomers($('custSearch').value.trim());
    if (seq !== custSeq) return;
    actIdx = custCache.length ? 0 : -1;
    renderCustList();
  };
  const pick = c => {
    selected = c;
    pickerEl.hidden = true;
    newBox.hidden = true;
    $('custSearch').value = '';
    showSelected();
  };
  $('btnOldCust').onclick = async () => {
    newBox.hidden = true;
    pickerEl.hidden = false;
    $('custSearch').value = '';
    $('custList').innerHTML = '<div class="muted sm" style="padding:12px">Yuklanmoqda...</div>';
    $('custSearch').focus();
    await loadAndRender();
  };
  $('btnNewCust').onclick = () => {
    pickerEl.hidden = true;
    selected = null;
    showSelected();
    newBox.hidden = false;
    $('newCustName').focus();
  };
  $('custSearch').oninput = () => {
    // Avval allaqachon yuklanganlar ichidan darhol filtrlaymiz, keyin serverdan to'liq natija
    const q = $('custSearch').value.trim();
    const local = custCache.filter(c => matchQ(c.name, q) || (q.replace(/\D/g, '').length >= 2 && String(c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))));
    if (local.length) { custCache = local; actIdx = 0; renderCustList(); }
    clearTimeout(custSearchT);
    custSearchT = setTimeout(loadAndRender, 150);
  };
  $('custSearch').onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); actIdx = Math.min(actIdx + 1, custCache.length - 1); renderCustList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actIdx = Math.max(actIdx - 1, 0); renderCustList(); }
    else if (e.key === 'Enter' && custCache[actIdx]) { e.preventDefault(); pick(custCache[actIdx]); }
  };
  $('custList').onclick = e => {
    const row = e.target.closest('.cust-pick');
    if (!row) return;
    const c = custCache.find(x => x.id === +row.dataset.cid);
    if (c) pick(c);
  };

  const createCustomer = async () => {
    const nm = $('newCustName').value.trim();
    const ph = $('newCustPhone').value.trim();
    if (!nm) { toast('Yangi mijoz ismini kiriting'); return null; }
    if (!ph) { toast('Yangi mijoz telefon raqamini kiriting'); return null; }
    if (busyCust) return null;
    busyCust = true;
    const btn = $('btnCreateCust');
    btn.disabled = true;
    try {
      const r = await api('/customers', { method: 'POST', body: { name: nm, phone: ph } });
      selected = { ...r.customer, isNew: true };
      custCache = [];
      newBox.hidden = true;
      $('newCustName').value = '';
      $('newCustPhone').value = '';
      showSelected();
      toast('Yangi mijoz yaratildi', true);
      return selected;
    } catch (e) {
      toast(e.message);
      return null;
    } finally {
      busyCust = false;
      btn.disabled = false;
    }
  };
  $('btnCreateCust').onclick = createCustomer;
  const resolveCustomer = async () => {
    if (selected) return selected;
    if (!newBox.hidden) return await createCustomer();
    toast('Xaridorni tanlang: "Eski mijoz" yoki "Yangi mijoz"');
    return null;
  };
  $('paySel').onclick = e => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    pay = b.dataset.pay;
    document.querySelectorAll('#paySel [data-pay]').forEach(x => x.classList.toggle('on', x === b));
    recalc();
  };

  $('cartList').onclick = e => {
    const b = e.target.closest('.qbtn');
    if (!b) return;
    const id = +b.closest('.cart-row').dataset.id;
    if (b.dataset.act === 'plus') cart[id] = Math.min((cart[id] || 0) + 1, QTY_MAX);
    else { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; }
    renderRows(); recalc(); updateCartBar(); renderGrid($('search') ? $('search').value : '');
    if (!Object.keys(cart).length) closeModal();
  };
  $('cartList').addEventListener('input', e => {
    const pinp = e.target.closest('.price-inp');
    if (pinp) {
      const pid = +pinp.dataset.pid;
      const v = parseInt(pinp.value, 10);
      const it = cartItems().find(x => x.p.id === pid);
      if (isFinite(v) && v >= 0 && it && v !== it.p.price_uzs) customPrice[pid] = v; else delete customPrice[pid];
      pinp.classList.toggle('changed', customPrice[pid] != null);
      updSum(pid); recalc();
      return;
    }
    const inp = e.target.closest('.qv-inp');
    if (!inp) return;
    const pid = +inp.dataset.pid;
    let v = parseInt(inp.value, 10);
    if (isFinite(v) && v >= 1) {
      if (v > QTY_MAX) { v = QTY_MAX; inp.value = v; }
      cart[pid] = v;
      updSum(pid);
    }
    recalc(); updateCartBar();
  });
  $('cartList').addEventListener('change', e => {
    if (e.target.closest('.price-inp')) { renderRows(); return; }
    const inp = e.target.closest('.qv-inp');
    if (!inp) return;
    const pid = +inp.dataset.pid;
    const v = parseInt(inp.value, 10);
    if (v === 0) {
      delete cart[pid];
      renderRows(); recalc(); updateCartBar();
      if (!Object.keys(cart).length) closeModal();
      return;
    }
    if (!isFinite(v) || v < 1) { renderRows(); return; }
    cart[pid] = Math.min(v, QTY_MAX);
    renderRows(); recalc(); updateCartBar(); renderGrid($('search') ? $('search').value : '');
  });
  $('cartList').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest('.qv-inp, .price-inp')) e.target.blur();
  });

  renderRows();
  recalc();

  $('btnSell').onclick = async function () {
    if (!Object.keys(cart).length) return;
    this.disabled = true;
    try {
      const cust = await resolveCustomer();
      if (!cust) { this.disabled = false; return; }
      const d = await api('/sales', {
        method: 'POST',
        body: {
          items: Object.keys(cart).map(k => {
            const o = { product_id: +k, qty: cart[k] };
            if (customPrice[+k] != null) o.price_uzs = customPrice[+k];
            return o;
          }),
          customer_id: cust.id,
          payment_method: pay,
          script: SCRIPT
        }
      });
      cart = {};
      custCache = [];
      updateCartBar();
      renderGrid($('search') ? $('search').value : '');
      openSuccess(d.receipt);
    } catch (e) {
      toast(e.message);
      this.disabled = false;
    }
  };
}

function openSuccess(r, onClose) {
  const oldDebt = Number(r.old_debt_uzs || 0);
  openModal(
    '<div class="m-icon">' + icon('check') + '</div>' +
    '<h3 style="justify-content:center">Sotildi!</h3>' +
    '<div class="receipt-mini">' +
    '<div><b>Chek ' + chekNo(r.receipt_no) + '</b></div>' +
    '<div class="muted sm">' + esc(r.customer_name) + ' · ' + r.items.length + ' ta mahsulot · ' + payLabel(r.payment_method) + '</div>' +
    '<div class="ok-total">' + money(r.total_uzs) + '</div>' +
    (r.payment_method === 'nasiya' && oldDebt > 0
      ? '<div class="muted sm">Eski nasiya: ' + money(oldDebt) + '</div>' +
        '<div class="ok-total" style="color:var(--danger);font-size:18px">Umumiy nasiya: ' + money(r.total_with_debt_uzs) + '</div>'
      : (oldDebt > 0 ? '<div class="sm" style="color:var(--danger)">Eski nasiyasi bor: ' + money(oldDebt) + '</div>' : '')) +
    '</div>' +
    '<div class="muted sm" style="text-align:center">Chek printerga yuborildi. Chiqmagan bo\'lsa — qayta chop eting.</div>' +
    '<div class="modal-btns">' +
    '<button class="btn ghost" id="btnReprint">' + icon('printer', 's') + 'Qayta chop etish</button>' +
    '<button class="btn" id="btnOk2">Yangi savdo</button></div>'
  );
  $('btnReprint').onclick = () => reprint(r.receipt_no);
  $('btnOk2').onclick = () => { closeModal(); if (onClose) onClose(); };
  $('btnOk2').focus();
}

async function reprint(id, script) {
  try {
    await api('/sales/' + id + '/reprint', { method: 'POST', body: script ? { script } : {} });
    toast('Chek printerga yuborildi', true);
  } catch (e) { toast(e.message); }
}

async function confirmCancel(id, after) {
  const reason = await askModal('Chek ' + chekNo(id) + ' bekor qilinsinmi?', {
    input: true, placeholder: 'Sabab (ixtiyoriy)', okText: 'Bekor qilish', danger: true
  });
  if (reason === null) return;
  try {
    await api('/sales/' + id + '/cancel', { method: 'POST', body: { reason } });
    toast('Chek bekor qilindi', true);
    if (after) after();
  } catch (e) { toast(e.message); }
}

/* ===== Mahsulot qo'shish / tahrirlash ===== */
function openAddProduct(existing) {
  const isEdit = !!existing;
  openModal(
    '<h3>' + icon(isEdit ? 'edit' : 'plus') + (isEdit ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot') + '</h3>' +
    '<label class="lbl" for="npName">Nomi *</label>' +
    '<input class="inp" id="npName" value="' + (existing ? esc(existing.name) : '') + '" placeholder="Masalan: Kofta">' +
    '<div class="two-col" style="gap:10px">' +
    '<div><label class="lbl" for="npPrice">Narxi *</label>' +
    '<input class="inp" id="npPrice" type="number" min="0" step="0.01" inputmode="decimal" value="' + (existing ? existing.price : '') + '" placeholder="0"></div>' +
    '<div><label class="lbl" for="npCur">Valyuta</label>' +
    '<select class="inp" id="npCur">' +
    '<option value="UZS"' + (existing && existing.currency === 'UZS' ? ' selected' : '') + ">So'm (UZS)</option>" +
    '<option value="USD"' + (existing && existing.currency === 'USD' ? ' selected' : '') + '>Dollar (USD)</option>' +
    '</select></div></div>' +
    '<label class="lbl" for="npFile">Rasm' + (isEdit ? ' (yangi tanlansa almashtiriladi)' : ' (ixtiyoriy)') + '</label>' +
    '<input class="inp" id="npFile" type="file" accept="image/*">' +
    '<img id="npPrev" class="prev-img" hidden alt="">' +
    '<div class="hint">' + icon('info') + 'USD tanlansa narx kurs bo\'yicha so\'mga aylantiriladi (kurs: ' + fmt(CACHE.usd_rate) + ')</div>' +
    '<div class="modal-btns"><button class="btn ghost" id="npCancel">Bekor qilish</button><button class="btn" id="npSave">Saqlash</button></div>'
  );
  $('npName').focus();
  let imgData = null;
  $('npCancel').onclick = closeModal;
  $('npFile').onchange = async function () {
    const f = this.files[0];
    if (!f) return;
    try {
      imgData = await compressImage(f);
      $('npPrev').src = imgData;
      $('npPrev').hidden = false;
    } catch (e) { toast('Rasmni o\'qib bo\'lmadi'); }
  };
  $('npSave').onclick = async function () {
    const name = $('npName').value.trim();
    const price = parseFloat($('npPrice').value);
    const currency = $('npCur').value;
    if (!name) return toast('Nomini kiriting');
    if (!(price > 0)) return toast('Narxni kiriting');
    this.disabled = true;
    try {
      const body = { name, price, currency, image: imgData, image_mime: 'image/jpeg' };
      if (isEdit) await api('/products/' + existing.id, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      toast(isEdit ? 'Saqlandi' : 'Mahsulot qo\'shildi', true);
      closeModal();
      if (ME.role === 'seller') renderSeller(); else renderTab(ADMIN_TAB);
    } catch (e) {
      toast(e.message);
      this.disabled = false;
    }
  };
}

/* ===== Excel import ===== */
function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function openImportModal() {
  openModal(
    '<h3>' + icon('upload') + 'Excel import</h3>' +
    '<div class="hint" style="margin-top:0">' + icon('info') + '<span>Ustunlar: <b>Nomi</b>, <b>Narxi</b>, <b>Valyuta</b> (UZS/USD, bo\'sh bo\'lsa so\'m). ' +
    'Bazada mavjud yoki faylda takrorlangan nomlar o\'tkazib yuboriladi.</span></div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn ghost big" id="impTpl">' + icon('download', 's') + 'Namuna faylni yuklab olish</button>' +
    '<label class="lbl" for="impFile">Excel faylni tanlang (.xlsx)</label>' +
    '<input class="inp" id="impFile" type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
    '<div id="impStatus" class="hint" hidden></div>' +
    '<div class="modal-btns"><button class="btn ghost" id="impCancel">Bekor qilish</button><button class="btn" id="impGo" disabled>Import qilish</button></div>'
  );
  let b64 = null;
  $('impCancel').onclick = closeModal;
  $('impTpl').onclick = () => downloadFile('/products/import/template.xlsx', 'mahsulot-namuna.xlsx');
  $('impFile').onchange = function () {
    const f = this.files[0];
    const go = $('impGo');
    b64 = null;
    go.disabled = true;
    if (!f) return;
    const st = $('impStatus');
    st.hidden = false;
    st.textContent = 'Fayl o\'qilmoqda...';
    fileToB64(f).then(d => {
      b64 = d;
      st.textContent = '"' + f.name + '" tanlandi — "Import qilish" tugmasini bosing';
      go.disabled = false;
    }).catch(() => { st.textContent = 'Faylni o\'qib bo\'lmadi'; });
  };
  $('impGo').onclick = async function () {
    if (!b64) return;
    this.disabled = true;
    const st = $('impStatus');
    st.hidden = false;
    st.textContent = 'Yuklanmoqda...';
    try {
      const r = await api('/products/import', { method: 'POST', body: { file_b64: b64 } });
      document.querySelector('#modalRoot .modal').innerHTML =
        '<h3>' + icon('checkCircle') + 'Import yakuni</h3>' +
        '<div class="stat-cards">' +
        '<div class="scard"><div class="sc-l">Qo\'shildi</div><div class="sc-v" style="color:var(--acc)">' + r.added + '</div></div>' +
        '<div class="scard"><div class="sc-l">O\'tkazildi</div><div class="sc-v" style="color:var(--muted)">' + r.skipped.length + '</div></div>' +
        '<div class="scard"><div class="sc-l">Xato</div><div class="sc-v" style="color:var(--danger)">' + r.failed.length + '</div></div>' +
        '</div>' +
        ((r.skipped.length || r.failed.length) ?
          '<div class="panel" style="max-height:220px;overflow-y:auto;background:var(--soft2)">' +
          r.skipped.map(s => '<div class="li-row"><span>' + s.row + '-qator: ' + esc(s.name) + '</span><span class="muted sm">' + esc(s.reason) + '</span></div>').join('') +
          r.failed.map(f => '<div class="li-row"><span>' + f.row + '-qator: ' + esc(f.name) + '</span><span class="sm" style="color:var(--danger)">' + esc(f.reason) + '</span></div>').join('') +
          '</div>' : '') +
        '<div style="height:14px"></div><button class="btn big" id="impOk">Tushundim</button>';
      $('impOk').onclick = () => { closeModal(); renderTab('products'); };
    } catch (e) {
      st.textContent = e.message;
      this.disabled = false;
    }
  };
}

/* ===== Sotuvchi kabineti ===== */
async function renderKabinet() {
  let d;
  try { d = await api('/sales/my-stats'); } catch (e) { return; }
  const w = $('mainWrap');
  if (!w) return;
  $('cartBar').hidden = true;
  w.innerHTML =
    '<button class="btn ghost" id="kBack">' + icon('arrowL', 's') + 'Do\'konga qaytish</button>' +
    '<div class="stat-cards">' +
    '<div class="scard"><div class="sc-l">Bugungi savdo</div><div class="sc-v">' + d.today.c + ' ta</div><div class="sc-s">' + money(d.today.s) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Bu oy</div><div class="sc-v">' + d.month.c + ' ta</div><div class="sc-s">' + money(d.month.s) + '</div></div>' +
    '</div>' +
    '<div class="panel"><div class="p-head"><div class="p-head-l"><span class="ttl-ic">' + icon('trophy') + '</span><div class="p-title">Bu oyda eng ko\'p sotganim</div></div></div>' +
    (d.top.length ? d.top.map(t =>
      '<div class="li-row"><span>' + esc(t.name) + '</span><span class="muted sm">' + t.qty + ' ta · ' + money(t.s) + '</span></div>'
    ).join('') : '<div class="muted">Hali savdo yo\'q</div>') + '</div>' +
    '<div class="panel"><div class="p-head"><div class="p-head-l"><span class="ttl-ic">' + icon('receipt') + '</span><div class="p-title">Oxirgi savdolarim</div></div></div>' +
    '<div id="mySales">' + (d.recent.length ? d.recent.map(s => sellerSaleRow(s)).join('') : '<div class="muted">Hali savdo yo\'q</div>') + '</div></div>';
  $('kBack').onclick = renderSeller;
  $('mySales').onclick = e => {
    const v = e.target.closest('[data-view]'); if (v) return receiptModal(+v.dataset.view);
    const rp = e.target.closest('[data-rep]'); if (rp) return reprint(+rp.dataset.rep);
    const cn = e.target.closest('[data-can]'); if (cn) return confirmCancel(+cn.dataset.can, renderKabinet);
  };
}

function saleActs(s) {
  return '<div class="acts">' +
    '<button class="icon-btn sm flat" data-view="' + s.id + '" title="Ko\'rish" aria-label="Ko\'rish">' + icon('eye', 's') + '</button>' +
    '<button class="icon-btn sm flat" data-rep="' + s.id + '" title="Qayta chop etish" aria-label="Qayta chop etish">' + icon('printer', 's') + '</button>' +
    (s.is_cancelled ? '' : '<button class="icon-btn sm flat danger" data-can="' + s.id + '" title="Bekor qilish" aria-label="Bekor qilish">' + icon('ban', 's') + '</button>') +
    '</div>';
}
function sellerSaleRow(s) {
  return '<div class="li-row' + (s.is_cancelled ? ' row-off' : '') + '">' +
    '<div><b>' + chekNo(s.id) + '</b> · ' + esc(s.customer_name) +
    '<div class="muted sm">' + s.created_at + ' · ' + s.items_count + ' ta mahsulot · ' + payLabel(s.payment_method) +
    (s.is_cancelled ? ' · ' + esc(s.cancelled_by || '') + ' bekor qilgan' : '') + '</div></div>' +
    '<div style="text-align:right"><b>' + money(s.total_uzs) + '</b>' + saleActs(s) + '</div></div>';
}

/* ===== Chek ko'rish ===== */
async function receiptModal(id) {
  let r;
  try { r = await api('/sales/' + id + '/receipt'); } catch (e) { return toast(e.message); }
  openModal(
    '<div class="paper">' +
    '<div class="p-shop">' + esc(r.shop_name) + '</div>' +
    (r.shop_phone ? '<div class="p-phone">' + esc(r.shop_phone) + '</div>' : '') +
    '<div class="p-sep"></div>' +
    '<div class="p-row"><span>Chek ' + chekNo(r.receipt_no) + '</span><span>' + esc(r.datetime_local) + '</span></div>' +
    '<div class="p-row"><span>Sotuvchi</span><b>' + esc(r.seller_name) + (r.seller_phone ? ' · ' + esc(r.seller_phone) : '') + '</b></div>' +
    '<div class="p-row"><span>Xaridor</span><b>' + esc(r.customer_name) + '</b></div>' +
    (r.customer_phone ? '<div class="p-row"><span>Telefon</span><b>' + esc(r.customer_phone) + '</b></div>' : '') +
    '<div class="p-row"><span>To\'lov</span><b>' + payLabel(r.payment_method) + '</b></div>' +
    '<div class="p-sep"></div>' +
    r.items.map(i => '<div class="p-item"><span>' + esc(i.name) + ' ×' + i.qty + '</span><span>' + fmt(i.line_total_uzs) + '</span></div>').join('') +
    '<div class="p-sep"></div>' +
    '<div class="p-row p-total"><span>JAMI</span><b>' + money(r.total_uzs) + '</b></div>' +
    (Number(r.old_debt_uzs || 0) > 0
      ? '<div class="p-row"><span>Eski nasiya</span><b>' + money(r.old_debt_uzs) + '</b></div>' +
        (r.payment_method === 'nasiya'
          ? '<div class="p-row p-total" style="color:#c42f2f"><span>UMUMIY NASIYA</span><b>' + money(r.total_with_debt_uzs) + '</b></div>'
          : '<div class="p-row"><span>Qarzingiz (eslatma)</span><b>' + money(r.old_debt_uzs) + '</b></div>')
      : '') +
    (r.is_cancelled
      ? '<div class="p-cancel">BEKOR QILINGAN — ' + esc(r.cancelled_by || '') + ', ' + esc(r.cancelled_at || '') +
        (r.cancel_reason ? ' (' + esc(r.cancel_reason) + ')' : '') + '</div>'
      : '') +
    '</div>' +
    (ME && ME.role === 'admin'
      ? '<div class="modal-btns"><button class="btn" id="mRepLat">' + icon('printer', 's') + 'Lotin</button>' +
        '<button class="btn" id="mRepCyr">' + icon('printer', 's') + 'Кирилл</button></div>'
      : '<button class="btn big" id="mReprint">' + icon('printer', 's') + 'Qayta chop etish</button>') +
    '<div style="height:8px"></div>' +
    '<button class="btn ghost big" id="mClose">Yopish</button>'
  );
  const rl = $('mRepLat');
  if (rl) {
    rl.onclick = () => reprint(r.receipt_no, 'latin');
    $('mRepCyr').onclick = () => reprint(r.receipt_no, 'cyrillic');
  } else {
    $('mReprint').onclick = () => reprint(r.receipt_no);
  }
  $('mClose').onclick = closeModal;
}

/* ==========================================================
   ADMIN PANEL
   ========================================================== */
const ADMIN_TABS = [
  ['dash', 'Boshqaruv', 'grid'],
  ['pos', 'Sotuv', 'cart'],
  ['sales', 'Savdolar', 'receipt'],
  ['products', 'Mahsulotlar', 'box'],
  ['customers', 'Xaridorlar', 'users'],
  ['sellers', 'Sotuvchilar', 'user'],
  ['settings', 'Sozlamalar', 'settings']
];
let SHOP_NAME = '';

let NAV_COLLAPSED = localStorage.getItem('nav') === 'off';

async function renderAdmin(tab) {
  document.onkeydown = null;
  ADMIN_TAB = tab || ADMIN_TAB;
  if (!SHOP_NAME) { try { SHOP_NAME = (await api('/settings')).shop_name; } catch (e) { SHOP_NAME = 'Savdo'; } }
  app.innerHTML =
    '<div class="adm' + (NAV_COLLAPSED ? ' collapsed' : '') + '" id="admShell">' +
    '<aside class="side">' +
    '<div class="side-head">' +
    '<div class="brand"><span class="brand-mark">' + icon('cart') + '</span><span class="brand-txt">' + esc(SHOP_NAME || 'Savdo') + '</span></div>' +
    '<button class="icon-btn flat side-toggle" id="navToggle" title="Menyuni yig\'ish / ochish" aria-label="Menyuni yig\'ish yoki ochish">' + icon('panelLeft') + '</button>' +
    '</div>' +
    '<nav class="side-nav" id="tabs" aria-label="Bo\'limlar">' +
    ADMIN_TABS.map(t => '<button class="' + (t[0] === ADMIN_TAB ? 'on' : '') + '" data-tab="' + t[0] + '" title="' + t[1] + '"' + (t[0] === ADMIN_TAB ? ' aria-current="page"' : '') + '>' + icon(t[2]) + '<span class="nav-txt">' + t[1] + '</span></button>').join('') +
    '</nav>' +
    '<div class="side-foot">' +
    '<div class="side-user">' + avatar(ME.name || 'Admin', 38) + '<span class="me-name">' + esc(ME.name || 'Admin') + '</span></div>' +
    '<div class="side-acts">' + scriptBtnHtml() + themeBtnHtml() +
    '<button class="icon-btn" id="btnLogout" title="Chiqish" aria-label="Chiqish">' + icon('logout') + '</button>' +
    '</div></div>' +
    '</aside>' +
    '<main class="adm-main" id="adminContent"></main>' +
    '</div>';
  $('navToggle').onclick = () => {
    NAV_COLLAPSED = !NAV_COLLAPSED;
    localStorage.setItem('nav', NAV_COLLAPSED ? 'off' : 'on');
    $('admShell').classList.toggle('collapsed', NAV_COLLAPSED);
  };
  $('tabs').onclick = e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    ADMIN_TAB = b.dataset.tab;
    $('tabs').querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    renderTab(ADMIN_TAB);
  };
  $('btnLogout').onclick = confirmLogout;
  renderTab(ADMIN_TAB);
}
function goTab(t) {
  ADMIN_TAB = t;
  const nav = $('tabs');
  if (nav) nav.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x.dataset.tab === t));
  renderTab(t);
}

function pageHead(title, sub, acts) {
  return '<div class="page-head"><div><h1 class="page-title">' + title + '</h1>' + (sub ? '<div class="page-sub">' + sub + '</div>' : '') + '</div>' +
    (acts ? '<div class="page-acts">' + acts + '</div>' : '') + '</div>';
}
function panelHead(title, sub, ic, right) {
  return '<div class="p-head"><div class="p-head-l">' + (ic ? '<span class="ttl-ic">' + icon(ic) + '</span>' : '') +
    '<div><div class="p-title">' + title + '</div>' + (sub ? '<div class="p-sub">' + sub + '</div>' : '') + '</div></div>' + (right || '') + '</div>';
}
function arrowBtn(tab, label) {
  return '<button class="arrow-btn" data-go="' + tab + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' + icon('arrowUR') + '</button>';
}

async function renderTab(tab) {
  const el = $('adminContent');
  if (!el) return;
  el.innerHTML = '<div class="empty" style="margin-top:60px">Yuklanmoqda...</div>';
  el.onclick = null;
  if (tab !== 'pos' && tab !== 'customers') document.onkeydown = null;
  try {
    if (tab === 'dash') await renderDash(el);
    else if (tab === 'pos') await renderPos(el);
    else if (tab === 'sales') await renderSalesTab(el);
    else if (tab === 'products') await renderProductsTab(el);
    else if (tab === 'sellers') await renderSellersTab(el);
    else if (tab === 'customers') await renderCustomersTab(el);
    else if (tab === 'settings') await renderSettingsTab(el);
  } catch (e) {
    el.innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

/* ===== Boshqaruv (Dashboard) ===== */
function barChart(series, kind) {
  const max = Math.max(...series.map(x => x.s), 0);
  // Eng baland ustun ustida yorliq uchun joy qoladi (≈20%)
  const head = max * 1.2;
  const step = max > 0 ? Math.pow(10, Math.floor(Math.log10(head))) / 2 : 1;
  const top = max > 0 ? Math.ceil(head / step) * step : 4;
  const ticks = [4, 3, 2, 1, 0].map(i => top * i / 4);
  const hiIdx = max > 0 ? series.findIndex(x => x.s === max) : -1;
  return '<div class="chart">' +
    '<div class="ch-y num">' + ticks.map(t => '<span>' + (t ? fmtShort(t) : '0') + '</span>').join('') + '</div>' +
    '<div class="ch-plot"><div class="ch-grid">' + ticks.map(() => '<i></i>').join('') + '</div>' +
    series.map((x, i) => {
      const h = top ? Math.max(3, Math.round(x.s / top * 100)) : 3;
      const d = new Date(x.k + (kind === 'months' ? '-01' : '') + 'T00:00:00');
      const lbl = kind === 'months' ? UZ_MONTHS[d.getMonth()] : UZ_WD[d.getDay()] + ' ' + d.getDate();
      return '<div class="ch-col' + (i === hiIdx ? ' hi' : '') + '" title="' + esc(lbl + ': ' + money(x.s) + ' · ' + x.c + ' ta chek') + '">' +
        '<div class="ch-bar" style="height:' + h + '%">' + (i === hiIdx ? '<span class="ch-tip">' + fmtShort(x.s) + '</span>' : '') + '</div>' +
        '<span class="ch-x">' + lbl + '</span></div>';
    }).join('') + '</div></div>';
}
function areaSpark(vals) {
  const w = 300, h = 120, n = vals.length;
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [n > 1 ? i / (n - 1) * w : w / 2, h - 10 - (v / max) * (h - 24)]);
  let d = 'M' + pts[0][0] + ',' + pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ' C' + cx + ',' + y0 + ' ' + cx + ',' + y1 + ' ' + x1 + ',' + y1;
  }
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true" style="color:var(--acc)">' +
    '<defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + d + ' L' + w + ',' + h + ' L0,' + h + ' Z" fill="url(#spg)"/>' +
    '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.2" vector-effect="non-scaling-stroke"/></svg>';
}
function splitMoney(n) {
  const s = fmt(n);
  return '<span class="num">' + s + '</span> <span class="dec">so\'m</span>';
}

async function renderDash(el) {
  const d = await api('/stats/dashboard');
  const today = todayStr();
  const month = today.slice(0, 7);
  const prevDay = d.series.days.length > 1 ? d.series.days[d.series.days.length - 2].s : 0;
  const dayDelta = prevDay > 0 ? Math.round((d.day.s - prevDay) / prevDay * 100) : null;
  const payTotal = d.pays.reduce((a, p) => a + p.s, 0);
  let chartKind = 'days';

  el.innerHTML =
    pageHead('Xush kelibsiz, <span>' + esc(ME.name || 'Admin') + '</span>', '',
      '<span class="date-pill">' + icon('calendar', 's') + niceDate(new Date()) + '</span>' +
      '<button class="btn" data-go="pos">' + icon('plus', 's') + 'Yangi sotuv</button>') +
    '<div class="dash">' +

    // Bugungi tushum — yashil "karta"
    '<section class="panel c-hero">' + panelHead('Bugungi tushum', 'Bekor qilinmagan savdolar', '', arrowBtn('sales', 'Savdolarga o\'tish')) +
    '<div class="hero-card"><div class="hero-top"><span>' + esc((SHOP_NAME || 'SAVDO').toUpperCase()) + '</span>' + icon('wallet') + '</div>' +
    '<div class="hero-lbl">Bugun</div><div class="hero-val num">' + fmt(d.day.s) + ' so\'m</div>' +
    '<div class="hero-bot"><span>' + d.day.c + ' ta chek</span><span>$ ' + fmt(d.usd_rate) + '</span></div></div></section>' +

    // Bu oy
    '<section class="panel c-week"><div class="p-sub">Bu oygi savdo</div>' +
    '<div class="big-num" style="margin-top:6px"><span class="num">' + fmtShort(d.month.s) + '</span>' +
    '<span class="chip-up">' + d.month.c + ' ta chek</span></div>' +
    (dayDelta !== null ? '<div class="p-sub" style="margin-top:6px">Kechagiga nisbatan: <b style="color:' + (dayDelta >= 0 ? 'var(--acc)' : 'var(--danger)') + '">' + (dayDelta >= 0 ? '+' : '') + dayDelta + '%</b></div>' : '') +
    (d.day.cc ? '<div class="p-sub" style="margin-top:4px">Bugun bekor: ' + d.day.cc + ' ta · ' + money(d.day.cs) + '</div>' : '') +
    '</section>' +

    // Grafik
    '<section class="panel c-chart">' + panelHead('Savdo dinamikasi', 'Tushum (so\'m)', 'chart',
      '<div style="display:flex;gap:8px;align-items:center"><div class="seg sm" id="chKind"><button class="on" data-k="days">Haftalik</button><button data-k="months">Oylik</button></div></div>') +
    '<div id="chBox">' + barChart(d.series.days, 'days') + '</div></section>' +

    // To'lov turlari
    '<section class="panel c-pay">' + panelHead('To\'lov turlari', 'Bu oy', '', arrowBtn('sales', 'Savdolar')) +
    '<div class="p-sub" style="text-align:center">Oylik tushum</div>' +
    '<div class="big-num" style="justify-content:center;font-size:26px">' + splitMoney(d.month.s) + '</div>' +
    areaSpark(d.series.days.map(x => x.s)) +
    '<div class="pay-rows">' + ['naqd', 'karta', 'nasiya'].map(k => {
      const p = d.pays.find(x => x.k === k) || { c: 0, s: 0 };
      const pct = payTotal ? Math.round(p.s / payTotal * 100) : 0;
      return '<div class="pay-row"><span class="pr-ic">' + icon(PAY[k].ic) + '</span><div class="pr-main">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + PAY[k].label + '</b><span class="num">' + fmtShort(p.s) + '</span></div>' +
        '<div class="pr-bar"><i style="width:' + pct + '%"></i></div></div></div>';
    }).join('') + '</div></section>' +

    // Oxirgi savdolar
    '<section class="panel c-recent">' + panelHead('Oxirgi savdolar', 'So\'nggi cheklar tarixi', '', arrowBtn('sales', 'Barcha savdolar')) +
    (d.recent.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Xaridor</th><th>Sana</th><th>Vaqt</th><th>Holat</th><th class="r">Summa</th></tr></thead><tbody id="recentBody">' +
      d.recent.map(s => '<tr data-view="' + s.id + '" style="cursor:pointer">' +
        '<td><div class="t-name">' + avatar(s.customer_name, 34) + '<div><b>' + esc(s.customer_name) + '</b><div class="sub">' + chekNo(s.id) + ' · ' + esc(s.seller_name) + '</div></div></div></td>' +
        '<td>' + esc(s.d) + '</td><td>' + esc(s.t) + '</td>' +
        '<td>' + (s.is_cancelled ? '<span class="badge b-no">Bekor</span>' : '<span class="badge b-ok">' + payLabel(s.payment_method) + '</span>') + '</td>' +
        '<td class="r num"><b>' + money(s.total_uzs) + '</b></td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty">' + icon('receipt') + 'Hali savdo yo\'q</div>') + '</section>' +

    // Nasiya
    '<section class="panel c-debt">' + panelHead('Nasiya (qarzlar)', 'Xaridorlarning umumiy qarzi', 'book') +
    '<div class="big-num"><span class="num" style="color:' + (d.debt.s > 0 ? 'var(--danger)' : 'inherit') + '">' + fmt(d.debt.s) + '</span><span class="dec" style="font-size:18px">so\'m</span></div>' +
    '<div class="p-sub" style="margin:6px 0 14px">' + d.debt.c + ' ta qarzdor · jami ' + d.debt.customers + ' ta xaridor</div>' +
    '<button class="btn soft big" id="btnDebtors">' + icon('users', 's') + 'Qarzdorlarni ko\'rish</button></section>' +

    // Sotuvchilar reytingi
    '<section class="panel c-sellers">' + panelHead('Sotuvchilar', 'Bu oy reytingi', '', arrowBtn('sellers', 'Sotuvchilar')) +
    (d.sellers.length ? d.sellers.slice(0, 4).map((s, i) =>
      '<div class="li-row"><div class="t-name">' + avatar(s.name, 34) + '<div><b>' + esc(s.name) + '</b><div class="sub">' + s.c + ' ta chek</div></div></div>' +
      '<b class="num">' + fmtShort(s.s) + '</b></div>').join('') : '<div class="muted sm">Bu oy hali savdo yo\'q</div>') +
    '</section>' +

    // Top mahsulotlar
    '<section class="panel c-top">' + panelHead('Top mahsulotlar', 'Bu oy eng ko\'p sotilganlar', 'trophy', arrowBtn('products', 'Mahsulotlar')) +
    (d.top.length ? (() => {
      const mx = d.top[0].s || 1;
      return d.top.map((t, i) => '<div class="pay-row" style="margin-bottom:10px"><span class="pr-ic num" style="font-weight:700">' + (i + 1) + '</span><div class="pr-main">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(t.name) + '</b><span class="muted sm num">' + t.qty + ' ta · ' + money(t.s) + '</span></div>' +
        '<div class="pr-bar"><i style="width:' + Math.round(t.s / mx * 100) + '%"></i></div></div></div>').join('');
    })() : '<div class="muted sm">Bu oy hali savdo yo\'q</div>') + '</section>' +

    // Excel hisobot
    '<section class="panel c-xls">' + panelHead('Excel hisobot', 'Savdo, mahsulot, xaridor va qarzlar', 'sheet') +
    '<label class="lbl" for="xD">Kunlik</label><div style="display:flex;gap:8px"><input type="date" class="inp" id="xD" value="' + today + '"><button class="btn" id="btnXD" aria-label="Kunlik yuklab olish">' + icon('download', 's') + '</button></div>' +
    '<label class="lbl" for="xM">Oylik</label><div style="display:flex;gap:8px"><input type="month" class="inp" id="xM" value="' + month + '"><button class="btn" id="btnXM" aria-label="Oylik yuklab olish">' + icon('download', 's') + '</button></div>' +
    '</section>' +
    '</div>';

  el.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g) return goTab(g.dataset.go);
    const v = e.target.closest('[data-view]'); if (v) return receiptModal(+v.dataset.view);
  };
  $('chKind').onclick = e => {
    const b = e.target.closest('[data-k]');
    if (!b || b.dataset.k === chartKind) return;
    chartKind = b.dataset.k;
    $('chKind').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('chBox').innerHTML = barChart(d.series[chartKind], chartKind);
  };
  $('btnDebtors').onclick = () => { CUST_FILTER.debt = true; goTab('customers'); };
  $('btnXD').onclick = () => { const v = $('xD').value; downloadFile('/reports/daily.xlsx' + (v ? '?date=' + v : ''), 'savdo-' + (v || today) + '.xlsx'); };
  $('btnXM').onclick = () => { const v = $('xM').value; downloadFile('/reports/monthly.xlsx' + (v ? '?month=' + v : ''), 'savdo-' + (v || month) + '.xlsx'); };
}

/* ===== POS — admin sotuv paneli ===== */
const POS = { cart: {}, price: {}, cust: null, pay: 'naqd', seller: '', sort: 'new', q: '', newCust: false };
let posSellers = [];

function posItems() {
  return Object.keys(POS.cart).map(k => ({ p: CACHE.products.find(x => x.id === +k), qty: POS.cart[k] })).filter(x => x.p);
}
function posPrice(it) { return POS.price[it.p.id] != null ? POS.price[it.p.id] : it.p.price_uzs; }
function posTotal() { return posItems().reduce((a, it) => a + posPrice(it) * it.qty, 0); }

async function renderPos(el) {
  const [pd, sd] = await Promise.all([api('/products'), api('/sellers')]);
  CACHE = pd;
  posSellers = sd.sellers.filter(s => s.is_active);
  // Mahsulot o'chirilgan bo'lsa savatdan ham olib tashlanadi
  Object.keys(POS.cart).forEach(k => { if (!CACHE.products.find(p => p.id === +k)) { delete POS.cart[k]; delete POS.price[k]; } });

  const sorts = [['new', 'Yangilari', 'sparkle'], ['az', 'A–Z', 'sort'], ['cheap', 'Arzonroq', 'tag'], ['exp', 'Qimmatroq', 'trendUp']];
  el.innerHTML =
    '<div class="pos">' +
    '<div class="pos-main">' +
    '<div class="pos-top"><div class="search-box">' + icon('search') +
    '<input class="search" id="posQ" placeholder="Mahsulot nomi bo\'yicha izlash..." autocomplete="off" value="' + esc(POS.q) + '"><kbd>/</kbd></div>' +
    '<button class="btn ghost" id="posAddP">' + icon('plus', 's') + 'Mahsulot</button></div>' +
    '<div class="chips" id="posSort">' + sorts.map(s => '<button class="chip' + (POS.sort === s[0] ? ' on' : '') + '" data-s="' + s[0] + '">' + icon(s[2]) + s[1] + '</button>').join('') + '</div>' +
    '<div class="pos-h"><h2>Mahsulotni tanlang</h2><span class="muted sm" id="posCount"></span></div>' +
    '<div class="pos-grid" id="posGrid"></div>' +
    '</div>' +
    '<aside class="order" aria-label="Joriy savdo">' +
    '<div class="order-head">' +
    '<div class="row"><div><div class="muted sm">Joriy savdo</div><div class="order-no">Yangi chek</div></div>' +
    '<div style="text-align:right"><div class="muted sm" style="margin-bottom:4px">Sotuvchi</div><select class="o-sel" id="posSeller" aria-label="Sotuvchi">' +
    '<option value="">Admin (o\'zim)</option>' + posSellers.map(s => '<option value="' + s.id + '"' + (String(POS.seller) === String(s.id) ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
    '</select></div></div>' +
    '<div id="custArea"></div>' +
    '<div class="seg" id="posPay" style="margin-top:12px">' +
    Object.keys(PAY).map(k => '<button class="' + (POS.pay === k ? 'on' : '') + '" data-pay="' + k + '">' + icon(PAY[k].ic) + PAY[k].label + '</button>').join('') + '</div>' +
    '</div>' +
    '<div class="order-body" id="oItems"></div>' +
    '<div class="order-foot" id="oFoot"></div>' +
    '</aside></div>';

  posRenderGrid();
  posRenderCust();
  posRenderOrder();

  $('posQ').oninput = e => { POS.q = e.target.value; posRenderGrid(); };
  $('posQ').onkeydown = e => {
    if (e.key === 'Enter') {
      const first = $('posGrid').querySelector('.pos-card');
      if (first) { posAdd(+first.dataset.id); e.target.select(); }
    } else if (e.key === 'Escape') { e.target.value = ''; POS.q = ''; posRenderGrid(); }
  };
  $('posAddP').onclick = () => openAddProduct(null);
  $('posSort').onclick = e => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    POS.sort = b.dataset.s;
    $('posSort').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
    posRenderGrid();
  };
  $('posGrid').onclick = e => { const c = e.target.closest('.pos-card'); if (c) posAdd(+c.dataset.id); };
  $('posGrid').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { const c = e.target.closest('.pos-card'); if (c) { e.preventDefault(); posAdd(+c.dataset.id); } } };
  $('posSeller').onchange = e => { POS.seller = e.target.value; };
  $('posPay').onclick = e => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    POS.pay = b.dataset.pay;
    $('posPay').querySelectorAll('[data-pay]').forEach(x => x.classList.toggle('on', x === b));
    posRenderFoot();
  };
  posBindOrder();
  document.onkeydown = posKeys;
  if (!('ontouchstart' in window)) $('posQ').focus();
}

function posKeys(e) {
  if (ADMIN_TAB !== 'pos' || modalOpen() || !$('posQ')) return;
  const tag = document.activeElement && document.activeElement.tagName;
  const typing = /INPUT|TEXTAREA|SELECT/.test(tag);
  if (e.key === '/' && !typing) { e.preventDefault(); $('posQ').focus(); $('posQ').select(); }
  else if (e.key === 'F2') { e.preventDefault(); if (POS.cust) { POS.cust = null; posRenderCust(); posRenderFoot(); } const s = $('custQ'); if (s) s.focus(); }
  else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); posSell(); }
}

function posRenderGrid() {
  const g = $('posGrid');
  if (!g) return;
  let list = CACHE.products.filter(p => matchQ(p.name, POS.q));
  if (POS.sort === 'az') list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  else if (POS.sort === 'cheap') list = list.slice().sort((a, b) => a.price_uzs - b.price_uzs);
  else if (POS.sort === 'exp') list = list.slice().sort((a, b) => b.price_uzs - a.price_uzs);
  $('posCount').textContent = list.length + ' ta natija';
  g.innerHTML = list.length ? list.map(p =>
    '<div class="pos-card' + (POS.cart[p.id] ? ' in-cart' : '') + '" data-id="' + p.id + '" role="button" tabindex="0" aria-label="' + esc(p.name) + ' — savatga qo\'shish">' +
    '<span class="add-ic">' + icon('plus') + '</span>' +
    (POS.cart[p.id] ? '<span class="qty-badge">' + POS.cart[p.id] + '</span>' : '') +
    productThumb(p) +
    '<div class="pname"><span>' + hl(p.name, POS.q) + '</span></div>' +
    '<div class="pprice num">' + fmt(p.price_uzs) + ' so\'m</div>' +
    '<div class="porig">' + (p.currency === 'USD' ? '$' + fmtUsd(p.price) : '&nbsp;') + '</div>' +
    '</div>').join('') : '<div class="empty" style="grid-column:1/-1">' + icon('search') + 'Mahsulot topilmadi</div>';
}

function posAdd(id) {
  POS.cart[id] = Math.min((POS.cart[id] || 0) + 1, QTY_MAX);
  posRenderGrid();
  posRenderOrder();
}

/* Xaridor tanlash — tezkor qidiruv (ism lotin/kirill, telefon), klaviatura bilan */
function posRenderCust() {
  const box = $('custArea');
  if (!box) return;
  if (POS.cust) {
    const c = POS.cust;
    box.innerHTML = '<div class="cust-sel">' + avatar(c.name, 38) + '<div class="cs-main"><b>' + esc(c.name) + '</b>' +
      '<div class="muted sm">' + (c.phone ? esc(c.phone) : 'telefon yo\'q') + (Number(c.debt) > 0 ? ' · <span style="color:var(--danger)">qarz ' + money(c.debt) + '</span>' : '') + '</div></div>' +
      '<button class="icon-btn sm" id="custClear" title="Boshqa xaridor (F2)" aria-label="Boshqa xaridor">' + icon('x', 's') + '</button></div>';
    $('custClear').onclick = () => { POS.cust = null; posRenderCust(); posRenderFoot(); const s = $('custQ'); if (s) s.focus(); };
    return;
  }
  if (POS.newCust) {
    box.innerHTML = '<div class="new-cust"><div style="display:flex;justify-content:space-between;align-items:center"><b class="sm">Yangi xaridor</b>' +
      '<button class="icon-btn sm flat" id="ncClose" aria-label="Yopish">' + icon('x', 's') + '</button></div>' +
      '<input class="inp" id="ncName" placeholder="Ismi *" autocomplete="off">' +
      '<input class="inp" id="ncPhone" type="tel" inputmode="tel" placeholder="Telefon * (901234567)" autocomplete="off">' +
      '<button class="btn" id="ncSave">' + icon('check', 's') + 'Yaratish va tanlash</button></div>';
    $('ncName').focus();
    $('ncClose').onclick = () => { POS.newCust = false; posRenderCust(); };
    const save = async () => {
      const name = $('ncName').value.trim(), phone = $('ncPhone').value.trim();
      if (!name) return toast('Ismini kiriting');
      if (!phone) return toast('Telefon raqamini kiriting');
      $('ncSave').disabled = true;
      try {
        const r = await api('/customers', { method: 'POST', body: { name, phone } });
        POS.cust = r.customer; POS.newCust = false;
        toast('Xaridor yaratildi', true);
        posRenderCust(); posRenderFoot();
      } catch (e) { toast(e.message); $('ncSave').disabled = false; }
    };
    $('ncSave').onclick = save;
    $('ncPhone').onkeydown = e => { if (e.key === 'Enter') save(); };
    $('ncName').onkeydown = e => { if (e.key === 'Enter') $('ncPhone').focus(); };
    return;
  }
  box.innerHTML = '<div class="cust-field"><div style="display:flex;gap:8px">' +
    '<div class="search-box" style="flex:1">' + icon('search') + '<input class="search" id="custQ" placeholder="Xaridor: ism yoki telefon..." autocomplete="off" role="combobox" aria-expanded="false" aria-controls="custDrop"><kbd>F2</kbd></div>' +
    '<button class="icon-btn" id="custNew" title="Yangi xaridor" aria-label="Yangi xaridor">' + icon('userPlus') + '</button></div>' +
    '<div class="cust-drop" id="custDrop" role="listbox" hidden></div></div>';

  const inp = $('custQ'), drop = $('custDrop');
  let list = [], act = 0, seq = 0, t = null, total = 0;
  const show = () => {
    const q = inp.value.trim();
    drop.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
    drop.innerHTML = (list.length ? list.map((c, i) => custPickRow(c, q, i === act)).join('')
      : '<div class="empty" style="padding:20px">' + icon('search') + 'Topilmadi<button class="btn soft" id="dropNew">' + icon('userPlus', 's') + 'Yangi xaridor qo\'shish</button></div>') +
      '<div class="drop-foot"><span>' + (q ? list.length + ' ta natija' : 'Oxirgi xaridorlar · jami ' + total) + '</span><span>↑↓ tanlash · Enter</span></div>';
    const a = drop.querySelector('.cust-pick.act');
    if (a) a.scrollIntoView({ block: 'nearest' });
    const dn = $('dropNew');
    if (dn) dn.onmousedown = e => { e.preventDefault(); POS.newCust = true; posRenderCust(); const n = $('ncName'); if (n && inp.value && !/\d/.test(inp.value)) n.value = inp.value; };
  };
  const load = async () => {
    const my = ++seq;
    const q = inp.value.trim();
    try {
      const d = await api('/customers/list?limit=' + (q ? 30 : 8) + (q ? '&q=' + encodeURIComponent(q) : ''));
      if (my !== seq) return;
      list = d.customers; total = d.total; act = 0;
      if (document.activeElement === inp) show();
    } catch (e) { /* tarmoq xatosi — eski natija qoladi */ }
  };
  const pick = c => { POS.cust = c; posRenderCust(); posRenderFoot(); };
  inp.onfocus = () => { if (list.length) show(); load(); };
  inp.oninput = () => {
    // Bor natijalar ichidan darhol filtrlash, so'ng serverdan to'liq qidiruv
    const q = inp.value.trim(), dg = q.replace(/\D/g, '');
    list = list.filter(c => matchQ(c.name, q) || (dg.length >= 2 && String(c.phone || '').replace(/\D/g, '').includes(dg)));
    act = 0; show();
    clearTimeout(t); t = setTimeout(load, 120);
  };
  inp.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(act + 1, list.length - 1); show(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(act - 1, 0); show(); }
    else if (e.key === 'Enter' && !e.ctrlKey && list[act]) { e.preventDefault(); pick(list[act]); }
    else if (e.key === 'Escape') { drop.hidden = true; inp.blur(); }
  };
  inp.onblur = () => setTimeout(() => { if ($('custDrop')) { drop.hidden = true; inp.setAttribute('aria-expanded', 'false'); } }, 120);
  drop.onmousedown = e => {
    const r = e.target.closest('.cust-pick');
    if (!r) return;
    e.preventDefault();
    const c = list.find(x => x.id === +r.dataset.cid);
    if (c) pick(c);
  };
  $('custNew').onclick = () => { POS.newCust = true; posRenderCust(); };
}

function posRenderOrder() {
  const box = $('oItems');
  if (!box) return;
  const items = posItems();
  box.innerHTML = items.length ? items.map(it => {
    const pr = posPrice(it);
    const changed = pr !== it.p.price_uzs;
    return '<div class="o-item" data-id="' + it.p.id + '">' +
      productThumb(it.p, 'o-thumb') +
      '<div class="o-main"><div style="display:flex;justify-content:space-between;gap:8px"><div class="o-name">' + esc(it.p.name) + '</div>' +
      '<button class="icon-btn sm flat danger" data-rm="' + it.p.id + '" title="Olib tashlash" aria-label="Olib tashlash" style="width:30px;height:30px">' + icon('trash', 's') + '</button></div>' +
      '<div class="price-line muted sm"><input class="price-inp' + (changed ? ' changed' : '') + '" data-pid="' + it.p.id + '" type="number" min="0" step="1" inputmode="numeric" value="' + pr + '" aria-label="Narx" title="Narxni o\'zgartirish">' +
      (changed ? '<span class="old-price">' + fmt(it.p.price_uzs) + '</span><button class="link-btn" style="margin:0;min-height:0;font-size:12px" data-reset="' + it.p.id + '">asl narx</button>' : '<span>so\'m</span>') + '</div>' +
      '<div class="o-row"><div class="cr-qty"><button class="qbtn" data-act="minus" aria-label="Kamaytirish">' + icon('minus') + '</button>' +
      '<input class="qv-inp" data-pid="' + it.p.id + '" type="number" min="1" step="1" inputmode="numeric" value="' + it.qty + '" aria-label="Soni">' +
      '<button class="qbtn" data-act="plus" aria-label="Ko\'paytirish">' + icon('plus') + '</button></div>' +
      '<span class="o-sum num" data-sum="' + it.p.id + '">' + money(pr * it.qty) + '</span></div>' +
      '</div></div>';
  }).join('') : '<div class="o-empty"><span class="ttl-ic">' + icon('cart') + '</span><b>Savat bo\'sh</b><span class="sm">Chapdagi mahsulotni bosing yoki nomini yozib Enter bosing</span></div>';
  posRenderFoot();
}

function posRenderFoot() {
  const f = $('oFoot');
  if (!f) return;
  const items = posItems();
  const count = items.reduce((a, it) => a + it.qty, 0);
  const base = items.reduce((a, it) => a + it.p.price_uzs * it.qty, 0);
  const total = posTotal();
  const diff = total - base;
  const old = POS.cust ? Number(POS.cust.debt || 0) : 0;
  f.innerHTML =
    '<div class="sum-line"><span>Mahsulotlar (' + count + ')</span><b class="num">' + money(base) + '</b></div>' +
    (diff ? '<div class="sum-line"><span>Narx o\'zgarishi</span><b class="num" style="color:' + (diff < 0 ? 'var(--danger)' : 'var(--acc)') + '">' + (diff > 0 ? '+' : '−') + money(Math.abs(diff)) + '</b></div>' : '') +
    (old > 0 ? '<div class="sum-line"><span>Eski nasiya</span><b class="num" style="color:var(--danger)">' + money(old) + '</b></div>' : '') +
    '<div class="sum-total"><span>Jami</span><b class="num">' + money(total) + '</b></div>' +
    (POS.pay === 'nasiya' && old > 0 ? '<div class="sum-line" style="margin-top:-8px;margin-bottom:10px"><span>Umumiy nasiya</span><b class="num" style="color:var(--danger)">' + money(total + old) + '</b></div>' : '') +
    '<button class="btn big" id="posSellBtn"' + (items.length ? '' : ' disabled') + '>' + icon('printer', 's') + 'Sotish va chek chiqarish</button>' +
    (items.length ? '<button class="link-btn" id="posClear" style="width:100%;justify-content:center">Savatni tozalash</button>' : '') +
    '<div class="kbd-hint"><kbd>/</kbd> mahsulot · <kbd>F2</kbd> xaridor · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> sotish</div>';
  $('posSellBtn').onclick = posSell;
  const c = $('posClear');
  if (c) c.onclick = async () => {
    if (!await askModal('Savat tozalansinmi?', { okText: 'Tozalash', danger: true })) return;
    POS.cart = {}; POS.price = {};
    posRenderGrid(); posRenderOrder();
  };
}

function posBindOrder() {
  const box = $('oItems');
  box.onclick = e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { delete POS.cart[rm.dataset.rm]; delete POS.price[rm.dataset.rm]; posRenderGrid(); posRenderOrder(); return; }
    const rs = e.target.closest('[data-reset]');
    if (rs) { delete POS.price[rs.dataset.reset]; posRenderOrder(); return; }
    const b = e.target.closest('.qbtn');
    if (!b) return;
    const id = +b.closest('.o-item').dataset.id;
    if (b.dataset.act === 'plus') POS.cart[id] = Math.min((POS.cart[id] || 0) + 1, QTY_MAX);
    else { POS.cart[id] = (POS.cart[id] || 0) - 1; if (POS.cart[id] <= 0) { delete POS.cart[id]; delete POS.price[id]; } }
    posRenderGrid(); posRenderOrder();
  };
  const updSum = pid => {
    const it = posItems().find(x => x.p.id === pid);
    const el = box.querySelector('[data-sum="' + pid + '"]');
    if (it && el) el.textContent = money(posPrice(it) * it.qty);
  };
  box.addEventListener('input', e => {
    const p = e.target.closest('.price-inp');
    if (p) {
      const pid = +p.dataset.pid, v = parseInt(p.value, 10);
      const it = posItems().find(x => x.p.id === pid);
      if (isFinite(v) && v >= 0 && it && v !== it.p.price_uzs) POS.price[pid] = v; else delete POS.price[pid];
      p.classList.toggle('changed', POS.price[pid] != null);
      updSum(pid); posRenderFoot();
      return;
    }
    const q = e.target.closest('.qv-inp');
    if (!q) return;
    const pid = +q.dataset.pid, v = parseInt(q.value, 10);
    if (isFinite(v) && v >= 1) { POS.cart[pid] = Math.min(v, QTY_MAX); updSum(pid); posRenderFoot(); }
  });
  box.addEventListener('change', e => {
    const q = e.target.closest('.qv-inp');
    if (q) {
      const pid = +q.dataset.pid, v = parseInt(q.value, 10);
      if (v === 0) { delete POS.cart[pid]; delete POS.price[pid]; }
      posRenderGrid(); posRenderOrder();
      return;
    }
    if (e.target.closest('.price-inp')) posRenderOrder();
  });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.qv-inp, .price-inp')) e.target.blur(); });
}

let posBusy = false;
async function posSell() {
  const items = posItems();
  if (!items.length) return toast('Savat bo\'sh');
  if (!POS.cust) { toast('Xaridorni tanlang (F2)'); const s = $('custQ'); if (s) s.focus(); return; }
  if (posBusy) return;
  posBusy = true;
  const btn = $('posSellBtn');
  if (btn) btn.disabled = true;
  try {
    const d = await api('/sales', {
      method: 'POST',
      body: {
        items: items.map(it => {
          const o = { product_id: it.p.id, qty: it.qty };
          if (POS.price[it.p.id] != null) o.price_uzs = POS.price[it.p.id];
          return o;
        }),
        customer_id: POS.cust.id,
        payment_method: POS.pay,
        seller_id: POS.seller || null,
        script: SCRIPT
      }
    });
    POS.cart = {}; POS.price = {}; POS.cust = null; POS.pay = 'naqd'; POS.q = '';
    openSuccess(d.receipt, () => { const q = $('posQ'); if (q) q.focus(); });
    renderTab('pos');
  } catch (e) {
    toast(e.message);
    if (btn) btn.disabled = false;
  } finally {
    posBusy = false;
  }
}

/* ===== Savdolar ===== */
async function renderSalesTab(el) {
  const today = todayStr();
  const sellers = (await api('/sellers')).sellers;
  el.innerHTML =
    pageHead('Savdolar', 'Cheklar ro\'yxati, qayta chop etish va bekor qilish', '<button class="btn" data-go="pos">' + icon('plus', 's') + 'Yangi sotuv</button>') +
    '<div class="panel"><div class="filters">' +
    '<label>Dan<input type="date" class="inp" id="fFrom" value="' + today + '"></label>' +
    '<label>Gacha<input type="date" class="inp" id="fTo" value="' + today + '"></label>' +
    '<label>Sotuvchi<select class="inp" id="fSeller"><option value="">Barchasi</option>' +
    sellers.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select></label>' +
    '<label style="flex:1;min-width:200px">Xaridor yoki chek №<div class="search-box">' + icon('search') + '<input class="search" id="fQ" placeholder="Izlash..." autocomplete="off"></div></label>' +
    '</div></div>' +
    '<div id="salesSum" class="mini-stats" style="margin-top:16px"></div>' +
    '<div id="salesTable"></div>';

  let rows = [];
  const draw = () => {
    const q = $('fQ').value.trim();
    const qd = q.replace(/\D/g, '');
    const list = rows.filter(s => !q || matchQ(s.customer_name, q) || (qd && String(s.id).includes(String(+qd))));
    const ok = list.filter(s => !s.is_cancelled);
    $('salesSum').innerHTML =
      '<div class="mini-stat"><span class="ttl-ic">' + icon('receipt') + '</span><div><div class="sm muted">Cheklar</div><div class="v num">' + ok.length + '</div></div></div>' +
      '<div class="mini-stat"><span class="ttl-ic">' + icon('wallet') + '</span><div><div class="sm muted">Tushum</div><div class="v num">' + money(ok.reduce((a, s) => a + s.total_uzs, 0)) + '</div></div></div>' +
      '<div class="mini-stat"><span class="ttl-ic">' + icon('ban') + '</span><div><div class="sm muted">Bekor qilingan</div><div class="v num">' + (list.length - ok.length) + '</div></div></div>';
    $('salesTable').innerHTML = list.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>Chek</th><th>Vaqt</th><th>Xaridor</th><th>Sotuvchi</th><th>Mahsulot</th><th>To\'lov</th><th class="r">Summa</th><th>Holat</th><th></th></tr></thead><tbody>' +
        list.map(s =>
          '<tr class="' + (s.is_cancelled ? 'row-off' : '') + '">' +
          '<td><b>' + chekNo(s.id) + '</b></td><td class="num">' + s.created_at + '</td>' +
          '<td><div class="t-name">' + avatar(s.customer_name, 30) + '<b>' + hl(s.customer_name, q) + '</b></div></td>' +
          '<td>' + esc(s.seller_name) + '</td><td>' + s.items_count + ' ta</td>' +
          '<td>' + payLabel(s.payment_method) + '</td><td class="r num"><b>' + fmt(s.total_uzs) + '</b></td>' +
          '<td>' + (s.is_cancelled ? '<span class="badge b-no">Bekor</span>' : '<span class="badge b-ok">Sotilgan</span>') + '</td>' +
          '<td>' + saleActs(s) + '</td></tr>'
        ).join('') + '</tbody></table></div>'
      : '<div class="panel empty">' + icon('receipt') + 'Bu davrda savdo yo\'q</div>';
  };
  const load = async () => {
    $('salesTable').innerHTML = '<div class="panel empty">Yuklanmoqda...</div>';
    const params = new URLSearchParams();
    if ($('fFrom').value) params.set('from', $('fFrom').value);
    if ($('fTo').value) params.set('to', $('fTo').value);
    if ($('fSeller').value) params.set('seller_id', $('fSeller').value);
    params.set('limit', '500');
    rows = (await api('/sales?' + params.toString())).sales;
    draw();
  };
  ['fFrom', 'fTo', 'fSeller'].forEach(id => { $(id).onchange = load; });
  $('fQ').oninput = draw;
  el.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g) return goTab(g.dataset.go);
    const v = e.target.closest('[data-view]'); if (v) return receiptModal(+v.dataset.view);
    const rp = e.target.closest('[data-rep]'); if (rp) return reprint(+rp.dataset.rep);
    const cn = e.target.closest('[data-can]'); if (cn) return confirmCancel(+cn.dataset.can, load);
  };
  load();
}

/* ===== Mahsulotlar ===== */
async function renderProductsTab(el) {
  const d = await api('/products');
  CACHE = d;
  el.innerHTML =
    pageHead('Mahsulotlar', d.products.length + ' ta mahsulot · USD kursi ' + fmt(d.usd_rate),
      '<button class="btn ghost" id="btnImport">' + icon('upload', 's') + 'Excel import</button>' +
      '<button class="btn" id="btnAddProd">' + icon('plus', 's') + 'Mahsulot qo\'shish</button>') +
    '<div class="toolbar"><div class="search-box">' + icon('search') + '<input class="search" id="pSearch" placeholder="Mahsulot nomi bo\'yicha izlash..." autocomplete="off"></div>' +
    '<button class="btn ghost" id="btnExpX">' + icon('sheet', 's') + 'Excel</button>' +
    '<button class="btn ghost" id="btnExpP">' + icon('file', 's') + 'PDF</button>' +
    '<button class="btn danger-ghost" id="btnDelAll">' + icon('trash', 's') + 'Hammasini o\'chirish</button></div>' +
    '<div class="table-wrap"><table class="table"><thead>' +
    '<tr><th>Mahsulot</th><th class="r">Narxi</th><th>Valyuta</th><th class="r">So\'mda</th><th>Qo\'shgan</th><th></th></tr></thead>' +
    '<tbody id="pBody"></tbody></table></div>';

  const renderRows = () => {
    const f = $('pSearch').value;
    $('pBody').innerHTML = d.products.filter(p => matchQ(p.name, f)).map(p =>
      '<tr><td><div class="t-name">' +
      (p.has_image ? '<img class="thumb-sm" loading="lazy" alt="" src="/api/products/' + p.id + '/image">' : '<span class="thumb-ph">' + icon('box') + '</span>') +
      '<b>' + hl(p.name, f) + '</b></div></td>' +
      '<td class="r num">' + (p.currency === 'USD' ? '$' + fmtUsd(p.price) : fmt(p.price)) + '</td>' +
      '<td><span class="badge b-neu nodot">' + p.currency + '</span></td>' +
      '<td class="r num"><b>' + fmt(p.price_uzs) + '</b></td>' +
      '<td class="muted">' + esc(p.created_by || 'Admin') + '</td>' +
      '<td><div class="acts">' +
      '<button class="icon-btn sm flat" data-edit="' + p.id + '" title="Tahrirlash" aria-label="Tahrirlash">' + icon('edit', 's') + '</button>' +
      '<button class="icon-btn sm flat danger" data-del="' + p.id + '" title="O\'chirish" aria-label="O\'chirish">' + icon('trash', 's') + '</button>' +
      '</div></td></tr>'
    ).join('') || '<tr><td colspan="6"><div class="empty">' + icon('box') + 'Mahsulot topilmadi</div></td></tr>';
  };
  renderRows();
  $('pSearch').oninput = renderRows;
  $('btnAddProd').onclick = () => openAddProduct(null);
  $('btnImport').onclick = () => openImportModal();
  $('btnExpX').onclick = () => downloadFile('/products/export.xlsx', 'mahsulotlar.xlsx');
  $('btnExpP').onclick = () => downloadFile('/products/export.pdf', 'mahsulotlar.pdf');
  $('btnDelAll').onclick = async () => {
    const w = await askModal('BARCHA mahsulotlar o\'chiriladi!', {
      text: 'Savdo tarixi saqlanadi. Tasdiqlash uchun OCHIR deb yozing.', input: true, placeholder: 'OCHIR', okText: 'O\'chirish', danger: true
    });
    if (w === null) return;
    if (w !== 'OCHIR') return toast('Tasdiqlash so\'zi xato — bekor qilindi');
    try {
      const r = await api('/products', { method: 'DELETE' });
      toast(r.deleted + ' ta mahsulot o\'chirildi', true);
      renderTab('products');
    } catch (e) { toast(e.message); }
  };
  $('pBody').onclick = async e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openAddProduct(d.products.find(p => p.id === +ed.dataset.edit));
    const dl = e.target.closest('[data-del]');
    if (dl) {
      const p = d.products.find(x => x.id === +dl.dataset.del);
      if (await askModal('"' + (p ? p.name : '') + '" o\'chirilsinmi?', { okText: 'O\'chirish', danger: true })) {
        try {
          await api('/products/' + dl.dataset.del, { method: 'DELETE' });
          toast('O\'chirildi', true);
          renderTab('products');
        } catch (err) { toast(err.message); }
      }
    }
  };
}

/* ===== Sotuvchilar ===== */
function openPinModal(pin, title) {
  openModal(
    '<div class="m-icon">' + icon('key') + '</div>' +
    '<h3 style="justify-content:center">' + esc(title) + '</h3>' +
    '<div class="pin-big">' + esc(pin) + '</div>' +
    '<div class="muted sm" style="text-align:center">Bu PINni sotuvchiga bering. Sotuvchilar jadvalida ham ko\'rinib turadi.</div>' +
    '<div style="height:14px"></div><button class="btn big" id="pinOk">Tushundim</button>'
  );
  $('pinOk').onclick = closeModal;
}

async function renderSellersTab(el) {
  const d = await api('/sellers');
  const active = d.sellers.filter(s => s.is_active).length;
  el.innerHTML =
    pageHead('Sotuvchilar', active + ' ta faol sotuvchi', '<button class="btn" id="btnAddSeller">' + icon('userPlus', 's') + 'Sotuvchi qo\'shish</button>') +
    (d.sellers.length ? '<div class="table-wrap"><table class="table"><thead>' +
    '<tr><th>Sotuvchi</th><th>PIN</th><th class="r">Bugun</th><th class="r">Bu oy</th><th>Holat</th><th></th></tr></thead><tbody>' +
    d.sellers.map(s =>
      '<tr class="' + (s.is_active ? '' : 'row-off') + '">' +
      '<td><div class="t-name">' + avatar(s.name, 36) + '<div><b>' + esc(s.name) + '</b><div class="sub">' + esc(s.phone || 'telefon yo\'q') + '</div></div></div></td>' +
      '<td><b class="num" style="letter-spacing:3px;color:var(--acc)">' + esc(s.pin_view || '—') + '</b></td>' +
      '<td class="r num">' + s.today_c + ' ta<div class="sub muted">' + fmt(s.today_s) + '</div></td>' +
      '<td class="r num">' + s.month_c + ' ta<div class="sub muted">' + fmt(s.month_s) + '</div></td>' +
      '<td>' + (s.is_active ? '<span class="badge b-ok">Faol</span>' : '<span class="badge b-no">Bloklangan</span>') + '</td>' +
      '<td><div class="acts">' +
      '<button class="icon-btn sm flat" data-ph="' + s.id + '" data-cur="' + esc(s.phone || '') + '" title="Telefonni o\'zgartirish" aria-label="Telefonni o\'zgartirish">' + icon('phone', 's') + '</button>' +
      '<button class="icon-btn sm flat" data-pin="' + s.id + '" title="PIN almashtirish" aria-label="PIN almashtirish">' + icon('key', 's') + '</button>' +
      '<button class="icon-btn sm flat' + (s.is_active ? ' danger' : '') + '" data-tgl="' + s.id + '" data-on="' + (s.is_active ? '0' : '1') + '" title="' + (s.is_active ? 'Bloklash' : 'Faollashtirish') + '" aria-label="' + (s.is_active ? 'Bloklash' : 'Faollashtirish') + '">' + icon(s.is_active ? 'pause' : 'play', 's') + '</button>' +
      '</div></td></tr>'
    ).join('') + '</tbody></table></div>'
    : '<div class="panel empty">' + icon('users') + 'Sotuvchi yo\'q — birinchisini qo\'shing</div>');

  $('btnAddSeller').onclick = async () => {
    const name = await askModal('Yangi sotuvchi ismi', { input: true, placeholder: 'Masalan: Aziz', okText: 'Keyingi' });
    if (!name) return;
    let phone = '';
    while (true) {
      const p = await askModal('Sotuvchi telefoni (chekda chiqadi)', { input: true, placeholder: 'Masalan: 901234567', okText: 'Yaratish' });
      if (p === null) return;
      if (p) { phone = p; break; }
      toast('Telefon raqamini kiritish shart');
    }
    try {
      const r = await api('/sellers', { method: 'POST', body: { name, phone } });
      openPinModal(r.pin, name + ' — PIN kodi');
      renderTab('sellers');
    } catch (e) { toast(e.message); }
  };
  el.onclick = async e => {
    const ph = e.target.closest('[data-ph]');
    if (ph) {
      const phone = await askModal('Sotuvchi telefoni (chekda chiqadi)', { input: true, placeholder: ph.dataset.cur || 'Masalan: 901234567', okText: 'Saqlash' });
      if (phone === null) return;
      if (!phone) return toast('Telefon raqami bo\'sh bo\'lishi mumkin emas');
      try {
        await api('/sellers/' + ph.dataset.ph, { method: 'PATCH', body: { phone } });
        toast('Telefon saqlandi', true);
        renderTab('sellers');
      } catch (err) { toast(err.message); }
      return;
    }
    const pn = e.target.closest('[data-pin]');
    if (pn) {
      if (await askModal('PIN almashtirilsinmi?', { okText: 'Almashtirish' })) {
        try {
          const r = await api('/sellers/' + pn.dataset.pin + '/reset-pin', { method: 'POST' });
          openPinModal(r.pin, 'Yangi PIN');
          renderTab('sellers');
        } catch (err) { toast(err.message); }
      }
      return;
    }
    const tg2 = e.target.closest('[data-tgl]');
    if (tg2) {
      try {
        await api('/sellers/' + tg2.dataset.tgl, { method: 'PATCH', body: { is_active: tg2.dataset.on === '1' } });
        renderTab('sellers');
      } catch (err) { toast(err.message); }
    }
  };
}

/* ===== Xaridorlar — tezkor qidiruv ===== */
const CUST_FILTER = { q: '', debt: false, sort: 'recent' };

async function renderCustomersTab(el) {
  const month = todayStr().slice(0, 7);
  el.innerHTML =
    pageHead('Xaridorlar', 'Ism (lotin yoki kirill) yoki telefon raqami bo\'yicha tez qidiring', '') +
    '<div class="mini-stats" id="cStats"></div>' +
    '<div class="toolbar">' +
    '<div class="search-box">' + icon('search') + '<input class="search" id="cQ" placeholder="Masalan: Ali, Алишер yoki 90 123..." autocomplete="off" value="' + esc(CUST_FILTER.q) + '"><kbd>/</kbd></div>' +
    '<div class="seg sm" id="cDebt"><button class="' + (CUST_FILTER.debt ? '' : 'on') + '" data-d="0">Hammasi</button><button class="' + (CUST_FILTER.debt ? 'on' : '') + '" data-d="1">Qarzdorlar</button></div>' +
    '<select class="inp" id="cSort" style="width:auto;border-radius:999px" aria-label="Saralash">' +
    [['recent', 'Oxirgi xarid'], ['debt', 'Qarz bo\'yicha'], ['spent', 'Xarid summasi'], ['name', 'Ism (A–Z)']]
      .map(o => '<option value="' + o[0] + '"' + (CUST_FILTER.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
    '</div>' +
    '<div id="cTable"></div>';

  let seq = 0, t = null;
  const load = async () => {
    const my = ++seq;
    const p = new URLSearchParams();
    if (CUST_FILTER.q) p.set('q', CUST_FILTER.q);
    if (CUST_FILTER.debt) p.set('debt', '1');
    p.set('sort', CUST_FILTER.sort);
    const d = await api('/customers?' + p.toString());
    if (my !== seq || !$('cTable')) return;
    const q = CUST_FILTER.q;
    $('cStats').innerHTML =
      '<div class="mini-stat"><span class="ttl-ic">' + icon('users') + '</span><div><div class="sm muted">Jami xaridorlar</div><div class="v num">' + d.total + '</div></div></div>' +
      '<div class="mini-stat"><span class="ttl-ic">' + icon('book') + '</span><div><div class="sm muted">Qarzdorlar</div><div class="v num">' + d.debtors + '</div></div></div>' +
      '<div class="mini-stat"><span class="ttl-ic">' + icon('wallet') + '</span><div><div class="sm muted">Umumiy qarz</div><div class="v num" style="color:' + (d.debt_sum > 0 ? 'var(--danger)' : 'inherit') + '">' + money(d.debt_sum) + '</div></div></div>';
    $('cTable').innerHTML = d.customers.length
      ? '<div class="muted sm" style="margin:0 4px 8px">' + (q || CUST_FILTER.debt ? d.customers.length + ' ta natija' : 'Oxirgi ' + d.customers.length + ' ta xaridor') + '</div>' +
        '<div class="table-wrap"><table class="table"><thead>' +
        '<tr><th>Xaridor</th><th class="r">Qarz (nasiya)</th><th class="r">Savdolar</th><th class="r">Jami xarid</th><th>Oxirgi savdo</th><th>Holati</th><th></th></tr></thead><tbody>' +
        d.customers.map(c =>
          '<tr data-hist="' + c.id + '" style="cursor:pointer">' +
          '<td><div class="t-name">' + avatar(c.name, 36) + '<div><b>' + hl(c.name, q) + '</b><div class="sub">' + (c.phone ? hl(c.phone, q) : 'telefon yo\'q') + (c.first_seller ? ' · ' + esc(c.first_seller) : '') + '</div></div></div></td>' +
          '<td class="r num"><b' + (c.debt_uzs > 0 ? ' class="debt-red"' : '') + '>' + fmt(c.debt_uzs) + '</b></td>' +
          '<td class="r num">' + c.visits + ' ta</td>' +
          '<td class="r num">' + fmt(c.total_spent) + '</td>' +
          '<td class="muted num">' + esc(c.last_visit || '—') + '</td>' +
          '<td>' + (c.first_seen && c.first_seen.slice(0, 7) === month ? '<span class="badge b-ok">Yangi</span>' : '<span class="badge b-neu">Doimiy</span>') + '</td>' +
          '<td><div class="acts"><button class="icon-btn sm flat" title="Tarix va qarz" aria-label="Tarix va qarz">' + icon('history', 's') + '</button></div></td>' +
          '</tr>'
        ).join('') + '</tbody></table></div>'
      : '<div class="panel empty">' + icon('search') + (q ? '«' + esc(q) + '» bo\'yicha xaridor topilmadi' : 'Xaridorlar yo\'q') + '</div>';
  };
  $('cQ').oninput = e => { CUST_FILTER.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(load, 150); };
  $('cDebt').onclick = e => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    CUST_FILTER.debt = b.dataset.d === '1';
    $('cDebt').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    load();
  };
  $('cSort').onchange = e => { CUST_FILTER.sort = e.target.value; load(); };
  $('cTable').onclick = e => {
    const h = e.target.closest('[data-hist]');
    if (h) openCustomerHistory(+h.dataset.hist, load);
  };
  document.onkeydown = e => {
    if (ADMIN_TAB !== 'customers' || modalOpen()) return;
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('cQ').focus(); }
  };
  await load();
  if (!('ontouchstart' in window)) $('cQ').focus();
}

/* ===== Xaridor tarixi va qarz boshqaruvi ===== */
const DEBT_KIND_LABELS = { payment: 'Qarz to\'lovi', cancel: 'Chek bekor qilindi', adjust: 'Tuzatish' };

async function openCustomerHistory(id, onChange) {
  let d;
  try { d = await api('/customers/' + id + '/history'); } catch (e) { return toast(e.message); }
  const c = d.customer;
  openModal(
    '<div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">' + avatar(c.name, 48) +
    '<div><h3 style="margin:0">' + esc(c.name) + '</h3>' +
    '<div class="muted sm">' + esc(c.phone || 'telefon yo\'q') + (c.first_seller ? ' · birinchi sotuvchi: ' + esc(c.first_seller) : '') + (c.first_seen ? ' · ' + c.first_seen : '') + '</div></div></div>' +
    '<div class="stat-cards"><div class="scard"><div class="sc-l">Hozirgi qarzi</div>' +
    '<div class="sc-v num"' + (c.debt_uzs > 0 ? ' style="color:var(--danger)"' : '') + '>' + money(c.debt_uzs) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Savdolar</div><div class="sc-v num">' + d.sales.filter(s => !s.is_cancelled).length + ' ta</div></div></div>' +
    '<div class="filters">' +
    '<button class="btn" id="chPay">' + icon('cash', 's') + 'To\'lov qayd etish</button>' +
    '<button class="btn ghost" id="chFix">' + icon('edit', 's') + 'Qarzni tuzatish</button>' +
    '</div>' +
    '<h4 class="sec-t">Savdo tarixi</h4>' +
    '<div class="panel" style="max-height:230px;overflow-y:auto;background:var(--soft2);padding:4px 14px">' +
    (d.sales.length ? d.sales.map(s =>
      '<div class="li-row' + (s.is_cancelled ? ' row-off' : '') + '"><div><b>' + chekNo(s.id) + '</b> · <span class="num">' + s.t + '</span>' +
      '<div class="muted sm">' + esc(s.seller_name) + ' · ' + s.items_count + ' ta · ' + payLabel(s.payment_method) +
      (s.payment_method === 'nasiya' && s.old_debt_uzs > 0 ? ' · eski nasiya ' + fmt(s.old_debt_uzs) + ' → umumiy ' + fmt(s.old_debt_uzs + s.total_uzs) : '') +
      (s.is_cancelled ? ' · bekor' : '') +
      '</div></div><b class="num">' + money(s.total_uzs) + '</b></div>'
    ).join('') : '<div class="muted" style="padding:10px 0">Savdo yo\'q</div>') + '</div>' +
    '<h4 class="sec-t">Qarz harakatlari</h4>' +
    '<div class="panel" style="max-height:230px;overflow-y:auto;background:var(--soft2);padding:4px 14px">' +
    (d.payments.length ? d.payments.map(p =>
      '<div class="li-row"><div><b>' + (DEBT_KIND_LABELS[p.kind] || p.kind) + '</b> · <span class="num">' + p.t + '</span>' +
      '<div class="muted sm">' + esc(p.by_name) + (p.note ? ' · ' + esc(p.note) : '') + ' · qoldi: ' + fmt(p.debt_after_uzs) + '</div></div>' +
      '<b class="num" style="color:' + (p.amount_uzs < 0 ? 'var(--acc)' : 'var(--danger)') + '">' + (p.amount_uzs > 0 ? '+' : '') + fmt(p.amount_uzs) + '</b></div>'
    ).join('') : '<div class="muted" style="padding:10px 0">Harakat yo\'q</div>') + '</div>' +
    '<div style="height:14px"></div>' +
    '<button class="btn ghost big" id="chClose">Yopish</button>', true
  );
  $('chClose').onclick = closeModal;
  $('chPay').onclick = async () => {
    if (c.debt_uzs <= 0) return toast('Bu xaridorning qarzi yo\'q');
    const amt = await askModal("To'lov summasi (jami qarz: " + fmt(c.debt_uzs) + " so'm)", { input: true, numeric: true, placeholder: "Summa (so'm)", okText: 'Qayd etish' });
    if (amt === null) return;
    const amount = parseInt(String(amt).replace(/\s+/g, ''), 10);
    if (!(amount > 0)) return toast('Summani kiriting');
    const note = await askModal('Izoh (ixtiyoriy)', { input: true, placeholder: 'Masalan: qisman to\'ladi', okText: 'Saqlash' });
    if (note === null) return;
    try {
      const r = await api('/customers/' + id + '/pay-debt', { method: 'POST', body: { amount, note } });
      toast("To'lov qayd etildi. Qolgan qarz: " + fmt(r.debt_uzs), true);
      openCustomerHistory(id, onChange);
      if (onChange) onChange();
    } catch (e) { toast(e.message); }
  };
  $('chFix').onclick = async () => {
    const v = await askModal('Qarzning yangi qiymati (hozir: ' + fmt(c.debt_uzs) + ')', { input: true, numeric: true, placeholder: "Yangi qarz (so'm)", okText: 'Davom etish' });
    if (v === null) return;
    const nd = parseInt(String(v).replace(/\s+/g, ''), 10);
    if (!isFinite(nd) || nd < 0) return toast('Summa noto\'g\'ri');
    const reason = await askModal('Tuzatish sababi', { input: true, placeholder: 'Masalan: hisobda xatolik', okText: 'Saqlash' });
    if (reason === null) return;
    try {
      await api('/customers/' + id + '/debt', { method: 'PATCH', body: { debt_uzs: nd, reason } });
      toast('Qarz tuzatildi', true);
      openCustomerHistory(id, onChange);
      if (onChange) onChange();
    } catch (e) { toast(e.message); }
  };
}

/* ===== Sozlamalar ===== */
async function renderSettingsTab(el) {
  const s = await api('/settings');
  el.innerHTML =
    pageHead('Sozlamalar', 'Do\'kon, chek, printer va xavfsizlik', '') +
    '<div class="settings-grid">' +
    '<section class="panel">' + panelHead('Do\'kon va chek', 'Chekda chiqadigan ma\'lumotlar', 'store') +
    '<label class="lbl" for="stTitle">Chek sarlavhasi (katta harflar bilan chiqadi)</label>' +
    '<input class="inp" id="stTitle" value="' + esc(s.receipt_title || 'SAVDO') + '" placeholder="SAVDO">' +
    '<label class="lbl" for="stName">Do\'kon nomi</label>' +
    '<input class="inp" id="stName" value="' + esc(s.shop_name) + '">' +
    '<div class="two-col" style="gap:10px">' +
    '<div><label class="lbl" for="stPhone">Telefon 1</label><input class="inp" id="stPhone" value="' + esc(s.shop_phone) + '" placeholder="901234567"></div>' +
    '<div><label class="lbl" for="stPhone2">Telefon 2</label><input class="inp" id="stPhone2" value="' + esc(s.phone_2 || '') + '" placeholder="937654321"></div></div>' +
    '<div class="hint">' + icon('info') + 'Bu ikki raqam chek yuqorisida chiqadi. Sotuvchi raqami Sotuvchilar bo\'limida yoziladi.</div>' +
    '<label class="lbl" for="stRate">USD kursi (1 dollar = ? so\'m)</label>' +
    '<input class="inp" id="stRate" type="number" min="1" step="0.01" inputmode="decimal" value="' + s.usd_rate + '">' +
    '<div class="hint">' + icon('info') + 'Kurs o\'zgarsa, dollardagi mahsulotlar narxi shu zahoti yangi kurs bilan hisoblanadi.</div>' +
    '<label class="lbl" for="stPName">Windows printer nomi (USB XPrinter)</label>' +
    '<input class="inp" id="stPName" value="' + esc(s.printer_name || '') + '" placeholder="Masalan: XPrinter_58 yoki POS-80">' +
    '<div class="status-line" id="prStatus"><span class="status-dot"></span>Print-agent: tekshirilmoqda...</div>' +
    '<div class="modal-btns"><button class="btn ghost" id="btnPT">' + icon('printer', 's') + 'Printer test</button><button class="btn" id="stSave">' + icon('check', 's') + 'Saqlash</button></div>' +
    '</section>' +
    '<div class="stack">' +
    '<section class="panel">' + panelHead('Backup (zaxira nusxa)', 'Butun bazani .json faylga saqlash va tiklash', 'database') +
    '<div class="filters">' +
    '<button class="btn" id="btnBackupExp">' + icon('download', 's') + 'Yuklab olish</button>' +
    '<button class="btn ghost" id="btnBackupImp">' + icon('upload', 's') + 'Faylni tanlash</button>' +
    '</div>' +
    '<input type="file" id="bkFile" accept=".json,application/json" hidden>' +
    '<div class="hint" id="bkInfo" hidden></div>' +
    '<button class="btn danger big" id="btnBackupApply" hidden style="margin-top:10px">' + icon('alert', 's') + 'Tiklash (ma\'lumotlar almashtiriladi)</button>' +
    '</section>' +
    '<section class="panel">' + panelHead('Admin paroli', 'Kamida 6 belgi', 'lock') +
    '<label class="lbl" for="pwOld">Eski parol</label><input class="inp" id="pwOld" type="password" autocomplete="current-password">' +
    '<label class="lbl" for="pwNew">Yangi parol</label><input class="inp" id="pwNew" type="password" autocomplete="new-password">' +
    '<div style="height:14px"></div>' +
    '<button class="btn big" id="pwSave">Parolni o\'zgartirish</button></section>' +
    '</div></div>';

  $('stSave').onclick = async function () {
    try {
      await api('/settings', {
        method: 'PUT',
        body: {
          receipt_title: $('stTitle').value,
          shop_name: $('stName').value,
          shop_phone: $('stPhone').value,
          phone_2: $('stPhone2').value,
          usd_rate: parseFloat($('stRate').value),
          printer_name: $('stPName').value
        }
      });
      SHOP_NAME = $('stName').value.trim() || SHOP_NAME;
      toast('Sozlamalar saqlandi', true);
    } catch (e) { toast(e.message); }
  };
  let pendingBackup = null;
  const bkFile = $('bkFile'), bkInfo = $('bkInfo'), bkApply = $('btnBackupApply');
  $('btnBackupExp').onclick = () => {
    const d = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).replace(/[: ]/g, '-').slice(0, 16);
    downloadFile('/backup/export', 'savdo-backup-' + d + '.json');
  };
  $('btnBackupImp').onclick = () => bkFile.click();
  bkFile.onchange = async function () {
    const f = this.files[0];
    this.value = '';
    pendingBackup = null;
    bkApply.hidden = true;
    bkInfo.hidden = false;
    if (!f) return;
    bkInfo.textContent = 'Fayl o\'qilmoqda...';
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { bkInfo.textContent = 'Faylni o\'qib bo\'lmadi — bu .json backup fayli emas.'; return; }
    if (!data || data.app !== 'savdo' || !data.tables || typeof data.tables !== 'object') {
      bkInfo.textContent = 'Bu savdo backup fayli emas. "Yuklab olish" orqali olingan faylni tanlang.';
      return;
    }
    const c = data.counts || {};
    const when = data.exported_at ? new Date(data.exported_at).toLocaleString('sv-SE', { timeZone: 'Asia/Tashkent' }).slice(0, 16) : '—';
    bkInfo.textContent = f.name + ' · ' + when + ' · sotuvchi: ' + (c.sellers || 0) + ', mahsulot: ' + (c.products || 0) +
      ', xaridor: ' + (c.customers || 0) + ', savdo: ' + (c.sales || 0) + ', qarz yozuvi: ' + (c.customer_payments || 0);
    pendingBackup = data;
    bkApply.hidden = false;
  };
  bkApply.onclick = async function () {
    if (!pendingBackup) return toast('Avval backup faylini tanlang');
    const word = await askModal('Barcha hozirgi ma\'lumotlar backup bilan almashtiriladi', { text: 'Tasdiqlash uchun TIKLA deb yozing.', input: true, placeholder: 'TIKLA', okText: 'Tiklash', danger: true });
    if (word === null) return;
    if (String(word).trim().toUpperCase() !== 'TIKLA') return toast('Tasdiqlash so\'zi xato — bekor qilindi');
    this.disabled = true;
    try {
      const r = await api('/backup/import', { method: 'POST', body: pendingBackup });
      custCache = [];
      pendingBackup = null;
      toast('Tiklandi: ' + (r.imported.sales || 0) + ' ta savdo, ' + (r.imported.customers || 0) + ' ta xaridor', true);
      renderTab('settings');
    } catch (e) { toast(e.message); this.disabled = false; }
  };
  (async () => {
    const box = $('prStatus');
    try {
      const d = await api('/printer/status');
      if (!$('prStatus')) return;
      box.innerHTML = d.online
        ? '<span class="status-dot on"></span><span>Print-agent <b>ulangan</b> — savdodan keyin chek avtomatik chiqadi</span>'
        : '<span class="status-dot off"></span><span>Print-agent <b>ulanmagan</b> — do\'kondagi kompyuterda "PRINTERNI ISHGA TUSHIRISH.bat" ishlab turishi kerak</span>';
    } catch (e) { box.textContent = 'Print-agent holatini olib bo\'lmadi'; }
  })();
  $('btnPT').onclick = async function () {
    this.disabled = true;
    try { await api('/printer/test', { method: 'POST' }); toast('Test cheki printerga yuborildi', true); } catch (e) { toast(e.message); }
    this.disabled = false;
  };
  $('pwSave').onclick = async function () {
    try {
      await api('/auth/change-password', { method: 'POST', body: { old_password: $('pwOld').value, new_password: $('pwNew').value } });
      toast('Parol o\'zgartirildi', true);
      $('pwOld').value = '';
      $('pwNew').value = '';
    } catch (e) { toast(e.message); }
  };
}

async function downloadFile(path, name) {
  try {
    const r = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!r.ok) throw new Error('Yuklab bo\'lmadi');
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { toast(e.message); }
}

/* ===== Ishga tushirish ===== */
async function boot() {
  if (!TOKEN) return renderLogin();
  try {
    const d = await api('/auth/me');
    ME = d.me;
    if (ME.role === 'seller') renderSeller();
    else renderAdmin();
  } catch (e) { /* 401 bo'lsa renderLogin allaqachon chaqirildi */ }
}
boot();
