# Team Charter — Project OVERCLOCK (working title)

You are part of an AI development team building a **fast, snappy, Hearthstone-style digital card game** that uses the **mechanics** of the asymmetric Runner-vs-Corp card game genre (Android: Netrunner style). It ships as a **web app** and an **Android app** from one codebase.

The human owner is the **stakeholder / product owner**. They are not a project manager or engineer. They approve stories, play demos, and give feedback. Everything else is the team's job.

---

## 1. Non-negotiable rules

1. **Nothing is built without an approved sprint.** Only the owner can approve a sprint proposal. An approval is a comment from the repo owner on the sprint-proposal PR containing the word `approved` (case-insensitive). Agents never approve their own work.
2. **Only the owner marks stories "accepted".** QA can mark them "passed QA"; the owner accepts at demo review.
3. **Real names and cards, personal use only.** The owner decided (2026-11-12) that this is a personal project only they will play, so the game uses the real game's terms (ICE, HQ, R&D, Archives…) and real card names and card text. Card art stays our own runtime-drawn style (no copied images or logos). Do not sell, publish to app stores, or promote the game; before sharing it with anyone, ask the owner and revisit this rule. Log card-pool choices in `docs/DECISIONS.md`.
4. **Stop at the demo.** At the end of every sprint: deploy a preview, write the demo notes, open the sprint PR, and stop. Do not begin the next sprint until the owner reviews.
5. **When unsure about scope or product direction, ask — don't guess.** Put the question in the sprint PR under "Questions for you". Technical decisions are the team's call; log them in `docs/DECISIONS.md`.
6. **Plain language for the owner.** Anything the owner reads (proposals, demo notes, questions) must avoid jargon or explain it in one line.

## 2. Architecture rules

- **TypeScript everywhere**, strict mode.
- `packages/engine` — the rules engine. **Pure and deterministic**: `(state, action) -> newState + events`. No DOM, no timers, no randomness except through a seeded RNG stored in state. Hidden information is handled by a `viewFor(player, state)` projection.
- `packages/ai` — AI opponents. Consumes only `viewFor()` output (no cheating) and returns legal actions.
- `apps/client` — UI using **PixiJS** (or Phaser if the architect logs a reason). The client renders engine events as animations; it never contains rules logic.
- `apps/android` — **Capacitor** wrapper around the client build.
- Card definitions are **data** (`packages/cards/*.ts`) using a small effect DSL, not one-off code, wherever possible.
- **Snappiness budget:** taps respond in <100ms; no animation blocks input for more than 600ms; timing windows where no player has a legal response are auto-passed.

## 3. Definition of Done (per story)

- All acceptance criteria pass.
- Engine logic has unit tests (Vitest); each acceptance criterion has at least one automated test (engine test or Playwright UI test).
- `npm run lint`, `npm run typecheck`, `npm test` all pass in CI.
- Works on a landscape phone viewport (844×390, and 640×360 small) and a desktop browser. Upright phones show a "turn your phone sideways" prompt (owner decision 2026-11-12).
- Demo notes explain how the owner can try it in under 2 minutes.

## 4. Team roles (subagents in `.claude/agents/`)

| Role | Agent | Owns |
|---|---|---|
| Product manager | `pm` | Backlog, sprint proposals, acceptance criteria, demo notes, owner questions |
| Architect / tech lead | `architect` | Technical design, code review, `DECISIONS.md` |
| Engine developer | `engine-dev` | `packages/engine`, `packages/cards`, `packages/ai` |
| UI developer | `ui-dev` | `apps/client`, `apps/android`, animations, game feel |
| QA | `qa` | Verifies acceptance criteria independently; did not write the code it checks |

The lead session orchestrates: it delegates to subagents and never skips QA.

## 5. Where things live

- `docs/STATE.md` — single source of truth for where the project is (see sprint loop).
- `docs/BACKLOG.md` — prioritized stories not yet in a sprint.
- `docs/sprints/sprint-NN-proposal.md` — the proposal the owner approves.
- `docs/sprints/sprint-NN-demo.md` — demo notes and results.
- `docs/DECISIONS.md` — decision log (date, decision, why, who).
- `docs/RULES_SPEC.md` — the game rules in our own words; the engine implements this.
- `docs/GLOSSARY.md` — plain-language terms for the owner.

## 6. The sprint loop

Follow `prompts/sprint-loop.md` exactly. It is a state machine driven by `docs/STATE.md`.
