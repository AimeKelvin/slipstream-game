import type { DriverInput, VehicleState } from '../vehicle/VehiclePhysics';

export const NET = {
  version: 1, racers: 6, maxHumans: 5, laps: 3, inputHz: 60, snapshotHz: 20,
  countdownMs: 5000, reconnectMs: 60000, interpolationMs: 100,
} as const;
export const TEAMS = [
  { name: 'Veloce', color: '#d5f06b', number: '07' },
  { name: 'Solstice', color: '#f59966', number: '12' },
  { name: 'Tidal', color: '#70dbe0', number: '24' },
  { name: 'Orchid', color: '#bca0f1', number: '33' },
  { name: 'Rosso', color: '#f2748f', number: '48' },
  { name: 'Alba', color: '#e9e7d4', number: '61' },
] as const;
export type Phase = 'lobby' | 'countdown' | 'racing' | 'results';
export type Control = 'human' | 'ai' | 'reconnecting' | 'autopilot';
export interface SeatView {
  slot: number; playerId: string | null; name: string; connected: boolean; ready: boolean; control: Control;
}
export interface RoomView {
  code: string; phase: Phase; ownerId: string | null; seats: SeatView[];
  raceId: number; laps: number; startAt: number; deadline: number | null;
}
export interface RacerSnapshot {
  slot: number; state: VehicleState; ack: number; revision: number;
  distance: number; lap: number; position: number; lapTime: number;
  bestLap: number | null; finishTime: number | null; control: Control;
}
export interface Snapshot {
  type: 'snapshot'; serverTime: number; raceId: number; phase: Phase;
  elapsed: number; racers: RacerSnapshot[];
}
export type ClientMessage =
  | { type: 'create'; name: string; version: number }
  | { type: 'join'; code: string; name: string; version: number }
  | { type: 'reconnect'; code: string; token: string; version: number }
  | { type: 'ready'; value: boolean }
  | { type: 'start' | 'rematch' | 'leave' | 'reset' }
  | { type: 'away'; value: boolean }
  | { type: 'input'; seq: number; input: DriverInput; raceId: number }
  | { type: 'ping'; sentAt: number };
export type ServerMessage =
  | { type: 'joined'; playerId: string; token: string; slot: number; room: RoomView; serverTime: number }
  | { type: 'room'; room: RoomView }
  | Snapshot
  | { type: 'pong'; sentAt: number; serverTime: number }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'shutdown'; message: string };
export const NEUTRAL: DriverInput = { throttle: 0, brake: 0, steer: 0 };

/** The server never accepts transforms, elapsed times, laps or results from clients. */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const m = JSON.parse(data) as Record<string, unknown>;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return null;
    const name = () => typeof m.name === 'string' && m.name.trim().length >= 1 && m.name.length <= 20;
    const code = () => typeof m.code === 'string' && /^[A-Z2-9]{6}$/.test(m.code);
    const version = () => m.version === NET.version;
    switch (m.type) {
      case 'create': return name() && version() ? m as unknown as ClientMessage : null;
      case 'join': return name() && code() && version() ? m as unknown as ClientMessage : null;
      case 'reconnect': return code() && version() && typeof m.token === 'string' && /^[a-f0-9]{48}$/.test(m.token) ? m as unknown as ClientMessage : null;
      case 'ready': case 'away': return typeof m.value === 'boolean' ? m as unknown as ClientMessage : null;
      case 'start': case 'rematch': case 'leave': case 'reset': return { type: m.type };
      case 'ping': return typeof m.sentAt === 'number' && Number.isFinite(m.sentAt) ? { type: 'ping', sentAt: m.sentAt } : null;
      case 'input': {
        const i = m.input as DriverInput | undefined;
        if (!i || !Number.isSafeInteger(m.seq) || (m.seq as number) < 0 || !Number.isSafeInteger(m.raceId)) return null;
        if (![i.throttle, i.brake, i.steer].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
        if (i.throttle < 0 || i.throttle > 1 || i.brake < 0 || i.brake > 1 || Math.abs(i.steer) > 1) return null;
        return { type: 'input', seq: m.seq as number, raceId: m.raceId as number, input: { throttle: i.throttle, brake: i.brake, steer: i.steer } };
      }
      default: return null;
    }
  } catch { return null; }
}
