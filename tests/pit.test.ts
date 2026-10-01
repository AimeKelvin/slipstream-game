import test from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from '../src/track/Circuit';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { PIT } from '../src/track/PitLane';
import { pitDriverInput } from '../src/race/PitStop';
import { tyreGrip, wearTyres } from '../src/race/Tyres';
import { Room } from '../server/Room';
import { RaceProgress, FINISH_INDEX } from '../src/race/Progress';
const circuit = new Circuit(),
  dt = 1 / 120;
const brake = { throttle: 0, brake: 1, steer: 0 },
  throttle = { throttle: 1, brake: 0, steer: 0 };

function inBox(error: number, slot = 0) {
  const car = new VehiclePhysics(circuit, slot),
    s = car.state;
  s.tyres = 0.15;
  s.pitPhase = 1;
  s.pitDistance = circuit.pit.boxDistance(slot) + error;
  for (let i = 0; i < 30; i++) car.step(brake, dt);
  return car;
}
test('accurate, good and missed stops have short graduated service times', () => {
  for (const [error, rating, duration] of [
    [0, 1, 2.4],
    [2.5, 2, 3.3],
    [-10, 3, 4.5],
    [12, 3, 4.5],
  ]) {
    const car = inBox(error),
      s = car.state;
    assert.equal(s.pitPhase, 2);
    assert.equal(s.pitRating, rating);
    assert.equal(s.pitStopDuration, duration);
    assert.equal(s.tyres, 0.15, 'tyres are not restored until the service finishes');
    const x = s.x,
      z = s.z;
    for (let i = 0; i < 100; i++) car.step(throttle, dt);
    assert.equal(s.x, x);
    assert.equal(s.z, z);
    assert.equal(s.speed, 0);
    for (let i = 0; i < 600 && s.pitPhase === 2; i++) car.step(throttle, dt);
    assert.equal(s.pitPhase, 3);
    assert.equal(s.tyres, 1);
    assert.equal(s.pitStops, 1);
  }
});
test('each racer is guided to its own box, fits tyres and exits back onto the track', () => {
  for (let slot = 0; slot < 6; slot++) {
    const car = new VehiclePhysics(circuit, slot),
      s = car.state;
    s.contactIndex = PIT.entryIndex;
    car.reset();
    s.pitRequested = true;
    s.tyres = 0.3;
    for (let frame = 0; frame < 120 * 50; frame++) {
      const input = s.pitPhase ? pitDriverInput(s, circuit) : throttle;
      car.step(input, dt);
      if (s.pitStops && !s.pitPhase) break;
    }
    assert.equal(s.pitStops, 1, `slot ${slot} must complete service`);
    assert.equal(s.pitRating, 1, `slot ${slot} can make a perfect stop`);
    assert.equal(s.pitPhase, 0);
    assert.equal(s.pitRequested, false);
    assert.ok(s.tyres > 0.99);
    assert.equal(s.contactIndex, PIT.exitIndex);
    assert.ok(circuit.nearest(s.x, s.z).distance < 0.01);
  }
});
test('missing the braking point completely is recovered without trapping the car', () => {
  const car = new VehiclePhysics(circuit);
  car.state.pitRequested = true;
  for (let i = 0; i < 120 * 40; i++) {
    car.step(throttle, dt);
    if (car.state.pitStops && !car.state.pitPhase) break;
  }
  assert.equal(car.state.pitStops, 1);
  assert.equal(car.state.pitRating, 3);
  assert.equal(car.state.pitPhase, 0);
});
test('wear is distance and load based, reduces grip, and resets cannot manufacture fresh tyres', () => {
  const fresh = new VehiclePhysics(circuit),
    worn = new VehiclePhysics(circuit);
  worn.state.tyres = 0.05;
  assert.ok(tyreGrip(worn.state.tyres) < tyreGrip(fresh.state.tyres) * 0.7);
  const start = fresh.state.tyres;
  wearTyres(fresh.state, 0, circuit.length);
  assert.equal(fresh.state.tyres, start);
  wearTyres(fresh.state, circuit.length, circuit.length);
  assert.ok(fresh.state.tyres < 0.65);
  worn.reset();
  assert.equal(worn.state.tyres, 0.05);
  worn.reset(true);
  assert.equal(worn.state.tyres, 1);
  // With matching speed and steering, tired rubber supports less yaw in a fast corner.
  for (const car of [fresh, worn]) {
    car.state.tyres = car === fresh ? 1 : 0.02;
    const s = car.state;
    s.vx = Math.sin(s.heading) * 45;
    s.vz = Math.cos(s.heading) * 45;
    s.speed = 45;
    for (let i = 0; i < 35; i++) car.step({ throttle: 0, brake: 0, steer: 0.8 }, dt);
  }
  assert.ok(Math.abs(worn.state.yawRate) < Math.abs(fresh.state.yawRate) * 0.85);
});
test('server pit calls respect race state and preserve a stop across reconnects', () => {
  const room = new Room('ABCDEF', 0, { countdownMs: 0 });
  const p = room.addPlayer('Racer', 0);
  room.pit(p.id);
  assert.equal(room.cars[0].state.pitRequested, false);
  room.ready(p.id, true);
  room.start(p.id, 0);
  room.tick(dt, 1);
  room.pit(p.id);
  assert.equal(room.cars[0].state.pitRequested, true);
  room.pit(p.id);
  assert.equal(room.cars[0].state.pitRequested, false);
  const stop = inBox(0);
  Object.assign(room.cars[0].state, stop.state);
  const remaining = room.cars[0].state.pitStopTime;
  room.reset(p.id, 100);
  assert.equal(room.cars[0].state.pitPhase, 2);
  room.disconnect(p.id, 100);
  room.reconnect(p.token, 200);
  assert.equal(room.cars[0].state.pitStopTime, remaining);
  assert.equal(room.snapshot(200).racers[0].state.pitSlot, 0);
});
test('full laps require all three sectors and an off-track lap cannot set a best time', () => {
  const car = new VehiclePhysics(circuit),
    progress = new RaceProgress(circuit, FINISH_INDEX, 3);
  const advance = (lap: number, offroad: boolean) => {
    for (let i = 1; i <= circuit.samples.length; i++) {
      car.state.contactIndex = (FINISH_INDEX + i) % circuit.samples.length;
      car.state.offroad = offroad && i === 100;
      progress.update(car.state, lap * 100 + (i / circuit.samples.length) * 100);
    }
  };
  advance(0, true);
  assert.equal(progress.completedLaps, 1);
  assert.equal(progress.bestLap, null);
  advance(1, false);
  assert.equal(progress.completedLaps, 2);
  assert.ok(Math.abs(progress.bestLap! - 100) < 0.001);
  assert.equal(progress.sector, 1);
  assert.ok(Math.abs(progress.lastLap! - 100) < 0.001);
});

test('a high-speed entry still catches an overshoot and finishes service', () => {
  const car = new VehiclePhysics(circuit), s = car.state;
  s.speed = 80; s.vx = Math.sin(s.heading) * 80; s.vz = Math.cos(s.heading) * 80;
  s.pitRequested = true;
  for (let frame = 0; frame < 120 * 40; frame++) {
    car.step(throttle, dt);
    if (s.pitStops && !s.pitPhase) break;
  }
  assert.equal(s.pitStops, 1); assert.equal(s.pitRating, 3); assert.equal(s.pitPhase, 0);
});
