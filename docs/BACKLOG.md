# Backlog (prioritized)

P1 = must, P2 = should, P3 = nice. The PM agent keeps this ordered.

## Epics in rough order
1. ~~**Foundations**~~ — repo, CI, preview deploys, a board you can open on your phone. *(Done: Sprint 0, accepted 2026-11-11)*
2. ~~**Core turn loop**~~ — clicks, credits, draw, end turn, hand limit, hot-seat play. *(Done: Sprint 1, accepted 2026-11-12)*
3. ~~**Installs & servers**~~ — Corp installs face-down, Runner installs programs, remote servers, phone board in landscape, real words and starter cards. *(Done: Sprint 2, accepted 2026-11-12)*
4. **Runs & defenses** — approach, rez, encounter, break subroutines, access, steal agendas, win at 7 points. (Owner chose the real game's words, 2026-11-12: on screen it's "ICE".) *(Proposed: Sprint 3, `docs/sprints/sprint-03-proposal.md`; also covers the Corp advancing and scoring agendas, which a points win needs.)*
5. **Real board UI** — drag to play (owner: "drag for future"), card zoom, run animation, clear turn/click indicators.
6. **AI opponent v1** — play as Runner or Corp against a simple bot.
7. **Game feel** — sounds, hit-stop, particles, card hover/tilt, tap to speed up.
8. **Onboarding** — interactive tutorial for first game.
9. **Android build** — Capacitor app, install on owner's phone.
10. **Deckbuilding & more cards** — expand the real card pool, deck editor. (Real identities and full core-set decks start earlier: see the P1 "Real card pool" item.)
11. **Online play** — the owner's stated end goal (2026-11-12: players sign in as Corp or Runner). Needs a server. To be re-prioritised by PM once runs and the AI exist.

## Items
- ~~P1 — Foundations~~ — done in Sprint 0 (all 5 stories accepted 2026-11-11).
- ~~P1 — Core turn loop~~ — done in Sprint 1 (S-01-1 to S-01-6 accepted 2026-11-12, owner "Approved" on PR #5).
- ~~P1 — Installs & servers~~ — done in Sprint 2 (S-02-1 to S-02-6 accepted 2026-11-12, owner "Approved" on PR #7, no other feedback). Demo notes: `docs/sprints/sprint-02-demo.md`.
- P1 — Runs & defenses — proposed for Sprint 3 (`docs/sprints/sprint-03-proposal.md`). Leftovers that don't fit are listed under "Follow-ups from Sprint 3 planning" below.
- P1 — Real card pool beyond the starter decks (see "Owner feedback" below). Likely candidate for Sprint 4, after runs exist (the real decks need runs to make sense and enough agenda points to reach 7).
- P2 — Real board UI
- P2 — AI opponent v1
- P3 — Game feel, onboarding, Android, deckbuilding, online

## Owner requests in chat (2026-11-13, during Sprint 3 QA)
- **P1 — An Android app file (APK) the owner can install on his phone.** Owner: *"I would like to get an apk for the Android up ready. Playing in the browser, the browser window cuts down the available room."* What this means: build the Capacitor Android app (the "Android build" epic) as an installable APK that opens full-screen and sideways, with no browser bars taking room. Delivered as a file the owner installs himself (personal use only: no app store, per CLAUDE.md rule 3). Brings along the Android items already in this backlog: redraw card images after Android drops graphics memory, safe-area re-check on Android, hide the test hook in that build, and the parked "opens sideways" phone check. Raised from P3 (owner asked for it). PM to slot it into an upcoming sprint proposal.
- **P1 — Multiplayer (two phones), keeping pass-the-phone mode.** Owner: *"Also want to get multiplayer support but we should keep the current pass the phone back and forth mode for testing and other reasons."* What this means: two players on their own devices playing one game (the "Online play" epic), while the current one-device hot-seat mode stays available as a choice. Needs a small server and a design proposal for the owner first (how players find each other, e.g. a game code). Includes the architect's online follow-ups (validate the seat on the network host, widen `connect-src`). PM to size and slot it; likely after the APK.

## Owner feedback on the Sprint 3 proposal (PR #8, 2026-11-12)
- Owner approved Sprint 3 ("Approved", 18:08 UTC). He didn't answer the two questions, so the team uses the recommended options (Q1 A: Rez / Don't rez buttons on the board; Q2 A: add one Hostile Takeover and one Private Security Force). He can change them at the demo. Logged in DECISIONS.
- **P1 — Hand UI rework: a face-down hand you open to browse (after the core mechanics are in).** Owner: *"Once we have some of the gameplay core mechanics in place I think we need to revisit some of the UI around the cards in your hand. … there's more on the card to read so I think the hand should sit face down on the board you could either click it or something to bring the cards to the front … it would be useful to be able to scroll through your cards so you can compare them to each other in order to help make decisions. And then from there from your hand you could maybe hold a card in order to move it around and play it in the spaces that you would play it."* What this means: (1) the hand sits as a face-down stack on the board; (2) tapping it opens a large, readable, side-scrolling view of your cards so you can compare them; (3) from that view, press and hold a card and drag it to a lit space to play it. This takes in the P2 "Drag to play cards" item below. Timing: after Runs (Sprint 3), probably alongside or right after the full real decks. Needs a short design proposal (with a mock-up) for the owner first. **Added by owner (chat, 2026-11-12):** *"when you hold down a card to view it you should be able to then slide your finger to the left and right to view the other cards in your hand."* So: while holding a card zoomed, sliding the finger left/right moves the zoom to the neighbouring hand cards without lifting. This is smaller than the full rework and could be built first, on its own.

## Owner response to the Sprint 2 demo (PR #7, 2026-11-12)
- Owner commented **"Approved"** on PR #7 (17:07 UTC) = all six Sprint 2 stories (S-02-1 to S-02-6) accepted. No other feedback on the stories.
- ~~**Demo question 1 — delete the three leftover branches?**~~ — answered in chat 2026-11-12: *"yes, delete the leftover branches"*. The team's sessions can't delete branches (the connection refuses it), so the owner has been told how to delete `sprint-02-run-0805`, `sprint-02-run-1005-superseded` and `sprint-02-scheduled-run-alt` on GitHub. Nothing for the team to build; a later session with delete access may do it if they are still there.
- **Demo question 2 — real card text typed from memory: does any card look wrong?** No reply. Not blocking: treated as "nothing looked wrong". Stays open passively; if the owner ever names a card, it becomes a P1 fix. Re-mentioned briefly in the Sprint 3 proposal (no answer needed).
- **Owner phone checks still open** (all optional, owner chose "we'll circle back"): home-screen version opens sideways (S-02-6 criterion 4) and Add to Home Screen (S-01-6). See "Open owner checks from Sprint 1".

## Owner feedback on the Sprint 2 proposal (PR #6, 2026-11-12)
- **P1 — Phone board in landscape.** Owner: *"I think the game should be in landscape mode on phone"*. In Sprint 2 as S-02-6. Owner's chosen approach (question 5, 2026-11-12: *"the solution for landscape sounds fine"*) is **5A: landscape only on phones**; upright shows "Turn your phone sideways"; the team tests 844×390 and 640×360 instead of 390×844.
  - Given a phone held sideways (844×390 and 640×360), when the game opens, then the whole board fits with nothing overlapping or under the notch (notch on either side) or swipe bar.
  - Given a phone held upright in the browser, when the game is open, then a "Turn your phone sideways" screen shows.
  - Given a computer browser, when the demo opens, then it looks as it does today. (automated check)
  - Charter note: the owner's 5A answer is the OK to change the Definition of Done from "390×844 phone viewport" to sideways phone sizes; the lead updates `CLAUDE.md`.
- **P2 — Drag to play cards.** Owner: *"Tap for now but drag for future"* (answer to question 1). Sprint 2 is tap-to-play. Goes with the "Real board UI" epic. Now part of the P1 "Hand UI rework" item (owner, PR #8).
  - Given a card in your hand, when you drag it onto a lit place on the board and let go, then it is played or installed exactly as if you had tapped the card and then the place.
  - Given you drag a card and let go somewhere it can't go, then it slides back to your hand and nothing is spent.
  - Given tap-to-play, when drag is added, then tapping still works. (automated check)
- ~~**Open — Which names on screen?**~~ — closed 2026-11-12. Owner first said *"Keep original names"*, then clarified: *"Let's do real names and real cards. I sincerely doubt anyone besides myself will play this."* The game uses the real game's words (ICE, HQ, R&D, Archives) and real cards with official names and text; charter rule 3 changed at the owner's request (see DECISIONS.md). Sprint 2 S-02-5 covers labels, card types, the glossary and the starter-deck cards.
- **P1 — Real card pool beyond the starter decks.** Owner: *"Let's do real names and real cards."* Sprint 2 swaps only the 24 cards already in the starter decks (12 per side) for real core-set cards. Next: real identities (each side's character card), the real core-set starter decks in full, and real faction names. Each card's ability is made to work as the systems it needs arrive (runs, installed-card abilities). Engine dev also finishes retiring/reworking the old originality check (`packages/cards/test/ip-*.test.ts`) if anything is left after Sprint 2.
  - Given a new game, when the decks are dealt, then each side plays a real identity and a real core-set deck (official names and text).
  - Given any card in the game, when its systems exist, then it does what its official text says. (automated check per card)
  - Given the card list, when it is checked, then no invented card is left. (automated check)

## Follow-ups from Sprint 3 planning (left out of the Runs sprint to keep it small)
- **P1 — Agenda "when scored" effects and Priority Requisition's free rez.** Hostile Takeover (gain 7 credits, take 1 bad publicity) and Priority Requisition (rez a piece of ICE for free) score points in Sprint 3 but their extra effects wait for the card-effects system. Bad publicity is a new rule too.
  - Given the Corp scores Hostile Takeover, when it is scored, then the Corp gains 7 credits and takes 1 bad publicity. (automated check)
  - Given the Corp scores Priority Requisition, when it is scored, then the Corp may pick a face-down ICE and rez it for free.
- **P2 — Tags and meat damage** (Private Security Force's "If the Runner is tagged…"). Needs tags, a new rule; with the bigger card pool.
- **P2 — Advancing Ice Wall** ("can be advanced, +1 strength per advancement"). Sprint 3 advances only agendas.
- **P2 — Installed-card abilities that touch runs**: Akitaro Watanabe (ICE in its server is 2 cheaper to rez), Cyberfeeder's recurring credit, Sacrificial Construct, Armitage Codebusting, Bank Job, PAD Campaign. Part of "Abilities on installed cards" above.
- **P2 — Rezzing assets and upgrades outside a run** (the Corp flipping PAD Campaign face up to make it work). Only useful once installed-card abilities exist.
- **P2 — Run animation polish** (the "Real board UI" epic): a proper run animation that follows the Runner through the ICE. Sprint 3 shows each step clearly but simply.

## Open owner checks from Sprint 1
- **P2 — "Add to Home Screen" check on the owner's phone (S-01-6, criterion 1).** The automated part passed; only a real phone can confirm it. Source: Sprint 1 QA. Owner (question 3, 2026-11-12): *"Not important now we'll circle back"*. Parked; re-ask at the latest with the Android epic (and it now also covers "opens sideways" from S-02-6).
  - Given the owner adds the demo to the home screen and opens it, when the board loads, then nothing sits under the notch, status bar or swipe bar. If something does, it becomes a P1 fix.
- ~~**P3 — Is the faster discard flight (180ms, was 250ms) easy to follow?**~~ — closed 2026-11-12. Owner (question 4): *"Current discard speed seems fine"*. Kept at 180ms.

## Follow-ups from Sprint 2 planning
- ~~**P2 — Replace genre words on card faces and labels with our own**~~ — dropped 2026-11-12: the owner chose the real game's words and cards instead (see "Which names on screen?" and DECISIONS.md). Words like "Interface", "Subroutine" and "net damage" stay as the real game uses them.
- **P2 — Removing an installed card to make room** (memory full; replacing an agenda/asset in a server). Left out of Sprint 2 to keep it small.
- **P2 — Abilities on installed cards** (e.g. "When your turn begins, gain 1 credit", "Click: gain 2 credits", "+1 memory"). Needs the card-effects system to grow. After Runs (Sprint 3 builds only the icebreaker abilities, because runs need them).

## Follow-ups from Sprint 0 and 1

### Player-facing
- ~~**P1 — Keep the game clear of the phone notch and gesture bar ("safe areas").**~~ — done in Sprint 1 (S-01-6, accepted 2026-11-12). The Android re-check stays with the Android epic.
  - Given the same, when the Android app is built later, then the same check passes there. (automated check) *(still open, Android epic)*
- **P3 — Smooth hand reflow when the 6th card is drawn.** Today every card in the hand jumps when the hand switches from one row to two. Polish. Source: Sprint 0 QA observation 2.
  - Given 5 cards in hand, when a 6th card is drawn, then the other cards slide smoothly to their new spots instead of jumping.
- **P3 — Runner's hand row sits lower than the Corp's with 5 cards** (an empty band between the counters and the hand). Looks only. Source: Sprint 1 QA observation 3. Revisit with the Sprint 2 board layout (S-02-5, S-02-6 landscape).
- **P2 — Re-check the demo link loads in under 5 seconds.** GitHub Pages is now on and the `main` deploy succeeds; the team's sandbox can't open the link, so the load time still needs measuring from outside (or the owner confirming). Source: Sprint 0 QA, S-00-2.
  - Given Pages is on, when the owner opens the demo link on their phone, then the game is playable in under 5 seconds; the team records the measured time in the next demo notes.

### Technical (from the architect; the owner doesn't need to review these)
- ~~**P1 — Corp goes first, per the rules.**~~ — done in Sprint 1 (S-01-1).
- ~~**P1 — One table that says when each action is allowed (engine).**~~ — done in Sprint 1 (`packages/engine/src/rules.ts`). New Sprint 2 actions (install, play) must be added to it.
- ~~**P2 — Move the game "host" out of the screen code before the AI opponent.**~~ — done in Sprint 1 (`packages/match`, `LocalMatch`; the client no longer runs the rules loop).
- **P1 (online epic) — Validate the seat on the future network host; widen the page's `connect-src` security rule when the server lands.** Source: Sprint 1 architect review.
- **P1 (Android sprint) — Redraw card images after Android drops graphics memory.** When the app is backgrounded and the graphics context is lost and restored, the shared card images come back blank until a resize. Fix: on `webglcontextrestored`, clear the shared card textures and re-lay out the board. Source: Sprint 1 architect review of the QA-S1-1 fix.
- **P2 — Hide the test hook behind a build switch before any public release.** The hook automated tests use to poke the game must not ship in a public build. Do before Android / public release. (Raised again by Sprint 2 QA: the hook grew this sprint with `lastInput()` and `endTurn()`.)
  - Given a public release build, when it is inspected, then the test hook is not present. (automated check)
- **P1 — Make the End turn double-tap-guard test sturdier (it can go red on a busy CI machine).** On the Sprint 2 demo commit (da327c6) one of two CI runs of the same code went red: the guard e2e (`qa-sprint01.spec.ts` "QA round 2") could not land a timed tap in the 150–300ms window, because the GPU-less runner stalls the page ~300ms after the turn change. It never caught a wrongly accepted tap (coverage miss, not a game bug); the other run was green and the team re-ran it. Fix: drive the late-window tap with Playwright's fake clock (`page.clock`) or input sent through the browser's pipeline (as `guard-slow-frame.spec.ts` does), so it no longer depends on timers firing during the stall; then put the guard tests back on the `E2E_CPU_THROTTLE=6` proof. Supersedes the earlier P2 "guard e2e on a fake clock" item (raised to P1 because it now turns CI red). **Proposed for Sprint 3 as S-03-6.** Source: Sprint 2 architect review (DECISIONS 2026-11-12, CI bar for the guard test) and the Sprint 2 demo CI run.
  - Given the full e2e suite on CI, when it runs 10 times on the same commit, then the guard tests pass every time, with every guard assertion unchanged (no skip, no wider window). (automated check)
  - Given `E2E_CPU_THROTTLE=6`, when the guard tests run with `--repeat-each=10`, then they pass without the "no timed tap landed" coverage miss. (automated check)
  - Given the guard is reverted to judge taps by handling time, when the tests run, then they fail (mutation check still catches the real bug). (automated check)
- **P2 — Draw-3 plays and the End turn rebuild can go over the 0.1s tap budget on a very slow phone.** At 6× CPU slow-down in the test sandbox, Anonymous Tip / Diesel (draw 3) and the End turn rebuild sometimes took 101–142ms. Fix: build card pictures ahead of time while the game is idle, and put off rebuild work that isn't needed for the first frame. Source: Sprint 2 overlapping-run notes (`docs/sprints/sprint-02-parallel-run-notes.md`) and Sprint 2 QA summary.
  - Given a 6× CPU slow-down, when Anonymous Tip or Diesel is played, then the game answers in under 100ms. (automated check)
  - Given a 6× CPU slow-down, when End turn is tapped, then the game answers in under 100ms. (automated check)
- **P3 — Re-check a tap made during an animation on a real phone** (~80ms frame wait seen only on the GPU-less test browser). Source: Sprint 1 architect review. If ever > 100ms on a device, cut per-frame cost.
