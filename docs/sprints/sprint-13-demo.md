# Sprint 13 demo — Build your own decks

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.
*No `?seed=` this time: the checklist below works with any deal.*

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-13
File right now: `overclock-sprint-13-20261118-2116-b103.1.apk`. A newer file may replace it if the team pushes again. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 12 app.

**Saved games:** no rules or cards changed this sprint, so **a game saved in Sprint 12 still continues** (tap **Continue game** as usual). Online games work as before.

**Results:** QA checked all **26 criteria: all passed**, after 2 rounds. One small bug was found and fixed: a deck name you'd typed but not confirmed was lost if the app closed right then. One thing needs **a check on your phone** (the Android app keeps your decks after you swipe it away, see below). All automatic checks are green.

## What's new
- **A Decks button** on the start screen (S-13-1). It lists the two **standard decks** (the 45-card decks you've been playing) and every deck you make. Tap **New Corp deck** or **New Runner deck**, then **Start from the standard deck** or **Start empty**.
- **The deck editor** (S-13-2): every card for that side, grouped by type, with its cost, influence dots and how many copies you have ("2 / 3"). Tap **+** or **−**. Hold a card to read it big. The **In deck** switch shows only the cards you've put in.
- **The real deck rules, checked as you go** (S-13-3): a bar at the top shows cards, [influence](../GLOSSARY.md) and, for the Corp, [agenda points](../GLOSSARY.md). Green is fine, red says what's wrong in plain words. When everything is right it says **"✓ Ready to play"**.
- **Your decks stay on your device** (S-13-4). There's no Save button: every tap is kept. Rename a deck by tapping its name; **Delete** asks first. The phone app and the browser each keep their own decks (as you chose).
- **Pick your decks** (S-13-5): **Play on this device** now opens **Pick your decks**, with the standard decks already picked. Tap **Start** if you don't care, or pick your own. A saved game keeps its own copy of the decks, so editing a deck later never changes a game in progress.
- **Online games still use the standard decks** and say so: "Online games use the standard decks for now."

### Why the agenda number can say "needs 18–19"
The real rule ties the agenda points a Corp deck needs to **its size**: **40–44 cards need 18–19 points, 45–49 cards need 20–21**, and so on (each 5 more cards add 2). So a deck that's still short, say 41 cards, shows "Agenda points 18 (needs 18–19)" in green; the card count is what's red. The proposal's example ("needs 20–21" at 41 cards) was wrong on this; the game and the editor use the same formula, and it's the real rule.

## Try this (about 3 minutes, browser link)
**Before you start:** if the start screen shows **Continue game** (your Sprint 12 game) and you want to keep it, play it out or skip it: starting a new pass-the-phone game below replaces it.

**Build a 46-card Corp deck**
1. On the start screen, look at the buttons.
   - [ ] S-13-1, criterion 1: **Decks** sits next to **Play on this device** and **Play online**.
2. Tap **Decks**.
   - [ ] S-13-1, criterion 2: it lists **Standard Corp deck (Haas-Bioroid)** and **Standard Runner deck (Kate)**, each "45 cards · ✓ Ready to play", and the buttons **New Corp deck** and **New Runner deck**.
3. Tap **Standard Corp deck (Haas-Bioroid)**.
   - [ ] S-13-1, criterion 4: there are no + / − buttons and no Delete, only **Copy to edit**. Tap **Back**.
4. Tap **New Corp deck**.
   - [ ] S-13-1, criterion 3: you're asked **Start from the standard deck** or **Start empty**. Tap **Start from the standard deck**. The editor opens, named **"My Corp deck 1"**, and the bar reads **"45 / 45 cards · Influence 8 / 15 · Agenda points 21 (needs 20–21)"** with **✓ Ready to play**.
   - [ ] S-13-2, criterion 1: scroll the list: Agendas, ICE, Assets, Upgrades, Operations, each card with its cost, dots and "n / 3". The identity, Haas-Bioroid, is at the top.
5. Find **Hostile Takeover** (in Agendas).
   - [ ] S-13-3, criterion 3: its **+** is dimmed and the row says **"Haas-Bioroid can't use Weyland agendas"**.
6. Find **Hedge Fund** (Operations, already 3 / 3). Tap its **+**.
   - [ ] S-13-3, criterion 2: the **+** is dimmed and a short note says **"Max 3 copies"**.
7. Find **Rototurret** (ICE, 1 / 3). Tap **+** once.
   - [ ] S-13-2, criterion 2: it goes to **2 / 3** and the bar to **46 / 45 cards** at once. Still **✓ Ready to play** (46 cards need 20–21 points; you have 21).
8. Tap **−** on **Priority Requisition** (Agendas, 3 points each).
   - [ ] S-13-3, criterion 1: the bar shows **45 / 45 cards** in green and **"Agenda points 18 (needs 20–21)"** in red, with "2 agenda points short". Tap its **+** again: back to 46 and **✓ Ready to play**.
9. Hold any card in the list.
   - [ ] S-13-2, criterion 3: it shows big and readable, as in a game. Let go: back to the list.
10. Turn on **In deck**.
    - [ ] S-13-2, criterion 5: cards you have 0 of disappear (Hostile Takeover, Anonymous Tip…). Turn it off again.
11. Tap the name **"My Corp deck 1"** and type a new name, e.g. **"Rototurret 46"**. Tap **Back**.
    - [ ] S-13-4, criterion 3: the Decks list shows **Rototurret 46 · 46 cards · ✓ Ready to play**.

**Go over the influence limit (Runner, optional, 30 seconds)**
12. Tap **New Runner deck** → **Start from the standard deck** (Influence 10 / 15). Tap **+** on **Ninja** twice and on **Inside Job** once.
    - [ ] S-13-3, criterion 4: influence turns red, **"Influence 17 / 15"**, with **"2 influence over the limit"**. Tap **−** on Inside Job: back to **✓ Ready to play**.
13. Tap **−** on Sure Gamble once (44 cards), then **Back**: the list shows this deck with a red **"1 card short"**. Open it again and tap **Delete** (top of the editor).
    - [ ] S-13-4, criterion 4: it asks first; tap **Delete** and it's gone. The standard decks have no Delete. (To see a not-ready deck in the next step, skip the delete and remove it afterwards.)

**Play with your deck**
14. **Back** to the start screen. Tap **Play on this device**.
    - [ ] S-13-5, criterion 1: **Pick your decks** shows a **Corp deck** and a **Runner deck** column, the standard decks picked, and **Start**.
    - [ ] S-13-5, criterion 3: a deck that isn't ready (if you kept the 44-card one) is dimmed with its red note, and tapping it doesn't pick it.
15. Tap **Rototurret 46**, then **Start**. Pass the cover screen to the Corp.
    - [ ] S-13-5, criterion 2: R&D shows **40** and the top says **6 cards in HQ** (40 + 6 = 46). The Runner's Stack shows 40 (45, less 5 in his hand).

**Continue after editing**
16. Close the browser tab completely and open the link again. Tap **Decks**.
    - [ ] S-13-4, criterion 2: **Rototurret 46 · 46 cards · ✓ Ready to play** is still listed.
17. Open **Rototurret 46**, tap **−** on Rototurret (back to 45), then **Back**, **Back**.
    - [ ] S-13-5, criterion 4: tap **Continue game**: R&D still shows **40** and HQ **6**. The game kept its own copy of the deck.
18. Close the tab and open the link again (your game stays saved). Tap **Play online**.
    - [ ] S-13-5, criterion 5: it says **"Online games use the standard decks for now."**

### One check only your phone can do
- [ ] **S-13-4, criteria 1 and 5 (Android app closes):** in the **app**, tap **Decks** → **New Corp deck** → **Start from the standard deck**, tap **−** once on any card. Open your recent apps and **swipe OVERCLOCK away**. Open it again → **Decks**: **"My Corp deck 1 · 44 cards · 1 card short"** should still be there. (The app and the browser keep separate decks, so your browser decks won't show in the app.)

### Checked automatically (all passed; nothing for you to do)
- S-13-2, criterion 4: every card can be reached by scrolling, and every + / − is at least thumb size (44 px), at your phone's size (891×296), two other phone sizes and on a computer.
- S-13-3, criterion 6: the editor's "Ready to play" and the game always agree: the standard decks plus hundreds of randomly built decks, legal and not.
- Taps answer in 22–46 thousandths of a second on phones (the limit is 100), even with the processor slowed down 6 times.
- The upright "turn your phone sideways" prompt covers the Decks screen and the editor too.

(Tick each box in your review comment, or say which failed.)

## Screenshots
All at your phone's size (891×296). Every size is in `docs/sprints/sprint-13-qa/`.
- **Start and Decks:** [Start screen with Decks](sprint-13-qa/r1-891x296-home.png) · [Decks, first visit](sprint-13-qa/r1-891x296-decks-first.png) · [New deck: standard or empty](sprint-13-qa/r1-891x296-new-deck-choice.png) · [Standard deck, read only](sprint-13-qa/r1-891x296-standard-read-only.png) · [Your decks kept, one "4 cards short"](sprint-13-qa/r1-891x296-decks-kept.png) · [Delete asks first](sprint-13-qa/r1-891x296-delete-ask.png)
- **Editor and rules:** [46 cards, Ready to play](sprint-13-qa/r1-891x296-editor-ready-46.png) · [Agenda points short, Hostile Takeover blocked](sprint-13-qa/r1-891x296-editor-agenda-short.png) · [Max 3 copies](sprint-13-qa/r1-891x296-editor-max3.png) · [Influence 17 / 15](sprint-13-qa/r1-891x296-editor-influence-over.png) · [In deck switch](sprint-13-qa/r1-891x296-editor-in-deck.png) · [Holding a card](sprint-13-qa/r1-891x296-zoom-c18.png)
- **Playing:** [Pick your decks](sprint-13-qa/r1-891x296-picker.png) · [Game dealt from a 46-card deck (40 + 6)](sprint-13-qa/r1-891x296-game-own-deck.png) · ["Online games use the standard decks for now."](sprint-13-qa/r1-891x296-online-note.png)

## Didn't make it / things you might notice
All five stories were built; nothing was dropped. Things you might notice:
1. **"Needs 18–19" on a short deck.** That's the real rule (see "Why the agenda number…" above), not a bug.
2. **"New game" at the end of a game with your own decks** opens **Pick your decks** with the same decks already picked (one more tap: Start). If you've changed that deck since, the standard deck is picked instead. A game with the standard decks still starts a new game at once. See question 2.
3. **The Corp has little choice in agendas** today: Haas-Bioroid can only use its own and neutral agendas, which add up to exactly 21 points, so a legal Corp deck holds all 9 and is 45–49 cards. More agendas will fix this.
4. **Two browser tabs open on the Decks screen at once:** the last one to change something wins. Unlikely to matter; noted for later.
5. **Not in this sprint (as planned):** online games with your own decks, decks shared between the phone app and the browser (you said you'll want this eventually), choosing an identity (only one per side today), more cards, search and filters, deck lists as text, your decks against the computer.

## Questions for you
1. **Accept each story?** S-13-1 Decks screen, S-13-2 add and remove cards, S-13-3 deck rules, S-13-4 decks kept on your device, S-13-5 pick your decks. — **Recommended:** accept all five once the Android phone check works. If something doesn't, say "not accepted" and what you saw, and we fix it first.
2. **"New game" after a game with your own decks: what should it do?** — **Recommended:** A. Options:
   A) **Open Pick your decks with the same decks picked** (as built). One extra tap, and you can switch decks.
   B) **Always start with the standard decks picked.**
3. **What should Sprint 14 be?** — **Recommended:** A. Options:
   A) **Your decks everywhere, and online with your own decks:** keep your decks with the online service (with a simple sign-in or a code), so the phone app and the browser show the same decks and they aren't lost if the browser is cleared; then you and a friend can each play your own deck online. This is the "persist" wish you gave when approving this sprint.
   B) **More cards to build with:** the rest of Haas-Bioroid's Core Set (Aggressive Secretary, Ash 2X3ZB9CY, Corporate Troubleshooter) and more Haas-Bioroid agendas, so Corp decks get real choices.
   C) **Polish:** mark face-down cards in the Archived Memories sheet, a smarter computer opponent, Gordian Blade's shortened buttons on small phones.

## How to respond
Comment with "accepted" or "not accepted" for each story (S-13-1 to S-13-5), plus anything you'd change. A quick example: "All accepted. 2A 3A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
