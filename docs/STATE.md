# Project state

phase: QA
sprint: 0
open_pr: (none — Sprint 0 proposal PR #1 merged after owner approval; demo PR opens in phase DEMO)
last_owner_activity: 2026-11-11 — owner review "Approved" on PR #1; answered both questions (neon cyberpunk style, keep working title)

## Accepted stories
(none yet)

## BUILD summary (branch `sprint-00`) — code-complete 2026-11-11
- Package registry reachable again; `package-lock.json` committed.
- All five stories code-complete: project skeleton + CI (S-00-1), Pages deploy workflow (S-00-2), game board client (S-00-3), draw animation / "no clicks" hint / long-press zoom / IP check (S-00-4), rules engine starter (S-00-5).
- Local: lint, typecheck, unit tests (96), build, Playwright e2e (28 on phone + desktop) all pass.
- GitHub CI on `sprint-00`: `checks` and `e2e` both green (CI now falls back to a browser-only install when Ubuntu mirrors are down).
- Architect review: approved; added lint rules enforcing package boundaries and AI "no cheating". Follow-ups logged for later sprints (move game host out of client when AI lands; per-action validator table; hide test hook behind a build flag before public release).

## NEEDS THE OWNER (blocks S-00-1 "can't merge when red" and S-00-2 demo link)
The work sessions are not allowed to change repository settings, so the owner must do these once in GitHub → Settings:
1. **Pages** → Source: "GitHub Actions". (Until then the deploy job fails at "configure Pages" and there is no demo link.)
2. **Environments → github-pages** → Deployment branches: allow `main` and `sprint-*`.
3. **Branches** → add a rule for `main`: require status checks `checks` and `e2e` to pass.
QA should verify everything else; these two criteria stay "blocked on owner" until done. Raise this at the top of the Sprint 0 demo PR.

## Next run
Phase QA: delegate to `qa` to verify every Sprint 0 acceptance criterion (automated tests + phone-viewport Playwright screenshots), record pass/fail, loop back to devs on failures, then set `phase: DEMO`.
