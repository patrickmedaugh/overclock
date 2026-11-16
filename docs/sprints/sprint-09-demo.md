# Sprint 09 demo — Traces, tags, no stuck games

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/?seed=39  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR (add `?seed=39` to the end of it).
*`?seed=39` deals the same cards every time, so the 2-minute checklist below matches what you see. Without it you get a random deal.*

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-09
File right now: `overclock-sprint-09-20261116-1640-b56.1.apk`. If the team pushes again, a newer file replaces it. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 8 app, as before. (The app always deals a random game, so use the browser link for the checklist.)

**Online games:** this update changed the rules and the decks, so **any online game that was running has ended** ("That game has ended"). Just start a new one.

**Results:**
- QA ran **25 checks: 25 passed, 0 failed** (after a second round).
- The first round found 2 small screen problems. The rules were right in both cases. Both are fixed:
  - When the game skipped a bid for someone, the "Runner bid 0" note and the trace result were squashed into one bubble on small phones. It is now one clear sentence: **"SEA Source: trace 4 vs link 1: Runner tagged (Runner bid 0)"**.
  - When Private Security Force flatlined the Runner, its button stayed visible behind the "game over" box. Now the box shows on its own.
- QA also played **120 random games by computer** (about 12,000 moves, 288 traces) and found no rule mistakes and no hidden card shown to the wrong player.
- The architect reviewed everything and approved it.
- **The 4 new cards' numbers were checked against the official Core Set list.** All match. The text uses the 2012 wording, as you've had since Sprint 8.

## What's new
- **Traces** (a bidding contest started by a card). The **Corp bids first**, out in the open (your answer 1A). Then the Runner sees the total and answers. Ties go to the Runner. Credits spent are gone either way.
- **The bid control** (your answer 2A): a big number with **−** and **+**, a **Max** button and a **Bid** button. Under the number you see what it does: "strength 5" for the Corp, "link 5 · escape" or "short" for the Runner.
- **Link.** Kate's printed **1 link** now counts in traces. It shows as **"Link 1"** on her identity card.
- **Tags.** A red **"Tagged 1"** marker by the Runner's credits, on both screens. While he's tagged:
  - the Corp can tap one of his resources: **Trash · 1 click + 2 credits**;
  - he can tap the marker on his own turn: **Remove 1 tag · 1 click + 2 credits**.
- **Private Security Force works.** Once scored, while the Runner is tagged: **Do 1 meat damage · 1 click**. *Meat damage* = the Runner throws away a random card from his hand. If his hand is empty, he's **flatlined** and the Corp wins. **Every card in both decks now works fully.** That's the first time since we switched to real cards.
- **4 new real cards** (your answer 5A):
  - Corp: **Hunter** ×2 (cheap ICE, "Trace 3: give the Runner 1 tag"), **Ichi 1.0** (trashes 2 programs, then a Trace 1 for a tag and brain damage), **SEA Source** (operation: Trace 3 for a tag, only after the Runner made a successful run last turn).
  - Runner: **Access to Globalsec** ×2 (+1 link each).
- **Deck changes** (as in the proposal table):
  - **Corp (30 cards, 15 agenda points, influence 8 of 15):** out go Anonymous Tip, Neural Katana, 1 PAD Campaign, 1 Rototurret. In come SEA Source, Hunter ×2, Ichi 1.0.
  - **Runner (30 cards, influence 10 of 15):** out go 1 Easy Mark, 1 Inside Job. In come Access to Globalsec ×2.
- **Why you're sometimes not asked to bid.** The game skips a bid screen when your bid **can't change the result**. Our speed rule says the game never stops to ask a question with only one sensible answer. It skips when:
  - you have 0 credits;
  - the Corp can't beat the Runner's link even with all its money;
  - the Runner already escapes without spending;
  - the Runner can't catch up even with all his money.

  The game then bids 0 for you, with no passing the phone, and says so in the result, e.g. "(Runner bid 0)". Every number involved is visible to both players, so skipping gives nothing away.
- **Dropped by you:** S-09-5 (the game answering for an away online player). You said you'd rather be able to save a game when someone wants to leave. That is now a P1 in the backlog (see question 2).

## Try this

### Right away (about 2 minutes, one device, link with `?seed=39`)
Tap **Play on this device**. You play both sides, and a cover screen tells you when to pass the phone.

**Corp, turn 1:** install **Hunter** in a new server (it becomes Server 1). You get +1 credit from Haas-Bioroid. Tap your credits twice (+1 each), then **End turn**. The Corp has 8 credits.

**Runner, turn 1:** install **Armitage Codebusting** (you have 4 credits left). Then tap **Run** and pick **Server 1**.
- The cover passes to the Corp: **Rez** Hunter (1 credit). Pass back. Tap **Let it fire**.

**S-09-1: Traces with Hunter**
- [ ] Criterion 5: the cover says to pass the phone **to the Corp**. No hand shows while the Corp bids.
- [ ] Criterion 1: the Corp sees **"Trace 3: add credits?"** with −, the number, +, **Max** and **Bid**. Tap **+** twice: it reads **strength 5**. Tap **Bid 2**.
- [ ] Criterion 2: the cover passes back to the Runner, who sees **"Trace strength 5 · your link 1 · spend 4 to stop it"**. Tap **+** three times: it says **"short"**. Tap **Bid 3**.
- [ ] Criterion 3: the report says **"trace 5 vs link 4: you got 1 tag"**. Credits went down by the bids: the Corp has 5, the Runner has 1. (The Corp's screen words it as "Runner tagged".)
- [ ] Criterion 8: on your phone, are the numbers easy to read and the buttons easy to hit with a thumb?
- [ ] Criterion 4 (automated check, passed): if you'd bid 4, the totals would tie and the Runner escapes with no tag.
- [ ] Criterion 6 (automated check, passed): a player with 0 credits isn't asked. The game bids 0 at once (you'll see this below with SEA Source).
- [ ] Criterion 7 (automated check, passed): online, the Runner's phone shows "Corp is choosing its trace bid…", then he bids on his own phone. Same result as on one phone.

**S-09-2: Tags** (Runner, still turn 1, after the run)
- [ ] Criterion 1: a red **"Tagged 1"** shows next to the Runner's credits.
- [ ] Criterion 4: tap **Tagged 1**. **Remove 1 tag · 1 click + 2 credits** shows dimmed with **"Not enough credits"** (you have 1). *(With 2+ credits it works and the marker goes away. With no clicks left it says "No clicks left".)*

**S-09-4, link:** now install **Access to Globalsec** (1 credit).
- [ ] S-09-4 criterion 4: Kate's identity card now shows **Link 2**. Tap **End turn**.

**Corp, turn 2** (the Corp draws SEA Source)
- [ ] S-09-2 criterion 1: the Corp's screen also shows **Tagged 1** by the Runner's credits.
- [ ] S-09-2 criterion 2: tap the Runner's **Armitage Codebusting**. **Trash · 1 click + 2 credits** shows. Tap it. Armitage goes to the Runner's Heap (his discard pile) with the note "Corp trashed Armitage Codebusting (Runner tagged)".
- [ ] S-09-4 criterion 2: play **SEA Source** (2 credits; it isn't dimmed because the Runner's run succeeded last turn). "Trace 3: add credits?" opens. Tap **Max** (1 credit, strength 4), then **Bid 1**.
- [ ] S-09-1 criterion 6, seen: the Runner has 0 credits, so the phone **does not** pass. The result says **"SEA Source: trace 4 vs link 2: Runner tagged (Runner bid 0)"**. The marker now says **Tagged 2**.

**SEA Source dimmed** (10 seconds: open https://patrickmedaugh.github.io/overclock/?seed=4)
- [ ] S-09-4 criterion 3: on the Corp's first turn, SEA Source in the hand is dimmed. Tap it: **"Runner made no successful run last turn"**.

### When the cards show up (a few games)
- **S-09-3: Private Security Force** (the Corp must score it first: advance it in a server, then Score).
  - [ ] Criterion 1: with the Runner tagged, tap PSF in the Corp's score area. **Do 1 meat damage · 1 click** shows. Tap it: a random card leaves the Runner's hand for his Heap, and the note names it, e.g. "1 meat damage: Sure Gamble to the Heap".
  - [ ] Criterion 2: tap again: it works once per click, then says "No clicks left".
  - [ ] Criterion 3: with the Runner untagged, the button is dimmed and says **"Runner isn't tagged"**.
  - [ ] Criteria 4–5 (automated checks, passed): meat damage with an empty hand flatlines the Runner (Corp wins). Online, both phones show the same card in the Heap.
- **S-09-4: Ichi 1.0** (seed 3 has it in the Corp's first hand; it costs 5 to rez).
  - [ ] Criterion 1: the Runner has two programs out, runs into a face-up Ichi 1.0 and lets it fire. The Corp picks a program to trash, twice. Sacrificial Construct can save one, as with Rototurret. Then a Trace 1: if it succeeds, the Runner gets 1 tag and 1 brain damage.
- **S-09-2, the rest** (automated checks, passed): no Trash button on an untagged Runner's resources (criterion 3); tags stay from turn to turn until removed (criterion 5); online works the same (criterion 6).
- **S-09-4, the rest** (automated checks, passed): both decks are 30 cards and legal (Corp influence 8 with 15 agenda points, Runner 10) (criterion 5); every card does what the proposal's table says (criterion 6).

### Online, on two devices (optional, about 5 minutes)
**Tip: you can test this alone.** Use your phone app for one player and a browser on a computer for the other.
1. On device A: **Play online** → **Start a game** → pick a side. On device B: **Play online** → **Join with code**.
2. When Hunter fires, the Runner's device shows **"Corp is choosing its trace bid…"** while the Corp bids on its own device. Then the Runner bids on his.
3. Both devices show the same result and the same **Tagged** number.

QA can't reach the live online service from its test computers, so this is the one part only you can try on real devices.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken from real play at sideways phone size (844×390) unless the name says "small" (640×360). All sizes are in `docs/sprints/sprint-09-qa/` and `docs/sprints/sprint-09-screens/`.
- **Hunter's trace:** [Cover passes to the Corp](sprint-09-qa/phone-01-hunter-cover-to-corp.png) · [Corp's bid control](sprint-09-qa/phone-02-hunter-corp-bid.png) · [Cover passes back](sprint-09-qa/phone-03-hunter-cover-back-to-runner.png) · [Runner answers, "1 short"](sprint-09-qa/phone-04-hunter-runner-one-short.png) · [Tagged report](sprint-09-qa/phone-05-hunter-tagged-report.png) · [A tie: escaped](sprint-09-screens/s09-1-tie-escaped.png) · [Bid control on a small phone](sprint-09-qa/phone-small-02-hunter-corp-bid.png)
- **Tags:** ["Tagged" on the Corp's screen](sprint-09-screens/s09-2-tagged-on-corp-screen.png) · [Corp trashes Armitage](sprint-09-screens/s09-2-corp-trash-armitage.png) · [Remove 1 tag](sprint-09-screens/s09-2-remove-tag-button.png) · ["Not enough credits"](sprint-09-qa/phone-06-remove-tag-not-enough-credits.png) · ["No clicks left"](sprint-09-qa/phone-07-remove-tag-no-clicks.png) · [Untagged: no Trash button](sprint-09-qa/phone-14-untagged-no-trash-button.png)
- **Private Security Force:** [The button](sprint-09-qa/phone-10-psf-button.png) · [Meat damage note](sprint-09-screens/s09-3-psf-meat-damage.png) · [After 3 uses](sprint-09-qa/phone-11-psf-three-used.png) · [Dimmed, "Runner isn't tagged"](sprint-09-qa/phone-13-psf-dimmed-untagged.png) · [Flatline: "Corp wins"](sprint-09-qa/phone-12-psf-empty-grip-flatline.png)
- **New cards:** [Link 2 with Globalsec](sprint-09-screens/s09-4-globalsec-link-2.png) · [SEA Source dimmed](sprint-09-screens/s09-4-sea-source-not-ready.png) · [SEA Source: Corp bids](sprint-09-screens/s09-4-sea-source-corp-bid.png) · [SEA Source result, "(Runner bid 0)"](sprint-09-qa/phone-09-sea-source-runner-broke-result.png) · [Ichi 1.0: Construct saves a program](sprint-09-screens/s09-4-ichi-construct.png) · [Ichi 1.0 report](sprint-09-screens/s09-4-ichi-report.png)
- **Online (two pretend devices):** [Runner waits: "Corp is choosing its trace bid…"](sprint-09-qa/phone-15-online-runner-waits.png) · [Corp taps Max](sprint-09-qa/phone-16-online-corp-max.png) · [Runner's result](sprint-09-qa/phone-17-online-runner-result.png)

## Didn't make it / things you might notice
Nothing planned was cut: S-09-1 to S-09-4 were all built, including SEA Source and Ichi 1.0 (first in line to cut). S-09-5 was dropped by you before the build.
1. **Sometimes you aren't asked to bid.** This is on purpose (see "Why you're sometimes not asked to bid" above). If it feels like the game skipped your turn, tell us (question 3).
2. **On a computer screen, the trace result note covers the left end of the End turn button** for the couple of seconds it shows. Phones are fine. Low priority, in the backlog (QA-S9-4).
3. **On a computer screen, the small "Built …" date shows inside the "Corp wins" box.** Looks only. In the backlog (QA-S9-5).
4. **Online games running during the update ended.** Online games still can't carry over a rules update (backlog, P2).
5. **No saving a game yet.** If Android closes the app, or someone has to leave an online game, the game can't be picked up later. This is your new P1 (question 2).

## Questions for you
1. **Accept each story?** S-09-1 traces with Hunter, S-09-2 tags, S-09-3 Private Security Force, S-09-4 Ichi 1.0 / SEA Source / Access to Globalsec and the deck changes. — **Recommended:** accept all four. Anything that didn't work: say "not accepted" and what happened.
2. **What's the main thing for Sprint 10?** — **Recommended:** A. Options:
   A) **Save a game** (your P1): leave a pass-the-phone or online game and pick it up later, also after Android closes the app. Plus two of your quick fixes from chat: the **Archives lane** that seems to rename itself when a server empties, and **tap to open the hand** when you must discard.
   B) **Your chat fixes only:** the Archives lane, tap-to-open discard, a smooth slide between cards in the hand view, and a compact "click ×3" instead of "click, click, click". Saving waits for Sprint 11.
   C) **More cards** (the rest of Haas-Bioroid's and Kate's Core Set cards, toward the real 45-card decks). Saving and fixes wait.
3. **When the game skips your bid** (it says "Runner bid 0" or "Corp bid 0" in the result), does that feel right, or like the game skipped your turn? — **Recommended:** A. Options: A) it's fine, keep it fast. B) always ask, even when the bid can't matter. This adds a phone pass on most traces.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "All accepted. Q2 A. Q3 A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
