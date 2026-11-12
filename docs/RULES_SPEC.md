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
- End of turn: discard down to maximum hand size (5). The player picks which cards. The Runner's discards go face up to their discard pile (heap). The Corp's go face down to Archives: the Runner sees only how many.
- Basic actions with an empty deck: the Runner (or Corp) cannot spend a click to draw from an empty deck. That action is not allowed, and nothing is lost.

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

## Starter card pool (v0)
Design ~12 original cards per side covering: economy, draw, three ICE types (barrier/code gate/sentry), matching breakers, 2–3 agendas, 1 asset, 1 damage source. All names and text original.
