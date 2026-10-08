import { LANE, type GameEvent, type Gate, type RhythmEngine } from './engine.ts';
import type { Held } from './input.ts';
import { barrierOffset, contactPoint, IMPACT_DURATION, sampleMotion } from './motion.ts';

const NS = 'http://www.w3.org/2000/svg';
function svgElement<T extends keyof SVGElementTagNameMap>(name: T, attributes: Record<string, string | number>): SVGElementTagNameMap[T] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}
type BarrierView = { group: SVGGElement; entry: SVGPathElement; exit: SVGPathElement; link: SVGLineElement };
type ImpactView = { event: GameEvent; group: SVGGElement; face: SVGPathElement; sparks: SVGLineElement[]; failureAt: number };

export class GameRenderer {
  private svg: SVGSVGElement;
  private barriers: SVGGElement;
  private player: SVGGElement;
  private body: SVGPathElement;
  private impact: SVGGElement;
  private lanes: SVGGElement;
  private trail: SVGPolylineElement;
  private trailCore: SVGPolylineElement;
  private groups = new Map<number, BarrierView>();
  private points: { x: number; y: number; time: number }[] = [];
  private flashes: ImpactView[] = [];
  private width = 600;
  private height = 900;
  private scale = 1;
  private cameraX = 0;
  private cameraY = 0;
  private resizeObserver: ResizeObserver;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private root: HTMLElement;
  private leftHint: HTMLElement;
  private rightHint: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.svg = root.querySelector('.track')!;
    this.barriers = root.querySelector('[data-barriers]')!;
    this.barriers.replaceChildren();
    this.player = root.querySelector('[data-player]')!;
    this.body = this.player.querySelector('path')!;
    this.impact = root.querySelector('[data-impact]')!;
    this.lanes = root.querySelector('[data-lanes]')!;
    this.leftHint = root.querySelector('[data-left]')!;
    this.rightHint = root.querySelector('[data-right]')!;
    const trailGroup = root.querySelector('[data-trail]')!;
    trailGroup.replaceChildren();
    this.trail = svgElement('polyline', { fill: 'none', stroke: '#b6f8ff', 'stroke-width': 5, opacity: 0.07, 'stroke-linejoin': 'round' });
    this.trailCore = svgElement('polyline', { fill: 'none', stroke: '#b6f8ff', 'stroke-width': 1.5, opacity: 0.3 });
    trailGroup.appendChild(this.trail); trailGroup.appendChild(this.trailCore);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    this.resize();
  }

  private resize(): void {
    const bounds = this.root.getBoundingClientRect();
    this.width = bounds.width; this.height = bounds.height;
    this.scale = Math.min(this.width / 600, this.height / 850, 1);
    this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    this.lanes.replaceChildren(...[0, 1, 2, 3, 4].map(lane => svgElement('line', {
      class: 'lane', x1: this.width / 2 + (lane - 2) * LANE * this.scale,
      x2: this.width / 2 + (lane - 2) * LANE * this.scale, y1: 0, y2: this.height,
    })));
  }

  private screenX(x: number): number { return this.width / 2 + (x - 2 * LANE - this.cameraX) * this.scale; }
  private screenY(y: number): number { return this.height * 0.75 - (y - this.cameraY) * this.scale; }

  events(events: GameEvent[]): void {
    for (const event of events) {
      const group = svgElement('g', { fill: 'none' });
      const face = svgElement('path', { d: `M-13 ${13 * event.direction} L13 ${-13 * event.direction}`, stroke: '#efffff', 'stroke-width': 2.5 });
      group.appendChild(face);
      const sparks = Array.from({ length: 5 }, (_, i) => {
        const spark = svgElement('line', { stroke: i % 2 ? '#f05bdd' : '#dfffff', 'stroke-width': i === 2 ? 1.6 : 1 });
        group.appendChild(spark); return spark;
      });
      this.impact.appendChild(group);
      this.flashes.push({ event, group, face, sparks, failureAt: performance.now() });
      this.points.push({ x: event.x, y: event.y, time: event.time });
    }
  }

  reset(): void {
    this.points = []; this.flashes = []; this.groups.clear();
    this.barriers.replaceChildren(); this.impact.replaceChildren();
    this.cameraX = 0; this.cameraY = 0;
  }

  private createBarrier(gate: Gate): BarrierView {
    const group = svgElement('g', {});
    const diagonal = `M-29 ${29 * gate.direction} L29 ${-29 * gate.direction}`;
    const link = svgElement('line', { x1: 0, x2: gate.direction * LANE, y1: 0, y2: 0, stroke: '#f05bdd', 'stroke-width': 1 });
    const entry = svgElement('path', { d: diagonal, stroke: '#f05bdd', 'stroke-width': 3.5, 'stroke-linecap': 'square', 'vector-effect': 'non-scaling-stroke' });
    const exit = svgElement('path', { d: diagonal, stroke: '#f05bdd', 'stroke-width': 2, 'stroke-linecap': 'square', 'vector-effect': 'non-scaling-stroke' });
    group.appendChild(link); group.appendChild(entry); group.appendChild(exit);
    this.barriers.appendChild(group);
    return { group, entry, exit, link };
  }

  draw(engine: RhythmEngine, held: Held): void {
    const reduced = this.reducedMotion.matches;
    const motion = sampleMotion(engine, held, reduced);
    this.cameraX = motion.cameraX;
    this.cameraY = engine.status === 'ready' ? 420 : engine.y + motion.cameraY;
    this.lanes.setAttribute('transform', `translate(${-this.cameraX * this.scale} 0)`);
    const activeIds = new Set(engine.gates.map(gate => gate.id));
    for (const [id, view] of this.groups) if (!activeIds.has(id)) { view.group.remove(); this.groups.delete(id); }
    for (const gate of engine.gates) {
      let view = this.groups.get(gate.id);
      if (!view) { view = this.createBarrier(gate); this.groups.set(gate.id, view); }
      const y = this.screenY(gate.y);
      view.group.setAttribute('transform', `translate(${this.screenX(gate.from * LANE)} ${y}) scale(${this.scale})`);
      view.group.setAttribute('visibility', y < -60 || y > this.height + 60 ? 'hidden' : 'visible');
      const entered = gate.id < engine.score || (gate.id === engine.score && engine.phase === 'lateral');
      const completed = gate.id < engine.score;
      view.group.setAttribute('opacity', completed ? String(0.18 + 0.82 * Math.max(0, 1 - (engine.time - gate.exit) / 0.25)) : gate.id === engine.score ? '1' : '0.48');
      view.link.setAttribute('opacity', entered && !completed ? '0.36' : '0.12');
      for (const isExit of [false, true]) {
        const face = isExit ? view.exit : view.entry;
        const age = engine.time - (isExit ? gate.exit : gate.entry);
        const hit = (isExit ? completed : entered) && age >= 0 && age < IMPACT_DURATION;
        const strength = hit ? Math.exp(-age / 0.055) : 0;
        const offset = barrierOffset(gate, isExit);
        const flex = reduced || !hit ? 0 : (isExit ? 1 : -1) * 2.5 * Math.sin(Math.min(1, age / 0.12) * Math.PI) * Math.exp(-age / 0.065);
        face.setAttribute('transform', `translate(${offset.x + gate.direction * flex} ${offset.y + flex})`);
        face.setAttribute('stroke', strength > 0.18 ? '#efffff' : '#f05bdd');
        face.setAttribute('stroke-width', String((isExit ? 2 : 3.5) + strength * 2));
        face.setAttribute('opacity', String(isExit && !entered ? 0.65 : 1));
      }
    }
    const playerY = engine.status === 'ready' ? this.height * 0.75 : this.screenY(engine.y);
    const bodyScale = this.scale;
    this.player.setAttribute('transform', `translate(${this.screenX(engine.x)} ${playerY}) rotate(${motion.angle}) scale(${bodyScale * motion.scaleX} ${bodyScale * motion.scaleY})`);
    this.body.setAttribute('fill', engine.status === 'gameover' ? '#f05bdd' : motion.energy > 0.6 ? '#efffff' : '#b6f8ff');
    if (engine.status === 'running' && this.points.at(-1)?.time !== engine.time) this.points.push({ x: engine.x, y: engine.y, time: engine.time });
    this.points = this.points.filter(point => point.time >= engine.time - (reduced ? 0.07 : 0.14));
    const trailPoints = this.points.map(point => `${this.screenX(point.x)},${this.screenY(point.y)}`).join(' ');
    this.trail.setAttribute('points', trailPoints); this.trailCore.setAttribute('points', trailPoints);
    this.trail.setAttribute('opacity', String(reduced ? 0 : 0.06 + 0.08 * motion.energy));
    this.trailCore.setAttribute('opacity', String(0.22 + 0.18 * motion.energy));
    this.drawImpacts(engine, reduced);
    this.leftHint.dataset.held = String(held.left); this.rightHint.dataset.held = String(held.right);
  }

  private drawImpacts(engine: RhythmEngine, reduced: boolean): void {
    this.flashes = this.flashes.filter(flash => {
      const { event, group, face, sparks } = flash;
      const age = event.type === 'failure' ? (performance.now() - flash.failureAt) / 1000 : engine.time - event.time;
      const duration = event.type === 'failure' ? 0.26 : IMPACT_DURATION;
      if (age >= duration) { group.remove(); return false; }
      const contact = contactPoint(event);
      group.setAttribute('transform', `translate(${this.screenX(contact.x)} ${this.screenY(contact.y)}) scale(${this.scale})`);
      const remaining = Math.max(0, 1 - age / duration);
      face.setAttribute('opacity', String(Math.pow(remaining, 3)));
      face.setAttribute('stroke', event.type === 'failure' ? '#f05bdd' : '#efffff');
      sparks.forEach((spark, i) => {
        // A small fan on the reflected side of the surface, not a radial burst.
        const angle = (event.type === 'exit' ? -Math.PI / 2 : event.direction === 1 ? 0 : Math.PI) + (i - 2) * 0.32;
        const distance = 4 + age * (105 + (i % 3) * 48);
        const length = (5 + (i % 3) * 3) * remaining;
        spark.setAttribute('x1', String(Math.cos(angle) * distance)); spark.setAttribute('y1', String(Math.sin(angle) * distance));
        spark.setAttribute('x2', String(Math.cos(angle) * (distance + length))); spark.setAttribute('y2', String(Math.sin(angle) * (distance + length)));
        spark.setAttribute('opacity', String(reduced ? 0 : remaining * remaining * (event.type === 'exit' ? 0.6 : 0.9)));
      });
      return true;
    });
  }

  dispose(): void { this.resizeObserver.disconnect(); }
}
