# Sprint 11 tech plan (architect)

Scope: S-11-1, S-11-2, S-11-3, S-11-4 (cut first). Owner answers (recommended, DECISIONS 2026-11-17): Q1 A one line, card name first; Q2 A online saves kept 1 week; Q3 A a save from another `RULES_VERSION` can't continue; Q4 A. engine-dev (`s11-engine`) and ui-dev (`s11-ui`) start **together** on their own local branch names (no `reset` on a shared ref); the lead merges into `sprint-11`. **No rule changes: `RULES_VERSION` stays 4** (live online games survive this deploy). `PROTOCOL_VERSION` stays 1 (additive fields only).

## S-11-1 / S-11-2 — client only (no engine change)
Everything a label needs is already in the view: the breaker's card id is `view.rig[uid].cardId` (face up), the ICE type it breaks is the ability's printed `iceType` in card data (as the `+N` of a pump is read today), and "up to N" is the most `subs` among the engine's offered options for that ability (2 only when ≥ 2 subroutines are open; Ice Wall offers just `subs:[0]`). Which moves exist, prices, refusals: engine options, unchanged.
- **Words (`runText.ts`, pure, unit tested)**: `runOptionParts(o, run, options, rig) -> {who, what, sub?, price}`; every card-sourced run button starts with its card: `Battering Ram: break barrier sub · 2 credits`, `Battering Ram: break up to 2 barrier subs · 2 credits`, `Battering Ram: +1 str · 1 credit`, `Gordian Blade: break code gate sub "End the run" · 1 credit` (sub text only when that ability has > 1 open subroutine), `Bank Job: take credits`; `· Cyberfeeder pays` as today. Rez / choice buttons already name their card. ICE type words in `terms.ts` (`ICE_TYPE`: barrier, code gate, sentry; `TERMS.str`).
- **Fit (`runDisplay.ts`)**: keep 2-line wrap; if the label's `fontPx` would fall under `MIN_BUTTON_PX` (14 phone, 11.5 small), shorten in this order: sub text (`"End the r…"`), then the card name (`Battering…`); never the price, never the button. Snapshot += `PanelButtonSnapshot.source: string | null` (card id) and `fullLabel`.
- **S-11-2 (`runDisplay.arrange`)**: a `subs` group with **one** offered option (one open subroutine) is a plain button that sends it at once (no `multi` role). With ≥ 2: `multi` opens the pick; the empty confirm reads `Pick up to N` (N = most `subs` offered), then `Break 1 · 2 credits` / `Break 2 · 2 credits`.

## S-11-3 — save and continue
- **Pass-the-phone (engine-dev E1, `@overclock/match`)**: `LocalMatch` keeps an **accepted-only** log. New pinned API: `save(): SavedGame` = `{format: 1, rulesVersion, seed, options, actions}` (JSON, accepted actions only) and `static load(x: unknown): {ok: true, match} | {ok: false, reason: 'broken' | 'outdated' | 'finished'}` — `outdated` when `rulesVersion !== RULES_VERSION` **or** any saved action is rejected on replay; `finished` when the replayed game has a result. Golden fixture test: a Sprint 11 save replays to a pinned state hash, so an engine/card change that alters replay without bumping `RULES_VERSION` fails CI.
- **Client (ui-dev U2)**: new `savedGame.ts` (`localStorage['overclock.hotseat.v1']`, same `StoreLike` as online). `HotSeat` gets `static restore(saved)` and a `onSaved` hook; written after each accepted move, after the presentation is emitted (never in the tap path); deleted on game over. One save slot: "Play on this device" replaces it. Start screen: **Continue game** (pass-the-phone) row. Restore opens **behind the pass cover** to the seat that must act (`decision()?.seat ?? seat`), so no hand shows to the wrong player. Leave dialog text: "The game is saved. Continue it from the start screen." Android app kill: the WebView's localStorage survives process death; nothing extra (no Capacitor plugin).
- **Online (engine-dev E2, `apps/server` + `packages/protocol`)**: `IDLE_TTL_MS` = 7 days from the last move or leave. `leave` in a **started** game = leave for now: the room stores `meta.left[seat]`, closes that socket (`CLOSE_NORMAL`, `'left'`), and the other seat gets `presence {opponent: 'away', left: true}` (optional `left?: true` also on `sync`); a `resume` clears it. Lobby `leave` unchanged. The save is the room's existing log; the client stores only `{server, code, seat, token}` + `rulesVersion` + `savedAt`.
- **Online client (ui-dev U3)**: Leave sends `leave`; status "The Runner left for now. The game is saved" on `left`; Rejoin becomes **Continue game · K7QF** (no retyping). A stored seat with another `rulesVersion` shows the Q3 note locally and is forgotten (the server also expires it); game over forgets the seat.

## S-11-4 — card numbers (`cardFace.ts`, ui-dev U4)
Bottom stat line: UI font (`theme.fontFamily`, not `monoFamily`, which falls back to a mis-measured `monospace` on Android), drawn as separate "Label N" pairs that **wrap to a second line instead of scaling/clipping**, with right padding; small faces drop the label before the number. Hook exposes each stat's text box; e2e sweeps every card of both decks at 4 sizes; one Android emulator check if available, else the demo notes ask the owner.

## Tasks
| # | Owner | Dep | Task |
|---|---|---|---|
| E1 | engine | — | `local-match.ts` accepted log, `save`/`load`, `saved-game.ts`, README "Sprint 11 interface" (+ RULES_VERSION bump rule), golden fixture. **Commit first.** |
| E2 | engine | — | Room: 7-day TTL, leave-for-now, `meta.left`, `left` flag in protocol (+ protocol tests), room tests (leave → other sees left; resume clears; expires after 7 d not 3; hibernation keeps `left`). |
| E3 | engine | E1 | Property test (300 games): save at a random point → JSON → `load` → both `viewFor` deep-equal and the next 20 actions give equal events; hidden checks on restored views; `outdated`/`finished`/`broken` cases; restore of a 400-action game < 50 ms (Node). Goal `ice_wall_ram_gordian` (`SPRINT11_GOALS`). |
| U1 | ui | — | S-11-1/2 words, fit ladder, `arrange`; unit tests; `s11-break.spec.ts`. |
| U2 | ui | E1 | Pass-the-phone save/continue, cover on restore, start screen, leave text; `s11-save.spec.ts` (+ android-bundle reload test). |
| U3 | ui | E2, U2 | Online leave/continue; `s11-online.spec.ts` (two contexts). |
| U4 | ui | — | S-11-4 card stats; `s11-cards.spec.ts`. Cut first. |

**Parallel:** E1 ‖ E2 (disjoint: `packages/match` vs `apps/server` + `packages/protocol`); all E ‖ all U (engine never touches `apps/client`). ui-dev order U1 → U4 → U2 → U3: U1 (`runText`, `runDisplay`, `terms`) and U4 (`cardFace`) share only `hook-types.ts` (append-only); U2/U3 share `main.ts`, `startScreen.ts`, `leaveDialog.ts`, so they run in sequence.

## Tests (`docs/TESTING.md`: touched specs only locally; full pass in CI / QA)
New specs at phone, phone-small, desktop; `s11-break`, `s11-save`, `s11-cards` join `SHORT_SPECS` (891×296), `s11-online` does not. Old labels change ("Break up to", "+1 strength", "Rejoin"): re-run `s08-cards`, `s07-cards`, `s03-encounter`, `s03-run-readability`, `s06-start`, `s06-online`, `s10-bankjob`, `s04-back`, `android`; QA-owned `qa-sprint0x` edits are flagged to QA, never loosened. Hot-seat specs now leave a save in their context: `s06-start` home-screen asserts must allow the Continue row.

## Risks
- **Silent replay drift** after a later rules change without a version bump: golden fixture + `outdated` on any replay rejection.
- **Save blob holds the seed** (deck order) on the device: same device already holds the full state in pass-the-phone; online stores no game data. Logged.
- **Longer labels at 640×360 / 891×296**: fit ladder + `fontPx` and ≥ 44 px asserts in `s11-break`.
- **Android font clipping not reproducible in Chromium**: emulator check or owner check in demo notes.
