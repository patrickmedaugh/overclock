# Sprint 14 proposal — Your decks, everywhere and online

**Reply "approved" to start, or comment on any story to change it.**
If you approve without answering the questions, the recommended options apply. One line is enough, e.g. "1a 2a 3a approved".

## Goal
Your decks are kept safe online, so the same decks show up in the phone app and in the browser, and they come back even if the browser's data is wiped. And when you play online with a friend, each of you plays your own deck: the online service checks it follows the real deck rules and never shows it to the other phone.

## How it will work
1. **Nothing to set up on your first device.** As soon as you have a deck of your own, the Decks screen quietly keeps a copy online and says **"✓ Saved online"**.
2. **Link your other device with a deck code** (question 1). On the Decks screen tap **My deck code**: you get a code like **`KX4P-9MTR-QZ7D`**. On the other device (say the Android app) tap **I have a deck code**, type it, and your decks appear there. From then on a change on either one shows up on the other.
3. **Lost the browser's data?** Type the same code again and everything comes back. Keep the code somewhere safe (a screenshot or a note): it's the key to your decks.
4. **Online games:** after **Start a game** (pick Corp or Runner) you pick **your deck**; your friend picks theirs after typing the game code. The standard decks are picked already, so it's one tap if you don't care.

**Words used here:**
- **Deck code**: a 12-letter key that links your devices to the same set of decks. No email, no password, no account name. Anyone who has it can see and change your decks, so share it only between your own devices.
- **Online service**: the small program on Cloudflare (free plan) that already runs your online games. It will now also keep your decks.

**Rule 3 still holds:** there's no public list of players, games or decks. Your decks are reachable only with your deck code, and online games still start only from a game code you send a friend.

## Stories
### S-14-1: Your decks are saved online
*Why it matters:* build a deck once and never lose it, even if the phone or browser forgets it.
*Acceptance criteria:*
- Given you make or change a deck while online, when you look at the Decks screen a few seconds later, then it says **"✓ Saved online"**.
- Given you're offline (e.g. flight mode), when you change a deck, then the change is kept on the device as today and the screen says **"Saved on this device · goes online when you're connected"**; once you're back online it changes to **"✓ Saved online"** without you doing anything.
- Given decks saved online, when you build, play and edit offline, then everything works exactly as in Sprint 13 (the online copy never stops you playing).
- Given the online service gets a deck list that isn't a real deck store (damaged, or far too big), when it's sent, then the service refuses it and nothing already saved is lost. (automated check)
- Given a device with only the standard decks, when you open Decks, then nothing is sent online (no empty lockers for friends who never build a deck). (automated check)
*Size:* L

### S-14-2: The same decks on your phone app and your browser
*Why it matters:* this is "decks that persist": build on the computer, play on the phone.
*Acceptance criteria:*
- Given the Decks screen, when you tap **My deck code**, then you see your code (12 letters in three groups, no 0/O or 1/I/L to mix up) and a **Copy** button.
- Given a second device (e.g. the Android app), when you tap **I have a deck code** and type it, then within a few seconds its Decks screen lists all your decks, and the decks it already had are handled as you choose in question 2.
- Given two linked devices, when you change, rename or delete a deck on one, then the other shows the change the next time you open its Decks screen (or within a few seconds if it's already open).
- Given the same deck was changed on both devices while one was offline, when they reconnect, then the most recent change to that deck is kept, and changes to different decks are all kept.
- Given you cleared the browser's data (or reinstalled the app), when you open Decks and type your deck code, then all your decks come back.
- Given a wrong code, when you type it, then you see **"No decks with that code"**, and after many wrong tries in a row the device has to wait a while before trying again, so nobody can guess codes. (automated check)
- Given your phone (the browser at 891×296 and the Android app), when you link them with the code, then both show the same decks. (you can try it)
*Size:* M

### S-14-3: Pick your own deck for an online game
*Why it matters:* the payoff: play your deck against a friend on another phone.
*Acceptance criteria:*
- Given **Play online → Start a game**, when you've picked Corp or Runner, then you pick a deck for that side (standard deck picked already; your **Ready to play** decks listed; unfinished decks dimmed with their red note), then get the game code as today.
- Given **Play online → Join with code**, when you've typed the code, then you see which side you'll play (e.g. **"You'll play the Runner"**) and pick a deck for that side the same way, then join.
- Given both players picked their own legal decks, when the game starts, then each side is dealt from its own deck (e.g. your R&D and HQ together hold exactly the 46 cards you built).
- Given one player picks a standard deck and the other their own, when the game starts, then that works too; a friend who has never built a deck just taps through with the standard deck.
- Given an online game with your own decks, when you use **Leave for now** and come back, lose the connection, or the online service restarts, then the game continues with the same decks, even if you've edited or deleted the deck since.
- Given the start screens, when you play online, then the Sprint 13 note **"Online games use the standard decks for now"** is gone.
*Size:* M

### S-14-4: The online service checks each deck and keeps it secret
*Why it matters:* no one can bring an illegal deck, and your opponent can't peek at your list.
*Acceptance criteria:*
- Given a deck that breaks a real deck rule (e.g. changed by hand to hold 4 copies, or too few cards), when it's sent to start or join a game, then the service refuses it and the phone says why in plain words (e.g. **"This deck isn't ready to play: 4 copies of Hedge Fund"**); no game starts with it. (automated check)
- Given an online game with your own deck, when your friend's phone receives updates, then it never gets your card list, only what the real game shows (how many cards are in your deck and hand, and each card once it's played, rezzed, accessed or revealed). (automated check over whole games)
- Given an online game ends, when the game-over screen shows, then your friend sees your deck list or not as you choose in question 3.
- Given someone on an older version of the app, when they try to start or join a game with someone on the new version, then they're told to update (**"Update the game to play online"**) instead of something breaking. (automated check)
*Size:* M

## Not in this sprint (and why)
- **Hearthstone-like UI movement** (your new wish: cards that lift, swing and fly between hand, board and piles; satisfying runs and scoring; small impacts). It's in the backlog as a P1 with draft criteria. It touches every screen, so it deserves its own sprint; we recommend it for **Sprint 15**.
- **Sign-in with Google or email.** Only if you pick B or C in question 1; the deck code needs no account and no setup from you.
- **Sharing a deck with a friend** (sending them a copy, or copying a deck list as text to paste elsewhere). Your deck code gives full access to all your decks, so it's not meant for friends. A "send a copy of one deck" feature can come later (backlog P3, import/export).
- **Continuing a pass-the-phone game on another device.** Saved pass-the-phone games stay on the device they were played on; only decks go online.
- **Your decks against the computer.** The start screen doesn't offer a computer opponent yet.
- **More identities and cards.** The builder and the online check work with whatever the game has, so new cards will just appear.

## Questions for you
1. **How should your devices be linked?** — **Recommended:** A. Options:
   A) **A deck code** (12 letters, shown on the Decks screen; type it on your other device). No email, no password, nothing for you to set up. You keep the code safe yourself; if you lose it *and* every device that has your decks, they're gone.
   B) **Sign in with your Google account** on each device. Nothing to remember, but you'd first set up a Google developer project (about 15 minutes, like the Cloudflare setup), and Google sign-in inside the Android app is extra work: about one more sprint before online decks arrive.
   C) **Sign in with your email** (the game emails you a one-time code). Needs an email-sending service account set up by you, and adds about half a sprint.
2. **When you link a device that already has its own decks, what happens to them?** — **Recommended:** A. Options:
   A) **Keep everything:** the decks from both devices end up on both. (If you built "My Corp deck 1" on each, you'll see two; rename or delete one.)
   B) **The linked device takes the other's decks:** decks only on the device you're linking are removed (it asks you first).
3. **After an online game, can your opponent see your full deck list?** — **Recommended:** A. Options:
   A) **No:** they only ever see the cards that came up during the game, as in the real game.
   B) **Yes, both lists:** the game-over screen has a **Their deck** button for each player.
   C) **Each player chooses:** a **Show my deck** button on the game-over screen.

## Risks
- **Your friends need the new version to play online.** Online games now carry decks, so an older Android app can't join a game from the new one (it'll say "Update the game to play online"). The browser link always has the newest version; for the app, install the Sprint 14 file. An online game left running when the update goes out may end with "That game has ended".
- **The deck code is the only key.** If someone gets it, they can change your decks; if you lose it and every device, the decks are gone. The code is long enough that it can't be guessed, and wrong tries are slowed down. We'll remind you on the Decks screen to keep it safe.
- **Deleted decks must stay deleted.** When two devices sync, a deck deleted on one could come back from the other. The service will remember deletions (not just changes) so a deleted deck stays gone; we'll test this with two devices offline and online in turn.
- **Keeping decks secret means a bigger change to how online games start.** Today the online service deals the cards as soon as the first player starts a game; with your own decks it must wait until the second player has picked theirs. We'll test whole online games with every mix of standard and own decks, and check that no card list reaches the other phone.
- **Free plan limits.** Decks are tiny (a few kilobytes each) and stay far inside Cloudflare's free plan; nothing new for you to pay for or set up.
- **Sprint size.** Four stories, one large. If we run short, the live update while both devices are open (S-14-2, criterion 3: "within a few seconds if it's already open") slips first; changes would then show the next time you open Decks.
