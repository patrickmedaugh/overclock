> **Waiting on you**
> 1. Play the new demo (`docs/sprints/sprint-15-demo.md`, about 2 minutes): hold to play, plus the phone checks still open from the first demo (smoothness, installing the app from the button, Play online).
> 2. On PR #34, say **accepted / not accepted** for each of the 6 stories (S-15-1 to S-15-6) and answer questions 1–2. One line is enough, e.g. "All accepted. 1A 2A."

## Guide to what's in this PR

**What it does:** this is all of Sprint 15. Cards now move like real cards: they lift, lean, fly, land and ripple to the piles, and a tap skips ahead. **You now hold a card to play it** (Hearthstone-style), and a tap only reads it. The game and the Android app now come from https://overcloc.netlify.app instead of GitHub, so they keep working once the repo is private.

**Size:** about 175 files, about 7,700 lines added and 640 removed. **100 files are screenshots**: 55 new Sprint 15 ones, plus 45 older Sprint 2 and Sprint 10 pictures that older tests re-save every time they run. **About 4,400 of the added lines are tests**, and about 600 more are the team's own check scripts. The game's own screen code is about 1,800 lines, mostly `board.ts` and `hand.ts`. No rules, cards, online-service or save-file code changed.

### 🔍 Worth your look
- `docs/sprints/sprint-15-demo.md`: the demo notes. Look at the "Try this" steps (hold to play first), the arrow decision, and the 3 questions.
- `docs/sprints/sprint-15-proposal.md`: the sprint plan you approved. The new section at the end, "Added after the demo", is S-15-6 written from your PR #34 comment. Check that it matches what you asked for.
- `docs/sprints/sprint-15-qa.md`: QA's report over 4 rounds. Rounds 3 and 4 cover hold-to-play. Look at the per-criterion tables and "Final per-story result" at the end: all 6 stories passed, and the one bug (a quick flick on a busy phone could play a card) is fixed.
- `docs/sprints/sprint-15-screens/` (11 pictures, your phone's size): the developers' screenshots. Includes the **arrow on / arrow off** comparison behind the "no arrow" choice. Look for anything that looks wrong at your phone size.
- `docs/sprints/sprint-15-qa/` (44 pictures): QA's screenshots, mostly 891×296. Round 1 (`r1-…`) shows cards flying, ripples and turning the phone. Round 3 (`r3-…`) shows hold to play: lifted cards, lit places, the strong glow with no arrow, the "Hold to play" tip, dimmed cards with their reason ("No clicks left", "Not enough credits", "Not your turn") and the flick on a busy page that now only browses. Same idea: does anything look off?
- `docs/DECISIONS.md` (19 new entries, 2026-11-20 and 2026-11-21): the team's recorded choices. Product-relevant ones: **no arrow, strong glow only**; a card you can't play lifts dimmed with the reason; hold time 0.25 s; and on a very busy phone a still hold waits a moment longer so a quick flick never plays a card (demo question 2). The rest covers how things are built, the CI minutes plan and the architect's approvals.
- `docs/BACKLOG.md`: Sprint 15 items marked built. New section "From the Sprint 15 demo, QA and architect review" holds S-15-6 with your words quoted, a speed change if you ever want one, a fuller pass-the-phone replay if you want it, and small team follow-ups.
- `docs/sprints/sprint-15-tech-plan.md`: the architect's plan (timings, how hidden cards stay hidden, how the play link is published). This one is optional reading.

### 👀 Skim
- `apps/client/src/board.ts`: draws the table. It flies cards to their spots, the middle and the piles, and holds each pile's number until the card lands. It also runs hold-to-play: it lifts the held card, drops the hand away, lights every legal place, glows the one under your finger, plays the card where you let go (or sends it back) and shows the "Hold to play" tip and the reasons. It also holds the busy-phone fix.
- `apps/client/src/hand.ts`: the hand. The big card rises when pressed, a lifted card leans and glides home, cards slide when you flick, the mouse-hover lift, and the small hand dropping out of the way while you hold a card.
- `apps/client/src/handGesture.ts`: decides what a touch was: a flick (browse), a tap (read) or a hold / upward drag (pick up). It goes by when your finger actually moved, not by when the phone got round to it. It also works out how far a dragged card leans.
- `apps/client/src/input.ts`: the low-level touch handling. It now lets you pull a card straight up out of the small hand, and puts a card back if the phone cancels the touch (a call, the gesture bar).
- `apps/client/src/layout.ts`: adds the "middle of the table" area where events and operations are dropped.
- `apps/client/src/widgets.ts`: the lit-place marker, now with the strong glow when a held card is over it.
- `apps/client/src/motion.ts` (new): decides which cards fly where after each move. It only uses what your own screen is allowed to know, so hidden cards fly as backs.
- `apps/client/src/theme.ts`, `apps/client/src/tween.ts`: a few timings (draw flight 0.24 s, end-of-turn discards quicker) and one more easing curve.
- `apps/client/src/main.ts`: starts the game. Any tap during movement finishes the movement first, the **Get the Android app** button is set up here, and the test-only movement switch lives here.
- `apps/client/src/startScreen.ts`, `apps/client/src/start.css`, `apps/client/src/appDownload.ts` (new): the **Get the Android app** button and the link behind it.
- `apps/client/src/hotseat.ts`, `apps/client/src/session.ts`: pass-the-phone remembers the other player's moves so their cards can fly in after the cover lifts.
- `apps/client/src/hook-types.ts`: the list of what the test tools can read from the screen (held card, lit places, flights). Only the tests use it.
- `.github/workflows/android.yml`: builds the app as before, and now also publishes the web game and the app file to the `play` branch, which is what https://overcloc.netlify.app shows.
- `.github/workflows/ci.yml`: the automatic checks, on the minutes-saving plan. Quick checks run on every push, and the full screen tests run on pull requests and manual runs.
- `.github/workflows/deploy.yml` (deleted): the old GitHub Pages publish, which stops working once the repo is private.
- `.github/workflows/server.yml`, `netlify.toml`: one-line or comment changes for the new address.
- `apps/android/README.md`: how the app reaches you now (the button or the `app/overclock.apk` link).
- `scripts/play-site.mjs`, `scripts/check-site.mjs` (new): put the play site together (game + app file + "newest app" note) and check it before it's published.

### ⏭️ Skip
- `apps/client/e2e/s15-*.spec.ts` (6 new files, incl. `s15-hold.spec.ts` for hold-to-play): the developers' screen tests for each story. `apps/client/e2e/qa-sprint15.spec.ts` (new, about 2,100 lines): QA's own independent tests. All of them run automatically on this PR.
- `apps/client/e2e/helpers.ts` and 18 older test files (`qa-sprint02/04/05/08/12`, `s02-…`, `s03-…`, `s05-…`, `s07-…`, `s08-…`, `s09-…`, `s12-…`): older tests used to play cards by tapping. They now hold and drag like a player. Their checks are the same (QA and the architect reviewed the changes), except checks of the removed tap-to-play itself. Safe because they run on this PR.
- `apps/client/e2e/android.spec.ts`: also checks hold-to-play inside the app's build.
- `apps/client/test/*.test.ts` (motion, motion-leak, handGesture, appDownload, layout, links): quick tests of the flight planner (incl. 30 whole games proving no hidden card ever flies face up), the flick/tap/hold rules, the app button and the share link. These run on every push.
- `scripts/ci-changes.mjs`, `scripts/check-workflows.mjs`, `scripts/ci-minutes.mjs`, `scripts/test/*.mjs` (new): team tools that decide what CI runs, refuse links that need a GitHub sign-in (these notes included) and count CI minutes, plus their tests.
- `package.json`, `apps/client/playwright.config.ts`, `apps/client/tsconfig.node.json`, `apps/client/scripts/check-android-bundle.mjs`: config. They add the new tests, run them at your phone's size and keep the download button out of the app itself. All checked on every push.
- `docs/TESTING.md` (how the team runs tests under the CI minutes plan), `docs/STATE.md` (the team's progress log).
- `docs/sprints/sprint-02-screens/` (5 pictures) and `docs/sprints/sprint-10-qa/` (40 pictures): old screenshots that older tests re-save whenever they run. They look the same apart from tiny pixel differences.

### Known gaps / for later
- No arrow while holding, only the strong glow (it crowded your screen size). One switch brings the arrow back if you want it.
- A card you can't afford says "Not enough credits", not "Needs 5 credits" (demo question 1).
- On a very busy phone a still hold lifts a little later than a quarter of a second (demo question 2).
- Runs, impacts (shake and flash) and sounds don't move yet. That's the next slice.
- After passing the phone, only the other player's installs and plays fly in. Their draws and discards don't.
- The GitHub Releases page still gets each app file, but once the repo is private it needs a sign-in. Use the button instead.
- Older Sprint 1–14 demo notes still mention the old GitHub link. They are history and are not changed.
