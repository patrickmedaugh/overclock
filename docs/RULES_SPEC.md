# Rules spec (our own words) — v0

The engine implements this document. It is a simplified, genre-standard ruleset; extend it as sprints add mechanics. Ambiguities → simplest ruling, logged in `DECISIONS.md`.

## Setup
- Two players: Corp and Runner, each with an identity card and a 30–45 card deck (v0 uses fixed starter decks).
- Each starts with 5 credits and draws 5 cards. Corp goes first.

## Turns
- **Corp turn:** draw 1 card (mandatory), then spend 3 clicks. Basic actions: gain 1 credit; draw 1 card; install a card (agenda/asset/upgrade into a remote server, ICE in front of any server; installed ICE costs 1 credit per ICE already protecting that server); play an operation; advance an installed card (1 click + 1 credit); purge (3 clicks, later sprint).
- **Runner turn:** spend 4 clicks. Basic actions: gain 1 credit; draw 1 card; install a program/hardware/resource (pay cost; programs use memory, starting limit 4); play an event; make a run; remove a tag (later sprint).
- **Turn order:** the Corp takes turn 1, then turns alternate. The Corp's mandatory draw happens at the start of every Corp turn, including turn 1, so the Corp starts its first turn with 6 cards. The Runner never gets a free draw.
- **Ending a turn (house rule, owner 2026-11-12):** the active player ends their turn by choosing to (End turn). They may do this with clicks left over; leftover clicks are lost. *(Differs from the genre's standard rule, where every click must be spent.)* The turn never ends by itself when the last click is spent.
- End of turn: discard down to maximum hand size (5). The player picks which cards. The Runner's discards go face up to their discard pile (the Heap). The Corp's go face down to Archives: the Runner sees them only as card backs.
- **Zones:** Corp: HQ (hand), R&D (deck), Archives (discard pile, face-up and face-down cards mixed). Runner: the Grip (hand), the Stack (deck), the Heap (discard pile, all face up). Engine code keeps the generic names `hand`, `deck`, `discard` for both sides.
- Basic actions with an empty deck: the Runner (or Corp) cannot spend a click to draw from an empty deck. That action is not allowed, and nothing is lost.

## Installing and playing (Sprint 2)
- **Install** (1 click), Corp: the card goes face down.
  - Agenda or asset: into a remote server that holds no agenda or asset, or into a new remote server. Never into HQ, R&D or Archives.
  - Upgrade: into any server (HQ, R&D, Archives or a remote), or a new remote server.
  - ICE: in front of any server, or a new remote server. It goes on the outside (outermost). It costs 1 credit for each ICE already protecting that server.
  - Agendas, assets and upgrades cost no credits to install (their cost is a rez cost, paid later).
  - New remote servers are numbered Server 1, Server 2, ... in the order they are made; numbers are never reused.
- **Install** (1 click), Runner: programs, hardware and resources go face up into the Runner's area (the rig). Pay the card's cost. Programs use memory: installed programs' memory must stay at or under 4. *(Cards that raise memory, such as Akamatsu Mem Chip, do not work yet: the limit stays 4.)*
- **Play** (1 click): an operation (Corp) or event (Runner). Pay its cost, the card goes face up on top of your discard pile (Archives / Heap), then its effect happens. Card draws from an effect stop when the deck is empty; nothing is lost (only the Corp's mandatory draw can lose the game).
- *(Sprint 2: cards whose effect needs runs could not be played yet. From Sprint 3 they work; see Runs.)* Installed cards' abilities do not work yet, except icebreakers' abilities during a run; their text says what they will do later.
- If several things stop an install or play, the reason given follows this order: not your turn, wrong step, no clicks, wrong card, wrong place, needs a system not built yet, its play condition is not met (e.g. Neural EMP without a run last turn), not enough credits, not enough memory.

## Corp cards
- Installed face down. **Rez** = pay the card's rez cost to turn it face up; it stays face up for the rest of the game. *(Sprint 3: only ICE can be rezzed, and only when the Runner approaches it during a run, or (Sprint 4) for free when Priority Requisition is scored. Rez-cost discounts such as Akitaro Watanabe's are not applied yet.)*

## Advancing and scoring (Sprint 3)
- **Advance** (Corp, 1 click + 1 credit): put 1 advancement counter on one of your installed agendas. *(Only agendas can be advanced this sprint; Ice Wall's advancing comes later.)* The Runner sees how many counters a card has, but not the face-down card.
- **Score** (Corp, no click): on your turn, outside a run, when an installed agenda has at least as many counters as its advancement requirement, move it face up to your score area; you gain its agenda points.
- **"When scored" bonuses (Sprint 4).** Some agendas do something when the **Corp scores** them. A **stolen** agenda never does: the bonus is for the Corp scoring only. The bonus happens right after the agenda reaches the score area, in the order its text says. If the agenda's points bring the Corp to 7, the Corp wins at once and the bonus does not happen.
  - **Hostile Takeover:** the Corp gains 7 credits, then takes 1 bad publicity (see below).
  - **Priority Requisition:** the Corp *may* rez one of its installed, face-down ICE (on any server) for free. The game waits for the Corp to pick one, or **Skip**. Nothing else can happen until it decides. If the Corp has no face-down ICE installed, nothing happens and there is no question. Rezzing this way costs nothing and the ICE stays face up for the rest of the game, as usual.

## Bad publicity (Sprint 4)
- **Bad publicity** is a counter the Corp collects (it starts at 0 and never goes down in this card pool). Both players see it.
- When the Runner **starts a run**, it gets 1 extra credit for each bad publicity the Corp has. These credits are **for this run only**:
  - During the run, whenever the Runner pays (breaking or raising strength with an icebreaker, trashing an accessed card), these run-only credits are used first, then the Runner's own credits. *(The real game lets the Runner choose which credits to use; with these cards using the run-only ones first is always best, so the game does it.)*
  - "Can the Runner afford it?" counts both kinds together.
  - Any left over **disappear when the run ends**, however it ends (accessed, jacked out, ended by ICE, flatline, or the game ending).
- Run-only credits are never added to the Runner's own credits, and the Runner never has any outside a run.

## Runs (Sprint 3)
1. **Start:** the Runner spends 1 click (or plays a run event such as The Maker's Eye or Inside Job) and names a server: HQ, R&D, Archives or a remote. While the run lasts, neither player can take other actions.
2. **ICE, outermost first.** For each piece of ICE:
   - **Approach.** If it is face down and the Corp can pay its rez cost, the Corp chooses **Rez** or **Don't rez**. If it is already rezzed, or the Corp cannot pay, there is no question.
   - Face-down ICE (not rezzed) is simply **passed**.
   - **Encounter** (rezzed ICE). The Runner may use icebreakers of the matching kind: barrier breakers on barriers, code gate breakers on code gates, sentry breakers on sentries. A breaker can break a subroutine only if its strength is at least the ICE's strength; strength can be raised by paying the breaker's price. Raised strength lasts until the end of this encounter, unless the card says "for the remainder of this run". When every subroutine is broken, the ICE is passed. Otherwise the Runner chooses **Let it through**: each unbroken subroutine happens in order. "End the run" stops the run at once (nothing is accessed, the remaining subroutines do not happen).
   - **Continue or jack out.** After passing a piece of ICE, the Runner chooses to continue (to the next ICE, or into the server) or **jack out** (the run ends, nothing accessed). The Runner cannot jack out before the first piece of ICE; a server with no ICE is entered directly.
3. **Access** (the run is successful). The Runner looks at: HQ = 1 random card from the Corp's hand; R&D = the top card (The Maker's Eye: top 3, one after another); Archives = every card there, all at once, and face-down cards there turn face up for good; a remote server = every card in it, one after another.
   - An **agenda** must be stolen: it goes face up to the Runner's score area and the Runner gains its points.
   - A card with a **trash cost** (assets, upgrades) may be trashed by paying that cost: it goes face up to Archives. Otherwise the Runner leaves it where it was. Cards in Archives cannot be trashed again.
   - Other cards (operations, ICE) are looked at and stay where they were.
4. **End.** The run ends; the Runner continues its turn with the clicks it had left. Cards the Runner accessed but did not take become hidden again. *(Sprint 5)* The Runner may look back at them (**Last run**) until his turn ends; the Corp is shown nothing new.
- **Inside Job:** the first piece of ICE the Runner *encounters* in the run (so the first rezzed one) is bypassed: passed without breaking, its subroutines do not happen.
- **Neural EMP** can be played only if the Runner started a run during its previous turn.

## Damage (Sprint 3)
- **Net damage:** for each point, the Runner discards a random card from its Grip to the Heap (face up). Random picks come from the game's seeded randomness.
- **Losing clicks:** "The Runner loses 1 click, if able" takes a click only if the Runner has one left.
- *(Meat damage and tags come later.)*

## Winning
- The first player to reach **7 agenda points** wins at once, when the agenda is stolen or scored.
- The Corp wins at once if the Runner takes more net damage than it has cards in its Grip (**flatline**).
- Runner wins if the Corp must draw from an empty R&D. Only the mandatory start-of-turn draw counts as "must draw"; the game ends right then.

## Starter card pool (v1, Sprint 2)
12 real cards per side from the original Core Set (2012), with their official names, stats and text (symbols spelled as words), per the owner's real-cards decision (2026-11-12). The pool covers economy, draw, three ICE types (barrier/code gate/sentry), matching icebreakers, 3 agendas, 1 asset, 1 upgrade and damage. Each starter deck is the 12 cards plus 3 extra copies (15 cards); from Sprint 3 the Corp deck has one more Hostile Takeover and one more Private Security Force (17 cards, 9 agenda points) so a 7-point win is possible. The list and the swap from the invented Sprint 0 cards are in `docs/DECISIONS.md`. Card art stays our own runtime-drawn glyphs.
