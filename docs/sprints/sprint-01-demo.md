# Sprint 01 demo — Take turns on one phone

> **Already done:** you approved and merged PR #5 ("Sprint 01") on 2026-11-12, before we had posted these notes. We wrote them afterwards so there's a record. The checklist below is still here if you want to try it. The two things still open (the "Add to Home Screen" check on your phone, and whether the faster discard animation is easy to follow) are now quick questions in the Sprint 2 proposal. Nothing here needs a reply.

**▶ Play it:** https://patrickmedaugh.github.io/overclock/  (works on your phone)
Backup link: https://overcloc.netlify.app

## What's new
- **The Corp goes first, then turns alternate.** The Corp gets 3 clicks (actions) and a free card each turn. The Runner gets 4 clicks and no free card.
- **Two basic moves for both players:** tap your credits for +1 credit, or tap your deck to draw a card. Each one uses a click.
- **End turn button.** It glows once your clicks are used up. You can also end early (leftover clicks are lost), as you asked.
- **Both players on one screen.** When the turn changes, the board flips so the player whose turn it is sits at the bottom with their hand showing. The other player's hand shows only as a number.
- **Hand limit.** If you end your turn holding more than 5 cards, you pick which ones to throw away ("Discard 2"), then tap Confirm.
- **Fits around the camera notch and the swipe bar** on phones, including when opened full-screen from your home screen.
- **New game button** on the game-over screen, so you don't have to reload the page.

New words (click, hand limit, safe area, hot-seat) are explained in `docs/GLOSSARY.md`.

## Try this (≈2 minutes)
Open the link on your phone held upright.

**Turns (S-01-1)**
- [ ] Criterion 1: on load, the banner says **TURN 1 · CORP · 3 clicks left** and the Corp (bottom) holds 6 cards.
- [ ] Criterion 2: tap **End turn** (pick and confirm a card if asked). The banner now says **RUNNER · 4 clicks left**, and the Runner's hand stays at 5 cards.
- [ ] Criterion 3: tap **End turn** again. The Corp is back with 3 clicks and one more card in hand than it had before.
- [ ] Criterion 4: at any point, the big banner and the bottom row (in the player's colour) make it obvious whose turn it is and how many clicks are left.
- [ ] Criterion 5 (automated check): if the Corp has to draw its free card from an empty deck, the game ends with "Runner wins: the Corp ran out of cards". This takes many turns by hand, so the tests cover it.

**Gain a credit, draw a card (S-01-2)**
- [ ] Criterion 1: tap your credits. The number goes up by 1 with a little pop, and you have one click less.
- [ ] Criterion 2: tap your deck. A card flies into your hand and you have one click less. Try it on both the Corp's and the Runner's turn.
- [ ] Criterion 3: use up all your clicks, then tap credits or deck again. Only a small "No clicks left" hint appears.
- [ ] Criterion 4 (automated check): the other player's deck and credits (top of the screen) do nothing when tapped.

**End turn (S-01-3)**
- [ ] Criterion 1: the End turn button is always there and lights up brightly once your clicks are used.
- [ ] Criterion 2: tap End turn with clicks left. The turn ends anyway.
- [ ] Criterion 3: use your last click and wait a few seconds. The turn does not end until you tap End turn.
- [ ] Criterion 4: the turn change takes well under a second, with no extra screen to tap through.

**Both players on one screen (S-01-4)**
- [ ] Criterion 1: after each turn change, the new player's side is at the bottom with their cards face up, straight away.
- [ ] Criterion 2: the top of the screen shows how many cards your opponent holds ("5 cards in hand"), not what they are.

**Hand limit (S-01-5)**
- [ ] Criterion 1: on the Corp's first turn, tap the deck once (7 cards), then End turn. It asks you to pick and shows **Discard 2**.
- [ ] Criterion 2: tap a card to mark it, tap again to unmark it. Hold your finger on a card: it zooms so you can read it, without marking it.
- [ ] Criterion 3: mark 2 and tap **Confirm**. The cards fly to your discard pile, its count goes up, and the turn passes.
- [ ] Criterion 4: with 5 cards or fewer, End turn just ends the turn and asks nothing.

**Notch and swipe bar (S-01-6)**
- [ ] Criterion 1 (your phone check): add the link to your home screen (browser menu → "Add to Home Screen"), open it from there (it opens full-screen), and check that nothing sits under the camera notch, the top status bar or the bottom swipe bar.
- [ ] Criterion 2 (automated check): the tests draw the board on phone shapes with a notch and a swipe bar, and everything stays clear of them.

## Screenshots
Team screenshots in `docs/sprints/sprint-01-screens/`:
- `01-corp-turn-start.png` — new game, Corp's turn, 3 clicks, 6 cards
- `02-end-turn-glowing.png` — clicks used up, End turn lit
- `03-discard-picker-marked.png` — hand limit, cards marked for discard
- `04-runner-turn-after-flip.png` — Runner's turn after the board flips
- `05-game-over.png` — "Runner wins: the Corp ran out of cards"
- `06-board-360x640.png` — the board on a small phone
- `07-notch-safe-area.png` — a phone with a notch: nothing hidden

QA's full playthrough (phone and desktop) in `docs/sprints/sprint-01-qa/`, for example:
- `phone-390x844-05-no-clicks-hint.png` — "No clicks left"
- `phone-390x844-08-long-press-zoom-while-picking.png` — zooming a card while picking discards
- `phone-390x844-13-runner-ends-early-hand-limit-discard-1.png` — Runner ends early with 6 cards
- `r2-phone-390x844-runner-discard-pile-closeup.png` — discard pile: card name readable, count in the corner

## Didn't make it
- Nothing was dropped. All 6 stories were built and passed QA (20 of 21 checks; the 21st is the "Add to Home Screen" check, which needs your phone).
- Two small problems QA found were fixed before the merge: End turn sometimes ignored a tap for about 0.7 seconds after a big discard (now about 0.3 to 0.5 seconds), and the discard pile's count covered the top card's name (moved to the corner).
- Making the discard animation faster for the first fix (0.25 → 0.18 seconds) changed how it feels. We'd like your view on that (now in the Sprint 2 questions).

## Questions for you
None here. The two open checks are in the Sprint 2 proposal:
1. "Add to Home Screen" on your phone: is anything hidden?
2. Is the faster discard animation still easy to follow?

## Results
- QA: 20 of 21 acceptance criteria passed; 1 left for your phone (S-01-6, criterion 1). Full report: `docs/sprints/sprint-01-qa.md`.
- 2026-11-12: you commented "Approved" and left an "approved" review on PR #5, then merged it. **All Sprint 1 stories (S-01-1 to S-01-6) are accepted.**
- The demo link (GitHub Pages) deployed from `main` successfully after the merge.

## How to respond
Nothing needed. If something in the checklist doesn't work for you, mention it on the Sprint 2 proposal PR and we'll add it to the backlog.
