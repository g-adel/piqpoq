import { RhythmAudio } from './audio.ts';
import { BEAT, LEAD_IN, MAX_FRAME_GAP, RhythmEngine } from './engine.ts';
import { HeldInput, RELEASED } from './input.ts';
import { GameRenderer } from './renderer.ts';
import { registerGameTools } from './webmcp.ts';

export function mountGame(root: HTMLElement): () => void {
  let engine = new RhythmEngine(42);
  const input = new HeldInput();
  const audio = new RhythmAudio();
  const renderer = new GameRenderer(root);
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const query = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const overlay = query('[data-overlay]');
  const title = query('[data-title]');
  const eyebrow = query('[data-eyebrow]');
  const instructions = query('[data-instructions]');
  const startButton = query<HTMLButtonElement>('[data-start]');
  const pauseButton = query<HTMLButtonElement>('[data-pause]');
  const muteButton = query<HTMLButtonElement>('[data-mute]');
  const countIn = query('[data-count-in]');
  const score = query('[data-score]');
  const status = query('[data-status]');
  let epoch = 0;
  let lastFrame = performance.now();
  let resumeAt: number | null = null;
  let starting = false;
  let frame = 0;
  let mouseActive = false;
  const touches = new Set<number>();
  let lastScore = -1;
  let lastStatus = '';

  const read = () => ({ status: engine.status, time: engine.time, phase: engine.phase, position: { x: engine.x, y: engine.y }, lane: engine.lane, score: engine.score, held: input.snapshot, failure: engine.failure, upcoming: engine.gates.filter(gate => gate.id >= engine.score).slice(0, 4).map(gate => ({ direction: gate.direction === -1 ? 'left' : 'right', entryTime: gate.entry, exitTime: gate.exit, from: gate.from + 1, to: gate.to + 1 })) });

  function paintUI(): void {
    const state = resumeAt !== null ? 'resuming' : engine.status;
    root.dataset.playing = String(state === 'running' || state === 'resuming');
    if (lastScore !== engine.score) { score.textContent = String(engine.score).padStart(2, '0'); lastScore = engine.score; }
    if (state === lastStatus) return;
    lastStatus = state;
    overlay.hidden = state === 'running' || state === 'resuming';
    pauseButton.hidden = state !== 'running' && state !== 'resuming';
    if (state === 'gameover') {
      title.textContent = 'OFF TRACK';
      eyebrow.textContent = `${engine.score} ${engine.score === 1 ? 'TURN' : 'TURNS'} COMPLETED`;
      const direction = engine.gate.direction === -1 ? 'left' : 'right';
      instructions.textContent = engine.failure === 'both' ? 'One direction at a time. You were holding both.' : engine.failure === 'missing' ? `Hold ${direction} before the barrier arrives.` : `That barrier needed a ${direction} hold.`;
      startButton.textContent = 'Try again ↗';
      status.textContent = `Run ended. ${engine.score} turns. ${instructions.textContent}`;
      startButton.focus({ preventScroll: true });
    } else if (state === 'paused') {
      title.textContent = 'PAUSED';
      eyebrow.textContent = 'TAKE A BEAT';
      instructions.textContent = 'Resume when you’re ready. Two beats to settle in.';
      startButton.textContent = 'Resume ↗';
      status.textContent = 'Game paused.';
      startButton.focus({ preventScroll: true });
    } else if (state === 'running') status.textContent = 'Run started. Hold the direction of the next barrier.';
  }

  function stopInput(): void { input.clear(performance.now()); mouseActive = false; touches.clear(); }

  function pause(): void {
    if (starting) { starting = false; startButton.disabled = false; }
    stopInput();
    if (engine.status !== 'running' && resumeAt === null) return;
    engine.pause(); resumeAt = null; audio.stop(); countIn.hidden = true; paintUI();
  }

  async function start(): Promise<unknown> {
    if (starting) throw new Error('A run is already starting.');
    if (engine.status !== 'ready' && engine.status !== 'gameover') throw new Error('A run can only start from ready or game over.');
    starting = true; startButton.disabled = true;
    const unlocked = await audio.unlock();
    if (signal.aborted || !starting) return read();
    const notice = query('[data-audio-notice]');
    notice.hidden = unlocked;
    notice.textContent = 'Sound is unavailable. You can still play.';
    engine = new RhythmEngine(crypto.getRandomValues(new Uint32Array(1))[0]);
    renderer.reset(); engine.start();
    epoch = performance.now() + 80; lastFrame = performance.now();
    audio.bind(0, 0.08);
    starting = false; startButton.disabled = false;
    paintUI(); renderer.draw(engine, input.snapshot);
    return read();
  }

  async function resume(): Promise<void> {
    if (engine.status !== 'paused' || resumeAt !== null || starting) return;
    starting = true; startButton.disabled = true;
    await audio.unlock();
    if (signal.aborted || !starting) return;
    const now = performance.now();
    resumeAt = now + 1000; epoch = resumeAt - engine.time * 1000; lastFrame = now;
    audio.bind(engine.time, 1); audio.countIn();
    starting = false; startButton.disabled = false;
    paintUI();
  }

  const activate = () => { if (engine.status === 'paused') void resume(); else if (engine.status === 'ready' || engine.status === 'gameover') void start(); };
  startButton.addEventListener('click', activate, { signal });
  pauseButton.addEventListener('click', pause, { signal });
  muteButton.addEventListener('click', () => {
    const muted = audio.toggle();
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    muteButton.title = muted ? 'Unmute sound' : 'Mute sound';
    root.querySelector('[data-mute-line]')!.setAttribute('visibility', muted ? 'visible' : 'hidden');
  }, { signal });

  window.addEventListener('keydown', event => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault(); input.set(event.code, { left: event.code === 'ArrowLeft', right: event.code === 'ArrowRight' }, performance.now());
    } else if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault(); if (engine.status === 'paused' && resumeAt === null) void resume(); else pause();
    } else if ((event.code === 'Enter' || event.code === 'Space') && !event.repeat && !(event.target instanceof Element && event.target.closest('button'))) {
      event.preventDefault(); activate();
    }
  }, { signal });
  window.addEventListener('keyup', event => {
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') { event.preventDefault(); input.set(event.code, RELEASED, performance.now()); }
  }, { signal });
  const isControl = (target: EventTarget | null) => target instanceof Element && !!target.closest('button, [data-overlay]');
  root.addEventListener('mousedown', event => {
    if (isControl(event.target) || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault(); mouseActive = true; input.mouse(event.buttons, performance.now());
  }, { signal });
  window.addEventListener('mousemove', event => { if (mouseActive) input.mouse(event.buttons, performance.now()); }, { signal });
  window.addEventListener('mouseup', event => { if (mouseActive) { input.mouse(event.buttons, performance.now()); if (!(event.buttons & 3)) mouseActive = false; } }, { signal });
  const touch = (event: PointerEvent) => {
    const bounds = root.getBoundingClientRect();
    input.touch(event.pointerId, event.clientX, bounds.left + bounds.width / 2, performance.now());
  };
  root.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || isControl(event.target)) return;
    event.preventDefault(); touches.add(event.pointerId); root.setPointerCapture(event.pointerId); touch(event);
  }, { signal });
  root.addEventListener('pointermove', event => { if (touches.has(event.pointerId)) { event.preventDefault(); touch(event); } }, { signal });
  const releaseTouch = (event: PointerEvent) => { if (touches.delete(event.pointerId)) input.releaseTouch(event.pointerId, performance.now()); };
  root.addEventListener('pointerup', releaseTouch, { signal });
  root.addEventListener('pointercancel', releaseTouch, { signal });
  root.addEventListener('lostpointercapture', releaseTouch, { signal });
  root.addEventListener('contextmenu', event => event.preventDefault(), { signal });
  root.addEventListener('wheel', event => event.preventDefault(), { signal, passive: false });
  window.addEventListener('blur', pause, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); }, { signal });

  function tick(now: number): void {
    if (signal.aborted) return;
    const gap = (now - lastFrame) / 1000;
    lastFrame = now;
    if ((engine.status === 'running' || resumeAt !== null) && gap > MAX_FRAME_GAP) pause();
    if (resumeAt !== null) {
      countIn.hidden = false;
      countIn.textContent = String(Math.max(1, Math.ceil((resumeAt - now) / 500)));
      if (now >= resumeAt) { engine.resume(); resumeAt = null; countIn.hidden = true; }
    }
    if (engine.status === 'running') {
      const targetTime = Math.max(0, (now - epoch) / 1000);
      const events = engine.advance(Math.max(0, targetTime - engine.time), time => input.at(epoch + time * 1000));
      renderer.events(events);
      for (const event of events) audio.event(event);
      if (engine.status === 'running') audio.schedulePulse();
      countIn.hidden = engine.time >= LEAD_IN || engine.status !== 'running';
      if (!countIn.hidden) countIn.textContent = String(Math.max(1, 4 - Math.floor(engine.time / BEAT)));
    }
    paintUI(); renderer.draw(engine, input.snapshot);
    frame = requestAnimationFrame(tick);
  }

  const unregister = registerGameTools({ read, start, hold(held) { input.set('agent', held, performance.now()); renderer.draw(engine, input.snapshot); return read(); } });
  paintUI(); renderer.draw(engine, input.snapshot); frame = requestAnimationFrame(tick);
  return () => { lifecycle.abort(); unregister(); cancelAnimationFrame(frame); audio.dispose(); renderer.dispose(); stopInput(); };
}
