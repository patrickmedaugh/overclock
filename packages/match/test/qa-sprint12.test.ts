// QA Sprint 12 (written by QA, not the developers). Independent checks of S-12-1..S-12-5 on REAL
// 45-card games (planner paths in LocalMatch, both seats' views and events), on seeds the developers'
// tests do not use, plus the deck lists against the proposal table and the official card list
// (numbers copied by QA from netrunner-cards-json pack/core.json, fetched 2026-11-18).
import { CORP_CORE45_DECK, CORP_CORE_DECK, RUNNER_CORE45_DECK, RUNNER_CORE_DECK, checkDeck, getCard, type DeckDef } from '@overclock/cards';
import { RULES_VERSION, apply, type Action, type GameEvent, type GameState, type PlayerView } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch } from '../src/index';
import { SPRINT12_GOALS, planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal, type StepPlan } from '../src/testing';

const QA_SEEDS = Array.from({ length: 30 }, (_, i) => 201 + i);

function count(list: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of list) out[getCard(id)!.name] = (out[getCard(id)!.name] ?? 0) + 1;
  return out;
}

/** QA's own influence sum: printed influence of every card outside the identity's faction. */
function influenceOf(deck: DeckDef): number {
  const idFaction = getCard(deck.identity)!.faction;
  return deck.cards.reduce((n, id) => {
    const c = getCard(id)!;
    return c.faction === idFaction || c.faction === 'neutral' ? n : n + (c.influence ?? 0);
  }, 0);
}

/** Plans `goal` on the first QA seed(s) that reach it; returns up to `want` plans. */
function plans(goal: StepGoal, want = 3): StepPlan[] {
  const out: StepPlan[] = [];
  for (const seed of QA_SEEDS) {
    if (out.length >= want) break;
    try {
      out.push(planToStep(seed, goal));
    } catch {
      /* not every seed reaches every goal */
    }
  }
  return out;
}

function matchAt(plan: StepPlan): LocalMatch {
  expect(plan.deckSet).toBe('core45');
  const m = new LocalMatch(plan.seed, { deckSet: plan.deckSet });
  for (const a of plan.actions) {
    const u = m.submit(a.player, a);
    expect(u[a.player].events.some((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBe(false);
  }
  return m;
}

/** Submits and asserts accepted; checks the Runner's view and events leak nothing. */
function go(m: LocalMatch, a: Action): { corp: readonly GameEvent[]; runner: readonly GameEvent[]; state: GameState } {
  const u = m.submit(a.player, a);
  const rej = u[a.player].events.find((e) => e.type === 'action_rejected');
  expect(rej, `${JSON.stringify(a)} -> ${JSON.stringify(rej)}`).toBeUndefined();
  const state = m.snapshot();
  expect(runnerViewLeaks(state, u.runner.view)).toEqual([]);
  expect(runnerEventLeaks(u.runner.events, state)).toEqual([]);
  return { corp: u.corp.events, runner: u.runner.events, state };
}

const ids = (x: unknown): string[] => (JSON.stringify(x) ?? '').match(/"[cr]\d\d"/g)?.map((s) => s.slice(1, -1)) ?? [];

describe('QA S-12-5 AC1/AC2: the 45-card decks are the proposal table and legal', () => {
  it('Corp = Sprint 11 deck + 3 ABT, 2 AM, 2 ED, +1 Melange/PAD/Adonis/Enigma/Wall of Static/Hunter/Heimdall/Ichi', () => {
    const want = count(CORP_CORE_DECK.cards);
    const add = (name: string, n: number) => (want[name] = (want[name] ?? 0) + n);
    add('Accelerated Beta Test', 3);
    add('Archived Memories', 2);
    add('Experiential Data', 2);
    for (const n of ['Melange Mining Corp.', 'PAD Campaign', 'Adonis Campaign', 'Enigma', 'Wall of Static', 'Hunter', 'Heimdall 1.0', 'Ichi 1.0']) add(n, 1);
    expect(count(CORP_CORE45_DECK.cards)).toEqual(want);
    expect(CORP_CORE45_DECK.identity).toBe(CORP_CORE_DECK.identity);
    expect(getCard(CORP_CORE45_DECK.identity)!.name).toBe('Haas-Bioroid: Engineering the Future');
  });

  it('Runner = Sprint 11 deck + 1 Toolbox, 3 Modded, 3 Infiltration, +1 Armitage/Magnum Opus/Gordian/Pipeline/Ram/Akamatsu/Construct/Globalsec', () => {
    const want = count(RUNNER_CORE_DECK.cards);
    const add = (name: string, n: number) => (want[name] = (want[name] ?? 0) + n);
    add('The Toolbox', 1);
    add('Modded', 3);
    add('Infiltration', 3);
    for (const n of ['Armitage Codebusting', 'Magnum Opus', 'Gordian Blade', 'Pipeline', 'Battering Ram', 'Akamatsu Mem Chip', 'Sacrificial Construct', 'Access to Globalsec']) add(n, 1);
    expect(count(RUNNER_CORE45_DECK.cards)).toEqual(want);
    expect(getCard(RUNNER_CORE45_DECK.identity)!.name).toBe('Kate "Mac" McCaffrey: Digital Tinker');
  });

  it('legal by QA\'s own count: 45 cards, <= 3 copies, influence Corp 8 / Runner 10 (<= 15), only HB/neutral agendas, 21 points', () => {
    for (const [deck, inf] of [[CORP_CORE45_DECK, 8], [RUNNER_CORE45_DECK, 10]] as const) {
      expect(deck.cards).toHaveLength(45);
      for (const [name, n] of Object.entries(count(deck.cards))) expect(n, name).toBeLessThanOrEqual(3);
      expect(influenceOf(deck)).toBe(inf);
      expect(influenceOf(deck)).toBeLessThanOrEqual(getCard(deck.identity)!.influenceLimit ?? 15);
      expect(getCard(deck.identity)!.minDeckSize).toBe(45);
      expect(checkDeck(deck)).toEqual([]);
    }
    const agendas = CORP_CORE45_DECK.cards.map((id) => getCard(id)!).filter((c) => c.type === 'agenda');
    for (const a of agendas) expect(['haas_bioroid', 'neutral']).toContain(a.faction);
    expect(agendas.reduce((n, a) => n + a.agendaPoints!, 0)).toBe(21);
  });

  it('new cards match the 2012 Core Set (core.json) numbers and text', () => {
    const want: Record<string, Record<string, unknown>> = {
      'Accelerated Beta Test': { code: '01055', type: 'agenda', faction: 'haas_bioroid', advancementRequirement: 3, agendaPoints: 2 },
      'Archived Memories': { code: '01058', type: 'operation', faction: 'haas_bioroid', cost: 0, influence: 2, text: 'Add 1 card from Archives to HQ.' },
      'Experiential Data': { code: '01066', type: 'upgrade', faction: 'haas_bioroid', cost: 2, trashCost: 2, influence: 1, text: 'All ICE protecting this server has +1 strength.' },
      'The Toolbox': { code: '01041', type: 'hardware', faction: 'shaper', cost: 9, influence: 2, unique: true, memoryBonus: 2, link: 2 },
      Modded: { code: '01035', type: 'event', faction: 'shaper', cost: 0, influence: 2, text: 'Install a program or piece of hardware, lowering the install cost by 3.' },
      Infiltration: { code: '01049', type: 'event', faction: 'neutral', cost: 0, influence: 0, text: 'Gain 2 credits or expose 1 card.' },
    };
    const all = [...CORP_CORE45_DECK.cards, ...RUNNER_CORE45_DECK.cards].map((id) => getCard(id)!);
    for (const [name, fields] of Object.entries(want)) expect(all.find((c) => c.name === name), name).toMatchObject(fields);
    expect(all.find((c) => c.name === 'Accelerated Beta Test')!.text).toBe(
      'When you score Accelerated Beta Test, you may look at the top 3 cards of R&D. If any of those cards are ICE, you may install and rez them, ignoring all costs. Trash the rest of the cards you looked at.',
    );
    expect(all.find((c) => c.name === 'The Toolbox')!.recurringCredits).toEqual({ amount: 2, for: 'icebreaker' });
  });

  it('a new game deals 45 a side (5 in hand + 40 in the deck) by default and for online, RULES_VERSION 5', () => {
    expect(RULES_VERSION).toBe(5);
    for (const opts of [undefined, { rezWindow: 'always' as const }]) for (const seed of [1, 77, 4242]) {
      const m = new LocalMatch(seed, opts);
      expect(m.options.deckSet).toBe('core45');
      for (const side of ['corp', 'runner'] as const) {
        const p = m.view(side).players[side];
        // 45 dealt: 5 in hand, 40 in the deck; the Corp has already made its turn-1 draw.
        expect(p.handCount + p.deckCount).toBe(45);
        expect([p.handCount, p.deckCount]).toEqual(side === 'corp' ? [6, 39] : [5, 40]);
        expect(p.identity).not.toBeNull();
      }
    }
  });

  it('a Sprint 11 save (rules version 4) loads as outdated', () => {
    const m = new LocalMatch(3, { deckSet: 'core' });
    m.submit('corp', { type: 'gain_credit', player: 'corp' });
    const old = { ...m.save(), rulesVersion: 4 };
    expect(LocalMatch.load(JSON.parse(JSON.stringify(old)))).toEqual({ ok: false, reason: 'outdated' });
  });
});

describe('QA S-12-1 Accelerated Beta Test on real 45-card games', () => {
  const pls = plans('abt_scorable');
  it('planned on QA seeds', () => expect(pls.length).toBeGreaterThanOrEqual(2));

  it('score: the Corp sees the real top 3; the Runner a count only; ICE install free and rezzed; Done trashes the rest face down', () => {
    for (const plan of pls) {
      const m = matchAt(plan);
      const before = m.snapshot();
      const top3 = before.players.corp.deck.slice(0, 3);
      const cv0 = m.view('corp');
      const r = go(m, { type: 'score', player: 'corp', uid: plan.info['uid']! });
      const cv = m.view('corp');
      const rv = m.view('runner');
      expect(cv.choice?.kind).toBe('look_install');
      expect(cv.choice!.looked).toEqual(top3);
      expect(rv.choice?.looked).toEqual([null, null, null]);
      expect(rv.choice?.options ?? []).toEqual([]);
      // No id of the 3 in anything the Runner got (unless the same card is public elsewhere).
      const pub = new Set(ids(rv.corpServers.map((s) => [...s.ice, ...s.content])).concat(ids(rv.players.corp.discard)).concat(ids(rv.players.corp.scored)));
      for (const id of ids(r.runner)) if (top3.includes(id)) expect(pub.has(id), `${id} in Runner events`).toBe(true);
      const iceIdx = top3.map((id, i) => (getCard(id)!.type === 'ice' ? i : -1)).filter((i) => i >= 0);
      expect(iceIdx.length).toBe(Number(plan.info['ice']));
      // Install every ICE (into R&D if offered, else first offer); each one free, rezzed, no click.
      let installed = 0;
      for (;;) {
        const v = m.view('corp');
        if (!v.choice) break;
        const sel = v.choice.options.filter((o) => o.action.type === 'select');
        if (sel.length === 0) break;
        const pick = sel.find((o) => o.action.type === 'select' && o.action.server === 'rd') ?? sel[0]!;
        expect(pick.cost).toBe(0);
        const card = v.choice.looked![(pick.action as Extract<Action, { type: 'select' }>).card]!;
        const credits = v.players.corp.credits;
        const clicks = v.players.corp.clicks;
        const res = go(m, pick.action);
        const after = m.view('corp');
        expect(after.players.corp.clicks).toBe(clicks);
        expect(after.players.corp.credits).toBeGreaterThanOrEqual(credits); // free; HB may add 1
        expect(after.players.corp.credits - credits).toBeLessThanOrEqual(1);
        const placed = after.corpServers.flatMap((s) => s.ice).filter((x) => x.cardId === card && x.faceUp);
        expect(placed.length).toBeGreaterThan(0);
        expect(res.runner.some((e) => e.type === 'ice_rezzed')).toBe(true);
        installed++;
      }
      expect(installed).toBe(iceIdx.length);
      const v = m.view('corp');
      const rest = top3.filter((_, i) => !iceIdx.includes(i));
      const archives = v.players.corp.discard.length;
      const rArchives = m.view('runner').players.corp.discard.length;
      if (v.choice) {
        const res = go(m, { type: 'pass', player: 'corp' });
        expect(res.runner.find((e) => e.type === 'rd_cards_trashed')).toMatchObject({ count: rest.length });
      } else expect(rest).toEqual([]);
      expect(m.view('corp').choice).toBeNull();
      expect(m.view('corp').players.corp.discard.slice(archives)).toEqual(rest);
      expect(m.view('runner').players.corp.discard.slice(rArchives)).toEqual(rest.map(() => null));
      expect(m.view('corp').players.corp.clicks).toBe(cv0.players.corp.clicks); // scoring takes no click; the installs none
      expect(m.snapshot().players.corp.deck).toEqual(before.players.corp.deck.slice(3));
    }
  });

  it('no ICE among 3: one tap (Done) sends them to Archives face down', () => {
    const p = plans('abt_scorable_no_ice', 2);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      go(m, { type: 'score', player: 'corp', uid: plan.info['uid']! });
      const v = m.view('corp');
      expect(v.choice!.options.map((o) => o.action)).toEqual([{ type: 'pass', player: 'corp' }]);
      go(m, { type: 'pass', player: 'corp' });
      expect(m.view('runner').players.corp.discard.slice(-3)).toEqual([null, null, null]);
      expect(m.view('corp').players.corp.discard.slice(-3)).toEqual(v.choice!.looked);
    }
  });

  it('R&D with 2, 1 or 0 cards: looks at what is there; 0 = no choice; the Corp does not lose', () => {
    const plan = pls[0]!;
    for (const n of [2, 1, 0]) {
      const m0 = matchAt(plan);
      const s = m0.snapshot();
      const cut: GameState = { ...s, players: { ...s.players, corp: { ...s.players.corp, deck: s.players.corp.deck.slice(0, n) } } };
      const r = apply(cut, { type: 'score', player: 'corp', uid: plan.info['uid']! });
      expect(r.events.some((e) => e.type === 'action_rejected')).toBe(false);
      expect(r.state.result).toBeNull();
      expect(r.state.phase).not.toBe('over');
      if (n === 0) expect(r.state.choice).toBeNull();
      else {
        expect(r.state.choice?.looked).toEqual(cut.players.corp.deck);
        // Finish: Done (pass) — still not lost, R&D empty.
        let st = r.state;
        const d = apply(st, { type: 'pass', player: 'corp' });
        expect(d.events.some((e) => e.type === 'action_rejected')).toBe(false);
        st = d.state;
        expect(st.result).toBeNull();
        expect(st.players.corp.deck).toEqual([]);
      }
    }
  });
});

describe('QA S-12-2 Archived Memories and Experiential Data on real games', () => {
  it('Archived Memories: the Corp may pick a face-down Archives card; it goes to HQ; the Runner gets no id for it', () => {
    const p = plans('archived_memories_ready', 2);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      const hi = Number(plan.info['handIndex']);
      const play = m.view('corp').handOptions[hi]!.find((o) => o.reject === null)!;
      go(m, play.action);
      const v = m.view('corp');
      expect(v.choice?.kind).toBe('archives_pick');
      const fd = Number(plan.info['faceDownIndex']);
      const st = m.snapshot();
      const picked = st.players.corp.discard[fd]!;
      expect(picked.faceUp).toBe(false);
      const opt = v.choice!.options.find((o) => o.action.type === 'select' && o.action.card === fd)!;
      expect(opt, 'face-down card offered').toBeTruthy();
      // The playing copy is never offered.
      const self = st.players.corp.discard.length - 1;
      expect(st.players.corp.discard[self]!.cardId).toBe('c24');
      expect(v.choice!.options.some((o) => o.action.type === 'select' && o.action.card === self)).toBe(false);
      const hand = v.players.corp.hand!.length;
      const res = go(m, opt.action);
      expect(m.view('corp').players.corp.hand!.length).toBe(hand + 1);
      expect(m.view('corp').players.corp.hand!.at(-1) ?? m.view('corp').players.corp.hand).toBeTruthy();
      expect(m.snapshot().players.corp.hand).toContain(picked.cardId);
      const ev = res.runner.find((e) => e.type === 'card_returned_to_hand') as { cardId?: string; faceUp: boolean } | undefined;
      expect(ev).toMatchObject({ faceUp: false });
      expect(ev!.cardId).toBeUndefined();
    }
  });

  it('Archived Memories with Archives empty: dimmed, condition_not_met', () => {
    const p = plans('archived_memories_empty', 1);
    expect(p.length).toBe(1);
    const m = matchAt(p[0]!);
    const opts = m.view('corp').handOptions[Number(p[0]!.info['handIndex'])]!;
    expect(opts.every((o) => o.reject === 'condition_not_met')).toBe(true);
  });

  it('Experiential Data: +1 while face up, breakers must match; face down or trashed = printed strength', () => {
    const p = plans('experiential_data_encounter', 2);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      const rv = m.view('runner');
      const printed = getCard('c06')!.strength!;
      expect(rv.run!.ice!.strength).toBe(printed + 1);
      expect(rv.corpServers.find((s) => s.id === plan.info['server'])!.ice.find((i) => i.uid === plan.info['iceUid'])!.strength).toBe(printed + 1);
      const breaks = rv.run!.options.filter((o) => o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid'] && 'sub' in o.action);
      expect(breaks.length).toBeGreaterThan(0);
      for (const b of breaks) expect(b.reject).toBe('too_weak'); // Gordian 2 < 3
      // Same state with ED face down / gone: Enigma back to printed, a break is allowed.
      const s = m.snapshot();
      const flip = (fn: (c: GameState['servers'][number]['content'][number]) => GameState['servers'][number]['content'][number] | null): GameState => ({
        ...s,
        servers: s.servers.map((sv) => ({ ...sv, content: sv.content.flatMap((c) => (c.uid === plan.info['edUid'] ? [fn(c)].filter((x) => x !== null) : [c])) })),
      });
      for (const st of [flip((c) => ({ ...c, rezzed: false })), flip(() => null)]) {
        const lm = LocalMatch.fromSnapshot(plan.seed, st, plan.actions);
        expect(lm.view('runner').run!.ice!.strength).toBe(printed);
        const b2 = lm.view('runner').run!.options.filter((o) => o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid'] && 'sub' in o.action);
        expect(b2.some((o) => o.reject === null)).toBe(true);
      }
      // Real play: pump once, then the breaks are allowed.
      const pump = rv.run!.options.find((o) => o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid'] && !('sub' in o.action) && o.reject === null)!;
      go(m, pump.action);
      const after = m.view('runner').run!.options.filter((o) => o.action.type === 'use_ability' && o.action.uid === plan.info['breakerUid'] && 'sub' in o.action);
      expect(after.some((o) => o.reject === null)).toBe(true);
    }
  });
});

describe('QA S-12-3 The Toolbox and Modded on real games', () => {
  it('Modded: price = max(0, cost - 3 - Kate 1 on the first install), one click only, installs that card', () => {
    const p = plans('modded_ready', 3);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      const v = m.view('runner');
      const st = m.snapshot();
      const kateUnused = st.players.runner.installedThisTurn.length === 0;
      const hi = Number(plan.info['handIndex']);
      for (const o of v.handOptions[hi]!) {
        const a = o.action as Extract<Action, { type: 'play' }>;
        const id = v.players.runner.hand![a.installIndex!]!;
        const c = getCard(id)!;
        expect(['program', 'hardware']).toContain(c.type);
        expect(o.cost).toBe(Math.max(0, c.cost! - 3 - (kateUnused ? 1 : 0)));
        expect(o.clicks ?? 1).toBe(1);
      }
      const o = v.handOptions[hi]!.find((x) => x.reject === null)!;
      const a = o.action as Extract<Action, { type: 'play' }>;
      const id = v.players.runner.hand![a.installIndex!]!;
      go(m, o.action);
      const w = m.view('runner');
      expect(w.players.runner.clicks).toBe(v.players.runner.clicks - 1);
      expect(w.players.runner.credits).toBe(v.players.runner.credits - o.cost);
      expect(w.rig.filter((c) => c.cardId === id).length).toBe(v.rig.filter((c) => c.cardId === id).length + 1);
      // Kate's discount is now used: a later install pays full price.
      const later = w.handOptions.flat().filter((x) => x.action.type === 'install');
      for (const x of later) {
        const cid = w.players.runner.hand![(x.action as Extract<Action, { type: 'install' }>).handIndex]!;
        const c = getCard(cid)!;
        if (c.type === 'program' || c.type === 'hardware') expect(x.cost, cid).toBe(c.cost);
      }
    }
  });

  it('The Toolbox: its 2 credits pay a breaker during a run (own credits untouched) and refill to 2 next turn', () => {
    const p = plans('toolbox_encounter', 2);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      const v = m.view('runner');
      expect(v.memory.limit).toBeGreaterThanOrEqual(6);
      expect(v.players.runner.link).toBeGreaterThanOrEqual(2 + (getCard(v.players.runner.identity!.cardId)!.link ?? 0));
      const tb = () => m.view('runner').rig.find((c) => c.uid === plan.info['toolboxUid'])!.hostedCredits;
      expect(tb()).toBe(2);
      const own = v.players.runner.credits;
      const paid = v.run!.options.find((o) => o.reject === null && (o.hostedPay ?? []).some((h) => h.uid === plan.info['toolboxUid']))!;
      expect(paid.action.type).toBe('use_ability');
      expect((paid.action as Extract<Action, { type: 'use_ability' }>).uid).toBe(plan.info['breakerUid']);
      const fromBox = paid.hostedPay!.find((h) => h.uid === plan.info['toolboxUid'])!.amount;
      go(m, paid.action);
      expect(tb()).toBe(2 - fromBox);
      expect(m.view('runner').players.runner.credits).toBe(own - (paid.cost - paid.hostedPay!.reduce((n, h) => n + h.amount, 0)));
      // No non-breaker option is ever paid from The Toolbox.
      for (const o of m.view('runner').run?.options ?? []) if ((o.hostedPay ?? []).some((h) => h.uid === plan.info['toolboxUid'])) expect((o.action as { uid?: string }).uid).toBe(plan.info['breakerUid']);
      // Jack out / finish, end both turns: refilled to 2 (not more).
      let guard = 0;
      while (guard++ < 60 && !(m.view('runner').activePlayer === 'runner' && m.view('runner').players.runner.clicks === 4 && !m.view('runner').run)) {
        const side = m.view('runner').activePlayer;
        const any = (['runner', 'corp'] as const).map((s) => [s, m.view(s)] as const);
        let done = false;
        for (const [s, sv] of any) {
          const opts = sv.run?.options ?? sv.choice?.options ?? [];
          const jack = opts.find((o) => o.reject === null && (o.action.type === 'jack_out' || o.action.type === 'pass'));
          if (jack && (sv.run?.waitingOn === s || sv.choice?.waitingOn === s)) {
            go(m, jack.action);
            done = true;
            break;
          }
        }
        if (done) continue;
        const sv = m.view(side);
        if (sv.pendingDiscard > 0) go(m, { type: 'discard', player: side, handIndices: Array.from({ length: sv.pendingDiscard }, (_, i) => i) });
        else go(m, { type: 'end_turn', player: side });
      }
      expect(m.view('runner').players.runner.clicks).toBe(4);
      expect(tb()).toBe(2);
    }
  });
});

describe('QA S-12-4 Infiltration on real games', () => {
  it('Expose: both seats get the same public card_exposed; the card stays face down; nothing else is revealed', () => {
    const p = plans('infiltration_ready', 3);
    expect(p.length).toBeGreaterThan(0);
    for (const plan of p) {
      const m = matchAt(plan);
      const hi = Number(plan.info['handIndex']);
      const v = m.view('runner');
      const opts = v.handOptions[hi]!;
      expect(opts[0]!.action).toMatchObject({ type: 'play', mode: 0 });
      const exposeOpts = opts.filter((o) => (o.action as { mode?: number }).mode === 1);
      const faceDown = v.corpServers.flatMap((s) => [...s.ice, ...s.content]).filter((c) => !c.faceUp).map((c) => c.uid);
      expect(exposeOpts.map((o) => (o.action as { uid?: string }).uid).sort()).toEqual([...faceDown].sort());
      const cBefore = m.view('corp');
      const rBefore = v;
      const ex = exposeOpts.find((o) => (o.action as { uid?: string }).uid === plan.info['uid'])!;
      const res = go(m, ex.action);
      const real = m.snapshot().servers.flatMap((s) => [...s.ice, ...s.content]).find((c) => c.uid === plan.info['uid'])!;
      const evR = res.runner.find((e) => e.type === 'card_exposed');
      const evC = res.corp.find((e) => e.type === 'card_exposed');
      expect(evR).toEqual(evC);
      expect(evR).toMatchObject({ uid: plan.info['uid'], cardId: real.cardId });
      expect(real.rezzed).toBe(false);
      const rAfter = m.view('runner');
      const cAfter = m.view('corp');
      // Stays face down in both views; the rest of the Corp's side is the same.
      expect(rAfter.corpServers).toEqual(rBefore.corpServers);
      expect(cAfter.corpServers).toEqual(cBefore.corpServers);
      expect(rAfter.players.corp).toEqual(rBefore.players.corp);
      // Only that one id is new in the Runner's events.
      const newIds = ids(res.runner).filter((id) => id !== real.cardId && id !== 'r21');
      const pub = new Set([...ids(rBefore), ...ids(rAfter)]);
      for (const id of newIds) expect(pub.has(id), id).toBe(true);
    }
  });

  it('Gain 2 credits: +2, one click', () => {
    const plan = plans('infiltration_ready', 1)[0]!;
    const m = matchAt(plan);
    const v = m.view('runner');
    go(m, v.handOptions[Number(plan.info['handIndex'])]![0]!.action);
    const w = m.view('runner');
    expect(w.players.runner.credits).toBe(v.players.runner.credits + 2);
    expect(w.players.runner.clicks).toBe(v.players.runner.clicks - 1);
  });
});

describe('QA S-12-5 AC3: every Sprint 12 goal path, both seats, no leaks along the way', () => {
  it('replays each planned path on QA seeds with the leak checks after every move', () => {
    let paths = 0;
    for (const goal of SPRINT12_GOALS) for (const plan of plans(goal, 2)) {
      const m = new LocalMatch(plan.seed, { deckSet: plan.deckSet });
      for (const a of plan.actions) go(m, a);
      const pv: PlayerView = m.view('runner');
      expect(runnerViewLeaks(m.snapshot(), pv)).toEqual([]);
      paths++;
    }
    expect(paths).toBeGreaterThanOrEqual(SPRINT12_GOALS.length);
  });
});
