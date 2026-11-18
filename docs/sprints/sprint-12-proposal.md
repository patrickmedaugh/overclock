# Sprint 12 proposal — Six new cards, full decks

**Reply "approved" to start, or comment on any story to change it.**
If you approve without answering the questions, the recommended options apply. One line is enough, e.g. "1a 2a 3a approved".

## Goal
Play a full-size real game: both decks grow from 30 to **45 cards** (the real minimum for Haas-Bioroid and Kate), with **6 new real Core Set cards** that all work.

## The new cards
All from the 2012 Core Set, with real names and wording. Numbers are checked against the official card list during the build.

| Card | Side | Copies | What it does | New rule? |
|---|---|---|---|---|
| **Accelerated Beta Test** | Corp agenda (2 points) | 3 | When scored: look at the top 3 cards of R&D, install and rez any ICE among them for free, trash the rest | Yes: a "look at 3 cards" screen |
| **Archived Memories** | Corp operation | 2 | Take 1 card from Archives back to HQ | Small: pick a card from Archives |
| **Experiential Data** | Corp upgrade | 2 | ICE protecting its server gets +1 strength | Small |
| **The Toolbox** | Runner hardware | 1 | +2 memory, +2 link, 2 credits each turn for icebreakers | No: works like Cyberfeeder and Access to Globalsec |
| **Modded** | Runner event | 3 | Install a program or hardware for 3 credits less | Small |
| **Infiltration** | Runner event | 3 | Gain 2 credits, *or* expose 1 card (look at one face-down Corp card; it stays face down) | Small: "expose" |

**Extra copies of cards you know** (to reach 45). Corp: +1 each of Melange Mining Corp., PAD Campaign, Adonis Campaign, Enigma, Wall of Static, Hunter, Heimdall 1.0, Ichi 1.0. Runner: +1 each of Armitage Codebusting, Magnum Opus, Gordian Blade, Pipeline, Battering Ram, Akamatsu Mem Chip, Sacrificial Construct, Access to Globalsec.

**Both decks stay legal under the real rules:** 45 cards, at most 3 copies, only Haas-Bioroid or neutral agendas, and other-faction cards within 15 "influence" points (the real limit on borrowing other factions' cards). Corp influence stays 8, Runner 10. The Corp deck has 21 agenda points (a 45-card deck needs 20–21).

*(Team note: verify every new number and the 2012 wording against `netrunner-cards-json` `pack/core.json` before the cards go in, as in Sprints 8–9; log the card-pool choice and any correction in DECISIONS.md. Confirm the ruling for where Accelerated Beta Test's trashed cards go in Archives (face up or face down). Bump `RULES_VERSION`.)*

## Stories
### S-12-1: Accelerated Beta Test
*Why it matters:* the Corp needs this agenda to reach 20 points in a 45-card deck, and it's a fun "free ICE" moment.
*Acceptance criteria:*
- Given the Corp scores Accelerated Beta Test, when it's scored, then the Corp sees the top 3 cards of R&D and can pick which ICE among them to install (choosing the server for each), face up, for free.
- Given the Corp has picked (or chosen **Skip**), when it confirms, then the other cards go to Archives and the Runner sees only what the real rules let him see.
- Given none of the 3 cards is ICE, when it's scored, then the Corp sees them, and they go to Archives after one tap.
- Given R&D has fewer than 3 cards, when it's scored, then it uses what's there and the Corp does not lose for an empty R&D. (automated check)
- Given an online game, when it's scored, then only the Corp's device shows the 3 cards. (automated check)
*Size:* M

### S-12-2: Archived Memories and Experiential Data
*Why it matters:* two more real Haas-Bioroid cards: one brings back a lost card, one makes a server harder to break into.
*Acceptance criteria:*
- Given Archives has cards, when the Corp plays Archived Memories, then it picks any card in Archives (face-down ones too) and that card goes to HQ.
- Given Archives is empty, when the Corp looks at Archived Memories in HQ, then it's dimmed and says why.
- Given a face-up Experiential Data in a server, when the Runner encounters ICE protecting that server, then the ICE shows 1 more strength, and breakers must match it.
- Given Experiential Data is face down or trashed, when ICE there is encountered, then it has its normal strength. (automated check)
*Size:* S

### S-12-3: The Toolbox and Modded
*Why it matters:* Kate's biggest card, and a cheap way to get it out.
*Acceptance criteria:*
- Given Kate installs The Toolbox, when the board updates, then memory goes up by 2 and link by 2, and The Toolbox shows 2 credits.
- Given The Toolbox has credits, when Kate pays to break or pump with an icebreaker, then she can spend them; for anything else she can't. They refill at the start of her turn.
- Given Kate plays Modded, when she picks a program or hardware from her Grip (hand), then it installs 3 credits cheaper (never below 0), with no extra click, and her own 1-credit discount still applies to her first install that turn.
- Given there's no program or hardware in her Grip, when she looks at Modded, then it's dimmed and says why.
*Size:* M

### S-12-4: Infiltration
*Why it matters:* the Runner can peek at a face-down Corp card before deciding where to run.
*Acceptance criteria:*
- Given Kate plays Infiltration, when the choice shows, then she picks **Gain 2 credits** or **Expose 1 card**.
- Given she picks Expose, when she taps a face-down installed Corp card, then both players see that card until she taps it away, and it stays face down (not rezzed).
- Given an online game, when a card is exposed, then both devices see it, and nothing else is revealed. (automated check)
*Size:* S

### S-12-5: Full 45-card decks
*Why it matters:* this is the real game size, with every card working.
*Acceptance criteria:*
- Given a new game, when the decks are dealt, then each side has 45 cards as in the tables above.
- Given the deck lists, when they're checked, then both are legal: 45 cards, at most 3 copies, influence Corp 8 and Runner 10 of 15, Corp 21 agenda points. (automated check)
- Given hundreds of random games, when they're played out, then every card does what its text says and no hidden card ever shows to the wrong player. (automated check)
- Given a saved game or an online game from Sprint 11, when you open it after this update, then you see "That saved game can't continue on this new version of the game" (as you chose in Sprint 11).
*Size:* M

### S-12-6 (first to cut): Melange shows "Click ×3"
*Why it matters:* you asked for a shorter way to show "click, click, click".
*Acceptance criteria:*
- Given Melange Mining Corp. on the table, in your hand or zoomed, when you read it, then its cost shows as a click symbol with "×3", not three words.
- Given the Corp taps a face-up Melange, when the button shows, then it reads "Gain 7 credits · 3 clicks".
*Size:* S

## Not in this sprint (and why)
- **Aggressive Secretary, Ash 2X3ZB9CY, Corporate Troubleshooter** (the last Haas-Bioroid Core Set cards). They need new steps when the Runner accesses a card, or the Corp acting during a run. Next card sprint.
- **Rabbit Hole, Net Shield, The Personal Touch, Tinkering, Crypsis.** Each needs a new rule (searching your deck, stopping damage, a card on top of another card, changing ICE types, virus counters).
- **Gordian Blade's shortened buttons on small phones, long text on the smallest card view, the run panel with many buttons, smooth hand slide.** Small polish; still in the backlog.
- **A computer opponent, a deck editor, more identities.** Still in the backlog.

## Questions for you
1. **How big are the decks?** — **Recommended:** A. Options: A) **45 cards**, the real minimum (games run longer, about half as long again). B) **stay at 30**; the new cards replace some copies of old ones. C) **both:** pick "Quick game (30)" or "Full game (45)" when you start (a bit more work, may push out S-12-6).
2. **Which new cards?** — **Recommended:** A. Options: A) **the six in the table.** B) **smaller:** leave out Infiltration; Kate gets one more Sacrificial Construct, Cyberfeeder and Easy Mark instead (still legal, influence 12). C) **bigger:** also Rabbit Hole (+1 link; finds your other copy in your deck), which needs a "search your deck" rule.
3. **The small polish item?** — **Recommended:** A. Options: A) **Melange "Click ×3"** (S-12-6). B) **Gordian Blade's shortened break buttons** on small phones instead. C) **none**, cards only.

## Risks
- **Games get longer.** 45 cards means more turns. If they feel too long, question 1 C (a Quick/Full choice) is an easy add later.
- **Accelerated Beta Test is needed for 45 cards.** Without it the Corp can't have enough agenda points. If it runs late, we keep the decks at 30 with the other new cards in, and tell you in the demo notes.
- **Saved and running online games from Sprint 11 can't continue** after this update, because the decks change. You start a new game.
- **Card wording is from the 2012 printing.** If a card's text looks wrong to you, tell us and it's a quick fix.
