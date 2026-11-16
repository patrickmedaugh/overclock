// Sprint 9 (U2): a Hunter trace in a pass-the-phone run, played through the real
// engine: the Corp's bid is a Decision on the Runner's board (cover to the Corp),
// the Runner's answer is his own choice (cover back to the Runner), and the
// result arrives as the ICE report with both totals.
import type { Action } from '@overclock/engine';
import { planToStep } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { HotSeat } from '../src/hotseat';
import { coverFor } from '../src/passCover';
import { iceReport } from '../src/runText';
import { bidAmounts, isTraceChoice, traceStepLabel } from '../src/traceText';

function atHunter(seed: number) {
  const plan = planToStep(seed, 'pipeline_hunter_encounter');
  const h = new HotSeat(seed, { deckSet: plan.deckSet });
  for (const a of plan.actions) h.submit(a);
  return { h, plan };
}

/** Which windows opened, per seed (the engine skips one whose bid cannot matter). */
const seen = { corp: 0, runner: 0 };

describe('S-09-1 Hunter trace, pass-the-phone', () => {
  it.each([1, 7, 42, 12345])('seed %i: Runner -> Corp (bid) -> Runner (bid), covers at each hand-over, report with both totals', (seed) => {
    const { h } = atHunter(seed);
    expect(h.seat).toBe('runner');
    const fire = h.view().run!.options.find((o) => o.action.type === 'pass')!;
    let p = h.submit(fire.action);
    expect(p.kind).toBe('same');
    if (p.kind !== 'same') return;
    const corpCredits = p.view.players.corp.credits;
    if (p.decision) {
      seen.corp++;
      // The Corp's window: its options on the shared screen, as the Corp.
      expect(p.decision.seat).toBe('corp');
      const c = p.decision.choice;
      expect(isTraceChoice(c)).toBe(true);
      if (!isTraceChoice(c)) return;
      expect(c.kind).toBe('trace_corp');
      expect(traceStepLabel(c, true)).toBe(`Trace ${c.trace.base}: add credits?`);
      expect(Math.max(...bidAmounts(c.options))).toBe(corpCredits);
      expect(coverFor(p, null)).toMatchObject({ to: 'corp' });
      // The Runner's own view knows a trace is on, without the Corp's options.
      expect(isTraceChoice(p.view.choice) && p.view.choice.options.length).toBe(0);
      const bid: Action = c.options.find((o) => o.action.type === 'trace_bid' && o.action.credits === Math.min(2, corpCredits))!.action;
      p = h.submit(bid);
      if (p.kind !== 'same') return;
      expect(coverFor(p, 'corp')).toMatchObject({ to: 'runner', title: 'Pass back to the Runner — tap when ready' });
    }
    const mine = p.view.choice;
    if (isTraceChoice(mine) && mine.options.length > 0) {
      seen.runner++;
      expect(mine.kind).toBe('trace_runner');
      expect(traceStepLabel(mine, true)).toBe(`Trace strength ${mine.trace.strength} · your link ${mine.trace.link} · spend ${mine.trace.needed} to stop it`);
      const zero = mine.options.find((o) => o.action.type === 'trace_bid' && o.action.credits === 0)!;
      p = h.submit(zero.action);
      if (p.kind !== 'same') return;
      expect(coverFor(p, null)).toBeNull();
    }
    const events = p.kind === 'same' ? p.events : [];
    const report = iceReport(events);
    expect(report).toMatch(/^Hunter: trace \d+ vs link \d+: (you escaped|you got 1 tag)\./);
  });

  it('the seeds above opened both bid windows at least once (the checks above ran)', () => {
    expect(seen.corp).toBeGreaterThan(0);
    expect(seen.runner).toBeGreaterThan(0);
  });
});
