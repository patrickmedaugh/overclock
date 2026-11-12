# Backlog (prioritized)

P1 = must, P2 = should, P3 = nice. The PM agent keeps this ordered.

## Epics in rough order
1. ~~**Foundations**~~ — repo, CI, preview deploys, a board you can open on your phone. *(Done: Sprint 0, accepted 2026-11-11)*
2. **Core turn loop** — clicks, credits, draw, end turn, hand limit, hot-seat play. *(Proposed: Sprint 1)*
3. **Installs & servers** — Corp installs face-down, Runner installs programs, remote servers.
4. **Runs & ICE** — approach, rez, encounter, break subroutines, access, steal agendas, win at 7 points.
5. **Real board UI** — drag to play, card zoom, run animation, clear turn/click indicators.
6. **AI opponent v1** — play as Runner or Corp against a simple bot.
7. **Game feel** — sounds, hit-stop, particles, card hover/tilt, tap to speed up.
8. **Onboarding** — interactive tutorial for first game.
9. **Android build** — Capacitor app, install on owner's phone.
10. **Deckbuilding & more cards** — expand pool, deck editor.
11. **Online play** — later; requires server.

## Items
- ~~P1 — Foundations~~ — done in Sprint 0 (all 5 stories accepted 2026-11-11).
- P1 — Core turn loop — proposed for Sprint 1 (`docs/sprints/sprint-01-proposal.md`).
- P1 — Installs & servers
- P1 — Runs & ICE
- P2 — Real board UI
- P2 — AI opponent v1
- P3 — Game feel, onboarding, Android, deckbuilding, online

## Follow-ups from Sprint 0

### Player-facing
- **P1 — Keep the game clear of the phone notch and gesture bar ("safe areas").** Must be done before the Android build. Source: Sprint 0 QA observation 1. *Proposed for Sprint 1 (S-01-6).*
  - Given the game is opened full-screen (or added to the home screen) on a phone with a notch or a gesture bar, when the board loads, then no label, counter, button or card sits under the notch, status bar or gesture bar.
  - Given the same, when the Android app is built later, then the same check passes there. (automated check)
- **P3 — Smooth hand reflow when the 6th card is drawn.** Today every card in the hand jumps when the hand switches from one row to two. Polish. Source: Sprint 0 QA observation 2.
  - Given 5 cards in hand, when a 6th card is drawn, then the other cards slide smoothly to their new spots instead of jumping.
- **P2 — Re-check the demo link loads in under 5 seconds once GitHub Pages is switched on.** Waiting on the owner setting (Settings → Pages → Source: "GitHub Actions"). Source: Sprint 0 QA, S-00-2.
  - Given Pages is on, when the owner opens the demo link on their phone, then the game is playable in under 5 seconds; the team records the measured time in the next demo notes.

### Technical (from the architect; the owner doesn't need to review these)
- **P1 — Corp goes first, per the rules.** Sprint 0 started on the Runner's turn as a shortcut. Fix when the turn loop lands. *Folded into Sprint 1 (S-01-1).*
- **P1 — One table that says when each action is allowed (engine).** Every action (draw, gain credit, end turn, discard, and later install/run) is checked in one place, so new actions can't skip a rule. Lands with the turn loop. *Part of Sprint 1.*
  - Given any action, when it isn't allowed right now, then the engine rejects it with a reason and the game doesn't change. (automated check)
- **P2 — Move the game "host" out of the screen code before the AI opponent.** Today the screen code runs the game loop; the AI needs it in a shared place. Do before "AI opponent v1".
- **P1 (Android sprint) — Redraw card images after Android drops graphics memory.** When the app is backgrounded and the graphics context is lost and restored, the shared card images come back blank until a resize. Fix: on `webglcontextrestored`, clear the shared card textures and re-lay out the board. Source: Sprint 1 architect review of the QA-S1-1 fix.
- **P2 — Hide the test hook behind a build switch before any public release.** The hook automated tests use to poke the game must not ship in a public build. Do before Android / public release.
  - Given a public release build, when it is inspected, then the test hook is not present. (automated check)
