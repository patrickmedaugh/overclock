// Sprint 8 E3 (S-08-1): Haas-Bioroid: Engineering the Future and Kate "Mac" McCaffrey: Digital Tinker.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameEvent, type GameState } from '../src/index';
import { act, coreGame, finishTurn, newGame, rejection, withHand, withPlayer } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const installNew = (handIndex: number): Action => ({ type: 'install', player: 'corp', handIndex, server: 'new' });
const rigInstall = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });

/** Core game, Corp turn 1, with `hand` and `credits`. */
function corpTurn(hand: string[], credits = 5): GameState {
  return withPlayer(withHand(coreGame(11), 'corp', hand), 'corp', { credits, clicks: 3 });
}

/** Core game, Runner turn 2, with `hand`, `credits`, 4 clicks. */
function runnerTurn(hand: string[], credits = 5): GameState {
  return withPlayer(withHand(finishTurn(coreGame(11)).state, 'runner', hand), 'runner', { credits, clicks: 4 });
}

describe('S-08-1 AC1: both identities sit on the table, public', () => {
  it('both views show both identity cards (fixed uids) from the first board', () => {
    const s = coreGame(2);
    for (const viewer of ['corp', 'runner'] as const) {
      const v = viewFor(viewer, s);
      expect(v.players.corp.identity).toEqual({ uid: 'id:corp', cardId: 'c13' });
      expect(v.players.runner.identity).toEqual({ uid: 'id:runner', cardId: 'r13' });
    }
    expectRunnerViewClean(s, 'core start');
  });
});

describe('S-08-1 AC2: Haas-Bioroid gains 1 credit on the first install each turn', () => {
  it.each([
    ['ICE', 'c05'],
    ['agenda', 'c10'],
    ['asset', 'c14'],
    ['upgrade', 'c11'],
  ])('first install (%s) → card_installed, ability_triggered{id:corp, install}, credit_gained 1', (_t, id) => {
    const r = act(corpTurn([id, 'c01']), installNew(0));
    expect(r.events.slice(-3)).toEqual([
      expect.objectContaining({ type: 'card_installed', player: 'corp' }),
      { type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
    ]);
    expect(r.state.players.corp.credits).toBe(6);
  });

  it('the second install that turn gives nothing; the next Corp turn it works again', () => {
    let s = act(corpTurn(['c05', 'c06', 'c03']), installNew(0)).state;
    expect(s.players.corp.credits).toBe(6);
    const second = act(s, installNew(0));
    expect(types(second.events)).not.toContain('ability_triggered');
    expect(second.state.players.corp.credits).toBe(6);
    s = finishTurn(finishTurn(second.state).state).state; // Runner turn, then Corp turn 3
    expect(s.activePlayer).toBe('corp');
    s = withHand(s, 'corp', ['c03', ...s.players.corp.hand]);
    const before = s.players.corp.credits;
    const third = act(s, installNew(0));
    expect(third.state.players.corp.credits).toBe(before + 1);
    expect(third.events).toContainEqual({ type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' });
  });

  it('ICE paid for: credits_spent first, then the trigger (+1 after paying)', () => {
    let s = act(corpTurn(['c05', 'c05'], 5), installNew(0)).state; // remote1: Ice Wall
    s = finishTurn(finishTurn(s).state).state;
    s = withPlayer(withHand(s, 'corp', ['c04']), 'corp', { credits: 3 });
    const r = act(s, { type: 'install', player: 'corp', handIndex: 0, server: 'remote1' });
    expect(types(r.events)).toEqual(['credits_spent', 'card_installed', 'ability_triggered', 'credit_gained']);
    expect(r.state.players.corp.credits).toBe(3);
  });

  it('the Runner sees the trigger and the credit, never the installed card (face down); installedThisTurn stays hidden', () => {
    const r = act(corpTurn(['c14']), installNew(0));
    const seen = viewEvents('runner', r.events);
    expect(seen).toContainEqual({ type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' });
    expectRunnerEventsClean(r.events, 'HB install', r.state);
    expectRunnerViewClean(r.state, 'HB install');
    expect(r.state.players.corp.installedThisTurn).toEqual(['asset']);
    expect(JSON.stringify(viewFor('corp', r.state))).not.toMatch(/installedThisTurn/);
  });

  it('starter games have no identity: no trigger', () => {
    const s = withPlayer(withHand(newGame(11), 'corp', ['c05']), 'corp', { credits: 5 });
    const r = act(s, installNew(0));
    expect(types(r.events)).not.toContain('ability_triggered');
    expect(r.state.players.corp.credits).toBe(5);
  });
});

describe("S-08-1 AC3–5: Kate's first program or hardware each turn costs 1 less", () => {
  it('AC3: Corroder (cost 2) is offered at 1 (discount 1) and installing it takes 1 credit', () => {
    const s = runnerTurn(['r04']);
    const opt = viewFor('runner', s).handOptions[0]![0]!;
    expect(opt).toEqual({ action: rigInstall(0), cost: 1, reject: null, discount: 1 });
    const r = act(s, rigInstall(0));
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' },
      { type: 'credits_spent', player: 'runner', amount: 1 },
      expect.objectContaining({ type: 'card_installed', player: 'runner', cardId: 'r04' }),
    ]);
    expect(r.state.players.runner.credits).toBe(4);
  });

  it('AC4: after a program or hardware, the next one costs full price (no discount field)', () => {
    let s = act(runnerTurn(['r08', 'r04']), rigInstall(0)).state; // Cyberfeeder 2 → 1
    expect(s.players.runner.credits).toBe(4);
    expect(viewFor('runner', s).handOptions[0]![0]).toEqual({ action: rigInstall(0), cost: 2, reject: null });
    const r = act(s, rigInstall(0));
    expect(types(r.events)).not.toContain('ability_triggered');
    s = r.state;
    expect(s.players.runner.credits).toBe(2);
  });

  it('AC4: a resource first (Armitage Codebusting) does not use the discount up', () => {
    let s = act(runnerTurn(['r02', 'r04']), rigInstall(0)).state;
    expect(s.players.runner.credits).toBe(4); // Armitage cost 1, full price
    const opt = viewFor('runner', s).handOptions[0]![0]!;
    expect(opt.cost).toBe(1);
    expect(opt.discount).toBe(1);
    s = act(s, rigInstall(0)).state;
    expect(s.players.runner.credits).toBe(3);
  });

  it('AC5: Akamatsu Mem Chip (cost 1) first costs 0, never below 0; no credits_spent; the discount is used up', () => {
    const s = runnerTurn(['r09', 'r05'], 4);
    expect(viewFor('runner', s).handOptions[0]![0]).toEqual({ action: rigInstall(0), cost: 0, reject: null, discount: 1 });
    const r = act(s, rigInstall(0));
    expect(types(r.events)).toEqual(['ability_triggered', 'card_installed']);
    expect(r.state.players.runner.credits).toBe(4);
    expect(r.state.players.runner.installedThisTurn).toEqual(['hardware']);
    // Gordian Blade now costs its full 4.
    expect(viewFor('runner', r.state).handOptions[0]![0]).toEqual({ action: rigInstall(0), cost: 4, reject: null });
  });

  it('the discount decides affordability: Corroder with 1 credit is legal; Gordian Blade with 3 is legal (4 − 1)', () => {
    expect(rejection(apply(runnerTurn(['r04'], 1), rigInstall(0)).events)).toBeNull();
    expect(rejection(apply(runnerTurn(['r05'], 3), rigInstall(0)).events)).toBeNull();
    expect(rejection(apply(runnerTurn(['r05'], 2), rigInstall(0)).events)).toBe('no_credits');
    expect(legalActions(runnerTurn(['r05'], 3), 'runner')).toContainEqual(rigInstall(0));
  });

  it("the discount comes back each Runner turn; the Corp's turn resets both sides' counts", () => {
    let s = act(runnerTurn(['r09', 'r04']), rigInstall(0)).state;
    expect(viewFor('runner', s).handOptions[0]![0]!.cost).toBe(2);
    s = finishTurn(finishTurn(s).state).state; // Corp turn 3, Runner turn 4
    expect(s.activePlayer).toBe('runner');
    expect(s.players.runner.installedThisTurn).toEqual([]);
    s = withHand(s, 'runner', ['r04']);
    expect(viewFor('runner', s).handOptions[0]![0]).toMatchObject({ cost: 1, discount: 1 });
  });

  it("the Corp sees Kate's discount being used (public)", () => {
    const r = act(runnerTurn(['r04']), rigInstall(0));
    expect(viewEvents('corp', r.events)[0]).toEqual({ type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' });
  });

  it('starter games: no discount', () => {
    const s = withPlayer(withHand(finishTurn(newGame(11)).state, 'runner', ['r04']), 'runner', { credits: 5 });
    expect(viewFor('runner', s).handOptions[0]![0]).toEqual({ action: rigInstall(0), cost: 2, reject: null });
  });
});
