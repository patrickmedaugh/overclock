# Sprint 03 proposal — The Runner breaks in

**Reply "approved" to start, or comment on any story to change it.**

## Goal
By the end of this sprint you can play a real game from start to finish. The Runner attacks the Corp's servers, gets past (or gets stopped by) the ICE, and steals agendas. The Corp flips its ICE face up to defend, and advances and scores its own agendas. The first side to 7 points wins.

*Quick refresher:* a **run** is the Runner attacking one server. The Runner meets the server's **ICE** (the Corp's defenses) one at a time, from the outside in. The Corp can **rez** a piece of ICE when the Runner reaches it: pay its cost to flip it face up so it works. Face-down ICE the Corp doesn't rez is simply passed. Each piece of ICE has **subroutines** (its "if you don't stop me, this happens" lines, like "End the run"). The Runner uses **icebreakers** (Corroder, Gordian Blade, Ninja) to break them by paying credits. If the Runner gets through, it **accesses** the server: it looks at the cards inside, steals any agenda (worth points), and may pay to **trash** (destroy) other cards. **Jack out** means the Runner gives up the run. New words go into `docs/GLOSSARY.md` during the build.

*How you'll play it:* the same tap-to-play as now. The Runner taps **Run**, then taps a server. Choices during the run (rez, break, continue, steal) are big buttons in the right-hand panel.

## Stories

### S-03-1: Runner: run on a server and steal agendas
*Why it matters:* this is the heart of the game. Until now the Runner could only get ready; now it can attack.
*Acceptance criteria:*
- Given it's the Runner's turn with clicks left, when you tap **Run**, then every Corp server lights up (HQ, R&D, Archives and each Server 1, 2…). Tapping one starts the run and uses 1 click. Tapping Run again cancels with nothing spent.
- Given a server with no ICE, when you run on it, then you get straight in and see what you access: **HQ** = 1 random card from the Corp's hand, **R&D** = the top card of the Corp's deck, **Archives** = every card there (face-down ones turn face up), a **remote server** = every card in it.
- Given you access an agenda, when you tap **Steal**, then it moves to your score area face up, and both players see the Runner's points go up (e.g. "Runner 2 points").
- Given you access an asset or upgrade (e.g. PAD Campaign, trash cost 4), when you have enough credits, then a **Trash · 4 credits** button lets you destroy it into Archives face up, or **Leave it** puts it back where it was.
- Given you access a card that can't be stolen or trashed (e.g. an operation or ICE in R&D or HQ), when you look at it, then a **Done** button puts it back where it was, and the Corp's hand and deck are otherwise untouched.
- Given you've passed a piece of ICE and more are ahead or you're about to get in, when you tap **Jack out**, then the run ends with nothing accessed. (You can't jack out before meeting the first ICE: you choose the server before you start.)
- Given a run ends, when you look at the board, then you are back on your turn with the clicks you had left, and the Corp's hidden cards are hidden again. (automated check also confirms the Runner's side of the game only receives the names of cards it actually accessed)
*Size:* M

### S-03-2: Corp: advance and score agendas; 7 points wins
*Why it matters:* the Corp needs its own way to win, and the race to 7 points is what makes every run a gamble.
*Acceptance criteria:*
- Given it's the Corp's turn with clicks left and at least 1 credit, when you tap an agenda you installed in a remote server, then an **Advance · 1 credit** button shows. Tapping it uses 1 click and 1 credit and puts an advancement counter on the card.
- Given advancement counters on a face-down card, when the Runner looks at it, then they see the number of counters (as in the real game), but still only the card back.
- Given an agenda has as many counters as it needs (Hostile Takeover 2, Private Security Force 4, Priority Requisition 5), when it's the Corp's turn, then a **Score** button shows on it. Tapping it (no click needed) moves it face up to the Corp's score area and adds its points.
- Given either side reaches 7 points, when the agenda is stolen or scored, then the game ends at once with a "Corp wins" or "Runner wins" screen and the reason ("7 agenda points").
- Given the starter decks, when a whole game is played, then 7 points can actually be reached by both sides (see question 2: today's Corp deck holds only 6 points of agendas). (automated check)
*Size:* M

### S-03-3: ICE fights back: rez and subroutines
*Why it matters:* without this, servers are open doors. This is where the Corp defends and where runs get tense.
*Acceptance criteria:*
- Given a server with face-down ICE, when the Runner reaches the outermost piece, then the Corp is asked **Rez [card name] · [cost] credits?** with **Rez** and **Don't rez** (see question 1 for how this works on one phone). If the Corp can't afford it, the question is skipped automatically.
- Given the Corp doesn't rez, when the Runner continues, then that ICE stays face down and the Runner moves on to the next piece (or into the server).
- Given the Corp rezzes, when the card flips, then it shows face up for both players (and stays face up for the rest of the game), and the Corp pays its cost.
- Given rezzed ICE that the Runner doesn't break, when the Runner taps **Let it through**, then each subroutine happens in order: **End the run** (Wall of Static, Ice Wall, Enigma) stops the run with nothing accessed; **The Runner loses 1 click** (Enigma) takes a click if there is one; **Do 3 net damage** (Neural Katana) discards 3 random cards from the Runner's hand to the Heap.
- Given the Runner takes more net damage than cards in hand, when the damage happens, then the Corp wins at once ("Runner flatlined").
- Given the ICE in front of a server, when a run passes it, then the run steps through each piece outside-in, and each step is shown clearly enough to follow (which ICE is being met is highlighted).
*Size:* L

### S-03-4: Runner: break ICE with icebreakers
*Why it matters:* this is how the Runner gets through: the right tool for each kind of ICE, paid for with credits.
*Acceptance criteria:*
- Given rezzed ICE and an installed icebreaker of the matching kind (Corroder for barriers, Gordian Blade for code gates, Ninja for sentries), when you meet it, then that breaker's buttons light up with prices, e.g. **+1 strength · 1 credit** and **Break "End the run" · 1 credit**.
- Given your breaker is weaker than the ICE (e.g. Corroder strength 2 against Wall of Static strength 3), when you look at the break button, then it's dimmed until you've raised the strength to match. (Corroder on Wall of Static: 1 credit to raise, 1 to break = 2 credits.)
- Given you break a subroutine, when you tap it, then it's crossed out and won't happen. When every subroutine is broken, you pass the ICE.
- Given a breaker of the wrong kind or no breaker at all, when you meet the ICE, then no break buttons show, only **Let it through**.
- Given you can't afford to break, when you tap a break button, then only "Not enough credits" shows and nothing changes.
- Given Gordian Blade's raised strength ("for the remainder of this run"), when you meet a second code gate in the same run, then the strength is still raised; Corroder's and Ninja's raised strength drops back after each piece of ICE. (automated check)
*Size:* M

### S-03-5: The "Needs runs" cards come alive
*Why it matters:* three cards in the starter decks have said "Needs runs (coming soon)" since last sprint. Now they work.
*Acceptance criteria:*
- Given it's the Runner's turn, when you play **The Maker's Eye** (2 credits), then a run on R&D starts, and if you get in, you access the top 3 cards of R&D one after another (instead of 1).
- Given it's the Runner's turn, when you play **Inside Job** (2 credits) and pick a server, then the first rezzed piece of ICE you meet is skipped: its subroutines don't happen and you don't need to break it. (Face-down ICE the Corp chooses not to rez doesn't count as "met", as in the real game.)
- Given the Runner made a run last turn, when the Corp plays **Neural EMP** (2 credits), then the Runner takes 1 net damage. If the Runner didn't run last turn, Neural EMP shows "Only after the Runner made a run" and nothing is spent.
- Given any card in either starter deck, when you tap it, then "Needs runs (coming soon)" no longer appears anywhere. (automated check)
*Size:* S

### S-03-6: Make the End turn double-tap test sturdy (team housekeeping)
*Why it matters:* last sprint one of the team's automatic checks went red on a busy test machine although the game was fine. A check that cries wolf makes real problems easier to miss. Nothing changes in the game.
*Acceptance criteria:*
- Given the full set of automatic screen tests on the build machine, when they run 10 times on the same version, then the End turn double-tap tests pass every time, without loosening what they check. (automated check)
- Given the test machine is deliberately slowed down 6 times, when the double-tap tests run 10 times, then each one actually tests a tap (none silently skip their check). (automated check)
- Given someone breaks the double-tap protection on purpose, when the tests run, then they fail. (automated check)
*Size:* S

## Not in this sprint (and why)
- **Agendas' bonus effects when scored.** Hostile Takeover's "gain 7 credits and take 1 bad publicity" and Priority Requisition's free rez wait for the bigger card-effects system. Both still score their points this sprint. On the backlog.
- **Abilities on installed cards** (PAD Campaign's money, Akitaro Watanabe's cheaper ICE, Cyberfeeder's free credit, Akamatsu Mem Chip's +1 memory, Bank Job, Armitage Codebusting, Sacrificial Construct). Still waiting for the bigger card-effects system; only the icebreakers' abilities are built now, because runs need them.
- **Tags and meat damage** (Private Security Force's text). A new rule; comes with the bigger card pool.
- **Advancing Ice Wall** (its "+1 strength per advancement"). Only agendas can be advanced this sprint.
- **Rezzing assets and upgrades outside a run.** No use yet, because their abilities aren't built.
- **The full real card pool** (real identities, full Core Set decks). Next in line, likely Sprint 4: real decks need runs to make sense, and runs come first.
- **A fancy run animation, drag to play, playing against the computer.** Still on the backlog, in that order. This sprint shows each run step clearly but plainly.
- **Faster draw-3 cards on very slow phones.** A small speed fix the team found; on the backlog.

## Questions for you
1. **On one shared phone, how should the Corp's "rez this ICE?" choice appear in the middle of the Runner's turn?** — **Recommended:** A. Options:
   A) Show **Rez / Don't rez** right on the board, with the card's name, and carry on. You play both sides, so there's nothing to hide, and it stays fast.
   B) First show a "Hand the phone to the Corp" cover screen, then the choice. Keeps the Runner from seeing the ICE's name before it's rezzed, but adds a tap or two to every run.
   C) The Corp always rezzes automatically when it can afford to. Fastest, but the Corp loses a real decision (bluffing with unrezzed ICE).
   (Online play later will show each player only their own choice, whichever you pick.)
2. **Today's Corp deck holds only 6 points of agendas, so the Runner can never reach 7.** What should we do until the full real decks arrive? — **Recommended:** A. Options:
   A) Add one more Hostile Takeover (1 point) and one more Private Security Force (2 points) to the Corp's deck: 9 points in a 17-card deck, so 7 is reachable but not easy.
   B) Leave the deck as it is; points count up, but a points win only becomes possible with the full real decks next sprint. (The Corp can still win by flatline, the Runner by the Corp running out of cards.)
   C) Play to 4 points until the full decks arrive.

*No answer needed:* last sprint we asked whether any real card's text looked wrong. You didn't mention any, so we've taken that as "they look fine". If you ever spot one, just tell us the card's name.

## Risks
- **This is the biggest rules change so far.** A run has many steps (meet ICE, rez, break, let through, access, steal or trash). We'll write each step down in `docs/RULES_SPEC.md` before building, and test every step without the screen first. If we run short, S-03-5 (the three "Needs runs" cards) moves to next sprint first; they'd keep saying "Needs runs (coming soon)".
- **Runs could feel slow on a phone.** Many small choices can mean many taps. Choices nobody can make are skipped automatically (e.g. no rez question when the Corp can't afford it; no break buttons without a matching breaker), and no step makes you wait more than 0.6 seconds. Tell us at the demo if a run still feels like too many taps.
- **Hidden cards must stay hidden.** A run shows the Runner some Corp cards (the ones it accesses), but not others. Automatic checks make sure the Runner's side of the game only ever receives the names of cards it actually accessed or that were rezzed, which matters for online play later.
- **The real rules have small print.** Where the real game's rules have edge cases we don't need yet, we pick the simplest version, write it down in the decision log, and tell you in the demo notes.
- **Real cards' text was typed from memory.** The icebreakers' and ICE's numbers (strength, costs) now matter in play. Two team members check them against what they know of the real cards before building; if a number feels off when you play, tell us.
