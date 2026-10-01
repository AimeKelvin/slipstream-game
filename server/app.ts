import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Room, type Player, type RaceOptions } from './Room';
import { NET, parseClientMessage, type ServerMessage } from '../src/network/protocol';
import { SIMULATION_STEP } from '../src/core/config';

interface Connection {
  socket: WebSocket; room?: Room; player?: Player; alive: boolean;
  windowAt: number; messages: number; joinedAt: number; lastRoomAt: number;
}
export function createGameServer(options: { race?: Partial<RaceOptions>; maxRooms?: number } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const rooms = new Map<string, Room>(), connections = new Set<Connection>();
  let stopping = false;
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  app.get('/health', (_req, res) => res.status(stopping ? 503 : 200).json({ ok: !stopping, rooms: rooms.size, connections: connections.size }));
  app.use(express.static(resolve('dist'), { index: 'index.html', dotfiles: 'deny', setHeaders: (res, file) => {
    res.setHeader('Cache-Control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  } }));
  app.use((_req, res) => res.status(404).send('Not found'));
  const send = (connection: Connection, message: ServerMessage) => {
    if (connection.socket.readyState !== WebSocket.OPEN) return;
    if (connection.socket.bufferedAmount > 512_000) { connection.socket.close(1013, 'Connection is too slow'); return; }
    connection.socket.send(JSON.stringify(message));
  };
  const broadcastRoom = (room: Room, now: number) => {
    for (const c of connections) if (c.room === room) send(c, { type: 'room', room: room.view(now) });
    room.dirty = false;
  };
  const leave = (c: Connection, explicit: boolean) => {
    if (c.room && c.player) { c.room.disconnect(c.player.id, Date.now(), explicit); broadcastRoom(c.room, Date.now()); }
    c.room = undefined; c.player = undefined;
  };
  server.on('upgrade', (request, socket, head) => {
    let allowed = request.url === '/ws' && !stopping && connections.size < 120;
    if (process.env.NODE_ENV === 'production' && request.headers.origin) {
      try { allowed &&= new URL(request.headers.origin).host === request.headers.host; } catch { allowed = false; }
    }
    if (!allowed) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });
  wss.on('connection', socket => {
    const now = Date.now();
    const c: Connection = { socket, alive: true, windowAt: now, messages: 0, joinedAt: now, lastRoomAt: 0 };
    connections.add(c);
    socket.on('pong', () => { c.alive = true; });
    socket.on('error', () => { /* The close handler releases ownership and starts the grace period. */ });
    socket.on('close', () => { connections.delete(c); leave(c, false); });
    socket.on('message', (data, binary) => {
      const now = Date.now();
      if (now - c.windowAt > 1000) { c.windowAt = now; c.messages = 0; }
      if (++c.messages > 150 || binary) { socket.close(1008, 'Message rate or format rejected'); return; }
      const message = parseClientMessage(data.toString());
      if (!message) { send(c, { type: 'error', message: 'Invalid message or outdated client. Reload the game.' }); return; }
      try {
        if (message.type === 'ping') { send(c, { type: 'pong', sentAt: message.sentAt, serverTime: now }); return; }
        if (message.type === 'create' || message.type === 'join' || message.type === 'reconnect') {
          if (c.room) throw new Error('Leave the current room first.');
          if (message.type === 'create') {
            if (rooms.size >= (options.maxRooms ?? 20)) throw new Error('The server is full. Try again after a race finishes.');
            const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code: string;
            do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
            const room = new Room(code, now, options.race);
            const player = room.addPlayer(message.name, now, message.color); rooms.set(code, room); c.room = room; c.player = player;
          } else {
            const room = rooms.get(message.code);
            if (!room) { send(c, { type: 'error', message: 'Room not found. It may have expired or the server restarted.', fatal: message.type === 'reconnect' }); return; }
            c.player = message.type === 'reconnect' ? room.reconnect(message.token, now) : room.addPlayer(message.name, now, message.color); c.room = room;
            // A token-authenticated reconnect may arrive before a half-open old socket
            // times out. Transfer ownership without letting its close handler detach us.
            if (message.type === 'reconnect') for (const previous of connections) {
              if (previous !== c && previous.room === room && previous.player?.id === c.player.id) {
                previous.room = undefined; previous.player = undefined;
                send(previous, { type: 'error', message: 'Your driver reconnected in another tab.', fatal: true });
                previous.socket.close(1000, 'Session transferred');
              }
            }
          }
          send(c, { type: 'joined', playerId: c.player!.id, token: c.player!.token, slot: c.player!.slot, room: c.room!.view(now), serverTime: now });
          send(c, c.room!.snapshot(now)); broadcastRoom(c.room!, now); return;
        }
        if (!c.room || !c.player) throw new Error('Join a room first.');
        const room = c.room, id = c.player.id;
        switch (message.type) {
          case 'leave': leave(c, true); break;
          case 'ready': room.ready(id, message.value); break;
          case 'profile': room.profile(id, message.name, message.color); break;
          case 'start': room.start(id, now); break;
          case 'rematch': room.rematch(id); break;
          case 'pit': room.pit(id); break;
          case 'reset': room.reset(id, now); break;
          case 'away': room.away(id, message.value, now); break;
          case 'input': room.input(id, message.seq, message.input, message.raceId, now); break;
        }
        if (room.dirty) broadcastRoom(room, now);
      } catch (error) {
        send(c, { type: 'error', message: error instanceof Error ? error.message : 'Request failed.', fatal: message.type === 'reconnect' });
      }
    });
  });
  let simulationTime = Date.now(), last = performance.now(), accumulated = 0, lastSnapshot = 0, lastRoom = 0;
  const tick = setInterval(() => {
    const now = performance.now(); accumulated += Math.min((now - last) / 1000, 0.25); last = now;
    // A long process stall drops backlog, never permits clients to speed up simulation.
    if (Math.abs(Date.now() - simulationTime) > 500) { simulationTime = Date.now(); accumulated = 0; }
    while (accumulated >= SIMULATION_STEP) {
      simulationTime += SIMULATION_STEP * 1000;
      for (const room of rooms.values()) room.tick(SIMULATION_STEP, simulationTime);
      accumulated -= SIMULATION_STEP;
    }
    if (now - lastSnapshot >= 1000 / NET.snapshotHz) {
      for (const room of rooms.values()) {
        const snapshot = room.snapshot(simulationTime);
        for (const c of connections) if (c.room === room) send(c, snapshot);
        if (room.dirty || now - lastRoom >= 1000) broadcastRoom(room, simulationTime);
        if (Date.now() - room.lastOccupiedAt > NET.reconnectMs + 10000) rooms.delete(room.code);
      }
      if (now - lastRoom >= 1000) lastRoom = now;
      lastSnapshot = now;
    }
  }, 1000 / 120);
  const heartbeat = setInterval(() => {
    for (const c of connections) {
      if (!c.alive || (!c.room && Date.now() - c.joinedAt > 20000)) { c.socket.terminate(); continue; }
      c.alive = false; c.socket.ping();
    }
  }, 10000);
  return {
    server, rooms, connections,
    async close() {
      stopping = true; clearInterval(tick); clearInterval(heartbeat);
      for (const c of connections) { send(c, { type: 'shutdown', message: 'The race server is restarting. Open a new room once it returns.' }); c.socket.close(1012, 'Server restarting'); }
      const force = setTimeout(() => { for (const c of connections) c.socket.terminate(); }, 500); force.unref();
      await new Promise<void>(done => wss.close(() => done()));
      await new Promise<void>(done => server.close(() => done()));
    },
  };
}
