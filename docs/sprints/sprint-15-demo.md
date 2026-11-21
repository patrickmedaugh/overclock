# Sprint 15 demo (round 2): Hold a card to play it

**▶ Play it:** https://overcloc.netlify.app  (works on your phone, no GitHub sign-in; hold it sideways)
It always shows the newest build. Look for **"Built 2026-11-21 …"** in the small note in the corner of the board. If it shows 2026-11-20, reload.

**▶ Get the app (Android):** tap **Get the Android app** at the top right of the start screen, or open https://overcloc.netlify.app/app/overclock.apk. Install it over your old app. Your decks and saved games stay. The newest app has hold-to-play too.

**Since your last look:** you said playing didn't feel like Hearthstone yet. You wanted to flick through the hand, **hold** a card to play it, see the hand get out of the way and see where the card can go, and tapping should not play. That is the new story **S-15-6**. QA checked all **12 of its criteria and they passed**. QA found one bug and it was fixed: a quick flick on a busy phone could pick up a card and play it. **All 6 Sprint 15 stories passed QA, and no bugs are open.** No rules, cards, saves or online messages changed. Your saved game and decks are safe, and a friend on an older app can still play online with you.

## What's new
- **Hold to play** (S-15-6). Flick left and right to browse your hand. **Hold a card for a quarter of a second** (or drag it upward) and it lifts under your finger. The hand drops out of the way and **every place it can go lights up**. Move it over a place and that place **glows strongly**. Let go there and the card is played. Let go anywhere else and it glides back. **Tapping never plays a card now:** a tap on the big card shows a short tip, "Hold to play".
- **You can't play it right now?** It still lifts, but dimmed, with nothing lit and a short line that says why ("No clicks left", "Not enough credits", "Not your turn"…).
- **Straight from the small hand:** you can also drag a card **up out of the small hand** at the bottom without opening the hand view.
- **Arrow: none, only the strong glow.** We tried an arrow from the card to the place on your phone's screen size (891×296). The card already sits over the place, so the arrow was mostly too short to see. It flickered on and off, and it crossed other cards and price labels. So the **strong glow is the only marker**. Compare: [Corp ICE with the arrow](sprint-15-screens/s15-6-arrow-on-corp-ice-891x296.png) vs [without](sprint-15-screens/s15-6-arrow-off-corp-ice-891x296.png) · [Runner event with the arrow](sprint-15-screens/s15-6-arrow-on-runner-event-891x296.png) vs [without](sprint-15-screens/s15-6-arrow-off-runner-event-891x296.png). If you want it back, it's one switch.

## Try this (about 2 minutes)
Open the play link sideways → **Play on this device**. Any deal works. You start as the Corp.

**A. Hold to play (S-15-6)**
1. Tap your hand to open the hand view. Flick left and right quickly, several times.
   - [ ] Criterion 1: you browse the cards and **nothing is ever picked up**.
2. Tap the big card once, quickly.
   - [ ] Criterion 8: nothing is played and nothing lights up. The card stays big and **"Hold to play"** shows.
3. Hold the big card still until it lifts.
   - [ ] Criteria 2, 3 and 12: it **reacts at once** and lifts after about a quarter of a second. The hand drops away and **every place it can go lights up at once** (servers and a new server for ICE, the middle of the table for Hedge Fund).
4. Still holding, slide it over each lit place and off again.
   - [ ] Criteria 4 and 5: the place under it **glows strongly**, then goes back to plain lit. There's no arrow (see above).
5. Let go on a lit place.
   - [ ] Criterion 6: it's played there (same cost as before), **flies and lands**, and the hand comes back up.
6. Hold another card and let go on an empty part of the table.
   - [ ] Criterion 7: nothing is played or paid, and **it glides back** into the hand.
7. Close the hand view. Put your finger on a card in the **small hand at the bottom** and drag it straight up.
   - [ ] Criterion 2: it lifts straight away, without opening the hand view.
8. Spend your clicks, then hold a card.
   - [ ] Criterion 9: it lifts **dimmed**, nothing lights up, and a line says **"No clicks left"**. Let go and it goes back.
9. End your turn, lift the "Pass the phone" cover, and play a Runner card by holding it (a program onto your rig, or an event into the middle).
   - [ ] Criterion 11: it works the same for the Runner.

**B. Still waiting on your phone (earlier stories)**
10. [ ] S-15-4, criterion 3: play a few turns **in the browser and in the app**. Movement looks smooth and nothing feels slower than Sprint 14.
11. [ ] S-15-5, criterion 3: **Get the Android app** downloads and installs over the old app with no GitHub sign-in. Your decks and **Continue game** are still there.
12. [ ] S-15-5, criteria 1, 4 and 6: in the app, go to **Play online → Start a game → Share**. The link starts with **https://overcloc.netlify.app** and opens on another device, and the game plays. The links in these notes open without a GitHub sign-in.
    - [ ] S-15-6, criterion 11 (online): while you hold a card, the other screen shows nothing. It sees the card only once you let go on a place (face down if it's hidden).
13. [ ] S-15-5, criterion 2: the corner note says **Built 2026-11-21 …** (or later).

Optional, on a computer: [ ] S-15-6, criterion 10, and S-15-2, criterion 4: press and hold a card with the mouse and drag it to a lit place. It plays and flies the same as with a finger. A plain click only shows "Hold to play".

**Checked automatically (all passed):** criterion 12's timings at 4 screen sizes, also with the computer slowed down 6 times. QA also checked flicks on a busy page, so a flick never picks up or plays a card. Online, the other phone never receives a card you're only holding.

(Tick each box in your review comment, or say which failed.)

## Screenshots (891×296)
- **Hold to play:** [a card lifted from the hand view](sprint-15-qa/r3-891x296-s15-6-held-ice-from-view.png) · [lifted from the small hand](sprint-15-qa/r3-891x296-s15-6-held-from-strip.png) · [over R&D: strong glow, no arrow](sprint-15-qa/r3-891x296-s15-6-hover-rd-no-arrow.png) · [a quick tap: "Hold to play"](sprint-15-qa/r3-891x296-s15-6-hold-to-play-tip.png)
- **Lit places:** [an asset](sprint-15-qa/r3-891x296-s15-6-lit-asset.png) · [an event (the middle of the table)](sprint-15-qa/r3-891x296-s15-6-lit-event.png) · [a program (the rig)](sprint-15-qa/r3-891x296-s15-6-lit-program.png)
- **Can't play it now:** ["No clicks left"](sprint-15-qa/r3-891x296-s15-6-dimmed-c05.png) · ["Not enough credits"](sprint-15-qa/r3-891x296-s15-6-dimmed-c01.png) · [Neural EMP before a run](sprint-15-qa/r3-891x296-s15-6-dimmed-c12.png) · [online, "Not your turn"](sprint-15-qa/r3-891x296-s15-6-online-not-your-turn.png) · [over a place you can't afford](sprint-15-qa/r3-891x296-s15-6-over-dimmed-place.png)
- **The fixed bug:** [a quick flick on a busy page only browses](sprint-15-qa/r3-891x296-s15-6-r4-busy-flick-browsed.png)
- **Earlier stories:** [press lift](sprint-15-screens/s15-1-press-lift-891x296.png) · [install mid-flight](sprint-15-screens/s15-2-install-mid-flight-891x296.png) · [score flight](sprint-15-screens/s15-3-score-flight-891x296.png) · [start screen with "Get the Android app"](sprint-15-screens/s15-5-get-app-891x296.png)

## Didn't make it
Nothing. All 6 stories were built in full, the arrow test included. The only change from the plan is the arrow decision above. From your first look, things that still apply: runs don't move yet (next slice), and after passing the phone only the other player's installs and plays fly in.

## Questions for you
1. **The reason shown on a card you can't afford.** The story's example said "Needs 5 credits". The game says **"Not enough credits"**, and the card's price is printed on the dimmed card. **Recommended:** A. Options: A) Keep "Not enough credits". B) Change it to "Needs 5 credits" (a small change, done next sprint).
2. **Do holds ever feel slow?** To make sure a quick flick never plays a card, a phone that is very busy now waits a moment longer before lifting a held card. On a normal phone it still lifts after a quarter of a second. **Recommended:** A. Options: A) Feels fine, keep it. B) Sometimes slow: tell us when (which screen, what was happening) and we'll tune it.
3. **Accept each story?** S-15-1 cards lift and lean · S-15-2 played cards fly and land · S-15-3 cards fly to and from the piles · S-15-4 never slower · S-15-5 play link and app download without GitHub · S-15-6 hold a card to play it. **Recommended:** accept all six if steps 1–13 look right on your phone. If anything is off, say "not accepted" with what you saw, and we fix it first.

Your earlier questions on movement speed and Sprint 16 still stand. If you don't answer them, we go with the recommended options (keep the speed; Sprint 16 = runs you can see).

## How to respond
Comment on **PR #34** with "accepted" or "not accepted" for each story (S-15-1 to S-15-6), your answers, and anything you'd change. Example: *"All accepted. 1A 2A."*

## Guide to what's in this PR
At the end of the PR description (also in `docs/sprints/sprint-15-pr-guide.md`).
