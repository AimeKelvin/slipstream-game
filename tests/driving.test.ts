import test from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from '../src/track/Circuit';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import { SIMULATION_STEP as DT, TRACK, VEHICLE } from '../src/core/config';
import { angleDelta, clamp } from '../src/core/math';

const circuit = new Circuit();
const neutral = { throttle: 0, brake: 0, steer: 0 };
function run(car: VehiclePhysics, seconds: number, input = neutral) {
  for (let i = 0; i < seconds / DT; i++) car.step(input, DT);
}

test('circuit is closed, consistently sampled, and wide enough at every point', () => {
  assert.ok(circuit.length > 3000);
  let minSeparation = Infinity;
  for (let i = 0; i < circuit.samples.length; i++) {
    const a = circuit.at(i),
      b = circuit.at(i + 1);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 3);
    for (let j = i + 40; j < i + circuit.samples.length - 40; j += 10) {
      const p = circuit.at(j);
      minSeparation = Math.min(minSeparation, Math.hypot(p.x - a.x, p.z - a.z));
    }
  }
  assert.ok(minSeparation > 25, `Track overlaps: ${minSeparation}`);
});
test('accelerates to 100 km/h promptly and brakes decisively', () => {
  const car = new VehiclePhysics(circuit);
  run(car, 3, { ...neutral, throttle: 1 });
  assert.ok(car.state.speed * 3.6 > 100);
  const speed = car.state.speed;
  run(car, 0.9, { ...neutral, brake: 1 });
  assert.ok(car.state.speed < speed * 0.4);
  assert.ok(car.state.speed > -1);
});
test('coasts without oscillation and has a capped, controllable reverse', () => {
  const car = new VehiclePhysics(circuit);
  run(car, 4);
  assert.equal(car.state.speed, 0);
  run(car, 2, { ...neutral, brake: 1 });
  assert.ok(car.state.speed < -5 && car.state.speed >= -9.00001);
  run(car, 0.8, { ...neutral, throttle: 1 });
  assert.ok(car.state.speed > 0);
});
test('steering eases in, respects high-speed grip and self-centers', () => {
  const car = new VehiclePhysics(circuit);
  run(car, 1.5, { ...neutral, throttle: 1 });
  const before = car.state.heading;
  car.step({ throttle: 0.8, brake: 0, steer: 1 }, DT);
  assert.ok(Math.abs(car.state.heading - before) < 0.01);
  run(car, 0.35, { throttle: 0.8, brake: 0, steer: 1 });
  assert.ok(car.state.heading < before);
  run(car, 1);
  assert.ok(Math.abs(car.state.steering) < 0.002);
});
test('barrier collisions keep the car in bounds without NaNs or runaway energy', () => {
  const car = new VehiclePhysics(circuit);
  const start = circuit.at(TRACK.startIndex);
  car.state.heading = Math.atan2(start.nx, start.nz);
  car.state.vx = start.nx * 60;
  car.state.vz = start.nz * 60;
  run(car, 1, { ...neutral, throttle: 1 });
  const contact = circuit.nearest(car.state.x, car.state.z);
  assert.ok(contact.distance < 12);
  const fx = Math.sin(car.state.heading),
    fz = Math.cos(car.state.heading);
  const extent =
    Math.abs(contact.nx * fx + contact.nz * fz) * VEHICLE.halfLength +
    Math.abs(contact.nx * fz - contact.nz * fx) * VEHICLE.halfWidth;
  assert.ok(contact.distance + extent <= 12, 'The nose must remain inside the barrier');
  assert.ok(Math.hypot(car.state.vx, car.state.vz) < 60);
  for (const value of Object.values(car.state))
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  car.reset();
  assert.equal(car.state.speed, 0);
  assert.ok(circuit.nearest(car.state.x, car.state.z).distance < 0.05);
});
test('a predictive test driver can complete the whole circuit with stable physics', () => {
  const car = new VehiclePhysics(circuit);
  let distance = 0,
    worstOffset = 0,
    impacts = 0;
  for (let frame = 0; frame < 120 * Math.ceil(circuit.length / 19 * 1.3); frame++) {
    const s = car.state,
      lookahead = circuit.at(s.contactIndex + 11);
    const desired = Math.atan2(lookahead.x - s.x, lookahead.z - s.z);
    const delta = angleDelta(s.heading, desired);
    const steer = clamp(-delta * 2.8, -1, 1);
    const speedTarget = 19;
    car.step(
      {
        throttle: s.speed < speedTarget ? 0.8 : 0,
        brake: s.speed > speedTarget + 1 ? 0.25 : 0,
        steer,
      },
      DT,
    );
    distance += Math.max(0, s.speed) * DT;
    worstOffset = Math.max(worstOffset, circuit.nearest(s.x, s.z, s.contactIndex).distance);
    if (s.impact > 0.1) impacts++;
    if (distance > circuit.length * 1.1) break;
  }
  assert.ok(distance > circuit.length, `Covered only ${distance}m`);
  assert.equal(impacts, 0);
  assert.ok(worstOffset < 5, `Worst line error: ${worstOffset}`);
});
