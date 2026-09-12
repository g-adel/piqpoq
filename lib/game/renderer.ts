import { LANE, RhythmEngine } from './engine.ts';
import type { GameEvent } from './engine.ts';
import type { Held } from './input.ts';

const NS = 'http://www.w3.org/2000/svg';
function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export class GameRenderer {
  private svg: SVGSVGElement;
  private barriers: SVGGElement;
  private player: SVGGElement;
  private impact: SVGGElement;
  private trail: SVGPolylineElement;
  private groups = new Map<number, SVGGElement>();
  private points: { x: number; y: number; time: number }[] = [];
  private flashes: (GameEvent & { until: number })[] = [];
  private width = 600;
  private height = 900;
  private scale = 1;
  private resizeObserver: ResizeObserver;
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.svg = root.querySelector('.track')!;
    this.barriers = root.querySelector('[data-barriers]')!;
    this.barriers.replaceChildren();
    this.player = root.querySelector('[data-player]')!;
    this.impact = root.querySelector('[data-impact]')!;
    this.trail = svgElement('polyline', { fill: 'none', stroke: '#b6f8ff', 'stroke-width': 2, opacity: 0.19 });
    root.querySelector('[data-trail]')!.appendChild(this.trail);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }

  private resize(): void {
    const bounds = this.root.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    this.scale = Math.min(this.width / 600, this.height / 850, 1);
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    const lanes = this.root.querySelector('[data-lanes]')!;
    lanes.replaceChildren(...[0, 1, 2, 3, 4].map(lane => svgElement('line', {
      class: 'lane', x1: this.screenX(lane * LANE), x2: this.screenX(lane * LANE), y1: 0, y2: this.height,
    })));
  }

  private screenX(x: number): number { return this.width / 2 + (x - 2 * LANE) * this.scale; }
  private screenY(y: number, camera: number): number { return this.height * 0.75 - (y - camera) * this.scale; }

  events(events: GameEvent[]): void {
    for (const event of events) {
      this.flashes.push({ ...event, until: performance.now() + (event.type === 'failure' ? 260 : 130) });
      this.points.push({ x: event.x, y: event.y, time: event.time });
    }
  }

  reset(): void { this.points = []; this.flashes = []; this.groups.clear(); this.barriers.replaceChildren(); }

  draw(engine: RhythmEngine, held: Held): void {
    const camera = engine.status === 'ready' ? 420 : engine.y;
    const activeIds = new Set(engine.gates.map(gate => gate.id));
    for (const [id, group] of this.groups) if (!activeIds.has(id)) { group.remove(); this.groups.delete(id); }
    for (const gate of engine.gates) {
      let group = this.groups.get(gate.id);
      if (!group) {
        group = svgElement('g', {});
        const d = gate.direction;
        const diagonal = `M-29 ${29 * d} L29 ${-29 * d}`;
        const parts = [
          svgElement('line', { x1: 0, x2: d * LANE, y1: 0, y2: 0, stroke: '#f05bdd', 'stroke-width': 1, opacity: 0.18 }),
          svgElement('path', { d: diagonal, stroke: '#f05bdd', 'stroke-width': 3.5, 'stroke-linecap': 'square', 'vector-effect': 'non-scaling-stroke' }),
          svgElement('path', { d: diagonal, transform: `translate(${d * LANE} 0)`, stroke: '#f05bdd', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', opacity: 0.65 }),
        ];
        for (const part of parts) group.appendChild(part);
        this.barriers.appendChild(group);
        this.groups.set(gate.id, group);
      }
      const y = this.screenY(gate.y, camera);
      group.setAttribute('transform', `translate(${this.screenX(gate.from * LANE)} ${y}) scale(${this.scale})`);
      group.setAttribute('visibility', y < -50 || y > this.height + 50 ? 'hidden' : 'visible');
      group.setAttribute('opacity', gate.id < engine.score ? '0.18' : gate.id === engine.score ? '1' : '0.48');
    }
    const angle = engine.phase === 'lateral' ? engine.gate.direction * 90 : 0;
    this.player.setAttribute('transform', `translate(${this.screenX(engine.x)} ${this.height * 0.75}) rotate(${angle})`);
    this.player.querySelector('path')!.setAttribute('fill', engine.status === 'gameover' ? '#f05bdd' : '#b6f8ff');
    if (engine.status === 'running' && this.points.at(-1)?.time !== engine.time) this.points.push({ x: engine.x, y: engine.y, time: engine.time });
    this.points = this.points.filter(point => point.time >= engine.time - 0.09);
    this.trail.setAttribute('points', this.points.map(point => `${this.screenX(point.x)},${this.screenY(point.y, camera)}`).join(' '));
    const now = performance.now();
    this.flashes = this.flashes.filter(flash => flash.until > now);
    this.impact.replaceChildren(...this.flashes.map(flash => {
      const duration = flash.type === 'failure' ? 260 : 130;
      const remaining = (flash.until - now) / duration;
      return svgElement('circle', { cx: this.screenX(flash.x), cy: this.screenY(flash.y, camera), r: 5 + 15 * (1 - remaining), fill: 'none', stroke: flash.type === 'failure' ? '#f05bdd' : '#b6f8ff', 'stroke-width': 1, opacity: remaining * 0.7 });
    }));
    (this.root.querySelector('[data-left]') as HTMLElement).dataset.held = String(held.left);
    (this.root.querySelector('[data-right]') as HTMLElement).dataset.held = String(held.right);
  }

  dispose(): void { this.resizeObserver.disconnect(); }
}
