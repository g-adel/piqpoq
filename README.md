# PIQPOQ

A minimal, top-down rhythm runner. Five lanes, two 45-degree reflections per turn, and exactly one held direction at each entry collision.

## Run

Use Node 22.13+ and npm. Run `npm install`, then `npm run dev`. Open the local URL printed by the server.

- Arrow keys: hold left or right.
- Mouse: hold the left or right button anywhere in the track.
- Touch: hold a screen half; drag across the midpoint to switch.
- Enter/Space: start or retry. Escape: pause/resume.
- Both directions held at an entry barrier ends the run.

## Architecture

`lib/game/input.ts` records timestamped input from independent sources. It has no simulation reference. `engine.ts` advances the run timeline and samples that record only at entry collisions. Transfers and exit reflections are automatic. `renderer.ts` draws SVG geometry; `audio.ts` synthesizes and schedules sound. `controller.ts` connects their lifecycles without rendering React on every frame.

120 BPM; half-beat lateral travel; a four-beat lead-in. Entry intervals decrease from four beats to one beat in half-beat steps after every 16 turns. World speed stays constant. A seeded generator keeps transfers inside five lanes and maintains a bounded lookahead.

## Checks

`npm test` runs deterministic simulation, input, and WebMCP action-contract tests. `npm run typecheck` checks TypeScript. `npm run build` creates the Sites deployment build. Browser-native WebMCP registration requires a supported browser context; the unit tests do not substitute for that integration check.
