# How the team runs tests (keep runs fast)

A full screen-test (e2e) pass is ~540 tests and takes ~20 minutes in a session.
Runs were taking over an hour because the full pass was repeated by the
developer, the architect, QA and CI. These rules keep the same safety with far
less waiting. (Owner OK'd 2026-11-13; DECISIONS 2026-11-13.)

## 1. While working: run only what the change touches
- Developers and the architect run lint, typecheck and the **unit tests** (fast),
  plus **only the e2e spec files related to the change**, e.g.
  `npx playwright test e2e/discard.spec.ts` (from `apps/client`).
  Add `--project=phone` while iterating; run all 3 sizes once before handing off.
- Do not run the full e2e suite during BUILD or architect review. CI does that
  on every push.

## 2. The full pass: once per QA round, or read CI instead
- QA runs the full e2e suite **once per QA round**, at the end, with
  `--retries=0` — **unless CI already passed on that exact commit**. Then QA
  records the CI result as evidence instead of re-running it:
  ```
  gh api repos/patrickmedaugh/overclock/commits/<sha>/check-runs \
    --jq '.check_runs[] | [.name, .conclusion] | @tsv'
  ```
  The `e2e` check is green only if all 4 shards passed.
- Never run the same test set twice on the same commit without a reason
  (e.g. checking for flakiness).
- To split a local full pass the same way CI does: `--shard=1/4` … `--shard=4/4`
  (each can run in a separate shell with its own `E2E_PORT`).

## 3. Repeats and slow-down only for timing stories
- `--repeat-each`, 10× repeat runs and CPU slow-down (6× throttle) are used only
  when a story's acceptance criteria are about timing or flakiness, or to check
  a timing bug fix — and only on the specs involved, not the whole suite.

## 4. Setup
- Run `npm ci` only if `node_modules` is missing or `package-lock.json` changed.

None of this loosens what a test checks or skips a test. Never fake a pass.
