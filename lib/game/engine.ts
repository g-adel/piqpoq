import type { Held } from './input.ts';

export const BEAT = 0.5;
export const LANE = 100;
export const SPEED = 400;
export const TRANSFER = LANE / SPEED;
export const LEAD_IN = 4 * BEAT;
export const MAX_FRAME_GAP = 0.25;
export type Direction = -1 | 1;
export type GameStatus = 'ready' | 'running' | 'paused' | 'gameover';
export type Gate = Readonly<{ id: number; from: number; to: number; direction: Direction; y: number; entry: number; exit: number }>;
export type GameEvent = Readonly<{ type: 'entry' | 'exit' | 'failure'; time: number; x: number; y: number; direction: Direction }>;
export const intervalBeats = (completed: number): number => Math.max(1, 4 - Math.floor(completed / 16) * 0.5);

function randomSource(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Owns all motion. Its only input dependency is a read callback at a collision time. */
export class RhythmEngine {
  status: GameStatus = 'ready';
  phase: 'forward' | 'lateral' = 'forward';
  time = 0;
  x = 2 * LANE;
  y = 0;
  lane = 2;
  score = 0;
  gates: Gate[] = [];
  failure: 'missing' | 'wrong' | 'both' | null = null;
  private random: () => number;

  constructor(seed = 1) {
    this.random = randomSource(seed);
    this.fillGates();
  }

  get gate(): Gate { return this.gates.find(gate => gate.id === this.score)!; }
  get velocity(): Readonly<{ x: number; y: number }> {
    return this.phase === 'forward' ? { x: 0, y: SPEED } : { x: this.gate.direction * SPEED, y: 0 };
  }

  private fillGates(): void {
    while (!this.gates.length || this.gates[this.gates.length - 1].id < this.score + 12) {
      const previous = this.gates.at(-1);
      const id = previous ? previous.id + 1 : 0;
      const from = previous ? previous.to : 2;
      const direction: Direction = from === 0 ? 1 : from === 4 ? -1 : this.random() < 0.5 ? -1 : 1;
      const gap = intervalBeats(id) * BEAT;
      const entry = previous ? previous.entry + gap : LEAD_IN;
      const y = previous ? previous.y + SPEED * (gap - TRANSFER) : SPEED * LEAD_IN;
      this.gates.push(Object.freeze({ id, from, to: from + direction, direction, y, entry, exit: entry + TRANSFER }));
    }
  }

  start(): void { if (this.status === 'ready') this.status = 'running'; }
  pause(): void { if (this.status === 'running') this.status = 'paused'; }
  resume(): void { if (this.status === 'paused') this.status = 'running'; }

  advance(seconds: number, readHeld: (time: number) => Held): GameEvent[] {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Elapsed time must be finite and nonnegative.');
    if (this.status !== 'running') return [];
    const target = this.time + seconds;
    const events: GameEvent[] = [];
    while (this.status === 'running') {
      const gate = this.gate;
      const collision = this.phase === 'forward' ? gate.entry : gate.exit;
      const end = Math.min(target, collision);
      const duration = Math.max(0, end - this.time);
      const velocity = this.velocity;
      this.x += velocity.x * duration;
      this.y += velocity.y * duration;
      this.time = end;
      if (target < collision - 1e-9) break;
      this.time = collision;
      this.y = gate.y;
      if (this.phase === 'forward') {
        this.x = gate.from * LANE;
        const held = readHeld(collision);
        const correct = gate.direction === -1 ? held.left && !held.right : held.right && !held.left;
        if (!correct) {
          this.failure = held.left && held.right ? 'both' : !held.left && !held.right ? 'missing' : 'wrong';
          this.status = 'gameover';
          events.push({ type: 'failure', time: collision, x: this.x, y: this.y, direction: gate.direction });
          break;
        }
        this.phase = 'lateral';
        events.push({ type: 'entry', time: collision, x: this.x, y: this.y, direction: gate.direction });
      } else {
        this.x = gate.to * LANE;
        this.lane = gate.to;
        this.phase = 'forward';
        this.score++;
        events.push({ type: 'exit', time: collision, x: this.x, y: this.y, direction: gate.direction });
        this.gates = this.gates.filter(item => item.id >= this.score - 3);
        this.fillGates();
      }
      if (this.time >= target - 1e-9) break;
    }
    return events;
  }
}
