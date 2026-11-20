// Sprint 15 (S-15-2, S-15-3): the movement planner, pure.
import type { GameEvent } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { MOTION, motionSpan, planMotion } from '../src/motion';

describe('planMotion', () => {
  it('flies a drawn card face up only to the drawer, a card back to the other side', () => {
    const mine: GameEvent[] = [{ type: 'card_drawn', player: 'runner', cardId: 'sure_gamble' }];
    expect(planMotion('runner', mine)).toEqual([
      expect.objectContaining({ kind: 'draw', cardId: 'sure_gamble', from: { at: 'deck', side: 'runner' }, to: { at: 'hand', side: 'runner' }, land: { counter: 'hand', side: 'runner' } }),
    ]);
    // Even a stray id in the other side's event is never shown.
    const theirs: GameEvent[] = [{ type: 'card_drawn', player: 'corp', cardId: 'hedge_fund' }];
    expect(planMotion('runner', theirs)[0]?.cardId).toBeNull();
  });

  it("a Corp install seen by the Runner (no cardId in the Runner's event) flies face down", () => {
    const e: GameEvent[] = [{ type: 'card_installed', player: 'corp', uid: 'c1', zone: 'ice', server: 'hq' }];
    const [f] = planMotion('runner', e);
    expect(f).toMatchObject({ kind: 'install', cardId: null, side: 'corp', from: { at: 'hand', side: 'corp' }, to: { at: 'installed', uid: 'c1' } });
    const own: GameEvent[] = [{ type: 'card_installed', player: 'corp', uid: 'c1', zone: 'ice', server: 'hq', handIndex: 2, cardId: 'ice_wall' }];
    expect(planMotion('corp', own)[0]).toMatchObject({ cardId: 'ice_wall', from: { at: 'hand', side: 'corp', index: 2 } });
  });

  it('a one-shot card flies to the middle, holds, then to its discard pile (one card, within the batch budget)', () => {
    const f = planMotion('runner', [{ type: 'card_played', player: 'runner', cardId: 'sure_gamble', handIndex: 0 }]);
    expect(f.map((x) => x.kind)).toEqual(['play', 'showcase']);
    expect(f[0]).toMatchObject({ to: { at: 'center' }, delayMs: 0 });
    expect(f[1]).toMatchObject({ from: { at: 'center' }, to: { at: 'discard', side: 'runner' }, land: { counter: 'discard', side: 'runner' } });
    expect(f[1]!.delayMs).toBe(MOTION.showcaseIn + MOTION.showcaseHold);
    expect(motionSpan(f)).toBeLessThanOrEqual(MOTION.batchMs);
  });

  it('hidden discards and Accelerated Beta Test trashes fly as card backs', () => {
    const f = planMotion('runner', [
      { type: 'cards_discarded', player: 'corp', count: 2 },
      { type: 'rd_cards_trashed', count: 1 },
    ]);
    expect(f.map((x) => x.cardId)).toEqual([null, null, null]);
    expect(f.map((x) => x.kind)).toEqual(['discard', 'discard', 'mill']);
  });

  it('the turn-change ripple (tighter gap) still goes one after another and starts its 4th card by 45 ms', () => {
    const e: GameEvent[] = [{ type: 'cards_discarded', player: 'runner', count: 4, handIndices: [0, 1, 2, 3], cardIds: ['a', 'b', 'c', 'd'] }];
    const delays = planMotion('runner', e, { stagger: MOTION.turnStagger }).map((x) => x.delayMs);
    expect(delays).toEqual([0, 1, 2, 3].map((i) => i * MOTION.turnStagger));
    expect(MOTION.turnStagger).toBeGreaterThan(0);
    expect(delays[3]!).toBeLessThanOrEqual(45);
  });

  it('several cards ripple one after another and the batch ends within 500 ms; past 4 the rest land at once', () => {
    const many: GameEvent[] = [{ type: 'cards_discarded', player: 'runner', count: 6, handIndices: [0, 1, 2, 3, 4, 5], cardIds: ['a', 'b', 'c', 'd', 'e', 'f'] }];
    const f = planMotion('runner', many);
    expect(f).toHaveLength(6);
    const delays = f.slice(0, 4).map((x) => x.delayMs);
    expect(delays[0]).toBe(0);
    for (let i = 1; i < 4; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    expect(f.slice(4).every((x) => x.durationMs === 0)).toBe(true);
    expect(motionSpan(f)).toBeLessThanOrEqual(MOTION.batchMs);
    // A play with draws in the same batch also stays in budget.
    const diesel = planMotion('runner', [
      { type: 'card_played', player: 'runner', cardId: 'diesel', handIndex: 0 },
      { type: 'card_drawn', player: 'runner', cardId: 'a' },
      { type: 'card_drawn', player: 'runner', cardId: 'b' },
      { type: 'card_drawn', player: 'runner', cardId: 'c' },
    ]);
    expect(motionSpan(diesel)).toBeLessThanOrEqual(MOTION.batchMs);
  });

  it('scores and steals fly to the right score pile; trashes to the right discard pile', () => {
    const f = planMotion('corp', [
      { type: 'agenda_scored', uid: 'u1', cardId: 'hostile_takeover', points: 1 },
      { type: 'agenda_stolen', cardId: 'priority_requisition', points: 3 },
      { type: 'card_trashed', cardId: 'pad_campaign', from: 'remote', uid: 'u2' },
      { type: 'rig_card_trashed', uid: 'u3', cardId: 'armitage_codebusting' },
    ]);
    expect(f.map((x) => [x.kind, x.to])).toEqual([
      ['score', { at: 'score', side: 'corp' }],
      ['steal', { at: 'score', side: 'runner' }],
      ['trash', { at: 'discard', side: 'corp' }],
      ['trash', { at: 'discard', side: 'runner' }],
    ]);
  });

  it('nothing to move: no flights, span 0', () => {
    expect(planMotion('corp', [{ type: 'credit_gained', player: 'corp', amount: 1 }])).toEqual([]);
    expect(motionSpan([])).toBe(0);
  });
});
