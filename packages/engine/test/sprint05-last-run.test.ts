// Sprint 5 E4 (S-05-1): `GameState.lastRun` / `PlayerView.lastRun`. The cards the Runner's
// most recent run accessed, in access order (stolen, trashed or left alike); the record
// starts afresh at every run start and is cleared when the Runner's turn ends. The Runner
// sees it only between runs and only when it has cards; the Corp never sees it.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, replay, viewFor, waitingOn, type Action, type GameState, type ServerId } from '../src/index';
import { act, board, run } from './helpers';

const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass: Action = { type: 'pass', player: 'runner' };
const steal = (card: number): Action => ({ type: 'steal', player: 'runner', card });
const trash = (card: number): Action => ({ type: 'trash', player: 'runner', card });
const endTurn: Action = { type: 'end_turn', player: 'runner' };

const lastOf = (s: GameState) => viewFor('runner', s).lastRun;

describe('S-05-1: Last run', () => {
  it('HQ: the accessed card is listed after the run; null during the run; never for the Corp', () => {
    const s = act(board({ corpHand: ['c02'] }), runOn('hq')).state;
    expect(s.run!.step).toBe('access');
    expect(s.lastRun).toEqual({ server: 'hq', cards: [{ cardId: 'c02', from: 'hq' }] });
    expect(lastOf(s)).toBeNull(); // a run is in progress
    expect(viewFor('corp', s).lastRun).toBeNull();
    const done = act(s, pass).state;
    expect(lastOf(done)).toEqual({ server: 'hq', cards: [{ cardId: 'c02', from: 'hq' }] });
    expect(viewFor('corp', done).lastRun).toBeNull();
  });

  it("R&D with The Maker's Eye: three cards in access order, stolen agenda kept", () => {
    // r07 = The Maker's Eye (run on R&D, 2 extra accesses).
    const s0 = board({ runnerHand: ['r07'], corpDeck: ['c02', 'c08', 'c05', 'c01'] });
    let s = act(s0, { type: 'play', player: 'runner', handIndex: 0 }).state;
    expect(s.run!.step).toBe('access');
    s = act(s, pass).state; // leave c02
    s = act(s, steal(0)).state; // steal Hostile Takeover
    s = act(s, pass).state; // leave c05: run ends
    expect(s.run).toBeNull();
    expect(lastOf(s)).toEqual({
      server: 'rd',
      cards: [
        { cardId: 'c02', from: 'rd' },
        { cardId: 'c08', from: 'rd' },
        { cardId: 'c05', from: 'rd' },
      ],
    });
  });

  it('Archives (all at once, face-down cards too) and a remote with a trashed asset', () => {
    const arch = run(board({ archives: ['c01', '+c02'] }), [runOn('archives'), pass]).state;
    expect(lastOf(arch)).toEqual({ server: 'archives', cards: [{ cardId: 'c01', from: 'archives' }, { cardId: 'c02', from: 'archives' }] });
    const remote = run(board({ servers: { remote1: { content: ['c03'] } }, runnerCredits: 5 }), [runOn('remote1'), trash(0)]).state;
    expect(remote.run).toBeNull();
    expect(lastOf(remote)).toEqual({ server: 'remote1', cards: [{ cardId: 'c03', from: 'remote' }] });
  });

  it('a central server with an upgrade: both cards, the server card first', () => {
    const s = run(board({ corpHand: ['c01'], servers: { hq: { content: ['c11'] } } }), [runOn('hq'), pass, pass]).state;
    expect(lastOf(s)).toEqual({ server: 'hq', cards: [{ cardId: 'c01', from: 'hq' }, { cardId: 'c11', from: 'hq' }] });
  });

  it('the next run replaces it; a run that accesses nothing shows nothing', () => {
    let s = run(board({ corpHand: ['c02'], servers: { remote1: { ice: ['+c05'] } } }), [runOn('hq'), pass]).state;
    expect(lastOf(s)?.cards).toHaveLength(1);
    s = run(s, [runOn('remote1'), pass]).state; // Ice Wall ends the run
    expect(s.run).toBeNull();
    expect(s.lastRun).toEqual({ server: 'remote1', cards: [] });
    expect(lastOf(s)).toBeNull();
    // Jacking out: likewise nothing.
    const j = run(board({ corpHand: ['c02'], servers: { hq: { ice: ['c05'] } }, corpCredits: 0 }), [
      runOn('archives'),
      runOn('hq'),
      { type: 'jack_out', player: 'runner' },
    ]).state;
    expect(lastOf(j)).toBeNull();
  });

  it("cleared when the Runner's turn ends (also after a hand-size discard); the Corp's turn end keeps nothing", () => {
    const s = run(board({ corpHand: ['c02'] }), [runOn('hq'), pass]).state;
    const ended = act(s, endTurn);
    expect(ended.events.map((e) => e.type)).toContain('turn_ended');
    expect(ended.state.lastRun).toBeNull();
    expect(lastOf(ended.state)).toBeNull();
    const big = run(board({ corpHand: ['c02'], runnerHand: ['r01', 'r01', 'r01', 'r01', 'r01', 'r01', 'r01'] }), [runOn('hq'), pass, endTurn]).state;
    expect(big.phase).toBe('discard');
    expect(lastOf(big)?.cards).toEqual([{ cardId: 'c02', from: 'hq' }]); // turn not over yet
    const after = act(big, { type: 'discard', player: 'runner', handIndices: [0, 1] }).state;
    expect(after.lastRun).toBeNull();
  });

  it('a new game starts with none; replay rebuilds the same record', () => {
    expect(newGame(5).lastRun).toBeNull();
    // A short random game with runs: replay gives the same state, lastRun included.
    let s = newGame(9);
    const actions: Action[] = [];
    let x = 9;
    for (let i = 0; i < 300 && s.phase !== 'over'; i++) {
      const legal = legalActions(s, waitingOn(s)!);
      x = (x * 1103515245 + 12345) >>> 0;
      const runs = legal.filter((a) => a.type === 'run');
      const a = runs.length > 0 && x % 3 === 0 ? runs[x % runs.length]! : legal[x % legal.length]!;
      actions.push(a);
      s = apply(s, a).state;
    }
    expect(replay(9, actions).state).toEqual(s);
  });
});
