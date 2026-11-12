# Sprint 02 proposal — Put cards on the table

**Reply "approved" to start, or comment on any story to change it.**

## Goal
By the end of this sprint, your cards finally do something. The Corp can hide cards face down in servers and put defenses in front of them. The Runner can set up programs and gear. Both sides can play their money and draw cards. There's still no attacking (that's next sprint), but the board starts to look like a real game.

*Quick refresher:* a **server** is a spot on the Corp's side where it keeps cards. The Corp starts with three built-in ones (its hand, its deck and its discard pile) and can open new ones. **Defenses** are Corp cards placed in front of a server to stop the Runner getting in. **Installing** means putting a card from your hand onto the table. More terms: `docs/GLOSSARY.md`.

*Names on screen:* this proposal says "defense", "Server 1" and so on. The exact on-screen words are question 2 below.

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
- Given the Corp has 3 new servers, each with 2 defenses, and the Runner has 4 installed cards, when you look at the board on a normal phone and on a small one (360×640), then nothing overlaps, every server and card can be tapped and held to zoom, and nothing is under the notch or swipe bar. (automated check, with screenshots in the demo)
- Given you install or play a card, when you tap, then the game answers in under 0.1 seconds and the animation is done within 0.6 seconds. (automated check)
- Given any card or label on screen, when you read it, then it uses the words you choose in question 2 (no leftover genre words on card faces). (automated check)
*Size:* S

## Not in this sprint (and why)
- **Runs (attacking a server), flipping defenses face up, and scoring agendas.** That's the next epic ("Runs"). This sprint sets up the board they need.
- **Abilities on installed cards** (for example, a Corp card that pays 1 credit each turn, or a Runner card you click for 2 credits). They need a bigger "card effects" system. They sit on the table but don't do anything yet. The card text will still show what they'll do later.
- **Removing an installed card to make room** (when memory is full, or to replace a card in a server). For now you're told there's no room.
- **Drag to play.** This sprint uses taps (see question 1). Dragging cards around is part of the later "Real board UI" epic.
- **Playing against the computer, the Android app, the smoother hand reshuffle at the 6th card.** Still on the backlog, in that order.

## Questions for you
1. **How should you play a card from your hand?** — **Recommended:** A. Options:
   A) Tap the card, then tap where it goes. This works one-handed and avoids mis-drops on a small screen. Dragging can come later.
   B) Drag the card to where it goes (feels more like Hearthstone, but fiddly on a small phone, and slower to build this sprint).
   C) Both, from the start (more work; S-02-4 would probably move to next sprint).
2. **What should the Corp's defenses and built-in servers be called on screen?** — **Recommended:** A. Options:
   A) Plain words: defenses are just **"Defenses"**. The built-in servers are labelled **"Hand", "Deck", "Discard"**, and new ones **"Server 1", "Server 2"…** Clearest for new players, with no risk of copying anyone.
   B) Themed words: defenses are **"Wards"**, the built-in servers are **"Vault"** (hand), **"Mainframe"** (deck) and **"Shredder"** (discard), and new ones are **"Node 1", "Node 2"…** More flavour, but one more thing to learn.
   C) Keep the genre's own words (ICE, HQ, R&D, Archives). Fans would recognise them, but they come straight from the game we're inspired by, so we advise against it.
   D) Your own names. Just tell us (we'll check they're original).
3. **Sprint 1 check, about 30 seconds: on your phone, add the demo to your home screen and open it from there. Is anything hidden under the notch or swipe bar?** — **Recommended:** A (try it once). Options:
   A) Tried it: nothing is hidden.
   B) Tried it: something is hidden (tell us where).
   C) Skip for now. We'll check again when the Android app is built.
4. **Sprint 1 check: when you confirm discards, the cards now fly to the pile a bit faster (0.18 seconds, was 0.25). Is it still easy to see what happened?** — **Recommended:** A. Options:
   A) Yes, keep it.
   B) Too fast. Slow it back down (we'd keep End turn responsive another way).
   C) No opinion.

## Risks
- **The board gets crowded on small phones.** Servers, defenses and installed cards all need room. We'll test a busy board on a small phone and show you screenshots. If the Corp opens more servers than fit, they'll shrink or scroll sideways. We'll show you which in the demo.
- **This sprint is bigger than the last** (three medium stories). If we run short, S-02-4 (play money and draw cards) moves to the next sprint, and the demo will say so.
- **Hidden cards must stay hidden.** On one shared screen you can see both sides anyway, but the real game will be online, so automatic checks make sure the Runner's side of the game never receives the names of face-down cards.
- **Names may change.** Until you answer question 2, we build with option A. Changing the words later is quick.
