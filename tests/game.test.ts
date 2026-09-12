import test from 'node:test';
import assert from 'node:assert/strict';
import { RhythmEngine, SPEED, TRANSFER, BEAT, intervalBeats } from '../lib/game/engine.ts';
import { HeldInput, RELEASED } from '../lib/game/input.ts';
import { gameTools } from '../lib/game/webmcp.ts';

const hold = (direction: number) => ({ left: direction === -1, right: direction === 1 });
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('input changes cannot move the player or retime collisions', () => {
  const engine = new RhythmEngine(42);
  const input = new HeldInput();
  engine.start();
  const original = { x: engine.x, y: engine.y, time: engine.time, gate: engine.gate };
  input.set('keyboard', hold(1), 20);
  input.set('keyboard', hold(-1), 25);
  input.mouse(3, 30);
  assert.deepEqual({ x: engine.x, y: engine.y, time: engine.time, gate: engine.gate }, original);
  engine.advance(1, () => input.snapshot);
  close(engine.x, original.x); close(engine.y, SPEED); close(engine.time, 1);
});

test('left and right reflect at constant speed with an automatic second reflection', () => {
  const directions = new Set<number>();
  for (let seed = 0; seed < 8; seed++) {
    const engine = new RhythmEngine(seed); engine.start();
    const gate = engine.gate; directions.add(gate.direction);
    assert.equal(engine.advance(gate.entry, () => hold(gate.direction))[0].type, 'entry');
    assert.deepEqual(engine.velocity, { x: gate.direction * SPEED, y: 0 });
    engine.advance(TRANSFER / 2, () => RELEASED);
    close(engine.x, (gate.from + gate.direction * 0.5) * 100); close(engine.y, gate.y);
    const exit = engine.advance(TRANSFER / 2 + 0.1, () => ({ left: true, right: true }));
    assert.equal(exit[0].type, 'exit'); assert.equal(engine.score, 1);
    close(engine.x, gate.to * 100); close(engine.y, gate.y + SPEED * 0.1);
    assert.deepEqual(engine.velocity, { x: 0, y: SPEED });
  }
  assert.deepEqual([...directions].sort(), [-1, 1]);
});

test('missing, wrong, or both held fail exactly at entry, with no score', () => {
  for (const failure of ['missing', 'wrong', 'both']) {
    const engine = new RhythmEngine(42); engine.start();
    const gate = engine.gate;
    const held = failure === 'missing' ? RELEASED : failure === 'wrong' ? hold(-gate.direction) : { left: true, right: true };
    const events = engine.advance(10, () => held);
    assert.equal(engine.status, 'gameover'); assert.equal(engine.failure, failure);
    assert.equal(engine.time, gate.entry); assert.equal(engine.x, gate.from * 100);
    assert.equal(engine.y, gate.y); assert.equal(engine.score, 0);
    assert.deepEqual(events.map(event => event.type), ['failure']);
  }
});

test('early and just-before-collision holds have identical trajectories; late input cannot rescue a collision', () => {
  const run = (at: number) => {
    const engine = new RhythmEngine(42); const input = new HeldInput(); engine.start();
    input.set('key', hold(engine.gate.direction), at);
    engine.advance(2.1, seconds => input.at(seconds * 1000));
    return { status: engine.status, x: engine.x, y: engine.y, time: engine.time };
  };
  assert.deepEqual(run(1), run(1999));
  assert.equal(run(2001).status, 'gameover');
});

test('switching and overlap during a transfer prepare the following turn without affecting motion', () => {
  const engine = new RhythmEngine(7); const input = new HeldInput(); engine.start();
  const first = engine.gate; const second = engine.gates[1];
  input.set('key', hold(first.direction), 0);
  input.set('key', { left: true, right: true }, first.entry * 1000 + 10);
  input.set('key', hold(second.direction), first.entry * 1000 + 100);
  engine.advance(second.exit, time => input.at(time * 1000));
  assert.equal(engine.score, 2); assert.equal(engine.status, 'running');
});

test('repeated turns accept a continued hold without new key events', () => {
  let tested = false;
  for (let seed = 0; seed < 30 && !tested; seed++) {
    const engine = new RhythmEngine(seed);
    if (engine.gates[0].direction !== engine.gates[1].direction) continue;
    engine.start(); const held = hold(engine.gate.direction);
    engine.advance(engine.gates[1].exit, () => held);
    assert.equal(engine.score, 2); tested = true;
  }
  assert.ok(tested);
});

test('touch drag, opposite touches, cancellation, mouse chording and source aggregation', () => {
  const input = new HeldInput();
  input.touch(1, 30, 100, 1); assert.deepEqual(input.snapshot, hold(-1));
  input.touch(1, 180, 100, 2); assert.deepEqual(input.snapshot, hold(1));
  input.touch(2, 30, 100, 3); assert.deepEqual(input.snapshot, { left: true, right: true });
  input.releaseTouch(1, 4); assert.deepEqual(input.snapshot, hold(-1));
  input.releaseTouch(2, 5); assert.deepEqual(input.snapshot, RELEASED);
  input.mouse(1, 6); assert.deepEqual(input.snapshot, hold(-1));
  input.mouse(3, 7); assert.deepEqual(input.snapshot, { left: true, right: true });
  input.mouse(2, 8); assert.deepEqual(input.snapshot, hold(1));
  input.set('ArrowLeft', hold(-1), 9); assert.deepEqual(input.snapshot, { left: true, right: true });
  input.mouse(0, 10); assert.deepEqual(input.snapshot, hold(-1));
  input.clear(11); assert.deepEqual(input.snapshot, RELEASED);
});

test('pausing freezes a partial transfer; resuming finishes it without checking input again', () => {
  const engine = new RhythmEngine(42); engine.start();
  engine.advance(2.1, () => hold(engine.gate.direction)); engine.pause();
  const state = { time: engine.time, x: engine.x, y: engine.y, score: engine.score };
  engine.advance(60, () => RELEASED);
  assert.deepEqual({ time: engine.time, x: engine.x, y: engine.y, score: engine.score }, state);
  engine.resume(); engine.advance(0.15, () => RELEASED);
  assert.equal(engine.score, 1); assert.equal(engine.phase, 'forward');
  const fresh = new RhythmEngine(99);
  assert.equal(fresh.time, 0); assert.equal(fresh.score, 0); assert.equal(fresh.lane, 2); assert.equal(fresh.failure, null);
});

test('frame rates and large frames crossing both barriers yield the same run', () => {
  const run = (step: number) => {
    const engine = new RhythmEngine(42); engine.start();
    const events: unknown[] = [];
    while (engine.time < 120 - 1e-9) events.push(...engine.advance(Math.min(step, 120 - engine.time), () => hold(engine.gate.direction)));
    return { x: engine.x, y: engine.y, score: engine.score, time: engine.time, events };
  };
  const reference = run(120);
  for (const step of [1 / 30, 1 / 60, 1 / 144, 0.6]) {
    const actual = run(step);
    close(actual.x, reference.x); close(actual.y, reference.y); close(actual.time, reference.time);
    assert.equal(actual.score, reference.score); assert.deepEqual(actual.events, reference.events);
  }
});

test('seeded generation stays in five lanes, on the beat, and bounded for long runs', () => {
  const engine = new RhythmEngine(19); const same = new RhythmEngine(19);
  assert.deepEqual(engine.gates, same.gates); engine.start();
  for (let turn = 0; turn < 500; turn++) {
    const gate = engine.gate; const next = engine.gates.find(item => item.id === gate.id + 1)!;
    assert.ok(gate.from >= 0 && gate.from < 5 && gate.to >= 0 && gate.to < 5);
    assert.equal(Math.abs(gate.from - gate.to), 1);
    if (gate.from === 0) assert.equal(gate.direction, 1);
    if (gate.from === 4) assert.equal(gate.direction, -1);
    close(gate.entry / (BEAT / 2), Math.round(gate.entry / (BEAT / 2)));
    close(next.entry - gate.entry, intervalBeats(turn + 1) * BEAT);
    assert.ok(next.entry > gate.exit); assert.ok(next.y > gate.y);
    engine.advance(gate.exit - engine.time, () => hold(gate.direction));
    assert.equal(engine.score, turn + 1); assert.ok(engine.gates.length <= 16);
  }
  assert.equal(intervalBeats(15), 4); assert.equal(intervalBeats(16), 3.5);
  assert.equal(intervalBeats(96), 1); assert.equal(intervalBeats(10000), 1);
});

test('invalid elapsed times fail intentionally without changing state', () => {
  const engine = new RhythmEngine(); engine.start();
  for (const elapsed of [-1, Infinity, NaN]) assert.throws(() => engine.advance(elapsed, () => RELEASED));
  assert.equal(engine.time, 0);
});

test('WebMCP tool contracts share actions and reject malformed holds before mutation', async () => {
  const input = new HeldInput(); let engine = new RhythmEngine(42);
  const read = () => ({ status: engine.status, held: input.snapshot });
  const tools = gameTools({ read, async start() { if (engine.status === 'running') throw new Error('Already running'); engine = new RhythmEngine(42); engine.start(); return read(); }, hold(value) { input.set('agent', value, 10); return read(); } });
  assert.deepEqual(tools.map(tool => tool.name), ['get_game_state', 'start_run', 'set_held_directions']);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal((await tools[1].execute({}) as { status: string }).status, 'running');
  await assert.rejects(async () => tools[1].execute({}));
  tools[2].execute({ left: true, right: false }); assert.deepEqual(input.snapshot, hold(-1));
  for (const invalid of [null, {}, { left: 'yes', right: false }, { left: true, right: false, extra: true }]) assert.throws(() => tools[2].execute(invalid));
  assert.deepEqual(input.snapshot, hold(-1));
  assert.deepEqual(tools[0].execute({}), read());
  tools[2].execute({ left: false, right: false }); assert.deepEqual(input.snapshot, RELEASED);
});
