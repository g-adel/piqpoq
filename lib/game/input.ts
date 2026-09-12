export type Held = Readonly<{ left: boolean; right: boolean }>;
export const RELEASED: Held = Object.freeze({ left: false, right: false });

/** Input is a timestamped record, with no reference to the simulation. */
export class HeldInput {
  private sources = new Map<string, Held>();
  private history: { at: number; held: Held }[] = [{ at: -Infinity, held: RELEASED }];

  get snapshot(): Held { return this.history[this.history.length - 1].held; }

  set(source: string, held: Held, at: number): void {
    if (!Number.isFinite(at)) throw new Error('Input timestamps must be finite.');
    if (held.left || held.right) this.sources.set(source, Object.freeze({ ...held }));
    else this.sources.delete(source);
    let left = false;
    let right = false;
    for (const value of this.sources.values()) { left ||= value.left; right ||= value.right; }
    if (left === this.snapshot.left && right === this.snapshot.right) return;
    const timestamp = Math.max(at, this.history[this.history.length - 1].at);
    this.history.push({ at: timestamp, held: Object.freeze({ left, right }) });
    // Retain the preceding state as well as recent events for between-frame collisions.
    while (this.history.length > 2 && this.history[1].at < timestamp - 5000) this.history.shift();
  }

  mouse(buttons: number, at: number): void {
    this.set('mouse', { left: !!(buttons & 1), right: !!(buttons & 2) }, at);
  }

  touch(id: number, x: number, midpoint: number, at: number): void {
    this.set(`touch:${id}`, { left: x < midpoint, right: x >= midpoint }, at);
  }

  releaseTouch(id: number, at: number): void { this.set(`touch:${id}`, RELEASED, at); }

  clear(at: number): void { this.sources.clear(); this.set('clear', RELEASED, at); }

  at(timestamp: number): Held {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].at <= timestamp) return this.history[i].held;
    }
    return RELEASED;
  }
}
