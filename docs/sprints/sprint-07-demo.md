# Sprint 07 demo — Make the sleeping cards work

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-07
File right now: `overclock-sprint-07-20261114-2023-b30.1.apk`. If the team pushes again, a newer file replaces it. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 6 app, as before.

**Online play is live now.** Thanks for adding the Cloudflare secrets. The online service now updates by itself every time the team updates the game, and its health check reported the right version each time. So you can finally try the Sprint 6 two-device steps for real (see "Try online play" below).

**Results:**
- QA ran **36 checks: 36 passed, 0 failed.** QA found 2 small look-and-feel issues (below, "Things you might notice").
- The architect reviewed everything and approved it. One extra safety change: each online game now remembers which rules version it started under. If we change the rules while a game is running, that game ends cleanly ("That game has ended") instead of quietly turning into a different game. Changes to the screen only (no rules) don't end games.

## What's new
- **Drag to play (your design).** Tap your hand and it opens big. Hold a card and the places it can go light up. Drag it onto a lit place and let go to play it. Let go anywhere else and it goes back. Tap outside the hand to close it. (Tapping the big card and then a lit place still works too.)
- **Cards on the table do things now.** Tap one of your cards on the table and its buttons appear where Play/Rez/Advance usually show.
- **22 of the 24 cards now work fully** (up from 15). New this sprint:
  - **PAD Campaign** (Corp): flip it face up for 2 credits, then +1 credit at the start of every Corp turn.
  - **Akitaro Watanabe** (Corp): flip it face up for 1 credit. ICE in its server costs 2 less to flip.
  - **Ice Wall** (Corp): can be advanced. Each counter makes it 1 stronger.
  - **Armitage Codebusting** (Runner): comes with 12 credits on it. "Take 2 credits · 1 click".
  - **Akamatsu Mem Chip** (Runner): memory goes from 4 to 5.
  - **Cyberfeeder** (Runner): 1 free credit each turn for paying icebreakers.
  - **Bank Job** (Runner): comes with 8 credits. After a successful run on a remote server, take them instead of looking at cards.
  - Still waiting (your answer 4A): **Private Security Force** and **Sacrificial Construct**. Nothing in these decks can tag the Runner or trash his cards yet, so they have nothing to react to. They'll come alive with the bigger card pool.
- **Empty servers disappear.** The blank lane you reported is gone: when a remote server has no cards and no ICE left, it vanishes from both boards.
- **Giving up an online game closes it.** If you start an online game and tap Back on the waiting screen, a friend typing that code now sees "No game with that code" instead of waiting forever.
- **New wording (your request):** "Play on this device" on the start screen, and the cover now says "Pass to the Runner — tap when ready" (no more "phone", since it works on a computer too).

## Try this

### How to get the cards out quickly
- **Cards come by chance.** Every new game shuffles the decks, so a card may be near the top or near the bottom.
- **To find one faster:** tap your deck to draw (1 click each). Or start a new deal: go back to the start screen (or reload the page) and tap **Play on this device** again.
- **Play on this device** is easiest for trying cards, because you play both sides.

### Right away (about 5 minutes, on one device)

**S-07-6: Drag to play (your hand design)**
- [ ] Criterion 1: tap your hand. It opens big enough to read.
- [ ] Criterion 2: hold a card in the open hand (about a third of a second). The hand fades and every place that card can go lights up on the board.
- [ ] Criterion 3: still holding, drag it onto a lit place and let go. It's played there.
- [ ] Criterion 4: hold another card, drag it somewhere that isn't lit, and let go. Nothing is played and the hand view comes back.
- [ ] Criterion 5: with the hand open, tap outside it. It closes and nothing else happens.
- [ ] Criterion 6 (automated check, passed): the card follows your finger without lag. QA measured about 0.02–0.04 seconds per move, and at most 0.05 on a machine slowed down 6 times (the limit is 0.1). *Your feel:* on your phone, does the card stick to your finger?
- [ ] Criterion 7 (automated check, passed): dragging works the same online as on one device.

**S-07-1: Empty servers disappear**
- [ ] Criterion 1: as the Corp, put one card (no ICE) into a **New server**. As the Runner, run that server and **Steal** it (agenda) or pay to **Trash** it. When the run ends, that server's column folds away.
- [ ] Criterion 2: as the Corp, score the only agenda in a server with no ICE. That server goes too.
- [ ] Criterion 3: after a server disappears, pick a card to install as the Corp. Only one "New server" place lights up, with no blank gap.
- [ ] Criterion 4: a server that has ICE in front of it stays when its last card is stolen or trashed, and the Corp can install there again.
- [ ] Criterion 5 (automated check, passed): the other servers keep their names (Server 2 stays Server 2); the next new server gets a new number.
- [ ] Criterion 6: see "Try online play" below (Back on the waiting screen).

**S-07-2: PAD Campaign and Akitaro Watanabe** (Corp)
- [ ] Criterion 1: install PAD Campaign. On a later Corp turn, tap it on the table. A **Rez · 2 credits** button appears. Tap it: 2 credits go, no click is used, and it flips face up. (Akitaro shows **Rez · 1 credit**.)
- [ ] Criterion 2: with fewer credits than the cost, the Rez button is dimmed and says "Not enough credits".
- [ ] Criterion 3: at the start of the Corp's next turn, the Corp gets +1 credit and a short note "PAD Campaign: +1 credit". Face down, it gives nothing.
- [ ] Criterion 4: put Akitaro face up in a server with face-down ICE in front of it. When the Runner reaches that ICE, the Rez price is 2 less (Wall of Static 1 instead of 3; Ice Wall 0 instead of 1). ICE in other servers costs full price.
- [ ] Criterion 5: same setup with the Corp at just 1 credit, and Wall of Static in Akitaro's server: the Corp is still asked Rez / Don't rez (it can pay the cheaper price).
- [ ] Criterion 6 (automated check, passed): the same thing happens online on both devices.

**S-07-3: Armitage Codebusting and Akamatsu Mem Chip** (Runner)
- [ ] Criterion 1: install Armitage Codebusting. A yellow **12** shows on the card (both players see it).
- [ ] Criterion 2: on your turn, tap Armitage. A **Take 2 credits · 1 click** button appears. Tap it: you get 2 credits, use 1 click, and the card shows 10.
- [ ] Criterion 3: with no clicks left, tap Armitage. The button is dimmed and says "No clicks left".
- [ ] Criterion 4: keep taking until it's empty (6 takes, over a few turns). When the last 2 go, the card moves to your Heap (discard pile).
- [ ] Criterion 5: install Akamatsu Mem Chip. The memory counter reads "…/5" instead of "…/4".
- [ ] Criterion 6 (automated check, passed): online, the Corp's device sees Armitage's number go down.

**S-07-4: Cyberfeeder and Bank Job** (Runner)
- [ ] Criterion 1: install Cyberfeeder. A **1** shows on it.
- [ ] Criterion 2: *getting there:* you need Cyberfeeder and Corroder installed, and the Corp needs a face-up Ice Wall. Run that server. The break button says **Break "End the run" · Cyberfeeder pays**. Tap it: the 1 on Cyberfeeder disappears and your own credits stay the same.
- [ ] Criterion 3: at the start of your next turn, Cyberfeeder shows 1 again (never more).
- [ ] Criterion 4 (automated check, passed): Cyberfeeder's credit never pays for installs or trashing cards.
- [ ] Criterion 5: install Bank Job. An **8** shows on it.
- [ ] Criterion 6: make a successful run on a **remote server** (Server 1, 2…; one with no ICE is easiest). You get two buttons: **Take 8 credits from Bank Job** and **Access cards**. Tap Take: +8 credits, you see no cards, and Bank Job goes to the Heap.
- [ ] Criterion 7: run HQ, R&D or Archives with Bank Job out. No Bank Job choice; you see cards as usual.
- [ ] Criterion 8 (automated check, passed): the same thing happens online on both devices.

**S-07-5: Ice Wall gets stronger** (Corp)
- [ ] Criterion 1: install Ice Wall, then tap it on the Corp's turn (face up or face down). An **Advance · 1 credit** button appears. Each tap uses 1 click and 1 credit and adds a counter both players can see.
- [ ] Criterion 2: rez Ice Wall with 2 counters on it (when the Runner reaches it). It shows **Strength 3**. Corroder's Break is dimmed until the Runner taps **+1 strength** once.
- [ ] Criterion 3 (automated check, passed): no other ICE gets an Advance button.

### Try online play (from Sprint 6, now live; about 5 minutes)
**Tip: you can test this alone.** Use your phone app for one player and a browser on a computer for the other.
1. On **device A**: **Play online** → **Start a game** → pick **Corp** or **Runner**. You get a short code and a **Share** button.
2. On **device B** (the phone app, or a browser on a computer): **Play online** → **Join with code** → type the code → **Join**. (Or open the shared link on device B: it opens the web game.)
3. Play a few turns. If you can, try a Sprint 7 card online: rez PAD Campaign, take credits from Armitage, or make a Bank Job run.
4. **S-07-1 criterion 6:** start another game on device A and tap **Back** on the waiting screen. On device B, type that code: you should see "No game with that code".
5. The Sprint 6 list is still there if you want to go deeper: `docs/sprints/sprint-06-demo.md`, "After Cloudflare setup".

Please tell us how it went (question 2). A screenshot from each device is perfect if anything looks wrong.

(Tick each box in your review comment, or say which failed.)

## Housekeeping: one switch to turn off in Cloudflare
You asked about the red ✗ on PRs from "Workers Builds". That's Cloudflare's own connection to GitHub, and we don't need it (our GitHub setup already updates the online service). To turn it off:
**Cloudflare → Workers & Pages → overclock → Settings → Build → Disconnect.**
It's safe: online play keeps working.

## Screenshots
Taken by QA at sideways phone size (844×390) unless the name says otherwise. All three sizes are in `docs/sprints/sprint-07-qa/`.
- **Drag to play:** [Hand open](sprint-07-qa/phone-24-s07-6-hand-view.png) · [Card held, places lit](sprint-07-qa/phone-25-s07-6-lifted-places-lit.png) · [Dragging over New server](sprint-07-qa/phone-26-s07-6-dragging-over-new-server.png) · [Played](sprint-07-qa/phone-27-s07-6-dropped-played.png) · [Let go elsewhere: hand back](sprint-07-qa/phone-28-s07-6-let-go-away-view-back.png) · [In the Android app](sprint-07-qa/android-app-844x390-02-dragging-over-new-server.png)
- **Empty server goes:** [Before the steal](sprint-07-qa/phone-01-s07-1-before-steal.png) · [After, Runner's board](sprint-07-qa/phone-02-s07-1-server-gone-runner.png) · [After, Corp's board](sprint-07-qa/phone-03-s07-1-server-gone-corp.png)
- **PAD Campaign / Akitaro:** [Rez · 2 credits](sprint-07-qa/phone-04-s07-2-pad-rez-button.png) · [Face up](sprint-07-qa/phone-05-s07-2-pad-face-up-corp.png) · [+1 credit note](sprint-07-qa/phone-07-s07-2-pad-plus-1-note.png) · [Akitaro Rez · 1 credit](sprint-07-qa/phone-08-s07-2-akitaro-rez-button.png) · [Wall of Static for 1](sprint-07-qa/phone-09-s07-2-akitaro-discount-rez-wall-of-static-1.png)
- **Armitage / Akamatsu:** [12 on the card](sprint-07-qa/phone-10-s07-3-armitage-12.png) · [Take 2 credits · 1 click](sprint-07-qa/phone-11-s07-3-armitage-take-button.png) · [No clicks left](sprint-07-qa/phone-12-s07-3-armitage-no-clicks.png) · [Memory /5](sprint-07-qa/phone-14-s07-3-memory-5.png)
- **Cyberfeeder / Bank Job:** [Cyberfeeder pays](sprint-07-qa/phone-15-s07-4-cyberfeeder-pays-button.png) · [Bank Job 8](sprint-07-qa/phone-17-s07-4-bank-job-8.png) · [Take or Access](sprint-07-qa/phone-18-s07-4-bank-job-choice.png) · [Taken](sprint-07-qa/phone-19-s07-4-bank-job-taken.png)
- **Ice Wall:** [Advance button](sprint-07-qa/phone-20-s07-5-ice-wall-advance-button.png) · [2 counters](sprint-07-qa/phone-21-s07-5-ice-wall-2-counters-corp.png) · [Strength 3](sprint-07-qa/phone-23-s07-5-ice-wall-strength-3.png)
- **Wording:** [Start screen](sprint-07-qa/phone-29-start-screen-device.png) · [Cover](sprint-07-qa/phone-30-cover-device-wording.png)
- **Online (two pretend devices):** [Runner sees PAD face up](sprint-07-qa/phone-31-online-runner-sees-pad-face-up.png) · [Corp gets +1](sprint-07-qa/phone-32-online-corp-pad-plus-1.png) · [Corp sees the Runner's dragged card](sprint-07-qa/phone-36-online-corp-sees-runner-drag-install.png)
- **Small phone (640×360), for things you might notice 1 and 2:** [Armitage 12](sprint-07-qa/phone-small-10-s07-3-armitage-12.png) · [Ice Wall counters, Runner's view](sprint-07-qa/phone-small-22-s07-5-ice-wall-2-counters-runner-face-down.png)

## Didn't make it / things you might notice
Nothing was dropped: all 6 stories were built, including Ice Wall.
1. **On small phones the credits number covers part of the card (QA-S7-1).** The yellow "12" or "8" sits over the card's type line ("RESOURCE" shows as "…URCE"), and "Armitage Codebusting" is cut to "Armitage Codebustin". Holding the card still shows everything. Small fix; see question 3.
2. **Credits on a card and advancement counters look alike (QA-S7-2).** Both are yellow circles with a number. A "2" on a face-down Ice Wall could be read as "2 credits". Small fix; see question 3.
3. **The cover screen still shows a small phone picture.** The words no longer say "phone", but the picture does. Tell us if you want a different one.
4. **Bank Job takes all its credits at once.** The real card lets you pick an amount. With these decks taking everything is always best (agreed in the proposal). Ask if you want a picker.
5. **One slow drag moment was seen once in testing.** In one QA run, one finger move took 0.2 seconds. It didn't happen again in 14 more runs, and QA's measuring may have caused it. Tell us if dragging ever feels sticky on your phone.
6. **Nobody has played the live online service on two real devices yet.** QA's sandbox can't reach it, so that's your test (question 2).

## Questions for you
1. **Accept each story?** S-07-1 empty servers + closing given-up games, S-07-2 PAD Campaign and Akitaro, S-07-3 Armitage and Akamatsu, S-07-4 Cyberfeeder and Bank Job, S-07-5 Ice Wall, S-07-6 drag to play. — **Recommended:** accept all six. Anything that didn't work: say "not accepted" and what happened.
2. **How did online play go on your real devices?** — Options: A) it worked (both devices played a game). B) there was a problem: describe it, or send a screenshot from each device. Also: is your Cloudflare account still showing no card and no charges?
3. **Fix QA-S7-1 and QA-S7-2 next sprint, and what's the main thing for Sprint 8?** — **Recommended:** yes, fix both (small), plus **A**. Options for the main thing:
   A) **Real identities and full Core Set decks** (each side's character card, the full starter decks; brings in tags so Private Security Force and Sacrificial Construct can work).
   B) **Online play polish** (whatever you hit in question 2, limits on how fast codes can be tried, keeping games alive across rules updates).
   C) Something else: tell us.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "All accepted. Q2 A. Q3 yes + A." And once you've done it: "Workers Builds disconnected".
