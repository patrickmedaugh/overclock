> **Waiting on you**
> 1. Play the round-4 demo (`docs/sprints/sprint-15-demo.md`, about 2 minutes): quicker grab, bigger card, dragging straight from the small hand, plus the phone checks still open from earlier rounds (smoothness, installing the app from the button, Play online).
> 2. On PR #34, say **accepted / not accepted** for each of the 6 stories (S-15-1 to S-15-6) and answer questions 1–5. One line is enough, e.g. "All accepted. 1A 2A 3A 4A 5 phone browser."

## Guide to what's in this PR

**What it does:** this is all of Sprint 15. Cards now move like real cards: they lift, lean, fly, land and ripple to the piles, and a tap skips ahead. **You hold a card to play it** (Hearthstone-style), and a tap only reads it. Your round-2 fixes are in (a tap never lifts a card, a strong glow, the card moves first and then the hand, the reason shows only when you let go). Since your round-3 review there are 3 more: **a card grabs after 0.12 s, or at once if you move up or at a slant**; the held card is **1.5× bigger**; and **dragging straight from the small hand works**. The game and the Android app now come from https://overcloc.netlify.app instead of GitHub, so they keep working once the repo is private.

**Size:** 216 files, about 12,600 lines added and 730 removed. **127 files are screenshots**: 82 new Sprint 15 ones, plus 45 older Sprint 2 and Sprint 10 pictures that older tests re-save every time they run. **About 7,650 of the added lines are tests**, and about 970 more are the team's own check scripts and their tests. The game's own screen code is about 2,600 lines, mostly `board.ts`, `hand.ts` and `input.ts`. No rules, cards, online-service or save-file code changed.

### 🔍 Worth your look
- `docs/sprints/sprint-15-demo.md`: the demo notes. Round 4 is at the top: what changed against your 3 points, the "Try this" steps and the questions (grab speed, holding the small hand now picks up). Round 3 stays below for reference.
- `docs/sprints/sprint-15-proposal.md`: the sprint plan you approved. The section at the end is S-15-6 written from your PR #34 comment. Criteria marked *"Changed after owner review 2026-11-21"* are your round-2 wishes. The new note marked *"Changed after owner review 2026-11-22"* is your round-3 wish (0.12 s grab, bigger card, drag from the small hand).
- `docs/sprints/sprint-15-qa.md`: QA's report over 13 rounds. Rounds 9–13 test your round-3 changes with real finger and mouse input. Look at the table in round 9 (quick tap, 0.12 s grab, slanted drags, card size 1.5×, 48 of 48 drags from the small hand played) and the "Final per-story verdict" at the end of round 13: all 6 stories passed.
- `docs/sprints/sprint-15-qa/` (71 pictures): QA's screenshots. **New since round 3: the six `r9-…` pictures** (the bigger held card grabbed from the small hand and from the big card, and a card played from the small hand, at 844×390 and 640×360). Older ones: `r8-…` the card stepping aside over a place; `r7-…` your round-2 steps; `r1-…` cards flying, ripples and turning the phone; `r3-…` hold to play, lit places, dimmed cards with their reason. Does anything look off?
- `docs/sprints/sprint-15-screens/` (11 pictures, your phone's size): the developers' screenshots, including the **arrow on / arrow off** comparison behind the "no arrow" choice.
- `docs/DECISIONS.md` (37 new entries, 2026-11-20 to 2026-11-23): the team's recorded choices. Product-relevant ones: no arrow, strong glow only; a card you can't play lifts dimmed with its reason; your round-2 fixes; **your round-3 changes (2026-11-22): 0.12 s grab, 1.5× card, and holding the small hand now picks up instead of opening hold-to-read** (demo question 2); and the lead accepting that a grab can wait ~0.3 s longer on a very slow device so a quick tap is never mistaken for a grab (2026-11-23). The rest covers how things are built, the CI minutes plan and the architect's approvals.
- `docs/BACKLOG.md`: Sprint 15 items, with your round-2 and round-3 words quoted under S-15-6, a speed change if you ever want one, a fuller pass-the-phone replay if you want it, and small team follow-ups.
- `docs/sprints/sprint-15-tech-plan.md`: the architect's plan, now with a short section on your round-3 changes. Optional reading.

### 👀 Skim
- `apps/client/src/board.ts`: draws the table. It flies cards to their spots, the middle and the piles, and holds each pile's number until the card lands. It runs hold-to-play: lifts the held card, drops the hand away, lights every legal place, glows the one under your finger, plays the card where you let go (or sends it back), shows "Hold to play" and the reasons. New: a press on the small hand while the hand view is open now grabs that card instead of browsing.
- `apps/client/src/hand.ts`: the hand. The big card rises when pressed, a lifted card leans and glides home, cards slide when you flick, the mouse-hover lift, and the small hand dropping away while you hold a card. New: the bigger held card and the 0.12 s grab from the small hand.
- `apps/client/src/input.ts`: the low-level touch handling. New: a still hold of 0.12 s, or any move that isn't mostly downward, grabs a card from the small hand; on a phone that froze for a moment it waits until the phone catches up, so a quick tap is never taken for a grab. It also puts a card back if the phone cancels the touch (a call, the gesture bar).
- `apps/client/src/handGesture.ts`: decides what a touch was: a flick (browse), a tap (read) or a hold / upward or slanted drag (pick up). It goes by when your finger actually moved, not by when the phone got round to it. It also works out how big the held card is, where it sits by your finger and how far it steps aside off a place.
- `apps/client/src/cardFace.ts`: draws the held card's face at its new bigger size so its name stays sharp, and frees it again so memory doesn't build up.
- `apps/client/src/layout.ts`: adds the "middle of the table" area where events and operations are dropped.
- `apps/client/src/widgets.ts`: the lit-place marker, with the strong glow when a held card is over it.
- `apps/client/src/frameClock.ts`: notices when the phone draws slowly and then skips decorative movement (the lean, the glide aside), so dragging never lags behind your finger.
- `apps/client/src/gpuLimits.ts` (new): a graphics setting that makes each frame cheaper on weak graphics chips (it fixed a 0.6 s freeze on a computer).
- `apps/client/src/motion.ts` (new): decides which cards fly where after each move. It only uses what your own screen is allowed to know, so hidden cards fly as backs.
- `apps/client/src/theme.ts`, `apps/client/src/tween.ts`: a few timings (draw flight 0.24 s, end-of-turn discards quicker) and one more easing curve.
- `apps/client/src/main.ts`: starts the game. Any tap during movement finishes the movement first; the **Get the Android app** button is set up here.
- `apps/client/src/startScreen.ts`, `apps/client/src/start.css`, `apps/client/src/appDownload.ts` (new): the **Get the Android app** button and the link behind it.
- `apps/client/src/hotseat.ts`, `apps/client/src/session.ts`: pass-the-phone remembers the other player's moves so their cards can fly in after the cover lifts.
- `apps/client/src/hook-types.ts`: the list of what the test tools can read from the screen (held card, lit places, flights). Only the tests use it.
- `.github/workflows/android.yml`: builds the app as before, and also publishes the web game and the app file to the `play` branch, which is what https://overcloc.netlify.app shows.
- `.github/workflows/ci.yml`: the automatic checks, on the minutes-saving plan. Quick checks run on every push; the full screen tests run on pull requests and manual runs.
- `.github/workflows/deploy.yml` (deleted): the old GitHub Pages publish, which stops working once the repo is private.
- `.github/workflows/server.yml`, `netlify.toml`: one-line or comment changes for the new address.
- `apps/android/README.md`: how the app reaches you now (the button or the `app/overclock.apk` link).
- `scripts/play-site.mjs`, `scripts/check-site.mjs` (new): put the play site together (game + app file + "newest app" note) and check it before it's published.

### ⏭️ Skip
- `apps/client/e2e/s15-*.spec.ts` (7 new files, incl. `s15-hold.spec.ts` for hold-to-play and `s15-owner.spec.ts`, which drives your round-2 and round-3 steps like a real finger): the developers' screen tests. `apps/client/e2e/qa-sprint15.spec.ts` (new, about 3,900 lines) and `qa-sprint15-android.spec.ts` (new, the same steps in the app's build): QA's own independent tests. All of them run automatically on this PR.
- `apps/client/e2e/helpers.ts` and 24 older test files (`qa-sprint01/02/04/05/07/08/12`, `s02-…`, `s03-…`, `s04-…`, `s05-…`, `s07-…`, `s08-…`, `s09-…`, `s12-…`, `zoom.spec.ts`): older tests used to play cards by tapping; they now hold and drag like a player. Tests of the old hold-to-read on the small hand now run in the discard step, where it still exists. Their checks are the same (QA and the architect reviewed every change). Safe because they run on this PR.
- `apps/client/e2e/android.spec.ts`: also checks hold-to-play inside the app's build.
- `apps/client/test/*.test.ts` (motion, motion-leak, handGesture, input, frameClock, gpuLimits, appDownload, layout, links): quick tests of the flight planner (incl. 30 whole games proving no hidden card ever flies face up), the flick/tap/hold rules, the slow-phone rules, the app button and the share link. These run on every push.
- `scripts/ci-changes.mjs`, `scripts/check-workflows.mjs`, `scripts/ci-minutes.mjs`, `scripts/test/*.mjs` (new): team tools that decide what CI runs, refuse links that need a GitHub sign-in and count CI minutes, plus their tests.
- `package.json`, `apps/client/playwright.config.ts`, `apps/client/tsconfig.node.json`, `apps/client/scripts/check-android-bundle.mjs`: config. They add the new tests, run them at your phone's size and keep the download button out of the app itself. All checked on every push.
- `docs/TESTING.md` (how the team runs tests under the CI minutes plan), `docs/STATE.md` (the team's progress log).
- `docs/sprints/sprint-02-screens/` (5 pictures) and `docs/sprints/sprint-10-qa/` (40 pictures): old screenshots that older tests re-save whenever they run. They look the same apart from tiny pixel differences.

### Known gaps / for later
- On a very slow or busy phone, a still hold can grab about 0.3 s later than normal, so a quick tap is never mistaken for a grab (lead decision 2026-11-23). If it feels slow on your phone, say so (demo question 1).
- Very rarely, a quick tap on a phone that has just stalled flashes a lifted card for one frame. It never plays a card. It stays on the list.
- Hold-to-read and slide now works only when choosing cards to discard at the end of your turn. On the board you read by tapping (demo question 2).
- No arrow while holding, only the strong glow (it crowded your screen size). One switch brings the arrow back if you want it.
- A card you can't afford says "Not enough credits", not "Needs 5 credits" (earlier question, still open).
- After a play, only the small hand comes back, not the big hand view (demo question 3).
- A few automatic tests are sometimes slow on the test machine and pass on retry; one size check in `s15-hold` reads the card size a moment too early. They are test problems, not game problems, and the team is fixing them.
- Runs, impacts (shake and flash) and sounds don't move yet. That's the next slice.
- After passing the phone, only the other player's installs and plays fly in. Their draws and discards don't.
- The GitHub Releases page still gets each app file, but once the repo is private it needs a sign-in. Use the button instead.
- Older Sprint 1–14 demo notes still mention the old GitHub link. They are history and are not changed.
