const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

// Oddiy .env yuklovchi (dotenv o'rniga)
(function loadEnv() {
  try {
    const f = path.join(__dirname, '.env');
    if (fs.existsSync(f)) {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    }
  } catch (e) { /* ignore */ }
})();

const { initDb, isDbReady } = require('./src/db');
const authRoutes = require('./src/routes/auth');
const productRoutes = require('./src/routes/products');
const saleRoutes = require('./src/routes/sales');
const adminRoutes = require('./src/routes/admin');
const { initBot } = require('./src/bot');
const { initWs } = require('./src/ws');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Healthcheck — baza holatisiz ham javob beradi (Railway servisni tirik deb ko'radi)
app.get('/api/health', (req, res) => res.json({ ok: true, db_ready: isDbReady(), time: new Date().toISOString() }));

// Baza hali ulanmaganda aniq xato qaytaramiz — process qotib qolmaydi
app.use('/api', (req, res, next) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Baza hali ulanmadi. Railway Logs qismiga qarang — DATABASE_URL to\'g\'rilgach 5 soniyada o\'zi ulanadi.' });
  }
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api', adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 400).json({ error: err.message || 'Server xatosi' });
});

// Hech qanday kutilmagan xato processni o'ldirmasin (Railway "crashed" bo'lmasin)
process.on('uncaughtException', e => console.error('UNCAUGHT:', (e && (e.stack || e.message)) || e));
process.on('unhandledRejection', e => console.error('UNHANDLED:', (e && (e.stack || e.message)) || e));

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

(async () => {
  // 1) Avval HTTP ni ishga tushiramiz — servis doim "running" bo'ladi
  server.listen(PORT, () => console.log('HTTP server ishlayapti, port:', PORT));

  // 2) Bazaga ulanish — muvaffaqiyatli bo'lguncha har 5 soniyada qayta urinamiz
  while (true) {
    try {
      await initDb();
      console.log('✅ Baza ulandi, jadvallar tayyor');
      break;
    } catch (e) {
      console.error('❌ Baza ulanmadi [' + (e.code || 'xato') + '] ' + (e.message || e));
      const msg = String(e.message || '');
      if (!process.env.DATABASE_URL) {
        console.error("   ➜ DATABASE_URL o'rnatilmagan! Railway > servis > Variables > 'Add Variable' > Postgres'ning 'Database URL' qiymatini qo'shing.");
      } else if (e.code === 'ENOTFOUND' || /ENOTFOUND/.test(msg)) {
        console.error("   ➜ Host topilmadi. Railway Postgres'ning 'Connect' bo'limidan URL ni qayta nusxalab, o'zgarmas (raw) qiymat sifatida qo'ying.");
      } else if (e.code === 'ECONNREFUSED' || /ECONNREFUSED/.test(msg)) {
        console.error('   ➜ Ulanish rad etildi. Port va hostni tekshiring.');
      } else if (e.code === '28P01' || /password authentication/.test(msg)) {
        console.error('   ➜ Parol xato. DATABASE_URL ni to\'liq qayta nusxalang.');
      } else if (e.code === '3D000' || /database .* does not exist/.test(msg)) {
        console.error('   ➜ Baza nomi topilmadi. URL oxiridagi baza nomini tekshiring.');
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // 3) Qolgan tizimlar
  initWs(server);
  initBot();
})();
