# Sprint 04 demo — The game as a phone app

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-04
File: `overclock-sprint-04-20261113-1556.apk`. If the team pushes again, a newer file replaces it with a later date in its name. Always take the file that's there. The release title says when it was built (e.g. "built 2026-11-13 15:56 UTC"), and the app shows the same date on the board.

This sprint has been through the architect's review and passed QA: **13 checks passed, 0 failed, and 7 can only be checked on your own phone** (the parts we can test on our machines all pass).

## How to install the app (once, about 1 minute)
1. On your phone, open the app link above in Chrome.
2. Under **Assets**, tap the file ending in `.apk`. If Chrome warns that the file may be harmful, tap **Download anyway**.
3. When it has downloaded, tap **Open**.
4. Android may say your browser isn't allowed to install apps. Tap **Settings**, switch on **Allow from this source**, then go back.
5. Tap **Install**.
6. Android may warn that the app is from an unknown developer. That's us: the app isn't from the Play Store. Tap **More details** if you need to, then **Install anyway**.
7. Tap **Open**, or find the **OVERCLOCK** icon (a neon hexagon) with your other apps.

Only install the file from our Releases link above.

## What's new
- **The game is an Android app.** It runs full screen and sideways with no browser bars, and it works without internet. It has its own icon. GitHub builds a new app file automatically every time the team updates this sprint or the main version.
- **Build date on the board.** A small date and time in the right-hand column, just above your side's name, shows which version you have. The web link shows a date too.
- **The Back button no longer throws your game away.** During a game it asks **"Leave the game?"** with **Leave** and **Stay**. If a card is zoomed in, Back just closes the zoom. Once the game is over, Back closes the app.
- **Switching apps is safe.** Go to another app and come back: the game is where you left it and every card is drawn.
- **Hold and slide through your hand.** Hold a card in your hand until it zooms in. Without lifting your finger, slide left or right and the zoom moves from card to card. The card being shown is outlined in your hand. Lift your finger to close the zoom. Nothing is played or spent.
- **Agendas' "when scored" bonuses** (they only happen when the Corp scores the agenda, never when the Runner steals it):
  - **Hostile Takeover:** the Corp gains 7 credits and takes 1 **bad publicity**, a black mark shown next to the Corp's credits as "Bad publicity 1".
  - **Bad publicity:** each time the Runner starts a run, it gets 1 extra credit per bad publicity, for that run only. You'll see "+1 for this run" next to the Runner's credits. These are spent first, and any left over disappear when the run ends.
  - **Priority Requisition:** the Corp's face-down ICE light up with **Rez · free**. Tap one to flip it face up for free, or tap **Skip**.
  - New words are in `docs/GLOSSARY.md`.

## Try this (about 2 minutes for the basics, a few turns more for the bonuses)

Checks marked **[Phone only]** are the 7 that only your phone can show. Our machines can't run a real Android phone.

**S-04-1: Install the game as an app**
- [ ] Criterion 1 (automated check, passed): GitHub makes a new app file with its date. You'll see it on the download page: the title says "built …" with a date and time.
- [ ] Criterion 2 **[Phone only]:** install the app using the steps above. An **OVERCLOCK** icon appears with your apps.
- [ ] Criterion 3 **[Phone only]:** open the app. The board fills the whole screen sideways with no browser bars, and nothing important is hidden under the camera notch or the swipe bar at the bottom. *If something is hidden, a screenshot is perfect.*
- [ ] Criterion 4 **[Phone only]:** turn the phone upright. The game stays sideways, and there's no "Turn your phone sideways" screen.
- [ ] Criterion 5 **[Phone only], later:** you can't check this one yet. The next time we publish a newer file, install it over the top from the same link. It should update without asking you to uninstall first.
- [ ] Criterion 6: look for the small date in the right-hand column, above your side's name. It should match the date in the release title, e.g. "2026-11-13 15:56 UTC". *Compare the app with the release page. The web link has its own date.*

**S-04-2: The app behaves like a proper app**
- [ ] Criterion 1 **[Phone only]:** in the middle of a game, switch to another app and then come back. The game is exactly where you left it, with no blank cards.
- [ ] Criterion 2 **[Phone only]:** press Back, or swipe back from the edge. You should see "Leave the game?". **Stay** keeps playing. Press Back again and tap **Leave**: the app closes.
- [ ] Criterion 3 **[Phone only]:** turn on airplane mode and open the app. It plays normally.
- [ ] Criterion 4 (automated check, passed): the hidden switches our tests use are not inside the app.
- [ ] Criterion 5 (automated check, passed): the web link works as before. You'll notice it anyway if you play in the browser.

**S-04-3: Hold a card and slide to read your whole hand** (works in the app and on the web link)
- [ ] Criterion 1: hold a card in your hand until it zooms in. Slide your finger left and right without lifting it. The zoom moves to each card and that card is outlined in your hand.
- [ ] Criterion 2: keep sliding past the first or last card. The zoom stays on that card.
- [ ] Criterion 3: lift your finger. The zoom closes. Nothing is played, and no clicks or credits are spent.
- [ ] Criterion 4 (automated check, passed): a quick tap on a card still picks it to play, as before.
- [ ] Criterion 5 (automated check, passed): the zoom changes in under 0.1 seconds. *Your call: does the zoom keep up with your finger on your phone?* (See known gap 1.)

**S-04-4: Agendas' "when scored" bonuses**

You play both sides, so you can set these up. Tip: on the Runner's turns, don't run on the server holding the agenda, or you'll steal it.
- [ ] Criterion 1, **Hostile Takeover** (quickest, one Corp turn): on the Corp's first turn, if Hostile Takeover is in the Corp's hand, tap it and put it in a **new server**. Tap it, tap **Advance · 1 credit** twice, then tap **Score**. The Corp's credits go up by 7 and "Bad publicity 1" appears by them. *No Hostile Takeover in the opening hand? It happens in about 6 deals out of 10. On the web link, reload the page for a new deal. In the app, press Back, tap Leave and open it again.*
- [ ] Criterion 2, **bad publicity:** after that, end the Corp's turn. On the Runner's turn tap **Run**, then **HQ**. "+1 for this run" appears by the Runner's credits. When the run ends, it disappears and the Runner's own credits haven't changed.
- [ ] Criterion 3, **Priority Requisition** (takes 2–3 Corp turns): put at least one ICE on any server and leave it face down. Install Priority Requisition in a new server and advance it 5 times over your turns. Take a credit when you run short. Tap **Score**. Your face-down ICE light up with **Rez · free**, and **Skip** appears on the right. Tap an ICE and it flips face up for free, or tap Skip. *It's only 1 card in the Corp's 17-card deck, so it may take a few deals to come up. Scoring Hostile Takeover first gives you plenty of credits.*
- [ ] Criterion 4 (automated check, passed): if the Runner steals one of these agendas, no bonus happens. You can try it: run on the server with Hostile Takeover and steal it. The Corp's credits don't change and no bad publicity appears.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken by QA at sideways phone size (844×390). Other sizes are in `docs/sprints/sprint-04-qa/`.
- [The build date on the board](sprint-04-qa/phone-844x390-00-board-build-date.png) · [The app's own build at phone size](sprint-04-qa/android-app-844x390-01-board.png)
- [Hold and slide through a crowded hand](sprint-04-qa/phone-844x390-01-slide-crowded-hand.png) · [Slide in the app build](sprint-04-qa/android-app-844x390-02-hold-slide.png)
- [Hostile Takeover scored: "Bad publicity 1"](sprint-04-qa/phone-844x390-03-bad-publicity-corp.png) · [Runner's "+1 for this run"](sprint-04-qa/phone-844x390-04-run-only-credits.png)
- [Priority Requisition: Rez · free or Skip](sprint-04-qa/phone-844x390-05-free-rez-choice.png) · [Back button: "Leave the game?"](sprint-04-qa/phone-844x390-06-back-leave-dialog.png)

## Didn't make it
Nothing was dropped: all 4 stories were built and pass QA. Here's what you might notice that isn't finished yet:
1. **The slide may feel a touch slow on a very slow phone** (QA note QA-S4-1). The first time each card shows in the zoom, it is drawn on the spot. At normal speed that takes well under 0.1 seconds. On a test machine slowed down 6 times, it sometimes took just over. If it feels sticky on your phone, tell us. The fix is small: draw the cards ahead of time.
2. **Small text** on the new "Bad publicity 1" / "+1 for this run" notes and on the **Skip** button. Readable, but small. Tell us if you'd like it bigger.
3. **The slide outline is mostly hidden under the zoomed card.** The big zoom covers most of your hand, so you'll see only the edge of the outline.
4. **The Runner's "Corp is choosing" screen won't show in pass-the-phone play.** While the Corp picks its free ICE, the phone shows the Corp's side, so the Runner's waiting message never comes up. It will matter when two phones play each other.
5. **Games aren't saved if Android closes the app fully.** Switching away and back is fine. But if Android shuts the app down, for example after a long time away, the next open starts a new game. Saving games comes later.

Also: once the app works on your phone, we'll close the old "Add to Home Screen" checks from Sprints 1 and 2, because the app replaces them.

## Housekeeping (optional, for you)
The team's connection to GitHub isn't allowed to delete things, so these are left over:
- **A stray app release:** on the Releases page there's an extra pre-release called **app-sprint-04-ui**. It came from a helper branch and was fixed so it won't happen again. Use **app-sprint-04**. To delete the stray one, open it and tap **Delete**.
- **Old branches:** `sprint-02-run-0805`, `sprint-02-run-1005-superseded`, `sprint-02-scheduled-run-alt`, and now the helper branches `sprint-04-engine` and `sprint-04-ui`. To delete them, go to Code → Branches and tap the bin icon next to each one. Nothing is lost: their work is already in `sprint-04`.

## Questions for you
1. **How did the app go on your phone?** — **Recommended answer if all went well:** A. Options: A) Installed, full screen, nothing under the notch. B) It wouldn't install: tell us what the screen said, a screenshot is perfect. C) It works, but something is hidden under the notch or the swipe bar: please send a screenshot.
2. **Does the hold-and-slide keep up with your finger?** — **Recommended:** A. Options: A) Feels instant, leave it. B) Feels a bit sticky, so do the small speed-up next sprint. C) Something else feels off: tell us.
3. **Accept each story?** S-04-1 app install, S-04-2 app behaviour, S-04-3 hold and slide, S-04-4 "when scored" bonuses. — **Recommended:** accept any story whose checks worked for you. If a phone-only check failed, mark just that story "not accepted" with what happened, and we'll fix it first next sprint.

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "S-04-1 accepted, S-04-2 accepted, S-04-3 accepted, S-04-4 accepted. Q1 A, Q2 A."
