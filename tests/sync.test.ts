import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/Room';
import { RaceSync } from '../src/network/RaceSync';
import type { RoomClient } from '../src/network/RoomClient';
import { NEUTRAL, type ClientMessage } from '../src/network/protocol';

function setup() {
  const room = new Room('ABCDEF', 0, { countdownMs: 0 });
  const player = room.addPlayer('Driver', 0);
  room.ready(player.id, true);
  room.start(player.id, 0);
  room.tick(1 / 120, 0);
  const state = room.cars[0].state;
  state.speed = 20;
  state.vx = Math.sin(state.heading) * 20;
  state.vz = Math.cos(state.heading) * 20;
  const messages: ClientMessage[] = [];
  const client = {
    slot: 0,
    status: 'online',
    room: room.view(0),
    serverNow: () => 100,
    send: (m: ClientMessage) => messages.push(m),
  } as unknown as RoomClient;
  const sync = new RaceSync(room.circuit, client);
  sync.accept(room.snapshot(0));
  return { room, sync, messages, client };
}

test('local rendering moves between 60 Hz prediction steps on a 120 Hz display', () => {
  const { sync, messages } = setup();
  const positions: { x: number; z: number }[] = [];
  for (let i = 0; i < 8; i++) {
    sync.update(1 / 120, NEUTRAL, true);
    positions.push({ ...sync.states()[0] });
  }
  for (let i = 2; i < positions.length; i++)
    assert.ok(
      Math.hypot(positions[i].x - positions[i - 1].x, positions[i].z - positions[i - 1].z) > 0.01,
    );
  assert.equal(messages.length, 4);
});

test('authoritative recovery snaps cleanly and large frame gaps have bounded input work', () => {
  const { sync, room, messages } = setup();
  sync.update(1, NEUTRAL, true);
  assert.ok(messages.length <= 6);
  room.cars[0].state.x += 50;
  room.revisions[0]++;
  const snapshot = room.snapshot(100);
  sync.accept(snapshot);
  sync.update(0, NEUTRAL, true);
  assert.equal(sync.states()[0].x, snapshot.racers[0].state.x);
  assert.equal(sync.states()[0].z, snapshot.racers[0].state.z);
});

test('opponent interpolation takes the short path across the heading wrap', () => {
  const { sync, room } = setup();
  room.cars[1].state.heading = Math.PI - 0.1;
  sync.accept(room.snapshot(-50));
  room.cars[1].state.heading = -Math.PI + 0.1;
  sync.accept(room.snapshot(50));
  sync.update(0, NEUTRAL, true);
  assert.ok(Math.abs(Math.abs(sync.states()[1].heading) - Math.PI) < 0.001);
});

test('returning from autopilot discards stale prediction and resumes at the server position', () => {
  const { sync, room } = setup();
  sync.update(0.1, { throttle: 1, brake: 0, steer: 1 }, true);
  const player = [...room.players.values()][0];
  room.away(player.id, true, 100);
  sync.accept(room.snapshot(100));
  room.cars[0].state.x += 5;
  room.away(player.id, false, 200);
  const returned = room.snapshot(200);
  sync.accept(returned);
  sync.update(0, NEUTRAL, true);
  assert.equal(sync.states()[0].x, returned.racers[0].state.x);
  assert.equal(sync.states()[0].heading, returned.racers[0].state.heading);
});
