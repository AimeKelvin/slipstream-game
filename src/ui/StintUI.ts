import type { Circuit } from '../track/Circuit';
import type { VehicleState } from '../vehicle/VehiclePhysics';
import type { RaceProgress } from '../race/Progress';
import { TEAMS } from '../network/protocol';
import { clamp } from '../core/math';
import { formatTime } from './OnlineUI';
import type { Mode } from './UI';

export class StintUI {
  private root: HTMLDivElement;
  constructor(
    parent: HTMLElement,
    private circuit: Circuit,
    requestPit: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'stint-ui';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div id="practice-laps" class="practice-laps"><span>CIRCUIT LAP <b id="practice-lap">1</b> <small id="practice-sector">SECTOR 1 / 3</small></span><strong id="practice-time">0:00.000</strong><span>LAST <b id="practice-last">—</b> BEST <b id="practice-best">—</b></span><small id="practice-valid"></small></div>
      <div class="tyre-panel"><div class="tyre-heading"><span>TYRE CONDITION</span><strong id="tyre-percent">100%</strong></div><div id="tyre-meter" class="tyre-meter" role="progressbar" aria-label="Tyre condition" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="tyre-note"><span id="tyre-grip">FRESH · FULL GRIP</span><span id="pit-stop-count">0 STOPS</span></div><button id="request-pit"><kbd>P</kbd><span>BOX THIS LAP</span><b>↗</b></button><p id="tyre-advice">One tyre stop is a good three-lap strategy.</p></div>
      <div id="pit-guide" class="pit-guide" hidden><p id="pit-team" class="eyebrow"></p><div class="pit-guide-heading"><h3 id="pit-title">BOX THIS LAP</h3><strong id="pit-distance"></strong></div><p id="pit-instruction"></p><div id="pit-braking"><div class="brake-track"><span class="brake-good"></span><span class="brake-perfect"></span><i id="brake-marker"></i></div><div class="brake-legend"><span>STOPPING POINT</span><span>YOUR RECTANGLE</span></div></div><div id="pit-service" hidden><div class="service-track"><i id="service-progress"></i></div><span id="service-step"></span></div></div>`;
    parent.append(this.root);
    this.get('request-pit').onclick = requestPit;
  }
  private get(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  show(mode: Mode) {
    this.root.hidden = mode !== 'driving' && mode !== 'racing';
    this.get('practice-laps').hidden = mode !== 'driving';
  }
  update(s: VehicleState, elapsed: number, progress?: RaceProgress) {
    const percent = Math.round(s.tyres * 100),
      worn = s.tyres < 0.35,
      warning = s.tyres < 0.6;
    this.root.style.setProperty('--tyre-color', worn ? '#ff9978' : warning ? '#f5d482' : '#d5f06b');
    this.get('tyre-percent').textContent = `${percent}%`;
    this.get('tyre-meter').setAttribute('aria-valuenow', String(percent));
    this.get('tyre-meter').querySelector<HTMLElement>('i')!.style.transform = `scaleX(${s.tyres})`;
    this.get('tyre-grip').textContent = worn
      ? 'WORN · LESS CORNER GRIP'
      : warning
        ? 'WEARING · PLAN YOUR STOP'
        : 'FRESH · FULL GRIP';
    this.get('pit-stop-count').textContent = `${s.pitStops} STOP${s.pitStops === 1 ? '' : 'S'}`;
    const button = this.get('request-pit') as HTMLButtonElement;
    button.disabled = s.pitPhase > 0;
    button.classList.toggle('requested', s.pitRequested);
    button.querySelector('span')!.textContent = s.pitPhase
      ? 'IN THE PIT LANE'
      : s.pitRequested
        ? 'CANCEL PIT CALL'
        : 'BOX THIS LAP';
    this.get('tyre-advice').textContent = worn
      ? 'Brake earlier. Fresh tyres restore your grip.'
      : s.pitStops
        ? 'Look after this set. Smooth steering saves tyres.'
        : warning
          ? 'Box this lap for fresh tyres. Press P.'
          : 'One tyre stop is a good three-lap strategy.';
    if (progress) {
      this.get('practice-lap').textContent = String(progress.completedLaps + 1);
      this.get('practice-sector').textContent = `SECTOR ${progress.sector} / 3`;
      this.get('practice-time').textContent = formatTime(progress.lapTime(elapsed));
      this.get('practice-last').textContent = formatTime(progress.lastLap);
      this.get('practice-best').textContent = formatTime(progress.bestLap);
      this.get('practice-valid').textContent = progress.lapValid
        ? 'COMPLETE THE CIRCUIT TO SET A LAP'
        : 'TRACK LIMITS · LAP WILL NOT SET A BEST';
    }
    const guide = this.get('pit-guide');
    guide.hidden = !s.pitRequested && !s.pitPhase;
    if (guide.hidden) return;
    this.get('pit-team').textContent =
      `PIT ${TEAMS[s.pitSlot].number} / ${TEAMS[s.pitSlot].name.toUpperCase()} / 80 KM/H LIMIT`;
    const remaining = this.circuit.pit.boxDistance(s.pitSlot) - s.pitDistance;
    const brakingError = (s.speed * s.speed) / 48 - remaining;
    const servicing = s.pitPhase === 2;
    this.get('pit-braking').hidden = s.pitPhase !== 1;
    this.get('pit-service').hidden = !servicing;
    guide.classList.toggle('brake-now', s.pitPhase === 1 && brakingError > -1.5);
    if (servicing) {
      const completion = 1 - s.pitStopTime / s.pitStopDuration;
      this.get('pit-title').textContent =
        s.pitRating === 1 ? 'PERFECT STOP' : s.pitRating === 2 ? 'GOOD STOP' : 'CREW ADJUSTING';
      this.get('pit-distance').textContent = `${s.pitStopTime.toFixed(1)}s`;
      this.get('pit-instruction').textContent =
        `${s.pitStopDuration.toFixed(1)}s tyre change · hold tight, the crew has you.`;
      this.get('service-progress').style.transform = `scaleX(${completion})`;
      this.get('service-step').textContent =
        completion < 0.2
          ? 'JACK UP'
          : completion < 0.45
            ? 'WHEELS OFF'
            : completion < 0.8
              ? 'FRESH TYRES ON'
              : 'READY TO RELEASE';
    } else if (s.pitPhase === 1) {
      this.get('pit-title').textContent =
        remaining < -3.3
          ? 'MISSED THE MARK'
          : s.speed < 0.65 && remaining > 18
            ? 'ROLL FORWARD'
            : brakingError > -1.5
              ? 'BRAKE NOW'
              : 'APPROACH YOUR BOX';
      this.get('pit-distance').textContent =
        `${Math.abs(remaining).toFixed(0)}m ${remaining >= 0 ? 'TO BOX' : 'PAST BOX'}`;
      this.get('pit-instruction').textContent =
        'Steering is guided. Brake as the marker reaches green; stop in your rectangle.';
      this.get('brake-marker').style.left = `${clamp(70 + brakingError * 2.4, 2, 98)}%`;
    } else if (s.pitPhase === 3) {
      this.get('pit-title').textContent = 'GO, GO, GO';
      this.get('pit-distance').textContent = '100%';
      this.get('pit-instruction').textContent =
        'Fresh tyres fitted. Accelerate; steering returns at pit exit.';
    } else {
      this.get('pit-title').textContent = 'BOX THIS LAP';
      this.get('pit-distance').textContent =
        `${Math.round(this.circuit.pit.distanceToEntry(s.contactIndex))}m`;
      this.get('pit-instruction').textContent =
        'Stay on track. We guide you into the pit lane at the entry sign. Keep driving.';
    }
  }
}
