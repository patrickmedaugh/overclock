# Project state

phase: AWAITING_APPROVAL
sprint: 2
open_pr: PR #6 (Sprint 2 proposal, branch `sprint-02-proposal`, label sprint-proposal)
last_owner_activity: 2026-11-12 04:51 UTC — owner opened PR #5 (sprint-01 → main) himself, commented "Approved" + review "approved", merged it. Recorded as acceptance of all Sprint 1 stories (see DECISIONS.md).

## Accepted stories
- Sprint 0 (owner "approved" on PR #2, 2026-11-11): S-00-1 project skeleton & checks, S-00-2 demo link, S-00-3 game board, S-00-4 draw / no-clicks hint / long-press zoom / originality check, S-00-5 rules engine starter.
- Sprint 1 (owner "Approved" on PR #5, 2026-11-12): S-01-1..S-01-6 — core turn loop, hot-seat play, End turn, hand-limit discard, Corp deck-out, safe areas. Owner checks still open (asked in Sprint 2 proposal): Add to Home Screen on his phone; is the 180ms discard flight easy to follow? Demo notes: docs/sprints/sprint-01-demo.md.
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

## Sprint 1 DEMO / review — 2026-11-12
- main (incl. Sprint 1) deployed to GitHub Pages via the deploy workflow (success on 4b0e88a); Netlify preview for PR #5 was green. Sandbox cannot open the hosts directly.
- Demo notes written after the fact as the record: docs/sprints/sprint-01-demo.md. Backlog updated by pm.

## Next run
- First BUILD task for Sprint 2 (technical, qa + ui-dev): `apps/client/e2e/qa-sprint01.spec.ts` double-tap-guard tests fail on slow CI when no timer poke lands inside 300ms ("extra taps landed inside the guard", received 0) — seen on PR #6 run 43158623799, passed on one re-run. Make the pokes independent of main-thread delay (e.g. schedule relative to the tap timestamp / use the test hook's guard clock) without loosening the guard.
Phase AWAITING_APPROVAL for Sprint 2: read comments AND review bodies on the Sprint 2 proposal PR. Owner "approved" → merge, set BUILD, create `sprint-02`, continue. Change requests → pm revises. Nothing → stop (one friendly reminder only after 3+ days, i.e. not before 2026-11-15).
