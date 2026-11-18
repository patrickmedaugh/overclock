# Sprint 11 demo — Clear break buttons, save games

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/?seed=240  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR (add `?seed=240` to the end of it).
*`?seed=240` deals the same cards every time, so the checklist below matches what you see. Without it you get a random deal.*

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-11
File right now: `overclock-sprint-11-20261117-1855-b83.1.apk`. A newer file may replace it if the team pushes again. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 10 app.

**Online games:** this update doesn't change any rules, so **an online game you already have running keeps going**.

**Results:** QA ran **21 checks: 19 passed, 0 failed**. The other 2 passed in our test browsers but need **one look on your phone** (see "Two checks only your phone can do"). All automatic checks are green (1,543 screen tests).

## What's new
- **Break buttons say which card and which kind of ICE** (S-11-1). On Ice Wall you now see **"Battering Ram: break barrier sub · 2 credits"** and **"Battering Ram: +1 str · 1 credit"**. "sub" = subroutine, "str" = strength ([Glossary](../GLOSSARY.md)). Other card buttons during a run name their card too, e.g. **"Bank Job: take credits"**. "up to 2" only shows when there really are 2 or more subroutines left to break.
- **No pointless pick step** (S-11-2). When there's only one subroutine to break, one tap breaks it. When there are more (Heimdall 1.0), the pick step says **"Pick up to 2"**, not "Pick 1 or 2".
- **Games save themselves** (S-11-3). There's no Save button. After every move the game is saved. Close the tab or the app and open it again: the start screen shows **Continue game**. Online, **Leave for now** tells the other player "The Runner left for now. The game is saved" (or the Corp), and later **Continue game · CODE** puts you back in your seat without typing the code. A saved online game waits **1 week** for you both.
- **Card numbers fit on big cards** (S-11-4). The bottom line ("Strength 2  Memory 1") uses a different font and moves to a second line if it doesn't fit. Before, your phone cut off the numbers.

## Try this (about 3 minutes, browser link with `?seed=240`)
Tap **Play on this device**. You play both sides, and a cover screen tells you when to pass the phone.

**Corp, turn 1**
- Install **Ice Wall** on **HQ**. Tap your credits twice (+1 each). End turn.

**Runner, turn 1**
- Install **Gordian Blade**. Tap your credits three times. End turn.

**Corp, turn 2**
- Install **Private Security Force** in a new server (it becomes **Server 1**). Tap your credits twice. End turn.

**Runner, turn 2**
1. Tap your credits once. Install **Battering Ram**. Tap **Run** and pick **HQ**. Pass to the Corp: **Rez** Ice Wall. Pass back.
   - [ ] S-11-1, criterion 1: a button reads **"Battering Ram: break barrier sub · 2 credits"**.
   - [ ] S-11-1, criterion 2: the next button reads **"Battering Ram: +1 str · 1 credit"**.
   - [ ] S-11-1, criterion 3: Gordian Blade is installed too. You can tell from each button alone that it's Battering Ram's. No button claims to be Gordian Blade's (it can't break barriers).
   - [ ] S-11-1, criterion 5 (second half): Ice Wall has only 1 subroutine, so no button says "up to 2".
2. Tap **Battering Ram: break barrier sub**.
   - [ ] S-11-2, criterion 1: the subroutine is broken right away and your credits drop by 2. No second row, no "Pick".
3. Tap **Continue**. You see one random card from HQ. Tap whatever it offers (**Done** or **Leave it**). Tap your credits once, then **End turn**.

**Close it and come back** (the cover now says to pass the phone to the Corp)
- [ ] S-11-3, criterion 1: close the browser tab completely (or swipe Chrome away). Open the link again. The start screen shows **Continue game**, with "On this device · Corp's turn" under it. Tap it. The cover asks for the Corp. Tap it: the same board is back, with Ice Wall rezzed on HQ, Server 1, the same credits and the Corp's turn.

**Corp, turn 3**
- Install **Hunter** on **R&D**. End turn.

**Runner, turn 3**
- Install **Bank Job**. Tap **Run** and pick **Server 1**.
  - [ ] S-11-1, criterion 4: the button reads **"Bank Job: take credits"**. Tap it, then **Max** and **Take 8**.

**Optional: online Leave for now** (needs a second device, e.g. your computer, about 2 minutes)
1. On the computer: **Play online**, start as the **Corp**. On your phone: join with the code (you're the Runner). Play a move or two.
2. On your phone, press **Back** (or swipe back). The box says "The game is saved. Continue it from the start screen." Tap **Leave for now**. It may say "Saving…" for a moment.
   - [ ] S-11-3, criterion 3: the computer reads **"The Runner left for now. The game is saved"**.
3. Your phone is on the start screen.
   - [ ] S-11-3, criterion 4: it shows **Continue game · CODE** (your game's code). Tap it: you're back as the Runner, no typing, and the computer sees you back.

### Two checks only your phone can do
Our test browsers can't fully copy these. Please try each once.
- [ ] **S-11-3, criterion 2 (Android closes the app):** in the **app**, tap **Play on this device** and make a move or two. Open your recent apps and **swipe OVERCLOCK away**. Open it again: **Continue game** should bring the game back behind the cover. (The app and the browser keep separate saves, so this doesn't touch your browser game.)
- [ ] **S-11-4, criterion 1 (card numbers):** in the checklist game, **hold** Battering Ram and Gordian Blade (they have the same bottom line as Corroder: Strength and Memory), and Ice Wall (same line as Wall of Static and Ichi 1.0). Every number should show in full, e.g. **"Strength 2  Memory 1"**. If Wall of Static, Ichi 1.0 or Corroder come up in any game, hold those too. Tell us if any number is missing.

### Checked automatically (all passed; nothing for you to do)
- S-11-1, criterion 5 (first half): Battering Ram on **Heimdall 1.0** (3 subroutines) reads **"Battering Ram: break up to 2 barrier subs · 2 credits"**. [Screenshot](sprint-11-qa/891x296-03-heimdall-ram-up-to-2.png)
- S-11-1, criterion 6: every run button is readable and thumb size on 640×360, your phone's size (891×296), 844×390 and a computer.
- S-11-2, criterion 2: on Heimdall the pick step shows the 3 subroutines and a dim **"Pick up to 2"**. [Screenshot](sprint-11-qa/891x296-04-heimdall-pick-up-to-2.png)
- S-11-2, criterion 3: with only 1 Heimdall subroutine left, the button is a plain one-tap break. [Screenshot](sprint-11-qa/891x296-05-heimdall-one-left-plain.png)
- S-11-2, criterion 4: the pick step's words always match what you can really pick.
- S-11-3, criterion 5: a saved online game is still there after 6 days 23 hours, and gone at 7 days. Each move or Leave for now restarts the week.
- S-11-3, criterion 6: a finished game is never offered as Continue. [Screenshot](sprint-11-qa/891x296-15-game-over-hotseat.png)
- S-11-3, criterion 7: a game saved under older rules shows **"That saved game can't continue on this new version of the game. Start a new game."** [Screenshot](sprint-11-qa/891x296-10-outdated-note.png)
- S-11-3, criterion 8: QA saved and reloaded games after **every move** of 162 games (2,702 saves, many mid-run). Each came back exactly the same, and no hidden card ever showed to the wrong player.
- S-11-4, criteria 2–3: all 40 cards in both decks, at 5 card sizes, on all 4 screen sizes: each label has its number, and nothing runs off the card.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken on your phone's size (891×296) unless marked "small" (640×360). Every size is in `docs/sprints/sprint-11-qa/` and `docs/sprints/sprint-11-screens/`.
- **Break buttons:** [Ice Wall with Battering Ram and Gordian Blade](sprint-11-qa/891x296-01-ice-wall-ram-gordian.png) · [Same, small](sprint-11-qa/640x360-01-ice-wall-ram-gordian.png) · [Ice Wall broken, no pick](sprint-11-qa/891x296-02-ice-wall-broken-no-pick.png) · [Heimdall "up to 2"](sprint-11-qa/891x296-03-heimdall-ram-up-to-2.png) · ["Pick up to 2"](sprint-11-qa/891x296-04-heimdall-pick-up-to-2.png) · [Last one, plain button](sprint-11-qa/891x296-05-heimdall-one-left-plain.png)
- **Saving:** [Start screen with Continue game](sprint-11-qa/891x296-06-start-continue-game.png) · [Cover after Continue](sprint-11-qa/891x296-07-restored-cover-corp.png) · [Board back](sprint-11-qa/891x296-08-restored-board-corp.png) · [Leave box](sprint-11-screens/s11-3-leave-dialog-phone-small.png) (small) · ["Can't continue" note](sprint-11-qa/891x296-10-outdated-note.png) · [Two Continue rows](sprint-11-qa/891x296-11-start-two-continue-rows.png)
- **Online:** ["The Corp left for now"](sprint-11-qa/640x360-12-online-runner-reads-corp-left.png) (small) · [Continue game · CODE](sprint-11-qa/640x360-13-online-corp-continue-code.png) (small)
- **Card numbers:** [Corroder held: Strength 2, Memory 1](sprint-11-qa/891x296-14-zoom-corroder-stats.png) · [Battering Ram held](sprint-11-screens/s11-4-zoom-battering-ram-phone-short.png)

## Didn't make it / things you might notice
All four stories were built. Things you might notice:
1. **On small phones (640×360), Gordian Blade's two buttons on Enigma get shortened** to `"The…"` and `"End…"` (which subroutine each one breaks). The card name and price stay whole, and the run panel above lists both subroutines in full. It's in the backlog as a small polish item.
2. **Only one saved pass-the-phone game.** Tapping **Play on this device** starts a new game and replaces the saved one. Use **Continue game** to keep the old one.
3. **"New game" at the end of a game starts (and saves) a fresh game right away.** If you tap it and then close the app, the next start screen offers Continue for that new, unplayed game. That's expected, not the finished one coming back.
4. **Leave for now (online) may show "Saving…" for up to 1.5 seconds** while it tells the other player. If your phone has no signal when you leave, the other player sees "Waiting for the other player to come back…" instead. Your seat is still kept.
5. **Not in this sprint (as planned):** the run panel with lots of buttons (you asked to wait), "Click ×3" on Melange Mining Corp. and the smooth slide in the hand view (polish), more real cards, and keeping saved games across rules updates (you chose "can't continue").

## Questions for you
1. **Accept each story?** S-11-1 break buttons, S-11-2 no extra pick step, S-11-3 save and continue, S-11-4 card numbers. — **Recommended:** accept all four once your two phone checks work. If one doesn't, say "not accepted" and what you saw, and we fix it first.
2. **Break button layout: keep the card name first?** You first suggested the name in brackets; we built the recommended layout because the questions weren't answered. — **Recommended:** A. Options:
   A) **Keep it:** "Battering Ram: break barrier sub · 2 credits".
   B) **Brackets at the end:** "Break barrier sub · 2 credits (Battering Ram)".
   C) **Small heading** over each card's buttons (shorter buttons, uses more height).
3. **What goes in Sprint 12?** — **Recommended:** A. Options:
   A) **More real cards:** the rest of Haas-Bioroid's and Kate's Core Set cards, working toward full 45-card decks.
   B) **Screen polish:** "Click ×3" on Melange, smooth slide in the hand view, Gordian's shortened buttons on small phones, long card text on the smallest card view.
   C) **Something else:** tell us.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "All accepted. Q2 A. Q3 A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
