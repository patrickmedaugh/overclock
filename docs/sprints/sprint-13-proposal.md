# Sprint 13 proposal — Build your own decks

**Reply "approved" to start, or comment on any story to change it.**
If you approve without answering the questions, the recommended options apply. One line is enough, e.g. "1a 2a 3a 4a approved".

## Goal
Build your own Corp and Runner decks from every card the game has, with the real deck rules checked as you go, keep them on your device, and pick them when you start a pass-the-phone game.

## How it will work (in 5 taps)
1. The start screen gets a new **Decks** button.
2. **Decks** lists the two **standard decks** (the 45-card decks you play today) and any decks you've made. Tap **New Corp deck** or **New Runner deck**.
3. You see every card for that side, with **−** and **+** buttons and how many copies you have. Hold a card to read it big, as in a game.
4. A bar at the top shows the rules live, e.g. **"41 / 45 cards · Influence 8 / 15 · Agenda points 18 (needs 20–21)"**. Anything not yet right is red and says why in plain words.
5. **Play on this device** now asks **which Corp deck and which Runner deck**. The standard decks are picked already, so it's one extra tap if you don't care.

**Words used here** (also in the [Glossary](../GLOSSARY.md) after this sprint):
- **Identity**: your side's character card (Haas-Bioroid for the Corp, Kate for the Runner). Today each side has one, so it's picked for you.
- **Influence**: the real limit on borrowing cards from other factions. Each such card costs its dots; Haas-Bioroid and Kate can spend up to 15.
- **Agenda points**: a Corp deck must hold a set number of agenda points for its size (20–21 for 45 to 49 cards).

**Good to know:** with today's cards the Corp has little freedom with agendas. Haas-Bioroid may only use its own and neutral agendas (real rule), which today are Priority Requisition, Private Security Force and Accelerated Beta Test: 21 points in all. So a legal Corp deck has to hold all 9 of them and be 45–49 cards. The Runner and the rest of the Corp deck are open. More agendas come with later card sprints.

## Stories
### S-13-1: The Decks screen
*Why it matters:* one place to see, start and open your decks.
*Acceptance criteria:*
- Given the start screen, when you look at it, then there is a **Decks** button next to Play on this device and Play online.
- Given you tap **Decks** for the first time, when the screen opens, then it lists **Standard Corp deck (Haas-Bioroid)** and **Standard Runner deck (Kate)**, each with its card count, and buttons **New Corp deck** and **New Runner deck**.
- Given you tap **New Corp deck** (or Runner), when it opens, then you choose **Start from the standard deck** or **Start empty** (question 1), and the deck editor opens with that list and a name like **"My Corp deck 1"**.
- Given you tap a standard deck, when it opens, then you can read its cards but not change them, and a **Copy to edit** button makes your own copy.
- Given the Decks screen, when you tap **Back**, then you return to the start screen.
*Size:* M

### S-13-2: Add and remove cards
*Why it matters:* this is the deck builder itself.
*Acceptance criteria:*
- Given the editor for a Corp deck, when it opens, then every Corp card the game has is listed (24 cards, plus the identity shown at the top), grouped by type (agendas, ICE, assets, upgrades, operations), each with its name, cost, influence dots and **"2 / 3"**-style copy count. A Runner deck shows the 20 Runner cards the same way (events, hardware, resources, programs).
- Given a card with fewer than 3 copies, when you tap **+**, then the count goes up by 1 and the deck size in the bar goes up within a moment; **−** does the opposite, down to 0.
- Given you hold a card in the list, when it zooms, then its full text and numbers are readable, as in a game, and letting go returns to the list.
- Given a long list, when you scroll, then every card can be reached with one thumb, and **+** / **−** are at least thumb size (44 px) at 844×390, 640×360, 891×296 (your phone) and on a computer. (automated check)
- Given the editor, when you want only the cards in the deck, then an **In deck** switch hides the cards you have 0 of.
*Size:* L

### S-13-3: The real deck rules, checked as you go
*Why it matters:* you can only build decks the real game allows, and you always know what's missing.
*Acceptance criteria:*
- Given any change, when the bar updates, then it shows the card count against the minimum (**"41 / 45 cards"**), influence (**"Influence 8 / 15"**) and, for the Corp, agenda points with the allowed range (**"Agenda points 18 (needs 20–21)"**). Each part is green when it's right and red when it isn't.
- Given a card already at 3 copies, when you look at its **+**, then it's dimmed, and tapping it says **"Max 3 copies"**.
- Given a Haas-Bioroid deck, when you look at Hostile Takeover (a Weyland agenda), then its **+** is dimmed and says **"Haas-Bioroid can't use Weyland agendas"**.
- Given you add other-faction cards past 15 influence, when the bar updates, then influence turns red (e.g. **"Influence 17 / 15"**) and says **"2 influence over the limit"**; you can still remove cards to fix it.
- Given a deck that breaks no rule, when the bar updates, then it says **"Ready to play"** with a tick.
- Given the standard decks and decks built by the tests, when they're checked, then the editor and the game agree on what's legal, using the same rule check the game already runs on its own decks. (automated check)
*Size:* M

### S-13-4: Your decks stay on your device
*Why it matters:* build once, play many times.
*Acceptance criteria:*
- Given you change a deck, when you leave the editor (or close the app), then the change is already kept: there is no Save button to forget (question 3 covers unfinished decks).
- Given you've made decks, when you open **Decks** later, even after closing the browser or the Android app, then they're listed with their name, card count and a **Ready to play** tick or a short red note (e.g. **"4 cards short"**).
- Given a deck of yours, when you tap its name in the editor, then you can rename it.
- Given a deck of yours, when you tap **Delete** and confirm, then it's gone; the standard decks have no Delete.
- Given a phone, when you build decks in the Android app, then they're kept in the app; the browser keeps its own (question 4).
*Size:* S

### S-13-5: Pick your decks for a pass-the-phone game
*Why it matters:* the payoff: play with the deck you just built.
*Acceptance criteria:*
- Given you tap **Play on this device**, when the next step shows, then it has a **Corp deck** and a **Runner deck** choice (standard decks picked already) and a **Start** button.
- Given your own legal Corp deck is picked, when the game starts, then R&D and HQ together hold exactly that deck's cards (e.g. 46 if you built 46), and the Runner gets his picked deck.
- Given a deck that isn't **Ready to play**, when you look at the choices, then it's shown dimmed with its red note, and it can't be picked.
- Given a game with your own decks, when you leave and tap **Continue game** later, then it continues with the same decks, even if you've since edited or deleted them (the game keeps its own copy). (automated check, and you can try it)
- Given **Play online**, when you start or join a game, then it uses the standard decks as today, and says **"Online games use the standard decks for now."**
*Size:* M

## Not in this sprint (and why)
- **Online games with your own decks.** It needs the online service to check each player's deck and keep each deck secret from the other phone. It's the natural next step (backlog, P2).
- **Choosing an identity.** Each side has only one identity today (Haas-Bioroid, Kate), so there's nothing to choose yet. Comes with more identities.
- **More cards** (Aggressive Secretary, Ash 2X3ZB9CY, Corporate Troubleshooter and others). The builder works with whatever the game has, so new cards appear in it automatically later.
- **Decks shared between the phone app and the browser.** Needs a sign-in or a share code (question 4).
- **Search and filters** (by faction, cost). With 20–24 cards per side, grouping by type is enough for now.
- **Importing / exporting deck lists as text.** Later, if you want it.
- **Your decks against the computer.** The start screen doesn't offer a computer opponent yet.

## Questions for you
1. **When you start a new deck, what's in it?** — **Recommended:** A. Options:
   A) **Your choice each time:** "Start from the standard deck" (quick to tweak) or "Start empty" (build from scratch). One extra tap.
   B) **Always a copy of the standard deck.**
   C) **Always empty.**
2. **Smallest deck allowed?** — **Recommended:** A. Options:
   A) **45 cards, the real rule** (what you play today).
   B) **Also allow 30-card "quick" decks** (a house rule, for shorter games; the Corp then needs 14–15 agenda points).
3. **Unfinished decks?** — **Recommended:** A. Options:
   A) **Keep them, but only "Ready to play" decks can be picked** for a game. You can build a deck over several sittings.
   B) **Only legal decks are kept**; leaving an unfinished deck asks you to finish or throw it away.
4. **Where are decks kept?** — **Recommended:** A. Options:
   A) **On the device you built them on** (the phone app and the browser each keep their own). Nothing new to set up.
   B) **The same decks everywhere.** Needs a sign-in or a share code first, so it would push the builder back about a sprint.

## Risks
- **Your phone's screen is short (891×296).** A scrolling card list with buttons and a rules bar is tight there. We'll design for that size first and check every screen at 891×296, 640×360, 844×390 and a computer.
- **Saved games must remember custom decks.** Today a saved game only names "the standard decks". The game will store the actual card list it was dealt, so Continue works even if you change the deck later. If that changes the save format, games saved before this update may not continue (you'd see the same short note as in Sprint 12).
- **The editor and the game must agree on the rules.** Both will use the same rule check the game already uses for its standard decks, so they can't drift apart.
- **Sprint size.** Five stories, one large. If we run short, the "In deck" switch (S-13-2) and renaming (S-13-4) are the first to slip to the next sprint; you'd still be able to build, keep and play decks.
