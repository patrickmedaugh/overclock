# Sprint 02 proposal — Put cards on the table

**Comment your go-ahead to start, or comment on any story to change it.** All questions are answered.

## What changed after your answers (2026-11-12)
- **Q1 (tap or drag):** tap to play this sprint, as you chose. Dragging is now on the backlog for later, in your words.
- **Q2 (names):** answered: real names and real cards, since this is a personal project only you will play. The board, card types and glossary will use the real game's words (ICE, HQ, R&D, Archives), and the cards in your starter decks become real cards from the original core set, with their official names and text (in S-02-5 and S-02-4). The rest of the real card pool is a new top-priority backlog item.
- **Q3 (home-screen check):** skipped for now. It stays on the backlog, and we'll come back to it as you said.
- **Q4 (discard speed):** kept at 0.18 seconds. Closed.
- **Landscape on phones:** new story **S-02-6** turns the phone board sideways. The busy-board check (S-02-5) now uses sideways phone sizes.
- **Q5 (how far with landscape):** answered: **A**, sideways only on phones. Holding the phone upright shows "Turn your phone sideways". The team now tests on sideways phone sizes (844×390 and 640×360) instead of the upright 390×844.
- **Bigger sprint:** six stories now. If we run short, S-02-4 (play money and draw cards) still moves to next sprint first.

## Goal
By the end of this sprint, your cards finally do something, on a phone held sideways. The Corp can hide cards face down in servers and put defenses in front of them. The Runner can set up programs and gear. Both sides can play their money and draw cards. There's still no attacking (that's next sprint), but the board starts to look like a real game.

*Quick refresher:* a **server** is a spot on the Corp's side where it keeps cards. The Corp starts with three built-in ones: its hand (**HQ**), its deck (**R&D**) and its discard pile (**Archives**), and can open new ones. **ICE** are the Corp's defenses: cards placed in front of a server to stop the Runner getting in. **Installing** means putting a card from your hand onto the table. **Landscape** means the phone held sideways (wide), **portrait** means upright (tall). More terms: `docs/GLOSSARY.md`.

*Names on screen:* this proposal sometimes says "defense" to explain things; on screen it will say ICE, HQ, R&D and Archives, as in the real game (your answer to question 2). The glossary (`docs/GLOSSARY.md`) is updated to match during the build.

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

### S-02-2: Corp: put ICE (defenses) in front of a server
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
- Given it's your turn with clicks left, when you tap one of these real core-set cards, then a **Play** button shows its price: Corp: **Hedge Fund** (5 credits: gain 9), **Anonymous Tip** (free: draw 3). Runner: **Easy Mark** (free: gain 3), **Diesel** (free: draw 3). *(They replace our invented Quarterly Windfall, Synergy Memo, Overtime Hustle and Cache Dive.)*
- Given you tap Play and can afford it, when the card resolves, then the credits or cards arrive with the same quick animations as today, one click is used, and the card goes face up on your discard pile for both players to see.
- Given you can't afford it, when you tap Play, then only "Not enough credits" appears and nothing changes.
- Given a card needs something that isn't built yet (it attacks, or reacts to an attack), when you tap it, then a hint says "Needs runs (coming soon)" and nothing is spent.
- Given a played card pushed your hand over 5, when you end your turn, then the usual hand-limit discard step appears. (automated check)
*Size:* S

### S-02-5: A busy board fits on a phone, with real words and cards
*Why it matters:* servers and installed cards take space, so the board has to stay clear and quick on a small phone. And you asked for the real game's words and cards, so this is where they arrive.
*Acceptance criteria:*
- Given the Corp has 3 new servers, each with 2 defenses, and the Runner has 4 installed cards, when you look at the board on a normal phone held sideways (844×390) and a small one (640×360), then nothing overlaps, every server and card can be tapped and held to zoom, and nothing is under the notch or swipe bar. (automated check, with screenshots in the demo)
- Given you install or play a card, when you tap, then the game answers in under 0.1 seconds and the animation is done within 0.6 seconds. (automated check)
- Given any label on screen, when you read it, then board labels, card types and the glossary use the real game's words (e.g. ICE, HQ, R&D, Archives), the same everywhere. (automated check)
- Given any card in either starter deck, when you hold your finger on it to zoom, then it is a real card from the original core set with its official name and text (our invented cards are gone). Cards whose abilities aren't built yet still sit on the table without acting, as before. (automated check also confirms no invented card is left in the starter decks)
*Size:* M

### S-02-6: Phone board in landscape (new, from your comment)
*Why it matters:* you said the game should be played with the phone sideways. Doing it now means the new servers and installed cards are laid out for sideways from the start, instead of being redone later.
*Acceptance criteria (your answer 5A):*
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
- **The rest of the real card pool** (real identities, full core-set decks, more cards). This sprint only swaps the cards already in the starter decks (12 per side). The rest is now the top-priority backlog item.
- **Real card pictures.** Cards keep our own drawn neon look; only names and text become real.
- **Upright phones.** You chose sideways only, so holding the phone upright shows "Turn your phone sideways".
- **A sideways layout for computers.** Computers keep today's look; only phones change.
- **Playing against the computer, the Android app, the smoother hand reshuffle at the 6th card.** Still on the backlog, in that order.

## Questions for you
None. All five are answered, thanks.

### Already answered
1. **How should you play a card?** You chose: tap now, drag later. Built as tap-to-play; drag is on the backlog.
2. **Which names?** You chose: real names and real cards ("I sincerely doubt anyone besides myself will play this"). The board, card types and glossary use the real game's words; the starter-deck cards become real core-set cards; the rest of the real card pool is on the backlog.
3. **Home-screen check on your phone.** You chose: not now, we'll circle back. On the backlog.
4. **Discard speed (0.18 seconds).** You chose: seems fine. Kept as it is.
5. **Landscape on phones.** You chose **A**: sideways only on phones; upright shows "Turn your phone sideways". The team rule book now has the team test sideways phone sizes (844×390, 640×360) instead of upright 390×844, as you agreed.

## Risks
- **This sprint is now bigger** (four medium stories, one small and one large). If we run short, S-02-4 (play money and draw cards) moves to the next sprint first, and the demo will say so. Its four cards would still show their real names and text; they just couldn't be played yet. We'd rather keep landscape, because every later screen builds on it.
- **Sideways phones are short.** At 360 pixels tall, two players' areas, servers and a hand of cards all have to fit in a thin strip. We'll put things side by side, and show you screenshots on a small phone. If the Corp opens more servers than fit, they'll shrink or scroll sideways; the demo will show which.
- **A phone browser can't be forced to stay sideways.** In the browser we show "Turn your phone sideways" instead. The home-screen version and the future Android app can be locked sideways.
- **Hidden cards must stay hidden.** On one shared screen you can see both sides anyway, but the real game will be online, so automatic checks make sure the Runner's side of the game never receives the names of face-down cards.
- **Real names and cards belong to the original game's owners.** That's fine for a personal project only you play. Note that the code and the demo link are public today (we made the repo public so the free plan gives us the demo link), so anyone who finds them would see the real cards. If you ever want to share or publish the game, the names, text and words would need replacing first. If the public link bothers you, tell us and we'll suggest a private option.
- **Real cards can be fussier than ours.** Some real cards' costs or memory differ from the invented ones they replace, which can shift how the starter decks feel. The engine developer picks the real cards closest in type and cost, and the demo notes will list every swap.
- **The team's automatic originality check gets in the way now.** It fails the build if a real card name appears. The engine developer retires or reworks it during the build (it can keep checking things we still make ourselves, like card art).
