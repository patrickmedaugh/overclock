# @overclock/client

The game screen: Vite + PixiJS v8 + TypeScript. It sends actions through the
match host (`@overclock/match`, `LocalMatch`) and animates the per-seat events
that come back. No rules live here.

Phones are played sideways (Sprint 2): a touch screen whose short side is at
most 500px gets the phone layout (right rail with piles, counters, banner, hint
and End turn; opponent's band, viewer's band and a one-row hand strip). Held
upright it shows "Turn your phone sideways" over the board; the game carries on
underneath. Everything else (computers, tablets) keeps the Sprint 1 column.

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
| `npm run test:e2e` | Playwright: builds, previews, runs `e2e/` on `phone` (844x390 sideways, touch), `phone-small` (640x360 sideways, touch) and `desktop` (1280x800); `rotate.spec.ts` also uses an upright 390x844 phone |
| `OVERCLOCK_SCREENS=1 npx playwright test e2e/screens.spec.ts --project=phone` | Writes layout screenshots to `docs/sprints/sprint-02-screens/` |

Add `?seed=123` to the URL to get the same deal every time. Add
`&preview=busy` to draw a sample busy board (6 servers with 2 ICE each, 6 rig
cards) into the layout's installed-card slots, for layout reviews (display
only; the game itself is unchanged).

## Layout of the code

- `src/main.ts` — boots Pixi (`pixi.js/unsafe-eval` first), render-on-demand loop, resize/safe-area, test hook.
- `src/hotseat.ts` — `HotSeat`: wraps `LocalMatch`, bottom seat = active player, splits a turn change into actor part + new-seat part.
- `src/safeArea.ts` — reads the notch / gesture-bar insets from the hidden `#safe-probe` (`env(safe-area-inset-*)`).
- `src/device.ts` — phone or desktop (`(pointer: coarse)` and short side <= 500px), and the upright-phone "Turn your phone sideways" overlay (`#rotate` in index.html).
- `src/layout.ts` — pure (viewport, insets, mode) -> boxes math, viewer-relative `top`/`bottom` rows; `serverSlots` / `rigSlots` place installed cards (ICE sideways, toward the opponent) with tap boxes that never overlap. Unit tested on both modes, incl. the busy board on 844x390 and 640x360 with a notch on either side.
- `src/preview.ts` — the `?preview=busy` layout preview.
- `src/guard.ts` — the End turn double-tap guard (compares tap timestamps).
- `src/board.ts` — draws the board from a `PlayerView`: rows, discard piles, banner, End turn / Confirm, discard picker, hints, game-over panel, zoom.
- `src/hand.ts` — hand cards, draw flight (250ms), discard flight, picker marks, press and long-press (350ms).
- `src/cardFace.ts` — generated placeholder card art (shapes seeded by the card's `art` key).
- `src/tween.ts` — tiny tween engine; `finishAll()` = tap-to-skip, so animations never lock input.
- `src/input.ts` — tap / long-press gestures for mouse and touch.
- `src/hook-types.ts` — `window.__overclock` test hook types (shared with e2e).

## Test hook

`window.__overclock = { getView(), dispatch(action), lastEvents(), layout(), anims(), clearAnims() }`.

- `dispatch(action)` submits as seat `action.player`; `getView()` is the bottom (active) seat's view.
- `layout()` returns `mode` ('phone' | 'desktop'), `rotatePrompt`, and CSS-pixel boxes for each side's deck/credits/clicks/discard/label (keyed `corp`/`runner` wherever they are drawn), `viewer`, `safeArea` insets, hand cards (with `marked`), `endTurn`, `picker`, `gameOver`, hint, zoom, the on-screen texts and an `animating` flag.
- `anims()` lists `{kind, startedAt, scheduledMs, text?, box?}` for every animation or hint when it *starts* (`draw_flight`, `credit_pop`, `discard_flight`, `turn_change`, `turn_flip`, `hint`). `turn_flip` is logged when the new seat's board starts fading in; its `text` says what started it (`now`, `timer` or `skip`). Specs assert the tap budget from these (start < 100ms after the tap, scheduled <= 600ms) and read hints from them instead of polling a 1.1s on-screen state.

Always on for now; it will move behind a build flag later.

## Phones: safe areas, full screen, CSP

- Everything except the backdrop is laid out inside the safe area (no counter, button or card under a notch or gesture bar). Specs simulate notched phones by overriding `#safe-probe`'s padding.
- `public/manifest.webmanifest` (`display: standalone`) and the iOS `apple-mobile-web-app-*` tags make a home-screen launch full-screen. All paths are relative, so the build works at `/overclock/` (GitHub Pages) and `/` (Netlify, `BASE_PATH=/`).
- Production builds carry a strict Content-Security-Policy meta tag (no `unsafe-eval`; see `vite.config.ts`), so every e2e run executes under it.

## Playwright notes

- Slow-device run: `OVERCLOCK_CPU_THROTTLE=4 npx playwright test e2e/qa-sprint01.spec.ts --repeat-each=5` (4x slower CPU via Chromium's DevTools protocol).
- The End turn double-tap guard compares tap timestamps (`event.timeStamp`), so the guard specs construct their extra taps at fixed offsets inside the ending tap's release and send them once the next board is up.

`@playwright/test` is pinned to the exact version of the browsers installed in
the dev container (`/opt/pw-browsers`). CI installs Chromium itself
(`npx playwright install --with-deps chromium`). If you bump the version
locally, keep it matched to the installed browser build.
