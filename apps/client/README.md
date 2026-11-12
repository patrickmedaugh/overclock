# @overclock/client

The game screen: Vite + PixiJS v8 + TypeScript. It sends actions through the
match host (`@overclock/match`, `LocalMatch`) and animates the per-seat events
that come back. No rules live here.

Playing a card (Sprint 2): tap a hand card and the places it can go light up with their price (a server column, New server, the Runner's Install slot, or the Play button), all taken from `view.handOptions`. Tap one to do it; tap the card again or empty board to cancel. Refusals come back from the engine and show a hint (Not enough credits, Needs runs (coming soon), ...).

Hot-seat (Sprint 1): one device plays both seats. The active player's side is
always drawn at the bottom with their hand face up; the opponent is on top as
counts only. When the turn passes, the actor's own events (e.g. discards
flying to the pile) play first, then the board fades in for the new seat.

## Commands (run from the repo root or this folder)

| Command | What it does |
|---|---|
| `npm run dev -w @overclock/client` | Dev server at http://localhost:5173/ (hot reload) |
| `npm run build` | Production build to `apps/client/dist` (base path `/overclock/` for GitHub Pages) |
| `npm run preview -w @overclock/client` | Serves the build at http://localhost:4173/overclock/ |
| `npm test -w @overclock/client` | Vitest unit tests (layout math incl. safe areas, tweens, hot-seat) |
| `npm run test:e2e` | Playwright: builds, previews, runs `e2e/` on `phone` (844x390 touch), `phone-small` (640x360 touch) and `desktop` (1280x800); `portrait` (390x844 touch) runs only `rotate.spec.ts`. `E2E_PORT=4391` picks another port when 4173 is taken (an already running preview on that port is reused: rebuild first). |

Add `?seed=123` to the URL to get the same deal every time.

## Layout of the code

- `src/main.ts` — boots Pixi (`pixi.js/unsafe-eval` first), render-on-demand loop, resize/safe-area, test hook.
- `src/hotseat.ts` — `HotSeat`: wraps `LocalMatch`, bottom seat = active player, splits a turn change into actor part + new-seat part.
- `src/safeArea.ts` — reads the notch / gesture-bar insets from the hidden `#safe-probe` (`env(safe-area-inset-*)`).
- `src/layout.ts` — pure (viewport, insets, table shape) -> boxes math, viewer-relative. Sideways phones (height <= 500, wider than tall): right rail (banner, help / Play, hint, your name, credits, clicks, End turn), opponent header, the two bands (Corp server columns with sideways ICE stacked toward the Runner; Runner row with Stack, Heap, installed cards, Install slot, memory), hand strip. Elsewhere (desktop, tablets): the Sprint 1 column with the bands and a control strip in the middle. Room is kept for the busy board (3 remotes x 2 ICE, 4 Runner cards); a little past it the column gaps squeeze and a crowded server fans its cards; a bigger table shrinks every card (no sideways scrolling). Unit tested for no overlap, inside the safe area (notch left/right, swipe bar) and 44px targets.
- `src/board.ts` — draws the board from a `PlayerView`: seats, piles (R&D / Archives in their server columns, Stack / Heap in the Runner row), servers, ICE, installed cards, memory, banner, End turn / Confirm, discard picker, picked-card targets from `view.handOptions`, hints, game-over panel, zoom. Widgets are built once per size and only moved/updated on a turn change.
- `src/widgets.ts` — counters, piles, End turn button, memory counter, target markers.
- `src/terms.ts` — every game word on screen (HQ, R&D, Archives, Server N, Grip, Stack, Heap, ICE, Memory...), checked against `docs/GLOSSARY.md` by `test/terms.test.ts`.
- `src/hints.ts` — one plain hint per engine refusal reason.
- `src/hand.ts` — one per seat, kept between turns: hand cards, draw flight (250ms), discard flight, picker marks, picked-card glow, press and long-press (350ms).
- `src/cardFace.ts` — generated placeholder card art (shapes seeded by the card's `art` key).
- `src/tween.ts` — tiny tween engine; `finishAll()` = tap-to-skip, so animations never lock input.
- `src/input.ts` — tap / long-press gestures for mouse and touch.
- `src/hook-types.ts` — `window.__overclock` test hook types (shared with e2e).

## Test hook

`window.__overclock = { getView(), dispatch(action), lastEvents(), layout(), anims(), clearAnims(), lastInput(), endTurn() }`.

- `dispatch(action)` submits as seat `action.player`; `getView()` is the bottom (active) seat's view.
- `layout()` returns CSS-pixel boxes for each side's deck/credits/clicks/discard/label (keyed `corp`/`runner` wherever they are drawn), `mode` (`landscape`/`portrait`), `viewer`, `safeArea` insets, hand cards (with `marked`, `selected`), `servers` (`{id, label, box, labelBox, root, ice[], content[]}` with each installed card's `{uid, cardId, faceUp, box}`), `rig`, `memory`, `targets` (`{kind, server?, box, label, lit, reject}` while a card is picked), `selected`, `labels` (every board text on screen), `endTurn`, `picker`, `gameOver`, hint, zoom (`cardId` null for a face-down card; `textOverflow`), the on-screen texts and an `animating` flag.
- `anims()` lists `{kind, startedAt, scheduledMs, text?, box?}` for every animation or hint when it *starts* (`draw_flight`, `credit_pop`, `discard_flight`, `turn_change`, `hint`, `install_flight`, `play_flight`, `server_open`). Specs assert the tap budget from these (start < 100ms after the tap, scheduled <= 600ms) and read hints from them instead of polling a 1.1s on-screen state.

- `lastInput()` is `{eventAt, handledAt, target}` for the last pointer release a game target handled: the DOM event's timestamp, when `src/input.ts` started on it, and the label of the object that took it (e.g. `target:install:`, `board:empty`). Tap budgets (state and animation start < 100ms) count from `handledAt`; `handledAt - eventAt` is the browser's input-queue delay (the page was busy drawing a frame), recorded as an annotation only.
- `endTurn()` is the game's own End turn clock: `armedAt` (End turn ignores taps before it: the double-tap guard, 300ms after the tap that ended the last turn) and `flipDueAt` (when the last turn change's board flip is scheduled, after any discard flight). Turn-change budgets are checked on these, not on wall-clock frames.

Always on for now; it will move behind a build flag later.

## Timing tests on a slow CPU

`E2E_CPU_THROTTLE=6 npx playwright test e2e/turn.spec.ts e2e/qa-sprint01.spec.ts --repeat-each=10`
slows the page's CPU 6x (Chrome DevTools `Emulation.setCPUThrottlingRate`, applied by `openBoard`) to check the timing tests hold on a slow runner. Budgets are never widened for it.

The CI bar is the unthrottled suite. Throttled, the budget checks must pass; the End turn double-tap-guard tests (`qa-sprint01.spec.ts`, "QA round 2") may stop with "no timed tap landed in [150ms, armedAt)" in a GPU-less browser (its ~300ms frame stall keeps timers from firing in that window). That is a coverage miss, not a failure of the guard; any other assertion failing there is a real bug. See DECISIONS.md (2026-11-12, CI bar for the guard test).

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
