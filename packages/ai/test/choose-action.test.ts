import { apply, newGame, viewFor, waitingOn, type Action, type GameState } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/index';

describe('chooseAction (stub)', () => {
  it('returns a legal action from the view', () => {
    const view = viewFor('corp', newGame(1));
    const action = chooseAction(view);
    expect(view.legalActions).toContainEqual(action);
  });

  it('returns null when no action is legal (not its turn)', () => {
    expect(chooseAction(viewFor('runner', newGame(1)))).toBeNull();
  });

  it('can play both sides through whole turns, including the discard step, without a rejection', () => {
    let s = newGame(3);
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      const action = chooseAction(viewFor(s.activePlayer, s)) as Action;
      expect(action).not.toBeNull();
      const r = apply(s, action);
      expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
      s = r.state;
    }
    expect(s.turn).toBeGreaterThan(2);
  });

  it('Sprint 3: answers run decisions from the deciding seat view (rez question, encounter, access)', () => {
    let s: GameState = newGame(2);
    s = apply(s, { type: 'end_turn', player: 'corp' }).state;
    if (s.phase === 'discard') s = apply(s, { type: 'discard', player: 'corp', handIndices: [0] }).state;
    s = apply(s, { type: 'run', player: 'runner', server: 'hq' }).state;
    expect(s.phase).toBe('run');
    for (let i = 0; i < 10 && s.phase === 'run'; i++) {
      const decider = waitingOn(s)!;
      const view = viewFor(decider, s);
      expect(view.run!.waitingOn).toBe(decider);
      const action = chooseAction(view) as Action;
      expect(view.legalActions).toContainEqual(action);
      const r = apply(s, action);
      expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
      s = r.state;
    }
    expect(s.phase).toBe('action');
  });

  describe('Sprint 4: free-rez choice (Priority Requisition)', () => {
    /** Corp turn 1: Ice Wall (i1, cost 1), Neural Katana (i2, cost 4), Enigma (i3, cost 3), PR (i4) ready; scored. */
    function choiceState(): GameState {
      let s = newGame(21);
      s = { ...s, players: { ...s.players, corp: { ...s.players.corp, hand: ['c05', 'c07', 'c06', 'c10'], clicks: 4 } } };
      for (let k = 0; k < 4; k++) s = apply(s, { type: 'install', player: 'corp', handIndex: 0, server: 'new' }).state;
      s = { ...s, servers: s.servers.map((sv) => ({ ...sv, content: sv.content.map((c) => ({ ...c, advancements: 5 })) })) };
      s = apply(s, { type: 'score', player: 'corp', uid: 'i4' }).state;
      expect(s.phase).toBe('choice');
      return s;
    }

    it('the deciding Corp view: rezzes the costliest offered ICE (Neural Katana), a legal action', () => {
      const s = choiceState();
      expect(waitingOn(s)).toBe('corp');
      const view = viewFor('corp', s);
      const action = chooseAction(view);
      expect(action).toEqual({ type: 'rez', player: 'corp', uid: 'i2' });
      expect(view.legalActions).toContainEqual(action);
      const r = apply(s, action!);
      expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
      expect(r.state.phase).toBe('action');
    });

    it('skips when only Skip is offered; the Runner view has nothing to do', () => {
      const s = choiceState();
      const view = viewFor('corp', s);
      const onlySkip = { ...view, choice: { ...view.choice!, options: view.choice!.options.filter((o) => o.action.type === 'pass') } };
      expect(chooseAction(onlySkip)).toEqual({ type: 'pass', player: 'corp' });
      expect(chooseAction(viewFor('runner', s))).toBeNull();
    });
  });
});
