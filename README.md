# 🛒 Savdo — Telegram Mini App + Admin panel + Chek printer

Do'kon savdosi uchun dastur: sotuvchilar Telegram mini app orqali sotadi, har savdo
do'kondagi kompyuterga ulangan chek printerda avtomatik chop etiladi, admin esa
Chrome orqali boshqaradi va hisobotlarni Excel'da yuklab oladi.

## Tuzilishi

| Papka | Nima |
|---|---|
| `server.js` + `src/` | Asosiy server (Railway'da turadi) |
| `public/` | Mini app + admin panel (bir xil veb-ilova) |
| `print-agent/` | Do'kondagi kompyuterga o'rnatiladigan kichik dastur (chek chop etadi) |

Baza: **Railway PostgreSQL**. Rasmlar ham bazada saqlanadi.

---

## 1. Railway'da ishga tushirish

1. Bu papkani GitHub'ga yuklang va Railway'ga ulang (New Project → Deploy from repo)
2. Loyiha ichida **+ New → Database → PostgreSQL** qo'shing
3. Servisning **Variables** bo'limiga quyidagilarni yozing:

| O'zgaruvchi | Qiymati |
|---|---|
| `DATABASE_URL` | PostgreSQL → Connect → **Database URL** |
| `APP_URL` | `https://sizning-app.up.railway.app` |
| `AGENT_TOKEN` | O'zingiz tasodifiy so'z: `menim-maxfiy-token-8721` |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | boshlang'ich parol (keyin panelda o'zgartirasiz) |
| `BOT_TOKEN` | @BotFather bergan token |
| `GROUP_CHAT_ID` | guruh ID (pastda qanday olish tushuntirilgan) |

4. Deploy tugagach Logs'da `Savdo serveri ishleyapti` yozuvini ko'rasiz.

## 2. Telegram bot

1. @BotFather → `/newbot` → olingan tokenni `BOT_TOKEN` ga yozing
2. Yangi guruh yarating, botni qo'shib uni **ADMIN** qiling
3. Guruh ichida `/id` yozing — bot chat ID javob beradi → `GROUP_CHAT_ID` ga yozing va servisni restart qiling
4. Endi har bir savdo/bekor qilish shu guruhga avtomatik tushadi
5. Sotuvchilar botga `/start` yozib yoki pastki **🛒 Savdo** menyu tugmasi orqali mini app'ni ochadi

## 3. Chek printer agenti (do'kondagi kompyuter)

1. Kompyuterga Node.js o'rnating (nodejs.org, LTS versiya)
2. `print-agent` papkasida: `npm install`
3. `.env` fayl yarating (namuna: `.env.example`) va to'ldiring:
   - `SERVER_URL` = `wss://sizning-app.up.railway.app` (**wss**, https emas!)
   - `AGENT_TOKEN` = Railway'dagi bilan **bir xil**
   - `PRINTER_MODE`:
     - `network` — printer tarmoqda/IP orqali (eng ishonchli; ko'p termal printerlar 9100-portda)
     - `windows` — printer Windows'da "Share" qilingan bo'lsa: `PRINTER_SHARE=\\KOMPYUTER\PRINTER`
     - `console` — sinov uchun (chek konsolga chiqadi)
4. `node agent.js` → `✅ Serverga ulandi` chiqishi kerak
5. Kompyuter qayta yonib o'chirilmasligi uchun (avtomatik ishga tushirish):
   ```
   npm i -g pm2
   pm2 start agent.js --name chek
   pm2 save
   pm2 startup
   ```

**Sinov:** mini app'dan savdo qiling — chek chiqishi kerak.

## 4. Kirish

- **Admin:** saytni Chrome'da oching → "Admin kirish" (login/parol: env'dagilar; Sozlamalar bo'limida parolni albatta o'zgartiring!)
- **Sotuvchi:** 4 xonali PIN (Admin → Sotuvchilar → yaratish — PIN bir marta ko'rsatiladi)

## Imkoniyatlar

- Mahsulot: rasm + narx (UZS/USD). Sotuvchi ham yangi qo'shadi; **tahrirlash/o'chirish faqat admin**
- Bir xil nomli (dubl) mahsulot qo'shib bo'lmaydi
- USD kursini admin kiritadi — dollardagi mahsulotlar narhi shu zahoti yangi kurs bilan hisoblanadi
- Chek: do'kon nomi, telefon, ketma-ket raqam, sana/vaqt, sotuvchi, xaridor + **qayta chop etish** tugmasi
- Savdoni bekor qilish: sotuvchi o'ziniki, admin xohlaganini — kim, qachon, nima sababdan saqlanadi
- Sotuvchi kabineti (KPI): bugun/oy savdolari, top mahsulotlar, oxirgi savdolar
- Dashboard: kunlik/oylik summa, sotuvchi reytingi, top mahsulotlar, yangi/qaytgan xaridorlar
- Excel hisobot (kunlik/oylik), 4 varaq: Savdolar, Mahsulotlar, Sotuvchilar, Xaridorlar
- Har savdo haqida Telegram guruhiga bildirishnoma

## Muhim eslatmalar

- Chek **fiskal emas** — ichki nazorat uchun (rasmiy OFD hisoblanmaydi)
- Internet uzilsa savdo vaqtincha to'xtaydi
- Chek matni ASCII (o'zbek lotin) — printer kodirovkasida muammo bo'lmaydi

## Agar "Baza ulanmadi" yozuvi chiqsa ( troubleshooting )

Server bazasiz ham ishlaydi va har 5 soniyada qayta urinadi — Logs'dagi xabarga qarab davolang:

| Logdagi yozuv | Sababi va yechimi |
|---|---|
| `DATABASE_URL o'rnatilmagan` | Railway > servicingiz > **Variables** > Postgres bazangiz > **Connect** > **Database URL** ni nusxalab, `DATABASE_URL` nomi bilan qo'shing. Keyin servicingizni **Redeploy** qiling |
| `ENOTFOUND` (host topilmadi) | URL noto'g'ri nusxalangan. To'liq (`postgresql://...`) ekanini tekshirib qayta qo'ying |
| `28P01` / parol xato | URL ni qaytadan to'liq nusxalang (parolda maxsus belgilar buzilgan bo'lishi mumkin) |
| `3D000` | URL oxiridagi baza nomi (odatda `railway`) yo'q |

To'g'ri sozlanganini tekshirish: brauzerda `https://sizning-app.up.railway.app/api/health` oching — `"db_ready": true` bo'lishi kerak.
