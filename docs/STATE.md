# Project state

phase: QA
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

## Next run
Phase QA for Sprint 1: delegate to `qa` (every criterion in sprint-01-proposal.md as updated by owner answers). Manual "Add to Home Screen" check is for the owner at demo.
