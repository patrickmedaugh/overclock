# Sprint 16 proposal — Five more real cards

**Reply "approved" to start, or comment on any story to change it.**
If you approve without answering the questions, the recommended options apply. One line is enough, e.g. "1a 2a 3a approved".

## Goal
Five more real Core Set cards work in your games: three for Kate (Rabbit Hole, The Personal Touch, Tinkering) and two Haas-Bioroid surprises for the Corp (Aggressive Secretary, Ash 2X3ZB9CY). If you want them (questions 2 and 3), the game also gets a few soft sounds with a mute button, and short effects on the table when ICE flips face up or a card's ability goes off.

**What stays the same:** the hand works exactly as in Sprint 14. You tap or drag cards just as before. Nothing about picking up, holding, dragging or moving cards changes. That work is paused until you've finished your research on other card games. The new play link and Android download from Sprint 15 (S-15-5, the one story you kept) are being moved over separately. This sprint's demo uses them: https://overcloc.netlify.app.

**Words used here** (more in `docs/GLOSSARY.md`):
- **Link**: the Runner's number in traces (Kate has 1). A higher link makes the Corp's traces harder to win.
- **Trace**: the bidding contest you know from Hunter and SEA Source.
- **Advance**: the Corp's 1 click + 1 credit to put a counter on a card.
- **Access**: the Runner looking at cards after getting into a server.

## Stories
### S-16-1: Rabbit Hole and The Personal Touch (Kate's hardware)
*Why it matters:* gives Kate more link against traces and a way to make an icebreaker stronger for good.
*Acceptance criteria:*
- Given Kate installs **Rabbit Hole**, when it lands, then her link goes up by 1 (the number beside memory changes).
- Given another Rabbit Hole is in her Stack and she can pay for it, when she installs the first one, then she's asked "Find another Rabbit Hole and install it?" If she says yes, she pays its price and it's installed. Either way her Stack is shuffled.
- Given no other Rabbit Hole is in her Stack (or she can't pay for one), when she installs one, then she isn't asked, and her Stack is still shuffled.
- Given Kate has an icebreaker installed (e.g. Corroder), when she plays **The Personal Touch**, then only her icebreakers light up as places for it. The one she picks shows 1 more strength for as long as the card stays on it.
- Given Kate has no icebreaker installed, when she taps The Personal Touch, then it's dimmed with a short reason ("Needs an icebreaker").
- Given the icebreaker carrying The Personal Touch is trashed (e.g. by Rototurret), when it goes to the Heap, then The Personal Touch goes with it.
- Given the Decks screen, when you build a Runner deck, then both cards are in the list with their real text. (automated check)
*Size:* M

### S-16-2: Tinkering (any icebreaker on any ICE, for one turn)
*Why it matters:* a cheap trick that gets Kate past ICE her breakers normally can't touch.
*Acceptance criteria:*
- Given at least one piece of ICE is on the table, when Kate plays **Tinkering**, then she picks a piece of ICE. It shows "+ barrier, code gate, sentry until end of turn".
- Given that ICE, when she runs into it the same turn, then any of her icebreakers can break it at its normal price (e.g. Corroder breaks Enigma's subroutines).
- Given Kate's turn ends, when the Corp's turn starts, then that ICE has only its own type again.
- Given Kate picks a face-down piece of ICE, when Tinkering resolves, then she still doesn't learn which ICE it is. (automated check)
- Given no ICE on the table, when she taps Tinkering, then it's dimmed with a short reason ("No ICE to pick").
*Size:* S

### S-16-3: Aggressive Secretary (a trap that trashes programs)
*Why it matters:* the Corp's first real trap: a card that hurts the Runner when he looks at it.
*Acceptance criteria:*
- Given Aggressive Secretary is installed in a remote server, when the Corp taps it on his turn, then **Advance** is offered (as with Ice Wall) and the counters show on the card.
- Given the Runner accesses it with 2 counters on it and the Corp has 2 credits, when access happens, then the Corp is asked "Pay 2 credits: trash 2 programs?"
- Given the Corp says yes, when it resolves, then the Corp picks that many of the Runner's programs (all of them if he has fewer) and they go to the Heap. If Sacrificial Construct is out, the Runner gets his "save it?" choice, as with Rototurret.
- Given the Corp has under 2 credits, or the card has no counters, when it's accessed, then nothing is asked and access goes on as normal.
- Given pass-the-phone, when the Corp must answer, then the "Pass the phone" cover screen shows first, as for Rez decisions. Online, the Corp's phone asks.
- Given a game against the computer, when the computer is the Corp, then it answers this question sensibly (pays when it can trash something). (automated check)
*Size:* M

### S-16-4: Ash 2X3ZB9CY (a trace that guards a server)
*Why it matters:* a second Corp trace card, and the first one that protects the cards in a server.
*Acceptance criteria:*
- Given Ash is face up in a server, when the Runner gets into that server, then the Corp may start a **Trace 4** before the Runner sees any cards. The bid panel works as with Hunter.
- Given the Corp wins the trace, when access would begin, then the Runner accesses no other card in that server this run. He sees a plain message saying why ("Ash 2X3ZB9CY: you can't access other cards this run").
- Given the Runner wins the trace, when access begins, then he accesses as normal (and may pay to trash Ash).
- Given the trace, when it resolves, then the Runner's screen learns nothing about the other face-down cards in that server. (automated check)
- Given a game against the computer, when the computer is either side, then it bids sensibly. (automated check)
*Size:* M

### S-16-5: Soft sounds with a mute button (only if question 2 = A)
*Why it matters:* small sounds make actions easier to notice and the game feel more alive, without changing how you play.
*Acceptance criteria:*
- Given sound is on, when you draw a card, play or install a card, rez ICE, score or steal an agenda, or a run ends, then a short, soft sound plays (each under half a second).
- Given the board, when you look at the top bar, then a mute button is always there. Tapping it silences everything at once.
- Given you muted the game, when you close it and open it again (browser or Android app), then it's still muted.
- Given any sound plays, when you tap, then the tap is answered within a tenth of a second. (automated check)
- Given online or pass-the-phone play, when the other player does something hidden (e.g. the Corp draws), then the sound gives nothing away: the same sound plays whatever the card is. (automated check)
- Given the sounds, when you hear them, then they're our own sounds made for this game, not copied from another game.
*Size:* S

### S-16-6: Short effects on the table (only if question 3 = A)
*Why it matters:* you see at a glance what just happened on the table. None of it touches how you handle cards.
*Acceptance criteria:*
- Given the Corp rezzes a piece of ICE (in a run or on his turn), when it turns face up, then it flips over with a short glow (under half a second), on both players' screens.
- Given a card's ability goes off (e.g. PAD Campaign or Adonis Campaign at the start of the Corp's turn, Armitage Codebusting, Cyberfeeder), when it happens, then that card glows briefly and a small "+1 credit" (or similar) floats up from it.
- Given ICE ends the run ("End the run"), when the run stops, then the server gives a short red flash that never covers any button.
- Given any effect is playing, when you tap, then the tap is answered within a tenth of a second, and no effect keeps you from playing. (automated check)
- Given your hand, when you play cards, then tapping and dragging work exactly as in Sprint 14 (no lift, lean or fly changes). (automated check)
*Size:* M

## Not in this sprint (and why)
- **Anything about holding, dragging, lifting or moving cards** (including cards flying to piles). Paused for your research, as you asked. Nothing changes there until you tell us what you want.
- **Corporate Troubleshooter** (Haas-Bioroid). It needs the Corp to act in the middle of the Runner's run, which is a new kind of step. Next card batch.
- **Net Shield** (stops net damage). It needs a new "stop the damage" step, and only Neural EMP in the standard Corp deck does net damage. Next card batch.
- **Crypsis** (an icebreaker for any ICE that uses virus counters, a new system). Later.
- **New identities** (Jinteki, NBN, Weyland, other Runners). Bigger step; still in the backlog.
- **Runs you can see** and **bigger effects** (screen shake, sparks). Later, after the small effects in S-16-6 have proven themselves.

## Questions for you
1. **Should the new cards go into the ready-made decks?** — **Recommended:** A. Options:
   A) **Yes:** we swap them into the standard decks, so you meet them in any game without building a deck. Kate gets 2 Rabbit Hole, 1 The Personal Touch and 1 Tinkering. The Corp gets 2 Aggressive Secretary and 1 Ash. Some cards leave to make room. The decks stay legal (45 cards, real rules), and we list the swaps in the demo notes.
   B) **No:** the standard decks stay as they are. The new cards are only in the Decks screen for your own decks.
2. **Sounds this sprint (S-16-5)?** — **Recommended:** A. Options:
   A) **Yes, a small set of soft sounds** (draw, play, rez, score/steal, run ends) with a mute button that's always on the board.
   B) **Same, but starting muted:** you switch sound on when you want it.
   C) **No sounds yet.**
3. **Effects on the table this sprint (S-16-6)?** — **Recommended:** A. Options:
   A) **Yes, just the three small ones:** ICE flips with a glow when rezzed, a card glows when its ability goes off, a red flash when ICE ends the run. If they don't feel right after one demo round, we switch them off and move on rather than tuning them for weeks.
   B) **Not yet:** wait until your research is done, so all the "feel" work follows one plan.
   C) **More:** also a shake when the Runner takes damage and a glow on the points when an agenda is scored. Bigger sprint; S-16-4 (Ash) may move to the next sprint.

## Risks
- **Online games and saved games in progress end when the new rules go live.** Adding cards changes the rules version. A game started before the update shows "That game has ended", and a saved game from before can't be continued (as you chose in Sprint 11). Finish any game you care about before the demo.
- **Card text and numbers.** We check every new card against the official card data before building, as in Sprints 8, 9 and 12. If anything differs from what's written here, the official card wins and we say so in the demo notes.
- **Effects and sounds could turn into another long tuning round.** Sprint 15 showed how long "feel" work can take. S-16-5 and S-16-6 are kept small, have a mute button and an off switch, and get one demo round. If you don't like them, we turn them off and the cards still ship.
- **The computer opponent must answer the new questions** (Rabbit Hole's search, Aggressive Secretary, Ash's trace). We'll add tests so it never gets stuck. It still won't *choose* to play the new cards cleverly (the "smarter computer" item stays in the backlog).
- **Sprint size.** Six stories if you pick A on questions 2 and 3. If we run short, S-16-6 (effects) slips first, then S-16-4 (Ash).
