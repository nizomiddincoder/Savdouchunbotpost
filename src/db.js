const { Pool } = require('pg');
const crypto = require('crypto');

const local = !process.env.DATABASE_URL || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false }
});

const q = (text, params) => pool.query(text, params);

let dbReady = false;
const isDbReady = () => dbReady;

async function getSettings() {
  const { rows } = await q('SELECT * FROM settings WHERE id = 1');
  return rows[0];
}

async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY,
      shop_name TEXT NOT NULL DEFAULT 'Mening dokoni',
      shop_phone TEXT NOT NULL DEFAULT '',
      usd_rate NUMERIC(12,2) NOT NULL DEFAULT 12650,
      jwt_secret TEXT,
      admin_password_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS sellers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC(14,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'UZS',
      image BYTEA,
      image_mime TEXT,
      created_by INT REFERENCES sellers(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_deleted BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      first_seller_id INT REFERENCES sellers(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      seller_id INT NOT NULL REFERENCES sellers(id),
      customer_id INT REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      total_uzs BIGINT NOT NULL,
      usd_rate NUMERIC(12,2) NOT NULL,
      is_cancelled BOOLEAN NOT NULL DEFAULT false,
      cancelled_by TEXT,
      cancelled_at TIMESTAMPTZ,
      cancel_reason TEXT,
      reprint_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INT REFERENCES products(id),
      product_name TEXT NOT NULL,
      qty INT NOT NULL,
      price_orig NUMERIC(14,2) NOT NULL,
      currency TEXT NOT NULL,
      price_uzs BIGINT NOT NULL,
      line_total_uzs BIGINT NOT NULL
    );
  `);
  // Qarz (nasiya) hisobi uchun jadval — to'lovlar, tuzatishlar va bekor qilingan cheklar tarixi
  await q(`
    CREATE TABLE IF NOT EXISTS customer_payments (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      amount_uzs BIGINT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'payment',
      note TEXT,
      by_name TEXT NOT NULL,
      debt_after_uzs BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await q(`CREATE INDEX IF NOT EXISTS customer_payments_cust_idx ON customer_payments (customer_id, id)`);
  // Migratsiyalar (eski bazalar uchun ham ishlaydi)
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS debt_uzs BIGINT NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'naqd'`);
  await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS old_debt_uzs BIGINT NOT NULL DEFAULT 0`);
  // Chek qaysi yozuvda (lotin/kirill) chiqishi
  await q(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS receipt_script TEXT NOT NULL DEFAULT 'latin'`);
  await q(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS base_price_uzs BIGINT`);
  // Chekdagi telefon raqamlari: sotuvchi telefoni + 2 ta qo'shimcha raqam
  await q(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`);
  // Sotuvchi PINi admin panelda ko'rinsin — yangi PINlar oddiy holatda ham saqlanadi
  await q(`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pin_view TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS phone_1 TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS phone_2 TEXT NOT NULL DEFAULT ''`);
  // Chek yuqorisida chiqadigan sarlavha (dastur nomi)
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS receipt_title TEXT NOT NULL DEFAULT 'SAVDO'`);
  // Eski yozuvlarda asosiy narx bo'sh qolmasin
  await q(`UPDATE sale_items SET base_price_uzs = price_uzs WHERE base_price_uzs IS NULL`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_mode TEXT NOT NULL DEFAULT 'network'`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_host TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_port INT NOT NULL DEFAULT 9100`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_share TEXT NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS printer_name TEXT NOT NULL DEFAULT ''`);
  // Bir xil nomli mahsulot/xaridor takrorlanmasligi uchun
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS products_norm_uniq
    ON products (lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))) WHERE is_deleted = false`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS customers_norm_uniq
    ON customers (lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))))`);
  await q('INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
  const st = await getSettings();
  if (!st.jwt_secret && !process.env.JWT_SECRET) {
    await q('UPDATE settings SET jwt_secret = $1 WHERE id = 1', [crypto.randomBytes(32).toString('hex')]);
  }
  dbReady = true;
}

module.exports = { pool, q, getSettings, initDb, isDbReady };
