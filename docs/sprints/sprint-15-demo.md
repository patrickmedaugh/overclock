# Sprint 15 demo (round 4): Grab a card quickly

**▶ Play it:** https://overcloc.netlify.app  (works on your phone, no GitHub sign-in; hold it sideways)
Look for **"2026-11-23 06:00 UTC"** (or later) in the small note at the right of the board. If it shows an earlier time, reload.

**▶ Get the Android app:** tap **Get the Android app** at the top right of the start screen, or open https://overcloc.netlify.app/app/overclock.apk. Install it over your old app. Your decks and saved games stay.

## Round 4 (2026-11-23)

### What changed since your last try
Your round-3 feedback of 2026-11-22, point by point. QA re-checked it with real finger and mouse input at 4 screen sizes, and with the computer slowed down 4 times. **All 6 stories passed QA. The full test run is green.** No rules, cards, saves or online messages changed.

- **"The hold to drag a card still takes far too long."** A card now grabs after **0.12 s** held still (it was 0.25 s). That is only a little longer than a quick tap. If you move your finger **up or at a slant**, even a tiny bit, it grabs **at once**, with no wait. A quick tap still never grabs a card. A sideways flick in the hand view still just browses.
- **"The card should still be bigger."** The held card is now **1.5 times bigger** than last round, almost two thirds of the screen's height. It always stays fully on screen and never sits under your finger.
- **"Dragging a card from the minimized hand did not work."** Fixed. You can now drag a card from the **small hand at the bottom** to a lit place in one motion, with the hand view closed or open. (Why it failed: with the hand view open, the game took your press as browsing. With it closed, a slow drag first opened the old "hold to read" view and picked up the card next to yours.)
- **One change for you to confirm (question 2):** holding a card **still** in the small hand now **picks it up**. Before, it opened the "hold to read and slide" view. To read your cards now, **tap** the small hand: the big hand view opens. Hold-to-read stays where you can't play cards anyway: choosing cards to discard at the end of your turn.

### Try this (about 2 minutes)
Open the play link sideways → **Play on this device**. Any deal works. You start as the Corp. The numbers in brackets are the S-15-6 criteria.

1. Tap the small hand at the bottom quickly.
   - [ ] (8) The hand view opens. Nothing is picked up, nothing lights up.
2. Flick left and right a few times, then tap the big card quickly.
   - [ ] (1, 8) You browse the cards. The tap only says **"Hold to play"**.
3. Press the big card and keep still for a moment.
   - [ ] (2, 12) It grabs almost at once, **barely longer than a tap**. The card is **big** and fully on screen, and the places it can go light up.
4. Let go on an empty part of the table. Then push the big card **up or at a slant** without waiting.
   - [ ] (7, 2) The first card glides back. The push grabs the card **straight away**.
5. Close the hand view (tap the table). Put your thumb on a card in the **small hand** and drag it to a lit place in one go.
   - [ ] (2, 6) The card under your thumb is picked up and played there. Then the small hand comes back.
6. Open the hand view again and drag a card from the **small hand still showing at the bottom** to a lit place.
   - [ ] (2, 6) This works too.
7. Close the hand view. Hold a card in the small hand **still**, then let go without moving.
   - [ ] (2) It picks up (new). Letting go where you pressed puts it back and opens the hand view, like a tap.
8. Optional: end your turn, lift the "Pass the phone" cover and try steps 3 and 5 as the Runner.
   - [ ] (11) Same for the Runner.

**Still open from earlier rounds (on your phone):**
9. [ ] S-15-4: play a few turns in the browser and in the app. Movement looks smooth, and nothing feels slower than Sprint 14.
10. [ ] S-15-5: **Get the Android app** installs over the old app with no GitHub sign-in. Your decks and **Continue game** are still there. In the app, **Play online → Start a game → Share** gives a link starting with https://overcloc.netlify.app that opens on another device.

**Checked automatically (all passed):** a quick tap never grabs; a still press grabs at about 0.12 s; up and slanted drags grab at once and sideways ones browse; the held card is 1.5× and on screen at 4 sizes; drags from the small hand play the card you dragged (48 of 48 tries).

(Tick each box in your review comment, or say which failed.)

### Screenshots (two common phone sizes, 844×390 and 640×360)
- **Grabbed straight from the small hand (bigger card, every place lit):** [844×390](sprint-15-qa/r9-844x390-held-from-small-hand.png) · [640×360](sprint-15-qa/r9-640x360-held-from-small-hand.png)
- **Grabbed from the big card:** [844×390](sprint-15-qa/r9-844x390-held-from-big-card.png) · [640×360](sprint-15-qa/r9-640x360-held-from-big-card.png)
- **Played from the small hand, hand back:** [844×390](sprint-15-qa/r9-844x390-played-from-small-hand.png) · [640×360](sprint-15-qa/r9-640x360-played-from-small-hand.png)

### Small things you might notice
- **On a slow or very busy phone, a grab can take about 0.3 s longer.** When the phone freezes for a moment right after your press, the game waits a little so that a quick tap is never mistaken for a grab. On a normal phone you shouldn't see this. If grabbing still feels slow, tell us (question 1).
- **Very rarely, after a quick tap on a phone that has just stalled, a lifted card can flash for one frame.** Nothing is ever played. It's on our list.

### Didn't make it
Nothing. All 6 stories are built in full. Still for later (as before): runs don't move yet, and after passing the phone only the other player's installs and plays fly in.

### Questions for you
1. **Is the grab speed right on your phone now?** **Recommended:** A. Options: A) Yes, it feels quick. B) Still too slow. C) Too quick: a tap sometimes grabs a card by mistake.
2. **OK that holding a card still in the small hand now picks it up**, instead of opening the "hold to read and slide" view? To read, you tap the hand to open the big view. **Recommended:** A, because it follows your rule "anything longer than a quick tap should grab the card". Options: A) Yes, keep it. B) No, bring back hold-to-read on the small hand (then a still hold there could not grab).
3. **After you play a card, should the big hand view open again?** Today only the small hand comes back. **Recommended:** A. Options: A) Keep it: only the small hand comes back, so you see the whole table. B) Reopen the hand view after every play.
4. **Does the held card stepping aside over a place feel right?** It keeps the place's name and price readable but can cover part of the place next to it. **Recommended:** A. Options: A) Fine as it is. B) It jumps or covers too much: tell us where.
5. **Which did you use: phone browser, Android app, or a computer with a mouse?**
6. **Accept each story?** S-15-1 cards lift and lean · S-15-2 played cards fly and land · S-15-3 cards fly to and from the piles · S-15-4 never slower · S-15-5 play link and app download without GitHub · S-15-6 hold a card to play it.

Earlier questions still stand. If you don't answer them, we go with the recommended options ("Not enough credits" wording, movement speed as is, Sprint 16 = runs you can see).

### How to respond
Comment on **PR #34** with "accepted" or "not accepted" for each story (S-15-1 to S-15-6), your answers, and anything you'd change. Example: *"All accepted. 1A 2A 3A 4A 5 phone browser."*

### Guide to what's in this PR
At the end of the PR description (also in `docs/sprints/sprint-15-pr-guide.md`).

---

## Round 3 (2026-11-22, for reference)
Some details below changed in round 4: the grab is now 0.12 s, not a quarter of a second, and a still hold on the small hand now picks the card up.

### What changed since your last try
Your review of 2026-11-21, by step number. QA re-checked every step with real finger and mouse input, on your phone's size and 3 others, also with the computer slowed down 4 times. **All 6 stories passed QA. The full test run is green.** No rules, cards, saves or online messages changed.

- **2. A single tap selected the card and lit places.** Fixed. A tap or a quick click only shows "Hold to play". Even a slow click held still never plays: the card goes back and says "Drag it to a lit place".
- **3. Sluggish, card too small.** The held card is now about **twice as big**, close to the big card in the hand view. It sits just above your finger. **New:** over a place, it **steps sideways** so the place's name and price stay readable.
- **4. No strong glow.** The place under the card now gets a **bright, thick gold glow**, on both sides.
- **5. The hand doesn't come back.** We couldn't make this happen in 12 different tries. After a play, the **small hand at the bottom** comes back, but the big hand view does not reopen. If that's what you meant, see question 1.
- **6. Hand comes back too fast.** The card glides home **first**, then the hand rises about 0.2 s later.
- **7. Drag up from the small hand didn't work.** Fixed. It works even if your thumb starts at a slant.
- **8 and 9. "No clicks left" shown while holding.** The reason now shows **only when you let go**. The same goes for the Runner.

### Try this (about 2 minutes)
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

### Screenshots (your phone's size, 891×296)
- **The card steps aside (new):** [over HQ](sprint-15-qa/r8-891x296-aside-corp-server-hq.png) · [over a new server](sprint-15-qa/r8-891x296-aside-corp-new_server-new.png) · [Runner, over the rig](sprint-15-qa/r8-891x296-aside-runner-install.png) · [Runner event, middle of the table](sprint-15-qa/r8-891x296-aside-runner-play.png)
- **Your steps:** [2: a tap only says "Hold to play"](sprint-15-qa/r7-891x296-s15-6-step2-tap-corp.png) · [4: strong glow, Corp](sprint-15-qa/r7-891x296-s15-6-step4-hover-corp.png) · [4: strong glow, Runner](sprint-15-qa/r7-891x296-s15-6-step4-hover-runner.png) · [5: after a play, the hand is back](sprint-15-qa/r7-891x296-s15-6-step5-after-corp.png) · [7: lifted from the small hand](sprint-15-qa/r7-891x296-s15-6-step7-held-from-strip.png) · [8: dimmed, no message while held](sprint-15-qa/r7-891x296-s15-6-step8-dimmed-held-corp-strip.png) · [8: "No clicks left" on letting go](sprint-15-qa/r7-891x296-s15-6-step8-reason-on-letgo-corp-strip.png)

### Didn't make it
Nothing. All 6 stories are built in full. Still for later (as before): runs don't move yet, and after passing the phone only the other player's installs and plays fly in.
