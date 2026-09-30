import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { createGameServer } from '../server/app';
import { NET, type ClientMessage, type ServerMessage } from '../src/network/protocol';

class Peer {
  messages: ServerMessage[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', data => { this.messages.push(JSON.parse(data.toString()) as ServerMessage); if (this.messages.length > 250) this.messages.shift(); });
  }
  send(message: ClientMessage) { this.socket.send(JSON.stringify(message)); }
  async wait<T extends ServerMessage['type']>(type: T, predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const index = this.messages.findIndex(m => m.type === type && predicate(m as Extract<ServerMessage, { type: T }>));
      if (index >= 0) return this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Timed out waiting for ${type}`);
  }
}

test('real WebSocket rooms synchronize five humans, reject a sixth, and reconnect with host transfer', async t => {
  const game = createGameServer({ race: { countdownMs: 150 } });
  game.server.listen(0, '127.0.0.1'); await once(game.server, 'listening');
  const port = (game.server.address() as AddressInfo).port, peers: Peer[] = [];
  const connect = async () => { const peer = new Peer(new WebSocket(`ws://127.0.0.1:${port}/ws`)); peers.push(peer); await once(peer.socket, 'open'); return peer; };
  t.after(async () => { peers.forEach(p => p.socket.terminate()); await game.close(); });
  const a = await connect(); a.send({ type: 'create', version: NET.version, name: '<img src=x onerror=alert(1)>' .slice(0,20) });
  const joined = await a.wait('joined'), code = joined.room.code;
  assert.equal(joined.room.seats.length, 6);
  const b = await connect(); b.send({ type: 'join', version: NET.version, code, name: 'Friend' }); const friend = await b.wait('joined');
  for (let n = 0; n < 3; n++) { const p = await connect(); p.send({ type: 'join', version: NET.version, code, name: `Other ${n}` }); await p.wait('joined'); }
  const full = await connect(); full.send({ type: 'join', version: NET.version, code, name: 'Sixth' }); assert.match((await full.wait('error')).message, /full/);
  b.send({ type: 'start' }); assert.match((await b.wait('error')).message, /host/);
  for (const p of peers.slice(0, 5)) p.send({ type: 'ready', value: true });
  await a.wait('room', m => m.room.seats.filter(s => s.connected).every(s => s.ready));
  a.send({ type: 'start' });
  const countdownA = await a.wait('room', m => m.room.phase === 'countdown');
  const countdownB = await b.wait('room', m => m.room.phase === 'countdown');
  assert.equal(countdownA.room.startAt, countdownB.room.startAt);
  const raceId = countdownA.room.raceId;
  a.send({ type: 'input', seq: 1, raceId, input: { throttle: 1, brake: 0, steer: 0 } });
  b.send({ type: 'input', seq: 1, raceId, input: { throttle: 1, brake: 0, steer: 0 } });
  const snapA = await a.wait('snapshot', s => s.phase === 'racing' && s.elapsed > 0.06);
  const snapB = await b.wait('snapshot', s => s.serverTime === snapA.serverTime);
  assert.deepEqual(snapA.racers, snapB.racers); assert.ok(snapA.racers[0].state.speed > 0);
  assert.equal(snapA.racers.filter(r => r.control === 'ai').length, 1);
  assert.ok(!JSON.stringify(snapB).includes(joined.token));
  a.socket.close(); await once(a.socket, 'close');
  const transferred = await b.wait('room', m => m.room.ownerId === friend.playerId);
  assert.equal(transferred.room.seats[0].control, 'reconnecting');
  const rejoined = await connect(); rejoined.send({ type: 'reconnect', code, token: joined.token, version: NET.version });
  const restored = await rejoined.wait('joined'); assert.equal(restored.playerId, joined.playerId); assert.equal(restored.slot, joined.slot);
  assert.equal(restored.room.ownerId, friend.playerId);
  const takeover = await connect(); takeover.send({ type: 'reconnect', code, token: joined.token, version: NET.version });
  assert.equal((await takeover.wait('joined')).playerId, joined.playerId);
  assert.match((await rejoined.wait('error')).message, /another tab/);
  assert.equal(game.rooms.get(code)!.players.get(joined.playerId)!.connected, true);
  b.send({ type: 'leave' });
  await takeover.wait('room', m => m.room.ownerId !== friend.playerId);
});

test('production HTTP, authoritative results and rematch work over the same port', async t => {
  const game = createGameServer({ race: { countdownMs: 50, timeLimitMs: 500 } });
  game.server.listen(0, '127.0.0.1'); await once(game.server, 'listening'); const port = (game.server.address() as AddressInfo).port;
  const health = await fetch(`http://127.0.0.1:${port}/health`); assert.equal(health.status, 200);
  const page = await fetch(`http://127.0.0.1:${port}/`); assert.equal(page.status, 200); assert.match(await page.text(), /SLIPSTREAM/);
  const peer = new Peer(new WebSocket(`ws://127.0.0.1:${port}/ws`)); await once(peer.socket, 'open');
  t.after(async () => { peer.socket.terminate(); await game.close(); });
  peer.send({ type: 'create', name: 'Host', version: NET.version }); const joined = await peer.wait('joined');
  peer.send({ type: 'ready', value: true }); await peer.wait('room', m => m.room.seats[0].ready);
  peer.send({ type: 'start' }); const result = await peer.wait('snapshot', s => s.phase === 'results');
  assert.equal(result.racers.length, 6); assert.ok(result.racers.every(r => r.finishTime === null));
  peer.send({ type: 'rematch' }); const lobby = await peer.wait('room', m => m.room.phase === 'lobby' && m.room.raceId === 1);
  assert.equal(lobby.room.seats[0].ready, false); assert.equal(lobby.room.ownerId, joined.playerId);
});
