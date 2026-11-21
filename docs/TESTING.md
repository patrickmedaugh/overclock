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
- **What CI runs where (Sprint 15, private repo: 2,000 free CI minutes a
  month; DECISIONS 2026-11-20).** A push to `main` or `sprint-NN` runs
  `checks` only (lint, typecheck, unit tests, `test:dev`, Android bundle,
  `check-workflows`). The **full e2e suite (4 shards) and guard-mutation run on
  pull requests and manual runs**. Docs-only changes skip both, but only when
  the commit before already passed (`scripts/ci-changes.mjs`). Helper branches
  get no push run; open a PR or run CI by hand. Nothing a test checks changed.
- QA runs the full e2e suite **once per QA round**, at the end, with
  `--retries=0` — **unless CI already ran the full suite on that exact
  commit**. Then QA records the CI result as evidence instead of re-running it:
  ```
  gh api repos/patrickmedaugh/overclock/commits/<sha>/check-runs \
    --jq '.check_runs[] | [.name, .conclusion] | @tsv'
  ```
  It counts only if the four `e2e shard N/4` runs are listed as `success`.
  The `e2e` check alone is not enough: on a push run (or a docs-only change)
  it is green with the note "e2e not run".
- To get that CI pass instead of a local one (saves session time, costs ~85
  CI minutes): `gh workflow run ci.yml --ref sprint-NN`, then wait for it
  (`gh run watch`). The sprint PR's own run counts too.
- CI minutes: the lead runs `node scripts/ci-minutes.mjs` (this month's billed
  minutes per workflow; add `--since YYYY-MM-DD`, the day the repo went
  private, in that month), records the total in `docs/STATE.md` each sprint, and
  tells the owner once it reaches 1,500.
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
