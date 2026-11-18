// Sprint 12 E2 (S-12-1): Accelerated Beta Test — look at the top 3 of R&D, install and rez any ICE among them
// for free (server per ICE), Done trashes the rest to Archives face down. Tech plan / DECISIONS 2026-11-18.
import { getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, legalActions, viewEvents, viewFor, waitingOn, type Action, type GameState } from '../src/index';
import { liveness, rejection } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';
import { corpCards, s12Board, step } from './s12';

const ABT = 'c23';
const score: Action = { type: 'score', player: 'corp', uid: 'i1' };
const done: Action = { type: 'pass', player: 'corp' };
const select = (card: number, server?: string): Action => ({ type: 'select', player: 'corp', card, ...(server !== undefined ? { server } : {}) }) as Action;

/** Corp turn 1, ABT (i1) ready on remote1, `deck` as R&D (top first); extra servers optional. */
function abtReady(deck: string[], more: Parameters<typeof s12Board>[1] = {}): GameState {
  return s12Board('corp', {
    servers: { remote1: { content: [ABT] }, ...more.servers },
    advancements: { i1: 3 },
    corpDeck: deck,
    ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== 'servers')),
  });
}

describe('S-12-1: card data', () => {
  it('Accelerated Beta Test: HB agenda 3/2, 2012 text, look_install_top 3 ICE', () => {
    expect(getCard(ABT)).toMatchObject({
      name: 'Accelerated Beta Test',
      side: 'corp',
      type: 'agenda',
      faction: 'haas_bioroid',
      code: '01055',
      advancementRequirement: 3,
      agendaPoints: 2,
      text:
        'When you score Accelerated Beta Test, you may look at the top 3 cards of R&D. If any of those cards are ICE, you may install and rez them, ignoring all costs. Trash the rest of the cards you looked at.',
      onScore: [{ op: 'look_install_top', count: 3, types: ['ice'] }],
    });
  });
});

describe('S-12-1 AC1: scoring opens the "look at 3 cards" choice', () => {
  it('top 3 leave R&D into the choice; events agenda_scored, cards_looked_at, choice_opened; the emptied remote goes', () => {
    const s = abtReady(['c04', 'c05', 'c06', 'c01']);
    const r = step(s, score);
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: ABT, points: 2 },
      { type: 'cards_looked_at', count: 3, cardIds: ['c04', 'c05', 'c06'] },
      { type: 'choice_opened', kind: 'look_install', player: 'corp', cardId: ABT },
      { type: 'server_removed', server: 'remote1' },
    ]);
    expect(r.state.phase).toBe('choice');
    expect(r.state.choice).toMatchObject({ kind: 'look_install', player: 'corp', cardId: ABT, looked: ['c04', 'c05', 'c06'], resume: 'action' });
    expect(r.state.players.corp.deck).toEqual(['c01']);
    expect(corpCards(r.state)).toEqual(corpCards(s));
    expect(waitingOn(r.state)).toBe('corp');
    expect(hasMeaningfulResponse(r.state, 'corp')).toBe(true);
    expect(liveness(r.state)).toBe('corp');
  });

  it('options: one select per ICE × (servers in order, then new), then Done; the Corp sees the ids', () => {
    const s = step(abtReady(['c04', 'c01', 'c05'], { servers: { remote2: { ice: ['c06'] } } }), score).state;
    const servers = ['hq', 'rd', 'archives', 'remote2', 'new'];
    const want: Action[] = [...[0, 2].flatMap((card) => servers.map((server) => select(card, server))), done];
    const v = viewFor('corp', s);
    expect(v.choice).toMatchObject({ kind: 'look_install', waitingOn: 'corp', cardId: ABT, looked: ['c04', 'c01', 'c05'] });
    expect(v.choice!.options.map((o) => o.action)).toEqual(want);
    expect(v.choice!.options.every((o) => o.cost === 0 && o.reject === null)).toBe(true);
    expect(legalActions(s, 'corp')).toEqual(want);
    expect(legalActions(s, 'runner')).toEqual([]);
  });
});

describe('S-12-1 AC1: installing a looked-at ICE is free (no click, no credits, no ICE tax) and rezzes it', () => {
  it('first ICE into a new remote: server_created, card_installed, ice_rezzed, then Haas-Bioroid +1', () => {
    const s = step(abtReady(['c04', 'c05', 'c06', 'c01']), score).state;
    const before = s.players.corp;
    const r = step(s, select(0, 'new'));
    expect(r.events).toEqual([
      { type: 'server_created', server: 'remote2' },
      { type: 'card_installed', player: 'corp', uid: 'i2', zone: 'ice', server: 'remote2', cardId: 'c04' },
      { type: 'ice_rezzed', uid: 'i2', cardId: 'c04' },
      { type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
    ]);
    expect(r.state.players.corp.clicks).toBe(before.clicks);
    expect(r.state.players.corp.credits).toBe(before.credits + 1);
    expect(r.state.servers.find((sv) => sv.id === 'remote2')!.ice).toEqual([{ uid: 'i2', cardId: 'c04', rezzed: true, advancements: 0, hostedCredits: 0 }]);
    expect(r.state.phase).toBe('choice');
    expect(r.state.choice!.looked).toEqual(['c05', 'c06']);
  });

  it('second ICE onto a server that already has ICE: no tax, no second HB credit; the last one closes the choice', () => {
    let s = step(abtReady(['c04', 'c05', 'c06', 'c01']), score).state;
    s = step(s, select(0, 'new')).state;
    const credits = s.players.corp.credits;
    const r = step(s, select(0, 'remote2'));
    expect(r.events).toEqual([
      { type: 'card_installed', player: 'corp', uid: 'i3', zone: 'ice', server: 'remote2', cardId: 'c05' },
      { type: 'ice_rezzed', uid: 'i3', cardId: 'c05' },
    ]);
    expect(r.state.players.corp.credits).toBe(credits);
    const last = step(r.state, select(0, 'hq'));
    expect(last.events).toEqual([
      { type: 'card_installed', player: 'corp', uid: 'i4', zone: 'ice', server: 'hq', cardId: 'c06' },
      { type: 'ice_rezzed', uid: 'i4', cardId: 'c06' },
      { type: 'choice_closed', kind: 'look_install', skipped: false },
    ]);
    expect(last.state.phase).toBe('action');
    expect(last.state.choice).toBeNull();
    expect(last.state.players.corp).toMatchObject({ clicks: 3, credits, deck: ['c01'], discard: [] });
    expect(last.state.servers.find((sv) => sv.id === 'remote2')!.ice.map((c) => c.uid)).toEqual(['i2', 'i3']);
  });

  it('no HB credit when the Corp already installed a card this turn', () => {
    const s0 = abtReady(['c04', 'c01', 'c01'], { corpHand: ['c03'] });
    const s1 = step(s0, { type: 'install', player: 'corp', handIndex: 0, server: 'new' }).state;
    const s = step(s1, score).state;
    const r = step(s, select(0, 'rd'));
    expect(r.events.some((e) => e.type === 'credit_gained' || e.type === 'ability_triggered')).toBe(false);
  });
});

describe('S-12-1 AC2/AC3: Done trashes the rest to Archives face down', () => {
  it('1 ICE among 3: install it, then Done trashes the other 2 face down (rd_cards_trashed)', () => {
    let s = step(abtReady(['c01', 'c05', 'c08', 'c03']), score).state;
    s = step(s, select(1, 'new')).state;
    const r = step(s, done);
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'look_install', skipped: true },
      { type: 'rd_cards_trashed', count: 2, cardIds: ['c01', 'c08'] },
    ]);
    expect(r.state.phase).toBe('action');
    expect(r.state.players.corp.discard).toEqual([
      { cardId: 'c01', faceUp: false },
      { cardId: 'c08', faceUp: false },
    ]);
    expect(r.state.players.corp.deck).toEqual(['c03']);
    expect(viewFor('runner', r.state).players.corp.discard).toEqual([null, null]);
    expect(viewFor('corp', r.state).players.corp.discard).toEqual(['c01', 'c08']);
  });

  it('no ICE among them: the only option is Done; one tap trashes all 3', () => {
    const s = step(abtReady(['c01', 'c03', 'c08', 'c09']), score).state;
    expect(legalActions(s, 'corp')).toEqual([done]);
    const r = step(s, done);
    expect(r.events).toEqual([
      { type: 'choice_closed', kind: 'look_install', skipped: true },
      { type: 'rd_cards_trashed', count: 3, cardIds: ['c01', 'c03', 'c08'] },
    ]);
    expect(r.state.players.corp.discard.every((d) => !d.faceUp)).toBe(true);
    expect(r.state.players.corp.deck).toEqual(['c09']);
  });

  it('Done right away with ICE among them: nothing installed, all go face down', () => {
    const s = step(abtReady(['c04', 'c05', 'c06']), score).state;
    const r = step(s, done);
    expect(r.state.players.corp.discard).toHaveLength(3);
    expect(r.state.servers).toHaveLength(3);
  });
});

describe('S-12-1 AC4: R&D shorter than 3', () => {
  it('R&D 2: looks at 2', () => {
    const r = step(abtReady(['c04', 'c01']), score);
    expect(r.events).toContainEqual({ type: 'cards_looked_at', count: 2, cardIds: ['c04', 'c01'] });
    expect(r.state.players.corp.deck).toEqual([]);
    expect(r.state.choice!.looked).toEqual(['c04', 'c01']);
    const end = step(step(r.state, select(0, 'new')).state, done);
    expect(end.state.phase).toBe('action');
  });

  it('R&D 0: nothing happens, no choice, no loss (only the mandatory draw loses)', () => {
    const r = step(abtReady([]), score);
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: ABT, points: 2 },
      { type: 'server_removed', server: 'remote1' },
    ]);
    expect(r.state.phase).toBe('action');
    expect(r.state.result).toBeNull();
  });

  it('a score that wins skips the look (game over first; R&D untouched)', () => {
    const s = abtReady(['c04', 'c05', 'c06'], { corpScored: ['c10', 'c09'] });
    const r = step(s, score);
    expect(r.events).toEqual([
      { type: 'agenda_scored', uid: 'i1', cardId: ABT, points: 2 },
      { type: 'game_over', winner: 'corp', reason: 'agenda_points' },
    ]);
    expect(r.state.players.corp.deck).toEqual(['c04', 'c05', 'c06']);
  });

  it('a stolen Accelerated Beta Test does nothing', () => {
    let s = s12Board('runner', { servers: { remote1: { content: [ABT] } } });
    s = step(s, { type: 'run', player: 'runner', server: 'remote1' }).state;
    const r = step(s, { type: 'steal', player: 'runner', card: 0 });
    expect(r.events.some((e) => e.type === 'cards_looked_at' || e.type === 'choice_opened')).toBe(false);
  });
});

describe('S-12-1 AC5: the Runner sees only what the rules let him see', () => {
  it('view: looked = nulls (count only), no options; events: no looked/trashed ids, installed ICE named only when rezzed', () => {
    const s0 = abtReady(['c04', 'c01', 'c08', 'c03']);
    const scored = step(s0, score);
    const rv = viewFor('runner', scored.state);
    expect(rv.choice).toMatchObject({ kind: 'look_install', waitingOn: 'corp', cardId: ABT, looked: [null, null, null], options: [] });
    expect(viewEvents('runner', scored.events)).toContainEqual({ type: 'cards_looked_at', count: 3 });
    expectRunnerViewClean(scored.state, 'scored');
    expectRunnerEventsClean(scored.events, 'scored', scored.state);
    const inst = step(scored.state, select(0, 'new'));
    expect(viewEvents('runner', inst.events)).toEqual([
      { type: 'server_created', server: 'remote2' },
      { type: 'card_installed', player: 'corp', uid: 'i2', zone: 'ice', server: 'remote2' },
      { type: 'ice_rezzed', uid: 'i2', cardId: 'c04' },
      { type: 'ability_triggered', uid: 'id:corp', cardId: 'c13', trigger: 'install' },
      { type: 'credit_gained', player: 'corp', amount: 1 },
    ]);
    expectRunnerViewClean(inst.state, 'installed');
    expectRunnerEventsClean(inst.events, 'installed', inst.state);
    const end = step(inst.state, done);
    expect(viewEvents('runner', end.events)).toEqual([
      { type: 'choice_closed', kind: 'look_install', skipped: true },
      { type: 'rd_cards_trashed', count: 2 },
    ]);
    expectRunnerViewClean(end.state, 'done');
    expectRunnerEventsClean(end.events, 'done', end.state);
  });
});

describe('select / pass in look_install: rejections', () => {
  const open = () => step(abtReady(['c04', 'c01', 'c05']), score).state;

  it('bad_target: a non-ICE card, out of range, missing or unknown server', () => {
    const s = open();
    for (const a of [select(1, 'new'), select(3, 'new'), select(-1, 'new'), select(0), select(0, 'remote9'), select(0, 'remote1')]) {
      expect(rejection(apply(s, a).events), JSON.stringify(a)).toBe('bad_target');
    }
  });

  it('invalid_action (shape) → not_your_turn → wrong_phase', () => {
    const s = open();
    expect(rejection(apply(s, { type: 'select', player: 'corp', card: 0.5, server: 'new' } as Action).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'select', player: 'corp', card: 0, server: 3 } as unknown as Action).events)).toBe('invalid_action');
    expect(rejection(apply(s, { type: 'select', player: 'runner', card: 0, server: 'new' }).events)).toBe('not_your_turn');
    expect(rejection(apply(s, { type: 'gain_credit', player: 'corp' }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'rez', player: 'corp', uid: 'i1' }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'choose', player: 'corp', uid: 'i1' }).events)).toBe('wrong_phase');
    expect(rejection(apply(s, { type: 'trace_bid', player: 'corp', credits: 0 }).events)).toBe('wrong_phase');
    expect(rejection(apply(abtReady(['c04']), select(0, 'new')).events)).toBe('wrong_phase');
  });

  it('the rejected state is unchanged', () => {
    const s = open();
    const r = apply(s, select(1, 'new'));
    expect(r.state).toBe(s);
  });
});
