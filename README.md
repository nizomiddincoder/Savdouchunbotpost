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
- **Xaridor kiritish (savatda):** ikkita tugma — **👤 Eski mijoz** (barcha mijozlar ro'yxati, ism/telefon bo'yicha qidiruv, eski nasiya ko'rinadi) va **➕ Yangi mijoz** (ism + telefon). Bir xil ismli yoki bir xil telefonli mijozni ikkinchi marta yaratib bo'lmaydi — dastur "Eski mijoz"ni tanlashni taklif qiladi
- **Backup (Sozlamalar bo'limi):** ⬇️ butun bazani (mahsulot rasmlari bilan) bitta `.json` faylga yuklab olish va ⬆️ shu fayldan tiklash — bazani boshqa kompyuterga/localga ko'chirish uchun
- Sotuvchi kabineti (KPI): bugun/oy savdolari, top mahsulotlar, oxirgi savdolar
- Dashboard: kunlik/oylik summa, sotuvchi reytingi, top mahsulotlar, yangi/qaytgan xaridorlar
- Excel hisobot (kunlik/oylik), 4 varaq: Savdolar, Mahsulotlar, Sotuvchilar, Xaridorlar
- Har savdo haqida Telegram guruhiga bildirishnoma

## Backup va ko'chirish (import / export)

Admin panel → **Sozlamalar** → **💾 Backup** bo'limi:

1. **⬇️ Backup yuklab olish** — `savdo-backup-YYYY-MM-DD-HH-MM.json` fayli yuklab olinadi. Ichida: sotuvchilar, mahsulotlar (rasmlar base64), xaridorlar, savdolar, savdo qatorlari, qarz harakatlari va sozlamalar.
2. **⬆️ Backup faylni tanlash** — fayl tekshiriladi va sanasi/hajmi ko'rsatiladi.
3. **⚠️ Tiklash** — tasdiqlash uchun `TIKLA` deb yoziladi. Hozirgi ma'lumotlar to'liq almashtiriladi (tranzaksiya ichida: xato bo'lsa hech narsa o'zgarmaydi), ID'lar ketma-ketligi ham tiklanadi.

Import qilingandan keyin sozlamalar va admin paroli backupdagidek bo'ladi (joriy kirish sessiyasi uzilmaydi).

⚠️ Backup faylida admin parolining hash'i va baza kaliti bor — shuning uchun faylni begona odamga bermang va ochiq joyda saqlamang. Backup/import faqat admin uchun.

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
POS'da oddiy savdo qiling — chek avtomatik chiqadi. Agent konsolida va
`print-agent/agent.log` da `[PRINT] Chek chop etildi: <№>` ko'rinadi.

### 6) Chek chiqmay qolsa (2-3 chekdan keyin jim bo'lib qolsa)

Sabablari odatda uchtasi: Windows print spooler'da tiqilib qolgan ish, internet
uzilgandan keyin "osilib" qolgan WebSocket, yoki printerning o'zi (qog'oz, qopqoq,
USB). Agent endi bularni o'zi tuzatadi:

- Har chek **navbatga** turadi va ketma-ket yuboriladi — bir vaqtda bir nechta
  PowerShell ishga tushib spooler'ni tiqib qo'ymaydi.
- Yuborishdan oldin spooler'dagi eski/tiqilgan `POS Chek` ishlari tozalanadi.
- Chek navbatdan chiqqani (printer haqiqatan olgani) tekshiriladi; chiqmasa ish
  o'chiriladi va **qayta uriniladi** (1,5s, 6s, 13s ... jami ~2 daqiqa).
- Internet uzilib TCP "osilib" qolsa, agent 90 soniyada sezadi va qayta ulanadi.
- Shunda ham chiqmasa chek `print-agent/queue/` papkasida saqlanadi va agent qayta
  ishga tushganda yuboriladi — chek yo'qolmaydi.
- Har bir qadam `print-agent/agent.log` fayliga yoziladi (2 MB dan oshsa
  `agent.log.1`). Muammo bo'lsa shu faylni yuboring.

Admin panel > Sozlamalar'da **"🖨 Print-agent: ulangan / ulanmagan"** ko'rsatkichi bor.
"Ulanmagan" bo'lsa do'kondagi kompyuterda `PRINTERNI ISHGA TUSHIRISH.bat` ishlamayapti.

Printerning o'zini ham tekshiring: qog'oz tugamaganmi, qopqoq yopiqmi, USB kabel
mahkammi, printer o'chib yonmaganmi. XPrinter ba'zan qog'oz tugagach javob bermay
qoladi — qog'ozni qo'yib, printerni o'chirib-yoqish kerak bo'ladi.

### 7) Windows'da do'kondagi kompyuterni sozlash (doimiy ishlashi uchun)
1. **Uyqu rejimini o'chiring:** Settings > System > Power > Screen and sleep —
   "Sleep" ni **Never** qiling. Kompyuter uyquga ketsa agent ham, printer ham ishlamaydi.
2. **USB quvvat tejashni o'chiring:** Device Manager > Universal Serial Bus controllers >
   har bir "USB Root Hub" > Properties > Power Management >
   "Allow the computer to turn off this device to save power" belgisini olib tashlang.
   Aks holda Windows bir necha daqiqadan keyin printerning USB portini "uxlatadi".
3. **Windows Update'dan keyin qayta ishga tushishni boshqaring:** Settings > Windows Update >
   Advanced options > Active hours — do'kon ish vaqtini belgilang.
4. `PRINTERNI ISHGA TUSHIRISH.bat` ni **Startup** papkasiga qo'ying (Win+R → `shell:startup`),
   shunda kompyuter yonishi bilan agent o'zi ishga tushadi.
