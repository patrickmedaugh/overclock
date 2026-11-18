// Sprint 12 E4 (S-12-3, S-12-4): The Toolbox (memory, link, 2 recurring credits for icebreakers), Modded
// (install from the Grip 3 cheaper, Kate's discount still applies, no extra click) and Infiltration
// (Gain 2 credits or expose a face-down Corp card: public, nothing changes).
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameState } from '../src/index';
import { finishTurn, rejection } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';
import { s12Board, step } from './s12';

const TOOLBOX = 'r19';
const MODDED = 'r20';
const INFILTRATION = 'r21';
const KATE = { type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' } as const;
const modded = (handIndex: number, installIndex?: number): Action =>
  ({ type: 'play', player: 'runner', handIndex, ...(installIndex !== undefined ? { installIndex } : {}) }) as Action;
const infiltrate = (handIndex: number, mode?: number, uid?: string): Action =>
  ({ type: 'play', player: 'runner', handIndex, ...(mode !== undefined ? { mode } : {}), ...(uid !== undefined ? { uid } : {}) }) as Action;

describe('S-12-3/S-12-4: card data (2012 text, core.json numbers)', () => {
  it('The Toolbox: Shaper hardware 9, influence 2, unique, +2 memory +2 link, 2 recurring credits for icebreakers', () => {
    expect(getCard(TOOLBOX)).toMatchObject({
      name: 'The Toolbox',
      type: 'hardware',
      faction: 'shaper',
      influence: 2,
      code: '01041',
      unique: true,
      cost: 9,
      text: '+2 memory. +2 link.\n2 recurring credits.\nUse these credits to pay for using icebreakers.',
      memoryBonus: 2,
      link: 2,
      recurringCredits: { amount: 2, for: 'icebreaker' },
    });
  });

  it('Modded: Shaper event 0, influence 2; Infiltration: neutral event 0, two modes', () => {
    expect(getCard(MODDED)).toMatchObject({
      type: 'event',
      faction: 'shaper',
      influence: 2,
      code: '01035',
      cost: 0,
      text: 'Install a program or piece of hardware, lowering the install cost by 3.',
      playIf: 'has_install_target',
      onPlay: [{ op: 'install_from_hand', types: ['program', 'hardware'], discount: 3 }],
    });
    expect(getCard(INFILTRATION)).toMatchObject({
      type: 'event',
      faction: 'neutral',
      influence: 0,
      code: '01049',
      cost: 0,
      text: 'Gain 2 credits or expose 1 card.',
      modes: [
        { label: 'Gain 2 credits', effects: [{ op: 'gain_credits', amount: 2 }] },
        { label: 'Expose 1 card', effects: [{ op: 'expose' }] },
      ],
    });
  });
});

describe('S-12-3 AC1: installing The Toolbox', () => {
  it('Kate pays 8: memory +2 (limit 6), link +2 (3), 2 credits on it', () => {
    const s = s12Board('runner', { runnerHand: [TOOLBOX], runnerCredits: 8 });
    expect(viewFor('runner', s).handOptions[0]).toEqual([{ action: { type: 'install', player: 'runner', handIndex: 0 }, cost: 8, reject: null, discount: 1 }]);
    const r = step(s, { type: 'install', player: 'runner', handIndex: 0 });
    expect(r.events).toEqual([
      KATE,
      { type: 'credits_spent', player: 'runner', amount: 8 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 0, cardId: TOOLBOX },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 2 },
    ]);
    const v = viewFor('corp', r.state);
    expect(v.memory).toEqual({ used: 0, limit: 6 });
    expect(v.players.runner.link).toBe(3);
    expect(v.rig[0]).toMatchObject({ cardId: TOOLBOX, hostedCredits: 2 });
  });
});

describe('S-12-3 AC2: The Toolbox pays icebreakers (breaks and pumps) only; refills at turn start', () => {
  /** Runner turn: Toolbox (i1, 2 credits), Corroder (i2); remote1 = rezzed Wall of Static (i3); 0 own credits. */
  const wall = (credits = 0, more: string[] = []) =>
    step(
      s12Board('runner', { rig: [TOOLBOX, 'r04', ...more], hosted: { i1: 2 }, servers: { remote1: { ice: ['+c04'] } }, runnerCredits: credits }),
      { type: 'run', player: 'runner', server: 'remote1' },
    ).state;

  it('pump and break with 0 own credits: both paid from The Toolbox (hostedPay), then the run goes on', () => {
    let s = wall();
    const pump = viewFor('runner', s).run!.options.find((o) => o.action.type === 'use_ability' && o.action.ability === 1)!;
    expect(pump).toMatchObject({ cost: 1, reject: null, hostedPay: [{ uid: 'i1', amount: 1 }] });
    const r = step(s, pump.action);
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 1 },
    ]);
    s = r.state;
    const brk = step(s, { type: 'use_ability', player: 'runner', uid: 'i2', ability: 0, sub: 0 });
    expect(brk.events.slice(0, 2)).toEqual([
      { type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 0 },
    ]);
    expect(brk.state.players.runner.credits).toBe(0);
    expect(brk.state.run?.step).toBe('continue');
  });

  it('with Cyberfeeder too: rig order (Toolbox first), then own credits', () => {
    const s = wall(1, ['r08']);
    const st = { ...s, rig: s.rig.map((c) => (c.cardId === 'r08' ? { ...c, hostedCredits: 1 } : c)) };
    const opts = viewFor('runner', st).run!.options;
    expect(opts.find((o) => o.action.type === 'use_ability' && o.action.ability === 1)!.hostedPay).toEqual([{ uid: 'i1', amount: 1 }]);
  });

  it('never trash costs or installs: 0 own credits cannot trash a 2-credit asset or install a 1-credit card', () => {
    let s = s12Board('runner', { rig: [TOOLBOX], hosted: { i1: 2 }, servers: { remote1: { content: ['c03'] } }, runnerCredits: 0, runnerHand: ['r02'] });
    expect(rejection(apply(s, { type: 'install', player: 'runner', handIndex: 0 }).events)).toBe('no_credits');
    s = step(s, { type: 'run', player: 'runner', server: 'remote1' }).state;
    expect(viewFor('runner', s).run!.options[0]).toMatchObject({ action: { type: 'trash', card: 0 }, cost: 4, reject: 'no_credits' });
  });

  it('refills to 2 when the Runner\'s turn begins (never more)', () => {
    let s = s12Board('runner', { rig: [TOOLBOX], hosted: { i1: 0 } });
    s = finishTurn(s).state; // Corp turn 3
    expect(s.rig[0]!.hostedCredits).toBe(0);
    const r = finishTurn(s); // Runner turn 4
    expect(r.events).toContainEqual({ type: 'hosted_credits_changed', uid: 'i1', credits: 2 });
    expect(r.state.rig[0]!.hostedCredits).toBe(2);
    const full = finishTurn(finishTurn(r.state).state);
    expect(full.events.some((e) => e.type === 'hosted_credits_changed')).toBe(false);
  });
});

describe('S-12-3 AC3: Modded installs from the Grip 3 cheaper (0 floor), Kate still applies, no extra click', () => {
  it('options: one play per Grip program/hardware with its price and discount; events and click', () => {
    // Grip: Modded, Battering Ram (5), Sure Gamble, Akamatsu Mem Chip (1), The Toolbox (9).
    const s = s12Board('runner', { runnerHand: [MODDED, 'r17', 'r14', 'r09', TOOLBOX], runnerCredits: 5 });
    const opts = viewFor('runner', s).handOptions[0]!;
    expect(opts).toEqual([
      { action: modded(0, 1), cost: 1, reject: null, discount: 4 },
      { action: modded(0, 3), cost: 0, reject: null, discount: 1 },
      { action: modded(0, 4), cost: 5, reject: null, discount: 4 },
    ]);
    const r = step(s, modded(0, 4));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'runner', cardId: MODDED, handIndex: 0 },
      KATE,
      { type: 'credits_spent', player: 'runner', amount: 5 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 3, cardId: TOOLBOX },
      { type: 'hosted_credits_changed', uid: 'i1', credits: 2 },
    ]);
    expect(r.state.players.runner).toMatchObject({ clicks: 3, credits: 0, hand: ['r17', 'r14', 'r09'] });
    expect(r.state.players.runner.discard).toEqual([{ cardId: MODDED, faceUp: true }]);
    expect(viewEvents('corp', r.events)).toContainEqual({ type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', cardId: TOOLBOX });
  });

  it('installIndex before Modded in the hand: same card, index unchanged', () => {
    const s = s12Board('runner', { runnerHand: ['r04', MODDED], runnerCredits: 0 });
    const r = step(s, modded(1, 0));
    expect(r.events).toContainEqual({ type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 0, cardId: 'r04' });
    expect(r.state.players.runner.hand).toEqual([]);
  });

  it('it is the turn\'s first install for Kate: a later program pays full price; Kate already used = only 3 off', () => {
    let s = s12Board('runner', { runnerHand: [MODDED, 'r09', 'r04', MODDED, 'r17'], runnerCredits: 10 });
    s = step(s, modded(0, 1)).state; // Akamatsu: 1 − 3 − 1 → 0, Kate used up
    expect(viewFor('runner', s).handOptions[0]).toEqual([{ action: { type: 'install', player: 'runner', handIndex: 0 }, cost: 2, reject: null }]);
    expect(viewFor('runner', s).handOptions[1]).toEqual([
      { action: modded(1, 0), cost: 0, reject: null, discount: 2 },
      { action: modded(1, 2), cost: 2, reject: null, discount: 3 },
    ]);
    const r = step(s, modded(1, 2));
    expect(r.events.some((e) => e.type === 'ability_triggered')).toBe(false);
    expect(r.events).toContainEqual({ type: 'credits_spent', player: 'runner', amount: 2 });
  });

  it('a 0 price shows no credits_spent; Kate is not reported when Modded alone made it free', () => {
    const r = step(s12Board('runner', { runnerHand: [MODDED, 'r04'] }), modded(0, 1));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'runner', cardId: MODDED, handIndex: 0 },
      { type: 'card_installed', player: 'runner', uid: 'i1', zone: 'rig', handIndex: 0, cardId: 'r04' },
    ]);
    expect(r.state.players.runner.installedThisTurn).toEqual(['program']);
  });

  it('no_credits / no_memory in reject (and apply agrees)', () => {
    const poor = s12Board('runner', { runnerHand: [MODDED, TOOLBOX], runnerCredits: 4 });
    expect(viewFor('runner', poor).handOptions[0]).toEqual([{ action: modded(0, 1), cost: 5, reject: 'no_credits', discount: 4 }]);
    expect(rejection(apply(poor, modded(0, 1)).events)).toBe('no_credits');
    const full = s12Board('runner', { rig: ['r17', 'r17'], runnerHand: [MODDED, 'r04'], runnerCredits: 5 });
    expect(viewFor('runner', full).handOptions[0]).toEqual([{ action: modded(0, 1), cost: 0, reject: 'no_memory', discount: 2 }]);
    expect(rejection(apply(full, modded(0, 1)).events)).toBe('no_memory');
  });
});

describe('S-12-3 AC4: Modded is dimmed with no program or hardware in the Grip', () => {
  it('one play option, condition_not_met; apply agrees', () => {
    const s = s12Board('runner', { runnerHand: [MODDED, 'r14', 'r02'] });
    expect(viewFor('runner', s).handOptions[0]).toEqual([{ action: modded(0), cost: 0, reject: 'condition_not_met' }]);
    expect(rejection(apply(s, modded(0)).events)).toBe('condition_not_met');
    expect(legalActions(s, 'runner').some((a) => a.type === 'play' && a.handIndex === 0)).toBe(false);
  });

  it('bad_target: missing installIndex while a target exists, Modded itself, an event, out of range; invalid_action: not an integer', () => {
    const s = s12Board('runner', { runnerHand: [MODDED, 'r04', 'r14'] });
    for (const a of [modded(0), modded(0, 0), modded(0, 2), modded(0, 3)]) expect(rejection(apply(s, a).events), JSON.stringify(a)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'play', player: 'runner', handIndex: 2, installIndex: 1 }).events)).toBe('bad_target');
    expect(rejection(apply(s, { type: 'play', player: 'runner', handIndex: 0, installIndex: 1.5 } as Action).events)).toBe('invalid_action');
  });
});

describe('S-12-4: Infiltration — Gain 2 credits or expose 1 card', () => {
  /** Runner turn: remote1 = face-down Wall of Static (i1) + face-down PAD Campaign (i2); HQ root = rezzed Akitaro (i3). */
  const board = (): GameState =>
    s12Board('runner', { runnerHand: ['r14', INFILTRATION], servers: { hq: { content: ['+c11'] }, remote1: { ice: ['c04'], content: ['c03'] } } });

  it('AC1 options: Gain 2 credits, then Expose per face-down installed Corp card (servers order, ICE then content)', () => {
    const v = viewFor('runner', board());
    expect(v.handOptions[1]).toEqual([
      { action: infiltrate(1, 0), cost: 0, reject: null },
      { action: infiltrate(1, 1, 'i2'), cost: 0, reject: null },
      { action: infiltrate(1, 1, 'i3'), cost: 0, reject: null },
    ]);
    const none = viewFor('runner', s12Board('runner', { runnerHand: [INFILTRATION] }));
    expect(none.handOptions[0]).toEqual([{ action: infiltrate(0, 0), cost: 0, reject: null }]);
  });

  it('Gain 2 credits', () => {
    const s = board();
    const r = step(s, infiltrate(1, 0));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'runner', cardId: INFILTRATION, handIndex: 1 },
      { type: 'credit_gained', player: 'runner', amount: 2 },
    ]);
    expect(r.state.players.runner).toMatchObject({ credits: 7, clicks: 3 });
  });

  it('AC2/AC3 Expose: one public card_exposed (both projections), the card stays face down, nothing else changes', () => {
    const s = board();
    const r = step(s, infiltrate(1, 1, 'i3'));
    const exposed = { type: 'card_exposed', uid: 'i3', cardId: 'c03', server: 'remote1' } as const;
    expect(r.events).toEqual([{ type: 'card_played', player: 'runner', cardId: INFILTRATION, handIndex: 1 }, exposed]);
    expect(viewEvents('runner', r.events)).toContainEqual(exposed);
    expect(viewEvents('corp', r.events)).toContainEqual(exposed);
    expect(r.state.servers).toEqual(s.servers);
    expect(r.state.players.corp).toEqual(s.players.corp);
    expect(viewFor('runner', r.state).corpServers.find((sv) => sv.id === 'remote1')!.content[0]).toMatchObject({ uid: 'i3', cardId: null, faceUp: false });
    expectRunnerViewClean(r.state, 'exposed');
    expectRunnerEventsClean(r.events, 'exposed', r.state);
  });

  it('exposing face-down ICE works too (it is not rezzed)', () => {
    const r = step(board(), infiltrate(1, 1, 'i2'));
    expect(r.events).toContainEqual({ type: 'card_exposed', uid: 'i2', cardId: 'c04', server: 'remote1' });
    expect(r.state.servers.find((sv) => sv.id === 'remote1')!.ice[0]!.rezzed).toBe(false);
  });

  it('bad_target: no mode, a mode out of range, uid on Gain, no uid / a rezzed / rig / unknown uid on Expose; invalid_action: bad shapes', () => {
    const s = s12Board('runner', { rig: ['r04'], runnerHand: [INFILTRATION, 'r14'], servers: { hq: { content: ['+c11'] }, remote1: { content: ['c03'] } } });
    for (const a of [infiltrate(0), infiltrate(0, 2), infiltrate(0, -1), infiltrate(0, 0, 'i3'), infiltrate(0, 1), infiltrate(0, 1, 'i2'), infiltrate(0, 1, 'i1'), infiltrate(0, 1, 'i9')]) {
      expect(rejection(apply(s, a).events), JSON.stringify(a)).toBe('bad_target');
    }
    expect(rejection(apply(s, infiltrate(1, 0)).events)).toBe('bad_target'); // Sure Gamble has no modes
    expect(rejection(apply(s, { type: 'play', player: 'runner', handIndex: 0, mode: 'x' } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'play', player: 'runner', handIndex: 0, mode: 1, uid: 3 } as unknown as Action).events)).toBe('invalid_action');
  });
});
