# Backlog (prioritized)

P1 = must, P2 = should, P3 = nice. The PM agent keeps this ordered.

## Epics in rough order
1. ~~**Foundations**~~ — repo, CI, preview deploys, a board you can open on your phone. *(Done: Sprint 0, accepted 2026-11-11)*
2. ~~**Core turn loop**~~ — clicks, credits, draw, end turn, hand limit, hot-seat play. *(Done: Sprint 1, accepted 2026-11-12)*
3. **Installs & servers** — Corp installs face-down, Runner installs programs, remote servers, phone board in landscape. *(Proposed: Sprint 2, revised after owner comment 2026-11-12)*
4. **Runs & defenses** — approach, rez, encounter, break subroutines, access, steal agendas, win at 7 points. (Owner-facing word for "ICE" is decided in Sprint 2, question 2; follow-up asked 2026-11-12.)
5. **Real board UI** — drag to play (owner: "drag for future"), card zoom, run animation, clear turn/click indicators.
6. **AI opponent v1** — play as Runner or Corp against a simple bot.
7. **Game feel** — sounds, hit-stop, particles, card hover/tilt, tap to speed up.
8. **Onboarding** — interactive tutorial for first game.
9. **Android build** — Capacitor app, install on owner's phone.
10. **Deckbuilding & more cards** — expand pool, deck editor.
11. **Online play** — the owner's stated end goal (2026-11-12: players sign in as Corp or Runner). Needs a server. To be re-prioritised by PM once runs and the AI exist.

## Items
- ~~P1 — Foundations~~ — done in Sprint 0 (all 5 stories accepted 2026-11-11).
- ~~P1 — Core turn loop~~ — done in Sprint 1 (S-01-1 to S-01-6 accepted 2026-11-12, owner "Approved" on PR #5).
- P1 — Installs & servers — proposed for Sprint 2 (`docs/sprints/sprint-02-proposal.md`), revised 2026-11-12 after the owner's comment on PR #6; now includes S-02-6 phone landscape.
- P1 — Runs & defenses
- P2 — Real board UI
- P2 — AI opponent v1
- P3 — Game feel, onboarding, Android, deckbuilding, online

## Owner feedback on the Sprint 2 proposal (PR #6, 2026-11-12)
- **P1 — Phone board in landscape.** Owner: *"I think the game should be in landscape mode on phone"*. Proposed as S-02-6 in the revised Sprint 2 proposal; how far to go (landscape only / both / later) is question 5.
  - Given a phone held sideways (844×390 and 640×360), when the game opens, then the whole board fits with nothing overlapping or under the notch (notch on either side) or swipe bar.
  - Given a phone held upright in the browser, when the game is open, then a "Turn your phone sideways" screen shows (if the owner picks 5A).
  - Given a computer browser, when the demo opens, then it looks as it does today. (automated check)
  - Charter note: Definition of Done says "390×844 phone viewport"; the owner's answer to question 5 decides whether the team tests 844×390 instead (lead updates the charter only with that OK).
- **P2 — Drag to play cards.** Owner: *"Tap for now but drag for future"* (answer to question 1). Sprint 2 is tap-to-play. Goes with the "Real board UI" epic.
  - Given a card in your hand, when you drag it onto a lit place on the board and let go, then it is played or installed exactly as if you had tapped the card and then the place.
  - Given you drag a card and let go somewhere it can't go, then it slides back to your hand and nothing is spent.
  - Given tap-to-play, when drag is added, then tapping still works. (automated check)
- **Open — Which names on screen?** Owner: *"Keep original names"* (answer to question 2). Ambiguous: our own words already in the proposal, or the genre's words (ICE, HQ, R&D, Archives), which the "Original IP only" rule advises against. Clarifying question 2 asked; build with our plain words until answered. Note: `docs/GLOSSARY.md` still uses the genre words and will be updated to match the answer.

## Open owner checks from Sprint 1
- **P2 — "Add to Home Screen" check on the owner's phone (S-01-6, criterion 1).** The automated part passed; only a real phone can confirm it. Source: Sprint 1 QA. Owner (question 3, 2026-11-12): *"Not important now we'll circle back"*. Parked; re-ask at the latest with the Android epic (and it now also covers "opens sideways" from S-02-6).
  - Given the owner adds the demo to the home screen and opens it, when the board loads, then nothing sits under the notch, status bar or swipe bar. If something does, it becomes a P1 fix.
- ~~**P3 — Is the faster discard flight (180ms, was 250ms) easy to follow?**~~ — closed 2026-11-12. Owner (question 4): *"Current discard speed seems fine"*. Kept at 180ms.

## Follow-ups from Sprint 2 planning
- **P2 — Replace genre words on card faces and labels with our own** (e.g. "ICE", "HQ", "R&D", "Archives", "Interface", "Subroutine"). Owner picks the words in Sprint 2 question 2 (follow-up asked 2026-11-12, see "Which names on screen?" above). If the owner picks the genre's words, this item changes to recording that choice and its risk in DECISIONS.md. Card names/text that mention defenses or the built-in servers are updated in S-02-5. The rest ("Interface", "Subroutine", "net damage") are done with the Runs epic, when those words first matter.
  - Given any card face or on-screen label, when it is checked, then it uses the team's own words. (automated check: extend the IP word list)
- **P2 — Removing an installed card to make room** (memory full; replacing an agenda/asset in a server). Left out of Sprint 2 to keep it small.
- **P2 — Abilities on installed cards** (e.g. "When your turn begins, gain 1 credit", "Click: gain 2 credits", "+1 memory"). Needs the card-effects system to grow. With or after Runs.

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
- **P2 — Hide the test hook behind a build switch before any public release.** The hook automated tests use to poke the game must not ship in a public build. Do before Android / public release.
  - Given a public release build, when it is inspected, then the test hook is not present. (automated check)
- **P3 — Re-check a tap made during an animation on a real phone** (~80ms frame wait seen only on the GPU-less test browser). Source: Sprint 1 architect review. If ever > 100ms on a device, cut per-frame cost.
