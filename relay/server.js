// Relay WebSocket para el chat: reenvía mensajes entre los dos navegadores de una sala.
// Solo se usa cuando la conexión P2P no se puede establecer (p. ej. NAT simétrico).
// No almacena nada: cada mensaje se reenvía y se descarta.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const ROOM_RE = /^webrtc-test-\d{4}$/;
const rooms = new Map(); // sala -> { host: ws, guest: ws }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('webrtc-test relay activo');
});

const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = url.searchParams.get('room') || '';
  const role = url.searchParams.get('role');

  if (!ROOM_RE.test(room) || (role !== 'host' && role !== 'guest')) {
    return ws.close(4000, 'parametros no validos');
  }

  if (!rooms.has(room)) rooms.set(room, {});
  const members = rooms.get(room);
  if (members[role]) return ws.close(4409, 'rol ya ocupado en la sala');

  members[role] = ws;
  const other = role === 'host' ? 'guest' : 'host';
  const send = (sock, obj) => { if (sock && sock.readyState === sock.OPEN) sock.send(JSON.stringify(obj)); };
  // Avisa a ambos de si el otro extremo está presente (no reenvía contenido)
  send(ws, { t: 'presence', on: !!members[other] });
  send(members[other], { t: 'presence', on: true });
  console.log(`[${new Date().toISOString()}] ${room} ${role} conectado`);

  ws.on('message', (data, isBinary) => {
    const peer = (rooms.get(room) || {})[other];
    if (peer && peer.readyState === peer.OPEN) peer.send(data, { binary: isBinary });
  });

  ws.on('close', () => {
    const m = rooms.get(room);
    if (!m) return;
    if (m[role] === ws) delete m[role];
    send(m[other], { t: 'presence', on: false });
    if (!m.host && !m.guest) rooms.delete(room);
    console.log(`[${new Date().toISOString()}] ${room} ${role} desconectado`);
  });
});

server.listen(PORT, () => console.log(`Relay escuchando en el puerto ${PORT}`));
