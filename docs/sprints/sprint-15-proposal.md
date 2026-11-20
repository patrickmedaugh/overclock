# Sprint 15 proposal — Cards that move like Hearthstone

**Reply "approved" to start, or comment on any story to change it.**
If you approve without answering the questions, the recommended options apply. One line is enough, e.g. "1a 2a 3a 4a approved".

## Goal
Cards stop popping in and out of place and start moving like real cards, the way they do in Hearthstone. Cards in your hand lift when you touch them and tilt as you drag. A card you play flies to the board and lands. Drawn, trashed, scored and stolen cards fly to and from their piles. The game never gets slower: a tap still answers at once. And the game gets a play link and an Android download that keep working after your GitHub repo goes private.

## What you'll feel (in plain words)
- **Touch:** in the open hand view, a card **rises and grows a little** the moment your finger lands on it. When it lifts out (hold, as today) it **follows your finger and leans** the way you move, like a card held by one corner.
- **Play:** let go on a lit place and the card **flies there and lands with a small settle**, instead of appearing in place. The Corp's face-down cards fly face down. One-shot cards (like Sure Gamble or Hedge Fund) fly to the middle, show for a moment, then go to the discard pile.
- **Piles:** a drawn card **flies from your deck into your hand** and the other cards slide aside. Trashed and discarded cards fly to Archives or the Heap. A scored or stolen agenda flies to its score pile, and the points **tick up with a short glow**. Each pile's count changes when the card lands, not before.
- **Never in your way:** if you tap while something is moving, the movement **jumps to its end at once** and your tap counts.

We'll tune the movement on **your phone's size (891×296)** first, then check the other sizes.

**Words used here:**
- **Hand view**: the big side-scrolling view of your hand that opens when you tap your hand (Sprint 5 and 7).
- **Lit place**: where a lifted card can go (e.g. a server or your rig), lit up while you hold it.
- **Pile**: the deck (R&D / Stack), the discard pile (Archives / Heap) and the score pile of each side. See `docs/GLOSSARY.md`.

## Stories
### S-15-1: Cards lift and lean in your hand
*Why it matters:* the first thing you touch is a card, so it should feel like picking one up.
*Acceptance criteria:*
- Given the hand view is open, when you press the big card in the middle, then within a tenth of a second it rises and grows a little, and it settles back if you let go without holding.
- Given you hold a card until it lifts out (as today), when you drag it, then it stays under your finger and leans in the direction you move (more lean when you move faster), and straightens up when you stop.
- Given you let go of a card away from any lit place, when it goes back, then it glides back into the hand smoothly instead of jumping.
- Given the hand view, when you swipe from card to card, then the cards slide smoothly into place instead of jumping (your Sprint 9 wish, "smooth animation in the hand view").
- Given a computer with a mouse, when you point at a card in your hand, then it lifts a little and leans slightly toward the pointer.
*Size:* M

### S-15-2: Played cards fly to the board and land
*Why it matters:* this is the moment in Hearthstone that feels best: the card travels and lands with weight.
*Acceptance criteria:*
- Given you drop a card on a lit place, when it's played, then it flies from your finger to its spot on the board and lands with a small settle (a quick shrink-and-bounce), instead of appearing there.
- Given the Corp installs a card face down (in pass-the-phone or online), when it lands, then it flies face down, so the Runner never sees its face.
- Given you play a one-shot card (an event or operation, e.g. Sure Gamble), when it's played, then it flies to the middle of the table, shows for a moment, then flies to your discard pile.
- Given you install or play from a button instead of dragging (e.g. on a computer), when it happens, then the card flies from your hand the same way.
- Given the other player plays a card (the other phone online, or after passing the phone), when you next see the board, then that card flies in from their side instead of appearing.
*Size:* M

### S-15-3: Cards fly to and from the piles
*Why it matters:* you can follow where every card went, and scoring feels like a reward.
*Acceptance criteria:*
- Given you draw a card (the click to draw, or the draw at the start of the Corp's turn), when it arrives, then it flies from your deck into your hand and the other hand cards slide aside to make room.
- Given a card is trashed or discarded (an accessed card trashed, Bank Job emptied, a card discarded at the end of the turn), when it leaves, then it flies to the right discard pile (Archives or the Heap), and the pile's count goes up as it lands.
- Given the Corp scores an agenda or the Runner steals one, when it happens, then the agenda flies to that side's score pile, and the points counter ticks up with a short glow as it lands.
- Given several cards move at once (e.g. Accelerated Beta Test sending cards to Archives, or discarding several cards down to your hand size), when they move, then they go one just after another in a quick ripple, and the whole thing takes no more than about half a second.
*Size:* M

### S-15-4: Never slower than today
*Why it matters:* movement is only nice if it never gets in your way (the "snappiness budget" in our team rules).
*Acceptance criteria:*
- Given any card is moving, when you tap anything, then the movement jumps to its end at once and your tap is answered within a tenth of a second. (automated check, at 891×296, 844×390, 640×360 and on a computer)
- Given any movement this sprint, when it plays, then nothing stops you from playing for more than 0.6 seconds. (automated check)
- Given your phone (891×296, browser and the Android app), when you play a few turns, then the movement looks smooth (no visible stutter) and nothing feels slower than in Sprint 14.
- Given an upright phone, when you turn it sideways mid-movement, then cards end up in the right places (nothing left floating). (automated check)
- Given pass-the-phone and online play, when the same thing happens, then the same movement plays in both (and in the Android app).
*Size:* S

### S-15-5: A play link and app download that keep working with a private repo
*Why it matters:* your repo is going private, which switches off the GitHub play link and puts the app downloads behind a GitHub sign-in; you and your friends need a link that just works.
*Acceptance criteria:*
- Given your repo is private, when you open the new play link on your phone (no GitHub sign-in), then the game loads and **Play online** works.
- Given the team pushes a new build, when you reload the play link, then it shows the newest build, including the sprint waiting for your review (as the GitHub link did), with its "Built …" date.
- Given a phone with no GitHub account (yours or a friend's), when you tap **Get the Android app** on the start screen (or the link in the demo notes), then the newest app file downloads and installs over your old app, keeping your decks and saved games.
- Given the Android app, when you share an online game code, then the link it sends opens the new play link, not the old GitHub one.
- Given the repo is private, when the team pushes, then no check fails because GitHub's play link is switched off. (automated check)
- Given the Sprint 15 demo notes, when you open them, then every link in them works without signing in to GitHub.
*Size:* M (putting the web game on the new address is small; the app download without a sign-in and moving every link over is most of the work)

## Not in this sprint (and why)
- **Runs you can see** (something travelling to the server, ICE popping forward when met, subroutines cracking when broken, accessed cards flipping toward the Runner). The next slice of the same wish; runs have the most screens, so they get their own sprint. In the backlog as P1.
- **Impacts** (a short shake on damage, a flash when ICE ends the run, small sparks). A later slice; they work best once runs move.
- **Sounds.** Only if you pick B in question 2. Otherwise they come with the impacts slice, with a mute switch.
- **Card backs, board art and new card pictures.** This sprint changes how things move, not how they look standing still.
- **More cards and identities, and playing against the computer.** Still in the backlog; the movement will apply to new cards automatically.

## Questions for you
1. **How should the movement feel?** — **Recommended:** A. Options:
   A) **Quick and snappy:** each flight takes about a quarter of a second; lively but never makes you wait. Close to Hearthstone, a little faster because a turn here has more actions.
   B) **Slower and showier:** about half a second per flight, bigger bounces. Looks grander; with many actions per turn it can start to feel slow.
   C) **Subtle:** short slides with little bounce or lean. Calm, but less of the Hearthstone feel you asked for.
2. **Sound this sprint?** — **Recommended:** A. Options:
   A) **Not yet:** silent movement now; a small set of sounds (pick up, land, draw, score) comes with the impacts slice, with a mute switch.
   B) **A few soft sounds now** (pick up, land, draw, score) with a mute switch. Adds work, so S-15-4's phone smoothness checks get less time.
3. **Which address should the play link use?** — **Recommended:** A. Options:
   A) **https://overcloc.netlify.app** (your Netlify site, already working, and Play online already works there). Nothing new for you to sign up for. We may need one key from your Netlify account so the newest sprint build shows there too (about 5 minutes; we'll write the steps).
   B) **A Cloudflare address** (like `overclock.pages.dev`, the same account as your online service). One place for everything, but you'd tick one more permission on your Cloudflare key, and it's a new address to remember.
   C) **Keep the GitHub address** by moving your GitHub account to the paid plan (GitHub Pro, about $4 a month), which keeps the play link working for private repos. No change for you; app downloads would still need a GitHub sign-in.
4. **Where should the Android app download live?** — **Recommended:** A. Options:
   A) **A "Get the Android app" button on the play site:** anyone with the play link can download the app file, the same people who can already play in the browser. Nothing is listed anywhere public (team rule 3 still holds).
   B) **Keep it on GitHub:** you sign in to GitHub on your phone to download; friends get the file from you directly (e.g. you send it in a message).

## Risks
- **Between making the repo private and S-15-5 going live, the GitHub play link stops working.** The Netlify site (https://overcloc.netlify.app) and the Netlify test link on each pull request keep working, and Play online keeps working there, so you can use those in the meantime. We'll do S-15-5 first in the sprint so the demo has the new links from day one.
- **Private repos get limited free time for automatic checks.** On GitHub's free plan a private repo gets 2,000 minutes of automatic checks a month; our full set of screen tests uses a big share of that on a busy day. We'll run the full set only where it matters (sprint branches and pull requests, not every small note) and track the monthly use, so checks don't stop near the end of the month. If it still gets close, we'll tell you before anything costs money.
- **Movement could stutter on your phone.** Many cards moving at once can be heavy for a phone's browser. We'll test on your phone's size with a slowed-down processor, keep at most a few cards moving at once, and cut showy extras (bounce, lean) before smoothness.
- **Screen tests have to wait for movement.** Our automatic tests tap the screen and check what's there; with movement, a card may still be on its way. The tests will switch movement off or wait for it to finish, and separate tests will check the movement itself (timings, and that a tap finishes it).
- **Online and pass-the-phone must not leak anything.** A face-down card must fly face down, and the Runner must not learn which card the Corp drew. Movement only uses what each side's screen already knows; the existing "no hidden cards leak" checks will cover it.
- **Sprint size.** Five stories, four of them medium. If we run short, the mouse-hover lean (S-15-1, last criterion) and the other player's cards flying in (S-15-2, last criterion) slip first; both would then come with the runs slice.

---

## Added after the demo (owner, 2026-11-20)
After playing the Sprint 15 demo (PR #34, 21:54 UTC) you said: *"it doesn't quite feel like hearthstone … you flick through the cards with left and right but once you hold the card the hand minimizes and then there's an arrow that shows you where you can put the cards … it's still kind of using the old controls where you tap on a card in order to play it and I think you should hold the card in order to see the screen of places you can play it"*. In chat you chose **"Fix it in Sprint 15"**, so this story is added to this sprint and you get a new demo on the same PR (#34). The five stories above are not accepted until then.

### S-15-6: Hold a card to play it (Hearthstone-style)
*Why it matters:* in Hearthstone you pick a card up and put it down where it goes; today you still tap a card to play it, and that's the main thing that doesn't feel like Hearthstone yet.

**What changes for you:**
- **Tapping the big card no longer plays it.** To play a card you **hold it** (about a quarter of a second) and drag it to a lit place. This replaces the old "tap the card, then tap a lit place" way of playing from your hand.
- **To read a card, tap.** A tap on your hand opens the hand view, where the card in the middle is shown big, as today. Flick left and right to read the others. Tapping the big card just shows a short tip, "Hold to play".
- **Holding is quicker than before:** about **0.25 seconds** (it was 0.35), so picking a card up feels immediate but a tap or a flick never picks one up by mistake.
- **Nothing else changes:** buttons on cards already on the table (Rez, Advance, a card's own abilities), clicking your deck to draw, runs, and picking cards to discard at the end of your turn all work as today.

**Words used here:**
- **Lit place**: a place on the table where the card you're holding can go (a server, a new server, your rig, or the middle for one-shot cards), lit up while you hold it.
- **One-shot card**: an event (Runner) or operation (Corp), e.g. Sure Gamble or Hedge Fund: it does its thing and goes to the discard pile.

*Acceptance criteria:*
- Given the hand view is open, when you flick left or right, then you browse your hand as today (cards slide, nothing gets picked up).
- Given the hand view is open, when you press and hold the big card for about 0.25 seconds without moving, then it lifts out and stays under your finger, and the hand view shrinks away (the big view and the cards behind it fade, and your hand at the bottom of the screen drops down out of the way), so you can see the whole table.
- Given you're holding a card, when it lifts, then every place it can legally go lights up at once: for the Corp, each server it can be installed in and a **new server** spot (ICE, assets, agendas, upgrades); for the Runner, the **rig** (programs, hardware, resources); for an event or operation, the **middle of the table**. Places it can't go right now stay unlit or dimmed with the reason (as today).
- Given you're holding a card, when you move it over a lit place, then that place is highlighted more strongly so you know where it will land; when you move off, it goes back to plain lit.
- Given you're holding a card over a place, when the team has tried an **arrow** from the card to the highlighted place at your phone's size (891×296), then the arrow is shown only if it doesn't crowd the screen or hide other places; if it does, there's no arrow and the strong highlight is the only marker. The demo notes say which way we went, with a screenshot.
- Given you're holding a card over a lit place, when you let go, then it's played or installed there (the same move as dragging today, with the same cost) and it flies and lands as in S-15-2; the hand comes back up.
- Given you're holding a card, when you let go anywhere that isn't lit (or over a dimmed place), then nothing is played or paid, the card glides back into your hand and the hand comes back up (a dimmed place shows its reason as you let go).
- Given the hand view is open, when you tap the big card quickly, then it isn't played and no places light up; it stays big to read and a short tip says "Hold to play". Given the closed hand at the bottom, when you tap it, then the hand view opens to read your cards (as today).
- Given a card you can't play right now (not enough credits, no clicks left, not your turn, or a card that needs a run), when you hold it, then it still lifts but looks dimmed, nothing lights up, and a short line says why (e.g. "Needs 5 credits" or "No clicks left"); letting go sends it back.
- Given a computer with a mouse, when you press and hold a card with the mouse button and drag it, then it works the same way as a finger (there's no separate tap-to-play way any more).
- Given the Corp and the Runner, in pass-the-phone and online (and in the Android app), when either side plays a card, then hold-to-play works the same way; online, the other phone never sees a card you're holding, only the card once it's played (face down if it's hidden). (Hidden-card part: automated check.)
- Given you put your finger on a card, when you hold it, then the card reacts (rises a little) within a tenth of a second, it lifts as soon as the 0.25 seconds are up, and nothing (the hand shrinking, the card going back, the hand coming back up) stops you from playing for more than 0.6 seconds. (automated check, at 891×296, 844×390, 640×360 and on a computer)

*Size:* L (most pieces exist from Sprint 7 and S-15-1: lifting, dragging and lit places. New: tap no longer plays, the quicker hold, the hand dropping away, dimmed cards with a reason, and trying the arrow. Much of the size is moving the team's automatic tests, which today play cards by tapping, over to holding and dragging.)

*Questions for you in the new demo:*
- Arrow or no arrow: after playing it, do you want to keep what we chose (arrow, or lit places only)?
- Should you also be able to grab a card **straight from the small hand at the bottom**, without opening the big hand view first (closer still to Hearthstone, but a hold on the small hand today is how you browse it)? Recommended: try the new version first and tell us.

*What this changes in the stories above:* S-15-2's criterion 4 ("install or play from a button instead of dragging, e.g. on a computer") is now done with the mouse by holding and dragging, since tapping to play is gone. Its flight from the hand stays the same.

*Risks (S-15-6):*
- **Holding vs flicking vs tapping can get mixed up** on a busy phone (a slow tap could be read as a hold). We keep the rule that a press is judged by its own start and end times, not by when the phone got round to it, and test it with a slowed-down processor.
- **The team's automatic tests play hundreds of cards by tapping.** We'll move them to hold-and-drag, or give the tests a hidden shortcut that plays the same way (no player can reach it). Either way, the checks stay the same and the 0.6-second rule is re-checked.
- **If time runs short,** the arrow is the first to go (lit places and the strong highlight stay).
