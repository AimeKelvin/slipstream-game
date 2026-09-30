import { VehiclePhysics, type DriverInput, type VehicleState } from '../vehicle/VehiclePhysics';
import type { Circuit } from '../track/Circuit';
import { angleDelta } from '../core/math';
import { NET, type Snapshot } from './protocol';
import type { RoomClient } from './RoomClient';

interface PendingInput { seq: number; input: DriverInput }
export class RaceSync {
  readonly predicted: VehiclePhysics;
  latest: Snapshot | null = null;
  private buffer: Snapshot[] = [];
  private pending: PendingInput[] = [];
  private sequence = 0;
  private raceId = -1;
  private revision = -1;
  private correction = { x: 0, z: 0, heading: 0 };
  private accumulator = 0;
  private renderStates: VehicleState[];
  constructor(circuit: Circuit, private client: RoomClient) {
    this.predicted = new VehiclePhysics(circuit);
    this.renderStates = Array.from({ length: NET.racers }, () => ({ ...this.predicted.state }));
  }
  accept(snapshot: Snapshot) {
    const own = snapshot.racers[this.client.slot]; if (!own) return;
    const reset = snapshot.raceId !== this.raceId || own.revision !== this.revision;
    if (reset) {
      this.pending = []; this.buffer = []; this.accumulator = 0;
      this.correction = { x: 0, z: 0, heading: 0 };
      this.raceId = snapshot.raceId; this.revision = own.revision;
    }
    this.latest = snapshot; this.buffer.push(snapshot); if (this.buffer.length > 30) this.buffer.shift();
    const before = { ...this.predicted.state };
    Object.assign(this.predicted.state, own.state);
    this.pending = this.pending.filter(p => p.seq > own.ack);
    if (snapshot.phase === 'racing' && own.control === 'human' && own.finishTime === null) {
      for (const p of this.pending) { this.predicted.step(p.input, 1 / 120); this.predicted.step(p.input, 1 / 120); }
    } else this.pending = [];
    if (!reset) {
      const dx = before.x - this.predicted.state.x, dz = before.z - this.predicted.state.z;
      if (Math.hypot(dx, dz) < 12) {
        this.correction.x += dx; this.correction.z += dz;
        this.correction.heading += angleDelta(this.predicted.state.heading, before.heading);
      } else this.correction = { x: 0, z: 0, heading: 0 };
    }
  }
  update(dt: number, input: DriverInput, driving: boolean) {
    if (!this.latest || !this.client.room) return;
    this.accumulator += dt;
    const own = this.latest.racers[this.client.slot];
    while (this.accumulator >= 1 / NET.inputHz) {
      if (this.client.status === 'online' && driving && ['countdown', 'racing'].includes(this.client.room.phase)) {
        const seq = ++this.sequence;
        this.client.send({ type: 'input', seq, input, raceId: this.client.room.raceId });
        if (this.latest.phase === 'racing' && own.control === 'human' && own.finishTime === null) {
          this.pending.push({ seq, input: { ...input } });
          this.predicted.step(input, 1 / 120); this.predicted.step(input, 1 / 120);
        }
      }
      this.accumulator -= 1 / NET.inputHz;
    }
    if (this.pending.length > 150) this.pending.splice(0, this.pending.length - 150);
    const decay = Math.exp(-12 * dt);
    this.correction.x *= decay; this.correction.z *= decay; this.correction.heading *= decay;
    const time = this.client.serverNow() - NET.interpolationMs;
    let a = this.buffer[0], b = this.buffer[this.buffer.length - 1];
    for (let i = 1; i < this.buffer.length; i++) if (this.buffer[i].serverTime >= time) { a = this.buffer[i - 1]; b = this.buffer[i]; break; }
    const alpha = Math.max(0, Math.min(1, (time - a.serverTime) / Math.max(1, b.serverTime - a.serverTime)));
    for (let slot = 0; slot < NET.racers; slot++) {
      const from = a.racers[slot], to = b.racers[slot], out = this.renderStates[slot];
      Object.assign(out, to.state);
      if (from.revision === to.revision) {
        for (const field of ['x', 'z', 'speed', 'steering', 'acceleration', 'lateralForce'] as const) out[field] = from.state[field] + (to.state[field] - from.state[field]) * alpha;
        out.heading = from.state.heading + angleDelta(from.state.heading, to.state.heading) * alpha;
      }
    }
    if (driving && this.client.status === 'online' && own.control === 'human' && own.finishTime === null && this.latest.phase === 'racing') {
      const out = this.renderStates[this.client.slot]; Object.assign(out, this.predicted.state);
      out.x += this.correction.x; out.z += this.correction.z; out.heading += this.correction.heading;
    }
  }
  states() { return this.renderStates; }
  clear() { this.latest = null; this.buffer = []; this.pending = []; this.raceId = -1; this.revision = -1; this.accumulator = 0; }
}
