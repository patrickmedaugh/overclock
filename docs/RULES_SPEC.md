# Rules spec (our own words) — v0.2 (Sprint 2: installs, play, real core-set starter cards)

The engine implements this document. It is a simplified, genre-standard ruleset; extend it as sprints add mechanics. Ambiguities → simplest ruling, logged in `DECISIONS.md`.

## Setup
- Two players: Corp and Runner, each with an identity card and a 30–45 card deck (v0 uses fixed starter decks).
- Each starts with 5 credits and draws 5 cards. Corp goes first.

## Turns
- **Corp turn:** draw 1 card (mandatory), then spend 3 clicks. Basic actions: gain 1 credit; draw 1 card; install a card (agenda/asset into a remote server, upgrades into any server, ICE in front of any server; installed ICE costs 1 credit per ICE already protecting that server); play an operation; advance an installed card (1 click + 1 credit); purge (3 clicks, later sprint).
- **Runner turn:** spend 4 clicks. Basic actions: gain 1 credit; draw 1 card; install a program/hardware/resource (pay cost; programs use memory, starting limit 4); play an event; make a run; remove a tag (later sprint).
- **Turn order:** the Corp takes turn 1, then turns alternate. The Corp's mandatory draw happens at the start of every Corp turn, including turn 1, so the Corp starts its first turn with 6 cards. The Runner never gets a free draw.
- **Ending a turn (house rule, owner 2026-11-12):** the active player ends their turn by choosing to (End turn). They may do this with clicks left over; leftover clicks are lost. *(Differs from the genre's standard rule, where every click must be spent.)* The turn never ends by itself when the last click is spent.
- End of turn: discard down to maximum hand size (5). The player picks which cards. The Runner's discards go face up to their discard pile (heap). The Corp's go face down to Archives: the Runner sees only how many.
- Basic actions with an empty deck: the Runner (or Corp) cannot spend a click to draw from an empty deck. That action is not allowed, and nothing is lost.

## Installing and playing (Sprint 2)
- **Words:** the Corp's hand / deck / discard pile are **HQ / R&D / Archives**; the Runner's are **Grip / Stack / Heap**. The Runner's installed cards are its **Rig**.
- **Servers:** the Corp has three central servers (HQ, R&D, Archives) and can open **remote servers** ("Server 1", "Server 2", ...; a number is never reused). Each server has a stack of ICE in front of it (innermost first) and a root (cards installed in it).
- **Corp install (1 click):** pick a hand card and a server, or *New server* (which opens the next remote first).
  - Agendas and assets go only into a remote, at most one agenda or asset per remote. Installing costs 0 credits (rez costs come later).
  - Upgrades can go into any server, central or remote, any number per server. 0 credits.
  - ICE goes in front of any server (or a new one), as the new **outermost** ICE. It costs 1 credit per ICE already protecting that server (0 for the first).
  - Installed Corp cards are face down: the Corp can look at them, the Runner sees only card backs (and where they are).
  - No trashing to make room yet: a remote that already holds an agenda/asset is simply not offered.
- **Runner install (1 click):** programs, hardware and resources go face up into the Rig; pay the card's install cost. Programs use memory: the limit is 4, and a program that doesn't fit can't be installed (no trashing to make room yet). Card abilities that change memory (e.g. Akamatsu Mem Chip) do not act yet.
- **Play (1 click):** operations (Corp) and events (Runner). Pay the play cost, do what the card says, then the card goes **face up** onto its owner's discard pile (both players see it). Cards that need runs (e.g. Neural EMP, The Maker's Eye, Inside Job) can't be played yet.
- Drawing cards from a card effect (e.g. Anonymous Tip, Diesel) draws as many as are left if the deck is short; that never loses the game (only the Corp's mandatory start-of-turn draw does).
- **Discard piles:** Archives can now hold both face-up cards (played operations) and face-down cards (hand-limit discards). The Runner sees the face-up ones and only the count of the face-down ones.
- **Abilities on installed cards** (e.g. PAD Campaign's credit, Armitage Codebusting's click) don't act yet; the cards sit on the table.

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

## Starter card pool (v0.2)
12 real cards per side from the original 2012 core set, with their official names and text (owner decision 2026-11-12, personal use only; card art stays our own). 15-card starter decks: one of each plus three extra copies.
- **Corp:** Hedge Fund (×2), Anonymous Tip (×2), PAD Campaign, Wall of Static, Ice Wall (×2), Enigma, Neural Katana, Hostile Takeover, Private Security Force, Priority Requisition, Experiential Data, Neural EMP.
- **Runner:** Easy Mark (×2), Armitage Codebusting (×2), Diesel (×2), Corroder, Gordian Blade, Ninja, The Maker's Eye, Cyberfeeder, Akamatsu Mem Chip, Wyldside, Inside Job, Data Dealer.
- Playable now: Hedge Fund (5: gain 9), Anonymous Tip (0: draw 3), Easy Mark (0: gain 3), Diesel (0: draw 3). Full card list and values: `packages/cards/src/`.
