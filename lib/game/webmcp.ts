import type { Held } from './input.ts';

type Tool = {
  name: string; title: string; description: string; inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type Registry = { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> };
export type GameActions = { read: () => unknown; start: () => Promise<unknown>; hold: (held: Held) => unknown };

function objectInput(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !keys.includes(key))) throw new Error('Invalid tool input.');
  return input as Record<string, unknown>;
}

export function gameTools(actions: GameActions): Tool[] {
  const emptySchema = { type: 'object', properties: {}, additionalProperties: false };
  return [
    { name: 'get_game_state', title: 'Read game state', description: 'Read the current run, held input, and upcoming turns.', inputSchema: emptySchema, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute(input) { objectInput(input, []); return actions.read(); } },
    { name: 'start_run', title: 'Start a run', description: 'Start from ready or restart after game over. Fails during an active or paused run.', inputSchema: emptySchema, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { objectInput(input, []); return actions.start(); } },
    { name: 'set_held_directions', title: 'Hold or release directions', description: 'Set left and right held input. Both false releases input; both true fails at the next entry collision. Movement remains automatic.', inputSchema: { type: 'object', properties: { left: { type: 'boolean' }, right: { type: 'boolean' } }, required: ['left', 'right'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const value = objectInput(input, ['left', 'right']); if (typeof value.left !== 'boolean' || typeof value.right !== 'boolean') throw new Error('left and right must be booleans.'); return actions.hold({ left: value.left, right: value.right }); } },
  ];
}

export function registerGameTools(actions: GameActions): () => void {
  const registry = (document as Document & { modelContext?: Registry }).modelContext;
  if (!registry?.registerTool) return () => {};
  const lifecycle = new AbortController();
  for (const tool of gameTools(actions)) {
    try { void Promise.resolve(registry.registerTool(tool, { signal: lifecycle.signal })).catch(error => console.warn('Game tool registration failed', error)); }
    catch (error) { console.warn('Game tool registration failed', error); }
  }
  return () => lifecycle.abort();
}
