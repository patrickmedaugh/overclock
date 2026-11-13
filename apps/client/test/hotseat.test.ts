import { planToStep } from '@overclock/match/testing';
import { describe, expect, it } from 'vitest';
import { HotSeat, seedFromUrl } from '../src/hotseat';

/** A HotSeat played to `goal` with the planned actions (each submitted as its own player). */
function hotSeatAt(seed: number, goal: Parameters<typeof planToStep>[1]) {
  const plan = planToStep(seed, goal);
  const h = new HotSeat(seed);
  for (const a of plan.actions) {
    const p = h.submit(a);
    const events = p.kind === 'same' ? p.events : p.actorEvents;
    expect(events.find((e) => e.type === 'action_rejected')).toBeUndefined();
  }
  return { h, plan };
}

describe('HotSeat', () => {
  it('starts on the Corp seat (Corp goes first) and hides the Runner hand', () => {
    const h = new HotSeat(7);
    expect(h.seat).toBe('corp');
    const v = h.view();
    expect(v.viewer).toBe('corp');
    expect(v.players.corp.hand).toHaveLength(6);
    expect(v.players.runner.hand).toBeNull();
  });

  it('a click action keeps the seat and returns the actor events', () => {
    const h = new HotSeat(7);
    const p = h.submit({ type: 'gain_credit', player: 'corp' });
    expect(p.kind).toBe('same');
    if (p.kind !== 'same') return;
    expect(p.events).toEqual([{ type: 'credit_gained', player: 'corp', amount: 1 }]);
    expect(h.lastEvents()).toEqual(p.events);
  });

  it('end_turn flips the bottom seat and splits events at turn_ended', () => {
    const h = new HotSeat(7);
    // The Corp holds 6 after its free draw, so it discards 1 first.
    expect(h.submit({ type: 'end_turn', player: 'corp' }).kind).toBe('same');
    const p = h.submit({ type: 'discard', player: 'corp', handIndices: [0] });
    expect(p.kind).toBe('handoff');
    if (p.kind !== 'handoff') return;
    expect(h.seat).toBe('runner');
    expect(p.actor).toBe('corp');
    expect(p.next).toBe('runner');
    expect(p.actorEvents.at(-1)).toEqual({ type: 'turn_ended', player: 'corp' });
    expect(p.nextEvents).toEqual([{ type: 'turn_started', player: 'runner', turn: 2, clicks: 4 }]);
    expect(p.nextView.viewer).toBe('runner');
    expect(h.view().viewer).toBe('runner');

    // Runner -> Corp: the Corp's free draw belongs to the new seat's part, with its card id.
    const q = h.submit({ type: 'end_turn', player: 'runner' });
    expect(q.kind).toBe('handoff');
    if (q.kind !== 'handoff') return;
    expect(q.nextEvents.map((e) => e.type)).toEqual(['turn_started', 'card_drawn']);
    expect(q.nextEvents[1]).toHaveProperty('cardId');
    expect(h.seat).toBe('corp');
  });

  it('the hand-limit step keeps the seat until the discard is sent', () => {
    const h = new HotSeat(7);
    for (let i = 0; i < 3; i++) h.submit({ type: 'draw', player: 'corp' });
    const p = h.submit({ type: 'end_turn', player: 'corp' });
    expect(p.kind).toBe('same');
    expect(h.view().pendingDiscard).toBe(4);
    const q = h.submit({ type: 'discard', player: 'corp', handIndices: [0, 1, 2, 3] });
    expect(q.kind).toBe('handoff');
    if (q.kind !== 'handoff') return;
    expect(q.actorEvents.map((e) => e.type)).toEqual(['cards_discarded', 'turn_ended']);
    expect(q.actorView.players.corp.discardCount).toBe(4);
  });

  it('a seat acting out of turn gets its rejection; the bottom seat is unchanged', () => {
    const h = new HotSeat(7);
    const before = h.view();
    const p = h.submit({ type: 'draw', player: 'runner' });
    expect(p).toEqual({ kind: 'same', view: before, events: [{ type: 'action_rejected', reason: 'not_your_turn' }], decision: null });
    expect(h.seat).toBe('corp');
  });
});

describe('HotSeat during a run (Q1 A: the Corp decides on the shared board)', () => {
  it('the Runner stays at the bottom; the Corp seat\'s own rez options come as the decision, with the ICE name and cost', () => {
    const { h, plan } = hotSeatAt(1, 'corp_rez_prompt');
    expect(h.seat).toBe('runner');
    const v = h.view();
    expect(v.viewer).toBe('runner');
    expect(v.run?.waitingOn).toBe('corp');
    // The Runner seat's own view: no options, and the face-down ICE stays unknown.
    expect(v.run?.options).toEqual([]);
    expect(v.run?.ice?.cardId ?? null).toBeNull();
    const d = h.decision();
    expect(d?.seat).toBe('corp');
    expect(d?.run.iceUid).toBe(plan.info.iceUid);
    expect(d?.run.ice?.cardId).toBeTruthy();
    expect(d?.run.options.map((o) => o.action.type)).toEqual(['rez', 'pass']);
    expect(d?.run.options.every((o) => o.action.player === 'corp')).toBe(true);
    // The decision is a separate object: the Runner's view was not merged with it.
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(d?.run.ice?.cardId));
  });

  it('a Corp decision animates the Runner seat\'s projection and keeps the Runner at the bottom', () => {
    const { h } = hotSeatAt(1, 'corp_rez_prompt');
    const rez = h.decision()!.run.options.find((o) => o.action.type === 'rez')!;
    const p = h.submit(rez.action);
    expect(p.kind).toBe('same');
    if (p.kind !== 'same') return;
    expect(p.view.viewer).toBe('runner');
    expect(p.events.map((e) => e.type)).toContain('ice_rezzed');
    expect(p.decision).toBeNull();
    // The actor's own events are still what lastEvents() returns (test hook contract).
    expect(h.lastEvents().map((e) => e.type)).toContain('ice_rezzed');
  });

  it("a refused Corp decision shows the Corp's rejection on the shared board", () => {
    const { h } = hotSeatAt(1, 'corp_rez_prompt');
    const p = h.submit({ type: 'rez', player: 'corp', uid: 'nope' });
    expect(p.kind).toBe('same');
    if (p.kind !== 'same') return;
    expect(p.events).toEqual([{ type: 'action_rejected', reason: 'bad_target' }]);
    expect(p.decision?.seat).toBe('corp');
  });

  it("Don't rez: the decision goes away and the Runner decides again", () => {
    const { h } = hotSeatAt(1, 'corp_rez_prompt');
    const p = h.submit({ type: 'pass', player: 'corp' });
    expect(p.kind).toBe('same');
    expect(h.decision()).toBeNull();
    expect(h.view().run === null || h.view().run?.waitingOn === 'runner').toBe(true);
  });

  it('no decision outside a run', () => {
    expect(new HotSeat(7).decision()).toBeNull();
  });
});

describe('seedFromUrl', () => {
  it('reads ?seed=', () => {
    expect(seedFromUrl('?seed=123')).toBe(123);
    expect(Number.isInteger(seedFromUrl(''))).toBe(true);
  });
});
