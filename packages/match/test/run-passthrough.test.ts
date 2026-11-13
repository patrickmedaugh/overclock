// Sprint 3 E6: LocalMatch passes runs through: the Corp seat answers the rez
// question during the Runner's turn, each seat gets only its own projection,
// rejections go to the submitting seat, and the log replays.
import { replay, viewFor, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { planToStep } from '../src/testing';

function toStep(seed: number, goal: Parameters<typeof planToStep>[1]) {
  const plan = planToStep(seed, goal);
  const m = new LocalMatch(seed);
  for (const a of plan.actions) m.submit(a.player, a);
  return { plan, m };
}

describe('LocalMatch passes runs through', () => {
  it('the Corp seat decides the rez during the Runner turn; the Runner seat never sees the unrezzed ICE id', () => {
    const { plan, m } = toStep(3, 'corp_rez_prompt');
    const corp = m.view('corp');
    const runner = m.view('runner');
    expect(corp.activePlayer).toBe('runner');
    expect(corp.run!.waitingOn).toBe('corp');
    const iceId = corp.run!.ice!.cardId!;
    expect(iceId).toMatch(/^c\d\d$/);
    expect(runner.run!.ice).toEqual({ cardId: null, strength: null, subroutines: [] });
    expect(runner.run!.options).toEqual([]);
    expect(JSON.stringify(runner.run)).not.toContain(iceId);
    expect(runner.corpServers.flatMap((sv) => sv.ice).find((c) => c.uid === plan.info.iceUid)!.cardId).toBeNull();

    // The Runner seat may not answer for the Corp (seat mismatch), nor as itself (not its decision).
    expect(m.submit('runner', { type: 'pass', player: 'corp' }).runner.events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
    const notYours = m.submit('runner', { type: 'pass', player: 'runner' });
    expect(notYours.runner.events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
    expect(notYours.corp.events).toEqual([]);

    // The Corp seat rezzes: both seats see it, each in its own projection.
    const rez = corp.run!.options.find((o) => o.action.type === 'rez')!.action;
    const u = m.submit('corp', rez);
    expect(u.runner.events).toContainEqual({ type: 'ice_rezzed', uid: plan.info.iceUid, cardId: iceId });
    expect(u.corp.events).toContainEqual({ type: 'ice_rezzed', uid: plan.info.iceUid, cardId: iceId });
    expect(u.runner.view.run!.waitingOn).toBe('runner');
    expect(u.runner.view.run!.ice!.cardId).toBe(iceId);
    expect(u.runner.view).toEqual(m.view('runner'));

    // The log (rejections included) replays to the same game.
    expect(viewFor('runner', replay(3, m.actions()).state)).toEqual(m.view('runner'));
  });

  it('R&D access: the Runner seat gets the card id, the Corp seat does not', () => {
    const m = new LocalMatch(9);
    // Corp ends its turn (discarding if needed), then the Runner runs R&D (no ICE).
    m.submit('corp', { type: 'end_turn', player: 'corp' });
    const v = m.view('corp');
    if (v.pendingDiscard > 0) m.submit('corp', { type: 'discard', player: 'corp', handIndices: [0] });
    const u = m.submit('runner', { type: 'run', player: 'runner', server: 'rd' } as Action);
    const r = u.runner.events.find((e) => e.type === 'card_accessed');
    const c = u.corp.events.find((e) => e.type === 'card_accessed');
    expect(r).toMatchObject({ from: 'rd', cardId: expect.stringMatching(/^c\d\d$/) });
    expect(c).toEqual({ type: 'card_accessed', from: 'rd' });
    expect(u.corp.view.run!.access!.cards[0]!.cardId).toBeNull();
    expect(u.runner.view.run!.access!.cards[0]!.cardId).toBe((r as { cardId: string }).cardId);
  });
});
