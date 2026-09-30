import { NET, type ClientMessage, type RoomView, type ServerMessage, type Snapshot } from './protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';
interface Credentials { code: string; token: string }
interface Callbacks {
  room(room: RoomView): void; snapshot(snapshot: Snapshot): void;
  status(status: ConnectionStatus): void; error(message: string, fatal: boolean): void;
}
export class RoomClient {
  room: RoomView | null = null;
  slot = -1;
  playerId = '';
  status: ConnectionStatus = 'offline';
  ping = 0;
  private socket?: WebSocket;
  private credentials: Credentials | null = null;
  private opener?: ClientMessage;
  private active = false;
  private retry = 0;
  private reconnectTimer = 0;
  private heartbeat = 0;
  private lastMessageAt = 0;
  private disconnectedAt = 0;
  private clockOffset = 0;
  private bestRtt = Infinity;
  private generation = 0;
  constructor(private callbacks: Callbacks) {}
  create(name: string) { this.begin({ type: 'create', name, version: NET.version }); }
  join(name: string, code: string) { this.begin({ type: 'join', name, code: code.trim().toUpperCase(), version: NET.version }); }
  restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('slipstream:session') ?? 'null') as Credentials | null;
      if (saved && /^[A-Z2-9]{6}$/.test(saved.code) && /^[a-f0-9]{48}$/.test(saved.token)) {
        this.credentials = saved; this.begin({ type: 'reconnect', ...saved, version: NET.version }, true); return true;
      }
    } catch { /* Reconnecting is optional if storage is disabled. */ }
    return false;
  }
  private begin(message: ClientMessage, restoring = false) {
    if (!restoring) this.leave();
    this.opener = message; this.active = true; this.retry = 0; this.disconnectedAt = Date.now(); this.connect();
  }
  private connect() {
    if (!this.active) return;
    this.setStatus(this.credentials ? 'reconnecting' : 'connecting');
    const generation = ++this.generation;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`); this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.generation) { socket.close(); return; }
      this.lastMessageAt = Date.now();
      this.send(this.credentials ? { type: 'reconnect', ...this.credentials, version: NET.version } : this.opener!);
      this.send({ type: 'ping', sentAt: Date.now() });
      window.clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => {
        if (Date.now() - this.lastMessageAt > 6000) socket.close();
        else this.send({ type: 'ping', sentAt: Date.now() });
      }, 2000);
    };
    socket.onmessage = event => {
      if (generation !== this.generation) return;
      this.lastMessageAt = Date.now();
      let message: ServerMessage;
      try { message = JSON.parse(event.data) as ServerMessage; } catch { return; }
      switch (message.type) {
        case 'joined':
          this.credentials = { code: message.room.code, token: message.token };
          try { sessionStorage.setItem('slipstream:session', JSON.stringify(this.credentials)); } catch { /* Memory reconnect remains available. */ }
          this.slot = message.slot; this.playerId = message.playerId;
          this.clockOffset = message.serverTime - Date.now(); this.bestRtt = Infinity;
          this.retry = 0; this.setStatus('online'); this.acceptRoom(message.room); break;
        case 'room': this.acceptRoom(message.room); break;
        case 'snapshot': this.callbacks.snapshot(message); break;
        case 'pong': {
          const rtt = Date.now() - message.sentAt; this.ping = Math.round(rtt);
          if (rtt <= this.bestRtt + 20) { this.bestRtt = Math.min(this.bestRtt, rtt); this.clockOffset = message.serverTime + rtt / 2 - Date.now(); }
          break;
        }
        case 'error':
          if (message.fatal || !this.room) { this.leave(); this.callbacks.error(message.message, true); }
          else this.callbacks.error(message.message, false);
          break;
        case 'shutdown': this.leave(); this.callbacks.error(message.message, true); break;
      }
    };
    socket.onerror = () => { /* close schedules bounded, exponential reconnects. */ };
    socket.onclose = () => {
      if (generation !== this.generation || !this.active) return;
      window.clearInterval(this.heartbeat);
      if (this.status === 'online') this.disconnectedAt = Date.now();
      this.setStatus(this.credentials ? 'reconnecting' : 'connecting');
      const limit = this.credentials ? NET.reconnectMs : 20000;
      if (Date.now() - this.disconnectedAt > limit) {
        this.leave(); this.callbacks.error('Could not reconnect. Your car is in AI hands. Try joining again.', true); return;
      }
      this.reconnectTimer = window.setTimeout(() => this.connect(), Math.min(4000, 500 * 2 ** this.retry++));
    };
  }
  private acceptRoom(room: RoomView) { this.room = room; this.callbacks.room(room); }
  private setStatus(status: ConnectionStatus) { this.status = status; this.callbacks.status(status); }
  serverNow() { return Date.now() + this.clockOffset; }
  send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536) this.socket.send(JSON.stringify(message));
  }
  leave() {
    this.active = false; this.generation++;
    window.clearTimeout(this.reconnectTimer); window.clearInterval(this.heartbeat);
    this.send({ type: 'leave' }); this.socket?.close(); this.socket = undefined;
    this.room = null; this.credentials = null; this.slot = -1; this.playerId = '';
    try { sessionStorage.removeItem('slipstream:session'); } catch { /* Storage is optional. */ }
    this.setStatus('offline');
  }
  dispose() { this.leave(); }
}
