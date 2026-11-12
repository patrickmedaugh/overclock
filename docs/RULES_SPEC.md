# Rules spec (our own words) — v0

The engine implements this document. It is a simplified, genre-standard ruleset; extend it as sprints add mechanics. Ambiguities → simplest ruling, logged in `DECISIONS.md`.

## Setup
- Two players: Corp and Runner, each with an identity card and a 30–45 card deck (v0 uses fixed starter decks).
- Each starts with 5 credits and draws 5 cards. Corp goes first.

## Turns
- **Corp turn:** draw 1 card (mandatory), then spend 3 clicks. Basic actions: gain 1 credit; draw 1 card; install a card (see "Installing"); play an operation; advance an installed card (1 click + 1 credit, later sprint); purge (3 clicks, later sprint).
- **Runner turn:** spend 4 clicks. Basic actions: gain 1 credit; draw 1 card; install a program/hardware/resource (see "Installing"); play an event; make a run (later sprint); remove a tag (later sprint).
- **Turn order:** the Corp takes turn 1, then turns alternate. The Corp's mandatory draw happens at the start of every Corp turn, including turn 1, so the Corp starts its first turn with 6 cards. The Runner never gets a free draw.
- **Ending a turn (house rule, owner 2026-11-12):** the active player ends their turn by choosing to (End turn). They may do this with clicks left over; leftover clicks are lost. *(Differs from the genre's standard rule, where every click must be spent.)* The turn never ends by itself when the last click is spent.
- End of turn: discard down to maximum hand size (5). The player picks which cards. The Runner's discards go face up to their discard pile (the **Heap**). The Corp's go face down to Archives: the Runner sees only how many.
- Zone words: the Corp's hand, deck and discard pile are **HQ**, **R&D** and **Archives**; the Runner's are the **Grip**, the **Stack** and the **Heap**.
- Basic actions with an empty deck: the Runner (or Corp) cannot spend a click to draw from an empty deck. That action is not allowed, and nothing is lost.

## Installing (Sprint 2)
Installing costs 1 click and puts a card from your hand on the table.
- **Servers.** The Corp has three central servers (HQ, R&D, Archives) and may open **remote servers** ("Server 1", "Server 2", … numbers never reused). Installing into "new server" opens the next remote.
- **Corp agendas and assets** go into a remote server that holds no agenda or asset yet (one per server), or a new one.
- **Corp upgrades** go into any server (central or remote) or a new one; they may share a server with an agenda/asset and with other upgrades.
- **Corp ICE** goes in front of any server (or a new one), on the outside. It costs 1 credit for each ICE already protecting that server (0 for the first).
- **Corp installs are face down** (unrezzed) and otherwise free; rez costs are paid later when rezzing. The Corp may look at its own installed cards; the Runner sees only card backs.
- **Runner programs, hardware and resources** are installed face up in the Runner's area (the **rig**), paying the card's cost. Each program uses memory; the Runner has 4 memory. A program that would go over 4 can't be installed. *(Sprint 2 ruling: memory is fixed at 4; cards that add memory, like Akamatsu Mem Chip, start working when installed-card abilities are built. Making room by trashing an installed card comes later too.)*
- Installed cards' own abilities (e.g. "When your turn begins, gain 1 credit") are not active yet (later sprint).

## Playing operations and events (Sprint 2)
- Costs 1 click plus the card's cost in credits. The card goes face up on its owner's discard pile (Archives / Heap), visible to both players, and its effect happens (e.g. Hedge Fund: gain 9 credits; Diesel: draw 3 cards).
- A card effect that draws stops when the deck is empty; nothing is lost. (Only the Corp's mandatory start-of-turn draw from an empty R&D loses.)
- Cards whose effect needs runs (e.g. Inside Job, Neural EMP) can't be played yet.

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

## Starter card pool (Sprint 2)
12 real cards per side from the original core set (2012), with official names and text (owner decision 2026-11-12); art is our own. The list and the invented cards they replaced: `docs/sprints/sprint-02-card-swaps.md`. The pool covers economy, draw, three ICE types (barrier / code gate / sentry), matching breakers, 3 agendas, an asset, an upgrade, programs, hardware, resources, and damage. Starter decks are 15 cards: one of each plus three extra copies.
