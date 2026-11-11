# Sprint 0 demo — Foundations you can tap

**▶ Play it:** https://patrickmedaugh.github.io/overclock/ (goes live once Pages is switched on — see below)

## What's new
- A neon game board: Corp on top, Runner at the bottom, each with a deck, credits and clicks.
- Tap the Runner's deck: a card flies into your hand and a click is used. At 0 clicks you get a "No clicks left" hint.
- Long-press a card in your hand to read it big; let go to put it back.
- 24 original placeholder cards, with an automatic check that blocks official names.
- Automatic checks (tests) on every change, and an automatic deploy of the demo link.

## Try this (≈2 minutes)
- [ ] S-00-3: Open the link on your phone held upright — Corp at top, Runner at bottom, nothing cut off.
- [ ] S-00-4: Tap the bottom deck 4 times — 4 cards fly in, clicks go 4 → 0.
- [ ] S-00-4: Tap once more — "No clicks left" appears, nothing is drawn.
- [ ] S-00-4: Hold your finger on a card — it zooms; let go — it shrinks back.
- [ ] S-00-2: The page loads in under 5 seconds.

Screenshots of all of the above: `docs/sprints/sprint-00-qa/`.

## Result
- QA: 9 of 12 criteria passed; 3 were waiting on repo settings (no bugs). Full report: `docs/sprints/sprint-00-qa.md`.
- 2026-11-11: owner made the repo public and commented "approved" on PR #2 → Sprint 0 accepted.

## Didn't make it / follow-ups
- The demo link needs one more owner setting (Settings → Pages → Source: "GitHub Actions"). Once on, the team re-checks the link loads in under 5 seconds.
- "Can't merge when red" needs a branch rule on `main` (Settings → Branches) — optional owner step.

## Questions for you
None this sprint.
