const { WebSocketServer } = require('ws');
const { getSettings } = require('./db');

const clients = new Set();

function printerConfig(st) {
  let mode = String(st.printer_mode || '').toLowerCase();
  // Eski bazalarda default 'network'. Host yozilmagan (yoki Windows printer nomi
  // berilgan) bo'lsa — network rejim baribir ishlamaydi, agentning 'windows'
  // rejimiga tushiramiz, aks holda agent ulanganda chop etish jim o'chib qoladi.
  if (!mode || mode === 'network' && !st.printer_host) mode = 'windows';
  if (st.printer_name && mode === 'network') mode = 'windows';
  return {
    mode,
    host: st.printer_host || '',
    port: Number(st.printer_port) || 9100,
    share: st.printer_share || '',
    printerName: st.printer_name || ''
  };
}

function sendConfig(ws) {
  getSettings()
    .then(st => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'config', config: printerConfig(st) })); })
    .catch(() => {});
}

function initWs(server) {
  const token = process.env.AGENT_TOKEN || 'savdo-agent-token';
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const t = new URL(req.url, 'http://localhost').searchParams.get('token');
    if (t !== token) return ws.close(4001, 'token xato');
    clients.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => {});
    ws.send(JSON.stringify({ type: 'hello' }));
    // Agent ulanishi bilan bazadagi printer sozlamasini yuboramiz
    sendConfig(ws);
    console.log('Chek agenti ulandi (jami:', clients.size, ')');
  });
  // Bitta buzuq ulanish butun serverni yiqitmasligi uchun har bir amal alohida
  // himoyalangan — aks holda agent/protsess o'chib, chek chiqmay qolardi.
  wss.on('error', e => console.error('WS server xatosi:', e.message));
  setInterval(() => {
    for (const ws of clients) {
      try {
        if (!ws.isAlive) { clients.delete(ws); ws.terminate(); continue; }
        ws.isAlive = false;
        ws.ping();
      } catch (e) {
        clients.delete(ws);
        try { ws.terminate(); } catch (_) { /* allaqachon yopilgan */ }
      }
    }
  }, 30000);
}

function agentOnline() { return clients.size > 0; }

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState !== 1) continue;
    // Bitta buzuq ulanish butun broadcast'ni yiqitmasligi kerak
    try { ws.send(s); } catch (e) { console.error('WS yuborishda xato:', e.message); }
  }
}

module.exports = { initWs, broadcast, agentOnline, printerConfig };
