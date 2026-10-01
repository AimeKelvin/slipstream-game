import { clamp } from '../core/math';

/** Recorded car engine, CC0 by domasx2. See public/licenses/Car-engine-CC0.txt. */
export class EngineAudio {
  private context?: AudioContext;
  private source?: AudioBufferSourceNode;
  private gain?: GainNode;
  private filter?: BiquadFilterNode;
  private loading?: Promise<void>;
  private disposed = false;
  enabled = true;
  volume = 0.4;

  async start() {
    if (this.disposed) return;
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.filter = this.context.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 0.45;
      this.filter.frequency.value = 1800;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 3;
      this.filter.connect(this.gain);
      this.gain.connect(compressor);
      compressor.connect(this.context.destination);
    }
    // Resume synchronously from the user's gesture, before fetching the recording.
    const resumed = this.context.resume();
    this.loading ??= this.loadRecording().catch((error) => {
      this.loading = undefined;
      throw error;
    });
    await Promise.all([resumed, this.loading]);
  }

  private async loadRecording() {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/car-engine.wav`);
    if (!response.ok) throw new Error('Engine recording unavailable');
    const context = this.context!;
    const recording = await context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed) return;
    // Overlap the last 40 ms with the beginning to remove clicks at the loop seam.
    const overlap = Math.min(
      Math.floor(recording.sampleRate * 0.04),
      Math.floor(recording.length / 4),
    );
    const length = recording.length - overlap;
    const loop = context.createBuffer(recording.numberOfChannels, length, recording.sampleRate);
    let peak = 0;
    for (let channel = 0; channel < recording.numberOfChannels; channel++) {
      const input = recording.getChannelData(channel),
        output = loop.getChannelData(channel);
      output.set(input.subarray(overlap));
      for (let i = 0; i < overlap; i++) {
        const blend = i / overlap;
        output[length - overlap + i] = input[length + i] * (1 - blend) + input[i] * blend;
      }
      for (const value of output) peak = Math.max(peak, Math.abs(value));
    }
    // Normalize the source once; volume and throttle shape its output.
    const scale = peak > 0 ? 0.8 / peak : 1;
    for (let channel = 0; channel < loop.numberOfChannels; channel++) {
      const data = loop.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
    this.source = context.createBufferSource();
    this.source.buffer = loop;
    this.source.loop = true;
    this.source.connect(this.filter!);
    this.source.start();
  }

  update(speed: number, throttle: number, driving: boolean) {
    if (!this.context || !this.gain || !this.source || !this.filter) return;
    const t = this.context.currentTime;
    const kmh = Math.abs(speed) * 3.6;
    const gear = Math.min(6, Math.floor(kmh / 43) + 1);
    const rev = clamp((kmh - (gear - 1) * 43) / 43, 0, 1);
    this.source.playbackRate.setTargetAtTime(
      0.75 + rev * 0.7 + throttle * 0.16 + gear * 0.025,
      t,
      0.12,
    );
    this.filter.frequency.setTargetAtTime(1100 + rev * 1300 + throttle * 500, t, 0.15);
    this.gain.gain.setTargetAtTime(
      this.enabled && driving ? this.volume * (0.16 + throttle * 0.22 + rev * 0.06) : 0,
      t,
      0.08,
    );
  }

  cue(frequency: number, duration: number) {
    if (!this.context || !this.enabled) return;
    const oscillator = this.context.createOscillator(),
      gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  diagnostics() {
    return {
      loaded: !!this.source,
      context: this.context?.state ?? 'not-started',
      enabled: this.enabled,
      volume: this.volume,
      gain: this.gain?.gain.value ?? 0,
    };
  }
  dispose() {
    this.disposed = true;
    this.source?.stop();
    this.source?.disconnect();
    void this.context?.close();
  }
}
