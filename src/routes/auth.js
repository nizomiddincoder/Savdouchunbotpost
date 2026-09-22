const router = require('express').Router();
const { q, getSettings } = require('../db');
const { sign, checkPin, hashPin, middleware } = require('../auth');

const anyAuth = middleware();
const adminOnly = middleware('admin');

// Oddiy PIN himoyasi: 10 daqiqada 8 marta xato urilgan IP bloklanadi
const fails = new Map();
function tooMany(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() > f.until) { fails.delete(ip); return false; }
  return f.n >= 8;
}
function recordFail(ip) {
  const f = fails.get(ip) || { n: 0, until: Date.now() + 10 * 60 * 1000 };
  f.n++;
  fails.set(ip, f);
}

router.post('/login-pin', async (req, res, next) => {
  try {
    if (tooMany(req.ip)) throw new Error('Juda ko\'p xato urinish. 10 daqiqadan keyin qayta urining');
    const pin = String(req.body.pin || '');
    if (!/^\d{4}$/.test(pin)) throw new Error('PIN 4 xonali raqam bo\'lishi kerak');
    const { rows } = await q('SELECT * FROM sellers WHERE is_active = true');
    const s = rows.find(x => checkPin(pin, x.pin_hash));
    if (!s) { recordFail(req.ip); throw new Error('PIN xato yoki sotuvchi bloklangan'); }
    fails.delete(req.ip);
    res.json({ token: await sign({ role: 'seller', id: s.id, name: s.name }), me: { role: 'seller', id: s.id, name: s.name } });
  } catch (e) { next(e); }
});

router.post('/login-admin', async (req, res, next) => {
  try {
    const st = await getSettings();
    if (!st.admin_password_hash) {
      const h = hashPin(process.env.ADMIN_PASSWORD || 'admin123');
      await q('UPDATE settings SET admin_password_hash = $1 WHERE id = 1', [h]);
      st.admin_password_hash = h;
    }
    const user = process.env.ADMIN_USER || 'admin';
    if (String(req.body.username || '') !== user || !checkPin(String(req.body.password || ''), st.admin_password_hash)) {
      throw new Error('Login yoki parol xato');
    }
    res.json({ token: await sign({ role: 'admin', id: 0, name: user }), me: { role: 'admin', name: user } });
  } catch (e) { next(e); }
});

router.post('/change-password', adminOnly, async (req, res, next) => {
  try {
    const st = await getSettings();
    if (!st.admin_password_hash) {
      const h = hashPin(process.env.ADMIN_PASSWORD || 'admin123');
      await q('UPDATE settings SET admin_password_hash = $1 WHERE id = 1', [h]);
      st.admin_password_hash = h;
    }
    if (!checkPin(String(req.body.old_password || ''), st.admin_password_hash)) throw new Error('Eski parol xato');
    const np = String(req.body.new_password || '');
    if (np.length < 6) throw new Error('Yangi parol kamida 6 belgidan iborat bo\'lsin');
    await q('UPDATE settings SET admin_password_hash = $1 WHERE id = 1', [hashPin(np)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', anyAuth, (req, res) => res.json({ me: req.user }));

module.exports = router;
