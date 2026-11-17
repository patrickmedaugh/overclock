# Sprint 10 demo — Make the board clearer

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/?seed=240  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR (add `?seed=240` to the end of it).
*`?seed=240` deals the same cards every time, so the checklist below matches what you see. Without it you get a random deal.*

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-10
File right now: `overclock-sprint-10-20261117-0414-b77.1.apk`. A newer file may replace it if the team pushes again. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 9 app. (The app always deals a random game, so use the browser link for the checklist.)

**Online games:** this update changes two rules (Advance and Bank Job), so **any online game that was running has ended** ("That game has ended"). Just start a new one.

**Results:** QA ran **31 checks: 31 passed** (after a second round). All automatic checks are green.

## What's new
- **A scored-agenda pile for each side** (S-10-1). Scored agendas now sit face up at the **far right of each side's row**, with a count like "2 agendas · 3 points". Tap a pile to open it big and slide through the cards. Holding it to read still works too. The Corp uses **Private Security Force** from his pile. An installed PSF that isn't scored yet shows a dimmed **"Do 1 meat damage: score it first"**.
- **Link and Tagged sit under Memory** (S-10-2), at the end of the Runner's row. Nothing is drawn on Kate's card any more. Tap **Tagged** to remove a tag, as before.
- **Advance stops at the limit** (S-10-3, your house rule). Once an agenda has all the counters it needs, only **Score** shows. Ice Wall (ICE, not an agenda) can still be advanced.
- **Bank Job: you choose how much** (S-10-3). After a run on a remote server: **Take credits** or **Access cards**. Take credits opens the same − / + / **Max** control as trace bids. What you leave stays on Bank Job for later.
- **Archives is always its own lane** (S-10-5), even when empty. When a server empties, its lane folds away, and no other lane slides in or changes its name. Trashed cards fly into Archives.
- **The discard step opens with a tap** (S-10-5). Tap your hand, it opens big, tap each card to throw away (it gets a "DISCARD" stamp), then tap **Discard N**. No holding.
- **Two computer-screen fixes** (S-10-6). The trace result note no longer covers End turn, and the small "Built …" date no longer shows inside the "Corp wins" box.
- **Shorter, readable notes.** Repeated lines are combined: four PAD Campaign payouts now read **"PAD Campaign: +1 credit ×4"**. Notes never shrink to an unreadable size, and they never cover a card or button.

## Try this

### Part 1 (about 3 minutes, link with `?seed=240`)
Tap **Play on this device**. You play both sides, and a cover screen tells you when to pass the phone.

**Before you tap anything**
- [ ] S-10-5, criterion 1: the Corp's row has its own **Archives** lane, even though it's empty.
- [ ] S-10-1, criterion 6: a faint empty outline sits at the far right of each row (the scored piles). Tapping it does nothing.
- [ ] S-10-2, criterion 1: **Link 1** sits under Memory at the end of the Runner's row. Nothing covers Kate's card.

**Corp, turn 1**
1. Install **Private Security Force** in a new server (it becomes Server 1).
   - [ ] S-10-1, criterion 5: tap it. **Advance** shows, with a dimmed **"Do 1 meat damage: score it first"**.
2. Install **Ice Wall** on **HQ**. Tap it and pick **Advance**. End turn.

**Runner, turn 1**
1. Install **Bank Job** (8 credits on it). Tap **Run** and pick **Server 1**.
   - [ ] S-10-3, criterion 5: you see **Take credits** and **Access cards**. Tap **Take credits**. The control opens at 8. Tap **−** five times to get **3**, then **Take 3**. You have 7 credits, Bank Job shows 5, and nothing was accessed.
2. **Run Server 1 again.**
   - [ ] S-10-3, criterion 6: this time tap **Access cards**. You see Private Security Force, and Bank Job still has 5. Tap **Steal**.
   - [ ] S-10-1, criterion 2: PSF lands in the Runner's pile at the far right of his row: **"1 agenda · 2 points"**. The top label still reads **Runner 2 points** (criterion 8).
   - [ ] S-10-5, criterion 2: Server 1's lane folds away. Archives, HQ and R&D stay where they were, with the same names.
3. Install **Access to Globalsec**.
   - [ ] S-10-2, criterion 2: it now reads **Link 2**. End turn.

**Corp, turn 2**
- [ ] S-10-3, criterion 4: tap the Ice Wall on HQ. **Advance** is still offered (don't use it).
- Install **Hunter** on **R&D**. Then tap your deck twice to draw. End turn.
- [ ] S-10-5, criterion 4: you have 6 cards, so you must discard 1. **Tap your hand**: it opens big. Tap a card (it gets a DISCARD stamp), then tap **Discard 1**. No holding needed.

**Runner, turn 2**
1. **Run R&D.** Pass to the Corp: **Rez** Hunter. Pass back and tap **Let it fire**. The Corp taps **Bid 0**. The Runner taps **Bid 0** too. You get 1 tag.
   - [ ] S-10-2, criterion 3: a red **Tagged 1** shows under Link, and not by your name.
2. You see Melange Mining Corp. Tap **Trash · 1 credit**.
   - [ ] S-10-5, criterion 3: you can watch it fly into the **Archives** lane.
3. - [ ] S-10-2, criterion 4: tap **Tagged 1**. **Remove 1 tag · 1 click + 2 credits** shows. **Don't use it yet** (the Corp needs the tag in Part 2). Tap the board to close it, then End turn.

### Part 2 (optional, about 3 more minutes, same game)
**Corp, turn 3:** install your second **Private Security Force** in a new server. It's called **Server 2**, because names don't get reused. Advance it twice, then End turn. **Runner, turn 3:** just tap **End turn**.

**Corp, turn 4**
- [ ] S-10-3, criterion 2: advance PSF once (3 of 4). Tap it: only **Advance**. Advance again (4 of 4). Tap it: only **Score**, no Advance (criterion 1). Tap **Score**.
- [ ] S-10-1, criterion 1: PSF lands in the Corp's pile at the far right of his row: **"1 agenda · 2 points"**. Pass the phone at the end of the turn: the Runner sees it too.
- [ ] S-10-1, criterion 4: tap your pile. It opens big. Tap PSF: **Do 1 meat damage · 1 click** shows. Tap it: a random card leaves the Runner's hand.
- End turn. You must discard 1 again, the same way as before.

**Runner, turn 4**
- [ ] S-10-2, criterion 5: tap **Tagged 1**, then **Remove 1 tag**. Tagged goes away, and **Link 2** stays where it was.

### Checked automatically (all passed; nothing for you to do)
- S-10-1, criterion 3: a pile with 2 or more agendas slides side to side, a tap outside closes it, and holding it still reads the card. [Screenshot](sprint-10-screens/s10-1-pile-open-891x296.png)
- S-10-1, criteria 7–8: both piles full on a busy board, on every screen size, cover nothing. The top labels still show the points.
- S-10-2, criterion 6: Tagged, Link, Memory and a full row of Runner cards don't overlap, on every size.
- S-10-3, criterion 3: the game refuses an Advance on an agenda that's already at its limit, even if asked directly.
- S-10-3, criterion 7: taking Bank Job's last credits sends it to the Heap. (In Part 1 it still has 5. Take all 5 on a later run if you want to see it.)
- S-10-3, criterion 8: the amount control's −, number, +, Max and Take buttons are thumb size and readable at 640×360 and on your phone's size.
- S-10-3, criterion 9: online, both devices show the same credits left on Bank Job.
- S-10-5, criterion 5: nothing overlaps, and every button is thumb size, when a lane folds or the discard view is open.
- S-10-6, criteria 1–3: the trace note stays clear of End turn on a computer and of every button on phones. The "Built …" date never shows inside the game-over box. (On a computer you can see the note during Hunter's trace in Part 1.)

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken from real play on your phone's size (891×296) unless marked "small" (640×360) or "phone" (844×390). Every size is in `docs/sprints/sprint-10-qa/` and `docs/sprints/sprint-10-screens/`.
- **Scored piles:** [Corp's pile](sprint-10-qa/891x296-02-corp-scored-pile.png) · [Same pile on the Runner's screen](sprint-10-qa/891x296-03-corp-pile-runner-screen.png) · [Runner's pile](sprint-10-qa/891x296-04-runner-stolen-pile.png) · [Pile open](sprint-10-qa/891x296-05-pile-open.png) · [Slid to the next card](sprint-10-qa/891x296-06-pile-slid.png) · [PSF from the pile](sprint-10-qa/891x296-08-psf-from-pile.png) · ["Score it first"](sprint-10-qa/891x296-09-psf-score-it-first.png) · [Empty piles](sprint-10-qa/891x296-10-empty-piles.png) · [Busy board, both piles](sprint-10-screens/s10-1-busy-both-piles-891x296.png)
- **Link and Tagged:** [Link 1](sprint-10-qa/891x296-12-link-1.png) · [Link 2 with Globalsec](sprint-10-qa/891x296-13-link-2-globalsec.png) · [Tagged](sprint-10-qa/891x296-14-tagged-runner-screen.png) · [Tagged on the Corp's screen](sprint-10-qa/891x296-17-tagged-corp-screen.png) · [Remove 1 tag](sprint-10-qa/891x296-15-remove-tag-button.png) · [Tag removed](sprint-10-qa/891x296-16-tag-removed.png) · [Full row, tagged](sprint-10-qa/891x296-18-tagged-full-rig.png)
- **Advance and Bank Job:** [Only Score](sprint-10-qa/891x296-19-only-score.png) · [Ice Wall still advances](sprint-10-qa/891x296-20-ice-wall-advance.png) · [Take credits or Access cards](sprint-10-qa/891x296-21-bank-job-choice.png) · [Amount set to 3](sprint-10-qa/891x296-22-bank-job-amount-3.png) · [5 left on Bank Job](sprint-10-qa/891x296-23-bank-job-5-left.png) · [Online: the Corp sees the same](sprint-10-qa/844x390-24-online-corp-sees-2.png) (phone)
- **Archives and discard:** [New game, Archives lane](sprint-10-qa/891x296-25-new-game-archives-lane.png) · [Trash: card in flight](sprint-10-qa/891x296-27-trash-mid-flight.png) · [Lane folded](sprint-10-qa/891x296-28-trash-folded.png) · [Discard step](sprint-10-qa/891x296-29-corp-discard-step.png) · [Card marked](sprint-10-qa/891x296-30-corp-discard-marked.png) · [Discarded](sprint-10-qa/891x296-31-corp-discarded.png)
- **Screen fixes:** [Trace note clear of End turn (computer)](sprint-10-qa/1280x800-32-trace-note.png) · [Game over, no date inside](sprint-10-qa/1280x800-33-game-over.png) · ["PAD Campaign: +1 credit ×4"](sprint-10-qa/891x296-35-pad-x4-toast.png) · [A "No clicks left" note](sprint-10-qa/640x360-34-refusal-toast.png) (small)

## Didn't make it / things you might notice
1. **S-10-4 (run panel with lots of buttons)**: dropped by you before the build. It's back in the backlog. Tell us if you ever see cramped run buttons.
2. **Card numbers cut off at the bottom of a big card on your phone** (e.g. "Strength :" on Wall of Static). You asked for this one later, so it's in the backlog (P1) and not fixed here. QA looked at your photos: the right end of that line is cut off, and the number is there but hidden. It only happens with your phone's fonts. Our test browser shows it in full, so the fix needs a check on a real Android phone. Recommended for Sprint 11 (question 2).
3. **The count on a pile covers the top card's cost and part of its name.** It's still readable, and you can tap or hold the pile to read the card.
4. **Online games running during the update ended** (see the top).
5. **No saving a game yet.** Your P1, recommended for Sprint 11.

## Questions for you
1. **Accept each story?** S-10-1 scored piles, S-10-2 Link and Tagged, S-10-3 Advance limit and Bank Job, S-10-5 Archives lane and tap-to-discard, S-10-6 computer-screen fixes. — **Recommended:** accept all five. Anything that didn't work: say "not accepted" and what happened.
2. **What goes in Sprint 11?** — **Recommended:** A. Options:
   A) **Save a game** (your P1: leave a game and pick it up later, also after Android closes the app), **plus the cut-off card numbers fix**.
   B) **Save a game only.**
   C) **Screen polish first:** cut-off card numbers, smooth slide in the hand view, "click ×3" on Melange Mining Corp. Saving waits.
3. **Does the pile's count over the top card bother you?** — **Recommended:** A. Options: A) it's fine as is. B) move the count under the pile (the card gets a little smaller on small phones).

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "All accepted. Q2 A. Q3 A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
