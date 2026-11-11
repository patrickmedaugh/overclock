# Project state

phase: BUILD
sprint: 0
open_pr: (none — Sprint 0 proposal PR #1 merged after owner approval)
last_owner_activity: 2026-11-11 — owner review "Approved" on PR #1; answered both questions (neon cyberpunk style, keep working title)

## Accepted stories
(none yet)

## BUILD progress (branch `sprint-00`)
- Done (code written, not yet verified by real tools): tech plan; project skeleton + CI config (S-00-1); rules engine starter (S-00-5); original starter cards + IP check (part of S-00-4); AI stub.
- Not started: game board client (S-00-3), draw animation / long-press zoom (rest of S-00-4), demo-link deploy (S-00-2), repo settings (required checks, Pages environment).

## BLOCKER (2026-11-11)
- The automated work sessions cannot reach the npm package registry (registry.npmjs.org is denied by the session's network policy, HTTP 403). Without it we can't install the test runner, linter, PixiJS or Vite, so nothing can be run or verified, and no `package-lock.json` exists yet (CI will be red until it does).
- Next run: first check `npm view vitest version`. If it works, run `npm install`, commit the lockfile, get lint/typecheck/test green, then continue with the client (ui-dev). If still blocked, stop and keep the owner informed — do not work around the network policy.
