let started = false;
let groupChatId = process.env.GROUP_CHAT_ID ? String(process.env.GROUP_CHAT_ID) : null;

const API = m => `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`;

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function tg(method, body) {
  try {
    const r = await fetch(API(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000)
    });
    return await r.json();
  } catch (e) { console.error('tg:', e.message); }
}

function fmtUz(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function initBot() {
  if (started) return;
  started = true;
  if (!process.env.BOT_TOKEN) { console.log('BOT_TOKEN yo\'q — bot ishlamaydi'); return; }
  if (process.env.APP_URL) {
    tg('setChatMenuButton', {
      menu_button: { type: 'web_app', text: '🛒 Savdo', web_app: { url: process.env.APP_URL } }
    });
  }
  let offset = 0;
  (async function loop() {
    while (true) {
      try {
        const r = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
        if (!r || !r.ok) { await sleep(5000); continue; }
        for (const u of r.result || []) {
          offset = u.update_id + 1;
          const m = u.message;
          if (!m || !m.text) continue;
          if (m.text.startsWith('/id')) {
            tg('sendMessage', { chat_id: m.chat.id, text: 'Chat ID: ' + m.chat.id });
          } else if (m.text.startsWith('/start')) {
            const url = process.env.APP_URL;
            tg('sendMessage', {
              chat_id: m.chat.id,
              text: 'Assalomu alaykum! Savdoni boshlash uchun tugmani bosing 👇',
              reply_markup: {
                inline_keyboard: [[
                  url ? { text: '🛒 Savdoni boshlash', web_app: { url } }
                      : { text: 'Dastur hali sozlanmagan (APP_URL yo\'q)', url: 'https://example.com' }
                ]]
              }
            });
          }
        }
      } catch (e) {
        console.error('bot loop:', e.message);
        await sleep(3000);
      }
    }
  })();
  console.log('Telegram bot ishlayapti. Guruh:', groupChatId || 'belgilanmagan');
}

async function notifySale(r) {
  if (!process.env.BOT_TOKEN || !groupChatId) return;
  const lines = r.items.map(i => `• ${i.name} ×${i.qty} — ${fmtUz(i.line_total_uzs)} so'm`).join('\n');
  await tg('sendMessage', {
    chat_id: groupChatId,
    text: `🧾 Chek #${String(r.receipt_no).padStart(6, '0')}\n` +
      `🕒 ${r.datetime_local}\n` +
      `👤 Sotuvchi: ${r.seller_name}\n` +
      `🛍 Xaridor: ${r.customer_name}\n${lines}\n` +
      `💰 Jami: ${fmtUz(r.total_uzs)} so'm`
  });
}

async function notifyCancel(r, byName, reason) {
  if (!process.env.BOT_TOKEN || !groupChatId) return;
  await tg('sendMessage', {
    chat_id: groupChatId,
    text: `⛔ Chek #${String(r.receipt_no).padStart(6, '0')} BEKOR QILINDI\n` +
      `🕒 ${r.datetime_local}\n` +
      `Bekor qilgan: ${byName}` + (reason ? `\nSabab: ${reason}` : '') + `\n` +
      `Summa: ${fmtUz(r.total_uzs)} so'm`
  });
}

module.exports = { initBot, notifySale, notifyCancel };
