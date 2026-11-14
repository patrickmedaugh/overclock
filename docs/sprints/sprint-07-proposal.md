# Sprint 07 proposal — Make the sleeping cards work

**Reply "approved" to start, or comment on any story to change it.**

## Goal
Nearly every card in both decks does what its text says. The Corp can flip **PAD Campaign** and **Akitaro Watanabe** face up and they work. **Ice Wall** gets stronger when advanced. The Runner can take money from **Armitage Codebusting** and **Bank Job**, gets **Cyberfeeder**'s free credit for icebreakers and **Akamatsu Mem Chip**'s extra memory. We'll also fix the blank lane a server leaves behind when it empties. All of this works in pass-the-phone games and online games, because the online service runs the same rules.

**Online play still needs you (not a story):** two-phone games go live once you add the two Cloudflare secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) on GitHub, using the steps in `apps/server/README.md` ("For the owner"). Until then you can try everything below in pass-the-phone mode. The team also tests every new ability in online games automatically.

## Where every card stands today
"Works" = it does everything its text says. The last column says which story fixes it.

| Card | Side | Today | What's missing | Fixed in |
|---|---|---|---|---|
| Hedge Fund | Corp | Works | — | — |
| Anonymous Tip | Corp | Works | — | — |
| Neural EMP | Corp | Works | — | — |
| Wall of Static | Corp | Works | — | — |
| Enigma | Corp | Works | — | — |
| Neural Katana | Corp | Works | — | — |
| Hostile Takeover | Corp | Works | — | — |
| Priority Requisition | Corp | Works | — | — |
| Ice Wall | Corp | Partly | It ends the run, but the Corp can't advance it, so it never gets stronger. | S-07-5 |
| Private Security Force | Corp | Partly | Scores 2 points. Its ability only works when the Runner is *tagged* (marked as traceable), and no card in these decks can tag him. | Question 4 |
| PAD Campaign | Corp | Not yet | It can be installed, and the Runner can trash it. But the Corp can't flip it face up, so it never gives its credit when the Corp's turn begins. | S-07-2 |
| Akitaro Watanabe | Corp | Not yet | Same problem: it can't be flipped face up, so ICE in its server doesn't get its 2-credit rez discount. | S-07-2 |
| Easy Mark | Runner | Works | — | — |
| Diesel | Runner | Works | — | — |
| The Maker's Eye | Runner | Works | — | — |
| Inside Job | Runner | Works | — | — |
| Corroder | Runner | Works | — | — |
| Gordian Blade | Runner | Works | — | — |
| Ninja | Runner | Works | — | — |
| Armitage Codebusting | Runner | Not yet | You pay 1 to install it and it just sits there. It gets no 12 credits, and there's no "Click: take 2 credits". | S-07-3 |
| Akamatsu Mem Chip | Runner | Not yet | Memory stays at 4 instead of 5. You can't notice yet, because the three icebreakers only use 3. | S-07-3 |
| Cyberfeeder | Runner | Not yet | No free credit for paying icebreakers. | S-07-4 |
| Bank Job | Runner | Not yet | It gets no 8 credits, and there's no "take credits instead of accessing" after a run on a remote server. | S-07-4 |
| Sacrificial Construct | Runner | Not yet | Its only job is to stop a program or hardware from being trashed, and no card in these decks can trash one. | Question 4 |

**Today:** 15 of 24 cards work fully, 2 partly, 7 not yet. **After this sprint:** 22 of 24 work fully. The other 2 (Private Security Force, Sacrificial Construct) have nothing to react to until cards that tag the Runner or trash his cards are added.

## Stories

### S-07-1: Fix two small bugs: empty servers vanish, abandoned online games close
*Why it matters:* you reported the blank lane yourself, and it's first in line. The second fix stops a friend waiting forever on a game you gave up.
*Acceptance criteria:*
- Given a remote server holding one card and no ICE, when the Runner steals or trashes that card, then the server disappears from both players' boards.
- Given the Corp scores the only agenda in a remote server with no ICE, when it is scored, then that server disappears too.
- Given a server has just disappeared, when the Corp picks a card to install, then only one "New server" place lights up, with no blank gap where the old server was.
- Given a remote server with ICE in front of it, when its last card is stolen or trashed, then the server stays (the ICE still guards it), and the Corp can install into it again.
- Given a server has disappeared, when you look at the other servers, then they keep their names (Server 2 stays Server 2), and the next new server gets a new number. (automated check)
- Given a player started an online game and tapped Back on the waiting screen, when another phone types that code, then it sees "No game with that code". (automated check; you can try it once online play is live)
*Size:* S

### S-07-2: The Corp flips assets and upgrades face up: PAD Campaign and Akitaro Watanabe work
*Why it matters:* the Corp's money card and its discount card do nothing today. This also answers your earlier PAD Campaign question.
*Acceptance criteria:*
- Given it is the Corp's turn and no run is going on, when the Corp taps its face-down PAD Campaign on the table, then a **Rez · 2 credits** button appears. When tapped, it takes 2 credits and no click, and the card turns face up on both players' boards. (Akitaro Watanabe shows **Rez · 1 credit**.)
- Given the Corp has fewer credits than the rez cost, when it taps the card, then the Rez button is dimmed and says "Not enough credits".
- Given a face-up PAD Campaign, when the Corp's turn begins, then the Corp gains 1 credit and sees a short note: "PAD Campaign: +1 credit". A face-down PAD Campaign gives nothing.
- Given a face-up Akitaro Watanabe in a server, when the Runner reaches face-down ICE in that same server, then the Corp's Rez button costs 2 less (Wall of Static: 1 instead of 3; Ice Wall: 0 instead of 1). ICE on other servers still costs full price.
- Given a pass-the-phone game where the Corp has 1 credit and Akitaro Watanabe is face up, when the Runner reaches face-down Wall of Static in Akitaro's server, then the Corp is asked Rez / Don't rez (the discounted price is what counts).
- Given an online game, when the Corp rezzes PAD Campaign or Akitaro Watanabe and the turn moves on, then both phones show the same result as pass-the-phone. (automated check)
*Size:* M

### S-07-3: Click abilities on the Runner's cards: Armitage Codebusting and Akamatsu Mem Chip
*Why it matters:* "Click: take 2 credits" is the ability you asked about first. This builds the "tap a card on the table to use it" step that more cards will use later.
*Acceptance criteria:*
- Given the Runner installs Armitage Codebusting, when it lands on the table, then it shows **12** credits on the card, visible to both players.
- Given it is the Runner's turn, no run is going on, and Armitage Codebusting has credits on it, when the Runner taps the card, then a **Take 2 credits · 1 click** button appears. Tapping it moves 2 credits from the card to the Runner (12 → 10 on the card) and uses one click.
- Given the Runner has no clicks left, when he taps Armitage Codebusting, then the button is dimmed and says "No clicks left".
- Given Armitage Codebusting has 2 credits left, when the Runner takes them, then the card goes to the Heap (the Runner's discard pile).
- Given the Runner installs Akamatsu Mem Chip, when you look at the memory counter, then it reads "Memory …/5" instead of "…/4".
- Given an online game, when the Runner takes credits from Armitage Codebusting, then the Corp's phone shows the credits on the card go down. (automated check)
*Size:* M

### S-07-4: Cards that help during runs: Cyberfeeder and Bank Job
*Why it matters:* these two only make sense mid-run, so they come together.
*Acceptance criteria:*
- Given Cyberfeeder is installed, when you look at it, then it shows 1 credit on it.
- Given a run where the Runner has no credits of his own and Cyberfeeder's credit is unused, when he encounters a face-up Ice Wall with Corroder installed, then he can break its subroutine, Cyberfeeder pays, and its credit disappears from the card. The breaker button shows "Cyberfeeder pays", or similar, so it's clear where the credit came from.
- Given Cyberfeeder's credit was used, when the Runner's next turn begins, then the credit is back (never more than 1).
- Given Cyberfeeder's credit is unused, when the Runner pays to trash an accessed card or installs a card, then Cyberfeeder's credit is not used. Its text allows only icebreakers, or virus programs, which these decks don't have. (automated check)
- Given the Runner installs Bank Job, when it lands on the table, then it shows **8** credits on the card.
- Given Bank Job has credits and the Runner makes a successful run on a **remote** server, when the run gets in, then he chooses **Take 8 credits from Bank Job** (the amount on the card) or **Access cards**. Taking them gives him the credits and accesses nothing. Bank Job then has no credits left and goes to the Heap.
- Given a successful run on HQ, R&D or Archives, when the run gets in, then Bank Job is not offered, and access happens as usual.
- Given an online game, when the Runner uses Cyberfeeder or Bank Job, then both phones show the same result as pass-the-phone. (automated check)
*Size:* M

### S-07-5: Ice Wall can be advanced and gets stronger
*Why it matters:* Ice Wall's printed text says so, and it gives the Corp a use for spare clicks. First to drop if the sprint runs long.
*Acceptance criteria:*
- Given an installed Ice Wall (face up or face down), when the Corp taps it on its turn, then an **Advance · 1 credit** button appears, like on agendas. Tapping it uses 1 click and 1 credit and adds a counter, which both players see.
- Given a face-up Ice Wall with 2 counters, when the Runner encounters it, then its strength shows 3 (1 printed + 2), and Corroder (strength 2) must pay for +1 strength before it can break it.
- Given any other ICE (Wall of Static, Enigma, Neural Katana), when the Corp taps it, then no Advance button appears. (automated check)
*Size:* S

### S-07-6: Hand: tap to open, long-press to light places, drag to play (added — owner chose 1B on PR #17, 2026-11-14)
*Why it matters:* your own design for playing cards (backlog, 2026-11-13).
*Acceptance criteria:*
- Given the board, when you tap your hand, then the hand opens big and readable.
- Given the open hand, when you long-press a card, then every place it can be played lights up on the board.
- Given a long-pressed card, when you drag it onto a lit place and let go, then it is played there.
- Given a long-pressed card, when you let go away from a lit place, then nothing is played and the hand view is back.
- Given the open hand, when you tap outside it, then it closes.
- Given a drag, when your finger moves, then the card follows it without lag (automated check: under 0.1 seconds per move on a phone-size screen).
- Given pass-the-phone and online games, when you play a card by dragging, then it works the same in both. (automated check)
*Size:* L

## Not in this sprint (and why)
- **Hand: tap to open, long-press to light places, drag to play** (your design). It's a big screen-only job, about the size of a whole story on its own, and with five card stories the sprint would be bigger than Sprint 6. Recommended for Sprint 8 (question 1).
- **Private Security Force's ability and Sacrificial Construct.** Nothing in these decks can tag the Runner or trash his cards, so there's nothing for them to react to yet (question 4).
- **The Corp flipping cards face up during the Runner's turn.** The real game allows it. We recommend the Corp's own turn only for now (question 3).
- **Real identities and full Core Set decks.** These come after the existing cards work. New cards will use what this sprint builds.
- **Online-service follow-ups** (limiting how fast one device can start games, keeping a running game on the same rules after an update, cheaper storage). These are better done once online play is live and you've tried it.
- **Corp thinking-time hint (Sprint 6 QA-S6-2).** Left as it is (the recommended answer in the Sprint 6 demo).
- **Fewer taps during runs, saving a game when Android closes the app, a computer opponent.** These stay in the backlog.

## Questions for you
If you approve without answering, the recommended options apply.

1. **Cards first, drag-to-play hand next sprint?** — **Recommended:** A. Options: A) this sprint makes the cards work; the drag-to-play hand is Sprint 8. B) both in this sprint (a bigger sprint, and the demo comes later). C) drag-to-play hand now, and drop the run cards (S-07-4) and Ice Wall (S-07-5) to Sprint 8.
2. **How do you use a card's ability on the phone?** — **Recommended:** A. Options: A) tap the card on the table, and its buttons appear in the same spot as Rez / Advance today (e.g. "Take 2 credits · 1 click"). B) hold the card to zoom in, and the buttons appear under the big card. C) a small button always sits on the card itself (fastest, but cramped on small phones).
3. **When can the Corp flip PAD Campaign or Akitaro face up?** — **Recommended:** A. Options: A) on its own turn, outside a run (simple, no extra pauses on the Runner's turn). B) also at the end of the Runner's turn, as experienced players do in the real game. This adds one more Corp decision (and one more phone hand-over in pass-the-phone) every Runner turn.
4. **Private Security Force and Sacrificial Construct can't do anything with these decks. What should we do?** — **Recommended:** A. Options: A) leave them as they are until cards that tag the Runner or trash his cards arrive with the bigger card pool. B) swap each for another real Core Set card that works now. The team would suggest swaps for you to OK.

## Risks
- **Money on cards is new to the screen.** Armitage's 12, Bank Job's 8 and Cyberfeeder's 1 need to be readable on a small phone without crowding the board. We'll check them at both phone sizes (844×390 and 640×360) and show screenshots in the demo.
- **Bank Job's "any number of credits".** The card lets you take any amount. Since taking all of them is always the best move with these decks, the button takes all of them. If you'd rather pick an amount, say so and we'll add a picker.
- **Online games must behave the same.** The online service runs the same rules, so new abilities come with it automatically. Every story still has an automated online check. Online play isn't live yet, so no game in progress can be caught by the update.
- **Card text was typed from memory** (logged in Sprint 2). If any card's text or numbers look wrong to you, tell us and it becomes a quick fix.
- **If the sprint runs long,** S-07-5 (Ice Wall) moves to Sprint 8 first. We'll say so in the demo notes.
