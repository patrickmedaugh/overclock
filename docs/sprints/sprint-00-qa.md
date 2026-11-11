# Sprint 0 — QA report

QA date: 2026-11-11 · Branch `sprint-00` (verified at 68314fa plus the QA commit) · QA did not write the code under test.

Summary: **9 of 12 acceptance criteria PASS. 3 are BLOCKED ON OWNER** because they need GitHub repo settings (branch protection and Pages). No product bugs found. One extra IP test added by QA.

## Acceptance criteria

| Story | Criterion (short) | Result | Evidence |
|---|---|---|---|
| S-00-1 | Push runs lint, type checks and tests automatically; PR shows green/red | **PASS** | `.github/workflows/ci.yml` (on `push` to all branches + `pull_request`; jobs `checks` = lint/typecheck/test, `e2e` = Playwright). GitHub run 43047459518 on be65355: `checks` success, `e2e` success. QA check: a deliberately failing test in `packages/engine` or `packages/cards` makes `npm test` exit 1, so the job goes red. |
| S-00-1 | Failing test makes the PR red **and it cannot be merged** | **BLOCKED ON OWNER** | Red part verified (row above). "Cannot be merged" needs branch protection on `main` that requires `checks` and `e2e`. That is a repo setting the team can't change (see `docs/STATE.md`). Job names are stable, so they're ready to be required. |
| S-00-2 | Demo link opens on the phone in under 5 seconds | **BLOCKED ON OWNER** (local evidence PASS) | No public link yet: deploy run 43049521570 fails at `actions/configure-pages@v5` because Pages isn't enabled. Local production build (`vite preview`, `/overclock/` path): `e2e/load.spec.ts` › "first load is interactive in under 5 seconds" passes on phone and desktop. QA playthrough on a 390×844 phone: 218 ms with no throttling, **1.25 s** on a simulated 4G link with a 4× slower CPU, **2.73 s** on a simulated 3G link (400 ms latency, 1.6 Mbps) with a 4× slower CPU. Needs re-checking on the real link once Pages is on. |
| S-00-2 | A new sprint deploy shows up at the same link | **BLOCKED ON OWNER** (workflow verified) | `.github/workflows/deploy.yml`: runs on push to `main` and `sprint-*`, always publishes to the same Pages site, `concurrency: pages` so the last deploy wins. Its `npm run build` step succeeds on GitHub; it stops at configure-pages until the owner enables Pages and allows `sprint-*` in the `github-pages` environment. |
| S-00-3 | Phone held upright: Corp side on top, Runner side at the bottom, each with deck, credits and clicks | **PASS** | `e2e/board.spec.ts` › "Corp side is at the top and Runner side at the bottom, each with deck, credits and clicks" (phone + desktop). Screenshot `sprint-00-qa/phone-390x844-01-board-on-load.png`. |
| S-00-3 | Nothing cut off or overlapping on phone or desktop | **PASS** | `e2e/board.spec.ts` › "nothing is cut off or overlapping on load", "…with a full hand", "re-lays out when the window is resized" (phone + desktop). Note: these tests check positions the game reports about itself, so QA also checked screenshots by eye: `phone-390x844-01…07`, `desktop-1280x800-01…03`, `phone-360x640-extra-full-hand.png`. Nothing clipped or overlapping, and all text is readable. |
| S-00-4 | Tap Runner deck with clicks left: card flies into hand within a fraction of a second, one click used | **PASS** | `e2e/draw.spec.ts` › "tapping the Runner deck flies a card into the hand quickly and uses one click" (real touch tap on phone, mouse on desktop). It requires the game to update less than 100 ms after release and the card to finish landing less than 600 ms after release. It also checks clicks −1, hand +1, deck −1, and that the new card ends up in the hand. QA judgement: 600 ms max (the flight is 250 ms) counts as "a fraction of a second". Also "rapid taps are never blocked by the animation" and "the card is mid-flight…". Screenshots `phone-390x844-02-draw-mid-flight.png`, `phone-390x844-03-after-1-draw.png`. |
| S-00-4 | 0 clicks: tap draws nothing and a small "no clicks" hint appears | **PASS** | `e2e/draw.spec.ts` › 'with 0 clicks, tapping the deck draws nothing and shows a "No clicks left" hint' (game view unchanged, `no_clicks` rejection, hint fully on screen, under 10% of the screen, disappears by itself). Engine: `packages/engine/test/draw.test.ts` › "0 clicks: rejected with no_clicks, nothing drawn, state unchanged". Screenshots `phone-390x844-05-no-clicks-hint.png`, `desktop-1280x800-02-zero-clicks-hint.png`. |
| S-00-4 | Long-press a hand card: it zooms up to read, and lets go on release | **PASS** | `e2e/zoom.spec.ts` › "long-press zooms a hand card to readable size and release closes it" (real touch press on phone): over 2.5× bigger, on screen, shows name/cost/type/rules text, closes on release. Also "zooms only after the ~350ms long-press delay", "releasing early never zooms", "a quick tap on a hand card does not zoom or change the game". Screenshots `phone-390x844-06-long-press-zoom.png`, `phone-390x844-07-after-release.png`, `desktop-1280x800-03-long-press-zoom.png`. |
| S-00-4 | All placeholder names and art are original (automated check) | **PASS** | `packages/cards/test/ip-check.test.ts` (banned names/trademarks across every card's id, name, text, flavor and art key, plus a test that the checker really catches banned words). **Added by QA**: `packages/cards/test/ip-art-and-ui.test.ts`. It checks that every card's art is a generated `glyph:` key, that no two cards share art, that the client ships no image or font files, that the favicon is plain shapes, and that the client's on-screen text and page title contain no banned words. QA also read all 24 cards: every name and flavor line is original. Rules wording such as "Draw 3 cards." and "End the run." is game-mechanic phrasing, which rule 3 allows. |
| S-00-5 | Same seed twice deals exactly the same cards (automated check) | **PASS** | `packages/engine/test/new-game.test.ts` › "two games with the same seed are identical, including hands and deck order" and "different seeds give different deals". Also `replay.test.ts` and `rng.test.ts` (matches the reference random sequence). |
| S-00-5 | Draw action returns new state + a "card drawn" event the screen animates (automated check) | **PASS** | `packages/engine/test/draw.test.ts` › "moves the top card to hand, spends 1 click, emits card_drawn" (also checks the input state is not modified). The screen side is covered by the `e2e/draw.spec.ts` tap test, which checks the `card_drawn` event and the card landing in the hand. |

Criterion count: S-00-1 ×2, S-00-2 ×2, S-00-3 ×2, S-00-4 ×4, S-00-5 ×2 = 12. Result: **9 PASS, 3 BLOCKED ON OWNER** (S-00-1 "can't merge", S-00-2 both).

## Bugs found

None in product code.

One false alarm, recorded so nobody repeats it: in QA's first desktop screenshot the "No clicks left" hint was missing. A desktop screenshot at 2× takes about 1.5 s, longer than the hint stays up (1.1 s plus a 0.2 s fade). When QA slowed the page's animation clock 10× and captured again, the hint showed correctly (`desktop-1280x800-02-zero-clicks-hint.png`, `phone-390x844-05b-no-clicks-hint-slowmo.png`). The phone capture at normal speed also shows it.

## Observations (not failures; for the team / owner)

1. **Safe areas are not handled.** `index.html` sets `viewport-fit=cover`, but nothing uses `env(safe-area-inset-*)`. In a normal phone browser that's fine. In the coming Android app, or a full-screen/home-screen launch on phones with a notch or gesture bar, the "CORP · hand" label (about 14 px from the top) and the bottom hand row (about 12 px from the bottom on 390×844) could end up under the status bar or gesture bar. Suggest handling this before the Android story.
2. On a phone, the hand switches from one row to two at the 6th card, so every card moves when that card lands. It isn't overlapping or cut off, but the owner may notice it at the demo.
3. The middle of the board is empty, as expected (servers and runs come later).
4. "Empty timing windows auto-pass" (snappiness budget): **not applicable yet**. Sprint 0 has no turn loop and no response windows. QA will test it once windows exist.
5. The layout e2e tests compare positions the client reports about itself. That is reasonable for a canvas game, but it isn't pixel proof, which is why QA also checked the screenshots by eye.

## Definition of Done checklist

| Item | Result | Evidence |
|---|---|---|
| All acceptance criteria pass | Partially: 9/12 PASS, 3 BLOCKED ON OWNER (repo settings) | Table above |
| Engine logic has Vitest unit tests | PASS | `packages/engine/test/*` (25 tests) |
| Every criterion has at least one automated test | PASS | Table above. The two owner-blocked repo-setting items rely on workflow config, not a test |
| `npm run lint` | PASS (exit 0) | local |
| `npm run typecheck` | PASS (exit 0) | local |
| `npm test` | PASS: 100 tests (ai 2, cards 36 incl. 4 new QA tests, engine 25, client 37) | local |
| `npm run build` | PASS | local (main bundle 101.6 kB gzipped) |
| `CI=1 npm run test:e2e` | PASS: 28/28 (14 phone 390×844 touch, 14 desktop 1280×800) | local |
| CI green on GitHub | PASS for be65355 (`checks`, `e2e`) | run 43047459518. The newer run on 68314fa was still in progress during QA |
| Works on 390×844 phone and desktop | PASS | e2e projects + screenshots in `docs/sprints/sprint-00-qa/` |
| Demo notes (try it in under 2 minutes) | Not QA's item | PM writes them in phase DEMO |
| Original IP only | PASS | IP tests + manual review |

## Screenshots (`docs/sprints/sprint-00-qa/`, all at 2× pixel density)

- `phone-390x844-01-board-on-load.png`: board on first load
- `phone-390x844-02-draw-mid-flight.png`: right after tapping the deck
- `phone-390x844-03-after-1-draw.png`: after 1 draw (3 clicks, hand 6)
- `phone-390x844-04-zero-clicks-full-hand.png`: 0 clicks, hand 9
- `phone-390x844-05-no-clicks-hint.png`: "No clicks left" hint after tapping at 0 clicks
- `phone-390x844-05b-no-clicks-hint-slowmo.png`: same, captured with the animation clock slowed
- `phone-390x844-06-long-press-zoom.png`: long-press zoom (real touch)
- `phone-390x844-07-after-release.png`: zoom closed after release
- `phone-360x640-extra-full-hand.png`: small phone, full hand
- `desktop-1280x800-01-board-on-load.png`, `desktop-1280x800-02-zero-clicks-hint.png` (slowed clock), `desktop-1280x800-03-long-press-zoom.png`
