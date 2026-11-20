# Sprint 14 demo — Your decks, everywhere and online

**▶ Play it in the browser:** https://patrickmedaugh.github.io/overclock/  (works on your phone; hold it sideways)
Backup: a Netlify "Deploy Preview" link shows up in a bot comment on this PR.

**▶ Get the app (Android):** https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-14
File right now: `overclock-sprint-14-20261120-1451-b115.1.apk`. A newer file may replace it if the team pushes again. There is always exactly one file there, so take whichever one you see. Install it over your Sprint 13 app (your decks in the app stay).

> **Heads-up: everyone needs the new version to play online.** The online service already runs Sprint 14. A copy of the game from Sprint 13 or earlier (an older Android app, or a browser tab left open since then) now says **"This copy of the game is out of date. Reload the page, or update the app."** when it tries to start or join a game. The browser link is always the newest (just reload it); for the app, install the Sprint 14 file above. Send a friend the same two links before you play together. An online game already in progress carries on once both of you are on the new version.

**Saved games:** no rules or cards changed this sprint, so **a pass-the-phone game saved in Sprint 13 still continues** (tap **Continue game** as usual). Your Sprint 13 decks are all still there too.

**Results:** QA checked all **22 criteria across 4 stories: all passed, no bugs**, in one round. 21 were checked automatically; **one needs your phone**: linking the Android app and the browser on the real online service (step 4 below). All automatic checks are green.

**Keep your deck code safe.** It is the only key to your decks: there's no email or password behind it. Take a screenshot of it or put it in a note. Anyone with the code can see and change your decks, so share it only between your own devices, never with a friend. If you lose the code *and* every device that has your decks, they're gone.

## What's new
- **Your decks are kept online** (S-14-1). As soon as you have a deck of your own, the Decks screen quietly keeps a copy with the online service and says **"✓ Saved online"** under the title. Offline it says **"Saved on this device · goes online when you're connected"** and catches up by itself. Building and playing never wait for it.
- **The same decks on every device** (S-14-2). On the Decks screen, **My deck code** shows your 12-letter code (like `KX4P-9MTR-QZ7D`; no 0/O or 1/I/L to mix up) with a **Copy** button. On another device tap **I have a deck code**, type it, tap **Link**: your decks show up there, and the decks that device already had are kept too (your choice in Sprint 14, question 2). From then on a change on one shows on the other. Cleared the browser or reinstalled the app? Type the code again and everything comes back.
- **Your own deck in online games** (S-14-3). After **Play online → Start a game** and picking Corp or Runner, you pick your deck (the standard deck is picked already, so it's one tap if you don't care). Your friend sees **"You'll play the Runner"** (or Corp) after typing the game code, and picks theirs. A friend who has no deck of their own goes straight in with the standard deck. The Sprint 13 note "Online games use the standard decks for now" is gone.
- **The online service checks every deck and keeps it secret** (S-14-4). A deck that breaks a real deck rule is refused with a plain reason (e.g. **"This deck isn't ready to play: 43 cards short"**). Your friend's phone never receives your card list, not even after the game (your choice in Sprint 14, question 3): only what the real game shows.

## Try this (about 3 minutes)
You need: your phone's **browser** (the link), the **Android app** (Sprint 14 file), and for part C ideally a **computer browser** as the second player (two tabs on a computer work too).

**A. Your decks go online (phone browser)**
1. Open the link, tap **Decks**. If you still have your Sprint 13 decks here (e.g. "Rototurret 46"), just wait a few seconds. If not: **New Corp deck → Start from the standard deck**, tap **+** on **Rototurret** (46 cards, ✓ Ready to play), then **Back**.
   - [ ] S-14-1, criterion 1: under **Your decks** it says **"✓ Saved online"** in green within a few seconds.
2. Turn on **flight mode**. Open your deck, tap its name and rename it (e.g. "Flight test"), **Back**.
   - [ ] S-14-1, criterion 2 (part 1): the line says **"Saved on this device · goes online when you're connected"** (orange) and the new name is in the list.
   - [ ] S-14-1, criterion 3: still in flight mode, everything works as before: open the deck, tap **+** / **−**, go **Back** to the start screen, **Play on this device** starts. (Back out of the game when you've seen it.)
3. Turn flight mode **off** and open **Decks** again. Don't tap anything.
   - [ ] S-14-1, criterion 2 (part 2): within a few seconds the line changes back to **"✓ Saved online"** by itself.

**B. Link the app and the browser (your phone check)**
4. Still on Decks in the browser, tap **My deck code**.
   - [ ] S-14-2, criterion 1: you see **"Your deck code"**, 12 letters/numbers in three groups (no 0, O, 1, I or L) and a **Copy** button. **Take a screenshot now**: this is the copy you keep safe.
5. Open the **Android app** → **Decks** → **I have a deck code**, type the code (dashes optional), tap **Link**.
   - [ ] S-14-2, criteria 2 and 7: within a few seconds it says **"Linked: your decks are here now"** and the app's Decks list shows your browser decks ("Flight test"…). Any decks the app already had are still there too, and the browser gets them on its next visit to Decks.
6. In the **app**, rename one deck (e.g. "From the app"), **Back**. Switch to the **browser** and open **Decks** (or, if it's already open, wait about 10 seconds).
   - [ ] S-14-2, criterion 3: the browser shows **"From the app"**. (Delete works the same way: a deck deleted on one device disappears from the other.)
7. Pretend you cleared the browser: open the link in a **private / incognito tab** (it starts with no decks of yours). **Decks → I have a deck code**, type the code, **Link**.
   - [ ] S-14-2, criterion 5: every deck comes back, with its exact cards. (Close the private tab afterwards.)

**C. Play online with your own deck (two devices)**
8. On the **computer**, open the link, **Decks → I have a deck code**, type the code (now it has your decks too), **Back**. Tap **Play online → Start a game → Corp**.
   - [ ] S-14-3, criterion 1: **"Pick your Corp deck"**: the standard deck is picked already, your **✓ Ready to play** Corp decks are listed, and an unfinished deck (if you have one) is dimmed with its red note and can't be picked.
   - [ ] S-14-3, criterion 6: no screen on the way says "Online games use the standard decks for now".
9. Tap your **46-card** deck, then **Get the code**.
10. On the **phone app**: **Play online → Join with code**, type the game code.
    - [ ] S-14-3, criterion 2: it says **"You'll play the Runner"** with **"Pick your Runner deck"** and a **Join** button (if you have a Ready Runner deck of your own). Meanwhile the computer says **"Your friend is picking a deck…"**. Tap **Join** with the standard deck picked.
    - [ ] S-14-3, criterion 4: the game starts with your own Corp deck against the standard Runner deck. (If you have no Ready Runner deck, the phone skips the picker and goes straight in: that's how a friend who never built a deck joins.)
11. On the computer (Corp), look at R&D and the "cards in HQ" count at the top.
    - [ ] S-14-3, criterion 3: **R&D + HQ add up to 46**, your deck's size (a standard deck would make 45).
12. On the computer tap **Leave for now**. In **Decks**, change or delete that 46-card deck. Go back and tap **Continue game**.
    - [ ] S-14-3, criterion 5: the game carries on with the same cards as before (R&D + HQ still 46); editing or deleting the deck doesn't touch a running game.
13. Optional, if you play to the end: on the game-over screen there's only **Back to start**.
    - [ ] S-14-4, criterion 3: neither phone offers a way to see the other's deck list (your choice: never).

### Checked automatically (all passed; nothing for you to do)
- S-14-1, criterion 4: damaged or far-too-big deck lists sent to the online service are refused, and nothing already saved changes (11 kinds tried).
- S-14-1, criterion 5: a device that only has the standard decks sends nothing online.
- S-14-2, criterion 4: the same deck changed on two devices while both were offline: the later change wins on both; changes to different decks are all kept; a deck deleted on one stays deleted.
- S-14-2, criterion 6: a wrong code says **"No decks with that code"**; after 5 wrong codes in a row it says **"Too many wrong codes. Try again in 1 minute."** and the box is greyed out (the wait doubles each time, up to 1 hour). Building decks still works meanwhile.
- S-14-3, criterion 3 in full: whole online games with own decks on both sides; every card each player was dealt came from their own deck.
- S-14-4, criterion 1: a deck changed by hand to break a rule (4 copies, too few cards, the wrong side's identity) is refused with the reason in plain words; no game starts with it.
- S-14-4, criterion 2: every message sent to each phone during whole games (30 by the developers, more by QA, every mix of own and standard decks) was searched: the other side's card list never appears, only the cards the real game shows.
- S-14-4, criterion 4: a Sprint 13 copy of the game is told it's out of date instead of breaking. (You may see this yourself if you open your old app before installing the new file.)
- Every new screen at your phone's size (891×296), two other phone sizes and a computer: buttons at least thumb size, text readable, nothing off the screen; upright phones show "Turn your phone sideways". Taps answer in 6–36 thousandths of a second (the limit is 100).

(Tick each box in your review comment, or say which failed.)

## Screenshots
All at your phone's size (891×296). Every size is in `docs/sprints/sprint-14-qa/`.
- **Saved online:** [Decks with "✓ Saved online" and the two code buttons](sprint-14-qa/r1-891x296-decks-saved.png) · [Offline: "Saved on this device…"](sprint-14-qa/r1-891x296-decks-pending.png) · [A device with only the standard decks: no line](sprint-14-qa/r1-891x296-decks-empty.png)
- **Linking:** [My deck code with Copy](sprint-14-qa/r1-891x296-my-deck-code.png) · [I have a deck code](sprint-14-qa/r1-891x296-link-screen.png) · [Linked: both devices' decks](sprint-14-qa/r1-891x296-linked.png) · [After both were offline: newest changes kept](sprint-14-qa/r1-891x296-merged-after-offline.png) · ["No decks with that code"](sprint-14-qa/r1-891x296-wrong-code.png) · [Too many wrong codes: wait](sprint-14-qa/r1-891x296-wrong-code-wait.png)
- **Online games:** [Host picks a Runner deck (unfinished one dimmed)](sprint-14-qa/r1-891x296-host-picker-runner.png) · [Friend: "You'll play the Corp"](sprint-14-qa/r1-891x296-guest-picker-corp.png) · [Host: "Your friend is picking a deck…"](sprint-14-qa/r1-891x296-host-friend-picking.png) · [Refused: "This deck isn't ready to play: 43 cards short"](sprint-14-qa/r1-891x296-join-refused.png) · [Game over, Runner's phone](sprint-14-qa/r1-891x296-game-over-host-runner.png) · [Game over, Corp's phone](sprint-14-qa/r1-891x296-game-over-guest-corp.png)

## Didn't make it / things you might notice
All four stories were built; nothing was dropped (the "within a few seconds if it's already open" part made it: an open Decks screen refreshes about every 10 seconds). Things you might notice:
1. **The picker is skipped when you have no Ready deck of your own for that side** (team call): you go straight in with the standard deck. That's what lets a friend who never built a deck join with no extra tap. See question 2.
2. **A deck deleted on one device can come back** if, *later*, the other device (which hadn't heard about the delete yet, e.g. it was offline) edits that same deck: the most recent change wins, and here the edit is newer than the delete (team call). A deleted deck never comes back on its own or from an old copy. See question 3.
3. **The wrong-code wait is per internet connection, not per device.** If one device at home types 6 wrong codes, your other devices on the same Wi-Fi also have to wait (1 minute the first time) before their decks go online. Nothing is lost; they catch up after the wait.
4. **After a refused deck, the picker goes back to the standard deck being picked.** You only see a refusal with a hand-edited deck (the picker only offers Ready decks), so this is harmless.
5. **A device with its clock set wrong** could make an older change win over a newer one. Rare; phones set their clocks automatically.
6. **Not in this sprint (as planned):** Hearthstone-like movement (recommended for Sprint 15, question 4), sign-in with Google or email (you picked the deck code), sending one deck to a friend, continuing a pass-the-phone game on another device, your own decks against the computer, more identities and cards.

## Questions for you
1. **Accept each story?** S-14-1 decks saved online, S-14-2 same decks on app and browser, S-14-3 pick your own deck online, S-14-4 the service checks decks and keeps them secret. — **Recommended:** accept all four once linking the app and the browser (steps 4–5) works on your phone. If something doesn't, say "not accepted" and what you saw, and we fix it first.
2. **Online: skip the deck picker when you have no Ready deck for that side?** — **Recommended:** A. Options:
   A) **Keep it:** no picker, you go straight in with the standard deck (one less tap for friends who never build decks).
   B) **Always show the picker**, even when the standard deck is the only choice.
3. **A deck deleted on one device, then edited later on the other (before it heard about the delete): what should happen?** — **Recommended:** A. Options:
   A) **Keep it:** the most recent change wins, so the later edit brings the deck back (nothing you just worked on is lost).
   B) **A delete always wins:** once deleted anywhere, the deck stays gone, even if you edited it later on another device.
4. **What should Sprint 15 be?** — **Recommended:** A. Options:
   A) **Hearthstone-like movement** (your wish from Sprint 13): cards that lift when you touch them, tilt as you drag, fly to the board and land; draws, trashes, scores and steals that fly to their piles; runs you can see travel to the server; small shakes and flashes. Never slower: taps still answer at once. A first slice (the hand and playing a card, plus cards flying to and from piles) fits one sprint.
   B) **More cards and identities:** the rest of Haas-Bioroid's and Kate's Core Set cards and more agendas, so your decks get real choices, then a second identity per side.
   C) **Something else** you name (for example, playing your own decks against the computer).

## How to respond
Comment with "accepted" or "not accepted" for each story (S-14-1 to S-14-4), plus anything you'd change. A quick example: "All accepted. 2A 3A 4A."

## Guide to what's in this PR
At the end of the PR description (a plain-language list of every changed file).
