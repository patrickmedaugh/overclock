# Project state

phase: DEMO
sprint: 1
open_pr: (none — Sprint 1 proposal PR #3 approved and merged by owner 2026-11-12; build on branch `sprint-01`)
last_owner_activity: 2026-11-12 — "Approved" on PR #3 with answers (no hand-over screen — game will be networked; End turn button; may end turn early); merged PR #3 and PR #4 (Netlify backup host)

## Accepted stories
- Sprint 0 (owner "approved" on PR #2, 2026-11-11): S-00-1 project skeleton & checks, S-00-2 demo link, S-00-3 game board, S-00-4 draw / no-clicks hint / long-press zoom / originality check, S-00-5 rules engine starter.
- Follow-ups from Sprint 0 (not blocking): owner still to set Pages Source = "GitHub Actions" (+ allow `sprint-*` in the github-pages environment), then team re-checks the demo link loads <5s; optional branch rule on `main`.

## Sprint 0 history
Details: docs/sprints/sprint-00-tech-plan.md, sprint-00-qa.md, sprint-00-demo.md. QA: 9/12 pass, 3 waiting on repo settings, no bugs.

## Demo hosts
- GitHub Pages: https://patrickmedaugh.github.io/overclock/ (deploys on push to main / sprint-*)
- Netlify backup (owner's site "overcloc"): https://overcloc.netlify.app, plus a Deploy Preview link on every PR

## Sprint 1 BUILD summary (branch `sprint-01`) — code-complete 2026-11-12
- Tech plan: docs/sprints/sprint-01-tech-plan.md. Engine: turn loop, rules table, gain credit / draw / end turn / discard, Corp deck-out; new `packages/match` (LocalMatch host). Client: hot-seat flip, End turn, discard picker, safe areas, strict CSP, e2e flake fix.
- Local: lint, typecheck, unit tests (~290), build, e2e 96/96 (and 282/282 with --repeat-each=3).
- Architect review: approved; fixed a stray-tap-during-flip bug (with a regression test). Follow-ups: validate seat on the future network host; widen CSP connect-src then.
- Screenshots: docs/sprints/sprint-01-screens/.

## Sprint 1 QA summary — 2026-11-12
- Report: docs/sprints/sprint-01-qa.md; screenshots docs/sprints/sprint-01-qa/.
- Result: 20/21 acceptance criteria PASS; 1 owner check at demo (S-01-6 "Add to Home Screen" on a real phone; automated part passes). No IP issues.
- Round 1 bugs, both fixed and re-verified in round 2: QA-S1-1 End turn ignored taps ~0.7s after a 4-card discard (now 0.32–0.51s; guard counted from the tap, shared card textures, discard flight 250→180ms); QA-S1-2 discard-pile count covered the card name (badge moved top-right).
- Architect approved the fixes; added resize + turn-change regression test. New backlog item: redraw card images after Android drops graphics memory.
- Checks: lint, typecheck, 292 unit tests, build, e2e 116/116.
- For the owner at demo: is the faster discard flight (180ms) still easy to follow?

## Next run
Phase DEMO for Sprint 1: deploy preview from `sprint-01` and verify the link loads; `pm` writes docs/sprints/sprint-01-demo.md; open PR `Sprint 01 demo — ready for you to play` (sprint-01 → main, label sprint-demo) with demo notes + PR file guide; set AWAITING_REVIEW and stop.
