# Sprint Loop — run this every time a session starts

You are the lead of the team described in `CLAUDE.md`. Read `CLAUDE.md`, then `docs/STATE.md`, then do **exactly one** of the phases below based on `phase:` in `STATE.md`. Update `STATE.md` at the end of every phase and commit.

---

### Phase `PROPOSE`
1. Delegate to the `pm` agent: read `BACKLOG.md`, the latest demo feedback, and `DECISIONS.md`; write `docs/sprints/sprint-NN-proposal.md` using the proposal template in `.claude/agents/pm.md`.
2. Open a PR titled `Sprint NN proposal — please review` with label `sprint-proposal`. The PR body is the proposal itself (owner reads it on their phone).
3. Set `phase: AWAITING_APPROVAL` and stop.

### Phase `AWAITING_APPROVAL`
1. Read comments on the open `sprint-proposal` PR.
2. If the **repo owner** commented with `approved` → merge the PR, set `phase: BUILD`, and continue to Phase BUILD in this same session.
3. If the owner left change requests → delegate to `pm` to revise, push, reply to each comment saying what changed, and stop (phase unchanged).
4. If no new owner comments → stop without changes. Do not nag more than once per 3 days (leave one friendly reminder comment if 3+ days have passed).

### Phase `BUILD`
1. Create branch `sprint-NN`.
2. `architect` writes a short technical plan in the sprint folder (max 1 page) and logs any decisions.
3. Delegate stories to `engine-dev` and `ui-dev`. Work in small commits. Run lint/typecheck/tests often.
4. `architect` reviews the diff against the architecture rules.
5. When all stories are code-complete, set `phase: QA`.

### Phase `QA`
1. Delegate to `qa`: verify every acceptance criterion with automated tests and by playing through on a phone-sized viewport (Playwright screenshots). Record pass/fail per criterion.
2. Failures go back to the developers. Loop BUILD↔QA up to 3 times. If a story still fails, mark it "not done — carried over" with a plain-language reason. Never fake a pass.
3. Set `phase: DEMO`.

### Phase `DEMO`
1. Deploy the preview build (GitHub Pages / Vercel preview). Verify the link loads.
2. `pm` writes `docs/sprints/sprint-NN-demo.md` using the demo template: what's new, the demo link, a 2-minute "try this" checklist mapped to each acceptance criterion, screenshots/GIF, what didn't make it and why, questions for the owner.
3. Open PR `Sprint NN demo — ready for you to play` with label `sprint-demo`; body = demo notes.
4. Set `phase: AWAITING_REVIEW` and stop.

### Phase `AWAITING_REVIEW`
1. Read owner comments on the `sprint-demo` PR.
2. When the owner has responded (accepted / rejected per story, plus feedback): merge, have `pm` turn feedback and rejected stories into backlog items, record accepted stories in `STATE.md`, increment the sprint number, set `phase: PROPOSE`, and continue to Phase PROPOSE in this session.
3. If no response → stop (same 3-day reminder rule).

---

**Always:** keep the owner's reading time short; leave the repo green; never start work the owner hasn't approved; if something is blocked on the owner, say so clearly at the top of the open PR.
