# Sprint 02 proposal — Put cards on the table

**Reply "approved" to start, or comment on any story to change it.**

## What changed after your comment (2026-11-12)
- **Q1 (tap or drag):** tap to play this sprint, as you chose. Dragging is now on the backlog for later, in your words.
- **Q2 (names):** we weren't sure which names you meant, so question 2 now asks one short follow-up. Until you answer, we build with our own plain words.
- **Q3 (home-screen check):** skipped for now. It stays on the backlog, and we'll come back to it as you said.
- **Q4 (discard speed):** kept at 0.18 seconds. Closed.
- **Landscape on phones:** new story **S-02-6** turns the phone board sideways. One new question (5) on how far to take it. The busy-board check (S-02-5) now uses sideways phone sizes.
- **Bigger sprint:** six stories now. If we run short, S-02-4 (play money and draw cards) still moves to next sprint first.

## Goal
By the end of this sprint, your cards finally do something, on a phone held sideways. The Corp can hide cards face down in servers and put defenses in front of them. The Runner can set up programs and gear. Both sides can play their money and draw cards. There's still no attacking (that's next sprint), but the board starts to look like a real game.

*Quick refresher:* a **server** is a spot on the Corp's side where it keeps cards. The Corp starts with three built-in ones (its hand, its deck and its discard pile) and can open new ones. **Defenses** are Corp cards placed in front of a server to stop the Runner getting in. **Installing** means putting a card from your hand onto the table. **Landscape** means the phone held sideways (wide), **portrait** means upright (tall). More terms: `docs/GLOSSARY.md`.

*Names on screen:* this proposal says "defense", "Server 1" and so on. The exact on-screen words depend on question 2 below.

*How you play cards:* tap the card, then tap where it goes (your answer to question 1).

## Stories

### S-02-1: Corp: hide a card in a new server
*Why it matters:* this is how the Corp plays. It hides its point cards (agendas) and money-makers in servers, and the Runner has to guess what's there.
*Acceptance criteria:*
- Given it's the Corp's turn with clicks left, when you tap an agenda, asset or upgrade in your hand, then the places it can go light up, including **New server**.
- Given the places are lit, when you tap New server, then the card slides face down into a new server labelled "Server 1" (the next one is "Server 2"), one click is used, and no credits are spent.
- Given a server already holds an agenda or an asset, when you pick another agenda or asset, then that server is not offered (one per server). Upgrades can go into any server, including the three built-in ones.
- Given the places are lit, when you tap the card again or tap an empty part of the board, then nothing is installed and no click is used.
- Given the Corp has a card in a server, when you hold your finger on it, then it zooms face up so you can read it (it's your card, so you know what it is).
- Given it's the Runner's turn, when you look at the Corp's servers, then installed cards show only as card backs. (automated check also confirms the Runner's side of the game never receives their names)
*Size:* M

### S-02-2: Corp: put defenses in front of a server
*Why it matters:* defenses are the Corp's walls. Next sprint the Runner will have to get past them.
*Acceptance criteria:*
- Given it's the Corp's turn with clicks left, when you tap a defense card in your hand, then every server lights up (the three built-in ones, any you've opened, and New server), each showing its price.
- Given a server has no defenses yet, when you tap it, then the defense goes face down in front of it, one click is used, and it costs no credits.
- Given a server already has defenses, when you add another, then it costs 1 credit for each defense already there (2 defenses there = 2 credits), and the new one goes on the outside.
- Given you can't afford a server's price, when you tap it, then only a small "Not enough credits" hint appears and nothing changes.
- Given it's the Runner's turn, when you look at the Corp's defenses, then you see how many are in front of each server, but only as card backs.
*Size:* M

### S-02-3: Runner: install programs, hardware and resources
*Why it matters:* the Runner builds up a toolkit before attacking. This is the Runner's side of setting up the board.
*Acceptance criteria:*
- Given it's the Runner's turn with clicks left, when you tap a program, hardware or resource in your hand, then an **Install** spot lights up in your area showing the price (e.g. "Install · 3 credits").
- Given you have enough credits, when you tap Install, then the card appears face up in your area, the credits are paid, and one click is used.
- Given you don't have enough credits, when you tap Install, then only a small "Not enough credits" hint appears and nothing changes.
- Given you look at your area, when you have programs installed, then a **memory** counter shows how much room they use (e.g. "Memory 2/4"). Each program needs memory; you start with 4.
- Given your memory is full, when you try to install another program, then only a "Not enough memory" hint appears and nothing changes.
- Given it's the Corp's turn, when you look at the Runner's area, then the Runner's installed cards are visible face up.
*Size:* M

### S-02-4: Play money and draw cards
*Why it matters:* the one-shot cards in your hand (Corp "operations", Runner "events") become useful right away, and the economy starts to matter.
*Acceptance criteria:*
- Given it's your turn with clicks left, when you tap one of these cards, then a **Play** button shows its price: Quarterly Windfall (2 credits: gain 5), Synergy Memo (free: draw 2), Overtime Hustle (free: gain 3), Cache Dive (free: draw 3).
- Given you tap Play and can afford it, when the card resolves, then the credits or cards arrive with the same quick animations as today, one click is used, and the card goes face up on your discard pile for both players to see.
- Given you can't afford it, when you tap Play, then only "Not enough credits" appears and nothing changes.
- Given a card needs something that isn't built yet (it attacks, or reacts to an attack), when you tap it, then a hint says "Needs runs (coming soon)" and nothing is spent.
- Given a played card pushed your hand over 5, when you end your turn, then the usual hand-limit discard step appears. (automated check)
*Size:* S

### S-02-5: A busy board still fits and reads right on a phone
*Why it matters:* servers and installed cards take space. The board has to stay clear and quick on a small phone.
*Acceptance criteria:*
- Given the Corp has 3 new servers, each with 2 defenses, and the Runner has 4 installed cards, when you look at the board on a normal phone held sideways (844×390) and a small one (640×360), then nothing overlaps, every server and card can be tapped and held to zoom, and nothing is under the notch or swipe bar. (automated check, with screenshots in the demo) *If you pick 5B, we also check upright phones (390×844 and 360×640); if 5C, upright only.*
- Given you install or play a card, when you tap, then the game answers in under 0.1 seconds and the animation is done within 0.6 seconds. (automated check)
- Given any card or label on screen, when you read it, then it uses the set of words you pick in question 2, the same everywhere (cards, labels and the glossary agree). (automated check)
*Size:* S

### S-02-6: Phone board in landscape (new, from your comment)
*Why it matters:* you said the game should be played with the phone sideways. Doing it now means the new servers and installed cards are laid out for sideways from the start, instead of being redone later.
*Acceptance criteria (assuming you pick 5A):*
- Given a phone held sideways (844×390, and a small one at 640×360), when the game opens, then the whole board (both sides, servers, your hand, End turn) fits on one screen with no scrolling, and every card and button is big enough to tap.
- Given a phone with a camera notch held sideways, when the notch is on the left or the right, then nothing you need to read or tap is under the notch or the swipe bar. (automated check simulates both sides; you can also try it on your phone)
- Given a phone held upright in the browser, when the game is open, then a "Turn your phone sideways" screen shows instead of the board, and turning the phone brings the game straight back where you left it.
- Given the game is added to your home screen, when you open it from there, then it opens sideways. (automated check that the home-screen settings ask for landscape; on your phone only when we circle back to question 3)
- Given a computer browser, when you open the demo, then it looks and works as it does today. (automated check)
- Given a full Sprint 1 turn (draw, gain credits, end turn, hand-limit discard) on a sideways phone, when you play it, then every step still works and responds as fast as before. (automated check)
*Size:* L

*Why it's large:* today the board is drawn as one tall column. On a sideways phone it currently shows as a thin strip in the middle at half size, so the layout has to be redesigned, not just stretched. The good news: all positions come from one layout file, so the game's rules and animations don't change.

## Not in this sprint (and why)
- **Runs (attacking a server), flipping defenses face up, and scoring agendas.** That's the next epic ("Runs"). This sprint sets up the board they need.
- **Abilities on installed cards** (for example, a Corp card that pays 1 credit each turn, or a Runner card you click for 2 credits). They need a bigger "card effects" system. They sit on the table but don't do anything yet. The card text will still show what they'll do later.
- **Removing an installed card to make room** (when memory is full, or to replace a card in a server). For now you're told there's no room.
- **Drag to play.** You chose tap for now and drag for the future. It's on the backlog with the later "Real board UI" work.
- **The home-screen check on your phone** (question 3). Skipped for now, as you said; we'll circle back, at the latest when the Android app is built.
- **A sideways layout for computers.** Computers keep today's look; only phones change.
- **Playing against the computer, the Android app, the smoother hand reshuffle at the 6th card.** Still on the backlog, in that order.

## Questions for you
2. **Quick follow-up on names: when you said "keep original names", which did you mean?** *(We ask because the two readings are opposites.)* — **Recommended:** A. Options:
   A) **Our own words, already in this proposal:** "Defenses", "Hand", "Deck", "Discard", "Server 1", "Server 2"… Made up by us, safe to use, and clear for new players.
   B) **Our own themed words:** "Wards", "Vault", "Mainframe", "Shredder", "Node 1"… Also ours and safe; more flavour, one more thing to learn.
   C) **The words from the game we're inspired by** (ICE, HQ, R&D, Archives). *In one line: those are that game's own terms, and our rule is to use only things we made up, so putting them on screen and on cards is a legal risk we advise against.* If you still want them, tell us and we'll note that the choice is yours.
   D) Your own names. Just tell us (we'll check they're original).

5. **Landscape on phones: how far should we go this sprint?** — **Recommended:** A. Options:
   A) **Sideways only on phones.** Holding the phone upright shows "Turn your phone sideways". One layout to build and test, so it fits this sprint.
   B) **Both ways.** Sideways and upright both work. Every screen is designed and tested twice from now on; S-02-4 would almost certainly move to next sprint.
   C) **Sideways later, not this sprint.** Keep the upright board for now. Quickest this sprint, but the new servers would be laid out twice.

   *Heads-up that comes with this answer:* the team's quality checklist (in the team rule book, `CLAUDE.md`) says every story must work on "a 390×844 phone", which is an upright phone. If you pick A, the team will test the sideways size (844×390) instead; with B, both. That checklist only changes with your OK, so your answer here is that OK. With C, nothing changes.

### Already answered (thanks)
1. **How should you play a card?** You chose: tap now, drag later. Built as tap-to-play; drag is on the backlog.
3. **Home-screen check on your phone.** You chose: not now, we'll circle back. On the backlog.
4. **Discard speed (0.18 seconds).** You chose: seems fine. Kept as it is.

## Risks
- **This sprint is now bigger** (three medium stories plus a large one). If we run short, S-02-4 (play money and draw cards) moves to the next sprint first, and the demo will say so. We'd rather keep landscape, because every later screen builds on it.
- **Sideways phones are short.** At 360 pixels tall, two players' areas, servers and a hand of cards all have to fit in a thin strip. We'll put things side by side, and show you screenshots on a small phone. If the Corp opens more servers than fit, they'll shrink or scroll sideways; the demo will show which.
- **A phone browser can't be forced to stay sideways.** In the browser we show "Turn your phone sideways" instead. The home-screen version and the future Android app can be locked sideways.
- **Hidden cards must stay hidden.** On one shared screen you can see both sides anyway, but the real game will be online, so automatic checks make sure the Runner's side of the game never receives the names of face-down cards.
- **Names may change.** Until you answer question 2, we build with option A. Changing the words later is quick.
