import type { DriverInput } from '../vehicle/VehiclePhysics';
import { clamp } from './math';

export class Input {
  private keys = new Set<string>();
  private padReset = false;
  private padPit = false;
  readonly value: DriverInput = { throttle: 0, brake: 0, steer: 0 };
  gamepadConnected = false;
  constructor(private action: (action: 'pause' | 'reset' | 'camera' | 'pit') => void) {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.clear);
  }
  private onDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement)
      return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code))
      event.preventDefault();
    this.keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'Escape') this.action('pause');
      if (event.code === 'KeyR') this.action('reset');
      if (event.code === 'KeyP') this.action('pit');
      if (event.code === 'KeyC') this.action('camera');
    }
  };
  private onUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
  clear = () => {
    this.keys.clear();
    this.value.throttle = this.value.brake = this.value.steer = 0;
  };
  read() {
    const has = (...codes: string[]) => codes.some((code) => this.keys.has(code));
    this.value.throttle = has('KeyW', 'ArrowUp') ? 1 : 0;
    this.value.brake = has('KeyS', 'ArrowDown', 'Space') ? 1 : 0;
    this.value.steer = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    this.gamepadConnected = !!pad;
    if (pad) {
      const axis = pad.axes[0] ?? 0;
      if (Math.abs(axis) > 0.12)
        this.value.steer = (Math.sign(axis) * (Math.abs(axis) - 0.12)) / 0.88;
      this.value.throttle = Math.max(this.value.throttle, pad.buttons[7]?.value ?? 0);
      this.value.brake = Math.max(this.value.brake, pad.buttons[6]?.value ?? 0);
      const reset = pad.buttons[3]?.pressed ?? false;
      if (reset && !this.padReset) this.action('reset');
      this.padReset = reset;
      const pit = pad.buttons[2]?.pressed ?? false;
      if (pit && !this.padPit) this.action('pit');
      this.padPit = pit;
    }
    this.value.steer = clamp(this.value.steer, -1, 1);
    return this.value;
  }
  dispose() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.clear);
  }
}
