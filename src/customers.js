/* Xaridorlar bilan ishlash: ism/telefon tozalash, dublikatni tekshirish.
   Savdo (sales.js) ham, qo'lda yaratish (admin.js) ham shu qoidalardan foydalanadi —
   shunda bitta xaridor ikki marta (ismi yoki telefoni bilan) yaratilmaydi. */

// Bazadagi normalizatsiya bilan bir xil qoida
const NORM_NAME = `lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))`;

function cleanName(v) {
  return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

// 901234567, 998901234567, +998 90 123 45 67 — bitta raqam deb hisoblanadi
function phoneKey(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(-9);
  return d;
}

function cleanPhone(v, required) {
  const ph = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (!ph) {
    if (required) throw new Error('Telefon raqamini kiriting (masalan: 901234567)');
    return null;
  }
  if (!/^\+?\d{7,15}$/.test(ph)) {
    throw new Error("Telefon raqam noto'g'ri (masalan: 901234567 yoki +998901234567)");
  }
  return ph;
}

async function findByName(client, name, excludeId) {
  const { rows } = await client.query(
    `SELECT id, name, phone, debt_uzs FROM customers
      WHERE ${NORM_NAME} = lower($1) AND ($2 = 0 OR id <> $2)
      LIMIT 1`,
    [cleanName(name), excludeId || 0]);
  return rows[0] || null;
}

async function findByPhone(client, phone, excludeId) {
  const key = phoneKey(phone);
  if (!key) return null;
  const { rows } = await client.query(
    `SELECT id, name, phone FROM customers
      WHERE ($2 = 0 OR id <> $2)
        AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), length($1)) = $1
      LIMIT 1`,
    [key, excludeId || 0]);
  return rows[0] || null;
}

/* Yangi xaridor yaratish — ism VA telefon shart, ikkisi bo'yicha ham dublikat bo'lmaydi */
async function createCustomer(client, { name, phone, sellerId }) {
  const nm = cleanName(name);
  if (nm.length < 2) throw new Error('Xaridor ismini kiriting (kamida 2 harf)');
  const ph = cleanPhone(phone, true);

  const dupName = await findByName(client, nm);
  if (dupName) {
    throw new Error('«' + dupName.name + '» ismli xaridor allaqachon ro\'yxatda bor — "Eski mijoz" tugmasidan tanlang');
  }
  const dupPhone = await findByPhone(client, ph);
  if (dupPhone) {
    throw new Error('Bu telefon raqam allaqachon «' + dupPhone.name + '» xaridoriga yozilgan — "Eski mijoz" tugmasidan tanlang');
  }

  try {
    const { rows } = await client.query(
      'INSERT INTO customers (name, phone, first_seller_id) VALUES ($1, $2, $3) RETURNING id, name, phone, debt_uzs',
      [nm, ph, sellerId || null]);
    return rows[0];
  } catch (e) {
    // Ikki sotuvchi bir vaqtda bir xil ism kiritganda (unique index)
    if (e.code === '23505') {
      throw new Error('«' + nm + '» ismli xaridor allaqachon ro\'yxatda bor — "Eski mijoz" tugmasidan tanlang');
    }
    throw e;
  }
}

/* Savdoda: ism bo'yicha mavjudini topadi, bo'lmasa yaratadi (telefon dublikati tekshiriladi) */
async function getOrCreateForSale(client, { name, phone, sellerId }) {
  const nm = cleanName(name);
  if (!nm) throw new Error('Xaridor ismini kiriting');
  const ph = cleanPhone(phone, false);

  const existing = await findByName(client, nm);
  if (existing) {
    if (ph) {
      const other = await findByPhone(client, ph, existing.id);
      if (other) throw new Error('Bu telefon raqam «' + other.name + '» xaridoriga yozilgan');
      if (phoneKey(existing.phone) !== phoneKey(ph)) {
        await client.query('UPDATE customers SET phone = $1 WHERE id = $2', [ph, existing.id]);
        existing.phone = ph;
      }
    }
    return existing;
  }

  const other = ph ? await findByPhone(client, ph) : null;
  if (other) {
    throw new Error('Bu telefon raqam allaqachon «' + other.name + '» xaridoriga yozilgan. "Eski mijoz" tugmasidan tanlang.');
  }

  const { rows } = await client.query(
    'INSERT INTO customers (name, phone, first_seller_id) VALUES ($1, $2, $3) RETURNING id, name, phone, debt_uzs',
    [nm, ph, sellerId || null]);
  return rows[0];
}

/* Tezkor qidiruv sharti: har bir so'z ismda bo'lishi kerak (lotin/kirill variantlari bilan),
   yoki raqamlar telefonda. Qaytaradi: { where, rank } — params massiviga qiymatlar qo'shiladi.
   rank: ism so'rov bilan boshlansa 0 (yuqorida), aks holda 1. */
const { variants } = require('./translit');
// lower() kirill harflarni faqat baza locale'i UTF-8 bo'lsa kichraytiradi — translate() har qanday locale'da ishlaydi
const CYR_UP = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЎҚҒҲ';
const CYR_LO = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ';
function searchSql(raw, params, alias) {
  const a = alias || 'c';
  const LN = `lower(translate(${a}.name, '${CYR_UP}', '${CYR_LO}'))`;
  const text = String(raw || '').trim().slice(0, 60);
  // rank — qidiruvda mos kelganlarni tepaga chiqarish uchun. Qidiruvsiz holatда bo'sh
  // ('' ) qaytaramiz va chaqiruvchi uni ORDER BY'ga umuman qo'shmaydi (aks holda
  // '1' ustun raqamiga, 'NULL'/'true' esa "non-integer constant" xatosiga aylanadi).
  if (!text) return { where: 'TRUE', rank: '' };
  const digits = text.replace(/\D/g, '');
  const words = text.replace(/[+\d()-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5);
  const ors = [];
  if (words.length) {
    const ands = words.map(w => {
      const vs = variants(w).map(v => { params.push('%' + v + '%'); return `${LN} LIKE $${params.length}`; });
      return '(' + vs.join(' OR ') + ')';
    });
    ors.push('(' + ands.join(' AND ') + ')');
  }
  if (digits.length >= 2) {
    params.push('%' + digits + '%');
    ors.push(`regexp_replace(coalesce(${a}.phone, ''), '\\D', '', 'g') LIKE $${params.length}`);
  }
  if (!ors.length) return { where: 'TRUE', rank: '' };
  let rank = '';
  if (words.length) {
    const pre = variants(words[0]).map(v => { params.push(v + '%'); return `${LN} LIKE $${params.length}`; });
    rank = `CASE WHEN ${pre.join(' OR ')} THEN 0 ELSE 1 END`;
  }
  return { where: '(' + ors.join(' OR ') + ')', rank };
}

module.exports = { cleanName, cleanPhone, phoneKey, findByName, findByPhone, createCustomer, getOrCreateForSale, searchSql };
