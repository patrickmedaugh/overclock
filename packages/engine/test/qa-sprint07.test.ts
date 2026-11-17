// QA Sprint 7 (written by QA, not the developers). Independent checks of S-07-1..5 rules:
// edge cases the developer tests don't reach, and a random-play sweep with QA's own invariants
// (hidden information, hosted credits, empty remotes, ids never reused, PAD only when face up,
// Cyberfeeder never paying installs or trash costs, Bank Job only on remotes).
// Real play from a new game; only hands/credits/clicks are set before the first action.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewEvents, viewFor, waitingOn, type Action, type GameEvent, type GameState, type ServerId, type Side } from '../src/index';
import { finishTurn, rejection, run, withHand, withPlayer, newGame } from './helpers';

const corpInstall = (handIndex: number, server: ServerId | 'new'): Action => ({ type: 'install', player: 'corp', handIndex, server });
const runnerInstall = (handIndex: number): Action => ({ type: 'install', player: 'runner', handIndex });
const runOn = (server: ServerId): Action => ({ type: 'run', player: 'runner', server });
const pass = (player: Side): Action => ({ type: 'pass', player });
const rez = (uid: string): Action => ({ type: 'rez', player: 'corp', uid });
const advance = (uid: string): Action => ({ type: 'advance', player: 'corp', uid });
const activate = (uid: string, ability = 0, player: Side = 'runner'): Action => ({ type: 'activate', player, uid, ability });
const breakSub = (uid: string, sub = 0): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 0, sub });
const pump = (uid: string): Action => ({ type: 'use_ability', player: 'runner', uid, ability: 1 });

const ids = (s: GameState) => s.servers.map((sv) => sv.id);
const card = (s: GameState, uid: string) =>
  [...s.rig, ...s.servers.flatMap((sv) => [...sv.ice, ...sv.content])].find((c) => c.uid === uid);

/** Corp turn 1 (seed 33) with `hand`, credits and clicks; then `actions`. */
function corpTurn(hand: string[], actions: Action[], credits = 10, clicks = 3): GameState {
  return run(withPlayer(withHand(newGame(33), 'corp', hand), 'corp', { credits, clicks }), actions).state;
}

/** Ends the Corp turn and gives the Runner `hand` and `credits`. */
function toRunner(s: GameState, hand: string[], credits: number): GameState {
  return withPlayer(withHand(finishTurn(s).state, 'runner', hand), 'runner', { credits });
}

// ---- S-07-1 --------------------------------------------------------------------------------------

describe('QA S-07-1 empty servers', () => {
  it('a remote with an agenda and a face-down upgrade: stealing the agenda leaves the upgrade, so the server stays', () => {
    // remote1: Hostile Takeover + Akitaro Watanabe (face down), no ICE.
    let s = corpTurn(['c08', 'c11'], [corpInstall(0, 'new'), corpInstall(0, 'remote1')]);
    s = toRunner(s, [], 0);
    let r = run(s, [runOn('remote1')]);
    // Remote access: one card at a time. Steal the agenda; leave the upgrade (can't pay 3 anyway).
    const st = r.state;
    const acc = st.run!.access!.cards;
    const agendaIdx = acc.findIndex((c) => c.cardId === 'c08');
    if (agendaIdx >= 0) {
      r = run(st, [{ type: 'steal', player: 'runner', card: agendaIdx }]);
    }
    let guard = 0;
    while (r.state.run && guard++ < 6) {
      const la = legalActions(r.state, 'runner');
      const steal = la.find((a) => a.type === 'steal');
      r = run(r.state, [steal ?? pass('runner')]);
    }
    expect(r.state.run).toBeNull();
    expect(r.state.players.runner.scoreArea).toEqual(['c08']);
    expect(ids(r.state)).toContain('remote1');
    expect(r.state.servers.find((x) => x.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c11']);
  });

  it('a run that ends on the ICE-less remote by jacking out is impossible; a run on another remote never removes an unrelated empty-looking server', () => {
    // remote1: Wall of Static only (ICE-only remote), remote2: PAD Campaign.
    let s = corpTurn(['c04', 'c03'], [corpInstall(0, 'new'), corpInstall(0, 'new')]);
    s = toRunner(s, [], 5);
    const r = run(s, [runOn('remote2'), pass('runner')]); // leave PAD
    expect(ids(r.state)).toEqual(['hq', 'rd', 'archives', 'remote1', 'remote2']);
  });

  it('ids are never reused across several removals; new servers count on', () => {
    let s = corpTurn(['c03', 'c03', 'c03'], [corpInstall(0, 'new'), corpInstall(0, 'new'), corpInstall(0, 'new')]);
    s = toRunner(s, [], 12);
    s = run(s, [runOn('remote1'), { type: 'trash', player: 'runner', card: 0 }]).state;
    s = run(s, [runOn('remote3'), { type: 'trash', player: 'runner', card: 0 }]).state;
    expect(ids(s)).toEqual(['hq', 'rd', 'archives', 'remote2']);
    s = withHand(finishTurn(s).state, 'corp', ['c03', 'c04']);
    const r = run(s, [corpInstall(0, 'new'), corpInstall(0, 'new')]);
    expect(r.events.filter((e) => e.type === 'server_created')).toEqual([
      { type: 'server_created', server: 'remote4' },
      { type: 'server_created', server: 'remote5' },
    ]);
    expect(ids(r.state)).toEqual(['hq', 'rd', 'archives', 'remote2', 'remote4', 'remote5']);
  });

  it('server_removed is public and the Runner view loses the server the same moment as the Corp view', () => {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    s = toRunner(s, [], 5);
    const r = run(s, [runOn('remote1'), { type: 'trash', player: 'runner', card: 0 }]);
    for (const side of ['corp', 'runner'] as const) {
      expect(viewEvents(side, r.events).filter((e) => e.type === 'server_removed')).toEqual([{ type: 'server_removed', server: 'remote1' }]);
      expect(viewFor(side, r.state).corpServers.map((x) => x.id)).toEqual(['hq', 'rd', 'archives']);
    }
  });
});

// ---- S-07-2 --------------------------------------------------------------------------------------

describe('QA S-07-2 PAD Campaign and Akitaro Watanabe', () => {
  it('PAD Campaign face down gives nothing; face up gives exactly 1 per Corp turn, before the mandatory draw; trashed gives nothing more', () => {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    // Face down through a whole round: Corp credits unchanged at its turn start.
    s = finishTurn(s).state; // Runner
    const before = s.players.corp.credits;
    let r = finishTurn(s); // Corp turn begins
    expect(r.events.some((e) => e.type === 'ability_triggered')).toBe(false);
    expect(r.state.players.corp.credits).toBe(before);
    s = run(r.state, [rez('i1')]).state;
    const afterRez = s.players.corp.credits;
    s = finishTurn(s).state; // Runner turn
    r = finishTurn(s); // Corp turn begins
    const types = r.events.map((e) => e.type);
    const trig = types.indexOf('ability_triggered');
    const drawn = types.indexOf('card_drawn');
    expect(trig).toBeGreaterThan(types.indexOf('turn_started'));
    expect(drawn).toBeGreaterThan(trig);
    expect(r.events).toContainEqual({ type: 'ability_triggered', uid: 'i1', cardId: 'c03', trigger: 'turn_start' });
    expect(r.state.players.corp.credits).toBe(afterRez + 1);
    // Both players see the trigger (public; the card is face up).
    expect(viewEvents('runner', r.events)).toContainEqual({ type: 'ability_triggered', uid: 'i1', cardId: 'c03', trigger: 'turn_start' });
    // The Runner trashes it (4 credits): no more credits after that.
    s = toRunner(r.state, [], 4);
    s = run(s, [runOn('remote1'), { type: 'trash', player: 'runner', card: 0 }]).state;
    const c = s.players.corp.credits;
    r = finishTurn(s);
    expect(r.events.some((e) => e.type === 'ability_triggered')).toBe(false);
    expect(r.state.players.corp.credits).toBe(c);
  });

  it('the rez of an asset does not happen in the Runner turn or mid-run, and the Runner cannot rez Corp cards', () => {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    s = toRunner(s, [], 5);
    expect(rejection(apply(s, rez('i1')).events)).toBe('not_your_turn');
    expect(rejection(apply(s, { type: 'rez', player: 'runner', uid: 'i1' }).events)).not.toBeNull();
    expect(viewFor('runner', s).installedOptions).toEqual({});
  });

  it('Akitaro face down gives no discount; face up it lowers only ICE in its own server; trashed, the discount is gone', () => {
    // remote1: Akitaro + Wall of Static. remote2: Wall of Static. Corp has plenty of credits.
    let s = corpTurn(['c11', 'c04', 'c04'], [corpInstall(0, 'new'), corpInstall(0, 'remote1'), corpInstall(0, 'new')], 10);
    s = finishTurn(s).state;
    s = withPlayer(s, 'runner', { credits: 0 });
    // Face-down Akitaro: Wall of Static still 3.
    let at = run(s, [runOn('remote1')]).state;
    expect(viewFor('corp', at).run!.options.find((o) => o.action.type === 'rez')!.cost).toBe(3);
    // Corp rezzes Akitaro next turn.
    s = finishTurn(run(at, [pass('corp'), { type: 'jack_out', player: 'runner' }]).state).state;
    expect(s.activePlayer).toBe('corp');
    s = run(s, [rez('i1')]).state;
    expect(card(s, 'i1')!.rezzed).toBe(true);
    s = finishTurn(s).state;
    at = run(s, [runOn('remote1')]).state;
    expect(viewFor('corp', at).run!.options.find((o) => o.action.type === 'rez')!.cost).toBe(1);
    const other = run(s, [runOn('remote2')]).state;
    expect(viewFor('corp', other).run!.options.find((o) => o.action.type === 'rez')!.cost).toBe(3);
    // Rez for 1: exactly 1 credit spent.
    const c0 = at.players.corp.credits;
    const rz = run(at, [rez('i2')]);
    expect(rz.state.players.corp.credits).toBe(c0 - 1);
    expect(rz.events[0]).toEqual({ type: 'credits_spent', player: 'corp', amount: 1 });
  });

  it('Akitaro on HQ (an upgrade in a central server) discounts HQ ICE: Ice Wall 1 -> 0, the Corp with 0 credits is asked and can rez', () => {
    let s = corpTurn(['c11', 'c05'], [corpInstall(0, 'hq'), corpInstall(0, 'hq')], 1);
    s = run(s, [rez('i1')]).state; // 1 credit -> 0
    expect(s.players.corp.credits).toBe(0);
    s = finishTurn(s).state;
    const at = run(s, [runOn('hq')]).state;
    expect(at.run!.step).toBe('approach'); // asked even with 0 credits (hot-seat 'affordable' uses the discounted price)
    const opt = viewFor('corp', at).run!.options.find((o) => o.action.type === 'rez')!;
    expect(opt).toMatchObject({ cost: 0, reject: null });
    const r = run(at, [rez('i2')]);
    expect(r.state.players.corp.credits).toBe(0);
    expect(card(r.state, 'i2')!.rezzed).toBe(true);
  });

  it('hot-seat: the Corp with 1 credit is NOT asked about Wall of Static (3) without a face-up Akitaro', () => {
    let s = corpTurn(['c04'], [corpInstall(0, 'new')], 1);
    s = finishTurn(s).state;
    const at = run(s, [runOn('remote1')]).state;
    expect(at.run!.step).not.toBe('approach');
  });
});

// ---- S-07-3 --------------------------------------------------------------------------------------

describe('QA S-07-3 Armitage Codebusting and Akamatsu Mem Chip', () => {
  function runnerTurn(hand: string[], credits = 5): GameState {
    return toRunner(corpTurn([], []), hand, credits);
  }

  it('two Armitages keep separate credits; taking from one leaves the other at 12', () => {
    const s = run(runnerTurn(['r02', 'r02']), [runnerInstall(0), runnerInstall(0), activate('i1')]).state;
    expect(card(s, 'i1')!.hostedCredits).toBe(10);
    expect(card(s, 'i2')!.hostedCredits).toBe(12);
  });

  it('6 takes over two turns empty it: 12 -> 0, +12 credits in total, the card goes to the Heap face up', () => {
    let s = run(runnerTurn(['r02'], 1), [runnerInstall(0)]).state; // 0 credits left, 3 clicks
    let gained = 0;
    let takes = 0;
    for (let g = 0; g < 10 && card(s, 'i1'); g++) {
      if (s.activePlayer === 'runner' && s.players.runner.clicks > 0) {
        const c = s.players.runner.credits;
        const r = run(s, [activate('i1')]);
        gained += r.state.players.runner.credits - c;
        takes++;
        s = r.state;
      } else s = finishTurn(finishTurn(s).state).state;
    }
    expect(takes).toBe(6);
    expect(gained).toBe(12);
    expect(card(s, 'i1')).toBeUndefined();
    expect(s.players.runner.discard.at(-1)).toEqual({ cardId: 'r02', faceUp: true });
  });

  it('refusals: no clicks -> no_clicks; Corp turn -> not_your_turn; mid-run -> wrong_phase; the Corp cannot use it', () => {
    let s = run(runnerTurn(['r02']), [runnerInstall(0)]).state;
    expect(rejection(apply(s, activate('i1', 0, 'corp')).events)).not.toBeNull();
    expect(rejection(apply(s, activate('i1', 1)).events)).toBe('bad_target'); // no second ability
    const mid = run(s, [runOn('hq')]).state;
    if (mid.run) expect(rejection(apply(mid, activate('i1')).events)).toBe('wrong_phase');
    s = withPlayer(s, 'runner', { clicks: 0 });
    expect(rejection(apply(s, activate('i1')).events)).toBe('no_clicks');
    expect(viewFor('runner', s).installedOptions.i1).toEqual([{ action: activate('i1'), cost: 0, reject: 'no_clicks', clicks: 1, gain: 2 }]);
    const corp = finishTurn(s).state;
    expect(rejection(apply(corp, activate('i1')).events)).toBe('not_your_turn');
  });

  it('Akamatsu Mem Chip: the Runner\'s memory limit is 5 with it, 4 without', () => {
    const s = run(runnerTurn(['r09'], 5), [runnerInstall(0)]).state;
    expect(viewFor('runner', s).memory.limit).toBe(5);
    const without = runnerTurn([], 5);
    expect(viewFor('runner', without).memory.limit).toBe(4);
  });
});

// ---- S-07-4 --------------------------------------------------------------------------------------

describe('QA S-07-4 Cyberfeeder and Bank Job', () => {
  it('Cyberfeeder never pays an install: with 0 credits of his own the Runner cannot install Akamatsu (cost 1)', () => {
    let s = toRunner(corpTurn([], []), ['r08', 'r09'], 2);
    s = run(s, [runnerInstall(0)]).state; // Cyberfeeder: 2 -> 0 own credits
    expect(s.players.runner.credits).toBe(0);
    expect(card(s, 'i1')!.hostedCredits).toBe(1);
    expect(rejection(apply(s, runnerInstall(0)).events)).toBe('no_credits');
    expect(viewFor('runner', s).handOptions[0]!.every((o) => o.reject === 'no_credits')).toBe(true);
  });

  it('Cyberfeeder never pays a trash cost: with 3 credits of his own and 1 on Cyberfeeder, PAD Campaign (4) cannot be trashed', () => {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    s = toRunner(s, ['r08'], 5);
    s = run(s, [runnerInstall(0)]).state; // 3 own credits
    expect(s.players.runner.credits).toBe(3);
    const at = run(s, [runOn('remote1')]).state;
    expect(at.run!.step).toBe('access');
    const trashOpt = viewFor('runner', at).run!.options.find((o) => o.action.type === 'trash');
    expect(trashOpt?.reject).toBe('no_credits');
    expect(rejection(apply(at, { type: 'trash', player: 'runner', card: 0 }).events)).toBe('no_credits');
  });

  it('Cyberfeeder pays strength pumps too ("using icebreakers"); refill to 1 at the Runner turn start, never 2', () => {
    // Ice Wall advanced twice (strength 3) in remote1.
    let s = corpTurn(['c05'], [corpInstall(0, 'new'), advance('i1'), advance('i1')]);
    s = toRunner(s, ['r08', 'r04'], 4);
    s = run(s, [runnerInstall(0), runnerInstall(0), runOn('remote1'), rez('i1')]).state; // own credits 0
    expect(s.run!.step).toBe('encounter');
    const r = apply(s, pump('i3'));
    expect(r.events[0]).toEqual({ type: 'credits_spent', player: 'runner', amount: 1, hosted: 1 });
    // Unused next round: still 1 (no refill above the amount).
    let t = finishTurn(run(s, [pass('runner')]).state).state; // let Ice Wall end the run, then Corp turn
    expect(card(t, 'i2')!.hostedCredits).toBe(1);
    t = finishTurn(t).state; // Runner turn start
    expect(card(t, 'i2')!.hostedCredits).toBe(1);
  });

  it('Bank Job is never offered through The Maker\'s Eye (R&D) or Inside Job on HQ', () => {
    let s = toRunner(corpTurn([], []), ['r10', 'r07', 'r11'], 10);
    s = run(s, [runnerInstall(0)]).state;
    const me = run(s, [{ type: 'play', player: 'runner', handIndex: 0 }]).state;
    expect(me.run?.step).not.toBe('success');
    const ij = apply(s, { type: 'play', player: 'runner', handIndex: 1, server: 'hq' });
    expect(rejection(ij.events)).toBeNull();
    expect(ij.state.run?.step).not.toBe('success');
  });

  it('Bank Job taken on a remote with an agenda: the agenda is not stolen; the server and its card stay', () => {
    let s = corpTurn(['c08'], [corpInstall(0, 'new')]);
    s = toRunner(s, ['r10'], 5);
    s = run(s, [runnerInstall(0), runOn('remote1')]).state;
    expect(s.run!.step).toBe('success');
    // Sprint 10: Bank Job names an amount (1..8); 8 takes all.
    expect(rejection(apply(s, activate('i2')).events)).toBe('invalid_action');
    const r = run(s, [{ ...activate('i2'), amount: 8 } as Action]);
    expect(r.state.players.runner.scoreArea).toEqual([]);
    expect(r.events.some((e) => e.type === 'card_accessed' || e.type === 'agenda_stolen')).toBe(false);
    expect(r.state.servers.find((x) => x.id === 'remote1')!.content.map((c) => c.cardId)).toEqual(['c08']);
    // Hidden: the Runner's projection of the take events never names the agenda.
    expect(JSON.stringify(viewEvents('runner', r.events))).not.toContain('c08');
    expect(viewFor('runner', r.state).corpServers.find((x) => x.id === 'remote1')!.content[0]!.cardId).toBeNull();
  });

  it('Bank Job is offered on the success step only to the Runner; the Corp cannot act there', () => {
    let s = corpTurn(['c03'], [corpInstall(0, 'new')]);
    s = toRunner(s, ['r10'], 5);
    s = run(s, [runnerInstall(0), runOn('remote1')]).state;
    expect(waitingOn(s)).toBe('runner');
    expect(rejection(apply(s, pass('corp')).events)).toBe('not_your_turn');
  });
});

// ---- S-07-5 --------------------------------------------------------------------------------------

describe('QA S-07-5 Ice Wall', () => {
  it('Wall of Static, Enigma and Neural Katana: never an Advance option, advance refused bad_target', () => {
    const s = corpTurn(['c04', 'c06', 'c07'], [corpInstall(0, 'new'), corpInstall(0, 'new'), corpInstall(0, 'new')]);
    expect(viewFor('corp', s).installedOptions).toEqual({});
    for (const uid of ['i1', 'i2', 'i3']) {
      const t = withPlayer(s, 'corp', { clicks: 1 });
      expect(rejection(apply(t, advance(uid)).events)).toBe('bad_target');
    }
  });

  it('3 counters: strength 4; Corroder needs 2 pumps and then breaks; Ice Wall cannot be scored', () => {
    let s = corpTurn(['c05'], [corpInstall(0, 'new'), advance('i1'), advance('i1')], 10, 4);
    s = run(s, [advance('i1')]).state;
    expect(card(s, 'i1')!.advancements).toBe(3);
    expect(rejection(apply(s, { type: 'score', player: 'corp', uid: 'i1' }).events)).not.toBeNull();
    s = toRunner(s, ['r04'], 10);
    s = run(s, [runnerInstall(0), runOn('remote1'), rez('i1')]).state;
    expect(s.run!.step).toBe('encounter');
    expect(viewFor('runner', s).run!.ice).toMatchObject({ strength: 4 });
    expect(rejection(apply(s, breakSub('i2')).events)).toBe('too_weak');
    s = run(s, [pump('i2')]).state;
    expect(rejection(apply(s, breakSub('i2')).events)).toBe('too_weak');
    s = run(s, [pump('i2'), breakSub('i2')]).state;
    expect(s.run!.broken).toEqual([0]);
  });

  it('advancing costs the Corp 1 click and 1 credit; 0 credits -> no_credits; Runner turn -> not_your_turn', () => {
    const s = corpTurn(['c05'], [corpInstall(0, 'new')], 0);
    expect(viewFor('corp', s).installedOptions.i1).toEqual([{ action: advance('i1'), cost: 1, reject: 'no_credits' }]);
    expect(rejection(apply(s, advance('i1')).events)).toBe('no_credits');
    const r = finishTurn(withPlayer(s, 'corp', { credits: 1 })).state;
    expect(rejection(apply(r, advance('i1')).events)).toBe('not_your_turn');
  });
});

// ---- random play: QA invariants -----------------------------------------------------------------

/** Small deterministic PRNG for the test (not the engine's). */
function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

interface Tally {
  games: number;
  actions: number;
  pads: number;
  akitaroRez: number;
  armitageTakes: number;
  bankJobTakes: number;
  bankJobPartial: number;
  successSteps: number;
  cyberPays: number;
  iceWallAdv: number;
  removed: number;
  iceWallEnc: number;
}

function sweep(seed: number, tally: Tally): void {
  const rnd = lcg(seed * 7919 + 13);
  let s = newGame(seed);
  const seenServers = new Set(ids(s));
  const removed = new Set<string>();
  for (let n = 0; n < 500 && s.phase !== 'over'; n++) {
    const who = waitingOn(s);
    if (!who) break;
    const all = legalActions(s, who);
    if (all.length === 0) throw new Error(`seed ${seed}: no legal action for ${who} at ${s.phase}`);
    // Prefer Sprint 7 actions so the cards get used; avoid ending turns too early.
    const s7 = all.filter((a) => a.type === 'activate' || a.type === 'rez' || a.type === 'advance' || a.type === 'run' || a.type === 'install' || a.type === 'trash' || a.type === 'steal');
    const nonEnd = all.filter((a) => a.type !== 'end_turn' && a.type !== 'jack_out');
    const pool = s7.length > 0 && rnd() < 0.7 ? s7 : nonEnd.length > 0 && rnd() < 0.9 ? nonEnd : all;
    const a = pool[Math.floor(rnd() * pool.length)]!;
    const before = s;
    const r = apply(s, a);
    const rej = r.events.find((e) => e.type === 'action_rejected');
    if (rej) throw new Error(`seed ${seed}: legal action rejected ${JSON.stringify(a)} ${JSON.stringify(rej)}`);
    s = r.state;
    tally.actions++;
    checkStep(seed, before, a, r.events, s, seenServers, removed, tally);
  }
  tally.games++;
}

function checkStep(
  seed: number,
  before: GameState,
  a: Action,
  events: readonly GameEvent[],
  s: GameState,
  seen: Set<string>,
  removed: Set<string>,
  tally: Tally,
): void {
  const where = `seed ${seed} after ${JSON.stringify(a)}`;
  // Hidden information: every unrezzed Corp card is a back in the Runner's view; no options for Corp cards.
  const rv = viewFor('runner', s);
  const corpUnrezzed = new Set(s.servers.flatMap((sv) => [...sv.ice, ...sv.content]).filter((c) => !c.rezzed).map((c) => c.uid));
  for (const sv of rv.corpServers) for (const c of [...sv.ice, ...sv.content]) if (corpUnrezzed.has(c.uid)) expect(c.cardId, where).toBeNull();
  for (const uid of Object.keys(rv.installedOptions)) expect(s.rig.some((c) => c.uid === uid), `${where}: runner option on ${uid}`).toBe(true);
  // Runner events never name an unrezzed Corp card except by access (accessed cards are seen).
  const accessed = new Set(events.filter((e) => e.type === 'card_accessed').map((e) => (e as { uid?: string }).uid));
  for (const e of viewEvents('runner', events)) {
    const u = (e as { uid?: string }).uid;
    const id = (e as { cardId?: string | null }).cardId;
    if (u && corpUnrezzed.has(u) && id && !accessed.has(u) && e.type !== 'card_accessed') throw new Error(`${where}: runner event ${JSON.stringify(e)} names face-down ${u}`);
    if (e.type === 'card_installed' && e.player === 'corp') expect((e as { cardId?: string }).cardId ?? null, where).toBeNull();
  }
  // Hosted credits stay in their card's range.
  for (const c of s.rig) {
    if (c.cardId === 'r08') expect([0, 1], where).toContain(c.hostedCredits);
    if (c.cardId === 'r02') expect([2, 4, 6, 8, 10, 12], where).toContain(c.hostedCredits);
    // Sprint 10: a partial take leaves Bank Job with 1..8 (taking the last credit trashes it).
    if (c.cardId === 'r10') expect([1, 2, 3, 4, 5, 6, 7, 8], where).toContain(c.hostedCredits);
  }
  // Bank Job's credits only go down, and only by the amount named in an activate on it.
  for (const c of s.rig) {
    if (c.cardId !== 'r10') continue;
    const was = before.rig.find((x) => x.uid === c.uid);
    if (!was) {
      expect(c.hostedCredits, where).toBe(8);
      continue;
    }
    const took = a.type === 'activate' && a.uid === c.uid ? ((a as { amount?: number }).amount ?? 0) : 0;
    expect(c.hostedCredits, where).toBe(was.hostedCredits - took);
  }
  if (a.type === 'activate') {
    const was = before.rig.find((x) => x.uid === a.uid);
    if (was?.cardId === 'r10') {
      const amt = (a as { amount?: number }).amount;
      expect(Number.isInteger(amt) && amt! >= 1 && amt! <= was.hostedCredits, where).toBe(true);
      if (amt === was.hostedCredits) {
        expect(s.rig.some((x) => x.uid === a.uid), `${where}: emptied Bank Job left the rig`).toBe(false);
        expect(s.players.runner.discard.some((x) => (typeof x === 'string' ? x : (x as { cardId: string }).cardId) === 'r10'), `${where}: Bank Job in the Heap`).toBe(true);
      }
      tally.bankJobPartial += amt! < was.hostedCredits ? 1 : 0;
    }
  }
  // Memory limit follows Akamatsu.
  expect(rv.memory.limit, where).toBe(4 + s.rig.filter((c) => c.cardId === 'r09').length);
  // Cyberfeeder never pays for installs or trash costs.
  if ((a.type === 'install' || a.type === 'trash') && a.player === 'runner') {
    for (const c of before.rig) if (c.cardId === 'r08') expect(s.rig.find((x) => x.uid === c.uid)?.hostedCredits, where).toBe(c.hostedCredits);
    for (const e of events) if (e.type === 'credits_spent') expect((e as { hosted?: number }).hosted ?? 0, where).toBe(0);
  }
  if (events.some((e) => e.type === 'credits_spent' && ((e as { hosted?: number }).hosted ?? 0) > 0)) {
    expect(a.type, where).toBe('use_ability');
    tally.cyberPays++;
  }
  // PAD Campaign only triggers face up; Akitaro rez counted.
  for (const e of events) {
    if (e.type === 'ability_triggered' && e.trigger === 'turn_start' && e.cardId === 'c03') {
      expect(before.servers.some((sv) => sv.content.some((c) => c.uid === e.uid && c.rezzed)) || s.servers.some((sv) => sv.content.some((c) => c.uid === e.uid && c.rezzed)), where).toBe(true);
      tally.pads++;
    }
    if (e.type === 'card_rezzed' && e.cardId === 'c11') tally.akitaroRez++;
    if (e.type === 'ability_triggered' && e.cardId === 'r02') tally.armitageTakes++;
    if (e.type === 'ability_triggered' && e.cardId === 'r10') tally.bankJobTakes++;
    if (e.type === 'card_advanced' && card(s, e.uid)?.cardId === 'c05') tally.iceWallAdv++;
    if (e.type === 'server_removed') {
      tally.removed++;
      removed.add(e.server);
    }
    if (e.type === 'server_created') {
      expect(seen.has(e.server), `${where}: server id ${e.server} reused`).toBe(false);
      seen.add(e.server);
    }
  }
  // Empty remotes never linger outside a run (and never come back).
  if (s.phase !== 'run' && s.phase !== 'over') {
    for (const sv of s.servers) {
      if (['hq', 'rd', 'archives'].includes(sv.id)) continue;
      expect(sv.ice.length + sv.content.length, `${where}: ${sv.id} empty`).toBeGreaterThan(0);
    }
  }
  for (const id of removed) expect(ids(s), where).not.toContain(id);
  // Bank Job's step only on a remote, with Bank Job holding credits.
  if (s.run?.step === 'success') {
    tally.successSteps++;
    expect(['hq', 'rd', 'archives'], where).not.toContain(s.run.server);
    expect(s.rig.some((c) => c.cardId === 'r10' && c.hostedCredits > 0), where).toBe(true);
  }
  // Ice Wall strength in a Runner encounter = 1 + counters (+0 otherwise).
  const ice = rv.run?.ice;
  if (ice && rv.run?.iceUid) {
    const inst = card(s, rv.run.iceUid);
    if (inst?.cardId === 'c05' && inst.rezzed && inst.advancements > 0) {
      expect((ice as { strength?: number }).strength, where).toBe(1 + inst.advancements);
      tally.iceWallEnc++;
    }
  }
}

describe('QA random play with Sprint 7 cards (own invariants)', () => {
  it('250 games: hidden info, hosted credits, memory, Cyberfeeder, PAD, Bank Job step, empty remotes, ids, Ice Wall strength', () => {
    const tally: Tally = { games: 0, actions: 0, pads: 0, akitaroRez: 0, armitageTakes: 0, bankJobTakes: 0, bankJobPartial: 0, successSteps: 0, cyberPays: 0, iceWallAdv: 0, removed: 0, iceWallEnc: 0 };
    for (let seed = 7000; seed < 7250; seed++) sweep(seed, tally);
    // The sweep really exercised the new cards.
    console.log('QA sprint 7 sweep', JSON.stringify(tally));
    expect(tally.games).toBe(250);
    for (const k of ['pads', 'akitaroRez', 'armitageTakes', 'bankJobTakes', 'bankJobPartial', 'successSteps', 'cyberPays', 'iceWallAdv', 'removed', 'iceWallEnc'] as const) expect(tally[k], k).toBeGreaterThan(0);
  }, 120_000);
});
