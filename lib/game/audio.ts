import { BEAT } from './engine.ts';
import type { GameEvent } from './engine.ts';

export class RhythmAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private epoch = 0;
  private nextBeat = 0;
  muted = false;

  async unlock(): Promise<boolean> {
    try {
      this.context ??= new AudioContext({ latencyHint: 'interactive' });
      if (!this.master) { this.master = this.context.createGain(); this.master.connect(this.context.destination); }
      this.master.gain.value = this.muted ? 0 : 0.65;
      await Promise.race([this.context.resume(), new Promise(resolve => setTimeout(resolve, 350))]);
      return this.context.state === 'running';
    } catch { return false; }
  }

  toggle(): boolean {
    this.muted = !this.muted;
    if (this.master && this.context) this.master.gain.setValueAtTime(this.muted ? 0 : 0.65, this.context.currentTime);
    return this.muted;
  }

  bind(time: number, delay = 0): void {
    this.stop();
    if (!this.context) return;
    this.epoch = this.context.currentTime + delay - time;
    this.nextBeat = Math.ceil((time - 1e-8) / BEAT);
  }

  private tone(at: number, frequency: number, duration: number, volume: number, type: OscillatorType = 'sine', endFrequency = frequency): void {
    const ctx = this.context;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const start = Math.max(ctx.currentTime, at);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain); gain.connect(this.master);
    this.voices.add(osc);
    osc.onended = () => { this.voices.delete(osc); osc.disconnect(); gain.disconnect(); };
    osc.start(start); osc.stop(start + duration + 0.02);
  }

  schedulePulse(): void {
    if (!this.context) return;
    const horizon = this.context.currentTime + 0.10;
    while (this.epoch + this.nextBeat * BEAT <= horizon) {
      const at = this.epoch + this.nextBeat * BEAT;
      if (at >= this.context.currentTime - 0.04) {
        const strong = this.nextBeat % 4 === 0;
        this.tone(at, strong ? 110 : 82, 0.12, strong ? 0.24 : 0.15, 'sine', 42);
        this.tone(at, 1700, 0.026, strong ? 0.025 : 0.015, 'triangle', 900);
      }
      this.nextBeat++;
    }
  }

  countIn(): void {
    if (!this.context) return;
    for (let i = 0; i < 2; i++) this.tone(this.context.currentTime + i * BEAT, 440, 0.04, 0.05);
  }

  event(event: GameEvent): void {
    if (!this.context) return;
    const at = this.epoch + event.time;
    if (event.type === 'failure') { this.stop(); this.tone(this.context.currentTime, 150, 0.22, 0.09, 'triangle', 35); }
    else if (event.type === 'entry') {
      this.tone(at, 180, 0.11, 0.12, 'sine', 48);
      this.tone(at, 1200, 0.032, 0.035, 'triangle', 310);
    } else {
      this.tone(at, 680, 0.07, 0.065, 'sine', 420);
      this.tone(at, 130, 0.075, 0.055, 'sine', 65);
    }
  }

  stop(): void { for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } } this.voices.clear(); }
  dispose(): void { this.stop(); void this.context?.close().catch(() => {}); }
}
