import { clamp } from '../core/math';
import type { VehicleState } from '../vehicle/VehiclePhysics';

/** Fresh tyres stay forgiving; the final half of a stint progressively understeers. */
export function tyreGrip(condition: number) {
  return 0.52 + 0.48 * Math.sqrt(clamp(condition / 0.7, 0, 1));
}
export function wearTyres(state: VehicleState, distance: number, circuitLength: number) {
  const load =
    1 + state.slip * 0.65 + Math.abs(state.lateralForce) / 90 + (state.offroad ? 0.35 : 0);
  state.tyres = clamp(state.tyres - (distance * load) / (circuitLength * 2.65), 0, 1);
}
