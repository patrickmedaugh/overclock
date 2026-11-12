# Sprint 2 — notes from an overlapping scheduled run (2026-11-12, 10:05–13:35 UTC)

Another scheduled run built U2–U5 in parallel; its version was superseded by the one now on `sprint-02` (see DECISIONS.md, 06a1f21). Its full work is kept, unmerged, on branch `sprint-02-run-1005-superseded` for reference only.

## One finding that likely still applies to `sprint-02` (for the BUILD↔QA loop)
**Bug (architect, reproduced on the superseded build): a double tap on End turn can end two turns on a slow phone.**
- Cause: the guard is set and checked with `performance.now()` at the time the tap is *handled* (`board.ts` `handoff()` → `endTurnArmedAt = tappedAt + timing.endTurnGuard`; check at ~line 1160). The turn-change frames can keep the main thread busy past 300ms, so a second tap *made* 150ms after the first is handled late and accepted. Reproduced at 6× CPU throttle: tap stamped at 151ms, handled at 768ms, accepted, Corp pushed into its discard step.
- Fix used on the superseded branch (commit 28a0d9e): `input.ts` exposes the tap's event time (`inputTime()` = DOM `event.timeStamp`); `board.ts` starts and checks the guard with it. Regression test `apps/client/e2e/guard-slow-frame.spec.ts` (fails on the old build on all three projects, passes after; includes a control that a tap after the guard still works).
- `sprint-02`'s `input.ts` already records `eventAt`, so the port should be small.

## Other observations from that run (6× CPU, no-GPU container, so pessimistic)
- Draw-3 plays (Anonymous Tip, Diesel) and the End turn rebuild sometimes exceed the 100ms tap budget (101–142ms). Worth a backlog item: pre-build card art in idle time / defer non-essential rebuild work.
