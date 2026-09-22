'use strict';
/* ===== Savdo — Telegram Mini App + Admin panel ===== */
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch (e) {} }

const app = document.getElementById('app');
let TOKEN = localStorage.getItem('token') || '';
let ME = null;
let CACHE = { products: [], usd_rate: 0, shop_name: '', shop_phone: '' };
let cart = {};          // product_id -> qty
let custNames = null;
let ADMIN_TAB = 'dash';

/* ===== Yordamchilar ===== */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) { return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function money(n) { return fmt(n) + " so'm"; }
function chekNo(n) { return '#' + String(n).padStart(6, '0'); }
const PAY_LABELS = { naqd: '💵 Naqd', karta: '💳 Plastik karta', nasiya: '📕 Nasiya' };

let toastT;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
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

/* ===== Modal ===== */
function openModal(html) {
  let root = document.getElementById('modalRoot');
  if (!root) { root = document.createElement('div'); root.id = 'modalRoot'; document.body.appendChild(root); }
  root.innerHTML = '<div class="modal-back" id="modalBack"><div class="modal">' + html + '</div></div>';
  document.getElementById('modalBack').addEventListener('click', e => {
    if (e.target.id === 'modalBack') closeModal();
  });
}
function closeModal() {
  const r = document.getElementById('modalRoot');
  if (r) r.innerHTML = '';
}

function askModal(title, opts = {}) {
  return new Promise(resolve => {
    openModal(
      '<h3>' + esc(title) + '</h3>' +
      (opts.input ? '<input class="inp" id="askInp" placeholder="' + esc(opts.placeholder || '') + '">' : '') +
      '<div class="modal-btns">' +
      '<button class="btn ghost" id="askNo">Bekor qilish</button>' +
      '<button class="btn ' + (opts.danger ? 'danger' : '') + '" id="askYes">' + esc(opts.okText || 'OK') + '</button></div>'
    );
    const done = v => { closeModal(); resolve(v); };
    document.getElementById('askNo').onclick = () => done(null);
    document.getElementById('askYes').onclick = () => done(opts.input ? document.getElementById('askInp').value.trim() : true);
    if (opts.input) document.getElementById('askInp').focus();
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

function renderLogin() {
  app.innerHTML =
    '<div class="login-wrap"><div class="login-card">' +
    '<div class="logo">🛒</div><h2>Savdo</h2>' +
    '<div class="muted sm">Sotuvchi PIN kodini kiriting</div>' +
    '<div class="pin-dots" id="pinDots"></div>' +
    '<div class="numpad" id="numpad">' +
    [1,2,3,4,5,6,7,8,9].map(n => '<button class="np-btn" data-k="' + n + '">' + n + '</button>').join('') +
    '<button class="np-btn" data-k="del">⌫</button>' +
    '<button class="np-btn" data-k="0">0</button>' +
    '<button class="np-btn ok" data-k="ok">✔</button>' +
    '</div>' +
    '<button class="link-btn" id="adminToggle">Admin kirish →</button>' +
    '<form id="adminForm" class="admin-form" hidden>' +
    '<input class="inp" id="aUser" placeholder="Login" autocomplete="username">' +
    '<input class="inp" id="aPass" type="password" placeholder="Parol" autocomplete="current-password">' +
    '<button class="btn big" type="submit">Kirish</button></form>' +
    '</div></div>';

  let pin = '';
  const dots = document.getElementById('pinDots');
  const upd = () => {
    dots.innerHTML = [0,1,2,3].map(i => '<span class="dot' + (i < pin.length ? ' on' : '') + '"></span>').join('');
  };
  upd();

  document.getElementById('numpad').onclick = async e => {
    const b = e.target.closest('.np-btn');
    if (!b || b.disabled) return;
    const k = b.dataset.k;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') return;
    else if (pin.length < 4) pin += k;
    upd();
    if (pin.length === 4) {
      try {
        const d = await api('/auth/login-pin', { method: 'POST', body: { pin } });
        saveLogin(d);
      } catch (err) { toast(err.message); pin = ''; upd(); }
    }
  };

  document.getElementById('adminToggle').onclick = () => {
    const f = document.getElementById('adminForm');
    f.hidden = !f.hidden;
  };
  document.getElementById('adminForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = await api('/auth/login-admin', {
        method: 'POST',
        body: { username: document.getElementById('aUser').value, password: document.getElementById('aPass').value }
      });
      saveLogin(d);
    } catch (err) { toast(err.message); }
  };
}

/* ===== SOTUVCHI ===== */
async function renderSeller() {
  let d;
  try { d = await api('/products'); } catch (e) { return; }
  CACHE = d;
  cart = {};
  app.innerHTML =
    '<header class="topbar">' +
    '<div><div class="shop-name">' + esc(d.shop_name) + '</div><div class="muted sm">' + esc(ME.name) + '</div></div>' +
    '<div class="tb-right">' +
    '<button class="icon-btn" id="btnRefresh" title="Yangilash">⟳</button>' +
    '<button class="icon-btn" id="btnAddP" title="Mahsulot qo\'shish">＋</button>' +
    '<button class="icon-btn" id="btnKab" title="Kabinetim">📊</button>' +
    '<button class="icon-btn danger" id="btnLogout" title="Chiqish">⏻</button>' +
    '</div></header>' +
    '<div class="wrap" id="mainWrap">' +
    '<input id="search" class="search" placeholder="🔍 Mahsulot izlash...">' +
    '<div id="grid" class="grid"></div>' +
    '</div>' +
    '<div id="cartBar" class="cart-bar" hidden></div>' +
    '<div id="modalRoot"></div>';

  renderGrid('');
  document.getElementById('search').oninput = e => renderGrid(e.target.value.toLowerCase());
  document.getElementById('btnRefresh').onclick = () => renderSeller();
  document.getElementById('btnAddP').onclick = () => openAddProduct(null);
  document.getElementById('btnKab').onclick = () => renderKabinet();
  document.getElementById('btnLogout').onclick = async () => {
    if (await askModal('Chiqmoqchimisiz?')) logout();
  };
  document.getElementById('grid').onclick = e => {
    const c = e.target.closest('.card');
    if (c) addToCart(+c.dataset.id);
  };
  document.getElementById('cartBar').onclick = e => {
    if (e.target.closest('#btnCart')) openCart();
  };
}

function renderGrid(filter) {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const list = CACHE.products.filter(p => !filter || p.name.toLowerCase().includes(filter));
  grid.innerHTML = list.length ? list.map(p =>
    '<div class="card" data-id="' + p.id + '">' +
    '<div class="thumb">' +
    (p.has_image
      ? '<img loading="lazy" src="/api/products/' + p.id + '/image" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      : '') +
    '<span class="ph"' + (p.has_image ? ' style="display:none"' : '') + '>📦</span>' +
    '</div>' +
    '<div class="pname">' + esc(p.name) + '</div>' +
    '<div class="pprice">' + fmt(p.price_uzs) + " so'm</div>" +
    (p.currency === 'USD' ? '<div class="porig">$' + fmt(p.price) + '</div>' : '') +
    '</div>'
  ).join('') : '<div class="empty">Mahsulot topilmadi</div>';
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  updateCartBar();
}
function cartItems() {
  return Object.keys(cart)
    .map(k => ({ p: CACHE.products.find(x => x.id === +k), qty: cart[k] }))
    .filter(x => x.p);
}
function cartTotal() {
  return cartItems().reduce((a, it) => a + it.p.price_uzs * it.qty, 0);
}
function updateCartBar() {
  const bar = document.getElementById('cartBar');
  if (!bar) return;
  const items = cartItems();
  if (!items.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  const count = items.reduce((a, it) => a + it.qty, 0);
  bar.hidden = false;
  bar.innerHTML =
    '<div class="cb-info"><b>' + count + ' ta mahsulot</b><span class="muted sm">' + money(cartTotal()) + '</span></div>' +
    '<button class="btn" id="btnCart">Savat ➜</button>';
}

async function ensureCustNames() {
  if (!custNames) {
    try { custNames = (await api('/customers/names')).names; } catch (e) { custNames = []; }
  }
  return custNames;
}

async function openCart() {
  const items = cartItems();
  if (!items.length) return;
  await ensureCustNames();
  let pay = 'naqd';
  const nasiyaPrice = {};   // product_id -> sotuvchi o'zgartirgan nasiya narxi (UZS)
  openModal(
    '<h3>🛒 Savat</h3>' +
    '<div id="cartList"></div>' +
    '<label class="lbl">Xaridor ismi *</label>' +
    '<input id="custName" class="inp" list="custList" placeholder="Masalan: Aziz" autocomplete="off">' +
    '<datalist id="custList">' + (custNames || []).map(c => '<option value="' + esc(c.name) + '"' + (c.phone ? ' label="' + esc(c.phone) + '"' : '') + '>').join('') + '</datalist>' +
    '<label class="lbl">Telefon (ixtiyoriy — eski xaridor tanlansa o\'zi chiqadi)</label>' +
    '<input id="custPhone" class="inp" type="tel" placeholder="Masalan: 90 123 45 67" autocomplete="off">' +
    '<div class="debt-box" id="debtBox" hidden></div>' +
    '<label class="lbl">To\'lov usuli</label>' +
    '<div class="pay-select" id="paySel">' +
    Object.keys(PAY_LABELS).map(k => '<button type="button" class="pay-btn' + (k === 'naqd' ? ' on' : '') + '" data-pay="' + k + '">' + PAY_LABELS[k] + '</button>').join('') +
    '</div>' +
    '<div class="hint" id="nasiyaHint" hidden>📕 Nasiya rejimi: har bir mahsulotning narxini bosing va o\'zgartiring (naqd narxdan farq qilishi mumkin)</div>' +
    '<div class="total-row"><span>Jami:</span><b id="cartTotalEl"></b></div>' +
    '<div class="total-row total-debt" id="debtTotalRow" hidden><span>Umumiy (eski nasiya bilan):</span><b id="debtTotalEl"></b></div>' +
    '<button class="btn big" id="btnSell">✅ Sotish</button>'
  );

  const nameInp = document.getElementById('custName');
  const phoneInp = document.getElementById('custPhone');
  let phoneAuto = false;
  const findCust = () => {
    const qv = nameInp.value.trim().toLowerCase();
    return (custNames || []).find(c => c.name.toLowerCase() === qv) || null;
  };
  const priceOf = it => (pay === 'nasiya' && nasiyaPrice[it.p.id] != null ? nasiyaPrice[it.p.id] : it.p.price_uzs);
  const total = () => cartItems().reduce((a, it) => a + priceOf(it) * it.qty, 0);

  const renderRows = () => {
    const list = document.getElementById('cartList');
    list.innerHTML = cartItems().map(it => {
      const pr = priceOf(it);
      return '<div class="cart-row" data-id="' + it.p.id + '">' +
        '<div class="cr-name">' + esc(it.p.name) +
        '<div class="muted sm nasiya-line">' +
        (pay === 'nasiya'
          ? 'Naqd: ' + fmt(it.p.price_uzs) + ' → <input class="nasiya-price" data-pid="' + it.p.id + '" type="number" min="0" step="1" inputmode="numeric" value="' + pr + '"> so\'m'
          : money(it.p.price_uzs)) +
        '</div></div>' +
        '<div class="cr-qty"><button class="qbtn" data-act="minus">−</button><b class="qv">' + it.qty + '</b><button class="qbtn" data-act="plus">+</button></div>' +
        '<div class="cr-sum" data-sum="' + it.p.id + '">' + money(pr * it.qty) + '</div>' +
        '</div>';
    }).join('');
  };

  const recalc = () => {
    document.getElementById('cartTotalEl').textContent = money(total());
    const c = findCust();
    const old = c ? Number(c.debt || 0) : 0;
    const box = document.getElementById('debtBox');
    if (old > 0) {
      box.hidden = false;
      box.innerHTML = '📕 ' + esc(c.name) + 'ning eski nasiyasi: <b>' + money(old) + '</b>';
    } else box.hidden = true;
    const row = document.getElementById('debtTotalRow');
    if (pay === 'nasiya' && old > 0) {
      row.hidden = false;
      document.getElementById('debtTotalEl').textContent = money(total() + old);
    } else row.hidden = true;
  };

  nameInp.oninput = () => {
    const qv = nameInp.value.trim().toLowerCase();
    const m = (custNames || []).find(c => c.name.toLowerCase() === qv);
    if (m && m.phone) { phoneInp.value = m.phone; phoneAuto = true; }
    else if (phoneAuto) { phoneInp.value = ''; phoneAuto = false; }
    recalc();
  };
  document.getElementById('paySel').onclick = e => {
    const b = e.target.closest('.pay-btn');
    if (!b) return;
    pay = b.dataset.pay;
    document.querySelectorAll('#paySel .pay-btn').forEach(x => x.classList.toggle('on', x === b));
    document.getElementById('nasiyaHint').hidden = pay !== 'nasiya';
    renderRows();
    recalc();
  };

  document.getElementById('cartList').onclick = e => {
    const b = e.target.closest('.qbtn');
    if (!b) return;
    const row = b.closest('.cart-row');
    const id = +row.dataset.id;
    if (b.dataset.act === 'plus') cart[id] = (cart[id] || 0) + 1;
    else {
      cart[id] = (cart[id] || 0) - 1;
      if (cart[id] <= 0) { delete cart[id]; row.remove(); }
    }
    if (cart[id] !== undefined) row.querySelector('.qv').textContent = cart[id];
    renderRows();
    recalc();
    updateCartBar();
    if (!Object.keys(cart).length) closeModal();
  };
  // Nasiya narxi tahrirlanganda — qator va jami summa yangilanadi (fokus saqlanadi)
  document.getElementById('cartList').addEventListener('input', e => {
    const inp = e.target.closest('.nasiya-price');
    if (!inp) return;
    const pid = +inp.dataset.pid;
    const v = parseInt(inp.value, 10);
    if (isFinite(v) && v >= 0) nasiyaPrice[pid] = v;
    else delete nasiyaPrice[pid];
    const it = cartItems().find(x => x.p.id === pid);
    const sumEl = document.querySelector('#cartList [data-sum="' + pid + '"]');
    if (it && sumEl) sumEl.textContent = money(priceOf(it) * it.qty);
    document.getElementById('cartTotalEl').textContent = money(total());
    const c = findCust();
    const old = c ? Number(c.debt || 0) : 0;
    if (pay === 'nasiya' && old > 0 && !document.getElementById('debtTotalRow').hidden) {
      document.getElementById('debtTotalEl').textContent = money(total() + old);
    }
  });

  renderRows();
  recalc();

  document.getElementById('btnSell').onclick = async function () {
    const cname = nameInp.value.trim();
    if (!cname) return toast('Xaridor ismini kiriting');
    if (!Object.keys(cart).length) return;
    this.disabled = true;
    try {
      const d = await api('/sales', {
        method: 'POST',
        body: {
          items: Object.keys(cart).map(k => {
            const o = { product_id: +k, qty: cart[k] };
            if (pay === 'nasiya' && nasiyaPrice[+k] != null) o.price_uzs = nasiyaPrice[+k];
            return o;
          }),
          customer_name: cname,
          customer_phone: phoneInp.value.trim(),
          payment_method: pay
        }
      });
      cart = {};
      custNames = null;
      updateCartBar();
      openSuccess(d.receipt);
    } catch (e) {
      toast(e.message);
      this.disabled = false;
    }
  };
}

function openSuccess(r) {
  const oldDebt = Number(r.old_debt_uzs || 0);
  openModal(
    '<div class="ok-emoji">✅</div>' +
    '<h3 style="text-align:center">Sotildi!</h3>' +
    '<div class="receipt-mini">' +
    '<div>Chek ' + chekNo(r.receipt_no) + '</div>' +
    '<div class="muted sm">' + esc(r.customer_name) + ' • ' + r.items.length + ' ta mahsulot • ' + (PAY_LABELS[r.payment_method] || PAY_LABELS.naqd).replace(/^\S+\s/, '') + '</div>' +
    '<div class="ok-total">' + money(r.total_uzs) + '</div>' +
    (r.payment_method === 'nasiya' && oldDebt > 0
      ? '<div class="muted sm">Eski nasiya: ' + money(oldDebt) + '</div>' +
        '<div class="ok-total" style="color:var(--danger)">Umumiy nasiya: ' + money(r.total_with_debt_uzs) + '</div>'
      : (oldDebt > 0 ? '<div class="muted sm" style="color:var(--danger)">Eski nasiyasi bor: ' + money(oldDebt) + '</div>' : '')) +
    '</div>' +
    '<div class="muted sm" style="text-align:center">Chek printerga yuborildi. Chiqmagan bo\'lsa — qayta chop etish tugmasini bosing.</div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn big" id="btnReprint">🖨 Chekni qayta chop etish</button>' +
    '<div style="height:8px"></div>' +
    '<button class="btn ghost big" id="btnOk2">Yopish</button>'
  );
  document.getElementById('btnReprint').onclick = () => reprint(r.receipt_no);
  document.getElementById('btnOk2').onclick = closeModal;
}

async function reprint(id) {
  try {
    await api('/sales/' + id + '/reprint', { method: 'POST' });
    toast('Chek printerga yuborildi');
  } catch (e) { toast(e.message); }
}

async function confirmCancel(id, after) {
  const reason = await askModal('Chek ' + chekNo(id) + ' bekor qilinsin mi?', {
    input: true, placeholder: 'Sabab (ixtiyoriy)', okText: 'Bekor qilish', danger: true
  });
  if (reason === null) return;
  try {
    await api('/sales/' + id + '/cancel', { method: 'POST', body: { reason } });
    toast('Bekor qilindi');
    if (after) after();
  } catch (e) { toast(e.message); }
}

/* ===== Mahsulot qo'shish / tahrirlash ===== */
function openAddProduct(existing) {
  const isEdit = !!existing;
  openModal(
    '<h3>' + (isEdit ? '✏️ Tahrirlash' : '➕ Yangi mahsulot') + '</h3>' +
    '<label class="lbl">Nomi *</label>' +
    '<input class="inp" id="npName" value="' + (existing ? esc(existing.name) : '') + '" placeholder="Masalan: Kofta">' +
    '<label class="lbl">Narxi *</label>' +
    '<input class="inp" id="npPrice" type="number" min="0" step="0.01" value="' + (existing ? existing.price : '') + '" placeholder="0">' +
    '<label class="lbl">Valyuta</label>' +
    '<select class="inp" id="npCur">' +
    '<option value="UZS"' + (existing && existing.currency === 'UZS' ? ' selected' : '') + ">So'm (UZS)</option>" +
    '<option value="USD"' + (existing && existing.currency === 'USD' ? ' selected' : '') + '>Dollar (USD)</option>' +
    '</select>' +
    '<label class="lbl">Rasm' + (isEdit ? ' (yangi tanlansa almashtiriladi)' : ' (ixtiyoriy)') + '</label>' +
    '<input class="inp" id="npFile" type="file" accept="image/*">' +
    '<img id="npPrev" class="prev-img" hidden alt="">' +
    '<div class="hint">USD tanlansa narx kurs bo\'yicha so\'mga aylantiriladi (kurs: ' + fmt(CACHE.usd_rate) + ')</div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn big" id="npSave">Saqlash</button>'
  );

  let imgData = null;
  document.getElementById('npFile').onchange = async function () {
    const f = this.files[0];
    if (!f) return;
    try {
      imgData = await compressImage(f);
      const pv = document.getElementById('npPrev');
      pv.src = imgData;
      pv.hidden = false;
    } catch (e) { toast('Rasmni o\'qib bo\'lmadi'); }
  };

  document.getElementById('npSave').onclick = async function () {
    const name = document.getElementById('npName').value.trim();
    const price = parseFloat(document.getElementById('npPrice').value);
    const currency = document.getElementById('npCur').value;
    if (!name) return toast('Nomini kiriting');
    if (!(price > 0)) return toast('Narxni kiriting');
    this.disabled = true;
    try {
      const body = { name, price, currency, image: imgData, image_mime: 'image/jpeg' };
      if (isEdit) await api('/products/' + existing.id, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      toast(isEdit ? 'Saqlandi' : 'Mahsulot qo\'shildi ✅');
      closeModal();
      if (ME.role === 'seller') renderSeller(); else renderTab('products');
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
    '<h3>📥 Excel import</h3>' +
    '<div class="hint" style="margin-top:0">Ustunlar: <b>Nomi</b>, <b>Narxi</b>, <b>Valyuta</b> (UZS/USD, bo\'sh bo\'lsa so\'m deb olinadi). ' +
    'Bazada mavjud yoki faylda takrorlangan nomlar o\'tkazib yuboriladi.</div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn ghost big" id="impTpl">⬇️ Namuna faylni yuklab olish</button>' +
    '<label class="lbl">Excel faylni tanlang (.xlsx)</label>' +
    '<input class="inp" id="impFile" type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">' +
    '<div id="impStatus" class="hint" hidden></div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn big" id="impGo" disabled>Import qilish</button>'
  );

  let b64 = null;
  document.getElementById('impTpl').onclick = () => downloadXlsx('/products/import/template.xlsx', 'mahsulot-namuna.xlsx');

  document.getElementById('impFile').onchange = function () {
    const f = this.files[0];
    const go = document.getElementById('impGo');
    b64 = null;
    go.disabled = true;
    if (!f) return;
    const st = document.getElementById('impStatus');
    st.hidden = false;
    st.textContent = 'Fayl o\'qilmoqda...';
    fileToB64(f).then(d => {
      b64 = d;
      st.textContent = '✅ "' + f.name + '" tanlandi — "Import qilish" tugmasini bosing';
      go.disabled = false;
    }).catch(() => { st.textContent = 'Faylni o\'qib bo\'lmadi'; });
  };

  document.getElementById('impGo').onclick = async function () {
    if (!b64) return;
    this.disabled = true;
    const st = document.getElementById('impStatus');
    st.hidden = false;
    st.textContent = 'Yuklanmoqda...';
    try {
      const r = await api('/products/import', { method: 'POST', body: { file_b64: b64 } });
      st.hidden = true;
      document.querySelector('#modalRoot .modal').innerHTML =
        '<h3>📥 Import yakuni</h3>' +
        '<div class="stat-cards">' +
        '<div class="scard"><div class="sc-l">Qo\'shildi</div><div class="sc-v" style="color:var(--acc-d)">✅ ' + r.added + '</div></div>' +
        '<div class="scard"><div class="sc-l">O\'tkazildi</div><div class="sc-v" style="color:var(--muted)">⏭ ' + r.skipped.length + '</div></div>' +
        '<div class="scard"><div class="sc-l">Xato</div><div class="sc-v" style="color:var(--danger)">❌ ' + r.failed.length + '</div></div>' +
        '</div>' +
        ((r.skipped.length || r.failed.length) ?
          '<div class="panel" style="max-height:200px;overflow-y:auto">' +
          r.skipped.map(s => '<div class="li-row"><span>' + s.row + '-qator: ' + esc(s.name) + '</span><span class="muted sm">⏭ ' + esc(s.reason) + '</span></div>').join('') +
          r.failed.map(f => '<div class="li-row"><span>' + f.row + '-qator: ' + esc(f.name) + '</span><span class="muted sm" style="color:var(--danger)">❌ ' + esc(f.reason) + '</span></div>').join('') +
          '</div>' : '') +
        '<button class="btn big" id="impOk">Tushundim</button>';
      document.getElementById('impOk').onclick = () => { closeModal(); renderTab('products'); };
    } catch (e) {
      st.textContent = '❌ ' + e.message;
      this.disabled = false;
    }
  };
}

/* ===== Sotuvchi kabineti ===== */
async function renderKabinet() {
  let d;
  try { d = await api('/sales/my-stats'); } catch (e) { return; }
  const w = document.getElementById('mainWrap');
  if (!w) return;
  w.innerHTML =
    '<button class="btn ghost" id="kBack">⟵ Dokonga qaytish</button>' +
    '<div class="stat-cards">' +
    '<div class="scard"><div class="sc-l">Bugungi savdo</div><div class="sc-v">' + d.today.c + ' ta</div><div class="sc-s">' + money(d.today.s) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Bu oy</div><div class="sc-v">' + d.month.c + ' ta</div><div class="sc-s">' + money(d.month.s) + '</div></div>' +
    '</div>' +
    '<h3 class="sec-t">🏆 Bu oyda eng ko\'p sotganim</h3>' +
    '<div class="panel">' + (d.top.length ? d.top.map(t =>
      '<div class="li-row"><span>' + esc(t.name) + '</span><span class="muted sm">' + t.qty + ' ta • ' + money(t.s) + '</span></div>'
    ).join('') : '<div class="muted">Hali savdo yo\'q</div>') + '</div>' +
    '<h3 class="sec-t">🧾 Oxirgi savdolarim</h3>' +
    '<div class="panel" id="mySales">' + d.recent.map(s => sellerSaleRow(s)).join('') + '</div>';

  document.getElementById('kBack').onclick = renderSeller;
  document.getElementById('mySales').onclick = e => {
    const v = e.target.closest('[data-view]'); if (v) return receiptModal(+v.dataset.view);
    const rp = e.target.closest('[data-rep]'); if (rp) return reprint(+rp.dataset.rep);
    const cn = e.target.closest('[data-can]'); if (cn) return confirmCancel(+cn.dataset.can, renderKabinet);
  };
}

function sellerSaleRow(s) {
  return (
    '<div class="li-row' + (s.is_cancelled ? ' row-off' : '') + '">' +
    '<div><b>' + chekNo(s.id) + '</b> • ' + esc(s.customer_name) +
    '<div class="muted sm">' + s.created_at + ' • ' + s.items_count + ' ta mahsulot • ' + (PAY_LABELS[s.payment_method] || PAY_LABELS.naqd).replace(/^\S+\s/, '') +
    (s.is_cancelled ? ' • ⛔ ' + esc(s.cancelled_by || '') + ' bekor qilgan' : '') +
    '</div></div>' +
    '<div style="text-align:right"><b>' + money(s.total_uzs) + '</b><div class="acts">' +
    '<button class="icon-btn" data-view="' + s.id + '" title="Ko\'rish">👁</button>' +
    '<button class="icon-btn" data-rep="' + s.id + '" title="Qayta chop etish">🖨</button>' +
    (s.is_cancelled ? '' : '<button class="icon-btn danger" data-can="' + s.id + '" title="Bekor qilish">⛔</button>') +
    '</div></div></div>'
  );
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
    '<div class="p-row"><span>Sotuvchi</span><b>' + esc(r.seller_name) + '</b></div>' +
    '<div class="p-row"><span>Xaridor</span><b>' + esc(r.customer_name) + '</b></div>' +
    (r.customer_phone ? '<div class="p-row"><span>Telefon</span><b>' + esc(r.customer_phone) + '</b></div>' : '') +
    '<div class="p-row"><span>To\'lov</span><b>' + esc((PAY_LABELS[r.payment_method] || PAY_LABELS.naqd).replace(/^\S+\s/, '')) + '</b></div>' +
    '<div class="p-sep"></div>' +
    r.items.map(i => '<div class="p-item"><span>' + esc(i.name) + ' ×' + i.qty + '</span><span>' + fmt(i.line_total_uzs) + '</span></div>').join('') +
    '<div class="p-sep"></div>' +
    '<div class="p-row p-total"><span>JAMI</span><b>' + money(r.total_uzs) + '</b></div>' +
    (Number(r.old_debt_uzs || 0) > 0
      ? '<div class="p-row"><span>Eski nasiya</span><b>' + money(r.old_debt_uzs) + '</b></div>' +
        (r.payment_method === 'nasiya'
          ? '<div class="p-row p-total" style="color:var(--danger)"><span>UMUMIY NASIYA</span><b>' + money(r.total_with_debt_uzs) + '</b></div>'
          : '<div class="p-row"><span>Qarzingiz (eslatma)</span><b>' + money(r.old_debt_uzs) + '</b></div>')
      : '') +
    (r.is_cancelled
      ? '<div class="p-cancel">⛔ BEKOR QILINGAN — ' + esc(r.cancelled_by || '') + ', ' + esc(r.cancelled_at || '') +
        (r.cancel_reason ? ' (' + esc(r.cancel_reason) + ')' : '') + '</div>'
      : '') +
    '</div>' +
    '<button class="btn big" id="mReprint">🖨 Qayta chop etish</button>' +
    '<div style="height:8px"></div>' +
    '<button class="btn ghost big" id="mClose">Yopish</button>'
  );
  document.getElementById('mReprint').onclick = () => reprint(r.receipt_no);
  document.getElementById('mClose').onclick = closeModal;
}

/* ===== ADMIN ===== */
async function renderAdmin(tab) {
  ADMIN_TAB = tab || ADMIN_TAB;
  app.innerHTML =
    '<header class="topbar">' +
    '<div><div class="shop-name">🛒 Admin panel</div><div class="muted sm">' + esc(ME.name) + '</div></div>' +
    '<div class="tb-right"><button class="icon-btn danger" id="btnLogout">⏻</button></div>' +
    '</header>' +
    '<nav class="tabs" id="tabs">' +
    [['dash','📊 Boshqaruv'],['sales','🧾 Savdolar'],['products','📦 Mahsulotlar'],['sellers','👥 Sotuvchilar'],['customers','🛍 Xaridorlar'],['settings','⚙️ Sozlamalar']]
      .map(t => '<button class="tab' + (t[0] === ADMIN_TAB ? ' on' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</nav>' +
    '<div class="wrap wide" id="adminContent"></div>' +
    '<div id="modalRoot"></div>';

  document.getElementById('tabs').onclick = e => {
    const b = e.target.closest('.tab');
    if (b) { ADMIN_TAB = b.dataset.tab; renderAdmin(); }
  };
  document.getElementById('btnLogout').onclick = async () => {
    if (await askModal('Chiqmoqchimisiz?')) logout();
  };
  renderTab(ADMIN_TAB);
}

async function renderTab(tab) {
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.innerHTML = '<div class="muted" style="padding:20px">Yuklanmoqda...</div>';
  try {
    if (tab === 'dash') await renderDash(el);
    else if (tab === 'sales') await renderSalesTab(el);
    else if (tab === 'products') await renderProductsTab(el);
    else if (tab === 'sellers') await renderSellersTab(el);
    else if (tab === 'customers') await renderCustomersTab(el);
    else if (tab === 'settings') await renderSettingsTab(el);
  } catch (e) {
    el.innerHTML = '<div class="err">' + esc(e.message) + '</div>';
  }
}

async function renderDash(el) {
  const d = await api('/stats/dashboard');
  const today = new Date().toLocaleDateString('sv-SE');
  const month = today.slice(0, 7);
  el.innerHTML =
    '<div class="stat-cards">' +
    '<div class="scard"><div class="sc-l">Bugun savdo</div><div class="sc-v">' + d.day.c + ' ta</div><div class="sc-s">' + money(d.day.s) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Bu oy savdo</div><div class="sc-v">' + d.month.c + ' ta</div><div class="sc-s">' + money(d.month.s) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Bekor (bugun)</div><div class="sc-v">' + d.day.cc + ' ta</div><div class="sc-s">' + money(d.day.cs) + '</div></div>' +
    '<div class="scard"><div class="sc-l">Xaridorlar (bugun)</div><div class="sc-v">🆕 ' + d.customers.new_today + '</div><div class="sc-s">🔁 ' + d.customers.returning_today + ' qaytgan</div></div>' +
    '<div class="scard"><div class="sc-l">USD kursi</div><div class="sc-v">' + fmt(d.usd_rate) + '</div><div class="sc-s">admin kiritgan</div></div>' +
    '</div>' +
    '<div class="two-col">' +
    '<div class="panel"><h3 class="sec-t" style="margin-top:0">👥 Sotuvchilar (bu oy)</h3>' +
    (d.sellers.length ? d.sellers.map(s =>
      '<div class="li-row"><span>' + esc(s.name) + '</span><span>' + s.c + ' ta • <b>' + money(s.s) + '</b></span></div>'
    ).join('') : '<div class="muted">Hali savdo yo\'q</div>') + '</div>' +
    '<div class="panel"><h3 class="sec-t" style="margin-top:0">🏆 Top mahsulotlar (bu oy)</h3>' +
    (d.top.length ? d.top.map(t =>
      '<div class="li-row"><span>' + esc(t.name) + '</span><span class="muted sm">' + t.qty + ' ta • ' + money(t.s) + '</span></div>'
    ).join('') : '<div class="muted">Hali savdo yo\'q</div>') + '</div>' +
    '</div>' +
    '<div class="panel"><h3 class="sec-t" style="margin-top:0">⬇️ Excel hisobot</h3>' +
    '<div class="filters">' +
    '<label>Kun <input type="date" class="inp" id="xD" value="' + today + '"></label>' +
    '<button class="btn" id="btnXD">Kunlik Excel</button>' +
    '<label>Oy <input type="month" class="inp" id="xM" value="' + month + '"></label>' +
    '<button class="btn" id="btnXM">Oylik Excel</button>' +
    '</div></div>';

  document.getElementById('btnXD').onclick = () => {
    const v = document.getElementById('xD').value;
    downloadXlsx('/reports/daily.xlsx' + (v ? '?date=' + v : ''), 'savdo-' + (v || today) + '.xlsx');
  };
  document.getElementById('btnXM').onclick = () => {
    const v = document.getElementById('xM').value;
    downloadXlsx('/reports/monthly.xlsx' + (v ? '?month=' + v : ''), 'savdo-' + (v || month) + '.xlsx');
  };
}

async function renderSalesTab(el) {
  const today = new Date().toLocaleDateString('sv-SE');
  const sellers = (await api('/sellers')).sellers;
  el.innerHTML =
    '<div class="filters">' +
    '<label>Dan <input type="date" class="inp" id="fFrom" value="' + today + '"></label>' +
    '<label>Gacha <input type="date" class="inp" id="fTo" value="' + today + '"></label>' +
    '<label>Sotuvchi <select class="inp" id="fSeller"><option value="">Barchasi</option>' +
    sellers.map(s => '<option value="' + s.id + '">' + esc(s.name) + '</option>').join('') + '</select></label>' +
    '<button class="btn" id="fApply">Ko\'rsatish</button>' +
    '</div><div id="salesTable"></div>';

  const load = async () => {
    const box = document.getElementById('salesTable');
    box.innerHTML = '<div class="muted" style="padding:16px">Yuklanmoqda...</div>';
    const params = new URLSearchParams();
    if (document.getElementById('fFrom').value) params.set('from', document.getElementById('fFrom').value);
    if (document.getElementById('fTo').value) params.set('to', document.getElementById('fTo').value);
    if (document.getElementById('fSeller').value) params.set('seller_id', document.getElementById('fSeller').value);
    const d = await api('/sales?' + params.toString());
    box.innerHTML = d.sales.length
      ? '<div class="table-wrap"><table class="table"><tr><th>Chek</th><th>Vaqt</th><th>Sotuvchi</th><th>Xaridor</th><th>Mahsulot</th><th>To\'lov</th><th>Summa</th><th>Holat</th><th></th></tr>' +
        d.sales.map(s =>
          '<tr class="' + (s.is_cancelled ? 'row-off' : '') + '">' +
          '<td><b>' + chekNo(s.id) + '</b></td><td>' + s.created_at + '</td><td>' + esc(s.seller_name) + '</td><td>' + esc(s.customer_name) + '</td>' +
          '<td>' + s.items_count + ' ta</td><td>' + esc((PAY_LABELS[s.payment_method] || PAY_LABELS.naqd).replace(/^\S+\s/, '')) + '</td><td><b>' + fmt(s.total_uzs) + '</b></td>' +
          '<td>' + (s.is_cancelled ? '<span class="badge b-no">bekor</span>' : '<span class="badge b-ok">sotilgan</span>') + '</td>' +
          '<td><div class="acts">' +
          '<button class="icon-btn" data-view="' + s.id + '" title="Ko\'rish">👁</button>' +
          '<button class="icon-btn" data-rep="' + s.id + '" title="Qayta chop etish">🖨</button>' +
          (s.is_cancelled ? '' : '<button class="icon-btn danger" data-can="' + s.id + '" title="Bekor qilish">⛔</button>') +
          '</div></td></tr>'
        ).join('') + '</table></div>'
      : '<div class="empty">Bu davrda savdo yo\'q</div>';
    box.onclick = e => {
      const v = e.target.closest('[data-view]'); if (v) return receiptModal(+v.dataset.view);
      const rp = e.target.closest('[data-rep]'); if (rp) return reprint(+rp.dataset.rep);
      const cn = e.target.closest('[data-can]'); if (cn) return confirmCancel(+cn.dataset.can, load);
    };
  };
  document.getElementById('fApply').onclick = load;
  load();
}

async function renderProductsTab(el) {
  const d = await api('/products');
  CACHE = d;
  el.innerHTML =
    '<div class="filters">' +
    '<input class="inp" id="pSearch" style="flex:1;min-width:180px" placeholder="🔍 Qidirish...">' +
    '<button class="btn ghost" id="btnImport">📥 Excel import</button>' +
    '<button class="btn" id="btnAddProd">＋ Mahsulot</button>' +
    '<button class="btn danger" id="btnDelAll">🗑 Hammasini o\'chirish</button>' +
    '</div><div class="table-wrap"><table class="table">' +
    '<tr><th></th><th>Nomi</th><th>Narxi</th><th>Valyuta</th><th>So\'mda</th><th>Qo\'shgan</th><th></th></tr>' +
    '<tbody id="pBody"></tbody></table></div>';

  const renderRows = () => {
    const f = (document.getElementById('pSearch').value || '').toLowerCase();
    document.getElementById('pBody').innerHTML = d.products.filter(p => !f || p.name.toLowerCase().includes(f)).map(p =>
      '<tr>' +
      '<td>' + (p.has_image
        ? '<img class="thumb-sm" loading="lazy" src="/api/products/' + p.id + '/image" onerror="this.replaceWith(document.createTextNode(\'📦\'))">'
        : '📦') + '</td>' +
      '<td><b>' + esc(p.name) + '</b></td>' +
      '<td>' + (p.currency === 'USD' ? '$' : '') + fmt(p.price) + '</td>' +
      '<td>' + p.currency + '</td>' +
      '<td>' + fmt(p.price_uzs) + '</td>' +
      '<td class="muted">' + esc(p.created_by || 'Admin') + '</td>' +
      '<td><div class="acts">' +
      '<button class="icon-btn" data-edit="' + p.id + '" title="Tahrirlash">✏️</button>' +
      '<button class="icon-btn danger" data-del="' + p.id + '" title="O\'chirish">🗑</button>' +
      '</div></td></tr>'
    ).join('') || '<tr><td colspan="7" class="empty">Mahsulot yo\'q</td></tr>';
  };
  renderRows();
  document.getElementById('pSearch').oninput = renderRows;
  document.getElementById('btnAddProd').onclick = () => openAddProduct(null);
  document.getElementById('btnImport').onclick = () => openImportModal();
  document.getElementById('btnDelAll').onclick = async () => {
    const w = await askModal('⚠️ BARCHA mahsulotlar o\'chiriladi!', {
      input: true, placeholder: 'Tasdiqlash uchun OCHIR deb yozing', okText: 'O\'chirish', danger: true
    });
    if (w === null) return;
    if (w !== 'OCHIR') return toast('Tasdiqlash so\'zi xato — bekor qilindi');
    try {
      const r = await api('/products', { method: 'DELETE' });
      toast(r.deleted + ' ta mahsulot o\'chirildi');
      renderTab('products');
    } catch (e) { toast(e.message); }
  };
  document.getElementById('pBody').onclick = async e => {
    const ed = e.target.closest('[data-edit]');
    if (ed) return openAddProduct(d.products.find(p => p.id === +ed.dataset.edit));
    const dl = e.target.closest('[data-del]');
    if (dl) {
      const p = d.products.find(x => x.id === +dl.dataset.del);
      if (await askModal('"' + (p ? p.name : '') + '" o\'chirilsin mi?')) {
        try {
          await api('/products/' + dl.dataset.del, { method: 'DELETE' });
          toast('O\'chirildi');
          renderTab('products');
        } catch (err) { toast(err.message); }
      }
    }
  };
}

function openPinModal(pin, title) {
  openModal(
    '<h3 style="text-align:center">' + esc(title) + '</h3>' +
    '<div class="pin-big">' + esc(pin) + '</div>' +
    '<div class="muted sm" style="text-align:center">Bu PINni sotuvchiga bering. Keyin ko\'rsatilmaydi — yo\'qotib yuborsangiz "PIN almashtirish"dan foydalaning.</div>' +
    '<div style="height:14px"></div>' +
    '<button class="btn big" id="pinOk">Tushundim</button>'
  );
  document.getElementById('pinOk').onclick = closeModal;
}

async function renderSellersTab(el) {
  const d = await api('/sellers');
  el.innerHTML =
    '<div class="filters"><button class="btn" id="btnAddSeller">＋ Sotuvchi</button></div>' +
    '<div class="table-wrap"><table class="table">' +
    '<tr><th>Ism</th><th>Тел</th><th>Bugun</th><th>Bu oy</th><th>Holat</th><th></th></tr>' +
    d.sellers.map(s =>
      '<tr class="' + (s.is_active ? '' : 'row-off') + '">' +
      '<td><b>' + esc(s.name) + '</b></td>' +
      '<td>' + esc(s.phone || '') + ' <button class="icon-btn" data-ph="' + s.id + '" data-cur="' + esc(s.phone || '') + '" title="Telefonni yozish/o\'zgartirish">✏️</button></td>' +
      '<td>' + s.today_c + ' ta / ' + fmt(s.today_s) + '</td>' +
      '<td>' + s.month_c + ' ta / ' + fmt(s.month_s) + '</td>' +
      '<td>' + (s.is_active ? '<span class="badge b-ok">faol</span>' : '<span class="badge b-no">bloklangan</span>') + '</td>' +
      '<td><div class="acts">' +
      '<button class="icon-btn" data-pin="' + s.id + '" title="PIN almashtirish">🔑</button>' +
      '<button class="icon-btn' + (s.is_active ? ' danger' : '') + '" data-tgl="' + s.id + '" data-on="' + (s.is_active ? '0' : '1') + '" title="' + (s.is_active ? 'Bloklash' : 'Faollashtirish') + '">' + (s.is_active ? '⏸' : '▶️') + '</button>' +
      '</div></td></tr>'
    ).join('') + '</table></div>' +
    (d.sellers.length ? '' : '<div class="empty">Sotuvchi yo\'q — birinchisini qo\'shing</div>');

  document.getElementById('btnAddSeller').onclick = async () => {
    const name = await askModal('Yangi sotuvchi ismi', { input: true, placeholder: 'Masalan: Aziz', okText: 'Keyingi' });
    if (!name) return;
    const phone = await askModal('Sotuvchi telefoni (chekda chiqadi)', { input: true, placeholder: 'Masalan: 901234567', okText: 'Yaratish' });
    try {
      const r = await api('/sellers', { method: 'POST', body: { name, phone: phone || '' } });
      openPinModal(r.pin, name + ' — PIN kodi');
      renderTab('sellers');
    } catch (e) { toast(e.message); }
  };
  el.onclick = async e => {
    const ph = e.target.closest('[data-ph]');
    if (ph) {
      const phone = await askModal('Sotuvchi telefoni (chekda chiqadi)', { input: true, placeholder: ph.dataset.cur || 'Masalan: 901234567', okText: 'Saqlash' });
      if (phone === null) return;
      try {
        await api('/sellers/' + ph.dataset.ph, { method: 'PATCH', body: { phone } });
        toast('Telefon saqlandi');
        renderTab('sellers');
      } catch (err) { toast(err.message); }
      return;
    }
    const pn = e.target.closest('[data-pin]');
    if (pn) {
      if (await askModal('PIN almashtirilsin mi?')) {
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

async function renderCustomersTab(el) {
  const d = await api('/customers');
  const month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  el.innerHTML = d.customers.length
    ? '<div class="table-wrap"><table class="table">' +
      '<tr><th>Nomi</th><th>Telefon</th><th>Qarz (nasiya)</th><th>Birinchi sotuvchi</th><th>Savdolar</th><th>Jami xarid</th><th>Oxirgi savdo</th><th>Holati</th><th></th></tr>' +
      d.customers.map(c =>
        '<tr>' +
        '<td><b>' + esc(c.name) + '</b></td>' +
        '<td>' + esc(c.phone || '—') + '</td>' +
        '<td><b' + (c.debt_uzs > 0 ? ' class="debt-red"' : '') + '>' + fmt(c.debt_uzs) + '</b></td>' +
        '<td>' + esc(c.first_seller || '—') + '</td>' +
        '<td>' + c.visits + ' ta</td>' +
        '<td>' + fmt(c.total_spent) + '</td>' +
        '<td class="muted">' + esc(c.last_visit || '—') + '</td>' +
        '<td>' + (c.first_seen && c.first_seen.slice(0, 7) === month ? '<span class="badge b-ok">yangi</span>' : '<span class="badge b-no" style="background:#e5e7eb;color:#6b7280">eski</span>') + '</td>' +
        '<td><button class="icon-btn" data-hist="' + c.id + '" title="Tarix va qarz">📋</button></td>' +
        '</tr>'
      ).join('') + '</table></div>'
    : '<div class="empty">Xaridorlar yo\'q</div>';
  el.onclick = e => {
    const h = e.target.closest('[data-hist]');
    if (h) openCustomerHistory(+h.dataset.hist, () => renderTab('customers'));
  };
}

/* ===== Xaridor tarixi va qarz boshqaruvi (admin) ===== */
const DEBT_KIND_LABELS = { payment: '✅ Qarz to\'lov', cancel: '⛔ Chek bekor', adjust: '✏️ Tuzatish' };

async function openCustomerHistory(id, onChange) {
  let d;
  try { d = await api('/customers/' + id + '/history'); } catch (e) { return toast(e.message); }
  const c = d.customer;
  openModal(
    '<h3>🛍 ' + esc(c.name) + '</h3>' +
    '<div class="muted sm">' + esc(c.phone || 'telefon yo\'q') +
    (c.first_seller ? ' • birinchi sotuvchi: ' + esc(c.first_seller) : '') +
    (c.first_seen ? ' • ' + c.first_seen : '') + '</div>' +
    '<div class="stat-cards"><div class="scard"><div class="sc-l">Hozirgi qarzi</div>' +
    '<div class="sc-v"' + (c.debt_uzs > 0 ? ' style="color:var(--danger)"' : '') + '>' + money(c.debt_uzs) + '</div></div></div>' +
    '<div class="filters">' +
    '<button class="btn" id="chPay">💰 To\'lov qayd etish</button>' +
    '<button class="btn ghost" id="chFix">✏️ Qarzni tuzatish</button>' +
    '</div>' +
    '<h3 class="sec-t">🧾 Savdo tarixi</h3>' +
    '<div class="panel" style="max-height:230px;overflow-y:auto">' +
    (d.sales.length ? d.sales.map(s =>
      '<div class="li-row' + (s.is_cancelled ? ' row-off' : '') + '"><div><b>' + chekNo(s.id) + '</b> • ' + s.t +
      '<div class="muted sm">' + esc(s.seller_name) + ' • ' + s.items_count + ' ta • ' + (PAY_LABELS[s.payment_method] || PAY_LABELS.naqd).replace(/^\S+\s/, '') +
      (s.payment_method === 'nasiya' && s.old_debt_uzs > 0 ? ' • eski nasiya ' + fmt(s.old_debt_uzs) + ' → umumiy ' + fmt(s.old_debt_uzs + s.total_uzs) : '') +
      (s.is_cancelled ? ' • ⛔ bekor' : '') +
      '</div></div><b>' + money(s.total_uzs) + '</b></div>'
    ).join('') : '<div class="muted">Savdo yo\'q</div>') + '</div>' +
    '<h3 class="sec-t">💰 Qarz harakatlari</h3>' +
    '<div class="panel" style="max-height:230px;overflow-y:auto">' +
    (d.payments.length ? d.payments.map(p =>
      '<div class="li-row"><div><b>' + (DEBT_KIND_LABELS[p.kind] || p.kind) + '</b> • ' + p.t +
      '<div class="muted sm">' + esc(p.by_name) + (p.note ? ' • ' + esc(p.note) : '') + ' • qoldi: ' + fmt(p.debt_after_uzs) + '</div></div>' +
      '<b style="color:' + (p.amount_uzs < 0 ? 'var(--acc-d)' : 'var(--danger)') + '">' + (p.amount_uzs > 0 ? '+' : '') + fmt(p.amount_uzs) + '</b></div>'
    ).join('') : '<div class="muted">Harakat yo\'q</div>') + '</div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn ghost big" id="chClose">Yopish</button>'
  );

  document.getElementById('chClose').onclick = closeModal;
  document.getElementById('chPay').onclick = async () => {
    if (c.debt_uzs <= 0) return toast('Bu xaridorning qarzi yo\'q');
    const amt = await askModal("To'lov summasi (jami qarz: " + fmt(c.debt_uzs) + " so'm)", {
      input: true, placeholder: "Summa (so'm)", okText: 'Qayd etish'
    });
    if (amt === null) return;
    const amount = parseInt(String(amt).replace(/\s+/g, ''), 10);
    if (!(amount > 0)) return toast('Summani kiriting');
    const note = await askModal('Izoh (ixtiyoriy)', { input: true, placeholder: 'Masalan: qisman to\'ladi', okText: 'Saqlash' });
    if (note === null) return;
    try {
      const r = await api('/customers/' + id + '/pay-debt', { method: 'POST', body: { amount, note } });
      toast("To'lov qayd etildi ✅ Qolgan qarz: " + fmt(r.debt_uzs));
      openCustomerHistory(id, onChange);
      if (onChange) onChange();
    } catch (e) { toast(e.message); }
  };
  document.getElementById('chFix').onclick = async () => {
    const v = await askModal("Qarzning yangi qiymati (hozir: " + fmt(c.debt_uzs) + ")", {
      input: true, placeholder: "Yangi qarz (so'm)", okText: 'Davom etish'
    });
    if (v === null) return;
    const nd = parseInt(String(v).replace(/\s+/g, ''), 10);
    if (!isFinite(nd) || nd < 0) return toast('Summa noto\'g\'ri');
    const reason = await askModal('Tuzatish sababi', { input: true, placeholder: 'Masalan: hisobda xatolik', okText: 'Saqlash' });
    if (reason === null) return;
    try {
      await api('/customers/' + id + '/debt', { method: 'PATCH', body: { debt_uzs: nd, reason } });
      toast('Tuzatildi ✅');
      openCustomerHistory(id, onChange);
      if (onChange) onChange();
    } catch (e) { toast(e.message); }
  };
}

async function renderSettingsTab(el) {
  const s = await api('/settings');
  el.innerHTML =
    '<div class="panel"><h3 class="sec-t" style="margin-top:0">Do\'kon sozlamalari</h3>' +
    '<label class="lbl">Chek sarlavhasi (chek yuqorisida katta harflar bilan chiqadi)</label>' +
    '<input class="inp" id="stTitle" value="' + esc(s.receipt_title || 'SAVDO') + '" placeholder="SAVDO">' +
    '<label class="lbl">Do\'kon nomi</label>' +
    '<input class="inp" id="stName" value="' + esc(s.shop_name) + '">' +
    '<label class="lbl">Telefon 1 (chek yuqorisida chiqadi)</label>' +
    '<input class="inp" id="stPhone" value="' + esc(s.shop_phone) + '" placeholder="Masalan: 901234567">' +
    '<label class="lbl">Telefon 2 (chek yuqorisida chiqadi)</label>' +
    '<input class="inp" id="stPhone2" value="' + esc(s.phone_2 || '') + '" placeholder="Masalan: 937654321">' +
    '<div class="hint">Bu ikki raqam mijoz qo\'ng\'iroq qilishi uchun chekka yoziladi. Sotuvchining o\'z raqami Sotuvchilar bo\'limidan yoziladi.</div>' +
    '<label class="lbl">USD kursi (1 dollar = ? so\'m)</label>' +
    '<input class="inp" id="stRate" type="number" min="1" step="0.01" value="' + s.usd_rate + '">' +
    '<div class="hint">Kurs o\'zgarsa, dollarda kiritilgan mahsulotlar narhi shu zahoti yangi kurs bilan hisoblanadi.</div>' +
    '<label class="lbl">Windows printer nomi (USB XPrinter uchun)</label>' +
    '<input class="inp" id="stPName" value="' + esc(s.printer_name || '') + '" placeholder="Masalan: XPrinter_58 yoki POS-80">' +
    '<div class="hint">Do\'kondagi Windows kompyuterda Printers &amp; scanners\'dagi aniq nomi yoziladi. Bo\'sh bo\'lsa agent .env dagi nomni ishlatadi.</div>' +
    '<div style="height:12px"></div>' +
    '<button class="btn ghost" id="btnPT">🖨 Printer test</button>' +
    '<div style="height:4px"></div>' +
    '<button class="btn big" id="stSave">Saqlash</button></div>' +
    '<div class="panel"><h3 class="sec-t" style="margin-top:0">Admin parolini o\'zgartirish</h3>' +
    '<label class="lbl">Eski parol</label><input class="inp" id="pwOld" type="password">' +
    '<label class="lbl">Yangi parol (kamida 6 belgi)</label><input class="inp" id="pwNew" type="password">' +
    '<div style="height:12px"></div>' +
    '<button class="btn big danger" id="pwSave">Parolni o\'zgartirish</button></div>';

  document.getElementById('stSave').onclick = async function () {
    try {
      await api('/settings', {
        method: 'PUT',
        body: {
          receipt_title: document.getElementById('stTitle').value,
          shop_name: document.getElementById('stName').value,
          shop_phone: document.getElementById('stPhone').value,
          phone_2: document.getElementById('stPhone2').value,
          usd_rate: parseFloat(document.getElementById('stRate').value),
          printer_name: document.getElementById('stPName').value
        }
      });
      toast('Saqlandi ✅');
    } catch (e) { toast(e.message); }
  };
  document.getElementById('btnPT').onclick = async function () {
    this.disabled = true;
    try {
      await api('/printer/test', { method: 'POST' });
      toast('Test cheki printerga yuborildi 🖨');
    } catch (e) { toast(e.message); }
    this.disabled = false;
  };
  document.getElementById('pwSave').onclick = async function () {
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: {
          old_password: document.getElementById('pwOld').value,
          new_password: document.getElementById('pwNew').value
        }
      });
      toast('Parol o\'zgartirildi');
      document.getElementById('pwOld').value = '';
      document.getElementById('pwNew').value = '';
    } catch (e) { toast(e.message); }
  };
}

async function downloadXlsx(path, name) {
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
