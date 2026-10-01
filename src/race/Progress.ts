import type { Circuit } from '../track/Circuit';
import type { VehicleState } from '../vehicle/VehiclePhysics';
import { TRACK } from '../core/config';

export const FINISH_INDEX = TRACK.startIndex + 5;
export class RaceProgress {
  distance: number;
  completedLaps = 0;
  lastLap: number | null = null;
  lapValid = true;
  sector = 1;
  bestLap: number | null = null;
  finishTime: number | null = null;
  private lastLapAt = 0;
  private previousIndex: number;
  private nextGate: number;
  constructor(
    private circuit: Circuit,
    gridIndex: number,
    private laps: number,
  ) {
    this.previousIndex = gridIndex;
    this.distance = ((gridIndex - FINISH_INDEX) * circuit.length) / TRACK.samples;
    this.nextGate = circuit.length / 3;
  }
  update(state: VehicleState, elapsed: number) {
    const delta =
      ((state.contactIndex - this.previousIndex + TRACK.samples * 1.5) % TRACK.samples) -
      TRACK.samples / 2;
    this.previousIndex = state.contactIndex;
    if (this.finishTime !== null) return;
    // Local track contact and bounded progression reject jumps and wrong-way lap farming.
    if (Math.abs(delta) > 5) {
      this.lapValid = false;
      return;
    }
    if (state.offroad && !state.pitPhase) this.lapValid = false;
    this.distance += (delta * this.circuit.length) / TRACK.samples;
    if (this.distance + 1e-6 >= this.nextGate) {
      const gateNumber = Math.round(this.nextGate / (this.circuit.length / 3));
      this.nextGate += this.circuit.length / 3;
      this.sector = (gateNumber % 3) + 1;
      if (gateNumber % 3 === 0) {
        const lap = elapsed - this.lastLapAt;
        this.lastLap = lap;
        if (this.lapValid) this.bestLap = this.bestLap === null ? lap : Math.min(this.bestLap, lap);
        this.lapValid = true;
        this.lastLapAt = elapsed;
        this.completedLaps++;
        if (this.completedLaps >= this.laps) this.finishTime = elapsed;
      }
    }
  }
  afterReset(index: number) {
    this.previousIndex = index;
    this.lapValid = false;
  }
  lapTime(elapsed: number) {
    return this.finishTime === null ? Math.max(0, elapsed - this.lastLapAt) : 0;
  }
}
