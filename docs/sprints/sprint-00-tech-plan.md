# Sprint 0 tech plan (architect)

## Layout (npm workspaces, root `package.json` `workspaces: ["packages/*", "apps/*"]`)
- `packages/engine` (`@overclock/engine`): pure rules. `src/{index,state,actions,events,rng,view}.ts`, tests in `test/`.
- `packages/cards` (`@overclock/cards`): card data only (`src/runner.ts`, `src/corp.ts`, `src/types.ts`), plus `test/ip-check.test.ts`.
- `packages/ai` (`@overclock/ai`): stub exporting `chooseAction(view: PlayerView): Action` (returns first legal action); one smoke test. Imports only `viewFor` output types.
- `apps/client`: Vite + PixiJS v8. `src/{main,board,hand,tween,input,theme}.ts`; `e2e/` Playwright specs.
- Dependency direction: `cards` <- `engine` <- `ai`, `client`. Client never imports engine internals, only the public index.

## Tooling
TypeScript strict (`tsconfig.base.json`, project references, `noUncheckedIndexedAccess`). ESLint flat config (`eslint.config.js`, typescript-eslint) with a `no-restricted-globals`/`no-restricted-properties` rule in `packages/engine`: bans `Math.random`, `Date`, `setTimeout`, `window`, `document`. Vitest per package. Playwright projects: `phone` (390x844, touch) and `desktop` (1280x800, Chromium).
Root scripts: `lint`, `typecheck` (`tsc -b`), `test` (vitest across workspaces), `test:e2e` (playwright, builds+previews client), `build` (client to `apps/client/dist`).

## CI / deploy
- `.github/workflows/ci.yml`: on `pull_request` and `push`; Node 20, `npm ci`, lint, typecheck, test, then `test:e2e` (job `e2e`). Job names are stable so they can be required checks.
- `.github/workflows/deploy.yml`: on push to `main` and `sprint-*`; build with Vite `base: '/overclock/'`, `actions/upload-pages-artifact` + `actions/deploy-pages`. `concurrency: pages` (cancel-in-progress false). Last deploy wins, so https://patrickmedaugh.github.io/overclock/ always shows the newest build. The `github-pages` environment must allow `sprint-*` branches (repo setting).
- "Cannot merge when red": requires branch protection on `main` with required status checks (`ci / checks`, `ci / e2e`) via REST `PUT /repos/{owner}/{repo}/branches/main/protection`. The lead will attempt it; if permissions block it, ask the owner in the PR.

## Engine API (this sprint) — see `packages/engine/README.md`
`newGame(seed: number): GameState` · `apply(state, action): {state, events}` · `legalActions(state, player): Action[]` · `viewFor(player, state): PlayerView`.
- RNG: mulberry32, its 32-bit state lives in `GameState.rng`; every random draw returns a new rng value (no hidden module state).
- Setup: shuffle both 15-card placeholder decks, each side draws 5, 5 credits. Sprint 0 starts at the Runner's turn with 4 clicks (no turn loop yet).
- Action `{type:'draw', player:'runner'}`: -1 click, top card to hand, event `{type:'card_drawn', player, cardId}` (opponent's view hides `cardId`).
- Rejection: illegal actions never throw; state is returned unchanged with event `{type:'action_rejected', reason:'no_clicks' | 'deck_empty' | 'not_your_turn'}`. Client shows the "no clicks" hint from this event.
- State is plain JSON (serializable, structurally cloned; no classes).

## Cards
Data objects `{id, name, side, type, cost, text, art}` with original placeholder names. IP test: fails if any name/text/flavor matches (case-insensitive, word-boundary) a banned list: `netrunner`, `android`, plus a short list of well-known official card names, kept in `packages/cards/test/banned-words.ts`.

## Client
Portrait board: Corp row top, Runner row bottom; each shows deck, credits, clicks. Layout from viewport size (re-layout on resize), no fixed pixels. Tap deck -> dispatch `draw` -> animate `card_drawn` with a 250ms tween (input never locked). Long-press (350ms) on a hand card zooms; release unzooms. Theme: near-black background, cyan (Runner) / magenta (Corp) glow. Test hook `window.__overclock = {getView(), dispatch(action), lastEvents()}` exposed only for Playwright (always on in Sprint 0; behind a build flag later).

## Test strategy
Engine: determinism (same seed -> identical deals, different seed -> different), draw decrements clicks + emits `card_drawn`, `no_clicks` rejection leaves state unchanged, `viewFor` hides opponent hand/deck order. Cards: IP check, unique ids. Playwright (both viewports): board elements visible and non-overlapping (bounding boxes inside viewport), tap draws within 300ms, 0 clicks shows hint, long-press zooms/releases, first load < 5s.

## Risks
- Canvas UI is hard to assert in Playwright -> rely on the test hook + bounding boxes exported by the client.
- Pages environment / branch protection may need owner-level permissions.
- Starting on the Runner's turn deviates from RULES_SPEC (Corp first); temporary, fixed when the turn loop lands.
