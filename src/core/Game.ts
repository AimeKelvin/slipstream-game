import { Circuit } from '../track/Circuit';
import { World } from '../render/World';
import { VehiclePhysics, type VehicleState } from '../vehicle/VehiclePhysics';
import { FormulaCar } from '../vehicle/FormulaCar';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Input } from './Input';
import { UI, type Mode } from '../ui/UI';
import { OnlineUI } from '../ui/OnlineUI';
import { EngineAudio } from '../audio/EngineAudio';
import { SIMULATION_STEP, type Quality } from './config';
import { RoomClient } from '../network/RoomClient';
import { RaceSync } from '../network/RaceSync';
import { NEUTRAL, TEAMS, type RoomView, type Snapshot } from '../network/protocol';

export class Game {
  readonly circuit = new Circuit();
  readonly vehicle = new VehiclePhysics(this.circuit);
  readonly chase = new ChaseCamera();
  readonly ui: UI;
  readonly world: World;
  readonly car = new FormulaCar();
  readonly input: Input;
  readonly client: RoomClient;
  private sync: RaceSync;
  private onlineUI: OnlineUI;
  private raceCars: FormulaCar[] = [];
  private audio = new EngineAudio();
  private mode: Mode = 'title';
  private pausedFromTitle = false;
  private elapsed = 0;
  private accumulator = 0;
  private lastFrame = 0;
  private lastHud = 0;
  private frameId = 0;
  private previous: VehicleState = { ...this.vehicle.state };
  private rendered: VehicleState = { ...this.vehicle.state };
  private cameraRevision = '';
  private lastCue = '';
  private fps = 60;
  constructor(root: HTMLElement) {
    this.ui = new UI(root, this.circuit, {
      drive: () => this.drive(), online: () => this.changeMode('online'),
      pause: () => this.pause(), resume: () => this.resume(), restart: () => this.drive(),
      exit: () => this.exit(), quality: value => this.setQuality(value),
      sound: enabled => { this.audio.enabled = enabled; },
    });
    this.world = new World(this.ui.canvas, this.circuit); this.world.scene.add(this.car.root);
    this.client = new RoomClient({
      room: room => this.onRoom(room), snapshot: snapshot => this.onSnapshot(snapshot),
      status: status => this.onlineUI?.connection(status),
      error: (message, fatal) => {
        if (fatal) { this.clearOnline(); this.changeMode('online'); }
        this.onlineUI.error(message); this.ui.toast(message);
      },
    });
    this.sync = new RaceSync(this.circuit, this.client);
    this.onlineUI = new OnlineUI(root, {
      create: name => { this.startAudio(); this.client.create(name); },
      join: (name, code) => { this.startAudio(); this.client.join(name, code); },
      back: () => this.exit(), leave: () => this.exit(),
      ready: value => this.client.send({ type: 'ready', value }),
      start: () => this.client.send({ type: 'start' }), rematch: () => this.client.send({ type: 'rematch' }),
    });
    this.input = new Input(action => {
      if (action === 'pause') {
        if (this.mode === 'paused') this.resume();
        else if (this.mode === 'driving' || this.mode === 'racing' || this.mode === 'title') this.pause();
      }
      if (action === 'reset') {
        if (this.mode === 'racing') this.client.send({ type: 'reset' });
        else if (this.mode === 'driving') {
          this.vehicle.reset(); this.syncState(); this.chase.reset(); this.ui.toast('Back on the racing line.');
        }
      }
      if (action === 'camera' && (this.mode === 'driving' || this.mode === 'racing')) {
        this.chase.close = !this.chase.close; this.ui.toast(this.chase.close ? 'Camera · close' : 'Camera · chase');
      }
    });
    try {
      const quality = localStorage.getItem('slipstream:quality');
      if (quality === 'low' || quality === 'medium' || quality === 'high') this.setQuality(quality, false);
    } catch { /* Private browsing may disable storage. */ }
    this.resize(); window.addEventListener('resize', this.resize); window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.changeMode('title'); this.frameId = requestAnimationFrame(this.frame);
    void document.fonts.ready.then(() => this.ui.loaded());
    if (this.client.restore() || new URL(location.href).searchParams.has('room')) this.changeMode('online');
  }
  private changeMode(mode: Mode) {
    this.mode = mode; this.ui.setMode(mode, this.pausedFromTitle); this.onlineUI?.show(mode);
    const online = !!this.client?.room;
    const description = document.querySelector('.pause-description')!;
    description.textContent = online ? 'The race continues. AI drives while you take a break.' : 'Find your rhythm. Then find a little more.';
    (document.querySelector('#restart') as HTMLElement).hidden = online || this.pausedFromTitle;
    document.querySelector('#exit')!.textContent = online ? 'LEAVE ROOM ↗' : 'BACK TO TITLE ↗';
  }
  private startAudio() { void this.audio.start().catch(() => this.ui.toast('Audio unavailable. Driving is ready.')); }
  private drive() {
    this.client.leave(); this.clearOnline(); this.vehicle.reset(true); this.syncState();
    this.elapsed = 0; this.accumulator = 0; this.chase.reset(); this.input.clear(); this.pausedFromTitle = false;
    this.changeMode('driving'); this.ui.toast('WASD or arrow keys to drive. Find your rhythm.'); this.startAudio();
  }
  private onRoom(room: RoomView) {
    if (!this.raceCars.length) {
      this.raceCars = TEAMS.map(team => { const car = new FormulaCar(team); this.world.scene.add(car.root); return car; });
    }
    this.car.root.visible = false; this.raceCars.forEach(car => { car.root.visible = true; });
    this.ui.setOnline(this.client.slot); this.onlineUI.updateRoom(room, this.client.playerId, this.client.slot);
    const target: Mode = room.phase === 'lobby' ? 'lobby' : room.phase === 'results' ? 'results' : 'racing';
    if (!(this.mode === 'paused' && target === 'racing') && this.mode !== target) {
      this.pausedFromTitle = false; this.changeMode(target); this.input.clear();
    }
  }
  private onSnapshot(snapshot: Snapshot) {
    this.sync.accept(snapshot);
    const room = this.client.room;
    if (room && room.phase !== snapshot.phase) { room.phase = snapshot.phase; this.onRoom(room); }
    const own = snapshot.racers[this.client.slot];
    if (own) {
      const key = `${snapshot.raceId}:${own.revision}`;
      if (this.cameraRevision !== key) { this.cameraRevision = key; this.chase.reset(); }
    }
  }
  private pause() {
    if (this.mode === 'paused') return;
    this.pausedFromTitle = this.mode === 'title'; this.input.clear(); this.accumulator = 0;
    if (this.client.room) this.client.send({ type: 'away', value: true });
    this.changeMode('paused');
  }
  private resume() {
    this.input.clear();
    if (this.client.room) { this.client.send({ type: 'away', value: false }); this.changeMode('racing'); }
    else this.changeMode(this.pausedFromTitle ? 'title' : 'driving');
  }
  private clearOnline() {
    this.sync.clear(); this.raceCars.forEach(car => { car.root.visible = false; });
    this.car.root.visible = true; this.ui.setOnline(null); this.cameraRevision = ''; this.lastCue = '';
    this.vehicle.reset(true); this.syncState(); this.chase.reset();
  }
  private exit() {
    this.client.leave(); this.clearOnline(); this.changeMode('title'); this.input.clear();
    const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState(null, '', url);
  }
  private setQuality(value: Quality, notify = true) {
    this.world.setQuality(value); this.resize(); (document.querySelector('#quality') as HTMLSelectElement).value = value;
    try { localStorage.setItem('slipstream:quality', value); } catch { /* Preference is optional. */ }
    if (notify) this.ui.toast(`Graphics · ${value}`);
  }
  private syncState() { Object.assign(this.previous, this.vehicle.state); Object.assign(this.rendered, this.vehicle.state); }
  private resize = () => { const w = innerWidth, h = innerHeight; this.world.resize(w, h); this.chase.resize(w, h); };
  private onBlur = () => { if (this.mode === 'driving' || this.mode === 'racing') this.pause(); };
  private onVisibility = () => { if (document.hidden) this.onBlur(); this.lastFrame = 0; this.accumulator = 0; };
  private frame = (now: number) => {
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : SIMULATION_STEP;
    this.lastFrame = now; this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.025;
    const input = this.input.read();
    const online = !!this.client.room && !!this.sync.latest;
    if (online) {
      this.sync.update(dt, this.mode === 'racing' ? input : NEUTRAL, this.mode === 'racing');
      const states = this.sync.states();
      this.raceCars.forEach((car, slot) => car.update(states[slot], this.client.room!.phase === 'racing' ? dt : 0, states[slot].acceleration < -8 ? 1 : 0));
      Object.assign(this.rendered, states[this.client.slot]); this.elapsed = this.sync.latest!.elapsed;
      const room = this.client.room!;
      const cue = room.phase === 'countdown' ? `count-${Math.max(0, Math.ceil((room.startAt - this.client.serverNow()) / 1000))}` : room.phase;
      if (cue !== this.lastCue) {
        if (room.phase === 'countdown') this.audio.cue(420, 0.08);
        else if (room.phase === 'racing' && this.lastCue.startsWith('count')) this.audio.cue(880, 0.28);
        else if (room.phase === 'results') this.audio.cue(660, 0.5);
        this.lastCue = cue;
      }
    } else {
      if (this.mode === 'driving') {
        this.accumulator += dt;
        while (this.accumulator >= SIMULATION_STEP) {
          Object.assign(this.previous, this.vehicle.state); this.vehicle.step(input, SIMULATION_STEP);
          this.elapsed += SIMULATION_STEP; this.accumulator -= SIMULATION_STEP;
        }
        const alpha = this.accumulator / SIMULATION_STEP; Object.assign(this.rendered, this.vehicle.state);
        for (const key of ['x', 'z', 'heading'] as const) this.rendered[key] = this.previous[key] + (this.vehicle.state[key] - this.previous[key]) * alpha;
      }
      this.car.update(this.rendered, this.mode === 'driving' ? dt : 0, input.brake);
    }
    if (this.mode !== 'paused' || online) this.chase.update(this.rendered, dt, ['title', 'online', 'lobby', 'results'].includes(this.mode), now / 1000);
    this.world.followSun(this.rendered.x, this.rendered.z);
    this.audio.update(this.rendered.speed, input.throttle, this.mode === 'driving' || (this.mode === 'racing' && this.client.room?.phase === 'racing'));
    if (now - this.lastHud > 33) {
      this.ui.update(online ? this.rendered : this.vehicle.state, this.elapsed, online ? this.sync.states() : undefined, this.client.slot);
      if (online) this.onlineUI.updateRace(this.sync.latest!, this.client.serverNow(), this.client.ping);
      this.lastHud = now;
    }
    this.world.renderer.render(this.world.scene, this.chase.camera); this.frameId = requestAnimationFrame(this.frame);
  };
  diagnostics() {
    const render = this.world.renderer.info.render;
    return { mode: this.mode, state: { ...(this.client.room ? this.rendered : this.vehicle.state) }, elapsed: this.elapsed,
      fps: Math.round(this.fps), drawCalls: render.calls, triangles: render.triangles, quality: this.world.quality,
      camera: { x: this.chase.camera.position.x, y: this.chase.camera.position.y, z: this.chase.camera.position.z, fov: this.chase.camera.fov },
      trackLength: this.circuit.length, network: { status: this.client.status, slot: this.client.slot, room: this.client.room, latest: this.sync.latest },
    };
  }
  dispose() {
    cancelAnimationFrame(this.frameId); this.input.dispose(); this.client.dispose(); this.audio.dispose(); this.world.dispose();
    window.removeEventListener('resize', this.resize); window.removeEventListener('blur', this.onBlur); document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
