# Sprint 06 proposal — Play on two phones

**Reply "approved" to start, or comment on any story to change it.**

## Goal
You and one other person can each play on your own phone: one of you starts a game and gets a short code, the other types it in (or taps a shared link), and you play a full game. Each phone sees only its own side's hidden cards. Pass-the-phone stays, and gets a "hand the phone over" screen between turns.

**One thing only you can do:** the game needs a small online service, and that needs a free account in your name (question 1). We can build and test everything before that, but you can't try it on two phones until the account exists.

## Stories

### S-06-1: Start screen, start a game, join with a code
*Why it matters:* this is how two phones find each other.
*Acceptance criteria:*
- Given you open the game (web link or app), when it loads, then you see **Play on this phone** and **Play online**. *Play on this phone* starts today's pass-the-phone game.
- Given you tap **Play online**, then **Start a game**, when you pick Corp or Runner (question 3), then you see a short code like **K7QF**, a **Share** button and "Waiting for the other player…".
- Given you tap **Share**, when you pick a messaging app, then it sends a link that opens the game and joins straight away.
- Given the other phone taps **Play online**, then **Join**, when it types the code, then both phones go to the board and the game starts. The joiner plays the other side.
- Given a wrong or old code, when you tap **Join**, then you see "No game with that code" and can try again.
*Size:* M

### S-06-2: Play a whole game across two phones
*Why it matters:* the main thing. Turns pass between phones, and nobody can peek.
*Acceptance criteria:*
- Given an online game, when you look at your phone, then your side is at the bottom, you see your own hand, and the other player's hand and face-down cards show only their backs.
- Given it's the other player's turn, when they do something, then you see it happen on your board within about a second (cards they install arrive face down, as in the real game).
- Given it's not your turn, when you tap your cards or buttons, then nothing is played, and the screen says whose turn it is.
- Given a run reaches face-down **ICE** (the Corp's guards, see [Glossary](../GLOSSARY.md)), when the Corp must decide to rez it, then the Corp's phone shows **Rez / Don't rez** and the Runner's phone shows "Corp is deciding…".
- Given the Corp can't afford to rez, when the run reaches that ICE, then the Runner can't tell that from the Runner's phone. (automated check)
- Given an online game, when a phone receives anything, then it never contains the other side's hidden cards; the online service runs the rules and sends each phone only its own view. (automated check)
- Given someone wins, when the game ends, then both phones show who won and a **Back to start** button.
*Size:* L

### S-06-3: Come back after switching away
*Why it matters:* phones get calls, messages and patchy signal. A game shouldn't die from that.
*Acceptance criteria:*
- Given an online game, when you switch to another app for a minute (or lose signal briefly) and come back, then your board catches up by itself and you carry on.
- Given the other player is away, when you look at your phone, then it says "Waiting for the other player to come back…".
- Given the app was fully closed, when you open it again, then the start screen offers **Rejoin game K7QF** and tapping it puts you back in your seat.
- Given a third phone has the code, when it tries to join a game that already has two players, then it can't take anyone's seat. (automated check)
*Size:* M

### S-06-4: The online service goes live on the free account
*Why it matters:* this is what makes it work outside our test machines.
*Acceptance criteria:*
- Given the account from question 1 exists, when the team updates the game, then the online service updates by itself, the same way the web link and the app do. (automated check)
- Given the web link and the app on the Releases page (**app-sprint-06**), when you play online, then both work, and a web phone can play against an app phone.
- Given the free plan, when you look at your account, then nothing has been charged and no card was needed.
*Size:* S (waits on you; see question 1)

### S-06-5: "Hand the phone over" screen in pass-the-phone mode
*Why it matters:* you asked for it. Today you can't tap End turn without the next player seeing your hand.
*Acceptance criteria:*
- Given pass-the-phone mode, when a player taps **End turn**, then a cover screen ("Pass the phone to the Runner. Tap when ready") hides every card until the next player taps it.
- Given a run in pass-the-phone mode, when the Corp must choose **Rez / Don't rez**, then a cover screen asks for the phone to go to the Corp first, and another one hands it back to the Runner afterwards.
- Given the cover screen, when the next player taps it, then their board shows straight away. (automated check: under 0.1 seconds)
*Size:* S

## Not in this sprint (and why)
- **Hand: tap to open, long-press to light places, drag to play.** Your call: Sprint 7.
- **Bug: an emptied remote server leaves a blank lane.** Small, but this sprint is already our biggest. First in line for Sprint 7.
- **Card abilities on installed cards** (PAD Campaign's credit, Armitage Codebusting…), and real identities and full decks. After two-phone play.
- **Accounts, friends lists, a list of open games, chat.** Not needed for two people with a code.
- **Opening shared links inside the Android app.** A shared link opens the web version; in the app, type the code.
- **Playing against the computer.** Later.

## Questions for you
1. **Which free online service should run the games?** — **Recommended:** A. Options:
   A) **Cloudflare, free plan.** You sign up with your email (no card needed), then follow our short step-by-step to connect your GitHub so updates go there by itself (about 10 minutes). Quick, and it doesn't fall asleep.
   B) **Render, free plan.** You sign in with GitHub (about 5 minutes). But it sleeps when nobody plays, so the first game of the day can take up to a minute to start.
   C) **Your existing Netlify site only.** No new account. But Netlify isn't built for live games: moves arrive a beat late, and lots of play could hit its free monthly limit.
   Either way: nothing costs money without asking you first. We'll post the step-by-step once you approve. Until your account is ready we build and test on our own machines; only S-06-4 waits for it.
2. **OK to play with a friend? This touches our "personal use only" rule.** — **Recommended:** A. Options:
   A) **Private games with friends only.** You invite people with a code; no public list of games, no app store, no promoting it. We'd change the rule to say exactly that.
   B) **Just me for now.** I'll test it with two phones myself. The rule stays as it is.
   C) Something else (tell us).
   We only change the rule when you answer this one. If you approve without answering, we build the same thing and the rule stays as it is until you reply.
3. **Who picks the sides?** — **Recommended:** A. Options: A) The person who starts the game picks Corp or Runner. B) Random each game.

If you approve without answering questions 1 and 3, we'll use the recommended options.

## Risks
- **This is our biggest sprint yet.** If it runs long, **Rejoin after the app was fully closed** (S-06-3, third check) moves to Sprint 7, and we'll say so in the demo.
- **You may need to wait for your sign-up.** If the account isn't ready by the demo, you can still try the "hand the phone over" screen, and we'll show the online part with pictures from our test machines.
- **We can't test on two real phones.** We run two phones side by side on our machines. If something looks off, a screenshot from each phone is perfect.
- **Online play adds one small wait for the Runner.** To keep the Corp's credits secret, the Runner may see "Corp is deciding…" briefly even when the Corp can't rez.
