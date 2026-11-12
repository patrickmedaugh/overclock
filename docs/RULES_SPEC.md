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
- Cards whose effect needs runs (they make a run or react to one) cannot be played yet. Installed cards' abilities do not work yet; their text says what they will do later.
- If several things stop an install or play, the reason given follows this order: not your turn, wrong step, no clicks, wrong card, wrong place, needs runs, not enough credits, not enough memory.

## Corp cards
- Installed face down. Corp may **rez** (pay rez cost) at specific timing windows; ICE is rezzed when the Runner approaches it.
- **Agendas** score when advancement counters ≥ requirement, on the Corp's turn. Scoring gives agenda points.

## Runs
1. Runner picks a server (HQ, R&D, Archives, or a remote).
2. For each ICE from outermost to innermost: **approach** → Corp may rez → if rezzed, **encounter**: Runner may use breakers to break subroutines; unbroken subroutines resolve in order (e.g., end the run, deal damage, lose credits).
3. After passing all ICE, Runner may jack out or continue; then the run is **successful** and the Runner **accesses** cards: HQ = 1 random card from hand, R&D = top card, Archives = all cards, remote = all cards in it.
4. Accessed agendas are stolen (Runner scores their points). Accessed assets/upgrades may be trashed by paying their trash cost.

## Winning
- First to 7 agenda points.
- Corp wins if the Runner takes more damage than cards in hand (flatline).
- Runner wins if the Corp must draw from an empty R&D. Only the mandatory start-of-turn draw counts as "must draw"; the game ends right then.

## Starter card pool (v1, Sprint 2)
12 real cards per side from the original Core Set (2012), with their official names, stats and text (symbols spelled as words), per the owner's real-cards decision (2026-11-12). The pool covers economy, draw, three ICE types (barrier/code gate/sentry), matching icebreakers, 3 agendas, 1 asset, 1 upgrade and damage. Each starter deck is the 12 cards plus 3 extra copies (15 cards). The list and the swap from the invented Sprint 0 cards are in `docs/DECISIONS.md`. Card art stays our own runtime-drawn glyphs.
