import type { Circuit } from './Circuit';
import { clamp } from '../core/math';

export const PIT = {
  entryIndex: 10,
  exitIndex: 164,
  laneOffset: 18,
  boxOffset: 25,
  limit: 80 / 3.6,
  perfectSeconds: 2.4,
  goodSeconds: 3.3,
  missedSeconds: 4.5,
} as const;
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pit geometry and distance markers are shared by the road, crew, UI and simulation. */
export class PitLane {
  readonly spacing: number;
  readonly length: number;
  constructor(private circuit: Circuit) {
    this.spacing = circuit.length / circuit.samples.length;
    this.length = (PIT.exitIndex - PIT.entryIndex) * this.spacing;
  }
  boxDistance(slot: number) {
    return 85 + slot * 20;
  }
  indexAt(distance: number) {
    return PIT.entryIndex + Math.floor(distance / this.spacing);
  }
  distanceToEntry(index: number) {
    return (
      ((PIT.entryIndex - index + this.circuit.samples.length) % this.circuit.samples.length) *
      this.spacing
    );
  }
  frame(distance: number) {
    const index = PIT.entryIndex + clamp(distance, 0, this.length) / this.spacing;
    const a = this.circuit.at(Math.floor(index)),
      b = this.circuit.at(Math.floor(index) + 1),
      t = index % 1;
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      nx: a.nx,
      nz: a.nz,
      tx: a.tx,
      tz: a.tz,
    };
  }
  offset(distance: number, slot = -1, entryOffset = 0) {
    const entry = smooth(distance / 55),
      exit = smooth((this.length - distance) / 50);
    const box =
      slot < 0
        ? 0
        : smooth((distance - this.boxDistance(slot) + 30) / 20) *
          smooth((this.boxDistance(slot) + 32 - distance) / 20);
    return (
      (PIT.laneOffset + box * (PIT.boxOffset - PIT.laneOffset)) * entry * exit +
      entryOffset * (1 - entry)
    );
  }
  point(distance: number, slot = -1, entryOffset = 0) {
    const p = this.frame(distance),
      offset = this.offset(distance, slot, entryOffset);
    return { x: p.x + p.nx * offset, z: p.z + p.nz * offset };
  }
  box(slot: number) {
    const p = this.frame(this.boxDistance(slot));
    return {
      ...p,
      x: p.x + p.nx * PIT.boxOffset,
      z: p.z + p.nz * PIT.boxOffset,
      heading: Math.atan2(p.tx, p.tz),
    };
  }
}
