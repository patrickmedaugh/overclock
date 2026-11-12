# Sprint 02 demo — Put cards on the table

**▶ Play it:** https://patrickmedaugh.github.io/overclock/?seed=4  (hold your phone sideways)
Backup link: https://deploy-preview-7--overcloc.netlify.app/?seed=4

*`?seed=4` deals the same cards every time, so the checklist below matches what you see. Without it you get a random deal.*

## What's new
- **The phone board is sideways.** Everything fits on one screen with the phone held sideways. Hold it upright and you get "Turn your phone sideways"; turn it back and your game is still there. Computers look like before, with the new rows added in the middle.
- **Tap a card, then tap where it goes.** The places it can go light up with their price ("Install · free", "Install · 2 credits", "Play · free"). Tap the card again to cancel.
- **The Corp hides cards in servers.** Agendas, assets and upgrades go face down into "New server" (shown as Server 1, Server 2…). ICE goes face down in front of any server: the first is free, then 1 credit for each ICE already there.
- **The Runner installs programs, hardware and resources** face up in their row. A **Memory** counter shows how much room programs use (out of 4).
- **One-shot cards work:** Hedge Fund, Anonymous Tip, Easy Mark and Diesel. Cards that need attacks (coming next sprint) say "Needs runs (coming soon)".
- **Real words and real cards.** The board says HQ, R&D, Archives, ICE, Grip, Stack and Heap. All 24 starter cards are real Core Set cards with their official names and text. Card pictures are still our own drawings.

New words are in `docs/GLOSSARY.md`.

## Try this (about 3 minutes)
Open the link with `?seed=4`, phone held sideways.

**Corp's first turn (you have 5 credits, 3 clicks)**
- [ ] **S-02-1, criterion 1:** tap **Private Security Force**. Only **New server** lights up ("Install · free").
- [ ] **S-02-1, criterion 4:** tap the card again. The light goes off and you still have 3 clicks.
- [ ] **S-02-1, criterion 2:** tap it again, then tap **New server**. It slides face down into **Server 1**. 2 clicks left, still 5 credits.
- [ ] **S-02-1, criterion 5:** hold your finger on the card in Server 1. It zooms face up so you can read it.
- [ ] **S-02-1, criterion 3:** tap **Priority Requisition**. Server 1 is *not* lit, only New server (one agenda or asset per server). Then tap **Akitaro Watanabe** (an upgrade). HQ, R&D, Archives, Server 1 and New server all light up. Tap it again to cancel.
- [ ] **S-02-2, criteria 1 and 2:** tap **Wall of Static** (ICE). Every server lights up, all "free". Tap Server 1. It goes face down in front of the server, 1 click used, still 5 credits.
- [ ] **S-02-2, criterion 3:** tap **Neural Katana**. Server 1 now says "1 credit". Tap it. You pay 1 credit (4 left) and the new ICE sits on the outside. Tap **End turn**.

**Runner's turn (5 credits, 4 clicks)**
- [ ] **S-02-1, criterion 6 and S-02-2, criterion 5:** the Corp's cards show only as card backs. You can see that Server 1 has 2 ICE. Holding one shows only a back.
- [ ] **S-02-4, criteria 1 and 2:** tap **Diesel**. The Play spot (right side) says "Play · free". Tap it. 3 cards fly into your hand, 1 click is used, and Diesel lands face up on your Heap.
- [ ] **S-02-3, criteria 1, 2 and 4:** tap **Gordian Blade**. An Install spot lights up in your row ("Install · 4 credits"). Tap it. It appears face up, 1 credit left, and the counter says **Memory 1/4**.
- [ ] **S-02-3, criterion 3:** tap **Corroder**, then its Install spot (2 credits). Only "Not enough credits" shows and nothing changes.
- [ ] **S-02-4, criterion 4:** tap **The Maker's Eye**. "Needs runs (coming soon)" shows and nothing is spent.
- [ ] **S-02-4:** play **Easy Mark** (+3 credits), then install **Corroder** (2 credits). Memory now says **2/4**. Tap **End turn**.

**Corp's second turn (4 credits)**
- [ ] **S-02-3, criterion 6:** the Runner's Gordian Blade and Corroder are face up in their row.
- [ ] **S-02-4:** play **Anonymous Tip** (free). You draw 3, and it goes face up on Archives.
- [ ] **S-02-2, criterion 4:** put **Enigma** on Server 1 (2 credits, 2 left). Tap the other **Enigma**: Server 1 now asks 3 credits. Tap it. Only "Not enough credits" shows.

**Look and feel**
- [ ] **S-02-5, criterion 2:** every tap answers at once, and nothing makes you wait.
- [ ] **S-02-5, criterion 3:** the labels say HQ, R&D, Archives, Server 1, Stack, Heap, Grip, Memory.
- [ ] **S-02-5, criterion 4:** hold a few cards to read them. Does the text match the real cards as you remember them?
- [ ] **S-02-6, criterion 1:** the whole board fits with no scrolling, and everything is easy to tap.
- [ ] **S-02-6, criterion 3:** turn your phone upright. You see "Turn your phone sideways". Turn it back. Your game is exactly where you left it.
- [ ] **S-02-6, criterion 5:** open the link on a computer. It works like before.

**Automated checks (nothing to do, listed so you know they're covered)**
- **S-02-3, criterion 5 ("Not enough memory"):** you can't see this in a real game yet. The Runner's deck has only 3 small programs, so memory never goes over 3 of 4. (Akamatsu Mem Chip's "+1 memory" isn't built yet either.) The rule and the hint are covered by automated tests only. It will show up in play once the bigger card pool arrives.
- **S-02-4, criterion 3:** Play on a card you can't afford (e.g. Hedge Fund with under 5 credits) shows only "Not enough credits". (This deal has no Hedge Fund, so the tests cover it.)
- **S-02-4, criterion 5:** a played card that takes your hand over 5 brings up the usual "Discard" step at End turn.
- **S-02-5, criterion 1:** the busy board (3 servers with 2 ICE each, 4 Runner cards) fits on both phone sizes with nothing overlapping. See the screenshots below.
- **S-02-6, criteria 2 and 6:** notch on the left or right, and a full Sprint 1 turn played sideways.

**Checks only your phone can do**
- [ ] **S-02-6, criterion 4 (home screen opens sideways):** add the link to your home screen (browser menu → "Add to Home Screen") and open it from there. It should open sideways, with nothing under the notch, status bar or swipe bar. This also closes the Sprint 1 home-screen check (S-01-6). You said "we'll circle back", so it's fine to skip it for now.
- [ ] **Sprint 1 discard speed:** you said the 0.18-second discard flight "seems fine". If it still looks fine on the sideways board, there's nothing more to do.
- [ ] **Optional, S-02-6, criterion 2:** hold the phone sideways with the camera notch on the left, then on the right. Nothing you need to read or tap should be hidden.

## Screenshots
All from the automated checks. 844×390 is a normal phone held sideways, 640×360 a small one.
- [Busy board, Corp's view (normal phone)](sprint-02-screens/busy-board-corp-view-phone.png) · [small phone](sprint-02-screens/busy-board-corp-view-phone-small.png) · [Runner's view](sprint-02-screens/busy-board-runner-view-phone.png) · [computer](sprint-02-screens/busy-board-desktop.png)
- [Agenda picked: only New server lit](sprint-02-qa/phone-844x390-02-agenda-picked-new-server-lit.png) · [now face down in Server 1](sprint-02-qa/phone-844x390-03-agenda-in-server-1-face-down.png)
- [ICE picked: every server lit with its price](sprint-02-qa/phone-844x390-qa-ice-priced-targets.png)
- [Hedge Fund played: face up on Archives, 9 credits](sprint-02-qa/phone-844x390-07-hedge-fund-played-archives-face-up.png)
- [Runner's turn: the Corp's cards are backs](sprint-02-qa/phone-844x390-09-runner-turn-corp-cards-are-backs.png)
- [Ninja installed, Memory 1/4](sprint-02-qa/phone-844x390-12-ninja-installed-memory-1-of-4.png)
- ["Needs runs (coming soon)" on a small phone](sprint-02-qa/phone-640x360-r2-needs-runs-hint-with-play-lit.png)
- [A real card zoomed (Bank Job)](sprint-02-screens/zoom-bank-job-phone.png)
- [Notch on the left: nothing hidden](sprint-02-qa/phone-844x390-24-busy-board-notch-left.png)
- [Phone upright: "Turn your phone sideways"](sprint-02-qa/phone-390x844-upright-rotate-prompt.png) · [turned back: same game](sprint-02-qa/phone-844x390-after-rotating-back.png)

More: `docs/sprints/sprint-02-qa/` (QA's full playthrough on all three sizes) and `docs/sprints/sprint-02-screens/`.

## Didn't make it
- **Nothing was dropped.** All 6 stories were built. QA passed 31 of 32 checks; the 32nd is the home-screen check, which needs your phone.
- **"Not enough memory" can't be seen in play yet** (see above). The rule works and is tested; you'll see it once the Runner has more programs.
- **Installed cards don't do anything yet** (e.g. PAD Campaign's money, Akamatsu Mem Chip's +1 memory). As planned; their text says what they'll do later.
- **QA and the architect found 5 problems, and all are fixed:** hints were too small to read on a small phone; an upgrade in HQ covered the HQ pile; "Private Security Force" ran into its card type; one automated test was unreliable; and a fast double tap on End turn could end two turns on a slow phone.

## Two things to know about how this sprint went
- **Some work was done twice.** Several automatic scheduled team runs overlapped today and built parts of this sprint twice. We combined the work on the `sprint-02` branch (it's all in this PR). The leftover copies sit on three spare branches, `sprint-02-run-0805`, `sprint-02-run-1005-superseded` and `sprint-02-scheduled-run-alt`, which nothing uses (see question 1). No work was lost, and the double-tap fix above came out of one of those runs.
- **One automatic check run on the latest version went red.** The team's checks ran twice on the same code: one green, one red. The red one was a test of the End turn double-tap guard (the protection that stops a fast double tap from ending two turns). On a busy test machine the test sometimes can't land its second tap in the narrow 0.15–0.3 second window it needs. It never caught the game doing anything wrong: no tap was wrongly accepted. The team re-ran it and added a backlog item to make that test sturdier.

## Questions for you
1. **Can the team delete the three leftover branches** (`sprint-02-run-0805`, `sprint-02-run-1005-superseded`, `sprint-02-scheduled-run-alt`)? Everything useful from them is already in this sprint. — **Recommended:** A. Options: A) Yes, delete them. B) Keep them for now.
2. **The real cards' text** was typed in from memory (there's no official card list in the project). Two team members checked all 24 cards and found them correct. If any card you zoom looks wrong, tell us which one.

## How to respond
Comment on this PR, one line per story, for example "S-02-1 accepted" or "S-02-3 not accepted: the memory counter is hard to see". Or just write **"all accepted"**. Add your answer to question 1 and anything you'd change. Feedback goes on the backlog in your words.
