const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getSettings } = require('./db');

async function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const s = await getSettings();
  return s.jwt_secret;
}

async function sign(payload) {
  return jwt.sign(payload, await secret(), { expiresIn: '30d' });
}

function middleware(role) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: 'Kirilmagan' });
      const d = await jwt.verify(token, await secret());
      if (role && d.role !== role) return res.status(403).json({ error: 'Ruxsat yo\'q' });
      req.user = d;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Sessiya tugagan, qaytadan kiring' });
    }
  };
}

const hashPin = p => bcrypt.hashSync(String(p), 8);
const checkPin = (p, h) => h ? bcrypt.compareSync(String(p), h) : false;

module.exports = { sign, middleware, hashPin, checkPin };
