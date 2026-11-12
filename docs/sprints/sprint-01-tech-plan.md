# Sprint 1 tech plan (architect)

Scope: S-01-1..6 with owner answers (no cover screen, End turn button, may end with clicks left). Pinned types: `packages/engine/README.md` (engine + `@overclock/match`) and § "Client test hook" below. Engine-dev lands the types first; ui-dev codes against them.

## Engine (`packages/engine`) — server-friendly: plain-JSON state/actions, per-seat projections
- **State:** `phase: 'action'|'discard'|'over'`, `result: {winner, reason:'corp_decked'}|null`, `players.*.discard: string[]` (pile, bottom = 0). `turn` counts player-turns (Corp 1, Runner 2, ...). `newGame` runs Corp's turn-1 start (3 clicks + free draw → 6 in hand, Runner 0 clicks).
- **Files:** `state.ts` (fields, `startTurn` helper), new `rules.ts` (validation table), `apply.ts` (effects only), `events.ts`, `actions.ts`, `view.ts`, README.
- **Actions:** `draw`, `gain_credit` (both sides, 1 click each), `end_turn` (any clicks left are lost), `discard {handIndices}`.
- **End of turn:** `end_turn` sets clicks 0; hand > 5 → `phase='discard'` + `discard_required{count}`; otherwise the turn passes. `discard` (exactly hand−5 distinct in-range indices) → `cards_discarded`, then the turn passes: `turn_ended`, `turn_started{player,turn,clicks}`, and for the Corp `card_drawn` or, on empty deck, `game_over` (`phase='over'`). No cancel from the discard step this sprint.
- **Validation table** (`rules.ts`, one `Record<ActionType, Check[]>`, a missing entry is a type error; `legalActions` and `apply` both use it). Order of checks = order of rejection reasons:

| action | shape | game_over | not_your_turn | wrong_phase (needs) | no_clicks | last |
|---|---|---|---|---|---|---|
| draw | player | ✓ | ✓ | action | ✓ | deck_empty |
| gain_credit | player | ✓ | ✓ | action | ✓ | — |
| end_turn | player | ✓ | ✓ | action | — | — |
| discard | player, int[] | ✓ | ✓ | discard | — | bad_discard (count/dupes/range) |

- **legalActions:** `discard` has too many combinations, so it lists one representative (the last N cards). `view.pendingDiscard` says "any N distinct indices".
- **viewFor:** adds `phase`, `pendingDiscard` (viewer only), `result`, per side `discardCount` + `discard` (ids, or `null` when face down: the Corp's discards to the Runner). **viewEvents:** the opponent loses `card_drawn.cardId` and `cards_discarded.handIndices`, and loses `cardIds` when the Corp discards.
- **Host → `packages/match` (decided now, ~80 lines):** `LocalMatch(seed)`, `view(seat)`, `submit(seat, action) → Record<Side,{view,events}>` (per-seat projected; seat ≠ action.player → `invalid_action` to that seat only), `actions()` log. Same contract a game server will expose later. ESLint: the client may not import `apply/newGame/legalActions/viewFor/replay` from the engine.

## Client (`apps/client`)
- `session.ts` replaced by `LocalMatch`. Hot-seat: bottom seat = `view.activePlayer`. After an action, the actor's events up to `turn_ended` animate in the actor's view; then the board flips to the new seat and animates the rest. Turn-change chain ≤ 600ms (discard flight 250 + flip 200; the Corp's free-draw flight follows). It is all on the skippable `fx` queue, and input goes to the new seat at once.
- **Layout is viewer-relative:** `computeLayout(w, h, insets)` returns `top`/`bottom` rows (label with hand count, credits, clicks, deck, discard pile), `handArea`, and `endTurn` (bottom-right of the center band, ≥ 44px tall, also the Confirm slot). The center banner shows "TURN n · CORP · 2 clicks left". Only the bottom row is interactive: deck → `draw`, credits → `gain_credit`.
- **End turn** glows when the viewer has 0 clicks. **Discard picker** appears when `pendingDiscard > 0`: tap marks/unmarks (selection is UI state only, capped at N), long-press still zooms, the label reads "Discard k", Confirm is enabled at k = 0 and sends `discard`. Hints: no_clicks "No clicks left", not_your_turn "Not your turn". Game-over banner text comes from `result.reason`.
- **Safe area:** a hidden `#safe-probe` div with `padding: env(safe-area-inset-*)`, read with `getComputedStyle` on start/resize/orientationchange → `insets`. Everything except the backdrop is laid out inside the safe rect. Add `manifest.webmanifest` (`display: standalone`) plus the iOS `apple-mobile-web-app-capable`/`black-translucent` meta tags so a home-screen launch is full-screen.
- **CSP / Pixi:** `import 'pixi.js/unsafe-eval'` first in `main.ts` now (no `new Function` at runtime; Capacitor/locked-down hosts). A build-only Vite `transformIndexHtml` adds a CSP meta tag (`script-src 'self'`, no unsafe-eval; `style-src 'self' 'unsafe-inline'`; `worker-src 'self' blob:`), so every e2e run executes under it.

## Client test hook (pinned, `src/hook-types.ts`)
`dispatch(action)` submits as seat `action.player`. `getView()` returns the bottom seat's view. New: `anims(): AnimRecord[]`, `clearAnims()`. `LayoutSnapshot` keeps the `corp`/`runner` keys (boxes wherever they are drawn) and adds `viewer`, `safeArea{top,right,bottom,left}`, per side `discard`/`label` boxes, text `banner`/`corpHand`/`runnerHand`/`corpDiscard`/`runnerDiscard`, `endTurn{box,label,glowing,enabled}|null`, `picker{remaining,label,confirm{box,enabled}}|null`, `hand[].marked`, `gameOver{text,box}|null`. `AnimRecord.kind`: `draw_flight | credit_pop | discard_flight | turn_change | hint`.

## Test strategy (DoD: each criterion ≥ 1 automated test; E = engine/match Vitest, P = Playwright phone+desktop)
| AC | Tests |
|---|---|
| 1-1..3 turn order, clicks, free draw | E `turn.test.ts` newGame + end_turn sequences; P `turn.spec.ts` banner/clicks/hand count per turn |
| 1-4 obvious whose turn | P banner text + clicks text == view; QA screenshots |
| 1-5 Corp decks out | E drive actions to empty deck → `game_over`, `phase='over'`, all actions → `game_over`; P drive via hook, banner "Runner wins: the Corp ran out of cards" |
| 2-1/2-2 credit, draw both sides | E `gain-credit.test.ts`, `draw.test.ts` (corp+runner); P tap credits/deck on Corp then Runner turn, anim records `credit_pop`/`draw_flight` |
| 2-3 0 clicks | E no_clicks for both; P hint via anim record |
| 2-4 not your turn | E not_your_turn for all 4 actions + `rules.test.ts` (every action × every reason, state unchanged); match seat-mismatch test; P tap top deck/credits → no events, view unchanged |
| 3-1..3 End turn, glow, early, no auto-end | E end with clicks left; after the last click it is still the same turn; P `endTurn.glowing` false→true, early end works |
| 3-4 fast, no extra screen | P state flipped < 100ms after the pointerup timestamp; turn-change anim chain scheduled ≤ 600ms; new seat's deck tap works at once |
| 4-1/4-2 active at bottom, opponent count | E viewFor/viewEvents hiding; P `viewer==activePlayer`, bottom boxes below top, hand ids == view hand, top label count |
| 5-1..4 discard | E end_turn → discard phase; discard ok/bad_discard/wrong_phase; ≤ 5 skips; P picker label, mark/unmark, long-press zoom in picker, confirm → `discard_flight`, pile count, turn passes |
| 6-1/6-2 safe area | client `layout.test.ts` shapes × insets (notch 47/34, Android 24/48, 0) all boxes inside the safe rect; P `addInitScript` style override of `#safe-probe` → every hook box inside the safe rect; P manifest present. Home-screen launch: QA/owner manual |

**CI flake fixes (budgets unchanged):** the hook logs `AnimRecord{kind, startedAt, scheduledMs, text?, box?}` when an animation or hint *starts*. Tap test: state < 100ms after the tap (wall clock, CPU-only path), animation started < 100ms after the tap, `scheduledMs` ≤ 600. The wall-clock landing time is only an annotation, because GPU-less runners add render latency that is not the game's budget. Hint test: read the `hint` record (text + box at show time) instead of polling a 1.1s state; then wait for `hint === null` (absence, 3s timeout). Existing specs are updated for Corp-first (use the active side, not `'runner'`).

## Task split (in sequence)
**engine-dev:** E1 types + README interface exactly as pinned · E2 `rules.ts` table + 4 actions + turn passing + deck-out · E3 viewFor/viewEvents · E4 `packages/match` + ESLint boundaries · E5 tests above; AI stub still compiles.
**ui-dev (after E1, ideally E4):** U1 LocalMatch + hot-seat flip · U2 viewer-relative layout + insets + End turn + piles + unit tests · U3 safe-probe, manifest, CSP + unsafe-eval · U4 credits tap, glow, hints, game-over banner · U5 discard picker · U6 hook (`anims`, snapshot fields) + e2e specs + flake fixes.

## Risks
Crowded bottom row on 360×640 (layout tests cover it; the discard pile may shrink to a counter). CSP could block a Pixi worker or Playwright injection (allow-list above; `bypassCSP` is not allowed). Turn-change chain feel: review at demo.
