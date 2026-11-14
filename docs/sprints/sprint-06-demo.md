# Sprint 06 demo — Play on two phones

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-06
File right now: `overclock-sprint-06-20261113-2359-b23.1.apk`. If the team pushes again, a newer file replaces it. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 5 app, as last time.

**Results:** the architect reviewed everything and fixed two things before QA:
- A timing gap that could have hinted at the Corp's hidden credits.
- Our test shortcuts can no longer be switched on in the real online service.

QA then ran **22 checks: 19 passed, 0 failed, and 3 are waiting on your Cloudflare setup** (below).

## Online play is built, but not switched on yet
Two-phone play works on our machines, where we play it with two pretend phones side by side. It needs the free Cloudflare account in your name before it works for you. **Until then, Play online says "Online play isn't set up yet".** Everything else (the start screen, the "Pass the phone" screen) works right now.

### Switch it on (about 10 minutes, once)
No card needed. Nothing costs money: with no card on file, Cloudflare can't charge you.

1. **Sign up** at https://dash.cloudflare.com/sign-up with your email, then click the link in Cloudflare's email.
2. **Pick your web name.** In Cloudflare, open **Workers & Pages** (left menu, under "Compute"). If it asks for a `workers.dev` subdomain, type a short name (e.g. your name) and save. Write it down.
3. **Copy your Account ID** from the right-hand side of **Workers & Pages**. Keep it in a note.
4. **Make a key for GitHub:** profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → **Use template** next to "Edit Cloudflare Workers". Account Resources: *Include* → your account. Zone Resources: *Include* → *All zones*. Then **Continue to summary** → **Create Token** → **Copy**. (Cloudflare shows it only once.)
5. **Give it to GitHub:** the `overclock` repository → **Settings** → **Secrets and variables** → **Actions**.
   - **Secrets** tab → **New repository secret**: `CLOUDFLARE_API_TOKEN` = the key from step 4.
   - **New repository secret** again: `CLOUDFLARE_ACCOUNT_ID` = the Account ID from step 3.
   - **Variables** tab → **New repository variable**: `OVERCLOCK_SERVER_URL` = `wss://overclock.YOURNAME.workers.dev` (YOURNAME = your web name from step 2).
6. **Reply "Cloudflare is set up"** on this PR.

**Important: never paste the key (step 4) into chat, a PR or a comment.** It only goes into GitHub's Secrets page. The Account ID and web name are fine to share.

**What happens next:** the team rebuilds the game once, so the web link and the app learn the service's address. We'll tell you when it's done (and which app file to install). Then Play online works and you can try the "after Cloudflare setup" checks below.

The full steps (with the same wording) are also in `apps/server/README.md`, "For the owner".

## What's new
- **A start screen.** The game now opens on **Play on this phone** (today's pass-the-phone game) and **Play online** (each player on their own phone).
- **"Pass the phone" screen** (your request). In pass-the-phone games, after **End turn**, a cover screen says "Pass the phone to the Runner. Tap when ready" and hides every card until the next player taps. The same happens when the Corp has to choose **Rez / Don't rez** during the Runner's run: one cover hands the phone to the Corp, another hands it back to the Runner.
- **Online games with a code.** One player taps **Start a game**, picks Corp or Runner, and gets a 4-letter code like **K7QF** plus a **Share** button. The other player taps **Join with code** and types it (or taps the shared link). Each phone sees only its own cards.
- **"Corp is deciding…"** While the Corp chooses Rez / Don't rez online, the Runner's phone says "Corp is deciding…".
- **Comes back by itself.** Switch apps or lose signal for a bit, and the game catches up when you're back. Close the app fully and the start screen offers **Rejoin game K7QF**.
- **No peeking.** The online service runs the rules and sends each phone only what that player may see.

## Try this

### Right away (about 2 minutes)

**S-06-1: Start screen** (first check only)
- [ ] Criterion 1: open the web link or the app. You see **Play on this phone** and **Play online**. Tap **Play on this phone**: you're in a normal pass-the-phone game. (Tap **Play online** now and you'll see "Online play isn't set up yet". That's expected until Cloudflare is set up.)

**S-06-5: "Pass the phone" screen**
- [ ] Criterion 1: tap **End turn**. Before any of the next player's cards show, a screen says "Pass the phone to the Runner. Tap when ready". No cards are visible.
- [ ] Criterion 2: *getting there:* as the Corp, put a piece of ICE (e.g. **Enigma** or **Wall of Static**) in front of HQ, and keep 3 or more credits. As the Runner, run HQ. You should see a cover saying "Pass the phone to the Corp". Tap it, choose **Rez** or **Don't rez**, and a cover says "Pass the phone back to the Runner".
- [ ] Criterion 3 (automated check, passed): tapping the cover shows the board straight away (QA measured under 0.02 seconds, even on a slowed-down machine). *Your feel:* does the board appear the moment you tap?

### After Cloudflare setup (about 5 minutes)
**Tip: you can test this alone.** Use your phone app for one player and a browser on a computer (or a second browser tab) for the other.

**S-06-1: Start and join a game**
- [ ] Criterion 2: on phone 1 tap **Play online** → **Start a game** → **Corp** (or Runner). You see a short code, a **Share** button and "Waiting for the other player…".
- [ ] Criterion 3: tap **Share** and send it in a messaging app. Open the link on the other device: it joins straight away. (The link opens the web game, not the app. See "Things you might notice".)
- [ ] Criterion 4: or on the other device tap **Play online** → **Join with code**, type the code, tap **Join**. Both boards start. The joiner plays the other side.
- [ ] Criterion 5: try a made-up code (e.g. **ZZZZ**). You see "No game with that code" and can type again.

**S-06-2: A whole game across two phones**
- [ ] Criterion 1: each device shows its own side at the bottom and its own hand. The other side's hand and face-down cards show only their backs.
- [ ] Criterion 2: make a move on one device. It shows on the other within about a second. A card the Corp installs arrives face down.
- [ ] Criterion 3: on the device whose turn it isn't, tap your cards or credits. Nothing is played, and it says whose turn it is.
- [ ] Criterion 4: as the Runner, run a server with face-down ICE. The Corp's device shows **Rez / Don't rez**. The Runner's device shows "Corp is deciding…".
- [ ] Criterion 5 (automated check, passed): when the Corp can't afford to rez, the Runner's screen looks the same as when it can. The game answers "Don't rez" for the Corp after a short random pause. (See question 2 for a small catch.)
- [ ] Criterion 6 (automated check, passed): no phone ever receives the other side's hidden cards. QA checked every message both phones got in an 84-move game and in 12 random games.
- [ ] Criterion 7: play until someone wins (fastest: as the Corp, keep tapping your deck to draw until it runs out; the Runner then wins with "R&D is empty"). Both devices show who won and a **Back to start** button.

**S-06-3: Come back after switching away**
- [ ] Criterion 1: mid-game, switch to another app on your phone for a minute, then come back. The board catches up by itself and you carry on.
- [ ] Criterion 2: while one device is away, the other says "Waiting for the other player to come back…".
- [ ] Criterion 3: fully close the app (swipe it away), open it again. The start screen offers **Rejoin game** with your code. Tap it: you're back in your seat.
- [ ] Criterion 4 (automated check, passed): a third device with the code is refused: "That game already has two players". *Try it if you like with a third browser tab.*

**S-06-4: The online service goes live on your account**
- [ ] Criterion 1 (automated check, after setup): when the team updates the game, the online service updates by itself and reports the new version. This runs as soon as your setup is in.
- [ ] Criterion 2: the web link and the app both play online, and a web device can play against the app.
- [ ] Criterion 3: in your Cloudflare account, no card is on file and nothing has been charged.

(Tick each box in your review comment, or say which failed.)

## Screenshots
Taken by QA at sideways phone size (844×390) on our test machines, with two pretend phones. Other sizes are in `docs/sprints/sprint-06-qa/`.
- [Start screen](sprint-06-qa/phone-01-start-screen.png) · [Pick a side](sprint-06-qa/phone-01b-start-pick-side.png) · [Your game code](sprint-06-qa/phone-01c-lobby-code.png) · [Rejoin](sprint-06-qa/phone-11-start-rejoin.png)
- ["Pass the phone to the Runner"](sprint-06-qa/phone-02-cover-to-runner-0.png) · ["Pass the phone to the Corp"](sprint-06-qa/phone-02-cover-to-corp-1.png)
- [Corp's phone mid-game](sprint-06-qa/phone-03-online-corp-mid-game.png) · [Runner's phone, same moment](sprint-06-qa/phone-04-online-runner-mid-game.png)
- [Corp: Rez / Don't rez](sprint-06-qa/phone-05-online-corp-rez-choice.png) · [Runner: "Corp is deciding…"](sprint-06-qa/phone-06-online-runner-corp-is-deciding.png)
- [Not your turn](sprint-06-qa/phone-09-online-runner-not-your-turn.png) · [Waiting for the other player](sprint-06-qa/phone-10-online-waiting-for-other-player.png) · [Reconnecting](sprint-06-qa/phone-12-online-runner-reconnecting.png)
- [Game over, Corp's phone](sprint-06-qa/phone-07-online-game-over-corp.png) · [Game over, Runner's phone](sprint-06-qa/phone-08-online-game-over-runner.png)
- [The app: "Online play isn't set up yet"](sprint-06-qa/android-app-844x390-02-online-not-set-up.png)

## Didn't make it / things you might notice
Nothing was dropped: all 5 stories were built. S-06-4 waits only on your Cloudflare setup.
1. **A game you back out of can still be joined.** If you start a game and tap **Back** in the waiting screen, someone with that code can still join for 2 hours, and they'd wait forever for you. Low risk (they'd need your code). Fix is in the backlog for Sprint 7.
2. **How long the Corp thinks can hint at its credits.** See question 2.
3. **Shared links open the web game, not the app.** As agreed in the proposal. In the app, type the code instead.
4. **The new player's draw isn't animated under the cover.** After the "Pass the phone" screen, the card drawn at the start of the turn is already in the hand; you don't see it fly in. We can add it later if you miss it.
5. **The online status line covers part of the board.** "Reconnecting…" and "Waiting for the other player to come back…" sit over the middle of the board while they show. They go away by themselves.
6. **Nobody has tried two real phones yet.** We tested with two pretend phones on our machines. If anything looks off on real phones, a screenshot from each is perfect.

## Next up (Sprint 7, as you chose)
- **Bug first: an emptied server leaves a blank lane.**
- **Your new hand design:** tap to open the hand, long-press to light up where a card can go, drag to play.
We'll send the Sprint 7 proposal after you've reviewed this one.

## Questions for you
1. **Accept each story?** S-06-1 start screen and codes, S-06-2 a whole game on two phones, S-06-3 come back after switching away, S-06-4 live on your account, S-06-5 "Pass the phone" screen. — **Recommended:** accept S-06-1, S-06-2, S-06-3 and S-06-5 now (the parts you can't try yet passed all our checks), and accept S-06-4 once you've played online. Or accept S-06-4 now on trust if you prefer. Anything that didn't work: say "not accepted" and what happened.
2. **The Corp's thinking time can give a small hint. Fix it?** When the Corp can't afford to rez, the game answers "Don't rez" for it after 1.2–2.4 seconds. A real Corp that *can* pay often thinks longer. So if "Corp is deciding…" stays up longer than that, the Runner could guess the Corp has the credits. — **Recommended:** A. Options:
   A) **Leave it.** It's small, and a slow opponent gives the same hint in the real card game.
   B) **Every rez decision waits a minimum time**, so quick and slow look alike. Fairer, but every run gets a little slower.
   C) **The Corp always taps**, even when it can't pay. No hint, but one more tap for the Corp each time.
3. **Is the "Pass the phone" screen helpful?** — **Recommended:** A. Options:
   A) Keep it on, as now.
   B) Turn it off by default and add a switch to turn it on.
   C) Keep it, but change something (tell us what).

## How to respond
Comment with "accepted" or "not accepted" for each story, plus anything you'd change. A quick example: "S-06-1, S-06-2, S-06-3, S-06-5 accepted. S-06-4 later. Q2 A, Q3 A." And when you've done the setup: "Cloudflare is set up".
