import { LANE, SPEED, type Gate, type GameEvent, type RhythmEngine } from './engine.ts';
import type { Held } from './input.ts';

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => value * value * (3 - 2 * value);
export const CONTACT = 13;
export const IMPACT_DURATION = 0.18;

/** Pure presentation sampling: it never advances or writes to the run. */
export function sampleMotion(engine: RhythmEngine, held: Held, reduced = false) {
  let cameraX = reduced ? 0 : (engine.x - 2 * LANE) * 0.12;
  let cameraY = 0;
  let latest: GameEvent | null = null;
  for (const gate of engine.gates) {
    const entered = gate.id < engine.score || (gate.id === engine.score && engine.phase === 'lateral');
    if (!entered) continue;
    const entryAge = engine.time - gate.entry;
    const exitAge = engine.time - gate.exit;
    // Exact exponential follow for each velocity change, including the rest of
    // a frame after contact. Forward camera momentum continues into the turn.
    const response = (age: number, lag: number) => age < 0 ? 0 : -Math.expm1(-age / lag);
    if (!reduced) {
      cameraX -= gate.direction * SPEED * 0.12 * 0.075 * (response(entryAge, 0.075) - response(exitAge, 0.075));
      cameraY += SPEED * 0.045 * (response(entryAge, 0.045) - response(exitAge, 0.045));
    }
    latest = exitAge >= 0
      ? { type: 'exit', time: gate.exit, x: gate.to * LANE, y: gate.y, direction: gate.direction }
      : { type: 'entry', time: gate.entry, x: gate.from * LANE, y: gate.y, direction: gate.direction };
  }
  const direction = held.left === held.right ? 0 : held.left ? -1 : 1;
  const anticipation = engine.phase === 'forward' && engine.status !== 'ready'
    ? ease(clamp(1 - (engine.gate.entry - engine.time) / 0.18)) : 0;
  let angle = engine.phase === 'lateral' ? engine.gate.direction * 90 : direction * 18 * anticipation;
  let scaleX = 1 + anticipation * 0.05;
  let scaleY = 1 - anticipation * 0.06;
  let energy = 0;
  if (latest) {
    const age = engine.time - latest.time;
    energy = clamp(1 - age / IMPACT_DURATION);
    if (!reduced && age < IMPACT_DURATION) {
      const weight = latest.type === 'entry' ? 1 : 0.7;
      const compression = Math.exp(-age / 0.016);
      const release = (age / 0.038) * Math.exp(1 - age / 0.038);
      scaleX += weight * (0.30 * compression - 0.13 * release);
      scaleY += weight * (-0.28 * compression + 0.23 * release);
      angle += latest.direction * (latest.type === 'entry' ? 9 : -9) * Math.exp(-age / 0.045);
    }
  }
  if (reduced) { angle = engine.phase === 'lateral' ? engine.gate.direction * 90 : 0; scaleX = 1; scaleY = 1; }
  return { cameraX, cameraY, angle, scaleX, scaleY, energy };
}

/** Barrier faces sit outside the centre's path, so the arrow meets a surface. */
export function barrierOffset(gate: Gate, exit: boolean) {
  const side = exit ? 1 : -1;
  return { x: (exit ? gate.direction * LANE : 0) + side * gate.direction * CONTACT / 2, y: side * CONTACT / 2 };
}

export function contactPoint(event: GameEvent) {
  return event.type === 'exit'
    ? { x: event.x + event.direction * CONTACT, y: event.y }
    : { x: event.x, y: event.y + CONTACT };
}
