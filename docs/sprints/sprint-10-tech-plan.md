# Sprint 10 tech plan (architect)

Scope: S-10-1, S-10-2, S-10-3, S-10-5, S-10-6 (owner 2026-11-16: Q2 A both scored piles at the far right of their row; S-10-4 dropped). engine-dev (`sprint-10-engine`) and ui-dev (`sprint-10-ui`) start **together**; helper branches are not pushed; the lead merges into `sprint-10`. Only S-10-3 touches the engine; S-10-1/2/5/6 are client-only (scores, points, tags, link are already in `viewFor`). `RULES_VERSION = 4` (live online games expire on deploy; demo notes say so). `PROTOCOL_VERSION` stays 1.

## Engine interface (pinned; E1 copies it to `packages/engine/README.md` "Sprint 10 interface")
- **Advance stops at the requirement (agendas only).** `advance` check `belowRequirement` after `ownAdvanceable`: an installed **agenda** with `advancements >= advancementRequirement` → `condition_not_met`. Advanceable ICE (Ice Wall) is unchanged. `installedOptions` no longer lists `advance` for such an agenda (only `score`). The refusal goes only to the Corp's seat (rejections are never broadcast), so it leaks nothing. RULES_SPEC notes the house rule.
- **Bank Job amount.** DSL: `take_credits.amount` += `'chosen'` (the player picks 1..hosted credits). Bank Job uses `{op:'take_credits', amount:'chosen'}`; label "Take credits". Action `activate` += optional `amount?: number`. Checks, appended to `activate` in order: `activateAmount` → `invalid_action` if `amount` is given but not an integer, or given for an ability with no `'chosen'` effect, or missing for one with it; `bad_target` if outside 1..`hostedCredits`. The run step `success` view lists **one `activate` option per amount 1..N** (`gain` = amount; cost 0), then `pass` (= Access cards), mirroring `trace_bid`. `abilityGain(installed, ability, amount?)`. Taking all still trashes it (`trashWhenEmpty`) and the run ends `access_replaced`. No new events (`credits_taken`/`credit_gained` as today). AI: Runner takes the highest offered amount.
- **viewFor**: no new fields. Hidden info unchanged (Bank Job and its credits are face up).
- **Test goals** (`@overclock/match`, `SPRINT10_GOALS`, core decks): `agenda_at_requirement`, `agenda_one_short`, `ice_wall_advanced`, `corp_two_scored` (incl. a PSF), `runner_two_stolen`, `psf_installed_unscored`, `runner_tagged_full_rig` (≥ 4 rig cards, Globalsec, tagged), `remote_single_card_no_ice` (+ another remote, for the lane check), `runner_must_discard` / `corp_must_discard`. Existing `runner_bank_job_remote` covers Bank Job.

## Client (rules-free: every count, limit and refusal comes from the view or card data)
- **Layout (`layout.ts`)**: new `CorpBand.scored` and `RigBand.scored` slots (one card unit, far right of each row; Corp: right of New server; Runner: right of the stats column). The Runner's `memory` box becomes a **stats column**: Memory, Link, Tagged (Tagged slot always reserved, so nothing moves). Both widths enter `corpWidth`/`rigWidth` and the busy-board fit. If 640×360 / 891×296 cannot fit, the pile shrinks to a 44 px stub (count + top card's name strip) before cards shrink; labels shrink, never buttons. `computeLayout` unit test: every box pairwise clear at the 4 sizes × both viewers × busy board.
- **Scored pile (`widgets.ts` `ScoredPile`)**: face-up latest agenda + "2 agendas · 3 points" (from `scored`/`points`); empty = faint outline, `eventMode 'none'`. Tap (≥ 2 or 1 card) opens the carousel (hand-view code, `carousel.ts`) over `players[side].scored`; tap outside closes; hold still reads. In the Corp's own pile, tapping PSF shows its `score:corp:<i>` options ("Do 1 meat damage · 1 click", dimmed reason as Sprint 9). The score pill keeps its Sprint 9 tap shortcut. `agenda_scored`/steal flights now land on the pile.
- **Unscored PSF hint**: tapping an installed agenda whose card data has `scoredAbilities` adds a dimmed, untappable "Do 1 meat damage: score it first" beside Advance/Score (text from card data, no engine option).
- **Link/Tagged**: off the identity card and the name row; into the stats column. Tagged tap → `basicOptions` as today.
- **Bank Job**: step `success` shows "Take credits" + "Access cards". "Take credits" opens the trace bid control (`bidLayout`, `traceText` helpers generalised to any amount list): −, number, +, Max, "Take 3"; amounts = the offered `activate.amount`s. A small Back returns to the two buttons.
- **Archives lane (S-10-5)**: first write a failing e2e for the owner's case. Columns, labels and piles stay keyed by `ServerId` (never by index); Archives column always drawn (outline when empty); `server_removed` folds that column out while columns to its right tween left (≤ 300 ms, input not blocked); trash flights target the Archives root box of the **new** layout.
- **Discard step**: a tap on the hand opens the carousel in discard mode; tap marks/unmarks (stamp), Confirm "Discard N" lit only at the engine's count; sends `discard{indices}`. The hold-and-slide strip path for discard is removed.
- **S-10-6**: toasts/trace bubble placed with a `clearOf(...)` of every visible button box (End turn incl.) at all sizes; the build label hides while the game-over box is up. ui-dev removes only the `test.fail` marker of QA's "QA-S9-4" test (QA-owned edit, logged).

## Tasks
| # | Owner | Dep | Task |
|---|---|---|---|
| E1 | engine | — | Types (`'chosen'`, `activate.amount`), rule-table stubs, README "Sprint 10 interface", RULES_SPEC, `RULES_VERSION = 4`. **Commit first; ui-dev merges it.** |
| E2 | engine | E1 | S-10-3 advance cap: `belowRequirement`, `installedOptions`, AI never offered it; tests (at limit refused, one short → then only score, Ice Wall still advances, over-limit never reachable in a 300-game property run). |
| E3 | engine | E1 | S-10-3 Bank Job: card data, `activateAmount`, per-amount options, `abilityGain`, AI; tests (take 3 of 8 → 5 left, Access → 8 left, take 8 → Heap, every bad amount refused, room parity online). |
| E4 | engine | E1 | `SPRINT10_GOALS` + seeds in README. |
| U1 | ui | — | **Start now**: layout slots + stats column + `computeLayout` overlap tests at 4 sizes; `ScoredPile` widget; move Link/Tagged. |
| U2 | ui | U1, E4 | Scored pile carousel, PSF from the pile, unscored hint, flights; S-10-1/S-10-2 e2e. |
| U3 | ui | E1 | Bank Job amount control (generalised bid control); Advance hidden comes free from the view; S-10-3 e2e incl. two-context online. |
| U4 | ui | E4 | Archives lane repro + fix; tap-to-open discard; S-10-5 e2e. |
| U5 | ui | — | S-10-6 toast placement + build label (cut first). |

## Test plan (`docs/TESTING.md`: only touched specs locally; full pass in CI / QA)
- Engine/cards Vitest per S-10-3 criterion; client unit: `layout.test.ts` (overlap grid, 4 sizes), `traceText`/amount helpers.
- New e2e: `s10-scored.spec.ts`, `s10-stats.spec.ts`, `s10-bankjob.spec.ts`, `s10-online.spec.ts` (Bank Job amount on both devices; scored pile on both), `s10-board.spec.ts` (Archives lane, discard tap, S-10-6). All run at phone, phone-small, desktop.
- **phone-short (891×296)** runs only `SHORT_SPECS`; add `s10-scored`, `s10-stats`, `s10-bankjob` and `s10-board` (not `s10-online`). Each new overlap check also asserts ≥ 44 px buttons there.
- Touched specs to re-run locally (3 sizes): `s09-ui`, `s09-cards`, `s09-online`, `s07-cards`, `s07-online`, `s03-corp-score`, `discard`, `short-rail`, `s08-identity`, `s08-markers`, `board`, `s02-board`. QA-owned specs that assumed take-all Bank Job or score-pill-only PSF (`qa-sprint07/08/09`): ui-dev flags them; QA edits or approves each change.

## Risks
- **Row width at 640×360 / 891×296** with two extra slots: U1 lands the layout first, measured; stub fallback above; cards may not shrink below today's busy-board size without architect sign-off.
- **Changing Bank Job** breaks Sprint 7/8 tests that expect "take all": update to "Max", never loosen.
- **Archives bug root cause unknown**: repro test before fix; if it is engine-side (server order/ids), engine-dev fixes in E4.
- Discard carousel must not block input > 600 ms (open tween as the hand view).
