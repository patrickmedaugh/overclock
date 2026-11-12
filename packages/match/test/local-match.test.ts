import { newGame, replay, viewFor, type Action } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';

const endTurn = (player: 'corp' | 'runner'): Action => ({ type: 'end_turn', player });

describe('LocalMatch', () => {
  it('starts a new game for the seed; view(seat) is that seat projection', () => {
    const m = new LocalMatch(42);
    expect(m.seed).toBe(42);
    expect(m.view('corp')).toEqual(viewFor('corp', newGame(42)));
    expect(m.view('runner')).toEqual(viewFor('runner', newGame(42)));
    expect(m.actions()).toEqual([]);
  });

  it('accepted action: both seats get their own view and viewEvents-projected events', () => {
    const m = new LocalMatch(1);
    const u = m.submit('corp', { type: 'draw', player: 'corp' });
    const drawn = u.corp.events[0];
    expect(drawn).toMatchObject({ type: 'card_drawn', player: 'corp' });
    expect(drawn && 'cardId' in drawn && typeof drawn.cardId).toBe('string');
    expect(u.runner.events).toEqual([{ type: 'card_drawn', player: 'corp' }]);
    expect(u.corp.view).toEqual(m.view('corp'));
    expect(u.runner.view).toEqual(m.view('runner'));
    expect(u.corp.view.players.corp.handCount).toBe(7);
    expect(u.runner.view.players.corp.hand).toBeNull();
  });

  it('S-01-2 AC4: seat != action.player -> invalid_action to that seat only, state unchanged, not logged', () => {
    const m = new LocalMatch(1);
    const before = { corp: m.view('corp'), runner: m.view('runner') };
    // The Runner seat tries to act as the Corp (whose turn it is).
    const u = m.submit('runner', { type: 'draw', player: 'corp' });
    expect(u.runner.events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
    expect(u.corp.events).toEqual([]);
    expect(m.view('corp')).toEqual(before.corp);
    expect(m.view('runner')).toEqual(before.runner);
    expect(m.actions()).toEqual([]);
  });

  it('S-01-2 AC4: off-turn seat acting as itself -> not_your_turn to that seat only, state unchanged', () => {
    const m = new LocalMatch(1);
    const before = m.view('runner');
    for (const a of [
      { type: 'draw', player: 'runner' },
      { type: 'gain_credit', player: 'runner' },
      { type: 'end_turn', player: 'runner' },
      { type: 'discard', player: 'runner', handIndices: [0] },
    ] as Action[]) {
      const u = m.submit('runner', a);
      expect(u.runner.events).toEqual([{ type: 'action_rejected', reason: 'not_your_turn' }]);
      expect(u.corp.events).toEqual([]);
    }
    expect(m.view('runner')).toEqual(before);
  });

  it('malformed input never throws and is rejected as invalid_action', () => {
    const m = new LocalMatch(1);
    const cyclic: Record<string, unknown> = { type: 'draw', player: 'corp' };
    cyclic.self = cyclic;
    for (const bad of [null, undefined, 7, {}, { type: 'nope', player: 'corp' }, cyclic]) {
      const u = m.submit('corp', bad as unknown as Action);
      expect(u.corp.events).toEqual([{ type: 'action_rejected', reason: 'invalid_action' }]);
      expect(u.runner.events).toEqual([]);
    }
    expect(m.view('corp')).toEqual(viewFor('corp', newGame(1)));
  });

  it('Corp discards reach the Runner face down; turn change is seen by both', () => {
    const m = new LocalMatch(5);
    m.submit('corp', endTurn('corp')); // 6 cards -> discard 1
    expect(m.view('corp').pendingDiscard).toBe(1);
    expect(m.view('runner').pendingDiscard).toBe(0);
    const u = m.submit('corp', { type: 'discard', player: 'corp', handIndices: [2] });
    expect(u.corp.events[0]).toMatchObject({ type: 'cards_discarded', count: 1, handIndices: [2] });
    expect(u.runner.events[0]).toEqual({ type: 'cards_discarded', player: 'corp', count: 1 });
    for (const seat of ['corp', 'runner'] as const) {
      expect(u[seat].events.slice(1)).toEqual([
        { type: 'turn_ended', player: 'corp' },
        { type: 'turn_started', player: 'runner', turn: 2, clicks: 4 },
      ]);
      expect(u[seat].view.activePlayer).toBe('runner');
    }
    expect(u.runner.view.players.corp.discard).toEqual([null]);
    expect(u.runner.view.players.corp.discardCount).toBe(1);
  });

  it('S-02-1 AC6: a Corp install reaches the Runner seat without card ids; the Corp seat sees its card', () => {
    const m = new LocalMatch(8);
    const hand = m.view('corp').players.corp.hand ?? [];
    const opt = m.view('corp').handOptions.flat().find((o) => o.action.type === 'install' && o.reject === null);
    expect(opt).toBeDefined();
    const u = m.submit('corp', opt!.action);
    const installed = u.corp.events.find((e) => e.type === 'card_installed');
    const handIndex = opt!.action.type === 'install' ? opt!.action.handIndex : -1;
    expect(installed).toMatchObject({ player: 'corp', cardId: hand[handIndex], handIndex });
    const theirs = u.runner.events.find((e) => e.type === 'card_installed');
    expect(theirs).toBeDefined();
    expect(theirs).not.toHaveProperty('cardId');
    expect(theirs).not.toHaveProperty('handIndex');
    expect(JSON.stringify(u.runner)).not.toMatch(/"c\d\d"/);
    const servers = u.runner.view.corpServers.flatMap((sv) => [...sv.ice, ...sv.content]);
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({ cardId: null, faceUp: false });
  });

  it('S-02-3 AC6: a Runner install reaches the Corp seat face up', () => {
    const m = new LocalMatch(8);
    m.submit('corp', endTurn('corp'));
    if (m.view('corp').pendingDiscard) m.submit('corp', { type: 'discard', player: 'corp', handIndices: [0] });
    const opt = m.view('runner').handOptions.flat().find((o) => o.action.type === 'install' && o.reject === null);
    expect(opt).toBeDefined();
    const u = m.submit('runner', opt!.action);
    const theirs = u.corp.events.find((e) => e.type === 'card_installed');
    expect(theirs).toMatchObject({ player: 'runner', zone: 'rig' });
    expect(theirs).toHaveProperty('cardId');
    expect(theirs).not.toHaveProperty('handIndex');
    expect(u.corp.view.rig[0]).toMatchObject({ faceUp: true });
    expect(u.corp.view.rig[0]?.cardId).toMatch(/^r\d\d$/);
  });

  it('actions() + replay(seed, actions) rebuilds the same game (rejections included as no-ops)', () => {
    const m = new LocalMatch(99);
    const script: Array<['corp' | 'runner', Action]> = [
      ['corp', { type: 'gain_credit', player: 'corp' }],
      ['runner', { type: 'draw', player: 'runner' }], // not_your_turn: logged, no-op
      ['runner', { type: 'draw', player: 'corp' }], // seat mismatch: not logged
      ['corp', endTurn('corp')],
      ['corp', { type: 'discard', player: 'corp', handIndices: [0] }],
      ['runner', { type: 'gain_credit', player: 'runner' }],
      ['runner', endTurn('runner')],
    ];
    for (const [seat, a] of script) m.submit(seat, a);
    const log = m.actions();
    expect(log).toHaveLength(6);
    const rebuilt = replay(99, log).state;
    expect(viewFor('corp', rebuilt)).toEqual(m.view('corp'));
    expect(viewFor('runner', rebuilt)).toEqual(m.view('runner'));
    expect(rebuilt.turn).toBe(3);
  });

  it('the log is detached from caller objects', () => {
    const m = new LocalMatch(1);
    const a = { type: 'discard', player: 'corp', handIndices: [0] } as { type: 'discard'; player: 'corp'; handIndices: number[] };
    m.submit('corp', endTurn('corp'));
    m.submit('corp', a);
    a.handIndices.push(3);
    (m.actions() as Action[]).pop();
    expect(m.actions()[1]).toEqual({ type: 'discard', player: 'corp', handIndices: [0] });
  });
});
