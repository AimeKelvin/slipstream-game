import type { Circuit } from '../track/Circuit';
import type { VehicleState } from '../vehicle/VehiclePhysics';
import { TRACK } from '../core/config';

export const FINISH_INDEX = TRACK.startIndex + 5;
export class RaceProgress {
  distance: number;
  completedLaps = 0;
  bestLap: number | null = null;
  finishTime: number | null = null;
  private lastLapAt = 0;
  private previousIndex: number;
  private nextGate: number;
  constructor(private circuit: Circuit, gridIndex: number, private laps: number) {
    this.previousIndex = gridIndex;
    this.distance = (gridIndex - FINISH_INDEX) * circuit.length / TRACK.samples;
    this.nextGate = circuit.length / 4;
  }
  update(state: VehicleState, elapsed: number) {
    const delta = (state.contactIndex - this.previousIndex + TRACK.samples * 1.5) % TRACK.samples - TRACK.samples / 2;
    this.previousIndex = state.contactIndex;
    if (this.finishTime !== null) return;
    // Local track contact and bounded progression reject jumps and wrong-way lap farming.
    if (Math.abs(delta) > 5) return;
    this.distance += delta * this.circuit.length / TRACK.samples;
    if (this.distance >= this.nextGate) {
      const gateNumber = Math.round(this.nextGate / (this.circuit.length / 4));
      this.nextGate += this.circuit.length / 4;
      if (gateNumber % 4 === 0) {
        const lap = elapsed - this.lastLapAt;
        this.bestLap = this.bestLap === null ? lap : Math.min(this.bestLap, lap);
        this.lastLapAt = elapsed; this.completedLaps++;
        if (this.completedLaps >= this.laps) this.finishTime = elapsed;
      }
    }
  }
  afterReset(index: number) { this.previousIndex = index; }
  lapTime(elapsed: number) { return this.finishTime === null ? Math.max(0, elapsed - this.lastLapAt) : 0; }
}
