import { randomBytes, randomUUID } from 'node:crypto';
import { Circuit } from '../src/track/Circuit';
import { VehiclePhysics, type DriverInput } from '../src/vehicle/VehiclePhysics';
import { AIDriver } from '../src/race/AIDriver';
import { FINISH_INDEX, RaceProgress } from '../src/race/Progress';
import { resolveCarContacts } from '../src/race/collisions';
import { NET, NEUTRAL, TEAMS, type Control, type Phase, type RoomView, type Snapshot } from '../src/network/protocol';

export interface Player {
  id: string; token: string; slot: number; name: string; connected: boolean;
  ready: boolean; away: boolean; disconnectedAt: number; lastInputAt: number;
  seq: number; ack: number; input: DriverInput; lastResetAt: number;
}
export interface RaceOptions { laps: number; countdownMs: number; timeLimitMs: number; finishWindowMs: number }
const DEFAULT_OPTIONS: RaceOptions = { laps: NET.laps, countdownMs: NET.countdownMs, timeLimitMs: 900000, finishWindowMs: 75000 };
const sharedCircuit = new Circuit();

export class Room {
  readonly players = new Map<string, Player>();
  readonly circuit = sharedCircuit;
  readonly cars = Array.from({ length: NET.racers }, () => new VehiclePhysics(this.circuit));
  readonly ai = Array.from({ length: NET.racers }, (_, i) => new AIDriver(this.circuit, i));
  progress: RaceProgress[] = [];
  revisions = Array<number>(NET.racers).fill(0);
  phase: Phase = 'lobby';
  ownerId: string | null = null;
  raceId = 0;
  startAt = 0;
  deadline: number | null = null;
  elapsed = 0;
  lastOccupiedAt: number;
  dirty = true;
  readonly options: RaceOptions;
  constructor(readonly code: string, now: number, options: Partial<RaceOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }; this.lastOccupiedAt = now; this.grid();
  }
  private grid() {
    this.progress = this.cars.map((car, slot) => {
      const index = FINISH_INDEX - 6 - slot * 4;
      car.state.contactIndex = (index + this.circuit.samples.length) % this.circuit.samples.length;
      car.reset(); const p = this.circuit.at(index), lane = slot % 2 ? 2.7 : -2.7;
      car.state.x += p.nx * lane; car.state.z += p.nz * lane;
      this.revisions[slot]++;
      return new RaceProgress(this.circuit, index, this.options.laps);
    });
  }
  addPlayer(name: string, now: number): Player {
    if (this.phase !== 'lobby') throw new Error('This race has started. Join after the host opens a rematch.');
    if (this.players.size >= NET.maxHumans) throw new Error('Room full: five human seats are already reserved.');
    const used = new Set([...this.players.values()].map(p => p.slot));
    const slot = Array.from({ length: NET.maxHumans }, (_, i) => i).find(i => !used.has(i))!;
    const player: Player = { id: randomUUID(), token: randomBytes(24).toString('hex'), slot,
      name: name.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 20) || 'Driver', connected: true,
      ready: false, away: false, disconnectedAt: 0, lastInputAt: now, seq: -1, ack: -1, input: { ...NEUTRAL }, lastResetAt: -Infinity };
    this.players.set(player.id, player); this.ownerId ??= player.id; this.lastOccupiedAt = now; this.dirty = true; return player;
  }
  reconnect(token: string, now: number) {
    const player = [...this.players.values()].find(p => p.token === token);
    if (!player || (!player.connected && now - player.disconnectedAt > NET.reconnectMs)) throw new Error('Reconnect window expired. Join a new room.');
    player.connected = true; player.away = false; player.lastInputAt = now;
    player.input = { ...NEUTRAL }; player.seq = player.ack = -1; this.revisions[player.slot]++;
    this.ownerId ??= player.id; this.lastOccupiedAt = now; this.dirty = true; return player;
  }
  disconnect(id: string, now: number, leave = false) {
    const p = this.players.get(id); if (!p) return;
    p.connected = false; p.ready = false; p.disconnectedAt = now; p.input = { ...NEUTRAL };
    if (leave) this.players.delete(id);
    if (this.ownerId === id) this.ownerId = [...this.players.values()].find(other => other.connected)?.id ?? null;
    this.dirty = true;
  }
  private requireOwner(id: string) { if (id !== this.ownerId) throw new Error('Only the room host can do that.'); }
  ready(id: string, value: boolean) {
    if (this.phase !== 'lobby') throw new Error('Readiness can only change in the lobby.');
    const p = this.players.get(id)!; p.ready = value; this.dirty = true;
  }
  start(id: string, now: number) {
    this.requireOwner(id);
    if (this.phase !== 'lobby') throw new Error('The race is already underway.');
    const connected = [...this.players.values()].filter(p => p.connected);
    if (!connected.length || connected.some(p => !p.ready)) throw new Error('Every connected player needs to be ready first.');
    this.grid(); this.raceId++; this.phase = 'countdown'; this.startAt = now + this.options.countdownMs;
    this.deadline = null; this.elapsed = 0;
    for (const p of this.players.values()) { p.seq = p.ack = -1; p.input = { ...NEUTRAL }; p.away = false; p.lastInputAt = now; }
    this.dirty = true;
  }
  rematch(id: string) {
    this.requireOwner(id);
    if (this.phase !== 'results') throw new Error('Wait for the race results to rematch.');
    this.phase = 'lobby'; this.startAt = 0; this.deadline = null; this.elapsed = 0;
    for (const p of this.players.values()) { p.ready = false; p.away = false; }
    this.grid(); this.dirty = true;
  }
  input(id: string, seq: number, input: DriverInput, raceId: number, now: number) {
    const p = this.players.get(id);
    if (!p || raceId !== this.raceId || seq <= p.seq || (this.phase !== 'racing' && this.phase !== 'countdown')) return;
    p.seq = seq; p.input = input; p.lastInputAt = now;
  }
  away(id: string, value: boolean, now: number) {
    const p = this.players.get(id)!; p.away = value; p.input = { ...NEUTRAL }; p.lastInputAt = now; this.dirty = true;
  }
  reset(id: string, now: number) {
    const p = this.players.get(id)!;
    if (this.phase !== 'racing' || now - p.lastResetAt < 3000 || this.progress[p.slot].finishTime !== null) return;
    this.recover(p.slot); p.lastResetAt = now;
  }
  private recover(slot: number) {
    this.cars[slot].reset(); this.progress[slot].afterReset(this.cars[slot].state.contactIndex); this.revisions[slot]++;
  }
  control(slot: number, now: number): Control {
    const p = [...this.players.values()].find(p => p.slot === slot);
    if (!p) return 'ai'; if (!p.connected) return 'reconnecting';
    return p.away || (this.phase === 'racing' && now - p.lastInputAt > 1500) ? 'autopilot' : 'human';
  }
  tick(dt: number, now: number) {
    for (const p of this.players.values()) {
      if (p.connected) this.lastOccupiedAt = now;
      else if (now - p.disconnectedAt > NET.reconnectMs) { this.players.delete(p.id); this.dirty = true; }
    }
    if (this.phase === 'countdown' && now >= this.startAt) { this.phase = 'racing'; this.dirty = true; }
    if (this.phase !== 'racing') return;
    this.elapsed = Math.max(0, (now - this.startAt) / 1000);
    const states = this.cars.map(c => c.state);
    for (let slot = 0; slot < NET.racers; slot++) {
      const p = [...this.players.values()].find(p => p.slot === slot);
      const bot = this.control(slot, now) !== 'human' || this.progress[slot].finishTime !== null;
      let input = bot ? this.ai[slot].update(states[slot], states, dt) : p!.input;
      if (!bot && now - p!.lastInputAt > 350) input = { throttle: 0, brake: 0.5, steer: 0 };
      if (bot && this.ai[slot].needsRecovery()) this.recover(slot);
      this.cars[slot].step(input, dt);
      if (p) p.ack = p.seq;
    }
    resolveCarContacts(states);
    this.cars.forEach((c, i) => this.progress[i].update(c.state, this.elapsed));
    if (this.deadline === null && this.progress.some(p => p.finishTime !== null)) { this.deadline = now + this.options.finishWindowMs; this.dirty = true; }
    if (this.progress.every(p => p.finishTime !== null) || (this.deadline !== null && now >= this.deadline) || now - this.startAt >= this.options.timeLimitMs) {
      this.phase = 'results'; this.dirty = true;
    }
  }
  view(now: number): RoomView {
    return { code: this.code, phase: this.phase, ownerId: this.ownerId, raceId: this.raceId,
      laps: this.options.laps, startAt: this.startAt, deadline: this.deadline,
      seats: this.cars.map((_, slot) => {
        const p = [...this.players.values()].find(p => p.slot === slot);
        return { slot, playerId: p?.id ?? null, name: p?.name ?? `${TEAMS[slot].name} AI`, connected: p?.connected ?? false,
          ready: p?.ready ?? true, control: this.control(slot, now) };
      }) };
  }
  snapshot(now: number): Snapshot {
    const order = this.progress.map((p, slot) => ({ slot, p })).sort((a, b) => {
      if (a.p.finishTime !== null || b.p.finishTime !== null) return (a.p.finishTime ?? Infinity) - (b.p.finishTime ?? Infinity);
      return b.p.distance - a.p.distance;
    });
    return { type: 'snapshot', serverTime: now, phase: this.phase, raceId: this.raceId, elapsed: this.elapsed,
      racers: this.cars.map((car, slot) => {
        const p = this.progress[slot], player = [...this.players.values()].find(h => h.slot === slot);
        const state = { ...car.state };
        for (const key of Object.keys(state) as (keyof typeof state)[]) {
          if (key !== 'offroad') state[key] = Math.round(state[key] * 10000) / 10000;
        }
        return { slot, state, ack: player?.ack ?? -1, revision: this.revisions[slot], distance: Math.round(p.distance * 100) / 100,
          lap: Math.min(this.options.laps, p.completedLaps + 1), position: order.findIndex(o => o.slot === slot) + 1,
          lapTime: p.lapTime(this.elapsed), bestLap: p.bestLap, finishTime: p.finishTime, control: this.control(slot, now) };
      }) };
  }
}
