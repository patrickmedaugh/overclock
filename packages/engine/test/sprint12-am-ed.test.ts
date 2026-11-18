// Sprint 12 E3 (S-12-2): Archived Memories (pick any Archives card but itself, face-down too) and
// Experiential Data (+1 strength to ICE protecting its server while rezzed; iceStrength(state, ice)).
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, type Action, type GameState } from '../src/index';
import { liveness, rejection } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';
import { s12Board, step } from './s12';

const AM = 'c24';
const ED = 'c25';
const play = (handIndex: number): Action => ({ type: 'play', player: 'corp', handIndex });
const pick = (card: number): Action => ({ type: 'select', player: 'corp', card });

describe('S-12-2: card data', () => {
  it('Archived Memories: HB operation 0, influence 2, 2012 text', () => {
    expect(getCard(AM)).toMatchObject({
      name: 'Archived Memories',
      type: 'operation',
      faction: 'haas_bioroid',
      influence: 2,
      code: '01058',
      cost: 0,
      text: 'Add 1 card from Archives to HQ.',
      playIf: 'corp_archives_not_empty',
      onPlay: [{ op: 'archives_to_hand' }],
    });
  });

  it('Experiential Data: HB upgrade rez 2, trash 2, influence 1, 2012 text, +1 ICE strength', () => {
    expect(getCard(ED)).toMatchObject({
      name: 'Experiential Data',
      type: 'upgrade',
      faction: 'haas_bioroid',
      influence: 1,
      code: '01066',
      cost: 2,
      trashCost: 2,
      text: 'All ICE protecting this server has +1 strength.',
      iceStrengthBonus: 1,
    });
  });
});

describe('S-12-2 AC1: Archived Memories picks any Archives card (face down too) for HQ', () => {
  /** Corp turn, AM in hand (index 0) after a Hedge Fund, Archives: face-up Hedge Fund, face-down PSF, face-up Enigma. */
  const ready = (): GameState => s12Board('corp', { corpHand: [AM, 'c01'], archives: ['+c01', 'c09', '+c06'] });

  it('play: card_played, choice_opened; options = one select per Archives index except the playing copy', () => {
    const s = ready();
    const r = step(s, play(0));
    expect(r.events).toEqual([
      { type: 'card_played', player: 'corp', cardId: AM, handIndex: 0 },
      { type: 'choice_opened', kind: 'archives_pick', player: 'corp', cardId: AM },
    ]);
    expect(r.state.players.corp.clicks).toBe(2);
    expect(r.state.phase).toBe('choice');
    expect(r.state.choice).toMatchObject({ kind: 'archives_pick', ownIndex: 3, resume: 'action' });
    const v = viewFor('corp', r.state);
    expect(v.choice!.options.map((o) => o.action)).toEqual([pick(0), pick(1), pick(2)]);
    expect(legalActions(r.state, 'corp')).toEqual([pick(0), pick(1), pick(2)]);
    expect(viewFor('runner', r.state).choice).toMatchObject({ kind: 'archives_pick', waitingOn: 'corp', cardId: AM, options: [] });
    expect(viewFor('runner', r.state).choice!.looked).toBeUndefined();
    expect(liveness(r.state)).toBe('corp');
  });

  it('a face-down pick goes to HQ; the Runner learns only that a face-down card went to HQ', () => {
    const r1 = step(ready(), play(0));
    const r = step(r1.state, pick(1));
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'archives_pick', skipped: false },
      { type: 'card_returned_to_hand', player: 'corp', archivesIndex: 1, faceUp: false, cardId: 'c09' },
    ]);
    expect(viewEvents('runner', r.events)).toEqual([
      { type: 'choice_closed', kind: 'archives_pick', skipped: false },
      { type: 'card_returned_to_hand', player: 'corp', archivesIndex: 1, faceUp: false },
    ]);
    expect(r.state.phase).toBe('action');
    expect(r.state.players.corp.hand).toEqual(['c01', 'c09']);
    expect(r.state.players.corp.discard).toEqual([
      { cardId: 'c01', faceUp: true },
      { cardId: 'c06', faceUp: true },
      { cardId: AM, faceUp: true },
    ]);
    expectRunnerViewClean(r1.state, 'choice open');
    expectRunnerEventsClean(r1.events, 'played', r1.state);
    expectRunnerViewClean(r.state, 'picked');
    expectRunnerEventsClean(r.events, 'picked', r.state);
  });

  it('a face-up pick is public (both see the card id)', () => {
    const r = step(step(ready(), play(0)).state, pick(2));
    expect(viewEvents('runner', r.events)).toContainEqual({ type: 'card_returned_to_hand', player: 'corp', archivesIndex: 2, faceUp: true, cardId: 'c06' });
    expect(r.state.players.corp.hand).toEqual(['c01', 'c06']);
  });

  it('never itself: the playing copy, out of range, a server, or Skip are refused bad_target', () => {
    const s = step(ready(), play(0)).state;
    for (const a of [pick(3), pick(4), pick(-1), { type: 'select', player: 'corp', card: 0, server: 'hq' } as Action, { type: 'pass', player: 'corp' } as Action]) {
      expect(rejection(apply(s, a).events), JSON.stringify(a)).toBe('bad_target');
    }
    expect(rejection(apply(s, { type: 'select', player: 'runner', card: 0 }).events)).toBe('not_your_turn');
    expect(rejection(apply(s, { type: 'draw', player: 'corp' }).events)).toBe('wrong_phase');
  });

  it('with one other card in Archives there is one option', () => {
    const s = step(s12Board('corp', { corpHand: [AM], archives: ['c10'] }), play(0)).state;
    expect(legalActions(s, 'corp')).toEqual([pick(0)]);
  });
});

describe('S-12-2 AC2: Archived Memories is dimmed while Archives is empty', () => {
  it('hand option rejected condition_not_met (and apply agrees); legal once Archives has a card', () => {
    const empty = s12Board('corp', { corpHand: [AM] });
    expect(viewFor('corp', empty).handOptions[0]).toEqual([{ action: play(0), cost: 0, reject: 'condition_not_met' }]);
    expect(rejection(apply(empty, play(0)).events)).toBe('condition_not_met');
    const one = s12Board('corp', { corpHand: [AM], archives: ['c01'] });
    expect(viewFor('corp', one).handOptions[0]).toEqual([{ action: play(0), cost: 0, reject: null }]);
  });
});

describe('S-12-2 AC3/AC4: Experiential Data gives ICE protecting its server +1 strength while rezzed', () => {
  /** Runner turn: Gordian Blade (i1), remote1 = rezzed Enigma (i2) + Experiential Data (i3, `ed`). */
  const enigmaBoard = (ed: string, extra: Record<string, { ice?: string[]; content?: string[] }> = {}): GameState =>
    s12Board('runner', { rig: ['r05'], servers: { remote1: { ice: ['+c06'], content: [ed] }, ...extra }, runnerCredits: 5 });
  const runTo = (s: GameState, server: string) => step(s, { type: 'run', player: 'runner', server: server as 'remote1' }).state;

  it('rezzed: Enigma shows strength 3 (board and run), Gordian Blade (2) is too_weak until pumped', () => {
    const s = runTo(enigmaBoard('+' + ED), 'remote1');
    const v = viewFor('runner', s);
    expect(v.run).toMatchObject({ step: 'encounter', ice: { cardId: 'c06', strength: 3 } });
    expect(v.corpServers.find((sv) => sv.id === 'remote1')!.ice[0]!.strength).toBe(3);
    const brk: Action = { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 1 };
    expect(v.run!.options.find((o) => JSON.stringify(o.action) === JSON.stringify(brk))!.reject).toBe('too_weak');
    expect(rejection(apply(s, brk).events)).toBe('too_weak');
    expect(v.run!.breakAll).toEqual([{ uid: 'i1', credits: 3, strengthCredits: 1, breakCredits: 2 }]);
    const pumped = step(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 }).state;
    expect(rejection(apply(pumped, brk).events)).toBeNull();
  });

  it('face down: normal strength (2); the Runner sees no strength on face-down cards', () => {
    const s = runTo(enigmaBoard(ED), 'remote1');
    expect(viewFor('runner', s).run!.ice!.strength).toBe(2);
    expect(viewFor('runner', s).corpServers.find((sv) => sv.id === 'remote1')!.content[0]!.strength).toBeUndefined();
    expect(rejection(apply(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 1 }).events)).toBeNull();
  });

  it('trashed (accessed and trashed by the Runner): back to normal strength', () => {
    // remote1: Experiential Data alone in the root, Enigma protecting it; the Runner breaks through and trashes it.
    let s = runTo(s12Board('runner', { rig: ['r05'], servers: { remote1: { ice: ['+c06'], content: ['+' + ED] } }, runnerCredits: 9 }), 'remote1');
    s = step(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 1 }).state;
    s = step(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 0 }).state;
    s = step(s, { type: 'use_ability', player: 'runner', uid: 'i1', ability: 0, sub: 1 }).state;
    s = step(s, { type: 'pass', player: 'runner' }).state; // continue into the server
    s = step(s, { type: 'trash', player: 'runner', card: 0 }).state;
    expect(s.players.corp.discard).toEqual([{ cardId: ED, faceUp: true }]);
    expect(viewFor('corp', s).corpServers.find((sv) => sv.id === 'remote1')!.ice[0]!.strength).toBe(2);
  });

  it('central server too (ED in the root of HQ), and Ice Wall counters add up: 1 + 2 + 1', () => {
    const s = s12Board('runner', { servers: { hq: { ice: ['+c05'], content: ['+' + ED] } }, advancements: { i1: 2 } });
    expect(viewFor('runner', s).corpServers[0]!.ice[0]).toMatchObject({ cardId: 'c05', advancements: 2, strength: 4 });
  });

  it('only its own server; two copies stack', () => {
    const s = s12Board('corp', { servers: { remote1: { ice: ['c06'], content: ['+' + ED, '+' + ED] }, remote2: { ice: ['c06'] } } });
    const v = viewFor('corp', s);
    expect(v.corpServers.find((sv) => sv.id === 'remote1')!.ice[0]!.strength).toBe(4);
    expect(v.corpServers.find((sv) => sv.id === 'remote2')!.ice[0]!.strength).toBe(2);
  });

  it('InstalledView.strength: the Corp sees it on its face-down ICE; the Runner only on rezzed ICE; never on content', () => {
    const s = s12Board('corp', { servers: { remote1: { ice: ['c06', '+c04'], content: ['+' + ED] } } });
    const corp = viewFor('corp', s).corpServers.find((sv) => sv.id === 'remote1')!;
    const runner = viewFor('runner', s).corpServers.find((sv) => sv.id === 'remote1')!;
    expect(corp.ice.map((c) => c.strength)).toEqual([3, 4]);
    expect(runner.ice.map((c) => c.strength)).toEqual([undefined, 4]);
    expect(corp.content[0]!.strength).toBeUndefined();
    expectRunnerViewClean(s, 'ED board');
  });

  it('Accelerated Beta Test installing ICE behind a face-up Experiential Data: +1 at once', () => {
    let s = s12Board('corp', { servers: { remote1: { content: ['c23'] }, remote2: { content: ['+' + ED] } }, advancements: { i1: 3 }, corpDeck: ['c05', 'c01'] });
    s = step(s, { type: 'score', player: 'corp', uid: 'i1' }).state;
    s = step(s, { type: 'select', player: 'corp', card: 0, server: 'remote2' }).state;
    expect(viewFor('runner', s).corpServers.find((sv) => sv.id === 'remote2')!.ice[0]).toMatchObject({ cardId: 'c05', faceUp: true, strength: 2 });
  });
});
