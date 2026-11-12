import { describe, expect, it } from 'vitest';
import { HotSeat, seedFromUrl } from '../src/hotseat';

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
    expect(p).toEqual({ kind: 'same', view: before, events: [{ type: 'action_rejected', reason: 'not_your_turn' }] });
    expect(h.seat).toBe('corp');
  });
});

describe('seedFromUrl', () => {
  it('reads ?seed=', () => {
    expect(seedFromUrl('?seed=123')).toBe(123);
    expect(Number.isInteger(seedFromUrl(''))).toBe(true);
  });
});
