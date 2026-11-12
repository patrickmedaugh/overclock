# @overclock/client

The game screen: Vite + PixiJS v8 + TypeScript. It sends actions through the
match host (`@overclock/match`, `LocalMatch`) and animates the per-seat events
that come back. No rules live here.

Hot-seat (Sprint 1): one device plays both seats. The active player's side is
always drawn at the bottom with their hand face up; the opponent is on top as
counts only. When the turn passes, the actor's own events (e.g. discards
flying to the pile) play first, then the board fades in for the new seat.

Sprint 2: the Corp's servers (HQ, R&D, Archives, Server 1...) with ICE drawn
sideways and stacked outward toward the Runner, the Runner's installed cards
and memory counter, and tap-to-play: tap a hand card, every spot the engine
offers (`view.handOptions`) lights up with its price, tap one to install /
play. Tap the card again or empty board to cancel.

## Board arrangements

- **Sideways phone** (`landscape`: height <= 500 and wider than tall): right
  rail with both sides' counters, banner, help and End turn; opponent's band
  on top, viewer's band below, a one-row hand strip at the bottom. The R&D and
  Archives columns are the Corp's deck and discard pile; the Runner's Stack and
  Heap start its band, then its installed cards and the Install spot.
- **Desktop / tablet** (`column`): the Sprint 1 column of rows, with the
  installed cards in the center band. On a wide window the hand is one row.
- **Overflow beyond the busy board** (3 remotes with 2 ICE each, 4 Runner
  cards) *shrinks*, it never scrolls: more servers narrow the remote columns,
  more ICE overlap in their column, more rig / hand cards overlap in their row.
  Upgrades in HQ / R&D / Archives on a sideways phone share the root cell with
  the pile (overlapping); rare, not in the starter decks' usual play.

## Commands (run from the repo root or this folder)

| Command | What it does |
|---|---|
| `npm run dev -w @overclock/client` | Dev server at http://localhost:5173/ (hot reload) |
| `npm run build` | Production build to `apps/client/dist` (base path `/overclock/` for GitHub Pages) |
| `npm run preview -w @overclock/client` | Serves the build at http://localhost:4173/overclock/ |
| `npm test -w @overclock/client` | Vitest unit tests (layout math incl. safe areas, tweens, hot-seat) |
| `npm run test:e2e` | Playwright: builds, previews, runs `e2e/` on `phone` (844x390 touch), `phone-small` (640x360 touch) and `desktop` (1280x800); `portrait` (390x844 touch) runs only `rotate.spec.ts`. Tests tagged `@upright` (safe-area shapes of an upright phone) run on desktop only. `E2E_PORT=4391` picks another port when 4173 is taken. `SAVE_SCREENS=1` also writes the busy-board / target screenshots to `docs/sprints/sprint-02-screens/`. |

Add `?seed=123` to the URL to get the same deal every time.

## Layout of the code

- `src/main.ts` — boots Pixi (`pixi.js/unsafe-eval` first), render-on-demand loop, resize/safe-area, test hook.
- `src/hotseat.ts` — `HotSeat`: wraps `LocalMatch`, bottom seat = active player, splits a turn change into actor part + new-seat part.
- `src/safeArea.ts` — reads the notch / gesture-bar insets from the hidden `#safe-probe` (`env(safe-area-inset-*)`).
- `src/layout.ts` — pure (viewport, insets, viewer) -> boxes math: viewer-relative `top`/`bottom` rows, `landscape` / `column` arrangements, `corpColumns` (server columns, ICE cells) and `runnerRig` (rig cells, Install spot, memory). Unit tested for no overlap, inside the safe area and 44px targets, incl. the busy board with notches.
- `src/tabletop.ts` — draws servers, ICE, rig, memory and the lit targets from the view; install / server-open animations.
- `src/picking.ts` — Pixi-free tap-to-play decisions, target labels and refusal hints (unit tested).
- `src/terms.ts` — the one table of game words (ICE, HQ, R&D, Archives, Server N, Stack, Heap, Memory, card types); every term is checked against `docs/GLOSSARY.md`.
- `src/board.ts` — draws the board from a `PlayerView`: rows, discard piles, banner, End turn / Confirm, discard picker, hints, game-over panel, zoom.
- `src/hand.ts` — hand cards, draw flight (250ms), discard flight, picker marks, press and long-press (350ms).
- `src/cardFace.ts` — generated placeholder card art (shapes seeded by the card's `art` key).
- `src/tween.ts` — tiny tween engine; `finishAll()` = tap-to-skip, so animations never lock input.
- `src/input.ts` — tap / long-press gestures for mouse and touch.
- `src/hook-types.ts` — `window.__overclock` test hook types (shared with e2e).

## Test hook

`window.__overclock = { getView(), dispatch(action), lastEvents(), layout(), anims(), clearAnims(), lastInput(), endTurn() }`.

- `dispatch(action)` submits as seat `action.player`; `getView()` is the bottom (active) seat's view.
- `layout()` returns CSS-pixel boxes for each side's deck/credits/clicks/discard/label (keyed `corp`/`runner` wherever they are drawn), `viewer`, `mode`, `safeArea` insets, hand cards (with `marked`, `selected`), `servers[{id, label, box, ice[], content[]}]` and `rig[]` (each card `{uid, cardId, faceUp, box, drawn}`; `cardId` null when hidden from the viewer), `memory {text, box}`, `targets[{box, label, lit, reject, action}]` (while a card is picked), `tableTexts`, `endTurn`, `picker`, `gameOver`, hint, zoom, the on-screen texts and an `animating` flag.
- `anims()` lists `{kind, startedAt, scheduledMs, text?, box?}` for every animation or hint when it *starts* (`draw_flight`, `credit_pop`, `discard_flight`, `turn_change`, `hint`, `install_flight`, `play_flight`, `server_open`). Specs assert the tap budget from these (start < 100ms after the tap, scheduled <= 600ms) and read hints from them instead of polling a 1.1s on-screen state.

- `lastInput()` is `{eventAt, handledAt}` for the last pointer release a game target handled: the DOM event's timestamp and when `src/input.ts` started on it. Tap budgets (state and animation start < 100ms) count from `handledAt`; `handledAt - eventAt` is the browser's input-queue delay (the page was busy drawing a frame), recorded as an annotation only.
- `endTurn()` is the game's own End turn clock: `armedAt` (End turn ignores taps before it: the double-tap guard, 300ms after the tap that ended the last turn) and `flipDueAt` (when the last turn change's board flip is scheduled, after any discard flight). Turn-change budgets are checked on these, not on wall-clock frames.

Always on for now; it will move behind a build flag later.

## Timing tests on a slow CPU

`E2E_CPU_THROTTLE=6 npx playwright test e2e/turn.spec.ts e2e/qa-sprint01.spec.ts --repeat-each=10`
slows the page's CPU 6x (Chrome DevTools `Emulation.setCPUThrottlingRate`, applied by `openBoard`) to check the timing tests hold on a slow runner. Budgets are never widened for it.

## Phones: safe areas, full screen, CSP

- Phones are played sideways. The manifest asks for `orientation: landscape`; an upright phone (CSS: `orientation: portrait` and `pointer: coarse` and width < 600px) shows the `#rotate` "Turn your phone sideways" overlay from `index.html` over the still-running game, so turning it back shows the same board. Tablets and desktop windows never see it.
- Everything except the backdrop is laid out inside the safe area (no counter, button or card under a notch or gesture bar). Specs simulate notched phones by overriding `#safe-probe`'s padding.
- `public/manifest.webmanifest` (`display: standalone`) and the iOS `apple-mobile-web-app-*` tags make a home-screen launch full-screen. All paths are relative, so the build works at `/overclock/` (GitHub Pages) and `/` (Netlify, `BASE_PATH=/`).
- Production builds carry a strict Content-Security-Policy meta tag (no `unsafe-eval`; see `vite.config.ts`), so every e2e run executes under it.

## Playwright notes

`@playwright/test` is pinned to the exact version of the browsers installed in
the dev container (`/opt/pw-browsers`). CI installs Chromium itself
(`npx playwright install --with-deps chromium`). If you bump the version
locally, keep it matched to the installed browser build.
