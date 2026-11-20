# Sprint 15 demo — Cards that move like Hearthstone

**▶ Play it:** https://overcloc.netlify.app  (works on your phone, no GitHub sign-in; hold it sideways)
This is the new play link from now on. It always shows the newest build. Right now that is Sprint 15, **"Built 2026-11-20 20:38 UTC"** (small note in the corner of the board).

**▶ Get the app (Android):** tap **Get the Android app** at the top right of the play link's start screen, or open https://overcloc.netlify.app/app/overclock.apk (always the newest app file).
File right now: `overclock-sprint-15-20261120-2038-b128.1.apk`. Install it over your Sprint 14 app. Your decks and saved games stay.

> **Making the repo private:** you can do it whenever you like (Settings → Danger Zone → Change visibility). Nothing in these notes needs GitHub. The old GitHub play link and the Releases page will stop working for anyone not signed in. The only GitHub links here are the screenshots below, which open on GitHub and will need you signed in once the repo is private.

**Saved games, decks and online:** no rules, cards or online messages changed this sprint. Your **saved pass-the-phone game still continues**, your decks are all still there, and **a friend still on the Sprint 14 app can play online with you** (both versions talk to the online service the same way). This sprint only changes how things move on the screen.

**Results:** QA checked all **25 criteria across 5 stories: every one that can be checked without your phone passed, no game bugs**, in two rounds. QA found one slow team test (not a game bug); it was fixed and checked again. **Your part is the phone checks** (steps 9–12 below): smoothness on your phone, installing the app from the button, and Play online on the new link. You already told us the live site "looks good" after you switched Netlify to the `play` branch. Thank you.

## What's new
- **Cards lift and lean in your hand** (S-15-1). In the hand view, the big card **rises and grows a little** the moment your finger lands on it. When you hold it until it lifts out, it **follows your finger and leans** the way you move (more lean when you move faster) and straightens when you stop. Let go away from a lit place and it **glides back** into the hand. Swiping from card to card now **slides** instead of jumping (your Sprint 9 wish). With a mouse, the card you point at lifts a little and leans toward the pointer.
- **Played cards fly to the board and land** (S-15-2). Drop a card on a lit place and it **flies there and lands with a small settle**. The Corp's face-down cards fly **face down**, so the Runner never sees them. One-shot cards (Sure Gamble, Diesel, Hedge Fund…) **fly to the middle, show for a moment, then go to the discard pile**. The other player's cards **fly in from their side** of the table (online, and after passing the phone).
- **Cards fly to and from the piles** (S-15-3). A drawn card **flies from the deck into your hand** while the other cards slide aside. Trashed and discarded cards fly to Archives or the Heap. Scored or stolen agendas fly to the score pile and the **points tick up with a short glow**. Each pile's number changes **when the card lands**, not before. Several cards at once go in a **quick ripple**, about half a second in all.
- **Never slower than before** (S-15-4). Each flight takes about **a quarter of a second** (your choice, question 1 A). **Tap anything while cards move and the movement jumps to its end at once**, and your tap counts. Nothing stops you from playing for more than 0.6 seconds.
- **A play link and app download that work with a private repo** (S-15-5). The game now lives at **https://overcloc.netlify.app** (your choice, question 3 A), and the start screen has a **Get the Android app** button (question 4 A). The app's **Share** link for online games now points at the new address. The GitHub Pages link is switched off for good, and no team check depends on it any more.

## Try this (about 3 minutes, plus the app)
Open https://overcloc.netlify.app on your phone (sideways) → **Play on this device**. Any deal works.

**A. Corp's turn (you play the Corp first)**
1. Tap your hand to open the hand view. Put your finger on the big card in the middle and keep it still for a moment.
   - [ ] S-15-1, criterion 1: the card **rises and grows a little straight away**. Lift your finger quickly instead (a plain tap) and it settles back.
2. Swipe left and right through your hand.
   - [ ] S-15-1, criterion 4: the cards **slide** into place instead of jumping.
3. Hold a card until it lifts out, then move it left and right, fast and slow, and stop.
   - [ ] S-15-1, criterion 2: it stays under your finger, **leans** the way you move (more when faster), and **straightens** when you stop.
4. Still holding, let go somewhere that is **not** lit.
   - [ ] S-15-1, criterion 3: it **glides back** into the hand.
5. Hold a card (ICE, an asset or an agenda), drag it to a lit **new server** and let go.
   - [ ] S-15-2, criterion 1: it **flies** from your finger to its spot and **lands with a small bounce**. (If you have **Hedge Fund**, play it too: it flies to the middle, shows, then goes to Archives. That is criterion 3 for the Corp.)
6. Tap **R&D** twice to draw 2 cards, then **End turn**. You'll have more cards than you may keep, so pick the extras to discard.
   - [ ] S-15-3, criterion 1: each drawn card **flies from R&D into your hand** and the others slide aside.
   - [ ] S-15-3, criteria 2 and 4: the discarded cards fly to **Archives one just after another**, the Archives number **goes up as each one lands**, and it is all over in about half a second.

**B. Runner's turn (after the "Pass the phone" cover)**
7. Tap the cover to lift it.
   - [ ] S-15-2, criteria 2 and 5: the Corp's card **flies in face down from the top** (from the Corp's side) to its server. You never see its face.
8. Tap your **Stack** to draw. Then play any **event** (Sure Gamble, Diesel, Easy Mark…) from the hand view and, while it is still in the middle of the table, **tap the table**.
   - [ ] S-15-3, criterion 1 (Runner): the card flies from the Stack into your hand.
   - [ ] S-15-2, criterion 3: the event flies to the **middle**, shows for a moment, then flies to the **Heap** (Heap number goes up as it lands).
   - [ ] S-15-4, criterion 1: your tap makes it **jump to the end at once** and the tap is answered straight away.
   - If you get the chance while playing on: **steal an agenda** (or let the Corp score one). [ ] S-15-3, criterion 3: it flies to the score pile and the **points tick up with a short glow** as it lands. (Also checked automatically.)

**C. Your phone checks (these only you can do)**
9. Play 2–3 more turns in the **phone browser**: draw, install, play events, end turns with discards.
   - [ ] S-15-4, criterion 3 (browser): movement looks **smooth** (no stutter), and nothing feels slower than in Sprint 14.
10. Back on the start screen of the play link, tap **Get the Android app** (top right). Install it over your old app.
    - [ ] S-15-5, criterion 3: it downloads and installs **over** the old app with no GitHub sign-in. In the app, **Decks** still shows your decks and **Continue game** (if you had a saved game) still works.
    - [ ] S-15-4, criteria 3 and 5 (app): play a turn or two in the app. The same movement plays, and it is smooth.
11. Look at the small "Built …" note in the corner of the board on the play link.
    - [ ] S-15-5, criterion 2: it says **Built 2026-11-20 20:38 UTC** (or later if the team pushed again). If it shows an older date, tell us.
12. In the **app**: **Play online → Start a game**, tap **Share** (or copy the link). Open that link on a computer or a second phone (or send it to a friend) and join.
    - [ ] S-15-5, criterion 4: the shared link starts with **https://overcloc.netlify.app**.
    - [ ] S-15-5, criterion 1: the game starts on the play link and **Play online** works.
    - [ ] S-15-2, criterion 5 and S-15-4, criterion 5 (online): when one side installs or draws, the other screen sees it fly in from the top, as a card back if it's hidden.
13. [ ] S-15-5, criterion 6: every link in these notes (the play link and the app link) opens **without a GitHub sign-in**. (The screenshot links below are GitHub pages and are the only exception.)

Optional, on a computer: [ ] S-15-1, criterion 5: point the mouse at a card in your hand. It lifts a little and leans toward the pointer. [ ] S-15-2, criterion 4: tap a hand card, then tap a lit place. It flies from the hand the same way as a drag.

### Checked automatically (all passed; nothing for you to do)
- S-15-4, criterion 1: a tap during movement finishes it and is answered in under a tenth of a second, at your phone's size (891×296), two other phone sizes and on a computer. Also checked with the computer slowed down 6 times.
- S-15-4, criterion 2: no movement stops play for more than 0.6 seconds (checked over 30 whole computer-played games and on screen).
- S-15-4, criterion 4: turning the phone upright in the middle of a movement and back leaves nothing floating; cards end up exactly where they belong.
- S-15-2, criterion 2 in full: in pass-the-phone (with the cover) and online, every card the Runner's screen ever flew was checked. A Corp card the Runner may not know always flew as a card back, and its name never reached the Runner's phone. The same check ran over 30 whole games for both sides.
- S-15-3, criteria 2–4 in full: Bank Job emptied → Heap; an accessed card trashed → Archives; a stolen agenda → score pile with the points tick; Accelerated Beta Test's cards and end-of-turn discards on both sides ripple and finish within half a second; each number stays the same mid-flight and is exact after landing.
- S-15-5, criterion 5: no team check uses the old GitHub play link any more, and a new team check fails if a link that needs a GitHub sign-in (the old play link or the Releases page) sneaks back into the game, the workflows or these notes.

(Tick each box in your review comment, or say which failed.)

## Screenshots
All at your phone's size (891×296). These open on GitHub, so you need to be signed in once the repo is private.
- **Hand:** [the big card rises when pressed](sprint-15-screens/s15-1-press-lift-891x296.png) · [a lifted card leaning as you drag](sprint-15-screens/s15-1-drag-lean-891x296.png)
- **Playing cards:** [an install mid-flight](sprint-15-screens/s15-2-install-mid-flight-891x296.png) · [a one-shot card (Diesel) shown in the middle](sprint-15-screens/s15-2-showcase-891x296.png) · [the Corp's card flying face down on the Runner's screen](sprint-15-screens/s15-2-corp-face-down-flight-891x296.png) · [the "Pass the phone" cover](sprint-15-qa/r1-891x296-s15-2-cover-up.png) · [after the cover: the Corp's card flies in as a back](sprint-15-qa/r1-891x296-s15-2-runner-sees-back-fly-in.png)
- **Piles:** [after a draw](sprint-15-qa/r1-891x296-s15-3-after-draw.png) · [an agenda flying to the score pile](sprint-15-screens/s15-3-score-flight-891x296.png) · [a stolen agenda mid-flight](sprint-15-qa/r1-891x296-s15-3-access-steal-mid.png) · [an accessed card trashed to Archives](sprint-15-qa/r1-891x296-s15-3-access-trash-mid.png) · [Bank Job's card to the Heap](sprint-15-qa/r1-891x296-s15-3-bank-job-to-heap.png) · [Corp end-of-turn discards rippling to Archives](sprint-15-qa/r1-891x296-s15-3-corp-discard-ripple.png) · [Accelerated Beta Test's cards rippling](sprint-15-qa/r1-891x296-s15-3-abt-ripple.png)
- **Turning the phone:** [upright mid-movement](sprint-15-qa/r1-891x296-s15-4-upright-mid-movement.png) · [back sideways, everything in place](sprint-15-qa/r1-891x296-s15-4-back-sideways.png)
- **Play link:** [start screen with "Get the Android app"](sprint-15-screens/s15-5-get-app-891x296.png)

## Didn't make it / things you might notice
All five stories were built. Nothing was dropped, including the two "first to slip" parts (mouse lean and the other player's cards flying in). Things you might notice:
1. **Runs look the same as before.** Something travelling to the server, ICE popping forward, subroutines cracking and accessed cards flipping are the next movement slice (see question 3). So are shakes and flashes, and sounds (none this sprint, your choice).
2. **After passing the phone, only the other player's installs and played cards fly in.** Their draws and discards are not replayed for you (online they do fly, as card backs). Team call: replaying a whole turn of draws and discards after the cover would make you wait. Tell us if you want more.
3. **A deck's number drops when a card leaves it**, not when it lands in the hand. That's the moment the card leaves the deck. Discard piles and score piles count up on landing.
4. **Tapping while the previous player's discards fly at the end of a turn only skips ahead** to the next board. That tap doesn't also press a button, so you can't act on a board you haven't seen yet. This is the same as before this sprint.
5. **The old GitHub Releases page still gets each app file**, but once the repo is private it needs a GitHub sign-in. Use the button or https://overcloc.netlify.app/app/overclock.apk instead.
6. **Automatic checks and your free minutes.** A private repo gets **2,000 free GitHub check minutes a month**. Today, while the repo was still public (and so free), the team used about **2,700 minutes**, most of it before the new plan was in place. Under the old plan a single busy day would have used the whole month. **The new plan:** each push runs only the quick checks; the full set of screen tests (about 85 minutes a time) runs only on pull requests like this one, or when the team starts it by hand once per QA round. Pushes that only change notes run nothing. No test was removed. Estimate: about **250 minutes per sprint**. The minutes left reset each month. The team counts them every sprint and tells you at 1,500, before anything could cost money.
7. **Netlify:** each new build the team pushes is one publish on your Netlify site. If Netlify ever warns you about build limits or credits, tell us; we can publish less often.

## Questions for you
1. **Accept each story?** S-15-1 cards lift and lean in your hand, S-15-2 played cards fly and land, S-15-3 cards fly to and from the piles, S-15-4 never slower, S-15-5 play link and app download without GitHub. — **Recommended:** accept all five once steps 9–12 look right on your phone. If something stutters or the app won't install over the old one, say "not accepted" and what you saw, and we fix it first.
2. **Now that you've played it, how does the movement speed feel?** — **Recommended:** A. Options:
   A) **Keep it** quick and snappy (about a quarter of a second per flight).
   B) **A bit slower and showier** (about half a second, bigger bounce). Note that taps would still skip ahead at once.
   C) **Subtler** (shorter slides, less bounce and lean).
3. **What should Sprint 16 be?** — **Recommended:** A. Options:
   A) **Movement, next slice: runs you can see.** Something travels from the Runner to the server, ICE pops forward when met, a broken subroutine cracks, accessed cards flip toward you, and a short shake or flash when you take damage or ICE ends the run. Runs are the heart of every Runner turn and today they still pop in place. Sounds (with a mute switch) can come with it if you say so, or in a later sprint.
   B) **More cards and identities:** the rest of Haas-Bioroid's and Kate's Core Set cards plus more agendas, so your decks have real choices, then a second identity per side.
   C) **Play your own decks against the computer:** a "Play the computer" choice on the start screen, with a computer opponent that installs, advances and runs instead of mostly drawing.
   D) **Something else** you name.

## How to respond
Comment with "accepted" or "not accepted" for each story (S-15-1 to S-15-5), plus anything you'd change. A quick example: "All accepted. 2A 3A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
