import { freshPitState, stepPit } from '../race/PitStop';
import { tyreGrip, wearTyres } from '../race/Tyres';
import { TRACK, VEHICLE as V } from '../core/config';
import { clamp, damp } from '../core/math';
import type { Circuit } from '../track/Circuit';

export interface DriverInput {
  throttle: number;
  brake: number;
  steer: number;
}
export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  speed: number;
  steering: number;
  yawRate: number;
  acceleration: number;
  lateralForce: number;
  slip: number;
  offroad: boolean;
  contactIndex: number;
  impact: number;
  tyres: number;
  pitSlot: number;
  pitRequested: boolean;
  pitPhase: number;
  pitDistance: number;
  pitStopTime: number;
  pitStopDuration: number;
  pitRating: number;
  pitStops: number;
  pitHold: number;
  pitEntryOffset: number;
}

/** Fixed-step planar bicycle model. No renderer, DOM or wall-clock dependencies. */
export class VehiclePhysics {
  readonly state: VehicleState = {
    x: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
    speed: 0,
    steering: 0,
    yawRate: 0,
    acceleration: 0,
    lateralForce: 0,
    slip: 0,
    offroad: false,
    contactIndex: TRACK.startIndex,
    impact: 0,
    pitSlot: 0,
    ...freshPitState(),
  };
  constructor(private circuit: Circuit, slot = 0) {
    this.state.pitSlot = slot;
    this.reset(true);
  }
  reset(toStart = false) {
    if (toStart) Object.assign(this.state, freshPitState());
    const index = toStart ? TRACK.startIndex : this.state.contactIndex;
    const p = this.circuit.at(index);
    Object.assign(this.state, {
      x: p.x,
      z: p.z,
      heading: Math.atan2(p.tx, p.tz),
      vx: 0,
      vz: 0,
      speed: 0,
      steering: 0,
      yawRate: 0,
      acceleration: 0,
      lateralForce: 0,
      slip: 0,
      offroad: false,
      contactIndex: index,
      impact: 0,
    });
  }
  step(input: DriverInput, dt: number) {
    const s = this.state;
    if (stepPit(s, input, dt, this.circuit)) return;
    const tyre = tyreGrip(s.tyres);
    const fX = Math.sin(s.heading),
      fZ = Math.cos(s.heading);
    const rX = fZ,
      rZ = -fX;
    let forward = s.vx * fX + s.vz * fZ;
    let lateral = s.vx * rX + s.vz * rZ;
    const absSpeed = Math.abs(forward);
    const throttle = clamp(input.throttle, 0, 1),
      brake = clamp(input.brake, 0, 1);
    let force = 0;
    if (throttle > 0)
      force +=
        forward < -0.5
          ? V.braking * tyre * throttle
          : (V.acceleration * (0.65 + tyre * 0.35) / (1 + absSpeed * 0.022)) * throttle;
    if (brake > 0) force -= forward > 0.5 ? V.braking * (0.6 + tyre * 0.4) * brake : 6 * brake;
    const resistance =
      V.rollingResistance + V.drag * absSpeed * absSpeed + (s.offroad ? 3 + absSpeed * 0.1 : 0);
    if (absSpeed > 0.08) force -= Math.sign(forward) * resistance;
    const previous = forward;
    forward = clamp(forward + force * dt, -V.reverseSpeed, V.maxSpeed * (0.72 + tyre * 0.28));
    if (!throttle && !brake && Math.sign(previous) !== Math.sign(forward)) forward = 0;
    // Keep braking from lurching into reverse while crossing the stop threshold.
    if (brake && previous > 0.5 && forward < 0.5) forward = 0;
    s.acceleration = damp(s.acceleration, (forward - previous) / dt, 7, dt);
    const maxAngle = 0.49 / (1 + absSpeed * 0.025);
    s.steering = damp(s.steering, -clamp(input.steer, -1, 1) * maxAngle, V.steeringRate, dt);
    const grip = (s.offroad ? V.grassGrip : V.roadGrip + Math.min(7, absSpeed * absSpeed * 0.002)) * tyre;
    const requestedYaw = (forward / V.wheelbase) * Math.tan(s.steering);
    const maxYaw = grip / Math.max(absSpeed, 3);
    s.yawRate = damp(s.yawRate, clamp(requestedYaw, -maxYaw, maxYaw), V.yawResponse, dt);
    s.heading += s.yawRate * dt;
    // A small, quickly recovering lateral component gives tires compliance without spinning.
    lateral += (requestedYaw - s.yawRate) * absSpeed * dt * 0.15;
    lateral *= Math.exp(-(s.offroad ? 4 : 10 * tyre) * dt);
    lateral = clamp(lateral, -3.8, 3.8);
    s.lateralForce = damp(s.lateralForce, s.yawRate * forward, 7, dt);
    s.slip = clamp(
      (Math.abs(requestedYaw - s.yawRate) * absSpeed) / 35 + Math.abs(lateral) * 0.1,
      0,
      1,
    );
    const fx = Math.sin(s.heading),
      fz = Math.cos(s.heading);
    s.vx = fx * forward + fz * lateral;
    s.vz = fz * forward - fx * lateral;
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    const contact = this.circuit.nearest(s.x, s.z, s.contactIndex);
    s.contactIndex = contact.index;
    s.offroad = Math.abs(contact.offset) > TRACK.width / 2 + 0.3;
    s.impact *= Math.exp(-9 * dt);
    // Project the complete oriented footprint onto the barrier normal. A width-only
    // margin lets the nose clip through a wall during a head-on impact.
    const normalExtent =
      Math.abs(contact.nx * fx + contact.nz * fz) * V.halfLength +
      Math.abs(contact.nx * fz - contact.nz * fx) * V.halfWidth;
    const limit = TRACK.width / 2 + TRACK.runoff - 0.05 - normalExtent;
    if (Math.abs(contact.offset) > limit) {
      const side = Math.sign(contact.offset);
      const nx = contact.nx * side,
        nz = contact.nz * side;
      s.x = contact.x + nx * limit;
      s.z = contact.z + nz * limit;
      const normalVelocity = s.vx * nx + s.vz * nz;
      if (normalVelocity > 0) {
        s.vx -= nx * normalVelocity * 1.12;
        s.vz -= nz * normalVelocity * 1.12;
        const friction = 1 - clamp(normalVelocity / 100, 0.015, 0.2);
        s.vx *= friction;
        s.vz *= friction;
        s.impact = clamp(normalVelocity / 15, 0, 1);
        s.yawRate *= 0.65;
      }
    }
    s.speed = s.vx * Math.sin(s.heading) + s.vz * Math.cos(s.heading);
    wearTyres(s, Math.hypot(s.vx, s.vz) * dt, this.circuit.length);
  }
}
