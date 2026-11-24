/* Lotin <-> Kirill (o'zbek) — qidiruvda "Ali" yozilsa "Али" ham topilishi uchun */
const CYR_D = { 'sh': 'ш', 'ch': 'ч', 'yo': 'ё', 'yu': 'ю', 'ya': 'я', 'ye': 'е', "o'": 'ў', 'o`': 'ў', "g'": 'ғ', 'g`': 'ғ', 'ng': 'нг' };
const CYR_L = { a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з' };
const LAT_M = { 'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': "g'", 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'қ': 'q', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ў': "o'", 'ф': 'f', 'х': 'x', 'ҳ': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ь': '', 'ы': 'i', 'э': 'e', 'ю': 'yu', 'я': 'ya' };

function latinToCyr(s) {
  s = String(s || '').toLowerCase();
  let out = '', i = 0;
  while (i < s.length) {
    const d = CYR_D[s.slice(i, i + 2)];
    if (d) { out += d; i += 2; continue; }
    if (s[i] === 'y' && s[i + 1] === 'i') { out += 'й'; i++; continue; }
    out += CYR_L[s[i]] !== undefined ? CYR_L[s[i]] : s[i];
    i++;
  }
  return out;
}

function cyrToLat(s) {
  let out = '';
  for (const c of String(s || '').toLowerCase()) out += LAT_M[c] !== undefined ? LAT_M[c] : c;
  return out;
}

/* Qidiruv so'zining barcha yozuvdagi variantlari (takrorsiz) */
function variants(word) {
  const w = String(word || '').toLowerCase().replace(/[`ʻʼ‘’]/g, "'");
  return [...new Set([w, latinToCyr(w), cyrToLat(w)].filter(Boolean))];
}

module.exports = { latinToCyr, cyrToLat, variants };
