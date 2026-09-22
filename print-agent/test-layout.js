// Vaqtinchalik tekshiruv: chek bufferini CP866 matnga dekodlab, qator uzunliklarini ko'rsatadi
const { buildEscpos } = require('./agent.js');

function decodeCp866(buf) {
  const rows = [];
  let cur = '';
  let note = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0x0a) { rows.push({ t: cur, note }); cur = ''; note = ''; continue; }
    if (b === 0x1b || b === 0x1d) { // ESC / GS komandalari
      const cmd = buf[i + 1];
      if (cmd === 0x21) { note += (buf[i + 2] ? '[KATTA]' : '[oddiy]'); i += 2; continue; }
      if (cmd === 0x45) { note += (buf[i + 2] ? '[BOLD]' : '[/bold]'); i += 2; continue; }
      if (cmd === 0x61) { note += (buf[i + 2] === 1 ? '[markaz]' : '[chap]'); i += 2; continue; }
      if (cmd === 0x74) { i += 2; continue; }
      if (cmd === 0x40 || cmd === 0x32) { i += 1; continue; }
      if (cmd === 0x56) { rows.push({ t: cur, note: '[KESISH]' }); cur = ''; note = ''; i += 3; continue; }
      i += 1; continue;
    }
    let ch;
    if (b >= 0x80 && b <= 0xAF) ch = String.fromCharCode(0x0410 + (b - 0x80));
    else if (b >= 0xE0 && b <= 0xEF) ch = String.fromCharCode(0x0440 + (b - 0xE0));
    else if (b === 0xF0) ch = 'Ё';
    else if (b === 0xF1) ch = 'ё';
    else ch = String.fromCharCode(b);
    cur += ch;
  }
  if (cur) rows.push({ t: cur, note });
  return rows;
}

const receipt = {
  receipt_no: 46796,
  receipt_title: 'SAVDO',
  shop_phone: '901234567',
  phone_2: '937654321',
  datetime_local: '2026-09-16 12:23',
  seller_name: 'Бозор3',
  seller_phone: '998912041009',
  customer_name: 'АДХАМ АКА ПАДВАЛ',
  customer_phone: '+998932001223',
  payment_method: 'nasiya',
  usd_rate: 11800,
  old_debt_uzs: 0,
  items: [
    { name: 'ИЗОЛЕНТА ЖЕМ КАТТА', qty: 30, price_uzs: 2596, line_total_uzs: 77880 },
    { name: 'ИЗОЛЕНТА ГУЛЛИК КАТТА', qty: 160, price_uzs: 2242, line_total_uzs: 358720 },
    { name: 'ИЗОЛЕНТА ШЕР КОРА (10дона)', qty: 200, price_uzs: 1416, line_total_uzs: 283200 },
    { name: 'ИНДИКАТОР ОРГИНАЛ БАТАРЕКА', qty: 20, price_uzs: 10620, line_total_uzs: 212400 }
  ],
  total_uzs: 1541080
};

const buf = buildEscpos(receipt, false);
const rows = decodeCp866(buf);
let bad = 0;
rows.forEach((r, i) => {
  const len = r.t.length;
  if (len > 48) bad++;
  console.log(String(i + 1).padStart(2) + ' [' + String(len).padStart(2) + ']' + (r.note || '').padEnd(18) + '|' + r.t + '|');
});
console.log(bad === 0 ? '\nOK: barcha qatorlar 48 belgidan oshmaydi' : '\nXATO: ' + bad + ' ta qator 48 dan oshgan!');
