import type { Circuit } from '../track/Circuit';
import type { DriverInput, VehicleState } from '../vehicle/VehiclePhysics';
import { PIT } from '../track/PitLane';
import { angleDelta, clamp, damp } from '../core/math';

export const freshPitState = () => ({
  tyres: 1,
  pitRequested: false,
  pitPhase: 0,
  pitDistance: 0,
  pitStopTime: 0,
  pitStopDuration: 0,
  pitRating: 0,
  pitStops: 0,
  pitHold: 0,
  pitEntryOffset: 0,
});
export function stopRating(error: number) {
  return Math.abs(error) <= 1.1 ? 1 : Math.abs(error) <= 3.3 ? 2 : 3;
}
export function stopDuration(rating: number) {
  return rating === 1 ? PIT.perfectSeconds : rating === 2 ? PIT.goodSeconds : PIT.missedSeconds;
}

/** Guided steering and a speed limiter leave the driver a readable braking challenge. */
export function stepPit(
  s: VehicleState,
  input: DriverInput,
  dt: number,
  circuit: Circuit,
): boolean {
  const pit = circuit.pit;
  if (!s.pitPhase) {
    if (
      !s.pitRequested ||
      s.speed < 0 ||
      s.contactIndex < PIT.entryIndex ||
      s.contactIndex > PIT.entryIndex + 3
    )
      return false;
    s.pitPhase = 1;
    s.pitRequested = false;
    s.pitRating = 0;
    s.pitHold = 0;
    s.pitDistance = (s.contactIndex - PIT.entryIndex) * pit.spacing;
    s.pitEntryOffset = circuit.nearest(s.x, s.z, s.contactIndex).offset;
  }
  const oldSpeed = s.speed;
  if (s.pitPhase === 2) {
    s.pitStopTime = Math.max(0, s.pitStopTime - dt);
    s.speed = s.vx = s.vz = s.acceleration = 0;
    if (s.pitStopTime <= 0) {
      s.tyres = 1;
      s.pitStops++;
      s.pitPhase = 3;
    }
    return true;
  }
  const target = pit.boxDistance(s.pitSlot);
  const missed = s.pitPhase === 1 && s.pitDistance > target + 6;
  const brake = missed ? 1 : clamp(input.brake, 0, 1);
  const throttle = missed ? 0 : clamp(input.throttle, 0, 1);
  const force = throttle * 12 - brake * 24 - 0.3;
  // The limiter eases down to 80 km/h during entry rather than snapping velocity.
  const limit = Math.max(PIT.limit, oldSpeed - 28 * dt);
  s.speed = clamp(oldSpeed + force * dt, 0, limit);
  s.pitDistance = Math.min(pit.length, s.pitDistance + s.speed * dt);
  const point = pit.point(s.pitDistance, s.pitSlot, s.pitEntryOffset);
  const ahead = pit.point(Math.min(pit.length, s.pitDistance + 0.5), s.pitSlot, s.pitEntryOffset);
  const p = pit.frame(s.pitDistance);
  const heading =
    s.pitDistance >= pit.length - 0.5
      ? Math.atan2(p.tx, p.tz)
      : Math.atan2(ahead.x - point.x, ahead.z - point.z);
  s.yawRate = angleDelta(s.heading, heading) / dt;
  s.heading = heading;
  s.x = point.x;
  s.z = point.z;
  s.vx = Math.sin(heading) * s.speed;
  s.vz = Math.cos(heading) * s.speed;
  s.acceleration = damp(s.acceleration, (s.speed - oldSpeed) / dt, 7, dt);
  s.steering = damp(s.steering, s.yawRate * 0.1, 8, dt);
  s.lateralForce = s.yawRate * s.speed;
  s.slip = 0;
  s.offroad = false;
  s.impact = 0;
  s.contactIndex = pit.indexAt(s.pitDistance);
  if (s.pitPhase === 1) {
    const error = s.pitDistance - target;
    s.pitHold =
      s.speed < 0.65 && (brake > 0.1 || missed) && (Math.abs(error) <= 18 || missed)
        ? s.pitHold + dt
        : 0;
    if (s.pitHold >= 0.15) {
      s.pitRating = stopRating(error);
      s.pitStopDuration = stopDuration(s.pitRating);
      s.pitStopTime = s.pitStopDuration;
      s.pitPhase = 2;
      s.speed = s.vx = s.vz = 0;
    }
  }
  if (s.pitDistance >= pit.length) {
    s.pitPhase = 0;
    s.pitRequested = false;
  }
  return true;
}

export function pitDriverInput(s: VehicleState, circuit: Circuit): DriverInput {
  const remaining = circuit.pit.boxDistance(s.pitSlot) - s.pitDistance;
  const target =
    s.pitPhase === 1
      ? Math.min(PIT.limit, Math.sqrt(Math.max(0, remaining - 0.1) * 2 * 19))
      : PIT.limit;
  return {
    throttle: s.speed < target - 0.3 ? 1 : 0,
    brake: s.speed > target || (remaining < 0.5 && s.pitPhase === 1) ? 1 : 0,
    steer: 0,
  };
}
