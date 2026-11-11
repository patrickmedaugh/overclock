# Sprint 1 proposal — Take turns on one phone

**Reply "approved" to start, or comment on any story to change it.**

## Goal
By the end of this sprint, two people can play real turns on one phone: the Corp goes first, each player spends their clicks to draw cards or gain credits, ends their turn, and hands the phone over. There's no attacking or installing yet, just the rhythm of a turn, done fast.

*Quick refresher:* a **click** is one action (Corp gets 3 a turn, Runner gets 4). **Credits** are the game's money. More terms: `docs/GLOSSARY.md`.

## Stories

### S-01-1: Corp goes first, and turns take turns
*Why it matters:* this is the heartbeat of the game. Every later feature happens inside a turn.
*Acceptance criteria:*
- Given a new game, when the board loads, then it says it's the **Corp's turn**, the Corp has 3 clicks, and the Corp has already drawn its free card for the turn (6 cards in hand).
- Given the Corp has ended its turn, when the Runner's turn starts, then the Runner has 4 clicks and does **not** get a free card.
- Given the Runner has ended its turn, when the Corp's next turn starts, then the Corp gets 3 fresh clicks and draws its free card again.
- Given either turn, when you look at the screen, then it's obvious whose turn it is and how many clicks they have left.
- Given the Corp's deck is empty, when the Corp's turn starts and it must draw, then the game ends with "Runner wins: the Corp ran out of cards". (automated check; it takes many turns to reach by hand)
*Size:* M

### S-01-2: Spend a click: gain a credit or draw a card
*Why it matters:* these are the two basic moves every player makes every turn, on both sides.
*Acceptance criteria:*
- Given it's your turn and you have clicks left, when you tap **your** credits counter, then it goes up by 1 with a quick pop, and one click is used.
- Given it's your turn and you have clicks left, when you tap **your** deck, then a card flies into your hand and one click is used. This works for the Corp as well as the Runner.
- Given you have 0 clicks, when you tap your credits or your deck, then nothing happens except the small "No clicks left" hint.
- Given it's **not** your turn, when you tap your deck or credits, then nothing happens. (automated check: on a shared phone you'll only ever see the active player's side up close)
*Size:* S

### S-01-3: End your turn
*Why it matters:* you decide when you're done, and the game moves on without fuss.
*Acceptance criteria:*
- Given you've used all your clicks, when you look at the screen, then a glowing **End turn** button appears.
- Given you still have clicks left, when you look at the End turn button, then it's dimmed, and tapping it shows "Use all your clicks first". (In this genre you always spend every click.)
- Given you tap End turn, when the turn changes, then the change happens in well under a second, with no extra screens to tap through except the hand-over screen in S-01-4.
*Size:* S

### S-01-4: Pass the phone (hot-seat play)
*Why it matters:* lets you play a real two-person game on one phone today, with no AI or internet needed. "Hot-seat" means two people sharing one device and taking turns.
*Acceptance criteria:*
- Given a turn just ended, when the hand-over happens, then a full-screen "Pass to the Runner" (or "Pass to the Corp") screen covers the board so neither hand is visible.
- Given the hand-over screen, when the next player taps **I'm ready**, then the board appears with **their** side at the bottom and their hand face up.
- Given it's your turn, when you look at the top of the screen, then you see how many cards your opponent holds but not what they are.
*Size:* M
*(Depends on question 1. If you pick B, the cover screen is dropped and this becomes size S.)*

### S-01-5: Hand limit: discard down to 5
*Why it matters:* stops anyone hoarding cards, and it's a real decision: which cards do you keep?
*Acceptance criteria:*
- Given you have more than 5 cards when you tap End turn, when the game checks your hand, then it asks you to pick cards to discard and shows how many are left to pick (e.g. "Discard 2").
- Given you're picking, when you tap a card, then it's marked for discard. Tap it again to un-mark it. Long-press still zooms it so you can read it first.
- Given you've marked the right number, when you tap **Confirm**, then those cards fly to your discard pile, its count goes up, and the turn ends.
- Given you have 5 or fewer cards, when you tap End turn, then nothing is asked and the turn just ends.
*Size:* M

### S-01-6: Nothing hidden under the notch or gesture bar
*Why it matters:* phones with a camera notch or a swipe bar at the bottom could cover the edge of the board, especially in full-screen and later in the Android app.
*Acceptance criteria:*
- Given you add the demo to your home screen and open it from there (it opens full-screen), when the board loads, then no counter, button, label or card is under the notch, the status bar or the bottom gesture bar.
- Given phone shapes with a notch and a gesture bar, when the board, the End turn button and the hand-over screen are drawn, then all of them sit inside the safe area. (automated check)
*Size:* S

## Not in this sprint (and why)
- **Installing cards, servers, runs, ICE.** These come in the next two epics. Most cards in hand can't be played yet, which is expected.
- **Playing against the computer.** The AI comes after runs exist, so it has something interesting to do. Hot-seat lets you play a full turn cycle now.
- **Winning by 7 points.** That needs agendas and runs. The only way to win this sprint is the Corp running out of cards.
- **Smoother hand reshuffle at the 6th card.** This is polish, and it's on the backlog.
- **Android app.** This sprint fixes the notch/gesture-bar problem first so the app looks right later.

## Questions for you
1. **When the turn changes, how should the phone hand-over work?** — **Recommended:** A. Options:
   A) A "Pass the phone" cover screen hides both hands until the next player taps "I'm ready" (fair play, one extra tap per turn).
   B) No cover screen. The board flips straight to the next player (faster, but you can see each other's hands).
   C) No cover screen and the board never flips. Corp is always on top and Runner always at the bottom (simplest, but the Corp player plays upside-down from the top).
2. **When your last click is used, should the turn end by itself?** — **Recommended:** A. Options:
   A) No. The End turn button lights up and you tap it, so you get a moment to look at the board.
   B) Yes. The turn ends automatically after your last click (faster, but easy to miss what happened).
3. **Can you end your turn with clicks left over?** — **Recommended:** A. Options:
   A) No, use every click (the genre's standard rule, and it keeps the strategy honest).
   B) Yes, allow ending early (a bit more forgiving for new players).

## Risks
- **Two hands on one small screen.** Showing your hand, the opponent's card count and an End turn button may get crowded on small phones. We'll test on a small phone size as well as the standard one and share screenshots in the demo.
- **The turn loop touches everything built so far.** Sprint 0's "Runner goes first" shortcut gets replaced. The automatic checks from Sprint 0 will tell us right away if we break the draw, zoom or "no clicks" behavior.
- **The demo link still needs Pages switched on** (Settings → Pages → Source: "GitHub Actions"). Until then you can't play the demo on your phone. We'll remind you at the top of the demo PR if it's still off.
