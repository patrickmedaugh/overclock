# Sprint 12 demo — Six new cards, full decks

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/?seed=35628  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR (add `?seed=35628` to the end of it).
*This sprint uses `?seed=35628` instead of your usual 240. It deals every new card in the first two turns, so the checklist below matches what you see. Without it you get a random deal.*

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-12
File right now: `overclock-sprint-12-20261118-0637-b93.1.apk`. A newer file may replace it if the team pushes again. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 11 app.

**Saved and online games:** the decks changed, so **a game saved before this update can't continue** (as you chose in Sprint 11). You'll see a short note and start a new game. This goes for online games too.

**Results:** QA checked all **24 criteria: all passed**, after 3 rounds. Two small bugs with Modded's price labels on your phone's screen size were found and fixed. One thing needs **a look on your phone** (Modded's prices, see below). All automatic checks are green.

## What's new
- **Both decks are now 45 cards**, the real minimum (S-12-5). Games last longer, about half as long again.
- **Accelerated Beta Test** (Corp agenda, 2 points, S-12-1). When you score it, you see the top 3 cards of R&D. You can install any ICE among them for free, already face up, on any server. The rest go to Archives face down.
- **Archived Memories** (Corp, S-12-2): take any card from Archives back to HQ, face-down ones too.
- **Experiential Data** (Corp upgrade, S-12-2): while it's face up, ICE protecting its server gets +1 strength. The ICE shows the new number in a small red pill.
- **The Toolbox** (Runner hardware, S-12-3): +2 memory, +2 link, and 2 credits each turn that only pay for icebreakers.
- **Modded** (Runner event, S-12-3): install a program or hardware for 3 credits less. Kate's own 1-credit discount still counts too.
- **Infiltration** (Runner event, S-12-4): gain 2 credits, **or** expose a face-down Corp card. "Expose" means both players see the card, but it stays face down ([Glossary](../GLOSSARY.md)).
- **Melange shows "Click ×3"** (S-12-6): a click symbol and "×3" instead of "Click, click, click".

## Try this (about 3 minutes, browser link with `?seed=35628`)
**Before you start:** if the start screen shows **Continue game** (your Sprint 11 game), tap it.
- [ ] S-12-5, criterion 4: it says **"That saved game can't continue on this new version of the game. Start a new game."** (No saved game? Skip this; QA checked it.)

Tap **Play on this device**. You play both sides, and a cover screen tells you when to pass the phone.

**Corp, turn 1** (5 credits, 3 clicks)
- [ ] S-12-5, criterion 1: R&D shows **39** and the top says **6 cards in HQ** (39 + 6 = 45).
- [ ] S-12-6, criterion 1: **Melange Mining Corp.** in your hand has a small **click symbol "×3"** chip. Hold it: the big card reads **"(symbol) ×3: Gain 7 credits."**
- [ ] S-12-2, criterion 2: tap **Archived Memories**. It's dimmed and says **"Archives is empty"**.
1. Install **Accelerated Beta Test** in a new server (it becomes **Server 1**).
2. Tap it and **Advance** twice. End turn.

**Runner, turn 1** (5 credits, 4 clicks)
3. Tap **Infiltration**.
   - [ ] S-12-4, criterion 1: two buttons, **"Gain 2 credits"** and **"Expose 1 card"**.
4. Tap **Expose 1 card**, then the face-down card in Server 1.
   - [ ] S-12-4, criterion 2: **Accelerated Beta Test** shows big, with **"Exposed · tap to hide"**. Tap it: it goes back to a face-down card.
5. Tap **Modded**. The Toolbox lights up with its price.
   - [ ] S-12-3, criterion 3: The Toolbox costs **5 credits** (9, less 3 for Modded and 1 for Kate). Tap The Toolbox: it installs, your credits go to **0**, and you used only Modded's click.
   - [ ] S-12-3, criterion 1: Memory reads **0/6**, **Link 3**, and The Toolbox shows **2**.
   - [ ] S-12-3, criterion 4: tap your other **Modded**. It's dimmed and says **"No program or hardware in your Grip"**.
6. Tap your credits twice. End turn.

**Corp, turn 2** (4 credits)
7. Tap Accelerated Beta Test, **Advance**, then **Score**. Three cards appear where your hand was: **Viktor 1.0** (lit), SEA Source and Accelerated Beta Test (dim; they aren't ICE).
   - [ ] S-12-1, criterion 1: tap **Viktor 1.0**. The servers light up as **"Install · free"**. Tap **HQ**. Viktor goes in **face up**, you still have **2 clicks**, and credits went **up** by 1 (Haas-Bioroid's install bonus), not down.
   - [ ] S-12-1, criterion 2: tap **"Trash 2 cards"**. Archives now shows 2 face-down cards.
8. Play **Archived Memories**.
   - [ ] S-12-2, criterion 1: a sheet shows your Archives. Tap the face-down **Accelerated Beta Test**: it goes back to HQ.
9. Install **Experiential Data** on **HQ**. Tap it and **Rez** it (2 credits).
   - [ ] S-12-2, criterion 3: Viktor 1.0 now shows a red **4** (it's printed 3).
10. End turn.

**Runner, turn 2**
- [ ] S-12-1, criterion 2 (Runner's side): Archives shows **Archived Memories** face up and **one face-down card**. Nothing on your screen says it's SEA Source. Viktor 1.0 on HQ is face up and shows **4**.

**Optional, whenever it comes up in a game**
- [ ] S-12-6, criterion 2: at the start of a Corp turn, tap a face-up Melange. The button reads **"Gain 7 credits · 3 clicks"**.
- [ ] S-12-3, criterion 2: with The Toolbox out, run into ICE with an icebreaker. The break buttons say **"The Toolbox pays"**. Nothing else can use those credits, and they refill to 2 each turn.

### One check only your phone can do
- [ ] **Modded's prices (step 5):** at your phone's size (891×296), each lit card shows just **what you'll pay** ("5 credits", "free", "1 credit"). On most cards it **doesn't show the discount** ("(−4)"), because there isn't room above the card name. On bigger screens it shows both, e.g. "1 credit (−4)". Is just the price fine? See question 2.

### Checked automatically (all passed; nothing for you to do)
- S-12-1, criterion 3: with **no ICE** among the 3 cards, one tap on **"Trash 3 cards"** sends them to Archives. [Screenshot](sprint-12-qa/891x296-06-abt-no-ice.png)
- S-12-1, criterion 4: with fewer than 3 cards in R&D it looks at what's there, and an empty R&D never loses the game.
- S-12-1, criterion 5: online, only the Corp's phone gets the 3 cards. The Runner's phone never receives their names. [Corp](sprint-12-qa/640x360-21-online-abt-corp.png) · [Runner](sprint-12-qa/640x360-22-online-abt-runner.png)
- S-12-2, criterion 4: with Experiential Data face down or trashed, ICE has its normal strength.
- S-12-4, criterion 3: online, an exposed card shows on both phones and nothing else is revealed. [Runner](sprint-12-qa/640x360-23-online-exposed-runner.png) · [Corp](sprint-12-qa/640x360-24-online-exposed-corp.png)
- S-12-5, criterion 2: both decks are legal under the real rules: 45 cards, at most 3 copies, influence Corp 8 and Runner 10 (limit 15), Corp 21 agenda points.
- S-12-5, criterion 3: 300 random pass-the-phone games and 60 online games on the 45-card decks. Every card did what it says, and no hidden card ever showed to the wrong player.
- Every card's numbers and text were checked against the official card list.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken at your phone's size (891×296) unless marked "small" (640×360). Every size is in `docs/sprints/sprint-12-qa/` and `docs/sprints/sprint-12-screens/`.
- **Accelerated Beta Test:** [Look at 3](sprint-12-qa/891x296-01-abt-look-at-3.png) · [Servers lit](sprint-12-qa/891x296-02-abt-servers-lit.png) · [Two ICE in](sprint-12-qa/891x296-03-abt-two-ice-in.png) · [What the Runner sees](sprint-12-qa/891x296-05-abt-runner-sees.png)
- **Archived Memories / Experiential Data:** [Pick a card](sprint-12-screens/s12-2-archives-sheet-891x296.png) · [Archives empty](sprint-12-qa/891x296-09-archived-memories-empty.png) · [Strength 3 on Enigma](sprint-12-qa/891x296-10-experiential-data-str3.png)
- **The Toolbox / Modded:** [Modded prices on your phone](sprint-12-qa/r3b-modded-toolbox-phone-short-3.png) · [Same, small, with discounts](sprint-12-qa/r3b-modded-toolbox-phone-small-3.png) · [Toolbox installed](sprint-12-screens/s12-3-toolbox-installed-891x296.png) · ["The Toolbox pays"](sprint-12-qa/891x296-15-toolbox-pays.png)
- **Infiltration:** [Two choices](sprint-12-qa/891x296-17-infiltration-two-choices.png) · [Exposed card](sprint-12-qa/891x296-18-infiltration-exposed.png)
- **Decks and Melange:** [New game, 45 cards](sprint-12-qa/891x296-19-new-game-45-cards.png) · ["Can't continue" note](sprint-12-qa/891x296-20-sprint11-save-note.png) · [Melange ×3 in hand](sprint-12-screens/s12-6-melange-hand-891x296.png) · [Melange held](sprint-12-screens/s12-6-melange-zoom-891x296.png)

## Didn't make it / things you might notice
All six stories were built. Things you might notice:
1. **Accelerated Beta Test always looks.** The real card says you *may* look. We built it as one step to match the story ("one tap"). See question 1.
2. **Modded's discount is hidden on most cards on your phone** (see the phone check and question 2).
3. **The Archived Memories sheet doesn't mark which cards are face down.** You see every card's face (they're yours), but not which ones the Runner can't see. The game needs a small change first; it's in the backlog.
4. **The computer opponent doesn't choose to play the new cards.** It handles Accelerated Beta Test's choice and Archived Memories' pick, but never plays Modded, Infiltration, The Toolbox and the others on purpose. This only matters if you play against the computer. "Smarter computer card play" is in the backlog.
5. **Games are longer** with 45 cards. If that feels too long, a "Quick game (30 cards)" option is an easy add later.
6. **Not in this sprint (as planned):** Aggressive Secretary, Ash 2X3ZB9CY and Corporate Troubleshooter (they need new rule steps), Gordian Blade's shortened buttons on small phones, the run panel with many buttons, a deck builder.

## Questions for you
1. **Accelerated Beta Test: add a "Don't look" step?** The real card says "you **may** look". Not looking keeps the top of R&D as it is, which matters only now and then. — **Recommended:** A. Options:
   A) **Keep it as is:** always look (one tap, faster).
   B) **Add "Look" / "Don't look"** first (real rules, one more tap every time you score it).
2. **Modded on your phone: is just the price fine?** — **Recommended:** A. Options:
   A) **Just the price** ("1 credit"), as now. Hold a card to see its printed cost.
   B) **Show the discount too** ("1 credit (−4)"). It means smaller text or covering more of the card's picture. Small polish item.
3. **Start the deck builder in Sprint 13?** You called it the next big feature. — **Recommended:** A. Options:
   A) **Yes, first slice:** build your own Corp and Runner decks from the cards the game has, with the real rules checked as you go (size, influence, agenda points), save them, and pick one when you start a pass-the-phone game.
   B) **One more card sprint first:** Aggressive Secretary, Ash 2X3ZB9CY and Corporate Troubleshooter (finishes Haas-Bioroid's Core Set).
   C) **Polish first:** Gordian Blade's buttons, face-down marks in Archives, a smarter computer opponent.

## How to respond
Comment with "accepted" or "not accepted" for each story (S-12-1 to S-12-6), plus anything you'd change. A quick example: "All accepted. 1A 2A 3A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
