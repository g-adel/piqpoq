import test from 'node:test';
import assert from 'node:assert/strict';
import { RhythmEngine, type GameEvent } from '../lib/game/engine.ts';
import { RELEASED } from '../lib/game/input.ts';
import { barrierOffset, contactPoint, CONTACT, sampleMotion } from '../lib/game/motion.ts';

const hold = (direction: number) => ({ left: direction === -1, right: direction === 1 });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('anticipation follows held input but cannot move, turn, or retime the simulation', () => {
  const engine = new RhythmEngine(42); engine.start();
  engine.advance(1.94, () => RELEASED);
  const before = JSON.stringify(engine);
  const left = sampleMotion(engine, hold(-1));
  const right = sampleMotion(engine, hold(1));
  const overlap = sampleMotion(engine, { left: true, right: true });
  assert.ok(left.angle < 0 && right.angle > 0);
  close(left.angle, -right.angle); close(overlap.angle, 0);
  close(left.cameraX, right.cameraX); close(left.cameraY, right.cameraY);
  assert.equal(JSON.stringify(engine), before);
  assert.deepEqual(engine.velocity, { x: 0, y: 400 });
});

test('camera and impact pose depend on run time, not frame size, draw frequency, or a pause', () => {
  const run = (step: number) => {
    const engine = new RhythmEngine(42); engine.start();
    while (engine.time < 2.29 - 1e-9) {
      engine.advance(Math.min(step, 2.29 - engine.time), () => hold(engine.gate.direction));
      sampleMotion(engine, RELEASED);
    }
    return engine;
  };
  const reference = sampleMotion(run(2.29), RELEASED);
  for (const step of [1 / 30, 1 / 60, 1 / 144]) {
    const engine = run(step);
    const pose = sampleMotion(engine, RELEASED);
    for (const key of Object.keys(reference) as (keyof typeof reference)[]) close(pose[key], reference[key]);
    engine.pause(); engine.advance(20, () => RELEASED);
    assert.deepEqual(sampleMotion(engine, RELEASED), pose);
  }
});

test('camera carries momentum into lateral travel, settles after exit, and respects reduced motion', () => {
  const engine = new RhythmEngine(42); engine.start();
  engine.advance(2.1, () => hold(engine.gate.direction));
  const lateral = sampleMotion(engine, RELEASED);
  assert.ok(lateral.cameraY > 10 && lateral.cameraY < 18);
  assert.ok(lateral.energy > 0);
  engine.advance(0.8, () => RELEASED);
  const settled = sampleMotion(engine, RELEASED);
  assert.ok(Math.abs(settled.cameraY) < 0.001);
  close(settled.scaleX, 1); close(settled.scaleY, 1); close(settled.angle, 0);
  assert.deepEqual(sampleMotion(engine, RELEASED, true), { cameraX: 0, cameraY: 0, angle: 0, scaleX: 1, scaleY: 1, energy: 0 });
});

test('incoming arrow tips meet both parallel faces at the scheduled reflection centres', () => {
  for (let seed = 0; seed < 8; seed++) {
    const gate = new RhythmEngine(seed).gate;
    for (const exit of [false, true]) {
      const event: GameEvent = { type: exit ? 'exit' : 'entry', x: (exit ? gate.to : gate.from) * 100, y: gate.y, time: exit ? gate.exit : gate.entry, direction: gate.direction };
      const contact = contactPoint(event);
      const offset = barrierOffset(gate, exit);
      const localX = contact.x - gate.from * 100;
      const localY = gate.y - contact.y;
      close(gate.direction * (localX - offset.x) + localY - offset.y, 0);
      close(Math.hypot(contact.x - event.x, contact.y - event.y), CONTACT);
    }
  }
});

test('presentation stays bounded through rapid turns and discards old camera impulses', () => {
  const engine = new RhythmEngine(19); engine.start();
  while (engine.score < 150) {
    engine.advance(1 / 60, () => hold(engine.gate.direction));
    const pose = sampleMotion(engine, hold(engine.gate.direction));
    assert.ok(Math.abs(pose.cameraX) <= 25);
    assert.ok(pose.cameraY >= 0 && pose.cameraY < 18);
    assert.ok(pose.scaleX > 0.7 && pose.scaleX < 1.4);
    assert.ok(pose.scaleY > 0.65 && pose.scaleY < 1.3);
  }
});
