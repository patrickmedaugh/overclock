# Sprint 05 demo — Read cards, clearer runs

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-05
File right now: `overclock-sprint-05-20261113-2052-b16.1.apk`. If the team pushes again, a newer file replaces it. There is always exactly one file there, so take whichever one you see.

**This is the first real "update" test.** Install this file **over your Sprint 4 app**. Don't uninstall the old one first. Android should offer to **update** it, and your OVERCLOCK icon stays where it is. Afterwards, the small date on the board should change to the new build's date (e.g. "2026-11-13 20:52 UTC"). Please tell us whether that worked (question 2).

**Results:** the architect reviewed everything, and QA ran **16 checks: 15 passed, 0 failed, and 1 needs your phone** (does the carousel slide feel smooth?).

## What's new
- **Read the cards you find on a run.** When a run shows you cards, hold one to zoom in and read it. Lift your finger and you're back to Steal / Trash / Done.
- **Last run button.** After a run, a **Last run** button appears on the right side of the board. Tap it to see that run's cards again, and hold any of them to read it. It goes away when the Runner's turn ends, so the Corp never sees what you found.
- **The ICE says what it will do.** The old "Let it through" button now says what will happen, e.g. **"Let it fire: lose 1 click, run ends"** or **"Let it fire: take 3 damage"**. (ICE are the Corp's guards in front of a server.)
- **…and what it did.** Afterwards a message names the ICE and what happened, e.g. "Enigma: you lost 1 click. Enigma ended your run." It stays until you tap anywhere (your answer 2A). That tap only closes the message. It doesn't play anything.
- **Hand carousel** (your answer 1A). Hold a hand card so it zooms. The cards either side now show smaller behind it. Slide your finger and they slide past, like flipping through your hand.
- **Also new:** you can hold a discard pile (**Archives** for the Corp, **Heap** for the Runner) or a **score** pill to read the face-up cards in it, and slide left/right through them the same way.
- **Behind the scenes:** the app download can no longer go missing while the team is updating it.

## Try this (about 2 minutes, plus a few turns for the ICE)

**S-05-3: Hand carousel** (quickest, start here)
- [ ] Criterion 1: hold a card in your hand until it zooms. The cards next to it show smaller behind the big card.
- [ ] Criterion 2 **[Your phone only]:** slide your finger slowly left and right. The zoom moves card to card and the cards behind slide past. *Your call: does it feel smooth?* If your phone is slow to draw a frame, the cards behind jump to their new place instead of sliding. That's on purpose, so it never slows your finger down. **Tell us if it never slides at all.**
- [ ] Criterion 3: keep sliding past the first or last card. The zoom stays on that card.
- [ ] Criterion 4: lift your finger. The zoom closes. Nothing is played and no clicks or credits are spent.
- [ ] Criterion 5 (automated check, passed): a quick tap on a hand card still picks it to play, as before.
- [ ] Criterion 6 (automated check, passed): the zoom moves to the next card in under 0.1 seconds, even on a test machine slowed down 6 times. This also fixes the Sprint 4 "first slide can be a touch slow" note.

**S-05-1: Read the cards you find on a run**
*Easiest way:* run on **Archives** once it has a few cards in it. It shows them all at once. Archives fills up when the Corp plays one-shot cards like Hedge Fund, or discards at the end of its turn.
- [ ] Criterion 1: when the run shows the cards you found, hold one. It zooms big enough to read. Lift your finger: the same Steal / Trash / Done choices are still there.
- [ ] Criterion 2: finish the run. Tap **Last run** on the right side of the board. The cards come back in a strip. Hold any of them to read it. Tap outside the strip (or press Back) to close it.
- [ ] Criterion 3: tap **End turn**. On the Corp's turn there's no Last run button.
- [ ] Criterion 4: hold the Runner's score pill after stealing an agenda, or hold Archives once it has face-up cards. The card zooms like a hand card.

**S-05-2: The ICE says what it does**
*How to meet some ICE (you play both sides):* on the Corp's turn, put **Enigma** or **Wall of Static** in front of a server, e.g. HQ, and keep 3 credits to rez it. On the Runner's turn, run that server. When the phone asks the Corp, tap **Rez**. Don't install an icebreaker first, or the Runner may break it. (Neural Katana works too and does 3 damage instead.)
- [ ] Criterion 1: when you meet the ICE, the button says what will happen: "Let it fire: lose 1 click, run ends" (Enigma) or "Let it fire: run ends" (Wall of Static). No "Let it through" anywhere.
- [ ] Criterion 2: tap it. A message names the ICE and what it did, e.g. "Enigma: you lost 1 click. Enigma ended your run."
- [ ] Criterion 3: wait a few seconds. The message stays until you tap.
- [ ] Criterion 4 (automated check, passed): your tap closes the message and the game carries on straight away. Nothing else makes you wait.

**S-05-4: The app download never goes missing**
- [ ] Criterion 1 (automated check, passed): even when the team updates twice in quick succession, **app-sprint-05** always has an app file. QA pushed twice, 25 seconds apart, and checked the page every 5 seconds: the file was always there. *You'll see this yourself: one file, every time you open the page.*
- [ ] Criterion 2 (automated check, passed): if GitHub has trouble publishing the app, the build shows as failed instead of failing silently.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken by QA at sideways phone size (844×390). Other sizes are in `docs/sprints/sprint-05-qa/`.
- [Hand carousel](sprint-05-qa/phone-844x390-10-carousel.png) · [Carousel mid-slide](sprint-05-qa/phone-844x390-11-carousel-sliding.png)
- [Holding a card found on a run](sprint-05-qa/phone-844x390-01-access-hold-to-read.png)
- [Last run strip](sprint-05-qa/phone-844x390-02-last-run-strip.png) · [Holding a card in it](sprint-05-qa/phone-844x390-03-last-run-hold.png) · [Corp's turn: no Last run](sprint-05-qa/phone-844x390-04-corp-seat-no-last-run.png)
- ["Let it fire: run ends"](sprint-05-qa/phone-844x390-05-let-it-fire-label.png) · [Wall of Static message](sprint-05-qa/phone-844x390-06-ice-report.png)
- [Enigma's button](sprint-05-qa/phone-844x390-07-enigma-label.png) · [Enigma's message](sprint-05-qa/phone-844x390-08-enigma-report.png) · [Neural Katana's message](sprint-05-qa/phone-844x390-09-katana-report.png)

## Didn't make it
Nothing was dropped: all 4 stories were built and pass QA. Things you might notice:
1. **Rare wording "Let it fire: nothing happens".** If the Runner has broken the "End the run" part of Enigma and has no clicks left, nothing is left for the ICE to do, so the button says exactly that, and the message says "Enigma: nothing happened." Correct, just odd to read.
2. **The smaller cards behind the zoom may look a bit bright or glowy.** They're meant to sit dimmed in the background. If they pull your eye away from the big card, tell us (question 3, option B).
3. **The release page may show an old commit number.** GitHub's "commit" note next to the release can point at the first build of the sprint, not the newest. The file and the date on it are the newest. Harmless.

## Already in the backlog from your chat today (not in this sprint)
- **Bug: an emptied server leaves a blank lane.** When the Runner steals or trashes the last card of a server with no ICE, that server should disappear from the board. Small fix, P1.
- **"Hand the phone over" cover screen** between turns in pass-the-phone play, so neither player sees the other's cards. P1, fits well alongside two-phone play.
- **PAD Campaign's credit and Armitage Codebusting's ability.** Abilities on installed cards come later, as you chose.
- **Sprint 6 = two-phone play** (your answer 3A). Pass-the-phone stays. We'll send the Sprint 6 proposal after you've reviewed this one.

## Questions for you
1. **Accept each story?** S-05-1 read found cards + Last run, S-05-2 ICE says what it does, S-05-3 hand carousel, S-05-4 downloads never go missing. — **Recommended:** accept any story whose checks worked for you. For anything that didn't, say "not accepted" and what happened, and we'll fix it first.
2. **Did the app update over your Sprint 4 app?** — **Recommended answer if it went well:** A. Options: A) It updated in place, same icon, new date on the board. B) Android asked me to uninstall first, or it wouldn't install: tell us what it said (a screenshot is perfect). C) I haven't tried it yet.
3. **Does the carousel feel right?** — **Recommended:** A. Options: A) Keep it as it is. B) Tweak it: tell us what (e.g. bigger or brighter side cards, fewer of them, a faster or slower slide). C) It never slides on my phone, only jumps.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "S-05-1 accepted, S-05-2 accepted, S-05-3 accepted, S-05-4 accepted. Q2 A, Q3 A."
