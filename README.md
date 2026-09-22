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
- **Excel import (faqat admin):** Mahsulotlar bo'limidagi "📥 Excel import" tugmasi — namuna fayl (.xlsx) yuklab olib to'ldiriladi: ustunlar `Nomi | Narxi | Valyuta (UZS/USD)`. Bazada mavjud yoki faylda takrorlangan nomlar o'tkazib yuborilib, yakunda hisobot chiqadi
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

---

## 3a. Windows + XPrinter USB sozlash (print-agent)

### 1) XPrinter drayverini o'rnatish
1. Printerga USB kabelni ulang va quvvatini yoqing
2. Windows uni o'zi topmasa — XPrinter drayverini rasmiy saytdan o'rnating
3. Drayver o'rnatilgach printer Windows'da oddiy printer sifatida paydo bo'ladi

### 2) Printer nomini topish
1. Windows Settings > Bluetooth & devices > Printers & scanners ni oching
2. XPrinter'ni toping va **aniq nomini** nusxalab oling (masalan `XPrinter_58`, `POS-80C` — bo'sh joy yoki maxsus belgilar bo'lsa ham muammo yo'q)

### 3) print-agent sozlash (do'kondagi Windows kompyuterda)
1. Loyiha papkasida `print-agent/.env` fayl yarating (`.env.example` dan nusxa):

```
SERVER_URL=wss://sizning-app.up.railway.app
AGENT_TOKEN=railway-dagi-bilan-bir-xil-token
PRINTER_MODE=windows
PRINTER_NAME=YUQORIDAGI_ANIQ_PRINTER_NOMI
```

2. Terminalni `print-agent` papkasida oching:

```
npm install
node agent.js
```

- `PRINTER_NAME` yozilmasa, agent Windows'dagi printerlarni o'zi ro'yxatlab ko'rsatadi va XPrinter ehtimolini belgilaydi — lekin tasodifiy printerga hech narsa yubormaydi.
- Printer nomini admin paneldan ham berish mumkin: Admin panel > Sozlamalar > "Windows printer nomi" > Saqlash. Server bu nomni agentga `config` xabari bilan yuboradi — agentni qayta ishga tushirish shart emas.

### 4) Test chop etish
- **Paneldan:** Admin panel > Sozlamalar > "🖨 Printer test" tugmasi
- Printerda `PRINTER TEST / XPrinter OK` yozuvli chek chiqib, qog'oz kesilishi kerak

### 5) Real chek
POS'da oddiy savdo qiling — chek avtomatik chiqadi. Agent konsolida
`[PRINT] Print job sent successfully` ko'rinadi. Chiqmasa, konsoldagi
`[PRINT ERROR]` xabarini o'qing (ko'pincha printer nomi noto'g'ri yozilgan bo'ladi).
