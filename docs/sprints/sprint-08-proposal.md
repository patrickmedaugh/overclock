# Sprint 08 proposal — Real identities, bigger real decks

**Reply "approved" to start, or comment on any story to change it.**

## Goal
Each side now plays as a real Core Set character, called an **identity**: the Corp is **Haas-Bioroid: Engineering the Future** and the Runner is **Kate "Mac" McCaffrey: Digital Tinker**. Each has its own small bonus. Both decks grow from 15–17 cards to **30 real Core Set cards**. There are 10 new cards, among them Haas-Bioroid's own ICE that does **brain damage**, plus Sure Gamble, Magnum Opus and two new icebreakers for Kate. We'll also fix the two small screen problems QA found in Sprint 7. Everything works in pass-the-phone games and online games, because the online service runs the same rules.

*Identity* = the card each player is "playing as". It sits on the table all game, has a one-line bonus and sets the deck rules: the smallest deck allowed, and how many cards from other factions (the game's colour-coded teams) the deck may include.

## Why these two identities (question 1)
- **Both bonuses are simple "first time each turn" rules.** Haas-Bioroid: *"The first time you install a card each turn, gain 1 credit."* Kate: *"Lower the install cost of the first program or piece of hardware you install each turn by 1."* Each is a small job. Neither needs a new kind of game step.
- **Kate fits the Runner cards you already have.** Five of today's 12 Runner cards are hers (Shaper faction): Diesel, Gordian Blade, The Maker's Eye, Akamatsu Mem Chip and Sacrificial Construct.
- **Haas-Bioroid's Core Set cards need the fewest new rules.** The other Corps rely on things not built yet. NBN and many Weyland cards need *traces* (a bidding contest), and Jinteki's cards are mostly traps that go off when the Runner looks at them. Haas-Bioroid's money cards and ICE mostly use what Sprints 3–7 built.

## Where every card stands after this sprint
"Works" = does everything its text says. **Copies** = how many are in the new 30-card deck (0 = still a real card in the game, just not in this deck; see question 3).

**Corp: Haas-Bioroid: Engineering the Future (30 cards, 15 agenda points)**

| Card | New? | Copies | After Sprint 8 | Notes |
|---|---|---|---|---|
| Haas-Bioroid: Engineering the Future | New identity | — | Works | +1 credit the first time the Corp installs a card each turn (S-08-1) |
| Hedge Fund | | 3 | Works | |
| Anonymous Tip | | 1 | Works | |
| Neural EMP | | 1 | Works | |
| **Biotic Labor** | New | 1 | Works | "Gain 2 clicks." New small rule: gaining clicks (S-08-2) |
| PAD Campaign | | 3 | Works | |
| **Adonis Campaign** | New | 2 | Works | Gets 12 credits when flipped face up; the Corp takes 3 each turn. New: "when rezzed" (S-08-2) |
| **Melange Mining Corp** | New | 2 | Works | "Click, click, click: Gain 7 credits." New: Corp click abilities (S-08-2) |
| Akitaro Watanabe | | 1 | Works | |
| Ice Wall | | 2 | Works | |
| Wall of Static | | 2 | Works | |
| Enigma | | 2 | Works | |
| Neural Katana | | 1 | Works | |
| **Viktor 1.0** | New | 2 | Works | Code gate: "Do 1 brain damage. End the run." New: brain damage (S-08-3) |
| **Heimdall 1.0** | New | 1 | Works | Barrier, strength 6: "Do 1 brain damage. End the run. End the run." (S-08-3) |
| Priority Requisition | | 3 | Works | |
| Private Security Force | | 3 | **Partly** (unchanged) | Scores 2 points. Its ability needs *tags* (being marked as traceable), and tags come with traces, a later sprint |
| Hostile Takeover | | **0** | Works | Leaves the deck: it is a Weyland agenda, and the real rules allow only your own faction's agendas (question 3) |

**Runner: Kate "Mac" McCaffrey: Digital Tinker (30 cards)**

| Card | New? | Copies | After Sprint 8 | Notes |
|---|---|---|---|---|
| Kate "Mac" McCaffrey: Digital Tinker | New identity | — | Works | First program or hardware each turn costs 1 less (S-08-1). Her printed "1 link" shows but does nothing until traces arrive |
| **Sure Gamble** | New | 3 | Works | "Gain 9 credits." (costs 5). Nothing new needed |
| Easy Mark | | 2 | Works | |
| Diesel | | 3 | Works | |
| Armitage Codebusting | | 2 | Works | |
| Bank Job | | 1 | Works | |
| **Magnum Opus** | New | 2 | Works | Program, 2 memory: "Click: Gain 2 credits." Uses the Sprint 7 click button |
| The Maker's Eye | | 3 | Works | |
| Inside Job | | 2 | Works | |
| Corroder | | 1 | Works | |
| Gordian Blade | | 2 | Works | |
| **Pipeline** | New | 2 | Works | Sentry breaker: "1 credit: Break sentry subroutine. 2 credits: +1 strength for the remainder of this run." Nothing new needed |
| **Battering Ram** | New | 2 | Works | Barrier breaker, 2 memory: "2 credits: Break up to 2 barrier subroutines. 1 credit: +1 strength for the remainder of this encounter." New: breaking 2 at once (S-08-4) |
| Akamatsu Mem Chip | | 2 | Works | More useful now: one of each of Kate's programs needs 7 memory, and she has 4 |
| Cyberfeeder | | 2 | Works | |
| Sacrificial Construct | | 1 | **Not yet** (unchanged) | Still nothing in the Corp deck trashes Runner cards. Rototurret would (question 4) |
| Ninja | | **0** | Works | Leaves the deck: Pipeline is Kate's own sentry breaker, and Ninja costs her "influence" (her allowance of other-faction cards; question 3) |

**Totals:** 35 cards in the game: the 24 you know, 9 new cards (5 Corp, 4 Runner) and 2 identities. In the two decks, everything works except **Private Security Force** (partly) and **Sacrificial Construct** (not yet). Those are the same two as after Sprint 7.

*About the lists:* they are the team's first draft. The engine developer checks each card's numbers and influence against the official list, and if a card doesn't fit Kate's or Haas-Bioroid's allowance, we swap it for one of their own cards and say so in the demo.

## Stories

### S-08-1: Play as real identities: Haas-Bioroid and Kate
*Why it matters:* this is the first step to playing the real game. Each side gets its own character and bonus.
*Acceptance criteria:*
- Given a new game (pass-the-phone or online), when the board appears, then the Corp's identity **Haas-Bioroid: Engineering the Future** and the Runner's identity **Kate "Mac" McCaffrey: Digital Tinker** each sit on the table, and holding either one zooms it so its full text is readable.
- Given it is the Corp's turn and it has installed nothing yet this turn, when it installs a card (anything: ICE, agenda, asset or upgrade), then it gains 1 credit, with a short note "Engineering the Future: +1 credit". When it installs a second card that turn, it gains nothing.
- Given it is the Runner's turn and he has installed no program or hardware yet this turn, when he picks Corroder (cost 2), then the lit place shows a price of **1**, and installing it takes 1 credit.
- Given the Runner has already installed a program or hardware this turn, when he installs another, then it costs full price. Installing a resource (e.g. Armitage Codebusting) first does not use up Kate's discount.
- Given Kate's discount, when the Runner installs Akamatsu Mem Chip (cost 1) first, then it costs 0 (never below 0). (automated check)
- Given an online game, when the Corp installs its first card and the Runner his first program, then both devices show the same credits as a pass-the-phone game. (automated check)
*Size:* M

### S-08-2: New Haas-Bioroid money cards: Adonis Campaign, Melange Mining Corp, Biotic Labor
*Why it matters:* Haas-Bioroid's real way of making money, and it builds the Corp's version of the "tap a card to use it" button.
*Acceptance criteria:*
- Given a face-down Adonis Campaign, when the Corp rezzes it (flips it face up, **Rez · 4 credits**), then it shows **12** credits on the card, visible to both players.
- Given a face-up Adonis Campaign with credits, when the Corp's turn begins, then 3 credits move from the card to the Corp, with a note "Adonis Campaign: +3 credits". When the last credits are taken, the card goes to Archives (the Corp's discard pile).
- Given a face-up Melange Mining Corp and the Corp has 3 clicks, when the Corp taps the card, then a **Gain 7 credits · 3 clicks** button appears. Tapping it uses all 3 clicks and gives 7 credits. With fewer than 3 clicks left, the button is dimmed and says why.
- Given the Corp plays Biotic Labor (cost 4), when it resolves, then the Corp's click counter goes up by 2 and it can use them this turn.
- Given a face-down Adonis Campaign or Melange Mining Corp, when it is installed or the Corp's turn begins, then nothing happens: no credits appear on it, no button is offered, and the Runner's device learns nothing about the card. (automated check: no hidden card's effect leaks)
- Given an online game, when the Corp uses each of these cards, then both devices show the same result as pass-the-phone. (automated check)
*Size:* M

### S-08-3: Haas-Bioroid's ICE: Viktor 1.0 and Heimdall 1.0, and brain damage
*Why it matters:* these are Haas-Bioroid's signature ICE. *Brain damage* is a new kind of hurt: the Runner throws away a random card from his hand **and** his hand limit drops by 1 for the rest of the game.
*Acceptance criteria:*
- Given a face-up Viktor 1.0 and the Runner has no code gate breaker, when he lets its subroutines fire, then he discards 1 random card from his Grip (hand) to the Heap, his maximum hand size goes from 5 to 4, and the run ends. A message names Viktor 1.0 and says what happened, as other ICE does.
- Given the Runner has taken brain damage, when you look at his counters, then his hand limit is shown (e.g. "Hand max 4"), and at the end of his turn he discards down to 4, not 5.
- Given a face-up Heimdall 1.0 (strength 6) and the Runner has Corroder (strength 2), when he encounters it, then breaking all three subroutines needs +4 strength first, and the price shown adds that up.
- Given the Runner has no cards in his Grip, when he takes brain damage, then he is flatlined and the Corp wins (same as net damage). (automated check)
- Given the Runner's hand limit has dropped below 0 at the end of his turn, then he is flatlined (real rule). (automated check)
- Given an online game, when Viktor 1.0 does brain damage, then both devices show the lower hand limit and the same lost card face up in the Heap. (automated check)
*Size:* M

### S-08-4: New Runner cards for Kate: Sure Gamble, Magnum Opus, Pipeline, Battering Ram
*Why it matters:* Kate's real economy and breakers. Battering Ram is the first breaker that breaks two subroutines at once.
*Acceptance criteria:*
- Given the Runner has 5 credits, when he plays Sure Gamble, then he has 9 credits (pays 5, gains 9).
- Given Magnum Opus is installed and it is the Runner's turn, when he taps it, then a **Gain 2 credits · 1 click** button appears and works like Armitage Codebusting's. It never runs out.
- Given a face-up Neural Katana (strength 3) and Pipeline (strength 1) installed, when the Runner pays 2 credits twice for +2 strength, then he can break its subroutine for 1 more credit. The extra strength stays for the rest of the run.
- Given a face-up Heimdall 1.0 and Battering Ram installed with enough strength, when the Runner uses **Break up to 2 · 2 credits**, then he picks two of the three subroutines and both are broken for one payment.
- Given Battering Ram (2 memory), Gordian Blade (1), Pipeline (1) and Magnum Opus (2) together, when the Runner tries to install the last of them with no Akamatsu Mem Chip, then it's refused with "Not enough memory" (Kate has 4 memory, these need 6).
- Given an online game, when the Runner uses Battering Ram's two-at-once break, then both devices show the same result as pass-the-phone. (automated check)
*Size:* M

### S-08-5: The two 30-card decks
*Why it matters:* bigger decks with real deck rules make games feel like the real thing instead of a short sample.
*Acceptance criteria:*
- Given a new game, when the cards are dealt, then the Corp's R&D (draw pile) holds 25 cards before its first draw and the Runner's Stack holds 25 (30 each, minus the 5-card opening hand).
- Given the deck lists, when they are checked, then each has 30 cards, at most 3 copies of any card, only Haas-Bioroid or neutral agendas in the Corp deck, and other-faction cards within each identity's limit of 15 influence points. (automated check)
- Given the Corp deck, when its agendas are counted, then there are 15 points (3 Priority Requisition, 3 Private Security Force), so the Corp can reach 7 in every deal. (automated check)
- Given every card in both decks, when its text is checked against the card data, then each one works as the table above says, and no invented card is left. (automated check)
*Size:* S

### S-08-6: Two small screen fixes (QA-S7-1, QA-S7-2)
*Why it matters:* QA found these in Sprint 7, and you chose to fix them this sprint.
*Acceptance criteria:*
- Given a small phone screen (640×360), when Armitage Codebusting, Bank Job, Magnum Opus or Adonis Campaign is on the table with credits on it, then its full name, its type (e.g. RESOURCE) and its credits number are all readable, with nothing covering anything else.
- Given a larger phone (844×390), when the same cards are on the table, then the same is true. (automated check)
- Given an advanced Ice Wall and an Armitage Codebusting holding credits are both on the table, when you look at them, then you can tell at a glance which number is advancement counters and which is credits (different colour and a small icon).
*Size:* S

### S-08-7: Rototurret, and Sacrificial Construct works (added — owner chose 4B on PR #19)
*Why it matters:* the Corp can finally destroy Runner cards, and Sacrificial Construct gets its job.
*Acceptance criteria:*
- Given the Corp has Rototurret (Haas-Bioroid ICE, real Core Set card) in its deck, when the Runner lets its "Trash 1 program" subroutine fire, then the Runner loses a program of the Corp's choice (or none if he has none) and it goes to his Heap.
- Given Rototurret's "End the run" subroutine fires, when it resolves, then the run ends.
- Given the Runner has Sacrificial Construct installed, when one of his programs or hardware would be trashed, then he gets a short "Save it? Trash Sacrificial Construct instead" choice; choosing it trashes Sacrificial Construct and keeps the other card.
- Given the Runner declines (or has no Sacrificial Construct), when the trash resolves, then the card goes to the Heap as normal.
- Given pass-and-play and online games, when this happens, then both work the same. (automated check)
*Size:* M

## Not in this sprint (and why)
- **Traces and tags.** A trace is a bidding contest between Corp and Runner. Tags are what the Runner gets when he loses one. This is the biggest rule left in the Core Set. Private Security Force, Hunter, Ash 2X3ZB9CY, Ichi 1.0 and all of NBN need it, and it gets its own sprint.
- ~~Rototurret and Sacrificial Construct~~ — added as S-08-7 (owner 4B).
- **The rest of Haas-Bioroid's Core Set cards:** Accelerated Beta Test, Aggressive Secretary, Archived Memories, Corporate Troubleshooter, Experiential Data, Ash 2X3ZB9CY, Ichi 1.0. Each needs a new rule (looking at R&D, effects when accessed, picking from Archives, changing ICE strength, traces).
- **The rest of Kate's Shaper cards:** Modded, Net Shield, Rabbit Hole, The Personal Touch, The Toolbox, Tinkering, and the neutral Crypsis, Infiltration and Access to Globalsec. Same reason: hosting cards on cards, preventing damage, link, virus counters.
- **Full 45-card decks.** 45 is the real minimum for both identities. A legal Haas-Bioroid deck that size needs 20 agenda points, and that needs Accelerated Beta Test. So 30 cards this sprint (question 2).
- **Other identities and choosing one at the start** (Jinteki, NBN, Weyland, Noise, Gabriel Santiago). These come once their factions' rules exist.
- **Mulligan** (the real rule letting each player redraw their opening hand once), **a deck editor**, **a computer opponent**, **fewer taps during runs**, **saving a game when Android closes the app**. These stay in the backlog.
- **Keeping an online game on the rules it started under.** Still a backlog item. Until then, an online game running when this update goes live ends cleanly with "That game has ended" (see Risks).

## Questions for you
If you approve without answering, the recommended options apply. You can answer in one line, e.g. "1a 2a 3a 4a approved".

1. **Which identities first?** — **Recommended:** A. Options: A) Haas-Bioroid: Engineering the Future vs Kate "Mac" McCaffrey (simplest bonuses, fewest new rules, and Kate fits today's Runner cards). B) Jinteki: Personal Evolution ("whenever an agenda is scored or stolen, do 1 net damage") vs Gabriel Santiago ("first successful run on HQ each turn, gain 2 credits"). More trap cards and tricks, but they need more new rules, so we'd get fewer new cards this sprint. C) Haas-Bioroid vs Gabriel Santiago (Gabriel fits Easy Mark, Ninja, Bank Job and Inside Job).
2. **How big are the decks this sprint?** — **Recommended:** A. Options: A) 30 cards each. Real cards with real deck rules, a bit longer than today's games. Full 45-card decks come once enough Haas-Bioroid cards work. B) the real 45-card minimum now, using 3 copies of most cards (much longer games, and the Corp keeps Hostile Takeover to reach 20 points, bending rule 3 below). C) keep today's 15/17-card decks and add only the identities and new cards.
3. **Follow the real deck-building rules?** — **Recommended:** A. Options: A) yes: own-faction or neutral agendas only, at most 3 copies, at most 15 influence of other-faction cards. **Hostile Takeover and Ninja leave the decks for now** (they still exist and come back with a Weyland deck and a Criminal deck). B) follow them, but keep Hostile Takeover and Ninja as house exceptions.
4. **Add Rototurret so Sacrificial Construct finally works?** — **Recommended:** A. Options: A) not this sprint. Do it next to keep this one small. B) add it now as a seventh story (medium). The demo comes later, and Rototurret can destroy Kate's programs.

## Risks
- **Card text is typed from memory** (as in Sprint 2). The 9 new cards, 2 identities and the influence numbers are checked against the official list during the build. If anything looks wrong to you, tell us and it becomes a quick fix.
- **Brain damage is harsh.** Two hits from Viktor 1.0 leave the Runner with a hand limit of 3 for the rest of the game. That's the real rule. We'll show the hand limit clearly so it's never a surprise, and you can tell us at the demo if it feels too punishing.
- **More cards on a small screen.** Two identity cards plus bigger piles need room at 640×360. We'll check both phone sizes and show screenshots in the demo.
- **Online games running during the update will end.** Card and rules changes mean the online service can't continue a game started on the old rules. It ends cleanly with "That game has ended", and you start a new one. *(Team note: bump `RULES_VERSION` in `packages/engine/src/state.ts` with this sprint's rules and card changes.)*
- **The red "Workers Builds" check** on GitHub comes from your Cloudflare connection, not our tests. We're ignoring it, as you asked.
- **If the sprint runs long,** S-08-4's Battering Ram (the two-at-once break) moves to Sprint 9 first, and its slot in the deck goes to a second Corroder. We'll say so in the demo notes.
