# @overclock/client

The game screen: Vite + PixiJS v8 + TypeScript. It sends actions to
`@overclock/engine` and animates the events that come back. No rules live here.

## Commands (run from the repo root or this folder)

| Command | What it does |
|---|---|
| `npm run dev -w @overclock/client` | Dev server at http://localhost:5173/ (hot reload) |
| `npm run build` | Production build to `apps/client/dist` (base path `/overclock/` for GitHub Pages) |
| `npm run preview -w @overclock/client` | Serves the build at http://localhost:4173/overclock/ |
| `npm test -w @overclock/client` | Vitest unit tests (layout math, tweens, session) |
| `npm run test:e2e` | Playwright: builds, previews, runs `e2e/` on `phone` (390x844 touch) and `desktop` (1280x800) |

Add `?seed=123` to the URL to get the same deal every time.

## Layout of the code

- `src/main.ts` — boots Pixi, render-on-demand loop, resize, test hook.
- `src/session.ts` — owns the engine `GameState` for this tab; exposes `viewFor('runner')` and projected events only.
- `src/layout.ts` — pure viewport -> boxes math (unit tested for no overlap / nothing off-screen).
- `src/board.ts` — draws the board from a `PlayerView`, animates events, hint toast, zoom overlay.
- `src/hand.ts` — hand cards, draw flight (250ms), press and long-press (350ms).
- `src/cardFace.ts` — generated placeholder card art (shapes seeded by the card's `art` key).
- `src/tween.ts` — tiny tween engine; `finishAll()` = tap-to-skip, so animations never lock input.
- `src/input.ts` — tap / long-press gestures for mouse and touch.
- `src/hook-types.ts` — `window.__overclock` test hook types (shared with e2e).

## Test hook

`window.__overclock = { getView(), dispatch(action), lastEvents(), layout() }`.
`layout()` returns CSS-pixel boxes for decks, counters, hand cards, the hint
and the zoomed card, plus counter text and an `animating` flag. Always on in
Sprint 0; it will move behind a build flag later.

## Playwright notes

`@playwright/test` is pinned to the exact version of the browsers installed in
the dev container (`/opt/pw-browsers`). CI installs Chromium itself
(`npx playwright install --with-deps chromium`). If you bump the version
locally, keep it matched to the installed browser build.
