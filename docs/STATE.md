# Project state

phase: BUILD
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

## Next run
Phase BUILD for Sprint 1 on branch `sprint-01` (proposal updated with owner answers). If BUILD is already code-complete, set QA.
