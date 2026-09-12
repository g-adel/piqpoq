'use client';
import { useEffect, useRef } from 'react';
import { mountGame } from '@/lib/game/controller';
export default function RhythmGame() {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { if (root.current) return mountGame(root.current); }, []);
  return (
    <main ref={root} className="game" aria-label="PIQPOQ rhythm runner">
      <svg className="track" viewBox="0 0 600 900" aria-label="Five lanes with diagonal redirecting barriers" role="img">
        <g data-lanes>{[100, 200, 300, 400, 500].map(x => <line key={x} className="lane" x1={x} x2={x} y1="0" y2="900" />)}</g>
        <g data-marks />
        <g data-barriers stroke="#f05bdd" strokeWidth="3" fill="none">
          <path d="M272 373 L328 317 M372 373 L428 317" />
          <path d="M305 345 H395" strokeWidth="1" opacity=".2" />
        </g>
        <g data-trail />
        <g data-impact />
        <g data-player transform="translate(300 675)"><path d="M0 -13 L9 10 L0 6 L-9 10 Z" fill="#b6f8ff" /></g>
      </svg>
      <header className="hud">
        <div className="score"><span>TURNS</span><output data-score aria-label="Completed turns">00</output></div>
        <div className="hud-actions">
          <button className="icon-button" data-mute aria-label="Mute sound" aria-pressed="false" title="Mute sound">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z M15 8q5 4 0 8 M18 5q8 7 0 14" /><path data-mute-line d="M3 3 21 21" visibility="hidden" /></svg>
          </button>
          <button className="icon-button" data-pause aria-label="Pause game" title="Pause (Esc)" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
          </button>
        </div>
      </header>
      <section className="overlay" data-overlay aria-labelledby="game-title">
        <p className="eyebrow" data-eyebrow>120 BPM · FIVE LANES</p>
        <h1 id="game-title" data-title>PIQPOQ</h1>
        <p className="instructions" data-instructions>Hold the turn. Let the barrier redirect you.<br />One wrong direction ends the run.</p>
        <button className="start-button" data-start>Start run <span aria-hidden="true">↗</span></button>
        <span className="key-hint">Arrow keys · mouse buttons · touch halves</span>
      </section>
      <div className="count-in" data-count-in hidden />
      <div className="input-hints" aria-hidden="true">
        <div className="input-hint" data-left><b>←</b><span>HOLD LEFT</span></div>
        <div className="input-hint" data-right><span>HOLD RIGHT</span><b>→</b></div>
      </div>
      <p className="audio-notice" data-audio-notice hidden />
      <p className="sr-only">Hold the left or right arrow key, mouse button, or half of the touchscreen. Hold exactly one direction when you reach a barrier. Press Escape to pause.</p>
      <p className="sr-only" role="status" data-status />
    </main>
  );
}
