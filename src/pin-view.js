// Eski sotuvchilarning PINini tiklash: bcrypt teskari ochilmaydi, lekin PINlar
// doim 4 xonali (1000..9999) — server ishga tushganda bir marta background'da
// topiladi va pin_view ustuniga yoziladi. pin_view to'ldirilgan sotuvchilarga tegmaydi.
const { q } = require('./db');
const { checkPin } = require('./auth');

const CHUNK = 10;      // bir tickda sinanadigan PIN soni
const PAUSE_MS = 50;   // ticklar orasi — event loop bo'g'ilmasin

async function crackOne(pin_hash) {
  for (let base = 1000; base <= 9999; base += CHUNK) {
    const end = Math.min(base + CHUNK, 10000);
    for (let p = base; p < end; p++) {
      if (checkPin(String(p), pin_hash)) return String(p);
    }
    await new Promise(r => setTimeout(r, PAUSE_MS));
  }
  return null;
}

async function startPinRecovery() {
  setImmediate(async () => {
    try {
      const { rows } = await q("SELECT id, name, pin_hash FROM sellers WHERE pin_view = ''");
      if (rows.length) console.log('🔑 PIN tiklash: ' + rows.length + ' ta eski sotuvchi PINi backgroundda tiklanadi...');
      for (const r of rows) {
        const pin = await crackOne(r.pin_hash);
        if (pin) {
          // Shu vaqt ichida PIN almashtirilib bo'lsa — yangi qiymat ustiga yozmaymiz
          await q('UPDATE sellers SET pin_view = $1 WHERE id = $2 AND pin_hash = $3', [pin, r.id, r.pin_hash]);
          console.log('🔑 PIN tiklandi: ' + r.name + ' → ' + pin);
        } else {
          console.log('⚠️ PIN topilmadi (tiklanmadi): ' + r.name + ' — admin "PIN almashtirish"dan foydalanishi kerak');
        }
      }
    } catch (e) {
      console.error('PIN tiklashda xato:', e.message);
    }
  });
}

module.exports = { startPinRecovery };
