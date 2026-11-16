# Sprint 08 demo — Real identities, bigger real decks

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-08
File right now: `overclock-sprint-08-20261116-0324-b40.1.apk`. If the team pushes again, a newer file replaces it. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 7 app, as before.

**Online games:** this update changed the rules, so **any online game that was running has ended** ("That game has ended"). Just start a new one. Games started from now on use the new decks.

**Results:**
- QA ran **36 checks: 36 passed, 0 failed** (after a second round).
- The first round found 2 small problems with words on the screen. The rules were right in both cases. Both are fixed:
  - Melange Mining Corp. said "No clicks left" when the Corp still had 1 or 2 clicks. It now says **"Needs 3 clicks"**.
  - Against Heimdall 1.0 the screen showed each button's price but never the total. The run panel now has a line like **"Break all: 4 + 3 = 7 credits"**.
- QA also found that a short note could sit on top of the run panel for about a second. Notes now go where End turn usually is (End turn is hidden during a run anyway).
- The architect reviewed everything and approved it.
- **Card numbers checked against the official Core Set list.** Four influence numbers we had typed from memory were wrong and are now corrected: Adonis Campaign 2, Heimdall 1.0 2, Rototurret 1, Neural Katana 2. *Influence* = the "price" of using another faction's card in your deck. Both decks are still legal: Corp uses 9 of its 15, Runner 14 of 15.

## What's new
- **Real identities.** The Corp now plays as **Haas-Bioroid: Engineering the Future** and the Runner as **Kate "Mac" McCaffrey: Digital Tinker**. Each card sits on the table all game (the Corp's in the HQ spot, Kate's to the left of her Stack). Hold one to read it.
  - Haas-Bioroid: the first card the Corp installs each turn gives it **+1 credit**.
  - Kate: the first program or hardware she installs each turn costs **1 less**.
- **Two 30-card decks** following the real deck-building rules. **Hostile Takeover and Ninja left the decks** (your answer 3A). They still exist in the game and come back with other decks later.
- **12 new real cards** (10 from the proposal, plus Rototurret from your answer 4B):
  - Corp: **Adonis Campaign**, **Melange Mining Corp.**, **Biotic Labor**, **Viktor 1.0**, **Heimdall 1.0**, **Rototurret**.
  - Runner: **Sure Gamble**, **Magnum Opus**, **Pipeline**, **Battering Ram**.
- **Brain damage** (from Viktor and Heimdall). The Runner throws away a random card *and* his hand limit drops by 1 for the rest of the game. A **"Hand max 4"** tag shows by his credits.
- **The Corp can destroy the Runner's programs (Rototurret)**, and **Sacrificial Construct finally works**: it can be thrown away to save the program.
- **Battering Ram breaks two subroutines for one payment.** *Subroutine* = one line of an ICE's text that fires if you don't break it.
- **Easier-to-read markers on cards** (your Sprint 7 fixes):
  - Credits on a card = a **gold coin pill**.
  - Advancement counters = a **green chevron tag**.
  - On small phones they no longer cover the card's name or type.
- **Every card in both decks now works fully**, except **Private Security Force** (it scores its 2 points, but its ability needs *tags*, which come later).

**The decks** (changed from the proposal: Rototurret ×2 replaced 1 Wall of Static and 1 Enigma, so Rototurret can show up):
- **Corp (30 cards, 15 agenda points):** Hedge Fund ×3, Anonymous Tip, Neural EMP, Biotic Labor, PAD Campaign ×3, Adonis Campaign ×2, Melange Mining Corp. ×2, Akitaro Watanabe, Ice Wall ×2, Wall of Static, Enigma, Rototurret ×2, Neural Katana, Viktor 1.0 ×2, Heimdall 1.0, Priority Requisition ×3, Private Security Force ×3.
- **Runner (30 cards):** Sure Gamble ×3, Easy Mark ×2, Diesel ×3, Armitage Codebusting ×2, Bank Job, Magnum Opus ×2, The Maker's Eye ×3, Inside Job ×2, Corroder, Gordian Blade ×2, Pipeline ×2, Battering Ram ×2, Akamatsu Mem Chip ×2, Cyberfeeder ×2, Sacrificial Construct.

## Try this

### How to get the cards out
- **Cards come by chance.** Every new game shuffles the decks, and they're twice as big now, so a card may take a while to show up.
- **To find one faster:** tap your deck to draw (1 click each). Or start a new deal: go back to the start screen (or reload the page) and tap **Play on this device** again.
- **Play on this device** is easiest, because you play both sides.
- **Big ICE needs money.** Heimdall 1.0 costs the Corp 8 to flip face up. Build the Corp's credits first with Hedge Fund, Adonis Campaign or Melange. For the Runner, Sure Gamble (+4 overall) helps.

### Right away (about 2 minutes, on one device)

**S-08-1: Play as real identities**
- [ ] Criterion 1: start a new game. Haas-Bioroid sits in the Corp's HQ spot and Kate to the left of the Runner's Stack. Hold either one: it zooms and you can read all of its text.
- [ ] Criterion 2: as the Corp, install any card. You get +1 credit back and a short note "Engineering the Future: +1 credit". Install a second card that turn: no extra credit.
- [ ] Criterion 3: as the Runner, with no program or hardware installed yet this turn, pick Corroder (cost 2). The lit place says **Install · 1 credit (−1)**. Install it: 1 credit goes, with the note "Digital Tinker: 1 credit off".
- [ ] Criterion 4: install a resource first (e.g. Armitage Codebusting): Corroder still shows (−1). After a program or hardware, the next one shows full price with no "(−1)".
- [ ] Criterion 5 (automated check, passed): Akamatsu Mem Chip (cost 1) installed first costs 0, never less.
- [ ] Criterion 6 (automated check, passed): online, both devices show the same credits.

**S-08-5: The two 30-card decks** (look at the very first screen)
- [ ] Criterion 1: at the start, the Runner's **Stack shows 25**. The Corp's **R&D shows 24**, not 25: the Corp has already made its first-turn draw. (So it held 25 before that.)
- [ ] Criteria 2–4 (automated checks, passed): each deck has 30 cards, at most 3 of any card, legal agendas and influence (Corp 9/15, Runner 14/15); the Corp has 15 agenda points in every deal; every card works as the table in the proposal says, and no made-up card is left.

**S-08-6: Easier-to-read markers**
- [ ] Criterion 1: on your phone, put Armitage Codebusting or Bank Job on the table (Adonis Campaign too, once rezzed). The card's full name, its type (e.g. RESOURCE) and the credits number are all readable, with nothing covering anything.
- [ ] Criterion 2 (automated check, passed): same at the bigger phone size.
- [ ] Criterion 3: advance an Ice Wall (tap it on the Corp's turn, Advance) while Armitage is on the Runner's side. Credits are a **gold coin pill**; advancement is a **green chevron tag**.

### When the cards show up (a few games)

**S-08-2: Adonis Campaign, Melange Mining Corp., Biotic Labor** (Corp)
- [ ] Criterion 1: install Adonis Campaign. On a later Corp turn, tap it: **Rez · 4 credits**. It flips face up with **12** on it. The Runner's side shows the 12 too.
- [ ] Criterion 2: at the start of the Corp's next turn: note "Adonis Campaign: +3 credits", the card goes 12 → 9. After 4 turns it's empty and goes to Archives (the Corp's discard pile).
- [ ] Criterion 3: install and rez Melange (rez costs 1, no click). At the start of a turn with all 3 clicks, tap it: **Gain 7 credits · 3 clicks**. Tap it: +7 credits, 0 clicks. With 1 or 2 clicks left, the button is dimmed and says **"Needs 3 clicks"**.
- [ ] Criterion 4: play Biotic Labor (costs 4 credits and 1 click). The click counter goes from 2 to **4**, and you can use all of them.
- [ ] Criteria 5–6 (automated checks, passed): face down, Adonis and Melange do nothing and tell the Runner nothing; online works the same.

**S-08-3: Viktor 1.0, Heimdall 1.0, brain damage**
- [ ] Criterion 1: as the Runner, run into a face-up Viktor 1.0 and tap **Let it fire: take 1 brain damage, run ends**. One random card leaves your hand for the Heap, and the message names Viktor 1.0.
- [ ] Criterion 2: a **Hand max 4** tag shows by the Runner's credits. At the end of his turn, with more than 4 cards, he must discard down to 4.
- [ ] Criterion 3: run into Heimdall 1.0 with only Corroder. The run panel shows **"Break all: 4 + 3 = 7 credits"**: 4 for strength, 3 for the breaks. The Break buttons stay dimmed ("Raise strength first") until you've tapped **+1 strength** 4 times.
- [ ] Criteria 4–6 (automated checks, passed): brain damage with an empty hand flatlines the Runner (Corp wins); a hand limit below 0 at the end of his turn flatlines him; online, both devices show the lower limit and the same lost card.

**S-08-4: Sure Gamble, Magnum Opus, Pipeline, Battering Ram** (Runner)
- [ ] Criterion 1: with 5 credits, play Sure Gamble. You end with 9.
- [ ] Criterion 2: install Magnum Opus and tap it: **Gain 2 credits · 1 click**. Use it as often as you like; it never runs out.
- [ ] Criterion 3: with Pipeline installed, run into a face-up Neural Katana. Tap **+1 strength · 2 credits** twice, then break for 1 credit (5 in all). The extra strength lasts the rest of the run.
- [ ] Criterion 4: with Battering Ram installed, run into a face-up Heimdall 1.0. Raise strength 3 times (1 credit each), tap **Break up to 2 · 2 credits**, tap two of the three subroutines, then **Break 2 · 2 credits**. Both are broken for one payment. (**Back** cancels the pick.)
- [ ] Criterion 5: with Battering Ram, Gordian Blade and Pipeline installed (4 of 4 memory) and no Akamatsu Mem Chip, try to install Magnum Opus. It's dimmed and says **"Not enough memory"**.
- [ ] Criterion 6 (automated check, passed): online, the two-at-once break looks the same on both devices.

**S-08-7: Rototurret and Sacrificial Construct**
- [ ] Criterion 1: install **two** programs as the Runner, then run into a face-up Rototurret and let it fire. The screen covers up and passes to the Corp, which taps the program to trash. It goes to the Runner's Heap. (With just one program there's no question: it's trashed straight away.)
- [ ] Criterion 2: Rototurret's second subroutine, "End the run", ends the run.
- [ ] Criterion 3: same again with Sacrificial Construct installed. The Runner gets **"Trash Sacrificial Construct instead"** / **"Let it be trashed"**. Choosing the first keeps the program and puts the Construct in the Heap; the report says so.
- [ ] Criterion 4: choose **Let it be trashed** (or have no Construct): the program goes to the Heap as normal.
- [ ] Criterion 5 (automated check, passed): pass-the-phone and online work the same.

### Online, on two devices (optional, about 5 minutes)
**Tip: you can test this alone.** Use your phone app for one player and a browser on a computer for the other.
1. On device A: **Play online** → **Start a game** → pick a side. On device B: **Play online** → **Join with code**.
2. Check that both identities show on both screens.
3. If Viktor fires, both devices should show **Hand max 4**.
4. If Rototurret fires with 2 programs out, the Runner's device shows **"Corp is choosing…"** while the Corp picks on its own device.

QA can't reach the live online service from its test computers, so this is the one part only you can try on real devices.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken by QA at sideways phone size (844×390) unless the name says "small" (640×360). All three sizes are in `docs/sprints/sprint-08-qa/`.
- **Identities:** [Both on the table](sprint-08-qa/phone-01-identities-corp-seat.png) · [Haas-Bioroid zoomed](sprint-08-qa/phone-02-identity-zoom-corp.png) · [Kate zoomed](sprint-08-qa/phone-03-identity-zoom-runner.png) · [+1 credit note](sprint-08-qa/phone-05-hb-first-install-note.png) · [Corroder "Install · 1 credit (−1)"](sprint-08-qa/phone-06-kate-corroder-price-1.png)
- **Adonis / Melange / Biotic Labor:** [Rez · 4 credits](sprint-08-qa/phone-07-adonis-rez-button.png) · [12, Runner's view](sprint-08-qa/phone-08-adonis-12-runner-seat.png) · [+3 credits note](sprint-08-qa/phone-09-adonis-plus-3-note.png) · ["Needs 3 clicks"](sprint-08-qa/phone-36-round2-melange-needs-3-clicks.png) · [Gain 7 credits · 3 clicks](sprint-08-qa/phone-11-melange-gain-7-button.png) · [4 clicks](sprint-08-qa/phone-12-biotic-labor-4-clicks.png)
- **Brain damage:** [Viktor report](sprint-08-qa/phone-13-viktor-report.png) · [Hand max 4](sprint-08-qa/phone-14-hand-max-4.png) · [Discard down to 4](sprint-08-qa/phone-15-discard-down-to-4.png) · [Heimdall "Break all: 4 + 3 = 7 credits"](sprint-08-qa/phone-16-heimdall-corroder-prices.png) · [Same on a small phone](sprint-08-qa/phone-small-16-heimdall-corroder-prices.png) (for question 2)
- **Runner cards:** [Battering Ram: picking 2](sprint-08-qa/phone-18-ram-pick-1-and-3.png) · [Two broken](sprint-08-qa/phone-19-ram-two-broken.png) · [Pipeline vs Neural Katana](sprint-08-qa/phone-20-pipeline-katana.png) · [Magnum Opus](sprint-08-qa/phone-21-magnum-opus-button.png) · [Sure Gamble: 9](sprint-08-qa/phone-22-sure-gamble-9.png) · [Not enough memory](sprint-08-qa/phone-23-not-enough-memory.png)
- **Rototurret / Construct:** [Cover passes to the Corp](sprint-08-qa/phone-24-rototurret-cover-to-corp.png) · [Corp picks](sprint-08-qa/phone-25-rototurret-corp-picks.png) · [Save it?](sprint-08-qa/phone-26-construct-save-choice.png) · [Saved](sprint-08-qa/phone-27-construct-saved-report.png)
- **Online (two pretend devices):** [Runner: "Corp is choosing…"](sprint-08-qa/phone-28-online-runner-corp-is-choosing.png) · [Corp picks](sprint-08-qa/phone-29-online-corp-picks.png) · [Runner: save or not](sprint-08-qa/phone-30-online-runner-save-or-not.png)
- **Markers (small phone):** [Armitage 12](sprint-08-qa/phone-small-32-armitage-12-readable.png) · [Bank Job 8](sprint-08-qa/phone-small-33-bank-job-8-readable.png) · [Ice Wall chevron vs Armitage coin](sprint-08-qa/phone-small-34-ice-wall-counters-vs-armitage-credits.png)

## Didn't make it / things you might notice
Nothing was dropped: all 7 stories were built, including Battering Ram (first in line to cut) and Rototurret.
1. **Online, a Corp who steps away can hold up a Rototurret choice.** If the Corp player's device is away when Rototurret fires, the Runner waits ("Waiting for the other player to come back…"). Rez decisions already work this way. Next: the game answers for an away player after a short wait (question 3, option A).
2. **The run panel text is small on the smallest phones.** At 640×360, with a 3-subroutine ICE like Heimdall, the smallest words are about 8 pixels tall. They look sharp on a real phone screen, but please check (question 2).
3. **Private Security Force still only scores points.** Its ability needs tags, which come with traces (question 3, option A). Kate's printed "1 link" also does nothing until then.
4. **Card text uses the 2012 Core Set wording.** For example, Viktor and Heimdall say "brain damage". Newer printings say "core damage" and add a "lose a click to break" line. Tell us if you'd prefer the newer wording.
5. **Games are a bit longer now.** 30-card decks instead of 15–17. The real minimum is 45, which comes once more Haas-Bioroid cards work.

## Questions for you
1. **Accept each story?** S-08-1 identities, S-08-2 Adonis / Melange / Biotic Labor, S-08-3 Viktor / Heimdall / brain damage, S-08-4 Sure Gamble / Magnum Opus / Pipeline / Battering Ram, S-08-5 30-card decks, S-08-6 marker fixes, S-08-7 Rototurret / Sacrificial Construct. — **Recommended:** accept all seven. Anything that didn't work: say "not accepted" and what happened.
2. **Can you read the run panel on your phone** during a Heimdall encounter (the box on the right with "Strength 6", "Break all…" and the subroutine lines)? — **Recommended:** A. Options: A) yes, it's fine. B) too small: make it bigger next sprint (a wider panel during runs).
3. **What's the main thing for Sprint 9?** — **Recommended:** A. Options:
   A) **Traces and tags** (the bidding contest from the real game). This makes Private Security Force work and opens up NBN and Weyland cards. Plus: **the game answers for an away online player** at Rototurret and rez choices, so nobody gets stuck.
   B) **A computer opponent** so you can play solo against the Corp or the Runner.
   C) Something else: tell us.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "All accepted. Q2 A. Q3 A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
