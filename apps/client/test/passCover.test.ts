// S-06-5: when the "Pass the phone" cover goes up, played through real hot-seat games.
import { planToStep } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { HotSeat } from '../src/hotseat';
import { COVER_LINE, coverFor } from '../src/passCover';
import type { Presentation } from '../src/session';

/** Plays `seed` to `goal`, collecting every presentation with the decision shown before it. */
function play(seed: number, goal: Parameters<typeof planToStep>[1]) {
  const plan = planToStep(seed, goal);
  const h = new HotSeat(seed);
  const seen: { p: Presentation; before: 'corp' | 'runner' | null }[] = [];
  let shown = h.decision()?.seat ?? null;
  h.onPresent((p) => {
    seen.push({ p, before: shown });
    shown = p.kind === 'same' ? (p.decision?.seat ?? null) : null;
  });
  for (const a of plan.actions) h.submit(a);
  return { h, seen };
}

describe('coverFor', () => {
  it('ending a turn hands the phone to the next player', () => {
    const h = new HotSeat(7);
    expect(coverFor(h.submit({ type: 'gain_credit', player: 'corp' }), null)).toBeNull();
    expect(h.submit({ type: 'end_turn', player: 'corp' }).kind).toBe('same'); // the discard picker first
    const p = h.submit({ type: 'discard', player: 'corp', handIndices: [0] });
    expect(p.kind).toBe('handoff');
    expect(coverFor(p, null)).toEqual({ to: 'runner', title: 'Pass the phone to the Runner', line: COVER_LINE });
  });

  it("the Corp's rez decision mid-run: to the Corp first, then back to the Runner", () => {
    const { h, seen } = play(1, 'corp_rez_prompt');
    const last = seen.at(-1)!;
    expect(coverFor(last.p, last.before)).toEqual({ to: 'corp', title: 'Pass the phone to the Corp', line: COVER_LINE });
    // Before the prompt, no cover mid-run (only turn ends).
    const runStart = seen.findIndex((s) => s.p.kind === 'same' && s.p.view.run !== null);
    for (const s of seen.slice(runStart, -1)) expect(coverFor(s.p, s.before)).toBeNull();
    const after = h.submit({ type: 'pass', player: 'corp' });
    expect(coverFor(after, 'corp')).toEqual({ to: 'runner', title: 'Pass the phone back to the Runner', line: COVER_LINE });
  });

  it('a refused Corp choice keeps the Corp holding the phone (no cover)', () => {
    const { h } = play(1, 'corp_rez_prompt');
    expect(coverFor(h.submit({ type: 'rez', player: 'corp', uid: 'nope' }), 'corp')).toBeNull();
  });

  it('every turn change in a played game covers, and only for the player whose turn it is', () => {
    const { seen } = play(1, 'corp_rez_prompt');
    const handoffs = seen.filter((s) => s.p.kind === 'handoff');
    expect(handoffs.length).toBeGreaterThan(0);
    for (const s of handoffs) {
      if (s.p.kind !== 'handoff') continue;
      expect(coverFor(s.p, s.before)?.to).toBe(s.p.next);
      expect(s.p.nextView.activePlayer).toBe(s.p.next);
    }
  });
});

describe('HotSeat as a Session', () => {
  it('presents every submit to its listeners at once (same object it returns)', () => {
    const h = new HotSeat(7);
    const got: Presentation[] = [];
    const off = h.onPresent((p) => got.push(p));
    const p = h.submit({ type: 'draw', player: 'corp' });
    expect(got).toEqual([p]);
    off();
    h.submit({ type: 'draw', player: 'corp' });
    expect(got).toHaveLength(1);
    expect(h.kind).toBe('hotseat');
    expect(h.status()).toEqual({ connection: 'local', opponent: 'here' });
  });
});
