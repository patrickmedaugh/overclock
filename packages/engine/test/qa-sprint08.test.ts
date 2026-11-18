// QA Sprint 8 (written by QA, not the developers). Independent checks of S-08-1..7:
// - QA's own table of the 2012 Core Set numbers vs the card data, and QA's own deck count.
// - Edge cases the developer tests don't reach (Kate's discount on hardware / free cards,
//   Haas-Bioroid on central ICE, Adonis trashed by the Runner, brain damage with 1 card,
//   Pipeline/Battering Ram boosts carried to the next ICE, Rototurret target filtering).
// - A random-play sweep on the core decks with QA's own bookkeeping (first install each turn,
//   Kate's price, brain damage, Adonis totals, face-down cards never acting, hidden info).
import { CORP_CORE_DECK, RUNNER_CORE_DECK, getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION,
  apply,
  legalActions,
  replay as engineReplay,
  viewEvents,
  viewFor,
  waitingOn,
  type Action,
  type GameEvent,
  type GameState,
  type Side,
} from '../src/index';
import { act, board, coreGame, finishTurn, rejection, run, withHand, withPlayer, type BoardSpec } from './helpers';

const CORE = { deckSet: 'core' } as const;
const corpInstall = (handIndex: number, server: string): Action => ({ type: 'install', player: 'corp', handIndex, server } as Action);
const runnerInstall = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const play = (player: Side, handIndex: number): Action => ({ type: 'play', player, handIndex } as Action);
const pass = (player: Side): Action => ({ type: 'pass', player });
const choose = (player: Side, uid: string): Action => ({ type: 'choose', player, uid } as Action);
const breakSub = (uid: string, sub: number): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 0, sub } as Action);
const breakSubs = (uid: string, subs: number[]): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 0, subs } as Action);
const pump = (uid: string): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 1 } as Action);
const runOn = (server: string): Action => ({ type: 'run', player: 'runner', server } as Action);

/** Corp turn 1 of a core game with `hand`, credits and clicks set. */
function corpTurn(hand: string[], credits = 10, clicks = 3, seed = 5): GameState {
  return withPlayer(withHand(coreGame(seed), 'corp', hand), 'corp', { credits, clicks });
}

/** A Runner turn on a core-deck board (identities present). */
function coreBoard(spec: BoardSpec): GameState {
  return board(spec, 77, CORE);
}

// ---- Card data: QA's own table of the 2012 Core Set (independent of the developers' list) ----

// [name, faction, influence, cost, extra] — extra: strength / memory / trash / agenda / identity numbers.
const CORE_2012: Record<string, { name: string; faction: string; inf: number; cost: number; type: string; sub?: string; str?: number; mu?: number; trash?: number; adv?: number; pts?: number; deck?: number; limit?: number; link?: number }> = {
  c01: { name: 'Hedge Fund', faction: 'neutral', inf: 0, cost: 5, type: 'operation' },
  c02: { name: 'Anonymous Tip', faction: 'nbn', inf: 1, cost: 0, type: 'operation' },
  c03: { name: 'PAD Campaign', faction: 'neutral', inf: 0, cost: 2, type: 'asset', trash: 4 },
  c04: { name: 'Wall of Static', faction: 'neutral', inf: 0, cost: 3, type: 'ice', sub: 'barrier', str: 3 },
  c05: { name: 'Ice Wall', faction: 'weyland', inf: 1, cost: 1, type: 'ice', sub: 'barrier', str: 1 },
  c06: { name: 'Enigma', faction: 'neutral', inf: 0, cost: 3, type: 'ice', sub: 'code_gate', str: 2 },
  c07: { name: 'Neural Katana', faction: 'jinteki', inf: 2, cost: 4, type: 'ice', sub: 'sentry', str: 3 },
  c08: { name: 'Hostile Takeover', faction: 'weyland', inf: 0, cost: 0, type: 'agenda', adv: 2, pts: 1 },
  c09: { name: 'Private Security Force', faction: 'neutral', inf: 0, cost: 0, type: 'agenda', adv: 4, pts: 2 },
  c10: { name: 'Priority Requisition', faction: 'neutral', inf: 0, cost: 0, type: 'agenda', adv: 5, pts: 3 },
  c11: { name: 'Akitaro Watanabe', faction: 'jinteki', inf: 2, cost: 1, type: 'upgrade', trash: 3 },
  c12: { name: 'Neural EMP', faction: 'jinteki', inf: 2, cost: 2, type: 'operation' },
  c13: { name: 'Haas-Bioroid: Engineering the Future', faction: 'haas_bioroid', inf: 0, cost: 0, type: 'identity', deck: 45, limit: 15 },
  c14: { name: 'Adonis Campaign', faction: 'haas_bioroid', inf: 2, cost: 4, type: 'asset', trash: 3 },
  c15: { name: 'Melange Mining Corp.', faction: 'neutral', inf: 0, cost: 1, type: 'asset', trash: 1 },
  c16: { name: 'Biotic Labor', faction: 'haas_bioroid', inf: 4, cost: 4, type: 'operation' },
  c17: { name: 'Viktor 1.0', faction: 'haas_bioroid', inf: 2, cost: 3, type: 'ice', sub: 'code_gate', str: 3 },
  c18: { name: 'Heimdall 1.0', faction: 'haas_bioroid', inf: 2, cost: 8, type: 'ice', sub: 'barrier', str: 6 },
  c19: { name: 'Rototurret', faction: 'haas_bioroid', inf: 1, cost: 4, type: 'ice', sub: 'sentry', str: 0 },
  r01: { name: 'Easy Mark', faction: 'criminal', inf: 1, cost: 0, type: 'event' },
  r02: { name: 'Armitage Codebusting', faction: 'neutral', inf: 0, cost: 1, type: 'resource' },
  r03: { name: 'Diesel', faction: 'shaper', inf: 2, cost: 0, type: 'event' },
  r04: { name: 'Corroder', faction: 'anarch', inf: 2, cost: 2, type: 'program', sub: 'breaker_barrier', str: 2, mu: 1 },
  r05: { name: 'Gordian Blade', faction: 'shaper', inf: 3, cost: 4, type: 'program', sub: 'breaker_code_gate', str: 2, mu: 1 },
  r06: { name: 'Ninja', faction: 'criminal', inf: 2, cost: 4, type: 'program', sub: 'breaker_sentry', str: 0, mu: 1 },
  r07: { name: "The Maker's Eye", faction: 'shaper', inf: 2, cost: 2, type: 'event' },
  r08: { name: 'Cyberfeeder', faction: 'anarch', inf: 1, cost: 2, type: 'hardware' },
  r09: { name: 'Akamatsu Mem Chip', faction: 'shaper', inf: 1, cost: 1, type: 'hardware' },
  r10: { name: 'Bank Job', faction: 'criminal', inf: 2, cost: 1, type: 'resource' },
  r11: { name: 'Inside Job', faction: 'criminal', inf: 3, cost: 2, type: 'event' },
  r12: { name: 'Sacrificial Construct', faction: 'shaper', inf: 1, cost: 0, type: 'resource' },
  r13: { name: 'Kate "Mac" McCaffrey: Digital Tinker', faction: 'shaper', inf: 0, cost: 0, type: 'identity', deck: 45, limit: 15, link: 1 },
  r14: { name: 'Sure Gamble', faction: 'neutral', inf: 0, cost: 5, type: 'event' },
  r15: { name: 'Magnum Opus', faction: 'shaper', inf: 2, cost: 5, type: 'program', mu: 2 },
  r16: { name: 'Pipeline', faction: 'shaper', inf: 1, cost: 3, type: 'program', sub: 'breaker_sentry', str: 1, mu: 1 },
  r17: { name: 'Battering Ram', faction: 'shaper', inf: 2, cost: 5, type: 'program', sub: 'breaker_barrier', str: 3, mu: 2 },
  // Sprint 9 (engine-dev, from netrunner-cards-json core.json).
  c20: { name: 'Hunter', faction: 'neutral', inf: 0, cost: 1, type: 'ice', sub: 'sentry', str: 4 },
  c21: { name: 'Ichi 1.0', faction: 'haas_bioroid', inf: 2, cost: 5, type: 'ice', sub: 'sentry', str: 4 },
  c22: { name: 'SEA Source', faction: 'nbn', inf: 2, cost: 2, type: 'operation' },
  r18: { name: 'Access to Globalsec', faction: 'neutral', inf: 0, cost: 1, type: 'resource' },
};

// QA's own reading of the printed 2012 text of the new cards (symbols as words, as the project writes them).
const TEXT_2012: Record<string, string> = {
  c13: 'The first time you install a card each turn, gain 1 credit.',
  c14: 'Put 12 credits from the bank on Adonis Campaign when rezzed. When there are no credits left on Adonis Campaign, trash it.\nTake 3 credits from Adonis Campaign when your turn begins.',
  c15: 'Click, click, click: Gain 7 credits.',
  c16: 'Gain 2 clicks.',
  c17: 'Subroutine: Do 1 brain damage.\nSubroutine: End the run.',
  c18: 'Subroutine: Do 1 brain damage.\nSubroutine: End the run.\nSubroutine: End the run.',
  c19: 'Subroutine: Trash 1 program.\nSubroutine: End the run.',
  r12: 'Trash: Prevent an installed program or an installed piece of hardware from being trashed.',
  r13: 'Lower the install cost of the first program or piece of hardware you install each turn by 1.',
  r14: 'Gain 9 credits.',
  r15: 'Click: Gain 2 credits.',
  r16: '1 credit: Break sentry subroutine.\n2 credits: +1 strength for the remainder of this run.',
  r17: '2 credits: Break up to 2 barrier subroutines.\n1 credit: +1 strength for the remainder of this run.',
};

describe('QA S-08-5 card data vs the 2012 Core Set (QA table)', () => {
  it('every card: name, faction, influence, cost, type and numbers match', () => {
    for (const [id, want] of Object.entries(CORE_2012)) {
      const c = getCard(id)!;
      expect(c, id).toBeDefined();
      const got = {
        name: c.name,
        faction: c.faction,
        inf: c.influence ?? 0,
        cost: c.cost,
        type: c.type,
        ...(want.sub !== undefined ? { sub: c.subtype } : {}),
        ...(want.str !== undefined ? { str: c.strength } : {}),
        ...(want.mu !== undefined ? { mu: c.memory } : {}),
        ...(want.trash !== undefined ? { trash: c.trashCost } : {}),
        ...(want.adv !== undefined ? { adv: c.advancementRequirement, pts: c.agendaPoints } : {}),
        ...(want.deck !== undefined ? { deck: c.minDeckSize, limit: c.influenceLimit } : {}),
        ...(want.link !== undefined ? { link: c.link } : {}),
      };
      expect(got, id).toEqual(want);
    }
  });

  it('new cards: the printed text', () => {
    for (const [id, text] of Object.entries(TEXT_2012)) expect(getCard(id)!.text, id).toBe(text);
  });

  it('subroutines as data match the printed order (brain damage first, then End the run)', () => {
    expect(getCard('c17')!.subroutines!.map((s) => s.effect.op)).toEqual(['brain_damage', 'end_run']);
    expect(getCard('c18')!.subroutines!.map((s) => s.effect.op)).toEqual(['brain_damage', 'end_run', 'end_run']);
    expect(getCard('c19')!.subroutines!.map((s) => s.effect.op)).toEqual(['trash_installed', 'end_run']);
  });
});

describe('QA S-08-5 the two 30-card decks (QA count, not checkDeck)', () => {
  const count = (cards: readonly string[]) => cards.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {});

  // Sprint 9 (S-09-4) swapped cards: −Anonymous Tip +SEA Source, −PAD −Neural Katana +2 Hunter, −Rototurret +Ichi 1.0;
  // Runner −Easy Mark −Inside Job +2 Access to Globalsec. Tables updated by engine-dev.
  it('Corp: 30 cards, the proposal table (Sprint 9 swaps); Hostile Takeover gone', () => {
    expect(CORP_CORE_DECK.identity).toBe('c13');
    expect(CORP_CORE_DECK.cards).toHaveLength(30);
    expect(count(CORP_CORE_DECK.cards)).toEqual({
      c01: 3, c22: 1, c12: 1, c16: 1, c03: 2, c14: 2, c15: 2, c11: 1, c05: 2, c04: 1, c06: 1, c20: 2, c19: 1, c21: 1, c17: 2, c18: 1, c10: 3, c09: 3,
    });
  });

  it('Runner: 30 cards, the proposal table; Ninja gone', () => {
    expect(RUNNER_CORE_DECK.identity).toBe('r13');
    expect(RUNNER_CORE_DECK.cards).toHaveLength(30);
    expect(count(RUNNER_CORE_DECK.cards)).toEqual({
      r14: 3, r01: 1, r03: 3, r02: 2, r10: 1, r18: 2, r15: 2, r07: 3, r11: 1, r04: 1, r05: 2, r16: 2, r17: 2, r09: 2, r08: 2, r12: 1,
    });
  });

  it('deck rules by QA arithmetic: <= 3 copies, own-faction/neutral agendas, influence from the QA table (Sprint 9: Corp 8, Runner 10 of 15), 15 agenda points', () => {
    for (const [deck, faction, inf] of [[CORP_CORE_DECK, 'haas_bioroid', 8], [RUNNER_CORE_DECK, 'shaper', 10]] as const) {
      for (const n of Object.values(count(deck.cards))) expect(n).toBeLessThanOrEqual(3);
      const used = deck.cards.reduce((sum, id) => sum + (CORE_2012[id]!.faction === faction ? 0 : CORE_2012[id]!.inf), 0);
      expect(used).toBe(inf);
      expect(used).toBeLessThanOrEqual(15);
      for (const id of deck.cards) {
        const t = CORE_2012[id]!;
        expect(t.type, id).not.toBe('identity');
        if (t.type === 'agenda') expect(['neutral', faction]).toContain(t.faction);
        expect(getCard(id)!.side).toBe(faction === 'shaper' ? 'runner' : 'corp');
      }
    }
    expect(CORP_CORE_DECK.cards.reduce((p, id) => p + (CORE_2012[id]!.pts ?? 0), 0)).toBe(15);
  });

  it('every deal (seeds 1-200): 30 Corp cards (hand + R&D), R&D 25 before the first draw, Stack 25; 15 agenda points dealt; RULES_VERSION 5 (Sprint 12)', () => {
    expect(RULES_VERSION).toBe(5);
    for (let seed = 1; seed <= 200; seed++) {
      const s = coreGame(seed);
      const c = s.players.corp;
      const r = s.players.runner;
      expect(r.hand.length).toBe(5);
      expect(r.deck.length).toBe(25);
      expect(c.hand.length + c.deck.length).toBe(30);
      // newGame = the Corp's turn has begun and it made its mandatory draw: 6 in HQ, 24 in R&D,
      // so before that first draw R&D held 25.
      expect(c.hand.length).toBe(6);
      expect(c.deck.length + 1).toBe(25);
      expect([...c.hand, ...c.deck].reduce((p, id) => p + (getCard(id)!.agendaPoints ?? 0), 0)).toBe(15);
      expect(c.identity).toBe('c13');
      expect(r.identity).toBe('r13');
    }
  });
});

// ---- S-08-1 ------------------------------------------------------------------------------------

describe('QA S-08-1 identities', () => {
  const hbCredit = (events: readonly GameEvent[]) => events.filter((e) => e.type === 'ability_triggered' && e.uid === 'id:corp').length;

  it('Haas-Bioroid: first install = ICE on HQ (a central server) gives +1; an upgrade second gives nothing', () => {
    const s = corpTurn(['c05', 'c11'], 5);
    const a = act(s, corpInstall(0, 'hq'));
    expect(hbCredit(a.events)).toBe(1);
    // Ice Wall on HQ costs 0 (first ICE): 5 + 1 = 6.
    expect(a.state.players.corp.credits).toBe(6);
    const b = act(a.state, corpInstall(0, 'hq'));
    expect(hbCredit(b.events)).toBe(0);
    expect(b.state.players.corp.credits).toBe(6);
  });

  it('Haas-Bioroid: Biotic Labor gives extra clicks, but 3 installs in one turn still give +1 once', () => {
    let s = corpTurn(['c16', 'c03', 'c03', 'c09'], 10);
    s = act(s, play('corp', 0)).state; // 10 - 4 = 6, clicks 2 + 2 = 4
    expect(s.players.corp.clicks).toBe(4);
    const r = run(s, [corpInstall(0, 'new'), corpInstall(0, 'new'), corpInstall(0, 'new')]);
    expect(hbCredit(r.events)).toBe(1);
    expect(r.state.players.corp.credits).toBe(7);
  });

  it("Haas-Bioroid's credit never comes from a Runner install; Kate never lowers a Corp price", () => {
    const s = coreBoard({ runnerHand: ['r04', 'r02'], runnerCredits: 5 });
    const r = act(s, runnerInstall(0));
    expect(hbCredit(r.events)).toBe(0);
    expect(r.state.players.corp.credits).toBe(s.players.corp.credits);
    // A Corp install of Wall of Static on a new server pays 3 even after a Runner discount turn.
    let t = finishTurn(r.state).state;
    t = withPlayer(withHand(t, 'corp', ['c04']), 'corp', { credits: 3 });
    const ins = act(t, corpInstall(0, 'new'));
    // ICE on a remote with no ICE costs 0 install; Wall of Static is installed face down, HB +1.
    expect(ins.state.players.corp.credits).toBe(4);
    expect(viewFor('corp', t).handOptions[0]!.every((o) => o.discount === undefined)).toBe(true);
  });

  it('Kate: hardware first (Cyberfeeder 2 -> 1), then a program costs full (Corroder 2)', () => {
    const s = coreBoard({ runnerHand: ['r08', 'r04'], runnerCredits: 5 });
    const v = viewFor('runner', s);
    expect(v.handOptions[0]!.find((o) => o.action.type === 'install')).toMatchObject({ cost: 1, discount: 1 });
    let r = act(s, runnerInstall(0));
    expect(r.state.players.runner.credits).toBe(4);
    expect(r.events).toContainEqual({ type: 'ability_triggered', uid: 'id:runner', cardId: 'r13', trigger: 'install_discount' });
    expect(viewFor('runner', r.state).handOptions[0]!.find((o) => o.action.type === 'install')).toMatchObject({ cost: 2 });
    expect(viewFor('runner', r.state).handOptions[0]!.find((o) => o.action.type === 'install')!.discount).toBeUndefined();
    r = act(r.state, runnerInstall(0));
    expect(r.state.players.runner.credits).toBe(2);
    expect(r.events.some((e) => e.type === 'ability_triggered')).toBe(false);
  });

  it('Kate: Sacrificial Construct (a free resource) and an event first leave the discount for Battering Ram (5 -> 4)', () => {
    const s = coreBoard({ runnerHand: ['r12', 'r01', 'r17'], runnerCredits: 4 });
    let r = act(s, runnerInstall(0)); // Construct, 0
    r = act(r.state, play('runner', 0)); // Easy Mark: 4 + 3 = 7
    expect(r.state.players.runner.credits).toBe(7);
    const opt = viewFor('runner', r.state).handOptions[0]!.find((o) => o.action.type === 'install')!;
    expect(opt).toMatchObject({ cost: 4, discount: 1, reject: null });
    r = act(r.state, runnerInstall(0));
    expect(r.state.players.runner.credits).toBe(3);
  });

  it('Kate: with exactly 3 credits Gordian Blade (4) is legal and leaves 0; a second program next is full price again next turn too', () => {
    const s = coreBoard({ runnerHand: ['r05', 'r16'], runnerCredits: 3 });
    let r = act(s, runnerInstall(0));
    expect(r.state.players.runner.credits).toBe(0);
    expect(rejection(apply(r.state, runnerInstall(0)).events)).toBe('no_credits');
    // Next Runner turn: discount back (Pipeline 3 -> 2).
    r = { state: finishTurn(finishTurn(r.state).state).state, events: [] };
    r = { state: withPlayer(r.state, 'runner', { credits: 2, hand: ['r16'] }), events: [] };
    expect(viewFor('runner', r.state).handOptions[0]!.find((o) => o.action.type === 'install')).toMatchObject({ cost: 2, discount: 1, reject: null });
  });

  it('identities are public in both views from the first board, with fixed uids', () => {
    const s = coreGame(9);
    for (const side of ['corp', 'runner'] as const) {
      const v = viewFor(side, s);
      expect(v.players.corp.identity).toEqual({ uid: 'id:corp', cardId: 'c13' });
      expect(v.players.runner.identity).toEqual({ uid: 'id:runner', cardId: 'r13' });
      expect(JSON.stringify(v)).not.toContain('installedThisTurn');
    }
  });
});

// ---- S-08-2 ------------------------------------------------------------------------------------

describe('QA S-08-2 Adonis Campaign, Melange Mining Corp., Biotic Labor', () => {
  it('the Runner accesses a face-down Adonis and trashes it (3): Archives face up, no credits ever placed, the Corp gains nothing', () => {
    const s = coreBoard({ servers: { remote1: { content: ['c14'] } }, runnerCredits: 5 });
    const corpCredits = s.players.corp.credits;
    let r = act(s, runOn('remote1'));
    // Access: trash it.
    const trash = legalActions(r.state, 'runner').find((a) => a.type === 'trash');
    expect(trash).toBeDefined();
    r = act(r.state, trash!);
    expect(r.events.some((e) => e.type === 'hosted_credits_changed' || e.type === 'ability_triggered')).toBe(false);
    expect(r.state.players.runner.credits).toBe(2);
    expect(r.state.players.corp.discard.at(-1)).toEqual({ cardId: 'c14', faceUp: true });
    expect(r.state.players.corp.credits).toBe(corpCredits);
  });

  it('the Runner trashes a face-up Adonis holding 9: the 9 credits go back to the bank, not to the Corp', () => {
    const s0 = coreBoard({ servers: { remote1: { content: ['+c14'] } }, runnerCredits: 5 });
    const s = { ...s0, servers: s0.servers.map((sv) => ({ ...sv, content: sv.content.map((c) => ({ ...c, hostedCredits: 9 })) })) };
    const corpCredits = s.players.corp.credits;
    let r = act(s, runOn('remote1'));
    r = act(r.state, legalActions(r.state, 'runner').find((a) => a.type === 'trash')!);
    expect(r.state.players.corp.credits).toBe(corpCredits);
    expect(r.state.servers.some((sv) => sv.id === 'remote1')).toBe(false);
    // Next Corp turn: no Adonis trigger.
    const t = finishTurn(r.state);
    expect(t.events.some((e) => e.type === 'ability_triggered' && e.cardId === 'c14')).toBe(false);
  });

  it('Adonis rezzed: exactly 12 in total over four Corp turns, never more; the card is gone after', () => {
    let s = corpTurn(['c14'], 10);
    s = act(s, corpInstall(0, 'new')).state; // +1 HB
    const uid = s.servers.find((sv) => sv.id === 'remote1')!.content[0]!.uid;
    s = act(s, { type: 'rez', player: 'corp', uid }).state;
    let gained = 0;
    for (let i = 0; i < 6; i++) {
      s = finishTurn(s).state; // Runner
      const r = finishTurn(s); // Corp turn begins
      gained += r.events.filter((e) => e.type === 'credit_gained' && e.player === 'corp').reduce((n, e) => n + (e as { amount: number }).amount, 0);
      s = r.state;
    }
    // Credit gains at Corp turn start in these decks come only from Adonis (no PAD installed).
    expect(gained).toBe(12);
    expect(s.servers.flatMap((sv) => sv.content).some((c) => c.cardId === 'c14')).toBe(false);
    expect(s.players.corp.discard.filter((d) => d.cardId === 'c14')).toEqual([{ cardId: 'c14', faceUp: true }]);
  });

  it('Melange after Biotic Labor: 4 clicks -> uses 3, 1 left, +7; with 2 clicks it is listed but refused (no_clicks)', () => {
    let s = corpTurn(['c15', 'c16'], 10);
    s = act(s, corpInstall(0, 'new')).state; // 11 credits, 2 clicks
    const uid = s.servers.find((sv) => sv.id === 'remote1')!.content[0]!.uid;
    s = act(s, { type: 'rez', player: 'corp', uid }).state; // 10 credits, rez costs no click
    expect(s.players.corp.clicks).toBe(2);
    const opt = viewFor('corp', s).installedOptions[uid]!.find((o) => o.action.type === 'activate')!;
    expect(opt).toMatchObject({ clicks: 3, gain: 7, reject: 'no_clicks' });
    expect(rejection(apply(s, opt.action).events)).toBe('no_clicks');
    s = act(s, play('corp', 0)).state; // Biotic Labor: 6 credits, 1 + 2 = 3 clicks
    expect(s.players.corp.clicks).toBe(3);
    const r = act(s, opt.action);
    expect(r.state.players.corp.clicks).toBe(0);
    expect(r.state.players.corp.credits).toBe(13);
  });

  it('Biotic Labor is a one-turn boost: the next Corp turn starts with 3 clicks again', () => {
    let s = corpTurn(['c16'], 10);
    s = act(s, play('corp', 0)).state;
    expect(s.players.corp.clicks).toBe(4);
    // Spend all clicks, then a full round.
    for (let i = 0; i < 4; i++) s = act(s, { type: 'gain_credit', player: 'corp' } as Action).state;
    s = finishTurn(s).state;
    s = finishTurn(s).state;
    expect(s.activePlayer).toBe('corp');
    expect(s.players.corp.clicks).toBe(3);
  });

  it('face-down Melange: the Corp gets only Rez on it; the Runner view has no number on it and no option', () => {
    let s = corpTurn(['c15', 'c14'], 10);
    s = run(s, [corpInstall(0, 'new'), corpInstall(0, 'new')]).state;
    for (const c of s.servers.flatMap((sv) => sv.content)) {
      expect(viewFor('corp', s).installedOptions[c.uid]!.map((o) => o.action.type)).toEqual(['rez']);
      const rv = viewFor('runner', s).corpServers.flatMap((sv) => sv.content).find((x) => x.uid === c.uid)!;
      expect(rv.cardId).toBeNull();
      expect(rv.hostedCredits ?? 0).toBe(0);
      expect(viewFor('runner', s).installedOptions[c.uid]).toBeUndefined();
    }
  });
});

// ---- S-08-3 ------------------------------------------------------------------------------------

describe('QA S-08-3 brain damage', () => {
  const atIce = (ice: string, hand: string[], rig: string[] = [], credits = 5) => {
    const s = act(coreBoard({ servers: { hq: { ice: [`+${ice}`] } }, runnerHand: hand, rig, runnerCredits: credits }), runOn('hq')).state;
    expect(s.run?.step).toBe('encounter');
    return s;
  };

  it('Viktor with exactly one Grip card: that card goes, no flatline, max 4, the run ends', () => {
    const r = act(atIce('c17', ['r14']), pass('runner'));
    expect(r.state.phase).not.toBe('over');
    expect(r.state.players.runner.hand).toEqual([]);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r14', faceUp: true });
    expect(r.events).toContainEqual({ type: 'brain_damage', amount: 1, cardIds: ['r14'], maxHandSize: 4 });
    expect(r.state.run).toBeNull();
    // Both views show the lower max and the lost card face up in the Heap.
    for (const side of ['corp', 'runner'] as const) {
      const v = viewFor(side, r.state);
      expect(v.players.runner.maxHandSize).toBe(4);
      expect(v.players.runner.brainDamage).toBe(1);
      expect(v.players.runner.discard.at(-1)).toBe('r14');
      expect(v.players.corp.maxHandSize).toBe(5);
      expect(viewEvents(side, r.events)).toContainEqual({ type: 'brain_damage', amount: 1, cardIds: ['r14'], maxHandSize: 4 });
    }
  });

  it('Heimdall with an empty Grip: flatline at the first subroutine (the Corp wins, nothing more fires)', () => {
    const r = act(atIce('c18', []), pass('runner'));
    expect(r.state.phase).toBe('over');
    expect(r.events.find((e) => e.type === 'game_over')).toEqual({ type: 'game_over', winner: 'corp', reason: 'flatline' });
    expect(r.events.filter((e) => e.type === 'subroutine_fired')).toHaveLength(1);
    expect(legalActions(r.state, 'runner')).toEqual([]);
    expect(legalActions(r.state, 'corp')).toEqual([]);
  });

  it('after 2 brain damage the Runner with 4 cards ends the turn without a discard; with 4 and max 3 he discards exactly 1', () => {
    let s = atIce('c17', ['r01', 'r03', 'r07', 'r11', 'r14']);
    s = act(s, pass('runner')).state; // 4 cards, max 4
    expect(s.players.runner.hand).toHaveLength(4);
    let e = act(s, { type: 'end_turn', player: 'runner' });
    expect(e.state.phase).not.toBe('discard');
    // Another hit next Runner turn: max 3.
    s = withPlayer(finishTurn(e.state).state, 'runner', { hand: ['r01', 'r03', 'r07', 'r11', 'r14'] });
    s = run(s, [runOn('hq'), pass('runner')]).state;
    expect(s.players.runner.brainDamage).toBe(2);
    expect(s.players.runner.hand).toHaveLength(4);
    e = act(s, { type: 'end_turn', player: 'runner' });
    expect(e.state.phase).toBe('discard');
    expect(e.events).toContainEqual({ type: 'discard_required', player: 'runner', count: 1 });
    expect(rejection(apply(e.state, { type: 'discard', player: 'runner', handIndices: [0, 1] } as Action).events)).toBe('bad_discard');
  });

  it('6 brain damage (max -1): ending the turn flatlines even with an empty Grip; a draw that turn changes nothing', () => {
    const s = withPlayer(coreBoard({ runnerHand: [], runnerClicks: 1 }), 'runner', { brainDamage: 6 });
    expect(viewFor('corp', s).players.runner.maxHandSize).toBe(-1);
    const r = act(s, { type: 'end_turn', player: 'runner' });
    expect(r.events).toEqual([{ type: 'game_over', winner: 'corp', reason: 'flatline' }]);
  });

  it('Corroder pumps to 6 on Heimdall: every break option shows the full price after the pumps (4 + 3 = 7 total)', () => {
    let s = atIce('c18', ['r01'], ['r04'], 7);
    const v = viewFor('runner', s);
    const breaks = v.run!.options.filter((o) => o.action.type === 'use_ability' && (o.action as { ability: number }).ability === 0);
    expect(breaks.every((o) => o.reject === 'too_weak')).toBe(true);
    for (let i = 0; i < 4; i++) s = act(s, pump('i1')).state;
    for (let sub = 0; sub < 3; sub++) s = act(s, breakSub('i1', sub)).state;
    expect(s.players.runner.credits).toBe(0);
    expect(s.run?.step).not.toBe('encounter');
  });
});

// ---- S-08-4 ------------------------------------------------------------------------------------

describe('QA S-08-4 Kate cards', () => {
  it('Sure Gamble with 4 credits is refused (no_credits); with 5 it gives 9', () => {
    const s = coreBoard({ runnerHand: ['r14'], runnerCredits: 4 });
    expect(rejection(apply(s, play('runner', 0)).events)).toBe('no_credits');
    expect(act(withPlayer(s, 'runner', { credits: 5 }), play('runner', 0)).state.players.runner.credits).toBe(9);
  });

  it('Magnum Opus: 12 uses over three turns, +2 each, still installed', () => {
    let s = act(coreBoard({ runnerHand: ['r15'], runnerCredits: 4 }), runnerInstall(0)).state; // 5 - 1 = 4 credits
    expect(s.players.runner.credits).toBe(0);
    let uses = 0;
    for (let turn = 0; turn < 3; turn++) {
      while (s.players.runner.clicks > 0) {
        s = act(s, { type: 'activate', player: 'runner', uid: 'i1', ability: 0 } as Action).state;
        uses++;
      }
      if (turn < 2) s = finishTurn(finishTurn(s).state).state;
    }
    expect(uses).toBe(3 + 4 + 4);
    expect(s.rig.map((c) => c.cardId)).toEqual(['r15']);
    expect(s.players.runner.credits).toBe(22);
  });

  it('Pipeline breaks Rototurret (strength 0) for 1 credit each with no pump; its +strength carries to the next sentry in the run', () => {
    // HQ: Rototurret (inner) and Neural Katana (outer). Pipeline pumps on Katana, then meets Rototurret.
    let s = act(coreBoard({ servers: { hq: { ice: ['+c19', '+c07'] } }, rig: ['r16'], runnerCredits: 10, runnerHand: ['r01', 'r03', 'r07', 'r11'] }), runOn('hq')).state;
    for (let i = 0; i < 2; i++) s = act(s, pump('i1')).state;
    s = act(s, breakSub('i1', 0)).state; // Katana
    s = act(s, pass('runner')).state; // all broken -> pass
    while (s.run?.step !== 'encounter') s = act(s, legalActions(s, waitingOn(s)!).find((a) => a.type === 'pass') ?? pass(waitingOn(s)!)).state;
    expect(s.run!.position).toBe(0);
    // Strength stays 3 at Rototurret (for the remainder of this run).
    const brk = viewFor('runner', s).run!.options.filter((o) => (o.action as { ability?: number }).ability === 0);
    expect(brk.every((o) => o.reject === null && o.cost === 1)).toBe(true);
    const before = s.players.runner.credits;
    s = run(s, [breakSub('i1', 0), breakSub('i1', 1)]).state;
    expect(s.players.runner.credits).toBe(before - 2);
  });

  it('Battering Ram: Wall of Static (1 subroutine) offers only [0]; no break on a code gate; bad subs shapes refused', () => {
    let s = act(coreBoard({ servers: { hq: { ice: ['+c04'] } }, rig: ['r17'], runnerCredits: 10 }), runOn('hq')).state;
    const subsets = viewFor('runner', s).run!.options.filter((o) => (o.action as { ability?: number }).ability === 0).map((o) => (o.action as { subs?: number[] }).subs);
    expect(subsets).toEqual([[0]]);
    expect(rejection(apply(s, breakSubs('i1', [0, 0])).events)).not.toBeNull();
    expect(rejection(apply(s, breakSubs('i1', [1])).events)).not.toBeNull();
    s = act(s, breakSubs('i1', [0])).state;
    expect(s.players.runner.credits).toBe(8);
    // Code gate (Viktor): Ram has no break option.
    const g = act(coreBoard({ servers: { hq: { ice: ['+c17'] } }, rig: ['r17'], runnerCredits: 10 }), runOn('hq')).state;
    expect(viewFor('runner', g).run!.options.some((o) => (o.action as { ability?: number }).ability === 0)).toBe(false);
  });

  it('Battering Ram on Heimdall: [2,1] (descending), [0,1,2] (three) and a broken sub are refused; the pump lasts into the next barrier', () => {
    // HQ: Wall of Static (inner, str 3) and Heimdall (outer, str 6).
    let s = act(coreBoard({ servers: { hq: { ice: ['+c04', '+c18'] } }, rig: ['r17'], runnerCredits: 12, runnerHand: ['r01', 'r03'] }), runOn('hq')).state;
    for (let i = 0; i < 3; i++) s = act(s, pump('i1')).state; // 9 credits
    expect(rejection(apply(s, breakSubs('i1', [2, 1])).events)).not.toBeNull();
    expect(rejection(apply(s, breakSubs('i1', [0, 1, 2])).events)).not.toBeNull();
    s = act(s, breakSubs('i1', [0, 2])).state; // 7
    expect(rejection(apply(s, breakSubs('i1', [0, 1])).events)).not.toBeNull();
    s = act(s, breakSubs('i1', [1])).state; // 5
    expect(s.players.runner.credits).toBe(5);
    s = act(s, pass('runner')).state;
    while (s.run && s.run.step !== 'encounter') s = act(s, legalActions(s, waitingOn(s)!).find((a) => a.type === 'pass') ?? pass(waitingOn(s)!)).state;
    expect(s.run!.position).toBe(0);
    // Ram is still strength 6 at Wall of Static: the break is legal with no pump.
    const brk = viewFor('runner', s).run!.options.find((o) => (o.action as { ability?: number }).ability === 0)!;
    expect(brk.reject).toBeNull();
  });

  it('memory: Ram (2) + Gordian (1) + Pipeline (1) = 4 of Kate 4, Magnum Opus (2) refused with no_memory (6 needed)', () => {
    let s = coreBoard({ runnerHand: ['r17', 'r05', 'r16', 'r15'], runnerCredits: 30, runnerClicks: 4 });
    s = run(s, [runnerInstall(0), runnerInstall(0), runnerInstall(0)]).state;
    expect(viewFor('runner', s).handOptions[0]!.find((o) => o.action.type === 'install')!.reject).toBe('no_memory');
    expect(rejection(apply(s, runnerInstall(0)).events)).toBe('no_memory');
  });
});

// ---- S-08-7 ------------------------------------------------------------------------------------

describe('QA S-08-7 Rototurret and Sacrificial Construct', () => {
  const atTurret = (rig: string[], hand: string[] = ['r01']) => {
    const s = act(coreBoard({ servers: { hq: { ice: ['+c19'] } }, rig, runnerHand: hand }), runOn('hq')).state;
    expect(s.run?.step).toBe('encounter');
    return s;
  };

  it('only programs are candidates: hardware, resources and the Construct itself are never offered (one program + 2 hardware -> no question)', () => {
    const r = act(atTurret(['r09', 'r04', 'r08']), pass('runner'));
    expect(r.events.some((e) => e.type === 'choice_opened')).toBe(false);
    expect(r.events).toContainEqual({ type: 'rig_card_trashed', uid: 'i2', cardId: 'r04' });
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r09', 'r08']);
  });

  it('two programs + hardware + Construct: Corp options are exactly the two programs; a Construct/hardware uid is bad_target', () => {
    const s = act(atTurret(['r09', 'r04', 'r12', 'r16']), pass('runner')).state;
    expect(waitingOn(s)).toBe('corp');
    const opts = viewFor('corp', s).choice!.options.map((o) => o.action);
    expect(opts).toEqual([choose('corp', 'i2'), choose('corp', 'i4')]);
    expect(rejection(apply(s, choose('corp', 'i1')).events)).toBe('bad_target');
    expect(rejection(apply(s, choose('corp', 'i3')).events)).toBe('bad_target');
    // The Runner has nothing to do, and his view has no options in the choice.
    expect(legalActions(s, 'runner')).toEqual([]);
    expect(viewFor('runner', s).choice!.options).toEqual([]);
    expect(viewFor('runner', s).run).not.toBeNull();
  });

  it('one program + Construct: no Corp question, the Runner is asked directly; save -> Construct in the Heap, Pipeline kept, run ended', () => {
    let s = act(atTurret(['r16', 'r12']), pass('runner')).state;
    expect(waitingOn(s)).toBe('runner');
    expect(viewFor('runner', s).choice).toMatchObject({ kind: 'prevent_trash', target: 'i1', cardId: 'c19' });
    const r = act(s, choose('runner', 'i2'));
    expect(r.state.rig.map((c) => c.cardId)).toEqual(['r16']);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r12', faceUp: true });
    expect(r.state.run).toBeNull();
    // The Construct is gone: the next Rototurret hit just trashes Pipeline.
    s = withPlayer(finishTurn(finishTurn(r.state).state).state, 'runner', { hand: ['r01'] });
    const r2 = run(s, [runOn('hq'), pass('runner')]);
    expect(r2.events.some((e) => e.type === 'choice_opened')).toBe(false);
    expect(r2.state.rig).toEqual([]);
  });

  it('the trashed program frees its memory: Magnum Opus fits again after Battering Ram is trashed', () => {
    let s = coreBoard({ servers: { hq: { ice: ['+c19'] } }, runnerHand: ['r17', 'r05', 'r16', 'r15'], runnerCredits: 30 });
    s = run(s, [runnerInstall(0), runnerInstall(0), runnerInstall(0)]).state; // Ram i2, Gordian i3, Pipeline i4 (Rototurret is i1)
    expect(rejection(apply(s, runnerInstall(0)).events)).toBe('no_memory');
    s = run(s, [runOn('hq'), pass('runner')]).state;
    const ram = s.rig.find((c) => c.cardId === 'r17')!.uid;
    s = act(s, choose('corp', ram)).state;
    expect(s.run).toBeNull();
    expect(s.players.runner.clicks).toBe(0);
    s = withPlayer(s, 'runner', { clicks: 1 });
    expect(act(s, runnerInstall(0)).state.rig.map((c) => c.cardId).sort()).toEqual(['r05', 'r15', 'r16']);
  });

  it('Pipeline breaks "Trash 1 program" and lets "End the run" fire: nothing is trashed', () => {
    const s = atTurret(['r16', 'r04'], ['r01']);
    const r = run(s, [breakSub('i1', 0), pass('runner')]);
    expect(r.events.some((e) => e.type === 'rig_card_trashed' || e.type === 'choice_opened')).toBe(false);
    expect(r.state.rig).toHaveLength(2);
    expect(r.state.run).toBeNull();
  });
});

// ---- Sweep -------------------------------------------------------------------------------------

function prng(seed: number): (n: number) => number {
  let x = (seed * 2654435761) >>> 0 || 11;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}

const S8_TYPES = new Set(['choose', 'activate', 'rez', 'install', 'run', 'use_ability', 'play']);

describe('QA Sprint 8 sweep: random core-deck games with QA bookkeeping', () => {
  it('first-install credit, Kate price, brain damage, Adonis totals, face-down cards never act, hidden info, choices, replay', () => {
    const tally = { games: 0, actions: 0, hb: 0, kate: 0, brain: 0, adonisTaken: 0, adonisTrashed: 0, melange: 0, biotic: 0, trashTarget: 0, preventTrash: 0, saved: 0, ramPairs: 0, flatlineBrain: 0 };
    for (let game = 1; game <= 150; game++) {
      const pick = prng(game * 7919 + 3);
      let s = coreGame(game, game % 2 ? { rezWindow: 'always' } : {});
      const actions: Action[] = [];
      let corpInstalls = 0;
      let runnerHwPrgInstalls = 0;
      const adonisGiven = new Map<string, number>();
      let brainTotal = 0;
      for (let i = 0; i < 900 && s.phase !== 'over'; i++) {
        const where = `game ${game} step ${i}`;
        const seat = waitingOn(s)!;
        const legal = legalActions(s, seat);
        expect(legal.length, where).toBeGreaterThan(0);
        expect(legalActions(s, seat === 'corp' ? 'runner' : 'corp'), `${where}: only one side acts`).toEqual([]);
        // In-run choices are always real decisions (no empty window).
        if (s.choice?.kind === 'trash_target') expect(legal.filter((a) => a.type === 'choose').length, where).toBeGreaterThanOrEqual(2);
        if (s.choice?.kind === 'prevent_trash') expect(legal.map((a) => a.type).sort(), where).toEqual(['choose', 'pass']);
        const s8 = legal.filter((a) => S8_TYPES.has(a.type));
        const a = s8.length > 0 && pick(3) !== 0 ? s8[pick(s8.length)]! : legal[pick(legal.length)]!;
        const before = s;
        const r = apply(s, a);
        expect(r.events.some((e) => e.type === 'action_rejected'), `${where}: legal accepted ${JSON.stringify(a)}`).toBe(false);
        actions.push(a);
        s = r.state;
        tally.actions++;

        // Turn bookkeeping.
        if (r.events.some((e) => e.type === 'turn_started')) {
          corpInstalls = 0;
          runnerHwPrgInstalls = 0;
        }
        const turnStart = r.events.findIndex((e) => e.type === 'turn_started');
        // Haas-Bioroid: +1 exactly on the first Corp install of the turn.
        if (a.type === 'install' && a.player === 'corp') {
          const trig = r.events.filter((e) => e.type === 'ability_triggered' && e.uid === 'id:corp');
          expect(trig.length, `${where}: HB trigger on corp install #${corpInstalls + 1}`).toBe(corpInstalls === 0 ? 1 : 0);
          if (trig.length) tally.hb++;
          corpInstalls++;
        } else {
          expect(r.events.some((e) => e.type === 'ability_triggered' && e.uid === 'id:corp'), `${where}: HB only on installs`).toBe(false);
        }
        // Kate: price = max(0, cost - 1) on the first program/hardware install of the Runner turn.
        if (a.type === 'install' && a.player === 'runner') {
          const id = before.players.runner.hand[(a as { handIndex: number }).handIndex]!;
          const c = getCard(id)!;
          const spent = before.players.runner.credits - s.players.runner.credits;
          const hwPrg = c.type === 'program' || c.type === 'hardware';
          const expected = hwPrg && runnerHwPrgInstalls === 0 ? Math.max(0, c.cost - 1) : c.cost;
          expect(spent, `${where}: ${c.name} price`).toBe(expected);
          const disc = r.events.some((e) => e.type === 'ability_triggered' && e.uid === 'id:runner');
          expect(disc, `${where}: Kate note`).toBe(hwPrg && runnerHwPrgInstalls === 0 && c.cost > 0);
          if (disc) tally.kate++;
          if (hwPrg) runnerHwPrgInstalls++;
        }
        // Brain damage: running total = state; max hand size in both views.
        for (const e of r.events) {
          if (e.type === 'brain_damage') {
            brainTotal += e.amount;
            tally.brain++;
            expect(e.maxHandSize).toBe(5 - brainTotal);
            if (s.phase === 'over') tally.flatlineBrain++;
          }
          if (e.type === 'clicks_gained') tally.biotic++;
          if (e.type === 'choice_opened' && e.kind === 'trash_target') tally.trashTarget++;
          if (e.type === 'choice_opened' && e.kind === 'prevent_trash') tally.preventTrash++;
          if (e.type === 'trash_prevented') tally.saved++;
          if (e.type === 'corp_card_trashed') {
            tally.adonisTrashed++;
            // Only a face-up card is trashed this way.
            const was = before.servers.flatMap((sv) => sv.content).find((c) => c.uid === e.uid);
            expect(was?.rezzed, `${where}: corp_card_trashed of a face-up card`).toBe(true);
          }
        }
        expect(s.players.runner.brainDamage).toBe(brainTotal);
        for (const side of ['corp', 'runner'] as const) {
          const v = viewFor(side, s);
          expect(v.players.runner.maxHandSize).toBe(5 - brainTotal);
          expect(v.players.corp.maxHandSize).toBe(5);
          expect(JSON.stringify(v)).not.toContain('installedThisTurn');
        }
        if (a.type === 'use_ability' && (a as { subs?: number[] }).subs?.length === 2) tally.ramPairs++;
        // Sprint 9 (engine-dev): Private Security Force is the other Corp `activate` (a scored uid, 1 click).
        if (a.type === 'activate' && a.player === 'corp' && a.uid.startsWith('score:')) {
          expect(before.players.corp.clicks - s.players.corp.clicks).toBe(1);
          expect(r.events.some((e) => e.type === 'meat_damage')).toBe(true);
        } else if (a.type === 'activate' && a.player === 'corp') {
          tally.melange++;
          expect(before.players.corp.clicks - s.players.corp.clicks).toBe(3);
          expect(s.players.corp.credits - before.players.corp.credits).toBe(7);
        }
        // Adonis: credits taken per card never exceed 12; only face-up cards trigger.
        for (const e of r.events) {
          if (e.type === 'ability_triggered' && e.uid !== 'id:corp' && e.uid !== 'id:runner') {
            const card = before.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((c) => c.uid === e.uid);
            if (card) expect(card.rezzed || r.events.some((x) => x.type === 'card_rezzed' && x.uid === e.uid), `${where}: ${e.cardId} triggered face down`).toBe(true);
          }
        }
        if (turnStart >= 0) {
          let k = turnStart;
          for (; k < r.events.length; k++) {
            const e = r.events[k]!;
            if (e.type === 'ability_triggered' && e.cardId === 'c14') {
              const credit = r.events.slice(k).find((x) => x.type === 'credit_gained' && x.player === 'corp') as { amount: number } | undefined;
              adonisGiven.set(e.uid, (adonisGiven.get(e.uid) ?? 0) + (credit?.amount ?? 0));
              tally.adonisTaken++;
            }
          }
        }
        for (const [uid, n] of adonisGiven) expect(n, `${where}: Adonis ${uid}`).toBeLessThanOrEqual(12);
        // Face-down Corp cards: no hosted credits, no options but rez/advance for the Corp, nothing for the Runner.
        const cv = viewFor('corp', s);
        const rv = viewFor('runner', s);
        for (const c of s.servers.flatMap((sv) => [...sv.ice, ...sv.content])) {
          if (c.rezzed) continue;
          expect(c.hostedCredits, `${where}: hosted on face-down ${c.cardId}`).toBe(0);
          for (const o of cv.installedOptions[c.uid] ?? []) expect(['rez', 'advance', 'score'], where).toContain(o.action.type);
          expect(rv.installedOptions[c.uid]).toBeUndefined();
          const seen = rv.corpServers.flatMap((sv) => [...sv.ice, ...sv.content]).find((x) => x.uid === c.uid)!;
          expect(seen.cardId, where).toBeNull();
        }
        // Runner events never name a face-down card (outside access).
        const down = new Set(s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => !c.rezzed).map((c) => c.uid));
        for (const e of viewEvents('runner', r.events)) {
          const uid = (e as { uid?: string }).uid;
          if (uid && down.has(uid) && e.type !== 'card_accessed') expect((e as { cardId?: string }).cardId ?? null, `${where}: ${JSON.stringify(e)}`).toBeNull();
        }
        // The Runner's choice view during Corp choices: no options.
        if (s.choice && s.choice.player === 'corp') expect(rv.choice?.options ?? []).toEqual([]);
      }
      // Replay gives the same state.
      expect(engineReplay(game, actions, { ...(game % 2 ? { rezWindow: 'always' as const } : {}), deckSet: 'core' }).state).toEqual(s);
      tally.games++;
    }
    console.log('QA sprint 8 sweep', JSON.stringify(tally));
    for (const k of ['hb', 'kate', 'brain', 'adonisTaken', 'melange', 'biotic', 'trashTarget', 'preventTrash'] as const) expect(tally[k], k).toBeGreaterThan(0);
  }, 180_000);
});

// ---- Round 2: RunView.breakAll (QA-S8-2 fix) -------------------------------------------------

describe('QA round 2: breakAll price and hidden information', () => {
  /** QA's own price from card data: pumps to reach the ICE's strength, then breaks of the unbroken subs. */
  function formula(s: GameState, uid: string, breakerStrength: number): number | null {
    const run = s.run!;
    const ice = s.servers.find((sv) => sv.id === run.server)!.ice[run.position]!;
    const ic = getCard(ice.cardId)!;
    const bc = getCard(s.rig.find((c) => c.uid === uid)!.cardId)!;
    const brk = bc.abilities?.find((a) => a.op === 'break') as { cost: number; count: number; iceType: string } | undefined;
    const pump = bc.abilities?.find((a) => a.op === 'strength') as { cost: number; amount: number } | undefined;
    if (!brk || brk.iceType !== ic.subtype) return null;
    const iceStr = (ic.strength ?? 0) + ice.advancements * (ic.strengthPerAdvancement ?? 0);
    const need = Math.max(0, iceStr - breakerStrength);
    if (need > 0 && !pump) return null;
    const pumps = need > 0 ? Math.ceil(need / pump!.amount) : 0;
    const unbroken = ic.subroutines!.length - run.broken.length;
    return pumps * (pump?.cost ?? 0) + Math.ceil(unbroken / brk.count) * brk.cost;
  }

  /** Same game with different hidden Corp information: HQ, R&D order, face-down card ids elsewhere. */
  function perturb(s: GameState): GameState {
    const swap: Record<string, string> = { c01: 'c03', c03: 'c01', c09: 'c10', c10: 'c09', c14: 'c15', c15: 'c14', c05: 'c04', c04: 'c05' };
    const run = s.run!;
    const servers = s.servers.map((sv) => ({
      ...sv,
      content: sv.content.map((c) => (c.rezzed ? c : { ...c, cardId: swap[c.cardId] ?? c.cardId })),
      ice: sv.ice.map((c, i) => (c.rezzed || (sv.id === run.server && i === run.position) ? c : { ...c, cardId: swap[c.cardId] ?? c.cardId })),
    }));
    return {
      ...s,
      servers,
      players: { ...s.players, corp: { ...s.players.corp, hand: s.players.corp.hand.map((id) => swap[id] ?? id), deck: [...s.players.corp.deck].reverse() } },
    };
  }

  it('random core-deck games: Corp view and unrezzed ICE give []; each entry = QA formula; absent only when unaffordable; hidden changes never change it', () => {
    const tally = { encounters: 0, entries: 0, pumped: 0, perturbed: 0, unrezzed: 0, unaffordable: 0 };
    for (let game = 1; game <= 120; game++) {
      const pick = prng(game * 104729 + 1);
      // Half the games give the Runner 40 credits, so more full breaks are affordable.
      let s = coreGame(game, game % 2 ? { rezWindow: 'always' } : {});
      if (game % 3 !== 0) s = withPlayer(s, 'runner', { credits: 40 });
      for (let i = 0; i < 900 && s.phase !== 'over'; i++) {
        const where = `game ${game} step ${i}`;
        if (s.run) {
          expect(viewFor('corp', s).run?.breakAll ?? [], `${where}: corp`).toEqual([]);
          const rv = viewFor('runner', s).run!;
          if (s.run.step !== 'encounter') expect(rv.breakAll, where).toEqual([]);
          else {
            const ice = s.servers.find((sv) => sv.id === s.run!.server)!.ice[s.run.position]!;
            if (!ice.rezzed) {
              tally.unrezzed++;
              expect(rv.breakAll, `${where}: face-down ICE`).toEqual([]);
            } else if (s.choice === null) {
              tally.encounters++;
              const money = s.players.runner.credits + s.run.tempCredits + s.rig.reduce((n, c) => n + c.hostedCredits, 0);
              for (const c of s.rig) {
                const f = formula(s, c.uid, rv.breakerStrength[c.uid] ?? getCard(c.cardId)!.strength ?? 0);
                const entry = rv.breakAll.find((b) => b.uid === c.uid);
                if (entry) {
                  tally.entries++;
                  expect(entry.credits, `${where}: ${c.cardId}`).toBe(f);
                  expect(entry.strengthCredits + entry.breakCredits).toBe(entry.credits);
                  if (entry.strengthCredits > 0) tally.pumped++;
                } else if (f !== null && f > 0) {
                  // Missing only when he can't pay it (QA's upper bound includes every card credit).
                  if (f <= s.players.runner.credits + s.run.tempCredits) expect.fail(`${where}: ${c.cardId} affordable (${f}) but no breakAll`);
                  if (f > money) tally.unaffordable++;
                }
              }
              for (const b of rv.breakAll) expect(s.rig.some((c) => c.uid === b.uid), where).toBe(true);
            }
            const p = perturb(s);
            expect(viewFor('runner', p).run!.breakAll, `${where}: hidden info changed breakAll`).toEqual(rv.breakAll);
            tally.perturbed++;
          }
        }
        const seat = waitingOn(s)!;
        const legal = legalActions(s, seat);
        const runs = legal.filter((a) => a.type === 'run' || a.type === 'use_ability' || a.type === 'rez' || a.type === 'install');
        const a = runs.length > 0 && pick(3) !== 0 ? runs[pick(runs.length)]! : legal[pick(legal.length)]!;
        s = apply(s, a).state;
      }
    }
    console.log('QA round 2 breakAll probe', JSON.stringify(tally));
    expect(tally.entries).toBeGreaterThan(50);
    expect(tally.pumped).toBeGreaterThan(5);
    // (Face-down ICE is never encountered: it is passed at approach, so `unrezzed` stays 0; the check stays as a guard.)
  }, 180_000);

  it('Heimdall: Corroder 4 + 3 = 7; Battering Ram 3 + 4 = 7; with 6 credits Corroder is absent; the real state is untouched', () => {
    const s = act(coreBoard({ servers: { hq: { ice: ['+c18'] } }, rig: ['r04', 'r17'], runnerCredits: 7, runnerHand: ['r01'] }), runOn('hq')).state;
    const frozen = JSON.stringify(s);
    const ba = viewFor('runner', s).run!.breakAll;
    expect(ba).toEqual([
      { uid: 'i1', credits: 7, strengthCredits: 4, breakCredits: 3 },
      { uid: 'i2', credits: 7, strengthCredits: 3, breakCredits: 4 },
    ]);
    expect(JSON.stringify(s)).toBe(frozen);
    const poor = withPlayer(s, 'runner', { credits: 6 });
    expect(viewFor('runner', poor).run!.breakAll).toEqual([]);
    // After one Ram pump (for the run) the plan counts only the rest.
    const r = act(s, pump('i2')).state;
    expect(viewFor('runner', r).run!.breakAll.find((b) => b.uid === 'i2')).toEqual({ uid: 'i2', credits: 6, strengthCredits: 2, breakCredits: 4 });
  });
});
