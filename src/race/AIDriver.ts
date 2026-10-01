import type { Circuit } from '../track/Circuit';
import type { DriverInput, VehicleState } from '../vehicle/VehiclePhysics';
import { angleDelta, clamp, damp } from '../core/math';
import { pitDriverInput } from './PitStop';
import { tyreGrip } from './Tyres';
import { VEHICLE } from '../core/config';

/** Curvature-limited racing line with look-ahead braking and a modest passing offset. */
export class AIDriver {
  private lane = 0;
  private stuck = 0;
  readonly input: DriverInput = { throttle: 0, brake: 0, steer: 0 };
  constructor(private circuit: Circuit, private slot: number) {}
  update(s: VehicleState, others: VehicleState[], dt: number): DriverInput {
    if (s.pitPhase) { this.stuck = 0; return pitDriverInput(s, this.circuit); }
    if (s.tyres < 0.64 && s.pitStops === 0) s.pitRequested = true;
    const grip = tyreGrip(s.tyres);
    const spacing = this.circuit.length / this.circuit.samples.length;
    const skill = 0.88 + (this.slot % 4) * 0.035;
    let targetSpeed = 54 * skill * Math.sqrt(grip);
    for (let ahead = 5; ahead < 90; ahead += 7) {
      const index = s.contactIndex + Math.round(ahead / spacing);
      const a = this.circuit.at(index - 3), b = this.circuit.at(index + 3);
      const curvature = Math.abs(angleDelta(Math.atan2(a.tx, a.tz), Math.atan2(b.tx, b.tz))) / (6 * spacing);
      const cornerSpeed = Math.sqrt(15 * skill * grip / Math.max(curvature, 0.001));
      targetSpeed = Math.min(targetSpeed, Math.sqrt(cornerSpeed ** 2 + 2 * 13 * Math.max(0, ahead - 8)));
    }
    let desiredLane = ((this.slot % 3) - 1) * 0.55;
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    for (const other of others) {
      if (other === s) continue;
      const dx = other.x - s.x, dz = other.z - s.z;
      const forward = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (forward > 0 && forward < 22 && Math.abs(side) < 3.5) {
        desiredLane = side > 0 ? -2.6 : 2.6;
        if (forward < 9 && Math.abs(side) < 2.4) targetSpeed = Math.min(targetSpeed, Math.max(8, other.speed - 2));
      }
    }
    this.lane = damp(this.lane, desiredLane, 1.7, dt);
    const lookDistance = 8 + Math.max(0, s.speed) * 0.43;
    const target = this.circuit.at(s.contactIndex + Math.round(lookDistance / spacing));
    const dx = target.x + target.nx * this.lane - s.x, dz = target.z + target.nz * this.lane - s.z;
    const error = angleDelta(s.heading, Math.atan2(dx, dz));
    const steeringAngle = Math.atan2(2 * VEHICLE.wheelbase * Math.sin(error), Math.hypot(dx, dz));
    const maxAngle = 0.49 / (1 + Math.abs(s.speed) * 0.025);
    if (Math.abs(error) > 0.55) targetSpeed = Math.min(targetSpeed, 14);
    if (s.offroad) targetSpeed = Math.min(targetSpeed, 13);
    this.input.steer = clamp(-steeringAngle / maxAngle, -1, 1);
    this.input.throttle = clamp((targetSpeed - s.speed) * 0.32, 0, 1);
    this.input.brake = clamp((s.speed - targetSpeed) * 0.17, 0, 0.8);
    this.stuck = Math.abs(s.speed) < 2 ? this.stuck + dt : 0;
    return this.input;
  }
  needsRecovery() { if (this.stuck < 4) return false; this.stuck = 0; return true; }
}
