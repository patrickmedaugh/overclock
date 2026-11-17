# Rules spec (our own words) — v0 (rules version 3, Sprint 9)

The engine implements this document. It is a simplified, genre-standard ruleset; extend it as sprints add mechanics. Ambiguities → simplest ruling, logged in `DECISIONS.md`.

## Setup
- Two players: Corp and Runner, each with an identity card and a 30–45 card deck (v0 uses fixed starter decks).
- Each starts with 5 credits and draws 5 cards. Corp goes first.
- *(Sprint 8)* The game uses the **core decks**: the Corp plays **Haas-Bioroid: Engineering the Future**, the Runner **Kate "Mac" McCaffrey: Digital Tinker**, each with a 30-card deck (house rule, owner Q2 A; the real minimum is 45). Identities sit face up on the table all game and never leave it. (The Sprint 2–7 starter decks, without identities, remain only as a test setup.)

## Turns
- **Corp turn:** draw 1 card (mandatory), then spend 3 clicks. Basic actions: gain 1 credit; draw 1 card; install a card (agenda/asset/upgrade into a remote server, ICE in front of any server; installed ICE costs 1 credit per ICE already protecting that server); play an operation; advance an installed card (1 click + 1 credit); *(Sprint 9)* trash one of the Runner's installed resources while he is tagged (1 click + 2 credits); purge (3 clicks, later sprint).
- **Runner turn:** spend 4 clicks. Basic actions: gain 1 credit; draw 1 card; install a program/hardware/resource (pay cost; programs use memory, starting limit 4); play an event; make a run; *(Sprint 9)* remove 1 tag (1 click + 2 credits).
- **Turn order:** the Corp takes turn 1, then turns alternate. The Corp's mandatory draw happens at the start of every Corp turn, including turn 1, so the Corp starts its first turn with 6 cards. The Runner never gets a free draw.
- **Ending a turn (house rule, owner 2026-11-12):** the active player ends their turn by choosing to (End turn). They may do this with clicks left over; leftover clicks are lost. *(Differs from the genre's standard rule, where every click must be spent.)* The turn never ends by itself when the last click is spent.
- End of turn: discard down to maximum hand size (5; *Sprint 8:* minus the Runner's brain damage). The player picks which cards. The Runner's discards go face up to their discard pile (the Heap). The Corp's go face down to Archives: the Runner sees them only as card backs.
- **Zones:** Corp: HQ (hand), R&D (deck), Archives (discard pile, face-up and face-down cards mixed). Runner: the Grip (hand), the Stack (deck), the Heap (discard pile, all face up). Engine code keeps the generic names `hand`, `deck`, `discard` for both sides.
- Basic actions with an empty deck: the Runner (or Corp) cannot spend a click to draw from an empty deck. That action is not allowed, and nothing is lost.

## Installing and playing (Sprint 2)
- **Install** (1 click), Corp: the card goes face down.
  - Agenda or asset: into a remote server that holds no agenda or asset, or into a new remote server. Never into HQ, R&D or Archives.
  - Upgrade: into any server (HQ, R&D, Archives or a remote), or a new remote server.
  - ICE: in front of any server, or a new remote server. It goes on the outside (outermost). It costs 1 credit for each ICE already protecting that server.
  - Agendas, assets and upgrades cost no credits to install (their cost is a rez cost, paid later).
  - New remote servers are numbered Server 1, Server 2, ... in the order they are made; numbers are never reused.
- **Install** (1 click), Runner: programs, hardware and resources go face up into the Runner's area (the rig). Pay the card's cost. Programs use memory: installed programs' memory must stay at or under the memory limit: 4, plus 1 for each installed card that raises it (Akamatsu Mem Chip: +1, Sprint 7).
- **Play** (1 click): an operation (Corp) or event (Runner). Pay its cost, the card goes face up on top of your discard pile (Archives / Heap), then its effect happens. Card draws from an effect stop when the deck is empty; nothing is lost (only the Corp's mandatory draw can lose the game).
- *(Sprint 2: cards whose effect needs runs could not be played yet. From Sprint 3 they work; see Runs.)* From Sprint 7 installed cards' abilities work (see "Card abilities and credits on cards"); from Sprint 8 Sacrificial Construct works too (Rototurret), so only Private Security Force still has nothing to react to (it needs tags). *(Sprint 9: tags exist, so it works too; see "Traces, tags and link".)*
- If several things stop an install or play, the reason given follows this order: not your turn, wrong step, no clicks, wrong card, wrong place, needs a system not built yet, its play condition is not met (e.g. Neural EMP without a run last turn), not enough credits, not enough memory.

## Identities and deck rules (Sprint 8)
- **Haas-Bioroid: Engineering the Future:** the first time the Corp installs a card each turn (any card: ICE, agenda, asset, upgrade), it gains 1 credit, right after the install. A second install that turn gives nothing.
- **Kate "Mac" McCaffrey: Digital Tinker:** the first program or piece of hardware the Runner installs each turn costs 1 less (never below 0). That first one uses the discount up even if it was free already. Resources and events never use it. Her printed "1 link" is shown; *(Sprint 9)* it counts in traces.
- "Each turn" means every player-turn: the counts start afresh at the start of every turn, for both sides.
- **Deck rules** (checked automatically on both core decks): at least 30 cards (house), at most 3 copies of a card, only the identity's side, no identity in the list, agendas only of the identity's faction or neutral, other-faction cards' influence at most the identity's limit (15), and a Corp deck of 30 cards holds 14–15 agenda points.
- **Face-down Corp cards never do anything:** their "when your turn begins", abilities and bonuses only work once rezzed.

## Corp cards
- Installed face down. **Rez** = pay the card's rez cost to turn it face up; it stays face up for the rest of the game.
  - **ICE** is rezzed only when the Runner approaches it during a run, or (Sprint 4) for free when Priority Requisition is scored.
  - **Assets and upgrades** (Sprint 7, owner Q3 A): on the Corp's own turn, outside a run, at any time it may act; no click, just the rez cost. *(The real game also allows other moments, e.g. the end of the Runner's turn; not in this game yet.)*
- **Rez-cost discounts** (Sprint 7): a face-up Akitaro Watanabe lowers the rez cost of ICE protecting its server by 2 (never below 0). The lowered price is what the Corp pays and what decides whether the Corp can pay (so, in pass-the-phone games, whether it is asked Rez / Don't rez at all).
- **"When your turn begins"** (Sprint 7): a face-up PAD Campaign gives the Corp 1 credit when its turn begins, before the mandatory draw. A face-down one gives nothing.
- **"When rezzed"** (Sprint 8): an effect that happens whenever the card turns face up, however it is rezzed. **Adonis Campaign** gets 12 credits from the bank when rezzed; when the Corp's turn begins it moves 3 of them to the Corp; when it is emptied it goes face up to Archives (a remote left empty disappears).
- **Corp click abilities** (Sprint 8): on its own turn, outside a run, the Corp may use a face-up card's ability by paying its clicks: **Melange Mining Corp.** — 3 clicks: gain 7 credits.
- **Gaining clicks** (Sprint 8): **Biotic Labor** gives the Corp 2 more clicks this turn.

## Advancing and scoring (Sprint 3)
- **Advance** (Corp, 1 click + 1 credit): put 1 advancement counter on one of your installed agendas, or (Sprint 7) on an ICE whose text says it can be advanced (Ice Wall), face up or face down. The Runner sees how many counters a card has, but not the face-down card. Ice Wall has +1 strength per counter.
  - **Advance stops at the requirement (house rule, Sprint 10, owner-chosen):** an agenda that already has as many counters as its advancement requirement cannot be advanced again; only **Score** is offered. *(The real game allows more counters, which is almost never useful.)* Advanceable ICE (Ice Wall) has no limit.
- **Score** (Corp, no click): on your turn, outside a run, when an installed agenda has at least as many counters as its advancement requirement, move it face up to your score area; you gain its agenda points.
- **"When scored" bonuses (Sprint 4).** Some agendas do something when the **Corp scores** them. A **stolen** agenda never does: the bonus is for the Corp scoring only. The bonus happens right after the agenda reaches the score area, in the order its text says. If the agenda's points bring the Corp to 7, the Corp wins at once and the bonus does not happen.
  - **Hostile Takeover:** the Corp gains 7 credits, then takes 1 bad publicity (see below).
  - **Priority Requisition:** the Corp *may* rez one of its installed, face-down ICE (on any server) for free. The game waits for the Corp to pick one, or **Skip**. Nothing else can happen until it decides. If the Corp has no face-down ICE installed, nothing happens and there is no question. Rezzing this way costs nothing and the ICE stays face up for the rest of the game, as usual.

## Card abilities and credits on cards (Sprint 7)
- **Credits on cards.** Some cards hold credits (both players see how many). Armitage Codebusting gets 12 and Bank Job 8 from the bank when installed. When a card that says "when there are no credits left, trash it" is emptied, it goes face up to the Heap.
- **Click abilities.** On his own turn, outside a run, the Runner may use a card's "Click: …" ability by paying its cost (Armitage Codebusting: 1 click, take 2 credits from it).
- **Recurring credits.** Cyberfeeder holds 1 credit that may only pay for icebreaker abilities (raising strength, breaking). It is placed when Cyberfeeder is installed and refilled to 1 when the Runner's turn begins (never more). When the Runner uses an icebreaker, the game pays from Cyberfeeder first, then the run-only credits (bad publicity), then his own. Cyberfeeder never pays trash costs or installs. *(Its "or installing virus programs" does nothing: no virus programs in these decks.)*
- **Bank Job.** When a run on a **remote** server is successful and Bank Job holds credits, the Runner chooses before access: **take credits** — any number from 1 to all it holds (Sprint 10; before that it always took all); nothing is accessed and the run ends — or **access cards** as usual (Bank Job keeps its credits). When its last credit is taken it goes to the Heap. On HQ, R&D and Archives there is no choice.
- **Memory.** Akamatsu Mem Chip adds 1 to the Runner's memory limit while installed.

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
     *(Sprint 6, online games: the Corp is asked about **every** face-down ICE, even one it cannot pay for — then only **Don't rez** works, and the game answers it for the Corp after a short random pause if the Corp doesn't. This way the Runner cannot tell from the wait whether the Corp could have paid. Pass-the-phone games keep the rule above.)*
   - Face-down ICE (not rezzed) is simply **passed**.
   - **Encounter** (rezzed ICE). The Runner may use icebreakers of the matching kind: barrier breakers on barriers, code gate breakers on code gates, sentry breakers on sentries. A breaker can break a subroutine only if its strength is at least the ICE's strength; strength can be raised by paying the breaker's price. Raised strength lasts until the end of this encounter, unless the card says "for the remainder of this run". When every subroutine is broken, the ICE is passed. Otherwise the Runner chooses **Let it through**: each unbroken subroutine happens in order. "End the run" stops the run at once (nothing is accessed, the remaining subroutines do not happen).
   - **Continue or jack out.** After passing a piece of ICE, the Runner chooses to continue (to the next ICE, or into the server) or **jack out** (the run ends, nothing accessed). The Runner cannot jack out before the first piece of ICE; a server with no ICE is entered directly.
3. **Access** (the run is successful). The Runner looks at: HQ = 1 random card from the Corp's hand; R&D = the top card (The Maker's Eye: top 3, one after another); Archives = every card there, all at once, and face-down cards there turn face up for good; a remote server = every card in it, one after another.
   - An **agenda** must be stolen: it goes face up to the Runner's score area and the Runner gains its points.
   - A card with a **trash cost** (assets, upgrades) may be trashed by paying that cost: it goes face up to Archives. Otherwise the Runner leaves it where it was. Cards in Archives cannot be trashed again.
   - Other cards (operations, ICE) are looked at and stay where they were.
4. **End.** The run ends; the Runner continues its turn with the clicks it had left. *(Sprint 7)* A remote server left with no ICE and no cards disappears when the run ends (or when the Corp scores the last card in it); the other servers keep their names, and the next new server gets a new number (numbers are never reused). Cards the Runner accessed but did not take become hidden again. *(Sprint 5)* The Runner may look back at them (**Last run**) until his turn ends; the Corp is shown nothing new.
- **Inside Job:** the first piece of ICE the Runner *encounters* in the run (so the first rezzed one) is bypassed: passed without breaking, its subroutines do not happen.
- **Neural EMP** can be played only if the Runner started a run during its previous turn.

## Traces, tags and link (Sprint 9)
- **Link** = how well the Runner hides. The Runner's link is his identity's printed link (Kate: 1) plus the link of each card in his rig (Access to Globalsec: +1 each). Both players see it.
- **Trace** = a bidding contest a card starts ("Trace 3 – If successful, …"; the number is the trace's base strength). It is the real 2012 rule (owner, Sprint 9 Q1 A):
  1. The **Corp bids first, openly**: it may spend any number of its credits (0 or more); each adds 1 to the trace strength.
  2. Then the **Runner bids**, seeing the Corp's strength: he may spend credits (during a run, also his run-only bad-publicity credits, used first); each adds 1 to his link for this trace.
  3. If the trace strength is **higher** than the Runner's link + bid, the trace **succeeds** and the "If successful" part happens. If it is **equal or lower**, nothing happens (ties go to the Runner). Credits bid are spent either way.
  - **No pointless questions:** a player is not asked to bid when his bid cannot change the result. The Corp is not asked when it has 0 credits, or when even all its credits could not beat the Runner's link. The Runner is not asked when the trace already fails (strength at most his link) or when he cannot reach the strength even with everything he has. A player who is not asked bids 0, and both players are told the bids.
  - In a run, a trace subroutine waits for both bids before the next subroutine happens. A trace from an operation (SEA Source) happens in the Corp's turn.
- **Tags.** "Give the Runner 1 tag" puts a tag on him. Tags stay, also across turns, until he removes them. Both players see how many he has.
  - **Remove a tag** (Runner basic action, on his turn outside a run): 1 click + 2 credits removes 1 tag.
  - **Trash a resource** (Corp basic action, on its turn outside a run, only while the Runner has at least 1 tag): 1 click + 2 credits trashes one of his installed resources (it goes face up to the Heap).
  - **Private Security Force** (scored by the Corp, in its score area): "Click: Do 1 meat damage." — usable on the Corp's turn outside a run, only while the Runner is tagged. Abilities of scored agendas work only in the **Corp's** score area; a stolen one does nothing.
- **SEA Source** can be played only if the Runner made a successful run during his last turn (a run that reached the server; a Bank Job run where he took the credits instead of accessing still counts).
- If several things stop a tag action, the reason given follows this order: not your turn, wrong step, no clicks, the Runner has no tag (remove a tag) / is not tagged (trash a resource), not a resource (trash a resource), not enough credits. A bid is refused if it is not a whole number of 0 or more, if it is not your bid, if no trace is waiting, or if it is more than you can spend; "pass" in a bid is refused (bid 0 instead).

## Damage (Sprint 3)
- **Net damage:** for each point, the Runner discards a random card from its Grip to the Heap (face up). Random picks come from the game's seeded randomness.
- **Brain damage** (Sprint 8, Viktor 1.0, Heimdall 1.0): for each point the Runner's maximum hand size drops by 1 for the rest of the game, and he discards a random card from his Grip to the Heap. More damage than cards in the Grip flatlines him (as net damage). If his maximum hand size is below 0 when his turn ends, he is flatlined (the Corp wins).
- **Trashing Runner cards** (Sprint 8, Rototurret "Trash 1 program"): the Corp picks which of the Runner's installed programs goes to the Heap; with none nothing happens, with one there is no question. **Sacrificial Construct**: when one of the Runner's installed programs or hardware would be trashed, the Runner may trash Sacrificial Construct instead (it saves that card), or let it be trashed. Both decisions happen in the middle of the ICE; the run then goes on with the next subroutine.
- **Breaking several at once** (Sprint 8): Battering Ram's "Break up to 2 barrier subroutines" breaks 1 or 2 subroutines (the Runner picks them) for one payment.
- **Losing clicks:** "The Runner loses 1 click, if able" takes a click only if the Runner has one left.
- **Meat damage** (Sprint 9, Private Security Force): like net damage: for each point the Runner discards a random card from his Grip to the Heap; more damage than cards in his Grip flatlines him (the Corp wins).

## Winning
- The first player to reach **7 agenda points** wins at once, when the agenda is stolen or scored.
- The Corp wins at once if the Runner takes more net, brain *(Sprint 8)* or meat *(Sprint 9)* damage than it has cards in its Grip (**flatline**).
- Runner wins if the Corp must draw from an empty R&D. Only the mandatory start-of-turn draw counts as "must draw"; the game ends right then.

## Starter card pool (v1, Sprint 2)
12 real cards per side from the original Core Set (2012), with their official names, stats and text (symbols spelled as words), per the owner's real-cards decision (2026-11-12). The pool covers economy, draw, three ICE types (barrier/code gate/sentry), matching icebreakers, 3 agendas, 1 asset, 1 upgrade and damage. Each starter deck is the 12 cards plus 3 extra copies (15 cards); from Sprint 3 the Corp deck has one more Hostile Takeover and one more Private Security Force (17 cards, 9 agenda points) so a 7-point win is possible. The list and the swap from the invented Sprint 0 cards are in `docs/DECISIONS.md`. Card art stays our own runtime-drawn glyphs.
