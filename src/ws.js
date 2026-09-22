const { WebSocketServer } = require('ws');

const clients = new Set();

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
    console.log('Chek agenti ulandi (jami:', clients.size, ')');
  });
  setInterval(() => {
    for (const ws of clients) {
      if (!ws.isAlive) { clients.delete(ws); ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
}

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const ws of clients) if (ws.readyState === 1) ws.send(s);
}

module.exports = { initWs, broadcast };
