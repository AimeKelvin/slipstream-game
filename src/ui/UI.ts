import type { Circuit } from '../track/Circuit';
import type { VehicleState } from '../vehicle/VehiclePhysics';
import { TRACK } from '../core/config';
import type { Quality } from '../core/config';
import { TEAMS, type SeatView } from '../network/protocol';

export type Mode = 'title' | 'driving' | 'paused' | 'online' | 'lobby' | 'racing' | 'results';
export interface UIActions {
  drive(): void;
  online(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  exit(): void;
  quality(value: Quality): void;
  sound(value: boolean): void;
  volume(value: number): void;
}
export class UI {
  readonly canvas: HTMLCanvasElement;
  private speed: HTMLElement;
  private gear: HTMLElement;
  private elapsed: HTMLElement;
  private revs: HTMLElement;
  private surface: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private mapBackground: HTMLCanvasElement;
  private toastTimer = 0;
  private carName = 'VELOCE / 07';
  private colors: string[] = TEAMS.map(team => team.color);
  constructor(
    private root: HTMLElement,
    private circuit: Circuit,
    actions: UIActions,
  ) {
    const mapSvg = this.trackSvg();
    root.innerHTML = `
      <canvas id="game" aria-label="Cala Sola 3D racing circuit"></canvas>
      <div class="vignette" aria-hidden="true"></div>
      <section id="title" class="screen title-screen">
        <header class="topbar"><a class="wordmark" href="/" aria-label="Slipstream home"><span class="speed-mark">///</span> SLIPSTREAM<span class="club">COASTAL MOTOR CLUB</span></a><span class="build-tag"><i></i> FRIENDS. SIX CARS. ONE COAST.</span></header>
        <div class="title-copy"><p class="eyebrow">INDEPENDENT FORMULA RACING</p><h1>CHASE THE<br/><span>HORIZON.</span></h1><p class="intro">A little less ordinary.<br/>Even better with friends.</p><button id="play-online" class="primary">RACE WITH FRIENDS <span>↗</span></button><button id="drive" class="practice-button">SOLO PRACTICE <span>→</span></button><p class="input-note">KEYBOARD + CONTROLLER <span>•</span> UP TO 5 FRIENDS</p></div>
        <div class="circuit-card"><div class="circuit-card-top"><span>THE CIRCUIT</span><span>01 / COASTAL</span></div><div class="circuit-card-body"><div><h2>Cala Sola</h2><p>SEA AIR. LATE APEXES.</p><div class="track-stats"><span>${(circuit.length / 1000).toFixed(2)} <small>KM</small></span><span>22 <small>TURNS</small></span></div></div>${mapSvg}</div></div>
        <footer class="title-footer"><span>A GOOD DAY TO GO FAST.</span><button id="title-settings" class="text-button">SETTINGS <span>↗</span></button><span>ORIGINAL MACHINES. OPEN HORIZONS.</span></footer>
      </section>
      <section id="hud" class="screen hud" hidden>
        <div class="hud-top"><div class="session-label"><span class="speed-mark">///</span><div><strong>CALA SOLA</strong><span>FREE PRACTICE</span></div></div><div class="session-time"><span>SESSION TIME</span><strong id="elapsed">00:00.000</strong></div><button id="pause" class="icon-button" aria-label="Pause driving">Ⅱ</button></div>
        <div class="map-block"><canvas id="minimap" width="260" height="240" aria-label="Circuit map and car position"></canvas><span>THE COAST IS YOURS.</span></div>
        <div class="speedometer"><span id="surface" class="surface">VELOCE / 07</span><div class="speed-row"><div class="gear"><span>GEAR</span><strong id="gear">N</strong></div><strong id="speed">0</strong><span class="speed-unit">KM/H</span></div><div class="rev-track"><div id="revs"></div></div></div>
        <div class="driving-help"><span><kbd>W A S D</kbd> DRIVE</span><span><kbd>R</kbd> RESET</span><span><kbd>P</kbd> PIT CALL</span><span><kbd>C</kbd> CAMERA</span><span><kbd>ESC</kbd> PAUSE</span></div>
      </section>
      <section id="pause-screen" class="screen pause-screen" hidden aria-label="Pause and settings">
        <div class="pause-panel"><p class="eyebrow">TAKE A BREATHER</p><h2 id="pause-title">In the pits.</h2><p class="pause-description">Find your rhythm. Then find a little more.</p><button id="resume" class="primary">BACK ON TRACK <span>↗</span></button><div class="settings"><label>GRAPHICS<select id="quality"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label><label>ENGINE AUDIO<button id="sound" class="toggle" aria-pressed="true">ON</button></label></div><div class="control-guide"><div><kbd>W / ↑</kbd><span>Accelerate</span></div><div><kbd>S / ↓</kbd><span>Brake / reverse</span></div><div><kbd>A D / ← →</kbd><span>Steer</span></div><div><kbd>SPACE</kbd><span>Brake / reverse</span></div><div><kbd>R</kbd><span>Reset to circuit</span></div><div><kbd>C</kbd><span>Camera distance</span></div><div><kbd>P</kbd><span>Call for tyres / cancel</span></div></div><p class="controller-note">Controller: left stick · RT accelerate · LT brake · Y reset · X pit call</p><div class="pause-bottom"><button id="restart" class="text-button">RESTART SESSION</button><button id="exit" class="text-button">BACK TO TITLE ↗</button></div></div>
      </section><div id="toast" role="status"></div>
      <div id="loading"><span class="speed-mark">///</span><p>FINDING THE COAST…</p></div>`;
    const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    this.canvas = get<HTMLCanvasElement>('game');
    this.speed = get('speed');
    this.gear = get('gear');
    this.elapsed = get('elapsed');
    this.revs = get('revs');
    this.surface = get('surface');
    this.mapCanvas = get<HTMLCanvasElement>('minimap');
    this.mapBackground = document.createElement('canvas');
    this.mapBackground.width = 260;
    this.mapBackground.height = 240;
    const ctx = this.mapBackground.getContext('2d')!;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(239,241,219,0.44)';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    circuit.samples.forEach((p, i) => {
      const [x, y] = this.mapPoint(p.x, p.z);
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = '#d5f06b'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let d = 0; d <= circuit.pit.length; d += 2) {
      const p = circuit.pit.point(d), [x, y] = this.mapPoint(p.x, p.z);
      if (!d) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    get('drive').onclick = actions.drive;
    get('play-online').onclick = actions.online;
    get('pause').onclick = actions.pause;
    get('resume').onclick = actions.resume;
    get('restart').onclick = actions.restart;
    get('exit').onclick = actions.exit;
    get('title-settings').onclick = actions.pause;
    get<HTMLSelectElement>('quality').onchange = (event) =>
      actions.quality((event.target as HTMLSelectElement).value as Quality);
    get('sound').onclick = () => {
      const button = get('sound');
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? 'ON' : 'OFF';
      actions.sound(enabled);
      try { localStorage.setItem('slipstream:sound', String(enabled)); } catch { /* Optional preference. */ }
    };
    const volumeLabel = document.createElement('label');
    volumeLabel.className = 'volume-setting';
    volumeLabel.innerHTML = 'ENGINE VOLUME <input id="engine-volume" type="range" min="0" max="100" value="40" aria-label="Engine volume"/><output id="volume-value">40%</output>';
    root.querySelector('.settings')!.append(volumeLabel);
    const volume = get<HTMLInputElement>('engine-volume');
    const setVolume = () => { get('volume-value').textContent = `${volume.value}%`; actions.volume(Number(volume.value) / 100); };
    volume.oninput = () => { setVolume(); try { localStorage.setItem('slipstream:volume', volume.value); } catch { /* Optional preference. */ } };
    try {
      const saved = localStorage.getItem('slipstream:volume');
      if (saved !== null && Number.isFinite(Number(saved))) volume.value = saved;
      if (localStorage.getItem('slipstream:sound') === 'false') {
        get('sound').setAttribute('aria-pressed', 'false'); get('sound').textContent = 'OFF'; actions.sound(false);
      }
    } catch { /* Optional preference. */ }
    setVolume();
  }
  loaded() {
    this.root.querySelector('#loading')!.classList.add('loaded');
  }
  setMode(mode: Mode, fromTitle = false) {
    window.clearTimeout(this.toastTimer);
    this.root.querySelector('#toast')!.classList.remove('visible');
    for (const [id, visible] of [
      ['title', mode === 'title'],
      ['hud', mode === 'driving' || mode === 'racing'],
      ['pause-screen', mode === 'paused'],
    ] as const)
      (this.root.querySelector(`#${id}`) as HTMLElement).hidden = !visible;
    this.root.dataset.mode = mode;
    (this.root.querySelector('#resume') as HTMLElement).innerHTML = fromTitle
      ? 'BACK TO TITLE <span>↗</span>'
      : 'BACK ON TRACK <span>↗</span>';
    (this.root.querySelector('#restart') as HTMLElement).hidden = fromTitle;
  }
  setOnline(slot: number | null, seats?: SeatView[]) {
    this.colors = seats?.map(seat => seat.color) ?? TEAMS.map(team => team.color);
    this.carName = slot === null ? 'VELOCE / 07' : `${seats?.[slot].name.toUpperCase() ?? TEAMS[slot].name.toUpperCase()} / ${TEAMS[slot].number}`;
    this.root.querySelector('.session-label div > span')!.textContent = slot === null ? 'FREE PRACTICE' : 'PRIVATE GRAND PRIX';
    this.root.querySelector('.session-time > span')!.textContent = slot === null ? 'SESSION TIME' : 'RACE TIME';
  }
  update(state: VehicleState, elapsed: number, racers?: VehicleState[], ownSlot = -1) {
    const kmh = Math.round(Math.abs(state.speed) * 3.6);
    this.speed.textContent = String(kmh);
    this.gear.textContent =
      state.speed < -0.4 ? 'R' : kmh < 2 ? 'N' : String(Math.min(6, Math.floor(kmh / 43) + 1));
    const minutes = Math.floor(elapsed / 60),
      seconds = Math.floor(elapsed % 60),
      milliseconds = Math.floor((elapsed % 1) * 1000);
    this.elapsed.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
    this.revs.style.transform = `scaleX(${0.09 + ((kmh % 43) / 43) * 0.91})`;
    this.surface.textContent = state.offroad ? 'OFF CIRCUIT · LOW GRIP' : this.carName;
    this.surface.classList.toggle('offroad', state.offroad);
    const ctx = this.mapCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 260, 240);
    ctx.drawImage(this.mapBackground, 0, 0);
    racers?.forEach((car, slot) => {
      if (slot === ownSlot) return;
      const [cx, cy] = this.mapPoint(car.x, car.z);
      ctx.fillStyle = this.colors[slot]; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    });
    const [x, y] = this.mapPoint(state.x, state.z);
    ctx.fillStyle = ownSlot >= 0 ? this.colors[ownSlot] : '#dcf581';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a2825';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  toast(message: string) {
    const toast = this.root.querySelector('#toast') as HTMLElement;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2600);
  }
  private mapPoint(x: number, z: number) {
    return [24 + (x / TRACK.scale + 170) * 0.56, 20 + (z / TRACK.scale + 210) * 0.5];
  }
  private trackSvg() {
    const points = this.circuit.samples
      .filter((_, i) => i % 5 === 0)
      .map((p) => `${p.x / TRACK.scale + 190},${p.z / TRACK.scale + 225}`)
      .join(' ');
    return `<svg viewBox="0 0 440 420" class="track-outline" aria-label="Cala Sola circuit outline"><polygon points="${points}" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round"/><circle cx="30" cy="135" r="11" fill="#d5f06b"/></svg>`;
  }
}
