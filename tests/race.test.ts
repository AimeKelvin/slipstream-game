import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/Room';
import { NET, parseClientMessage } from '../src/network/protocol';
import { SIMULATION_STEP as DT } from '../src/core/config';
import { RaceProgress, FINISH_INDEX } from '../src/race/Progress';
import { Circuit } from '../src/track/Circuit';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';

test('rooms reserve at most five humans and always contain six racers', () => {
  const room = new Room('ABCDEF', 0);
  for (let n = 1; n <= 5; n++) {
    room.addPlayer(`Driver ${n}`, 0); const view = room.view(0);
    assert.equal(view.seats.length, 6);
    assert.equal(view.seats.filter(s => s.control === 'human').length, n);
    assert.equal(view.seats.filter(s => s.control === 'ai').length, 6 - n);
  }
  assert.throws(() => room.addPlayer('Sixth human', 0), /full/);
});
test('readiness, host-only start, synchronized countdown and rematch permissions', () => {
  const room = new Room('ABCDEF', 0, { countdownMs: 1000 });
  const a = room.addPlayer('A', 0), b = room.addPlayer('B', 0);
  assert.throws(() => room.start(b.id, 0), /host/);
  room.ready(a.id, true); assert.throws(() => room.start(a.id, 0), /ready/);
  room.ready(b.id, true); room.start(a.id, 0);
  const original = room.cars[0].state.z;
  room.input(a.id, 1, { throttle: 1, brake: 0, steer: 0 }, room.raceId, 1);
  for (let i = 0; i < 119; i++) room.tick(DT, i * DT * 1000);
  assert.equal(room.phase, 'countdown'); assert.equal(room.cars[0].state.z, original);
  room.tick(DT, 1000); assert.equal(room.phase, 'racing');
  assert.throws(() => room.addPlayer('Late join', 1001), /started/);
  assert.throws(() => room.rematch(a.id), /results/);
  room.phase = 'results'; room.rematch(a.id);
  assert.equal(room.phase, 'lobby'); assert.ok([...room.players.values()].every(p => !p.ready));
});
test('host transfer, AI replacement and authenticated reconnect preserve car identity', () => {
  const room = new Room('ABCDEF', 0); const a = room.addPlayer('A', 0), b = room.addPlayer('B', 0);
  room.disconnect(a.id, 500); assert.equal(room.ownerId, b.id);
  assert.equal(room.control(a.slot, 501), 'reconnecting');
  const p = room.reconnect(a.token, 1000); assert.equal(p.slot, a.slot); assert.equal(p.id, a.id);
  assert.equal(room.control(a.slot, 1001), 'human'); assert.equal(room.ownerId, b.id);
  assert.throws(() => room.reconnect('not-a-token', 1002), /expired/);
  room.disconnect(a.id, 2000); room.tick(DT, 2000 + NET.reconnectMs + 1);
  assert.equal(room.control(a.slot, 62001), 'ai'); assert.equal(room.players.size, 1);
});
test('reversing across the finish line and jumping checkpoints cannot earn laps', () => {
  const circuit = new Circuit(), car = new VehiclePhysics(circuit);
  const progress = new RaceProgress(circuit, FINISH_INDEX, 3);
  let index = FINISH_INDEX, elapsed = 0;
  const step = (direction: number) => { index = (index + direction + circuit.samples.length) % circuit.samples.length; car.state.contactIndex = index; progress.update(car.state, elapsed += 0.05); };
  for (let n = 0; n < 20; n++) step(-1);
  for (let n = 0; n < 20; n++) step(1);
  assert.equal(progress.completedLaps, 0);
  for (let n = 0; n < circuit.samples.length + 1; n++) step(1);
  assert.equal(progress.completedLaps, 1);
  for (let n = 0; n < 50; n++) step(-1);
  for (let n = 0; n < 50; n++) step(1);
  assert.equal(progress.completedLaps, 1);
  const before = progress.distance; step(100); assert.equal(progress.distance, before);
});
test('the protocol rejects malformed, non-finite and out-of-range driving input', () => {
  for (const payload of ['null', '{}', '{', JSON.stringify({ type: 'input', seq: 1, raceId: 1, input: { throttle: 100, brake: 0, steer: 0 } }), JSON.stringify({ type: 'position', x: 0, z: 10000 })]) assert.equal(parseClientMessage(payload), null);
  assert.ok(parseClientMessage(JSON.stringify({ type: 'input', seq: 1, raceId: 1, input: { throttle: 1, brake: 0, steer: -1 } })));
});
test('six AI-controlled cars finish three laps with valid results and useful skill variation', () => {
  const room = new Room('ABCDEF', 0, { countdownMs: 0 });
  const owner = room.addPlayer('Test driver', 0); room.ready(owner.id, true); room.start(owner.id, 0); room.away(owner.id, true, 0);
  let offroadFrames = 0, frame = 0;
  while (room.phase !== 'results' && frame < 120 * 400) {
    room.tick(DT, ++frame * DT * 1000);
    offroadFrames += room.cars.filter(c => c.state.offroad).length;
  }
  const snapshot = room.snapshot(frame * DT * 1000);
  console.log('AI race:', { seconds: frame / 120, offroadFrames, finishes: snapshot.racers.map(r => r.finishTime), recoveries: room.revisions.map(r => r - 2) });
  assert.ok(snapshot.racers.every(r => r.state.pitStops >= 1), 'Every AI driver must use its pit crew during the race');
  assert.equal(room.phase, 'results'); assert.ok(snapshot.racers.every(r => r.finishTime !== null && r.bestLap !== null));
  assert.equal(new Set(snapshot.racers.map(r => r.position)).size, 6);
  assert.ok(offroadFrames < frame * 6 * 0.05, 'AI should spend at least 95% of its time on asphalt');
  assert.ok(room.revisions.every(r => r < 6), 'AI should not depend on repeated resets to finish');
});
