# Sprint 15 demo (round 3): Hold a card to play it

**▶ Play it:** https://overcloc.netlify.app  (works on your phone, no GitHub sign-in; hold it sideways)
Look for **"Built 2026-11-22 00:37"** (or later) in the small note in the corner of the board. If it shows an earlier time, reload.

**▶ Get the app (Android):** tap **Get the Android app** at the top right of the start screen, or open https://overcloc.netlify.app/app/overclock.apk. Install it over your old app. Your decks and saved games stay.

## What changed since your last try
Your review of 2026-11-21, by step number. QA re-checked every step with real finger and mouse input, on your phone's size and 3 others, also with the computer slowed down 4 times. **All 6 stories passed QA. The full test run is green.** No rules, cards, saves or online messages changed.

- **2. A single tap selected the card and lit places.** Fixed. A tap or a quick click only shows "Hold to play". Even a slow click held still never plays: the card goes back and says "Drag it to a lit place".
- **3. Sluggish, card too small.** The held card is now about **twice as big**, close to the big card in the hand view. It sits just above your finger. **New:** over a place, it **steps sideways** so the place's name and price stay readable.
- **4. No strong glow.** The place under the card now gets a **bright, thick gold glow**, on both sides.
- **5. The hand doesn't come back.** We couldn't make this happen in 12 different tries. After a play, the **small hand at the bottom** comes back, but the big hand view does not reopen. If that's what you meant, see question 1.
- **6. Hand comes back too fast.** The card glides home **first**, then the hand rises about 0.2 s later.
- **7. Drag up from the small hand didn't work.** Fixed. It works even if your thumb starts at a slant.
- **8 and 9. "No clicks left" shown while holding.** The reason now shows **only when you let go**. The same goes for the Runner.

## Try this (about 2 minutes)
Open the play link sideways → **Play on this device**. Any deal works. You start as the Corp. The numbers in brackets are the S-15-6 criteria.

1. Tap your hand to open the hand view. Flick left and right several times.
   - [ ] (1) You browse the cards. **Nothing is picked up.**
2. Tap the big card once quickly. Then press it and hold still for a second, and let go without moving.
   - [ ] (8, 6) Nothing is played and nothing lights up. A tap shows **"Hold to play"**. The still press shows **"Drag it to a lit place"**.
3. Hold the big card still until it lifts.
   - [ ] (2, 3, 12) It reacts at once and lifts after about a quarter of a second. **The card is big.** The hand drops away and every place it can go lights up.
4. Still holding, slide it over each lit place and off again.
   - [ ] (4) The place under it **glows strongly**. The card **steps aside**, so you can read the place's name and price.
5. Let go on a lit place.
   - [ ] (6) It's played there, flies and lands. **Then** the small hand comes back up.
6. Hold another card and let go on an empty part of the table.
   - [ ] (7) Nothing is played. The card glides back **first**, then the hand rises.
7. Close the hand view. Put your thumb on a card in the **small hand at the bottom** and drag it up, also at a slant.
   - [ ] (2) It lifts straight away, without opening the hand view.
8. Spend your clicks, then hold a card.
   - [ ] (9) It lifts **dimmed**, nothing lights up, and **no message shows while you hold it**. Let go: it goes back and **"No clicks left"** shows.
9. End your turn, lift the "Pass the phone" cover, and play a Runner card by holding it (a program onto your rig, or an event into the middle).
   - [ ] (11) It works the same for the Runner, steps 3 to 8 included.

**Still open from the first demo (on your phone):**
10. [ ] S-15-4: play a few turns in the browser and in the app. Movement looks smooth, nothing feels slower than Sprint 14.
11. [ ] S-15-5: **Get the Android app** installs over the old app with no GitHub sign-in. Your decks and **Continue game** are still there. In the app, **Play online → Start a game → Share** gives a link starting with https://overcloc.netlify.app that opens on another device.
    - [ ] S-15-6 (11), online: while you hold a card, the other screen shows nothing until you let go on a place.

Optional, on a computer: [ ] (10) press and hold a card with the mouse and drag it to a lit place. It plays the same as with a finger.

**Checked automatically (all passed):** the timings (react within 0.1 s, nothing blocks you more than 0.6 s) at 4 screen sizes; the other phone never receives a card you're only holding.

(Tick each box in your review comment, or say which failed.)

## Screenshots (your phone's size, 891×296)
- **The card steps aside (new):** [over HQ](sprint-15-qa/r8-891x296-aside-corp-server-hq.png) · [over a new server](sprint-15-qa/r8-891x296-aside-corp-new_server-new.png) · [Runner, over the rig](sprint-15-qa/r8-891x296-aside-runner-install.png) · [Runner event, middle of the table](sprint-15-qa/r8-891x296-aside-runner-play.png)
- **Your steps:** [2: a tap only says "Hold to play"](sprint-15-qa/r7-891x296-s15-6-step2-tap-corp.png) · [4: strong glow, Corp](sprint-15-qa/r7-891x296-s15-6-step4-hover-corp.png) · [4: strong glow, Runner](sprint-15-qa/r7-891x296-s15-6-step4-hover-runner.png) · [5: after a play, the hand is back](sprint-15-qa/r7-891x296-s15-6-step5-after-corp.png) · [7: lifted from the small hand](sprint-15-qa/r7-891x296-s15-6-step7-held-from-strip.png) · [8: dimmed, no message while held](sprint-15-qa/r7-891x296-s15-6-step8-dimmed-held-corp-strip.png) · [8: "No clicks left" on letting go](sprint-15-qa/r7-891x296-s15-6-step8-reason-on-letgo-corp-strip.png)

## Didn't make it
Nothing. All 6 stories are built in full. Still for later (as before): runs don't move yet, and after passing the phone only the other player's installs and plays fly in.

## Questions for you
1. **After you play a card, should the big hand view open again?** Today only the small hand at the bottom comes back. (After a card goes back without being played, the hand view does reopen.) **Recommended:** A. Options: A) Keep it: only the small hand comes back, so you see the whole table. B) Reopen the hand view after every play.
2. **Does the card stepping aside feel right?** It keeps the place under your finger readable, but it can cover part of the place next to it (e.g. over HQ it sits on R&D's price). On a slow phone it jumps aside instead of gliding. **Recommended:** A. Options: A) Fine as it is. B) It jumps or covers too much: tell us where.
3. **Which did you use: phone browser, Android app, or a computer with a mouse?** It helps us test on the same thing you use.
4. **Accept each story?** S-15-1 cards lift and lean · S-15-2 played cards fly and land · S-15-3 cards fly to and from the piles · S-15-4 never slower · S-15-5 play link and app download without GitHub · S-15-6 hold a card to play it.

Earlier questions still stand. If you don't answer them, we go with the recommended options ("Not enough credits" wording, hold timing as is, movement speed as is, Sprint 16 = runs you can see).

## How to respond
Comment on **PR #34** with "accepted" or "not accepted" for each story (S-15-1 to S-15-6), your answers, and anything you'd change. Example: *"All accepted. 1A 2A 3 phone browser."*

## Guide to what's in this PR
At the end of the PR description (also in `docs/sprints/sprint-15-pr-guide.md`).
