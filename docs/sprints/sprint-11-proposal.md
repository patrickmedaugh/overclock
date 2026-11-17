# Sprint 11 proposal — Clear break buttons, save games

**Reply "approved" to start, or comment on any story to change it.**

## Goal
During a run, every icebreaker button tells you which card it is and what kind of ICE it breaks, and there is no pointless extra step when there is only one subroutine to break. And you can leave a game and pick it up later: on one phone, online, and after Android closes the app.

## Stories

### S-11-1: Break buttons name their card and the ICE type
*Why it matters:* on your Ice Wall run you saw "Break up to 1 · 2 credits" and couldn't tell which card it came from or why it said 1 when Battering Ram says "up to 2".

Each button that comes from a card during a run starts with the card's name. A break button also says which kind of ICE it breaks (barrier, code gate or sentry: each icebreaker only breaks one kind, see [Glossary](../GLOSSARY.md)). Example on Ice Wall: **"Battering Ram: break barrier sub · 2 credits"** and **"Battering Ram: +1 str · 1 credit"**. Question 1 lets you pick the layout.

*Acceptance criteria:*
- Given a run into a rezzed Ice Wall with Battering Ram installed, when the run panel shows, then the break button names **Battering Ram**, says it breaks **barrier** subroutines, and shows its price.
- Given the same run, when you read the strength button, then it names Battering Ram too.
- Given Battering Ram and Gordian Blade both installed, when the run panel shows, then you can tell from each button alone which card it comes from.
- Given any other button that comes from a card during a run, when it shows, then it names its card as well.
- Given Battering Ram on ICE with 2 or more barrier subroutines (e.g. Heimdall 1.0), when the panel shows, then the button says it breaks **up to 2**. On ICE with only 1, it doesn't say "up to 2".
- Given 640×360, your phone (891×296), 844×390 and a computer, when the run panel shows these buttons, then every label is readable in full and every button is thumb size. (automated check)

*Size:* M

### S-11-2: No extra pick step when there's only one subroutine
*Why it matters:* after tapping "Break up to 1" you got a second row with a dimmed "Pick 1 or 2", which made no sense on an ICE with one subroutine.

*Acceptance criteria:*
- Given Ice Wall (1 subroutine) and Battering Ram at enough strength, when you tap the break button, then the subroutine is broken right away and the 2 credits are paid. No pick step.
- Given Heimdall 1.0 (3 subroutines) and Battering Ram, when you tap the break button, then the pick step shows, and its hint says **"Pick up to 2"**, not "Pick 1 or 2".
- Given an ICE where only 1 unbroken subroutine is left, when you tap the break button, then that one is broken directly.
- Given the pick step, when it shows, then its words match what you can really pick. (automated check)

*Size:* S

### S-11-3: Save a game and continue later
*Why it matters:* you asked to save a game when someone has to leave, instead of the game timing out.

The game saves itself after every move. There is no Save button to remember.

*Acceptance criteria:*
- Given a pass-the-phone game in progress, when you close the browser tab or the app and open it again, then the start screen shows **Continue game**, and tapping it brings back the same board, on the same player's turn.
- Given the Android app, when Android closes it in the background and you open it again, then **Continue game** brings the game back.
- Given an online game, when you tap **Leave for now**, then the other player sees "The Runner left for now. The game is saved" (or the Corp), and nothing is lost.
- Given you left an online game, when you open the start screen later on the same device, then **Continue game** shows with its game code, and tapping it puts you back in your seat without typing the code.
- Given a saved online game, when both players come back within the time you choose (question 2), then play goes on where it stopped. After that, it is cleared.
- Given a finished game, when you open the start screen, then there is no Continue for it.
- Given a saved game from before a rules update, when you tap Continue, then you see a plain note that it can't continue on the new version, and you can start a new game (question 3).
- Given a saved game, when it comes back, then the board, hands, credits, clicks and turn are exactly as they were, and no hidden cards are shown to the wrong player. (automated check)

*Size:* L

### S-11-4: Card numbers readable on your phone (first to cut)
*Why it matters:* on your phone, some big cards show "Strength :" with the number cut off (Wall of Static, Ichi 1.0, Corroder).

*Acceptance criteria:*
- Given any card with numbers at the bottom (strength, memory, advancements, points, trash cost), when you hold it to read it on your phone, then every number shows in full.
- Given the small cards on the table, when a label like "Strength" shows, then its number shows too.
- Given every card in both decks, at 891×296, 640×360, 844×390 and a computer, when shown big, then each label and number fits. (automated check)

*Size:* S

## Not in this sprint (and why)
- **Run panel with lots of buttons** (old S-10-4). You asked to wait until you see a problem yourself. S-11-1 makes labels a bit longer, so we'll check they still fit.
- **"Click ×3" on Melange Mining Corp.** and **smooth slide in the hand view** (both P2). Small polish, next screen-polish sprint.
- **More real cards** (rest of the Core Set, toward 45-card decks). After saving works.
- **Keeping a saved game across rules updates.** Bigger work. See question 3.

## Questions for you
1. **How should break buttons show the card name?** — **Recommended:** A. Options:
   A) **One line, card name first:** "Battering Ram: break barrier sub · 2 credits". Long names get shortened on small phones if needed.
   B) **Card name in brackets at the end:** "Break barrier sub · 2 credits (Battering Ram)".
   C) **Card name as a small heading** over that card's buttons. Shorter buttons, but uses more height.
2. **How long should a saved online game wait for you both to come back?** — **Recommended:** A. Options: A) **1 week**. B) 3 days (today's limit). C) 30 days.
3. **What happens to a saved game when we update the rules?** — **Recommended:** A. Options:
   A) **It can't continue.** You see a plain note and start a new one. Updates that only change the screen don't affect saved games.
   B) **Keep it on its old rules** so it always continues. This is more work and would take most of a sprint by itself.
4. **Include the card numbers fix (S-11-4)?** — **Recommended:** A. Options: A) **Yes**, cut first if time runs short. B) Leave it for later.

## Risks
- **Saving must bring back the exact same game.** *What we'll do:* the game is rebuilt from its list of moves, and automated checks compare the saved and restored games move by move.
- **We can't fully copy "Android closes the app" in our tests.** *What we'll do:* we test it in an Android emulator, and the demo notes ask you to try it once on your phone.
- **Longer button labels might not fit on small phones.** *What we'll do:* check every size, and shorten card names (not buttons) if needed.
- **The card numbers bug only shows with your phone's fonts.** *What we'll do:* check on an Android emulator. If we can't confirm it there, we'll say so in the demo notes and ask you to check.
