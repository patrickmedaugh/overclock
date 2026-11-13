# Sprint 05 proposal — Read cards, clearer runs

**Reply "approved" to start, or comment on any story to change it.**

## Goal
Fixes for the three things you noticed while playing Sprint 4. You can read every card you find on a run, you always see what a piece of **ICE** (the Corp's guards in front of a server) did to you, and your hand opens up so it's easier to read and pick from. Updates arrive as usual: the new app is on the Releases page under **app-sprint-05**, and your web link gets them too.

## Stories

### S-05-1: Read the cards you find on a run
*Why it matters:* you asked for it. Today a card you find flashes by and is gone before you can read it.
*Acceptance criteria:*
- Given a successful run shows the cards you found, when you hold one of them, then it zooms in big enough to read all its text. When you lift your finger you're back to the same choices (Steal / Trash / Done).
- Given the run has ended, when you tap **Last run** on the right side of the board, then the cards that run found show again and you can hold any of them to read it.
- Given the Runner's turn ends, when the phone passes to the Corp, then **Last run** goes away, so cards from the Corp's hand don't stay on show.
- Given a card the Runner stole, or a card in Archives that's face up, when you hold it, then it zooms in like a hand card.
*Size:* M

### S-05-2: Say what the ICE does before and after you "let it through"
*Why it matters:* you asked for it. Today your run can end with no explanation.
*Acceptance criteria:*
- Given you meet a piece of ICE you can't or don't want to break, when you look at the button, then it says what will happen, e.g. **"Let it fire: run ends"** or **"Let it fire: take 3 damage"**. It no longer just says "Let it through".
- Given you let it fire, when its effect happens, then a message names the ICE and what it did, e.g. "**Enigma** ended your run". If your run ends, the message says so.
- Given that message, when it appears, then it stays until you tap anywhere (see question 2), so you have time to read it.
- Given the message is showing, when you tap, then the game carries on straight away. Nothing else makes you wait. (automated check)
*Size:* M

### S-05-3: Open your whole hand to browse and pick (or a carousel; see question 1)
*Why it matters:* you asked for it. Comparing cards should feel natural, and the zoom shouldn't hide which card you're on.
*Acceptance criteria (written for option B, our recommendation):*
- Given your turn, when you tap your hand, then your whole hand opens big across the screen with every card readable.
- Given the open hand, when you swipe left or right, then the cards scroll, and every card in your hand can be reached.
- Given the open hand, when you tap a card, then the view closes and that card is picked, with the places it can go lit up as they are today. You play it by tapping a lit place, as now.
- Given the open hand, when you tap outside the cards (or press Back), then it closes and nothing is played or spent.
- Given you hold and slide on your hand on the board, when you do it, then it still works as in Sprint 4.
- Given a slow phone, when cards zoom or the hand opens, then it answers in under 0.1 seconds. (automated check, including the 6× slowed-down test from Sprint 4 QA)

**Owner chose A (carousel) on PR #13, 2026-11-13.** The criteria below replace the option-B list above for this sprint:
- Given you hold a card in your hand so it zooms, when it zooms, then the cards either side of it show smaller behind the zoomed card.
- Given you slide your finger left or right, when the zoom moves to the next card, then the cards behind slide past with it, so it feels like flipping through your hand.
- Given the first or last card, when you keep sliding, then the zoom stays on it (as in Sprint 4).
- Given you lift your finger, when the zoom closes, then nothing is played or spent (as in Sprint 4).
- Given a quick tap on a hand card, when you tap it, then it still picks the card as today. (automated check)
- Given a slow phone, when the zoom moves to the next card, then it answers in under 0.1 seconds. (automated check, including the 6× slowed-down test from Sprint 4 QA)

*Original note on option A:* while you hold and slide, the cards either side show smaller behind the zoomed card and slide past as you move. Tapping a card still picks it as today.
*Size:* L for B, M for A

### S-05-4: Housekeeping: app downloads that never go missing
*Why it matters:* small fix so the app file is always there when you go to get it.
*Acceptance criteria:*
- Given the team updates a sprint twice in a row, quickly, when you open the Releases page, then **app-sprint-05** always has an app file to download. (automated check)
- Given GitHub has trouble publishing the app, when that happens, then the build shows as failed so the team sees it, and it doesn't fail silently. (automated check)
*Size:* S

## Not in this sprint (and why)
- **Playing on two phones.** See "Looking ahead" below. It needs its own sprint. Pass-the-phone mode stays either way.
- **Hand face down on the board, and dragging a card to play it.** These are the rest of your earlier "hand rework" idea. They come after the open-hand view, once you've tried it.
- **Real identities and full real decks.** Next in line (see question 3).
- **Fewer taps during runs.** Clearer messages come first. Tell us afterwards if runs still feel like too many taps.
- **Saving a game if Android closes the app.** Later.

## Looking ahead: multiplayer (two phones)
You asked for a plan. Here's the short version. **Pass-the-phone stays**: a start screen will offer *Play on this phone* or *Play online*.

How the two phones find each other:
- **A) Game code (recommended).** One phone taps *Host*, and the game shows a short code like **K7QF**. The other phone taps *Join* and types it in. There's also a *Share* button that sends the code as a link through any messaging app. Tapping the link joins straight away.
- **B) Invite link only.** Same as A without a code to type. You always need a messaging app.
- **C) Same Wi-Fi only.** No online service, but phones often can't find each other this way, and it doesn't work away from home.

What it takes: a small online service that runs the game, so neither phone can peek at the other's hidden cards. We'll aim for a free hosting plan, and we'll ask you before anything costs money or needs an account. It also means reconnecting if a phone loses signal. Expect about 2 sprints. Since you'd be playing with someone else, we'll also check our "personal use only" rule with you first.

## Questions for you
1. **Hand browsing: which feels right?** — **Recommended:** B (it's what you described on the Sprint 3 proposal). Options:
   A) **Carousel:** while you hold and slide, the neighbouring cards show behind the big one, like flipping through a fan of cards.
   B) **Open hand:** tap your hand and it opens across the screen. Swipe left/right through big readable cards, then tap one to pick it.
   Not sure? Reply "show me" and we'll post a quick picture of both before building.
2. **How long should the "what the ICE did" message stay?** — **Recommended:** A. Options: A) Until you tap anywhere. B) It fades by itself after 3 seconds.
3. **What should Sprint 6 be?** — **Recommended:** A. Options: A) Two-phone play (game code, option A above). B) Real identities and full real decks first, then two-phone play.

If you approve without answering, we'll use the recommended options.

## Risks
- **The open hand adds a tap** (open hand, then pick card, then place). If playing feels slower, tell us. We can keep a quick way to pick a card straight from the board.
- **We can't try the app on a real phone.** We check phone sizes on our machines. If anything looks wrong on yours, a screenshot is perfect.
