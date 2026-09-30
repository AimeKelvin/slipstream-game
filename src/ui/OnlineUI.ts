import type { Mode } from './UI';
import { TEAMS, type RoomView, type Snapshot } from '../network/protocol';
import type { ConnectionStatus } from '../network/RoomClient';

export interface OnlineActions {
  create(name: string): void; join(name: string, code: string): void; back(): void;
  ready(value: boolean): void; start(): void; rematch(): void; leave(): void;
}
export function formatTime(seconds: number | null) {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
}
export class OnlineUI {
  private root: HTMLDivElement;
  private room: RoomView | null = null;
  private slot = -1;
  private ready = false;
  private mode: Mode = 'title';
  private status: ConnectionStatus = 'offline';
  private lastRanking = '';
  constructor(parent: HTMLElement, actions: OnlineActions) {
    this.root = document.createElement('div'); this.root.className = 'online-ui'; parent.append(this.root);
    this.root.innerHTML = `
      <section id="online-menu" class="online-screen screen" hidden>
        <div class="online-panel"><p class="eyebrow">BETTER IN GOOD COMPANY</p><h2>Bring your rivals.</h2><p class="online-intro">A private grid for up to five friends.<br>AI fills the remaining seats. Three laps. All to play for.</p>
          <label class="field-label" for="driver-name">YOUR DRIVER NAME</label><input id="driver-name" maxlength="20" autocomplete="nickname" placeholder="Enter your name" value="Driver" />
          <button id="create-room" class="primary">CREATE PRIVATE ROOM <span>↗</span></button>
          <div class="join-divider"><span>OR JOIN YOUR FRIENDS</span></div>
          <form id="join-form" class="join-form"><input id="room-code" maxlength="6" pattern="[A-Za-z2-9]{6}" aria-label="Room code" autocomplete="off" placeholder="ROOM CODE" required/><button id="join-room" type="submit">JOIN →</button></form>
          <p id="online-status" role="status" class="online-status">No account needed. Just a name and a room code.</p><button id="online-back" class="text-button">← BACK TO THE COAST</button>
        </div>
      </section>
      <section id="lobby-screen" class="online-screen screen" hidden>
        <div class="lobby-panel"><div class="lobby-heading"><div><p class="eyebrow">PRIVATE GRAND PRIX</p><h2>Your starting six.</h2></div><span class="circuit-pill">CALA SOLA<br><b>3 LAPS</b></span></div>
          <div class="invite-bar"><div><span>ROOM CODE</span><strong id="lobby-code"></strong></div><button id="copy-invite" class="text-button">COPY INVITE ↗</button></div><input id="invite-link" aria-label="Invite link" readonly/><p id="invite-status" class="invite-status">Send the link to your friends, then get ready.</p>
          <div id="seat-list" class="seat-list"></div><p id="lobby-note" class="lobby-note"></p><div class="lobby-buttons"><button id="ready-button" class="primary">I'M READY <span>✓</span></button><button id="start-race" class="secondary">START RACE →</button></div><button id="leave-lobby" class="text-button">LEAVE ROOM</button>
        </div>
      </section>
      <div id="race-overlay" class="race-overlay" hidden>
        <div class="race-stats"><div><span>POSITION</span><strong id="race-position">1 <small>/ 6</small></strong></div><div><span>LAP</span><strong id="race-lap">1 <small>/ 3</small></strong></div></div>
        <div class="lap-times"><span>CURRENT LAP <b id="lap-time">0:00.000</b></span><span>BEST LAP <b id="best-lap">—</b></span></div>
        <ol id="race-order" class="race-order"></ol><div id="start-countdown" class="start-countdown"><div class="start-lights">${'<i></i>'.repeat(5)}</div><strong id="countdown-label">GET READY</strong></div>
        <div id="finish-banner" class="finish-banner" hidden></div><span id="network-ping" class="network-ping"></span>
      </div>
      <section id="results-screen" class="online-screen screen" hidden>
        <div class="results-panel"><p class="eyebrow">CALA SOLA / PRIVATE GRAND PRIX</p><h2>Across the line.</h2><p id="result-summary" class="online-intro"></p><div class="result-header"><span>DRIVER</span><span>RACE TIME</span><span>BEST LAP</span></div><div id="result-list"></div><div class="lobby-buttons"><button id="rematch" class="primary">RUN IT BACK <span>↗</span></button><button id="leave-results" class="secondary">LEAVE ROOM</button></div><p id="rematch-note" class="lobby-note"></p></div>
      </section>
      <div id="connection-banner" class="connection-banner" role="status" hidden></div>`;
    const get = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    const nameInput = get<HTMLInputElement>('driver-name');
    try { nameInput.value = localStorage.getItem('slipstream:name') ?? 'Driver'; } catch { /* Optional preference. */ }
    const name = () => {
      const value = nameInput.value.trim();
      if (!value) { get('online-status').textContent = 'Choose a driver name first.'; nameInput.focus(); return null; }
      try { localStorage.setItem('slipstream:name', value); } catch { /* Optional preference. */ }
      return value;
    };
    get('create-room').onclick = () => { const value = name(); if (value) actions.create(value); };
    get('join-form').onsubmit = event => { event.preventDefault(); const value = name(); if (value) actions.join(value, get<HTMLInputElement>('room-code').value); };
    get('online-back').onclick = actions.back;
    get('ready-button').onclick = () => actions.ready(!this.ready);
    get('start-race').onclick = actions.start; get('leave-lobby').onclick = actions.leave;
    get('leave-results').onclick = actions.leave; get('rematch').onclick = actions.rematch;
    get('copy-invite').onclick = async () => {
      const input = get<HTMLInputElement>('invite-link');
      try { await navigator.clipboard.writeText(input.value); get('invite-status').textContent = 'Invite link copied. Send it to your friends.'; }
      catch { input.select(); get('invite-status').textContent = 'Link selected. Copy it with Ctrl+C or ⌘C.'; }
    };
    const invite = new URL(location.href).searchParams.get('room');
    if (invite && /^[A-Z2-9]{6}$/i.test(invite)) get<HTMLInputElement>('room-code').value = invite.toUpperCase();
  }
  show(mode: Mode) {
    this.mode = mode;
    for (const [id, visible] of [['online-menu', mode === 'online'], ['lobby-screen', mode === 'lobby'], ['race-overlay', mode === 'racing'], ['results-screen', mode === 'results']] as const) this.get(id).hidden = !visible;
    this.connection(this.status);
  }
  private get(id: string) { return this.root.querySelector<HTMLElement>(`#${id}`)!; }
  connection(status: ConnectionStatus) {
    this.status = status;
    const busy = status === 'connecting' || status === 'reconnecting';
    for (const id of ['create-room', 'join-room']) (this.get(id) as HTMLButtonElement).disabled = busy;
    if (busy) this.get('online-status').textContent = status === 'connecting' ? 'Connecting to the race server…' : 'Reconnecting to your car…';
    const banner = this.get('connection-banner'); banner.hidden = !busy || this.mode === 'title';
    banner.textContent = status === 'reconnecting' ? 'RECONNECTING · AI IS KEEPING YOUR CAR IN THE RACE' : 'CONNECTING TO THE RACE SERVER…';
  }
  error(message: string) { this.get('online-status').textContent = message; this.get('lobby-note').textContent = message; }
  updateRoom(room: RoomView, playerId: string, slot: number) {
    this.room = room; this.slot = slot;
    const owner = room.ownerId === playerId;
    const self = room.seats.find(s => s.playerId === playerId); this.ready = self?.ready ?? false;
    this.get('lobby-code').textContent = room.code;
    (this.get('invite-link') as HTMLInputElement).value = `${location.origin}/?room=${room.code}`;
    const list = this.get('seat-list'); list.replaceChildren();
    for (const seat of room.seats) {
      const row = document.createElement('div'); row.className = `seat-row${seat.playerId === playerId ? ' is-you' : ''}`;
      row.style.setProperty('--team-color', TEAMS[seat.slot].color);
      row.innerHTML = '<span class="seat-number"></span><div class="seat-driver"><strong></strong><span></span></div><span class="seat-state"></span>';
      row.querySelector('.seat-number')!.textContent = TEAMS[seat.slot].number;
      row.querySelector('.seat-driver strong')!.textContent = seat.name + (seat.playerId === playerId ? ' · YOU' : '');
      row.querySelector('.seat-driver span')!.textContent = `${TEAMS[seat.slot].name.toUpperCase()}${seat.playerId === room.ownerId ? ' / HOST' : ''}`;
      row.querySelector('.seat-state')!.textContent = seat.playerId === null ? 'AI DRIVER' : !seat.connected ? 'RECONNECTING' : seat.ready ? 'READY ✓' : 'NOT READY';
      if (seat.ready) row.classList.add('is-ready'); list.append(row);
    }
    this.get('ready-button').innerHTML = this.ready ? 'READY ✓ <span>↗</span>' : "I'M READY <span>✓</span>";
    const allReady = room.seats.filter(s => s.connected).every(s => s.ready);
    (this.get('start-race') as HTMLButtonElement).disabled = !owner || !allReady;
    this.get('start-race').textContent = owner ? 'START RACE →' : 'HOST STARTS THE RACE';
    const humans = room.seats.filter(s => s.connected).length;
    this.get('lobby-note').textContent = `${humans}/5 friends · ${6 - humans} AI drivers. ${allReady ? 'The grid is ready.' : 'Everyone must be ready before the host starts.'}`;
    (this.get('rematch') as HTMLButtonElement).disabled = !owner;
    this.get('rematch-note').textContent = owner ? 'Rematch returns everyone to the lobby.' : 'Waiting for the host to open a rematch.';
  }
  updateRace(snapshot: Snapshot, now: number, ping: number) {
    if (!this.room) return;
    const own = snapshot.racers[this.slot]; if (!own) return;
    this.get('race-position').innerHTML = `${own.position} <small>/ 6</small>`;
    this.get('race-lap').innerHTML = `${own.lap} <small>/ ${this.room.laps}</small>`;
    this.get('lap-time').textContent = formatTime(own.lapTime); this.get('best-lap').textContent = formatTime(own.bestLap);
    this.get('network-ping').textContent = `${this.room.code} · ${ping} MS`;
    const remaining = this.room.startAt - now;
    const countdown = this.get('start-countdown'); countdown.hidden = !((snapshot.phase === 'countdown') || (snapshot.phase === 'racing' && snapshot.elapsed < 1));
    const go = snapshot.phase === 'racing'; countdown.classList.toggle('go', go);
    this.get('countdown-label').textContent = go ? 'GO' : 'GET READY';
    countdown.querySelectorAll('i').forEach((light, i) => light.classList.toggle('on', !go && remaining < 5000 - i * 1000));
    const finish = this.get('finish-banner'); finish.hidden = own.finishTime === null;
    finish.textContent = `FINISHED · P${own.position} · ${formatTime(own.finishTime)} — WAITING FOR THE FIELD`;
    const ranking = [...snapshot.racers].sort((a, b) => a.position - b.position);
    const signature = ranking.map(r => `${r.slot}:${r.control}:${r.finishTime}`).join('|') + this.room.seats.map(s => s.name).join('|');
    if (signature !== this.lastRanking) {
      this.lastRanking = signature; this.get('race-order').replaceChildren();
      for (const car of ranking) {
        const row = document.createElement('li'); row.style.setProperty('--team-color', TEAMS[car.slot].color);
        row.classList.toggle('is-you', car.slot === this.slot);
        const name = document.createElement('span'); name.textContent = this.room.seats[car.slot].name;
        const place = document.createElement('b'); place.textContent = String(car.position);
        const tag = document.createElement('small'); tag.textContent = car.control === 'human' ? '' : car.control === 'ai' ? 'AI' : 'AUTO';
        row.append(place, name, tag); this.get('race-order').append(row);
      }
    }
    if (snapshot.phase === 'results') this.results(snapshot);
  }
  private results(snapshot: Snapshot) {
    const own = snapshot.racers[this.slot];
    this.get('result-summary').textContent = own.finishTime === null ? `P${own.position} · Time limit reached. The coast will be here for another run.` : `P${own.position} · ${formatTime(own.finishTime)}. Same time, same coast?`;
    const list = this.get('result-list'); list.replaceChildren();
    for (const car of [...snapshot.racers].sort((a, b) => a.position - b.position)) {
      const row = document.createElement('div'); row.className = 'result-row'; row.style.setProperty('--team-color', TEAMS[car.slot].color);
      if (car.slot === this.slot) row.classList.add('is-you');
      const driver = document.createElement('strong'); driver.textContent = `${car.position}. ${this.room!.seats[car.slot].name}${car.slot === this.slot ? ' · YOU' : ''}`;
      const time = document.createElement('span'); time.textContent = car.finishTime === null ? 'DNF' : formatTime(car.finishTime);
      const best = document.createElement('span'); best.textContent = formatTime(car.bestLap);
      row.append(driver, time, best); list.append(row);
    }
  }
}
