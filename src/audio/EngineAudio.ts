import { clamp } from '../core/math';

/** Original, deliberately quiet synth bed; replaced/layered with recordings in audio polish. */
export class EngineAudio {
  private context?: AudioContext;
  private oscillator?: OscillatorNode;
  private overtone?: OscillatorNode;
  private gain?: GainNode;
  private filter?: BiquadFilterNode;
  enabled = true;
  async start() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 650;
      this.oscillator = this.context.createOscillator();
      this.oscillator.type = 'sawtooth';
      this.overtone = this.context.createOscillator();
      this.overtone.type = 'triangle';
      const overtoneGain = this.context.createGain();
      overtoneGain.gain.value = 0.3;
      this.oscillator.connect(this.filter);
      this.overtone.connect(overtoneGain);
      overtoneGain.connect(this.filter);
      this.filter.connect(this.gain);
      this.gain.connect(this.context.destination);
      this.oscillator.start();
      this.overtone.start();
    }
    await this.context.resume();
  }
  update(speed: number, throttle: number, driving: boolean) {
    if (!this.context || !this.gain || !this.oscillator || !this.overtone || !this.filter) return;
    const t = this.context.currentTime;
    const kmh = Math.abs(speed) * 3.6;
    const gear = Math.min(6, Math.floor(kmh / 43) + 1);
    const rev = clamp((kmh - (gear - 1) * 43) / 43, 0, 1);
    const frequency = 48 + rev * 80 + throttle * 17 + gear * 7;
    this.oscillator.frequency.setTargetAtTime(frequency, t, 0.08);
    this.overtone.frequency.setTargetAtTime(frequency * 2.01, t, 0.08);
    this.filter.frequency.setTargetAtTime(350 + rev * 750 + throttle * 350, t, 0.08);
    this.gain.gain.setTargetAtTime(this.enabled && driving ? 0.018 + throttle * 0.018 : 0, t, 0.06);
  }
  cue(frequency: number, duration: number) {
    if (!this.context || !this.enabled) return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.045, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain); gain.connect(this.context.destination);
    oscillator.start(now); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  dispose() {
    void this.context?.close();
  }
}
