# Decision log

Format: `YYYY-MM-DD — decision — why — alternatives considered — who`

- 2026-11-10 — One TypeScript codebase for web + Android (Capacitor) — one build to test, owner can play demos in a browser — native Kotlin, Unity — owner + kickoff
- 2026-11-10 — Pure deterministic rules engine separate from UI — lets agents test rules without a screen; enables replays and AI — rules inside UI framework — kickoff
- 2026-11-10 — Original card names/art/text only; mechanics inspired by the genre — avoid IP problems if the game is ever published — licensed content — owner + kickoff
- 2026-11-10 — PM agent writes stories; owner approves via "approved" PR comment — owner has no PM experience — owner writes stories — owner
- 2026-11-10 — Visual style: neon cyberpunk (dark, glowing cyan/magenta) — owner answer to Sprint 0 question 1 — corporate-dystopia, gritty street — owner
- 2026-11-10 — Keep working title "Project OVERCLOCK" — owner answer to Sprint 0 question 2 — rename later — owner
- 2026-11-11 — npm workspaces monorepo (packages/engine, cards, ai; apps/client) with TS project references — zero extra tooling, one `npm ci` — pnpm, Turborepo, Nx — architect
- 2026-11-11 — Vite + PixiJS v8 for the client — fast dev/build, Pixi is the charter default and fine for 2D card UI — Phaser, DOM/CSS-only — architect
- 2026-11-11 — Vitest for unit tests, Playwright (390x844 touch + 1280x800 desktop) for UI tests via a `window.__overclock` test hook — canvas is hard to assert by DOM; hook exposes view/dispatch/events only, no rules — pixel snapshots only, Cypress — architect
- 2026-11-11 — ESLint flat config bans Math.random, Date, timers, window/document inside packages/engine — enforces determinism mechanically — code review only — architect
- 2026-11-11 — Seeded RNG = mulberry32 with its state stored in GameState — tiny, fast, serializable, good enough for shuffles — seedrandom lib, xorshift128 — architect
- 2026-11-11 — Illegal actions return unchanged state + `action_rejected` event (e.g. `no_clicks`) instead of throwing — client can animate hints from events uniformly; AI/replays never crash — throwing errors, boolean return — architect
- 2026-11-11 — Sprint 0 game starts on the Runner's turn with 4 clicks (deviation from RULES_SPEC "Corp first") — no turn loop yet and the demo is about Runner drawing; removed when turn loop lands — build turn loop now — architect
- 2026-11-11 — GitHub Pages deploys from main and sprint-* branches to one URL (/overclock/, Vite base `/overclock/`), last deploy wins — owner keeps a single stable link — per-branch preview URLs (Netlify/Vercel) — architect
- 2026-11-11 — "Cannot merge when red" via branch protection on main with required CI checks, set through GitHub REST API by the lead — only way GitHub blocks merges — honor-system — architect
- 2026-11-11 — IP check is an automated Vitest test over all card names/text against a short banned-word list (Netrunner, Android, select official card names) — cheap guardrail for rule 3 — manual review only — architect
- 2026-11-11 — Card instances in deck/hand are card definition ids (duplicates = extra copies); starter decks are the 12 unique cards per side plus 3 extra copies to reach the plan's 15 — simplest model for Sprint 0; per-instance ids come when installed cards need their own counters — unique instance ids now, 15 unique cards per side — engine-dev
- 2026-11-11 — Added `invalid_action` reject reason for malformed/unknown actions so `apply` never throws on untyped input (client JSON, replays) — keeps the "never throws" contract — throwing on bad shapes — engine-dev
- 2026-11-11 — Rejection precedence: invalid_action, not_your_turn, no_clicks, deck_empty — simplest order (who, then can you pay, then is it possible) — other orders — engine-dev
- 2026-11-11 — `PlayerView` carries the viewer's `legalActions`; new `viewEvents(player, events)` hides opponent draw ids; `replay(seed, actions)` exported for regression tests — AI must work from the view only; events need the same hidden-info projection as state — AI calling legalActions on full state — engine-dev
- 2026-11-11 — AI stub `chooseAction(view)` returns `Action | null` (null when nothing is legal) instead of `Action` — type-safe under noUncheckedIndexedAccess; nothing-to-do is a real case — throwing — engine-dev
- 2026-11-11 — Engine has no `hasMeaningfulResponse` yet — Sprint 0 has no timing windows; it lands with the first window (runs/rez) — stub that mirrors legalActions — engine-dev
- 2026-11-11 — Root `test` runs `vitest run` per workspace (`npm run test --workspaces --if-present`); tsconfig `types: []` keeps Node/DOM globals out of engine/cards/ai — workspaces without tests (or added later) are tolerated; purity enforced by the type checker too — single root Vitest projects config — engine-dev
