// QA Sprint 9 (written by QA, not the developers). Independent checks of S-09-1..4 (S-09-5 dropped by the owner):
// - QA's own table of the four new cards (2012 Core Set numbers and wording) and QA's own deck arithmetic.
// - Rule edge cases on hand-built core-deck boards: ties, skipped windows from both sides (0 credits,
//   hopeless, already safe), refusals in the pinned order, tags across several rounds, remove/trash
//   refusal reasons, PSF untagged / no clicks / 1-card Grip / empty Grip, SEA Source "last turn" only,
//   Access to Globalsec link going up and down, Ichi with one program.
// - A random-play sweep over core-deck games with QA's own bookkeeping of every trace (who could bid,
//   what was paid, who won), every tag change, every resource trashed for tags and every meat damage,
//   plus the hidden-information checks after every action.
import { CORP_CORE_DECK, RUNNER_CORE_DECK, getCard } from '@overclock/cards';
import { describe, expect, it } from 'vitest';
import {
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
import { act, board, coreGame, finishTurn, liveness, rejection, run, withPlayer, type BoardSpec } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const bid = (player: Side, credits: number): Action => ({ type: 'trace_bid', player, credits });
const letFire: Action = { type: 'pass', player: 'runner' };
const removeTag: Action = { type: 'remove_tag', player: 'runner' };
const trashRes = (uid: string): Action => ({ type: 'trash_resource', player: 'corp', uid });
const psf = (i = 0): Action => ({ type: 'activate', player: 'corp', uid: `score:corp:${i}`, ability: 0 } as Action);
const runOn = (server: string): Action => ({ type: 'run', player: 'runner', server } as Action);
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);

/** Runner turn on a core-deck board (Kate, link 1), ICE `ice` face up alone on HQ, encountered. */
function atIce(ice: string, spec: Omit<BoardSpec, 'servers'> = {}): GameState {
  const s = act(board({ ...spec, servers: { hq: { ice: [`+${ice}`] } } }, 77, CORE), runOn('hq')).state;
  expect(s.run?.step).toBe('encounter');
  return s;
}

/** The Corp's next turn after the board's Runner turn (Runner ended with no run), with `tags` and Corp extras. */
function corpTurnAfter(spec: BoardSpec, tags: number, corp: { scored?: string[]; clicks?: number; credits?: number } = {}): GameState {
  let s = board(spec, 77, CORE);
  s = withPlayer(s, 'runner', { tags });
  s = finishTurn(s).state;
  expect(s.activePlayer).toBe('corp');
  return withPlayer(s, 'corp', { scoreArea: corp.scored ?? s.players.corp.scoreArea, clicks: corp.clicks ?? s.players.corp.clicks, credits: corp.credits ?? s.players.corp.credits });
}

function clean(r: { state: GameState; events: GameEvent[] }, where: string): void {
  expectRunnerEventsClean(viewEvents('runner', r.events), where, r.state);
  expectRunnerViewClean(r.state, where);
  liveness(r.state);
}

// ---- Card data: QA's own reading of the 2012 Core Set printing ----

describe('QA S-09-4 the new cards vs the 2012 Core Set (QA table)', () => {
  const QA: Record<string, { name: string; side: string; type: string; faction: string; cost: number; inf: number; str?: number; sub?: string; link?: number; text: string }> = {
    c20: { name: 'Hunter', side: 'corp', type: 'ice', faction: 'neutral', cost: 1, inf: 0, str: 4, sub: 'sentry', text: 'Subroutine: Trace 3 – If successful, give the Runner 1 tag.' },
    c21: {
      name: 'Ichi 1.0',
      side: 'corp',
      type: 'ice',
      faction: 'haas_bioroid',
      cost: 5,
      inf: 2,
      str: 4,
      sub: 'sentry',
      text: 'Subroutine: Trash 1 program.\nSubroutine: Trash 1 program.\nSubroutine: Trace 1 – If successful, give the Runner 1 tag and do 1 brain damage.',
    },
    c22: { name: 'SEA Source', side: 'corp', type: 'operation', faction: 'nbn', cost: 2, inf: 2, text: 'Play only if the Runner made a successful run during his or her last turn.\nTrace 3 – If successful, give the Runner 1 tag.' },
    r18: { name: 'Access to Globalsec', side: 'runner', type: 'resource', faction: 'neutral', cost: 1, inf: 0, link: 1, text: '+1 link.' },
  };

  for (const [id, q] of Object.entries(QA)) {
    it(`${id} ${q.name}: numbers and 2012 wording`, () => {
      const c = getCard(id)!;
      expect(c).toBeTruthy();
      expect(c.name).toBe(q.name);
      expect(c.side).toBe(q.side);
      expect(c.type).toBe(q.type);
      expect(c.faction).toBe(q.faction);
      expect(c.cost).toBe(q.cost);
      expect(c.influence ?? 0).toBe(q.inf);
      if (q.str !== undefined) expect(c.strength).toBe(q.str);
      if (q.sub) expect(c.subtype).toBe(q.sub);
      expect(c.link ?? 0).toBe(q.link ?? 0);
      expect(c.text).toBe(q.text);
      // 2012 printing: no "core damage", no "Lose [click]: Break" line, "his or her".
      expect(c.text).not.toMatch(/core damage|Lose|their last turn/);
    });
  }

  it('the behaviour behind the text: Hunter Trace 3 → 1 tag; Ichi trash, trash, Trace 1 → tag then brain damage; SEA Source playIf + Trace 3 last; PSF scored ability', () => {
    expect(getCard('c20')!.subroutines!.map((s) => s.effect)).toEqual([{ op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] }]);
    expect(getCard('c21')!.subroutines!.map((s) => s.effect)).toEqual([
      { op: 'trash_installed', types: ['program'] },
      { op: 'trash_installed', types: ['program'] },
      { op: 'trace', base: 1, onSuccess: [{ op: 'give_tags', amount: 1 }, { op: 'brain_damage', amount: 1 }] },
    ]);
    const sea = getCard('c22')!;
    expect(sea.playIf).toBe('runner_successful_run_last_turn');
    expect(sea.onPlay).toEqual([{ op: 'trace', base: 3, onSuccess: [{ op: 'give_tags', amount: 1 }] }]);
    expect(getCard('c09')!.scoredAbilities).toEqual([{ label: 'Do 1 meat damage', when: 'click', clicks: 1, credits: 0, requires: 'runner_tagged', effects: [{ op: 'meat_damage', amount: 1 }] }]);
    expect(getCard('r13')!.link).toBe(1);
  });
});

describe('QA S-09-4 deck lists (QA arithmetic, not checkDeck)', () => {
  const count = (cards: readonly string[]) => cards.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {});
  // QA's own influence pips for every card in the two lists (2012 Core Set), and the faction it belongs to.
  const PIPS: Record<string, [string, number]> = {
    c01: ['neutral', 0], c22: ['nbn', 2], c12: ['jinteki', 2], c16: ['haas_bioroid', 4], c03: ['neutral', 0], c14: ['haas_bioroid', 2], c15: ['neutral', 0], c11: ['jinteki', 2],
    c05: ['weyland', 1], c04: ['neutral', 0], c06: ['neutral', 0], c20: ['neutral', 0], c19: ['haas_bioroid', 1], c21: ['haas_bioroid', 2], c17: ['haas_bioroid', 2], c18: ['haas_bioroid', 2],
    c10: ['neutral', 0], c09: ['neutral', 0],
    r14: ['neutral', 0], r01: ['criminal', 1], r03: ['shaper', 2], r02: ['neutral', 0], r10: ['criminal', 2], r18: ['neutral', 0], r15: ['shaper', 2], r07: ['shaper', 2], r11: ['criminal', 3],
    r04: ['anarch', 2], r05: ['shaper', 3], r16: ['shaper', 1], r17: ['shaper', 2], r09: ['shaper', 1], r08: ['anarch', 1], r12: ['shaper', 1],
  };
  const influence = (cards: readonly string[], own: string) => cards.reduce((n, id) => n + (PIPS[id]![0] === own ? 0 : PIPS[id]![1]), 0);

  it('Corp: the proposal table — 30 cards, Hunter 2, Ichi 1, SEA Source 1, PAD 2, Rototurret 1, no Anonymous Tip / Neural Katana; influence 8; 15 points', () => {
    const n = count(CORP_CORE_DECK.cards);
    expect(CORP_CORE_DECK.cards).toHaveLength(30);
    expect(n).toEqual({ c01: 3, c22: 1, c12: 1, c16: 1, c03: 2, c14: 2, c15: 2, c11: 1, c05: 2, c04: 1, c06: 1, c20: 2, c19: 1, c21: 1, c17: 2, c18: 1, c10: 3, c09: 3 });
    expect(n['c02']).toBeUndefined();
    expect(n['c07']).toBeUndefined();
    expect(influence(CORP_CORE_DECK.cards, 'haas_bioroid')).toBe(8);
    expect(CORP_CORE_DECK.cards.reduce((p, id) => p + (getCard(id)!.agendaPoints ?? 0), 0)).toBe(15);
    for (const id of CORP_CORE_DECK.cards) if (getCard(id)!.type === 'agenda') expect(['neutral', 'haas_bioroid']).toContain(getCard(id)!.faction);
    for (const k of Object.values(n)) expect(k).toBeLessThanOrEqual(3);
  });

  it('Runner: 30 cards, Access to Globalsec 2, Easy Mark 1, Inside Job 1; influence 10', () => {
    const n = count(RUNNER_CORE_DECK.cards);
    expect(RUNNER_CORE_DECK.cards).toHaveLength(30);
    expect(n).toEqual({ r14: 3, r01: 1, r03: 3, r02: 2, r10: 1, r18: 2, r15: 2, r07: 3, r11: 1, r04: 1, r05: 2, r16: 2, r17: 2, r09: 2, r08: 2, r12: 1 });
    expect(influence(RUNNER_CORE_DECK.cards, 'shaper')).toBe(10);
    for (const k of Object.values(n)) expect(k).toBeLessThanOrEqual(3);
    // QA's pip table agrees with the card data for every listed card.
    for (const id of [...CORP_CORE_DECK.cards, ...RUNNER_CORE_DECK.cards]) expect([getCard(id)!.faction, getCard(id)!.influence ?? 0], id).toEqual(PIPS[id]);
  });
});

// ---- S-09-1 traces: edge cases ----

describe('QA S-09-1 trace rules on hand-built boards', () => {
  it('tie at every level: link + bid == strength fails (no tag), one less succeeds; both pay their bids', () => {
    for (const corpBid of [0, 1, 2, 3]) {
      const s0 = act(atIce('c20', { corpCredits: 3, runnerCredits: 6 }), letFire).state;
      // corpBid 0 is a real choice here (window open: 3 credits, 3 + 3 > 1).
      const s1 = act(s0, bid('corp', corpBid)).state;
      const strength = 3 + corpBid;
      const needed = strength - 1;
      expect(viewFor('runner', s1).choice!.trace).toMatchObject({ strength, needed, link: 1 });
      const tie = act(s1, bid('runner', needed));
      const res = tie.events.find((e) => e.type === 'trace_resolved')!;
      expect(res).toEqual({ type: 'trace_resolved', cardId: 'c20', strength, total: strength, success: false });
      expect(tie.state.players.runner.tags).toBe(0);
      expect(tie.state.players.runner.credits).toBe(6 - needed);
      expect(tie.state.players.corp.credits).toBe(3 - corpBid);
      expect(types(tie.events)).not.toContain('tags_changed');
      const short = act(s1, bid('runner', needed - 1));
      expect(short.events.find((e) => e.type === 'trace_resolved')).toMatchObject({ success: true, total: strength - 1 });
      expect(short.state.players.runner.tags).toBe(1);
      clean(short, `bid ${corpBid}`);
    }
  });

  it('Runner with 0 credits: no Runner window at all — the trace resolves right after the Corp bid (auto bid 0)', () => {
    const s0 = act(atIce('c20', { corpCredits: 4, runnerCredits: 0 }), letFire).state;
    expect(s0.choice?.kind).toBe('trace_corp');
    const r = act(s0, bid('corp', 1));
    expect(r.events.filter((e) => e.type === 'choice_opened')).toEqual([]);
    expect(r.events.find((e) => e.type === 'trace_bid' && e.player === 'runner')).toEqual({ type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true });
    expect(r.state.players.runner.tags).toBe(1);
    expect(r.state.choice).toBeNull();
  });

  it('Runner with 0 credits, Corp bids 0 (strength 3 vs link 1): still no Runner window; tagged', () => {
    const s0 = act(atIce('c20', { corpCredits: 4, runnerCredits: 0 }), letFire).state;
    const r = act(s0, bid('corp', 0));
    expect(types(r.events)).not.toContain('choice_opened');
    expect(r.state.players.runner.tags).toBe(1);
  });

  it('both sides at 0 credits: Hunter fires and resolves inside the let-it-fire tap; nobody is asked; the preview already said so', () => {
    const s = atIce('c20', { corpCredits: 0, runnerCredits: 0 });
    const preview = viewFor('runner', s).run!.letFire!;
    expect(preview.outcomes).toContainEqual(expect.objectContaining({ op: 'trace', amount: 1 }));
    const r = act(s, letFire);
    expect(types(r.events)).not.toContain('choice_opened');
    expect(r.events.filter((e) => e.type === 'trace_bid').map((e) => (e as { auto?: boolean }).auto)).toEqual([true, true]);
    expect(r.state.players.runner.tags).toBe(1);
    clean(r, 'both broke');
  });

  it('Runner already safe (2 Globalsec: link 3 vs Trace 3, Corp broke): both auto, trace fails, no tag', () => {
    const r = act(atIce('c20', { corpCredits: 0, runnerCredits: 5, rig: ['r18', 'r18'] }), letFire);
    expect(r.events.find((e) => e.type === 'trace_started')).toEqual({ type: 'trace_started', cardId: 'c20', base: 3, link: 3 });
    expect(r.events.find((e) => e.type === 'trace_resolved')).toMatchObject({ strength: 3, total: 3, success: false });
    expect(r.state.players.runner.tags).toBe(0);
    expect(r.state.players.runner.credits).toBe(5);
  });

  it('a hopeless Runner (needs more than he has) is not asked; he keeps his credits', () => {
    const s0 = act(atIce('c20', { corpCredits: 9, runnerCredits: 2 }), letFire).state;
    const r = act(s0, bid('corp', 3)); // strength 6, link 1: needs 5 > 2
    expect(types(r.events)).not.toContain('choice_opened');
    expect(r.state.players.runner.credits).toBe(2);
    expect(r.state.players.runner.tags).toBe(1);
  });

  it('refusals: over-bid no_credits, negative / fractional invalid, pass bad_target, the waiting side not_your_turn; nothing changes', () => {
    const s0 = act(atIce('c20', { corpCredits: 3, runnerCredits: 5 }), letFire).state;
    expect(rejection(apply(s0, bid('corp', 4)).events)).toBe('no_credits');
    expect(rejection(apply(s0, bid('corp', -1)).events)).toBe('invalid_action');
    expect(rejection(apply(s0, bid('corp', 1.5)).events)).toBe('invalid_action');
    expect(rejection(apply(s0, { type: 'pass', player: 'corp' }).events)).toBe('bad_target');
    expect(rejection(apply(s0, bid('runner', 0)).events)).toBe('not_your_turn');
    const s1 = act(s0, bid('corp', 2)).state;
    expect(rejection(apply(s1, bid('runner', 6)).events)).toBe('no_credits');
    expect(rejection(apply(s1, bid('corp', 0)).events)).toBe('not_your_turn');
    // Outside any trace.
    expect(rejection(apply(board({}, 77, CORE), bid('runner', 0)).events)).toBe('wrong_phase');
  });

  it('Kate with 1 Globalsec (link 2): the Runner window shows needed = strength − 2', () => {
    const s0 = act(atIce('c20', { corpCredits: 5, runnerCredits: 5, rig: ['r18'] }), letFire).state;
    expect(viewFor('corp', s0).choice!.trace).toMatchObject({ link: 2, base: 3 });
    const s1 = act(s0, bid('corp', 2)).state;
    expect(viewFor('runner', s1).choice!.trace).toMatchObject({ strength: 5, link: 2, needed: 3 });
    expect(act(s1, bid('runner', 3)).state.players.runner.tags).toBe(0);
  });
});

// ---- S-09-2 tags ----

describe('QA S-09-2 tags on hand-built boards', () => {
  it('tags stay across three full rounds (both turns) until removed; both views show the same count', () => {
    let s = withPlayer(board({ runnerCredits: 9 }, 77, CORE), 'runner', { tags: 2 });
    for (let k = 0; k < 6; k++) {
      s = finishTurn(s).state;
      expect(s.players.runner.tags, `turn ${s.turn}`).toBe(2);
      expect(viewFor('corp', s).players.runner.tags).toBe(2);
      expect(viewFor('runner', s).players.runner.tags).toBe(2);
    }
    expect(s.activePlayer).toBe('runner');
    const r1 = act(s, removeTag);
    expect(r1.events).toContainEqual({ type: 'tags_changed', amount: -1, tags: 1 });
    const r2 = act(r1.state, removeTag);
    expect(r2.state.players.runner.tags).toBe(0);
    expect(viewFor('runner', r2.state).basicOptions).toEqual([]);
    expect(rejection(apply(r2.state, removeTag).events)).toBe('condition_not_met');
  });

  it('remove tag dimmed with a reason: 1 credit → no_credits; 0 clicks → no_clicks; during a run → wrong_phase; the Corp → condition_not_met', () => {
    const poor = withPlayer(board({ runnerCredits: 1 }, 77, CORE), 'runner', { tags: 1 });
    expect(viewFor('runner', poor).basicOptions).toEqual([{ action: removeTag, cost: 2, clicks: 1, reject: 'no_credits' }]);
    expect(rejection(apply(poor, removeTag).events)).toBe('no_credits');
    const tired = withPlayer(board({ runnerCredits: 5, runnerClicks: 0 }, 77, CORE), 'runner', { tags: 1 });
    expect(viewFor('runner', tired).basicOptions[0]!.reject).toBe('no_clicks');
    expect(rejection(apply(tired, removeTag).events)).toBe('no_clicks');
    const running = act(withPlayer(board({ runnerCredits: 5, servers: { hq: { ice: ['c05'] } } }, 77, CORE), 'runner', { tags: 1 }), runOn('hq')).state;
    expect(rejection(apply(running, removeTag).events)).toBe('wrong_phase');
    expect(rejection(apply(poor, { type: 'remove_tag', player: 'corp' }).events)).toBe('not_your_turn');
  });

  it('Corp: Trash · 1 click + 2 credits only on resources and only while tagged; Armitage goes to the Heap with its credits', () => {
    // rig: i1 Armitage (resource), i2 Corroder (program), i3 Cyberfeeder (hardware), i4 Globalsec (resource).
    const rig = ['r02', 'r04', 'r08', 'r18'];
    const untagged = corpTurnAfter({ rig }, 0);
    const uv = viewFor('corp', untagged);
    for (const c of untagged.rig) expect(uv.installedOptions[c.uid], `untagged ${c.cardId}`).toBeUndefined();
    expect(rejection(apply(untagged, trashRes('i1')).events)).toBe('condition_not_met');
    const s = corpTurnAfter({ rig }, 1);
    const v = viewFor('corp', s);
    expect(v.installedOptions['i1']).toEqual([{ action: trashRes('i1'), cost: 2, clicks: 1, reject: null }]);
    expect(v.installedOptions['i4']).toEqual([{ action: trashRes('i4'), cost: 2, clicks: 1, reject: null }]);
    expect(v.installedOptions['i2']).toBeUndefined();
    expect(v.installedOptions['i3']).toBeUndefined();
    expect(rejection(apply(s, trashRes('i2')).events)).toBe('bad_target');
    expect(rejection(apply(s, trashRes('i3')).events)).toBe('bad_target');
    // The Runner's view never carries the Corp's options.
    for (const c of s.rig) expect(viewFor('runner', s).installedOptions[c.uid]?.some((o) => o.action.type === 'trash_resource') ?? false).toBe(false);
    const armed = { ...s, rig: s.rig.map((c) => (c.uid === 'i1' ? { ...c, hostedCredits: 7 } : c)) };
    const before = armed.players.corp;
    const r = act(armed, trashRes('i1'));
    expect(r.state.rig.map((c) => c.uid)).toEqual(['i2', 'i3', 'i4']);
    expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: 'r02', faceUp: true });
    expect(r.state.players.corp.credits).toBe(before.credits - 2);
    expect(r.state.players.corp.clicks).toBe(before.clicks - 1);
    expect(r.state.players.runner.tags).toBe(1); // the tag stays
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'rig_card_trashed', cause: 'tagged', cardId: 'r02' }));
    // Trashing Access to Globalsec lowers Kate's link back to 1 on both views.
    expect(viewFor('runner', r.state).players.runner.link).toBe(2);
    const r2 = act(r.state, trashRes('i4'));
    expect(viewFor('runner', r2.state).players.runner.link).toBe(1);
    expect(viewFor('corp', r2.state).players.runner.link).toBe(1);
    clean(r2, 'trash for tags');
  });

  it('Corp trash refused for lack of credits / clicks with the reason in the option', () => {
    const broke = corpTurnAfter({ rig: ['r02'] }, 1, { credits: 1 });
    expect(viewFor('corp', broke).installedOptions['i1']![0]!.reject).toBe('no_credits');
    const tired = corpTurnAfter({ rig: ['r02'] }, 1, { clicks: 0 });
    expect(viewFor('corp', tired).installedOptions['i1']![0]!.reject).toBe('no_clicks');
  });
});

// ---- S-09-3 Private Security Force ----

describe('QA S-09-3 Private Security Force on hand-built boards', () => {
  it('untagged: listed but refused condition_not_met (the client dims it "Runner isn\'t tagged")', () => {
    const s = corpTurnAfter({}, 0, { scored: ['c10', 'c09'] });
    const opts = viewFor('corp', s).installedOptions['score:corp:1']!;
    expect(opts).toEqual([expect.objectContaining({ action: psf(1), reject: 'condition_not_met', clicks: 1, cost: 0 })]);
    expect(viewFor('corp', s).installedOptions['score:corp:0']).toBeUndefined(); // Priority Requisition has no ability
    expect(rejection(apply(s, psf(1)).events)).toBe('condition_not_met');
  });

  it('tagged: once per click, a random Grip card each time, to the Heap; the 4th use has no click', () => {
    let s = corpTurnAfter({ runnerHand: ['r01', 'r03', 'r09', 'r14', 'r07'] }, 1, { scored: ['c09'], clicks: 3 });
    const grip = [...s.players.runner.hand];
    const lost: string[] = [];
    for (let k = 1; k <= 3; k++) {
      const r = act(s, psf());
      const md = r.events.find((e) => e.type === 'meat_damage') as Extract<GameEvent, { type: 'meat_damage' }>;
      expect(md.amount).toBe(1);
      expect(md.cardIds).toHaveLength(1);
      lost.push(md.cardIds[0]!);
      expect(r.state.players.runner.discard.at(-1)).toEqual({ cardId: md.cardIds[0], faceUp: true });
      expect(r.state.players.runner.hand).toHaveLength(5 - k);
      expect(r.state.players.corp.clicks).toBe(3 - k);
      // Both seats get the same (public) meat_damage event.
      expect(viewEvents('runner', r.events).find((e) => e.type === 'meat_damage')).toEqual(md);
      expect(viewEvents('corp', r.events).find((e) => e.type === 'meat_damage')).toEqual(md);
      clean(r, `psf ${k}`);
      s = r.state;
    }
    // The lost cards came from his Grip (multiset).
    const rest = [...grip];
    for (const id of lost) rest.splice(rest.indexOf(id), 1);
    expect([...s.players.runner.hand].sort()).toEqual(rest.sort());
    expect(viewFor('corp', s).installedOptions['score:corp:0']![0]!.reject).toBe('no_clicks');
  });

  it('1 card in the Grip: he loses it and lives; the next use flatlines him (Corp wins)', () => {
    const s = corpTurnAfter({ runnerHand: ['r14'] }, 1, { scored: ['c09'] });
    const r1 = act(s, psf());
    expect(r1.state.players.runner.hand).toEqual([]);
    expect(r1.state.phase).not.toBe('over');
    const r2 = act(r1.state, psf());
    expect(r2.events.slice(-2)).toEqual([
      { type: 'meat_damage', amount: 1, cardIds: [] },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    expect(r2.state.phase).toBe('over');
    expect(legalActions(r2.state, 'corp')).toEqual([]);
    expect(legalActions(r2.state, 'runner')).toEqual([]);
  });

  it('a PSF the Runner stole cannot be used by anyone', () => {
    let s = corpTurnAfter({}, 1, { scored: [] });
    s = withPlayer(s, 'runner', { scoreArea: ['c09'] });
    expect(rejection(apply(s, { type: 'activate', player: 'corp', uid: 'score:runner:0', ability: 0 } as Action).events)).toBe('bad_target');
    expect(viewFor('corp', s).installedOptions['score:runner:0']).toBeUndefined();
  });
});

// ---- S-09-4 SEA Source, Ichi, Globalsec ----

describe('QA S-09-4 SEA Source "last turn", Ichi with one program, Globalsec link', () => {
  /** Corp hand with SEA Source; the Runner's turn on the board did `runnerTurn`, then the Corp's turn starts. */
  function seaAfter(runnerTurn: Action[], extraRounds = 0): GameState {
    let s = board({ corpHand: ['c22', 'c01'], corpCredits: 6, servers: { remote1: { ice: ['+c05'] } } }, 77, CORE);
    s = run(s, runnerTurn).state;
    while (s.run) s = act(s, { type: 'pass', player: waitingOn(s)! } as Action).state;
    s = finishTurn(s).state;
    for (let k = 0; k < extraRounds; k++) s = finishTurn(finishTurn(s).state).state;
    expect(s.activePlayer).toBe('corp');
    return s;
  }
  const seaOption = (s: GameState) => viewFor('corp', s).handOptions[s.players.corp.hand.indexOf('c22')]!.find((o) => o.action.type === 'play')!;

  it('successful Archives run last turn: playable for 2; Corp max bid = credits left after paying', () => {
    const s = seaAfter([runOn('archives')]);
    expect(seaOption(s)).toMatchObject({ cost: 2, reject: null });
    const r = act(s, seaOption(s).action);
    expect(r.state.players.corp.credits).toBe(s.players.corp.credits - 2);
    expect(viewFor('corp', r.state).choice!.trace).toMatchObject({ base: 3, corpMaxBid: s.players.corp.credits - 2 });
    expect(r.state.players.corp.discard.at(-1)).toEqual({ cardId: 'c22', faceUp: true });
    clean(r, 'SEA Source played');
  });

  it('no run, an ICE-ended run, or a success two turns ago: dimmed condition_not_met', () => {
    expect(seaOption(seaAfter([])).reject).toBe('condition_not_met');
    // Ice Wall (face up, "End the run") on remote1, no breaker: the run ends; not successful.
    expect(seaOption(seaAfter([runOn('remote1'), letFire])).reject).toBe('condition_not_met');
    expect(seaOption(seaAfter([runOn('archives')], 1)).reject).toBe('condition_not_met');
  });

  it('Ichi vs one program, no Construct: the first sub trashes it without asking, the second has nothing; then the trace', () => {
    const s = atIce('c21', { corpCredits: 3, runnerCredits: 3, rig: ['r04'] });
    const r = act(s, letFire);
    expect(r.state.rig).toEqual([]);
    expect(r.state.players.runner.discard).toContainEqual({ cardId: 'r04', faceUp: true });
    expect(r.state.choice?.kind).toBe('trace_corp');
    expect(r.events.filter((e) => e.type === 'choice_opened').map((e) => (e as { kind: string }).kind)).toEqual(['trace_corp']);
    // Corp bids 1 (strength 2 vs link 1): Runner needs 1; he lets it through: tag + 1 brain damage (hand max 4).
    const r1 = act(r.state, bid('corp', 1));
    const r2 = act(r1.state, bid('runner', 0));
    const i = types(r2.events);
    expect(i.indexOf('tags_changed')).toBeLessThan(i.indexOf('brain_damage'));
    expect(r2.state.players.runner.tags).toBe(1);
    expect(r2.state.players.runner.brainDamage).toBe(1);
  });

  it('link counts only Access to Globalsec in the rig: 1, 2, 3; installing it shows the new link on both views', () => {
    let s = board({ runnerHand: ['r18', 'r18'], runnerCredits: 5 }, 77, CORE);
    expect(viewFor('corp', s).players.runner.link).toBe(1);
    s = act(s, { type: 'install', player: 'runner', handIndex: 0 }).state;
    expect([viewFor('runner', s).players.runner.link, viewFor('corp', s).players.runner.link]).toEqual([2, 2]);
    s = act(s, { type: 'install', player: 'runner', handIndex: 0 }).state;
    expect([viewFor('runner', s).players.runner.link, viewFor('corp', s).players.runner.link]).toEqual([3, 3]);
    expect(s.players.runner.credits).toBe(3);
    expect(viewFor('corp', s).players.corp.link).toBe(0);
  });
});

// ---- Random sweep with QA bookkeeping ----

function prng(seed: number): (n: number) => number {
  let x = (seed * 747796405 + 2891336453) >>> 0 || 7;
  return (n) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}
const WEIGHT: Record<string, number> = { run: 14, rez: 14, pass: 6, install: 10, play: 10, advance: 8, score: 20, steal: 20, activate: 25, trash_resource: 20, remove_tag: 3, trace_bid: 5, choose: 5, end_turn: 1 };

interface Trace { cardId: string; base: number; link: number; corpAtStart: number; runnerMax: number; strength: number | null; runnerBid: number | null; corpAuto: boolean | null; runnerAuto: boolean | null }

describe('QA Sprint 9 sweep: random core-deck games with QA bookkeeping', () => {
  it('every trace, bid, tag, tagged trash and meat damage adds up; options only where the rules allow; nothing hidden leaks', () => {
    const tally = { games: 0, actions: 0, traces: 0, corpWindows: 0, runnerWindows: 0, corpAuto: 0, runnerAuto: 0, ties: 0, success: 0, removed: 0, trashed: 0, meat: 0, flatMeat: 0, sea: 0, link3: 0 };
    for (let seed = 1; seed <= 120; seed++) {
      const rnd = prng(seed);
      const options = seed % 3 === 0 ? { ...CORE, rezWindow: 'always' as const } : CORE;
      let s = coreGame(seed, options);
      const actions: Action[] = [];
      let tr: Trace | null = null;
      tally.games++;
      for (let step = 0; step < 900 && s.phase !== 'over'; step++) {
        const me = waitingOn(s);
        if (!me) break;
        const legal = legalActions(s, me);
        expect(legal.length).toBeGreaterThan(0);
        const w = legal.map((a) => WEIGHT[a.type] ?? 3);
        let t = rnd(w.reduce((x, y) => x + y, 0));
        let k = 0;
        while (t >= w[k]!) t -= w[k++]!;
        const a = legal[k]!;
        const before = s;
        const res = apply(s, a);
        const where = `seed ${seed} step ${step} ${JSON.stringify(a)}`;
        expect(rejection(res.events), where).toBeNull();
        s = res.state;
        actions.push(a);
        tally.actions++;
        const ev = res.events;

        // -- traces --
        for (const e of ev) {
          if (e.type === 'trace_started') {
            expect(tr, `${where}: trace inside a trace`).toBeNull();
            const qaLink = 1 + before.rig.filter((c) => c.cardId === 'r18').length;
            expect(e.link, `${where}: link`).toBe(qaLink);
            if (qaLink === 3) tally.link3++;
            const corpAtStart = before.players.corp.credits - (a.type === 'play' && a.player === 'corp' ? getCard(before.players.corp.hand[a.handIndex]!)!.cost : 0);
            tr = { cardId: e.cardId, base: e.base, link: e.link, corpAtStart, runnerMax: before.players.runner.credits + (before.run?.tempCredits ?? 0), strength: null, runnerBid: null, corpAuto: null, runnerAuto: null };
            if (e.cardId === 'c22') tally.sea++;
            tally.traces++;
          } else if (e.type === 'trace_bid') {
            expect(tr, where).not.toBeNull();
            if (e.player === 'corp') {
              const could = tr!.corpAtStart > 0 && tr!.base + tr!.corpAtStart > tr!.link;
              expect(!!e.auto, `${where}: Corp auto bid iff it cannot matter`).toBe(!could);
              if (e.auto) tally.corpAuto++;
              else tally.corpWindows++;
              expect(e.credits).toBeLessThanOrEqual(tr!.corpAtStart);
              expect(e.total, where).toBe(tr!.base + e.credits);
              tr!.strength = e.total;
            } else {
              expect(tr!.strength, `${where}: Runner bids after the Corp`).not.toBeNull();
              const gap = tr!.strength! - tr!.link;
              const could = gap > 0 && gap <= tr!.runnerMax;
              expect(!!e.auto, `${where}: Runner auto bid iff it cannot matter (gap ${gap}, max ${tr!.runnerMax})`).toBe(!could);
              if (e.auto) tally.runnerAuto++;
              else tally.runnerWindows++;
              expect(e.credits).toBeLessThanOrEqual(tr!.runnerMax);
              expect(e.total, where).toBe(tr!.link + e.credits);
              tr!.runnerBid = e.credits;
            }
            if (!e.auto) {
              // A real bid: paid right before it, exactly the amount (credits_spent precedes when > 0).
              const i = ev.indexOf(e);
              if (e.credits > 0) expect(ev[i - 1], where).toEqual({ type: 'credits_spent', player: e.player, amount: e.credits });
            } else expect(e.credits).toBe(0);
          } else if (e.type === 'trace_resolved') {
            expect(tr!.strength, where).not.toBeNull();
            expect(tr!.runnerBid, where).not.toBeNull();
            expect(e.strength).toBe(tr!.strength);
            expect(e.total).toBe(tr!.link + tr!.runnerBid!);
            expect(e.success, `${where}: success iff strength > link + bid`).toBe(tr!.strength! > tr!.link + tr!.runnerBid!);
            if (e.strength === e.total) tally.ties++;
            if (e.success) {
              tally.success++;
              // Every trace card's onSuccess gives exactly 1 tag (Hunter, Ichi, SEA Source).
              expect(ev.slice(ev.indexOf(e)).find((x) => x.type === 'tags_changed'), where).toMatchObject({ amount: 1 });
            } else expect(ev.slice(ev.indexOf(e)).some((x) => x.type === 'tags_changed' && x.amount > 0), where).toBe(false);
            tr = null;
          }
        }
        // An open trace window is a real decision for the side asked, and the view numbers agree.
        if (s.choice?.kind === 'trace_corp' || s.choice?.kind === 'trace_runner') {
          const side = s.choice.player;
          const v = viewFor(side, s).choice!;
          const max = side === 'corp' ? s.players.corp.credits : s.players.runner.credits + (s.run?.tempCredits ?? 0);
          expect(v.options.map((o) => (o.action as { credits: number }).credits), where).toEqual(Array.from({ length: max + 1 }, (_, i) => i));
          expect(viewFor(side === 'corp' ? 'runner' : 'corp', s).choice!.options, where).toEqual([]);
          expect(viewFor('runner', s).choice!.trace).toEqual(v.trace);
          if (side === 'runner') expect(v.trace!.needed).toBe(Math.max(0, v.trace!.strength - v.trace!.link));
        }

        // -- tags: only via tags_changed; never below 0 --
        const tagDelta = ev.filter((e) => e.type === 'tags_changed').reduce((n, e) => n + (e as { amount: number }).amount, 0);
        expect(s.players.runner.tags - before.players.runner.tags, `${where}: tags`).toBe(tagDelta);
        expect(s.players.runner.tags).toBeGreaterThanOrEqual(0);
        expect(s.players.corp.tags).toBe(0);
        if (a.type === 'remove_tag') {
          tally.removed++;
          expect(before.players.runner.tags).toBeGreaterThan(0);
          expect(tagDelta).toBe(-1);
          expect(before.players.runner.credits - s.players.runner.credits).toBe(2);
          expect(before.players.runner.clicks - s.players.runner.clicks).toBe(1);
        }
        if (a.type === 'trash_resource') {
          tally.trashed++;
          expect(before.players.runner.tags).toBeGreaterThan(0);
          const card = before.rig.find((c) => c.uid === a.uid)!;
          expect(getCard(card.cardId)!.type).toBe('resource');
          expect(s.rig.some((c) => c.uid === a.uid)).toBe(false);
          expect(s.players.runner.discard.at(-1)).toEqual({ cardId: card.cardId, faceUp: true });
          expect(before.players.corp.credits - s.players.corp.credits).toBe(2);
          expect(before.players.corp.clicks - s.players.corp.clicks).toBe(1);
        }
        if (a.type === 'activate' && a.player === 'corp' && a.uid.startsWith('score:')) {
          tally.meat++;
          expect(before.players.runner.tags).toBeGreaterThan(0);
          expect(before.players.corp.scoreArea[Number(a.uid.split(':')[2])]).toBe('c09');
          const md = ev.find((e) => e.type === 'meat_damage') as Extract<GameEvent, { type: 'meat_damage' }>;
          if (before.players.runner.hand.length === 0) {
            tally.flatMeat++;
            expect(md.cardIds).toEqual([]);
            expect(s.phase).toBe('over');
            expect(s.result).toEqual({ winner: 'corp', reason: 'flatline' });
          } else {
            expect(md.cardIds).toHaveLength(1);
            expect(before.players.runner.hand).toContain(md.cardIds[0]);
            expect(s.players.runner.hand.length).toBe(before.players.runner.hand.length - 1);
            expect(s.players.runner.discard.at(-1)).toEqual({ cardId: md.cardIds[0], faceUp: true });
          }
        }

        // -- options only where the rules allow --
        if (s.phase !== 'over') {
          const cv = viewFor('corp', s);
          for (const [uid, opts] of Object.entries(cv.installedOptions)) {
            const rigCard = s.rig.find((c) => c.uid === uid);
            if (rigCard) {
              expect(s.players.runner.tags, `${where}: Corp option on rig card while untagged`).toBeGreaterThan(0);
              expect(getCard(rigCard.cardId)!.type, where).toBe('resource');
              expect(opts.map((o) => o.action)).toEqual([trashRes(uid)]);
            }
            if (uid.startsWith('score:')) {
              expect(uid.startsWith('score:corp:'), where).toBe(true);
              expect(s.players.corp.scoreArea[Number(uid.split(':')[2])]).toBe('c09');
              for (const o of opts) if (s.players.runner.tags === 0) expect(o.reject === 'condition_not_met' || o.reject === 'not_your_turn' || o.reject === 'wrong_phase' || o.reject === 'no_clicks', where).toBe(true);
            }
          }
          const rv = viewFor('runner', s);
          expect(rv.basicOptions.length, `${where}: remove_tag listed iff tagged`).toBe(s.players.runner.tags > 0 ? 1 : 0);
          expect(cv.basicOptions).toEqual([]);
          // The Corp never sees the Runner's Grip; the Runner never sees HQ.
          expect(cv.players.runner.hand).toBeNull();
          expect(rv.players.corp.hand).toBeNull();
          // Public numbers agree on both seats.
          expect([cv.players.runner.tags, cv.players.runner.link]).toEqual([rv.players.runner.tags, rv.players.runner.link]);
          expect(rv.players.runner.link).toBe(1 + s.rig.filter((c) => c.cardId === 'r18').length);
        }

        // -- hidden information on every projected event --
        expectRunnerEventsClean(viewEvents('runner', ev), where, s);
        expectRunnerViewClean(s, where);
        for (const e of viewEvents('corp', ev)) {
          if (e.type === 'meat_damage') for (const id of e.cardIds) expect(s.players.runner.discard, `${where}: meat-damage card is face up in the Heap`).toContainEqual({ cardId: id, faceUp: true });
          if (e.type === 'trace_started' || e.type === 'trace_resolved') expect(['c20', 'c21', 'c22']).toContain(e.cardId);
        }
        liveness(s);
      }
      // Replay gives the same game.
      expect(engineReplay(seed, actions, options).state).toEqual(s);
    }
    // The sweep reached every Sprint 9 rule (fails loudly if the weights stop reaching something).
    console.log('QA Sprint 9 sweep', JSON.stringify(tally));
    for (const k of ['traces', 'corpWindows', 'runnerWindows', 'corpAuto', 'runnerAuto', 'ties', 'success', 'removed', 'trashed', 'meat', 'sea'] as const) expect(tally[k], k).toBeGreaterThan(0);
  }, 300_000);
});
