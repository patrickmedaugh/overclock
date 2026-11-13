# Sprint 04 proposal — The game as a phone app

**Reply "approved" to start, or comment on any story to change it.**

## Goal
At the end of this sprint the game is an app on your Android phone: full screen, sideways, no browser bars. You can also hold a card and slide your finger to read the rest of your hand, and the agendas' "when scored" bonuses work.

*How you'll get the app:* GitHub (the same place that builds your demo link) makes the app file automatically. On your phone you open a link, tap the file (it ends in `.apk`), and Android asks once to allow installs from your browser. Tap **Allow**, then **Install**. Android may warn that the app is from an unknown developer (that's us; it isn't from the Play Store): tap **Install anyway**. Your web demo link keeps working as well.

## Stories

### S-04-1: Install the game as an app on your phone
*Why it matters:* you asked for it: the browser bars take room from the board.
*Acceptance criteria:*
- Given the team finishes a sprint or updates the main version, when GitHub's automatic build runs, then a new app file appears on the download page (see question 1), with its date. (automated check: the build makes the file)
- Given your Android phone, when you open the download page, tap the file and follow Android's install steps, then an **OVERCLOCK** icon appears with your apps.
- Given you open the app, when the board shows, then it fills the whole screen sideways, with no browser bars and nothing under the camera notch or the bottom swipe bar.
- Given the app is open, when you turn the phone upright, then the game stays sideways (no "Turn your phone sideways" screen in the app).
- Given you already have the app, when you install a newer file, then it updates in place without uninstalling first.
- Given the app, when you open it, then a small build date shows in a corner of the board, matching the date on the download page, so you can tell you have the newest one.
*Size:* L

### S-04-2: The app behaves like a proper app
*Why it matters:* a game you switch away from should still be there, and the Back button shouldn't throw your game away.
*Acceptance criteria:*
- Given a game in progress, when you switch to another app and come back, then the game is exactly where you left it and every card is drawn (none blank).
- Given a game in progress, when you press the phone's Back button (or swipe back), then the app does what you choose in question 2 (recommended: asks "Leave the game?").
- Given airplane mode, when you open the app, then the game works fully: it needs no internet.
- Given the app, when it is inspected, then the hidden switches the team's tests use to drive the game are not in it. (automated check)
- Given the web demo link, when you open it in a browser, then it works as before. (automated check)
*Size:* M

### S-04-3: Hold a card and slide to read your whole hand
*Why it matters:* you asked for it: comparing cards before you decide.
*Acceptance criteria:*
- Given you hold a card in your hand so it zooms, when you slide your finger left or right without lifting, then the zoom moves to the next card that way, and that card is outlined in your hand.
- Given you reach the first or last card, when you keep sliding, then the zoom stays on that card.
- Given you are zoomed in, when you lift your finger, then the zoom closes and nothing is played or spent (see question 3).
- Given a quick tap on a card, when you tap it, then it still picks the card to play, as today. (automated check)
- Given a slide, when the zoom moves to the next card, then it changes in under 0.1 seconds. (automated check)
*Size:* S

### S-04-4: Agendas' "when scored" bonuses
*Why it matters:* two of the Corp's three agendas do more than give points; without that the Corp plays weaker than the real game.
*Acceptance criteria:*
- Given the Corp scores **Hostile Takeover**, when it is scored, then the Corp gains 7 credits and takes 1 **bad publicity** (a black mark shown by the Corp's credits, e.g. "Bad publicity 1").
- Given the Corp has bad publicity, when the Runner starts a run, then the Runner gets 1 extra credit per bad publicity for that run only (shown as "+1 for this run"); any left over disappear when the run ends.
- Given the Corp scores **Priority Requisition**, when it is scored, then the Corp may tap one of its face-down ICE to flip it face up for free, or tap **Skip**.
- Given the Runner steals one of these agendas, when it is stolen, then no bonus happens (bonuses are only for the Corp scoring). (automated check)
*Size:* M

## Not in this sprint (and why)
- **Playing on two phones (multiplayer).** It needs a small server and a plan for how the two phones find each other (for example a game code). We'll bring a short plan with the Sprint 5 proposal for you to choose from. Pass-the-phone mode stays either way.
- **The full hand rework** (face-down hand you open into a big scrolling view, then drag a card to play). Needs a mock-up for you first. The slide in S-04-3 is the first piece of it.
- **Real identities and full real decks.** Next in line after this sprint. They will also make the Corp's points win less rare.
- **Abilities on cards on the table** (Akitaro Watanabe's discount, PAD Campaign's money and the rest). Comes with the real decks.
- **Fewer taps during runs.** Only if you tell us runs feel like too many taps (open Sprint 3 check).
- **Saving a game if Android closes the app.** If the phone closes the app fully (for example after a long time away), the game starts fresh. Saving games comes later.

## Questions for you
1. **Where should the app file go?** — **Recommended:** A. Options:
   A) The repo's **Releases** page: one link on your phone, tap the `.apk`, done. Like your demo link, anyone who found the repo could download it; it isn't listed in any store or advertised.
   B) The automatic-build page on GitHub. You must be signed in to GitHub, and the file comes in a zip that you open with your phone's Files app first. Extra steps each time.
2. **What should the phone's Back button do during a game?** — **Recommended:** A. Options:
   A) Ask "Leave the game?" with **Leave** / **Stay**.
   B) Nothing during a game; Back only works on the "game over" screen.
   C) Close the app straight away, like most apps (the game is lost).
3. **When you lift your finger after sliding through your hand, what should happen?** — **Recommended:** A. Options:
   A) The zoom closes; nothing is picked. Reading never plays a card by accident.
   B) The card you ended on gets picked, ready to tap where it goes. One tap fewer, but easy to pick by mistake.

*No answer needed:* once the app works on your phone, we'll drop the old "Add to Home Screen" check from Sprints 1 and 2, since the app replaces it.

## Risks
- **We can't try the app on a real phone ourselves.** Our machines check the game at phone sizes and build the app file automatically, but the first real install is on your phone. If something goes wrong, tell us what the screen says (a screenshot is perfect) and we'll fix it the same day where we can.
- **Updates may refuse to install** ("App not installed") if the app's built-in signature changes between versions. We'll sign every version the same way so updates install over the old one. If it still happens, uninstall the old app first; you lose nothing, as games aren't saved yet.
- **Android's warnings.** Installing from outside the Play Store always shows a warning or two. That's normal for a personal app. Only install the file from our download link.
- **Bad publicity is a new rule** that touches every run (credits that last only one run). We'll write it into our rules notes first and test it without the screen. If the sprint runs short, S-04-4 moves to next sprint first; the app comes first.
