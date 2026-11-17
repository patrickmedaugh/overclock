// Sprint 9 E6 (S-09-4): SEA Source (play only after a successful run last turn; Trace 3 – 1 tag, in the
// Corp's turn) and Ichi 1.0 (trash 1 program ×2, each with the Corp's pick and Sacrificial Construct's
// save, then Trace 1 – 1 tag and 1 brain damage), including the flatline order.
import { describe, expect, it } from 'vitest';
import { apply, hasMeaningfulResponse, viewFor, waitingOn, type Action, type GameEvent, type GameState } from '../src/index';
import { act, board, finishTurn, liveness, rejection, withPlayer, type BoardSpec } from './helpers';
import { expectRunnerEventsClean, expectRunnerViewClean } from './hidden';

const CORE = { deckSet: 'core' } as const;
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const bid = (player: 'corp' | 'runner', credits: number): Action => ({ type: 'trace_bid', player, credits });
const choose = (player: 'corp' | 'runner', uid: string): Action => ({ type: 'choose', player, uid });
const runnerPass: Action = { type: 'pass', player: 'runner' };
const playSea: Action = { type: 'play', player: 'corp', handIndex: 0 };
const handOptions = (s: GameState, side: 'corp' | 'runner') => viewFor(side, s).handOptions;

function clean(r: { state: GameState; events: GameEvent[] }, where: string) {
  expectRunnerEventsClean(r.events, where, r.state);
  expectRunnerViewClean(r.state, where);
  liveness(r.state);
}

// ---- SEA Source -------------------------------------------------------------------------------

/**
 * The Runner's turn: `run` = what he does (a successful Archives run, a jack-out, nothing), then the
 * Corp's turn with SEA Source at hand index 0 and `corpCredits`.
 */
function seaTurn(run: 'success' | 'jack_out' | 'none', corpCredits = 5, spec: BoardSpec = {}): GameState {
  let s = board({ corpHand: ['c22', 'c01'], corpDeck: ['c03', 'c03', 'c03'], servers: { archives: { ice: ['+c04'] } }, ...spec }, 77, CORE);
  if (run === 'success') s = act(s, { type: 'run', player: 'runner', server: 'hq' }).state; // HQ has no ICE: straight in
  if (run === 'jack_out') {
    // Break nothing at Wall of Static... no breaker: let it fire (ends the run, unsuccessful).
    s = act(act(s, { type: 'run', player: 'runner', server: 'archives' }).state, runnerPass).state;
  }
  while (s.phase === 'run') s = act(s, runnerPass).state; // leave accessed cards
  s = finishTurn(s).state;
  expect(s.activePlayer).toBe('corp');
  return withPlayer(s, 'corp', { credits: corpCredits });
}

describe('S-09-4 AC2: SEA Source after a successful run last turn starts a Trace 3 in the Corp’s turn', () => {
  it('playable (cost 2); the Corp bids, then the Runner; the Runner is tagged; back to the Corp’s turn', () => {
    const s = seaTurn('success');
    expect(s.lastSuccessfulRunTurn).toBe(s.turn - 1);
    expect(handOptions(s, 'corp')[0]).toEqual([{ action: playSea, cost: 2, reject: null }]);
    const r = act(s, playSea);
    expect(r.events).toEqual([
      { type: 'credits_spent', player: 'corp', amount: 2 },
      { type: 'card_played', player: 'corp', cardId: 'c22', handIndex: 0 },
      { type: 'trace_started', cardId: 'c22', base: 3, link: 1 },
      { type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId: 'c22' },
    ]);
    expect(r.state.choice).toMatchObject({ kind: 'trace_corp', resume: 'action', cardId: 'c22' });
    expect(viewFor('corp', r.state).choice!.trace).toMatchObject({ base: 3, corpMaxBid: 3, link: 1 });
    clean(r, 'SEA played');
    // Corp bids 1 (strength 4): the phone goes to the Runner (needed 3 of his 5).
    const c = act(r.state, bid('corp', 1));
    expect(waitingOn(c.state)).toBe('runner');
    expect(hasMeaningfulResponse(c.state, 'runner')).toBe(true);
    expect(viewFor('runner', c.state).choice).toMatchObject({ kind: 'trace_runner', cardId: 'c22', trace: { strength: 4, needed: 3 } });
    clean(c, 'SEA Corp bid');
    // Runner bids 2 (total 3 < 4): tagged; back to the Corp's action phase (2 clicks left).
    const d = act(c.state, bid('runner', 2));
    expect(d.events).toEqual([
      { type: 'choice_closed', kind: 'trace_runner', skipped: false },
      { type: 'credits_spent', player: 'runner', amount: 2 },
      { type: 'trace_bid', player: 'runner', credits: 2, total: 3 },
      { type: 'trace_resolved', cardId: 'c22', strength: 4, total: 3, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
    ]);
    expect(d.state).toMatchObject({ phase: 'action', activePlayer: 'corp', choice: null, run: null });
    expect(d.state.players.corp).toMatchObject({ clicks: 2, credits: 2 });
    expect(waitingOn(d.state)).toBe('corp');
    clean(d, 'SEA resolved');
  });

  it('a Corp left with 0 credits after paying bids 0 at once: straight to the Runner', () => {
    const r = act(seaTurn('success', 2), playSea);
    expect(types(r.events).slice(-3)).toEqual(['trace_started', 'trace_bid', 'choice_opened']);
    expect(r.events.at(-2)).toEqual({ type: 'trace_bid', player: 'corp', credits: 0, total: 3, auto: true });
    expect(r.state.choice).toMatchObject({ kind: 'trace_runner', resume: 'action' });
  });

  it('the Runner escapes with a tie: no tag, the Corp’s turn goes on', () => {
    const s = act(act(seaTurn('success'), playSea).state, bid('corp', 0)).state;
    const r = act(s, bid('runner', 2));
    expect(r.events).toContainEqual({ type: 'trace_resolved', cardId: 'c22', strength: 3, total: 3, success: false });
    expect(r.state.players.runner.tags).toBe(0);
    expect(r.state.phase).toBe('action');
  });

  it('a successful run that used Bank Job instead of access counts', () => {
    let s = board({ rig: ['r10'], corpHand: ['c22'], servers: { remote1: { content: ['c03'] } } }, 77, CORE);
    s = { ...s, rig: s.rig.map((c) => ({ ...c, hostedCredits: 8 })) };
    s = act(s, { type: 'run', player: 'runner', server: 'remote1' }).state;
    expect(s.run?.step).toBe('success');
    s = act(s, { type: 'activate', player: 'runner', uid: 'i1', ability: 0, amount: 8 }).state; // Sprint 10: the max
    expect(s.run).toBeNull();
    s = finishTurn(s).state;
    expect(rejection(apply(s, playSea).events)).toBeNull();
  });
});

describe('S-09-4 AC3: no successful run last turn: SEA Source is dimmed (condition_not_met)', () => {
  it('no run at all, or a run that the ICE ended', () => {
    for (const run of ['none', 'jack_out'] as const) {
      const s = seaTurn(run);
      expect(handOptions(s, 'corp')[0], run).toEqual([{ action: playSea, cost: 2, reject: 'condition_not_met' }]);
      expect(rejection(apply(s, playSea).events), run).toBe('condition_not_met');
    }
  });

  it('a successful run two turns ago does not count', () => {
    let s = seaTurn('success');
    s = finishTurn(finishTurn(s).state).state; // Corp ends, Runner does nothing, Corp again
    expect(s.activePlayer).toBe('corp');
    expect(handOptions(s, 'corp')[(s.players.corp.hand.indexOf('c22'))]![0]!.reject).toBe('condition_not_met');
  });
});

// ---- Ichi 1.0 ---------------------------------------------------------------------------------

/** The Runner encountering a face-up Ichi 1.0 alone on HQ; rig cards first (i1, i2, ...), Ichi after. */
function atIchi(rig: string[], spec: Omit<BoardSpec, 'servers' | 'rig'> = {}): { s: GameState; ichi: string } {
  const s = act(board({ ...spec, rig, servers: { hq: { ice: ['+c21'] } } }, 77, CORE), { type: 'run', player: 'runner', server: 'hq' }).state;
  expect(s.run?.step).toBe('encounter');
  return { s, ichi: `i${rig.length + 1}` };
}

describe('S-09-4 AC1: Ichi 1.0 — two "Trash 1 program" (Corp picks; Sacrificial Construct may save), then Trace 1', () => {
  it('two programs + Construct: pick → save → pick again (no save left) → Trace 1 → tag and brain damage', () => {
    const { s, ichi } = atIchi(['r04', 'r05', 'r12'], { corpCredits: 4, runnerCredits: 2, runnerHand: ['r01', 'r03', 'r14'] });
    expect(viewFor('runner', s).run!.letFire).toEqual({ iceCardId: 'c21', outcomes: [], ends: null });
    const a = act(s, runnerPass);
    expect(a.events).toEqual([
      { type: 'subroutine_fired', iceUid: ichi, sub: 0 },
      { type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId: 'c21' },
    ]);
    const b = act(a.state, choose('corp', 'i1'));
    expect(b.events.at(-1)).toEqual({ type: 'choice_opened', kind: 'prevent_trash', player: 'runner', cardId: 'c21', target: 'i1' });
    const c = act(b.state, choose('runner', 'i3'));
    expect(c.events).toEqual([
      { type: 'choice_closed', kind: 'prevent_trash', skipped: false },
      { type: 'rig_card_trashed', uid: 'i3', cardId: 'r12' },
      { type: 'trash_prevented', uid: 'i1', cardId: 'r04', byUid: 'i3', byCardId: 'r12' },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 0, op: 'trash_installed', amount: 0 } },
      { type: 'subroutine_fired', iceUid: ichi, sub: 1 },
      { type: 'choice_opened', kind: 'trash_target', player: 'corp', cardId: 'c21' },
    ]);
    clean(c, 'Ichi saved');
    const d = act(c.state, choose('corp', 'i2'));
    expect(d.events).toEqual([
      { type: 'choice_closed', kind: 'trash_target', skipped: false },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r05' },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 1, op: 'trash_installed', amount: 1 } },
      { type: 'subroutine_fired', iceUid: ichi, sub: 2 },
      { type: 'trace_started', cardId: 'c21', base: 1, link: 1 },
      { type: 'choice_opened', kind: 'trace_corp', player: 'corp', cardId: 'c21' },
    ]);
    expect(d.state.choice).toMatchObject({ kind: 'trace_corp', resume: 'run' });
    expect(d.state.run).toMatchObject({ firing: 2, step: 'encounter' });
    clean(d, 'Ichi trace');
    // Corp bids 3 (strength 4): the Runner (link 1, 2 credits) cannot reach 4: not asked.
    const e = act(d.state, bid('corp', 3));
    expect(types(e.events)).toEqual([
      'choice_closed', 'credits_spent', 'trace_bid', 'trace_bid', 'trace_resolved', 'tags_changed', 'brain_damage', 'subroutine_resolved', 'ice_passed',
    ]);
    expect(e.events[4]).toEqual({ type: 'trace_resolved', cardId: 'c21', strength: 4, total: 1, success: true });
    expect(e.events[6]).toMatchObject({ type: 'brain_damage', amount: 1, maxHandSize: 4 });
    expect(e.events[7]).toEqual({ type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 2, op: 'trace', amount: 1 } });
    expect(e.state.players.runner).toMatchObject({ tags: 1, brainDamage: 1 });
    expect(e.state.rig.map((x) => x.cardId)).toEqual(['r04']);
    expect(e.state.run?.step).toBe('continue');
    clean(e, 'Ichi done');
  });

  it('two programs, no Construct: the first pick trashes; the second "Trash 1 program" takes the last one without asking', () => {
    const { s, ichi } = atIchi(['r04', 'r05'], { corpCredits: 0, runnerCredits: 0 });
    const a = act(act(s, runnerPass).state, choose('corp', 'i2'));
    expect(a.events).toEqual([
      { type: 'choice_closed', kind: 'trash_target', skipped: false },
      { type: 'rig_card_trashed', uid: 'i2', cardId: 'r05' },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 0, op: 'trash_installed', amount: 1 } },
      { type: 'subroutine_fired', iceUid: ichi, sub: 1 },
      { type: 'rig_card_trashed', uid: 'i1', cardId: 'r04' },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 1, op: 'trash_installed', amount: 1 } },
      { type: 'subroutine_fired', iceUid: ichi, sub: 2 },
      { type: 'trace_started', cardId: 'c21', base: 1, link: 1 },
      // Corp 0 credits: Trace 1 vs link 1 cannot succeed; nobody is asked.
      { type: 'trace_bid', player: 'corp', credits: 0, total: 1, auto: true },
      { type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true },
      { type: 'trace_resolved', cardId: 'c21', strength: 1, total: 1, success: false },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 2, op: 'trace', amount: 0 } },
      { type: 'ice_passed', uid: ichi },
    ]);
    expect(a.state.rig).toEqual([]);
  });

  it('no programs: both trash subroutines do nothing; the preview shows the whole ICE when no bid can matter', () => {
    const { s } = atIchi(['r18'], { corpCredits: 0 });
    // Link 2 vs Trace 1 with no Corp credits: fails; the preview is complete.
    expect(viewFor('runner', s).run!.letFire!.outcomes).toEqual([
      { sub: 0, op: 'trash_installed', amount: 0 },
      { sub: 1, op: 'trash_installed', amount: 0 },
      { sub: 2, op: 'trace', amount: 0 },
    ]);
  });

  it('brain damage flatline order: trace_resolved, tags_changed, brain_damage, subroutine_resolved, run_ended, game_over', () => {
    // Trace 1 vs Kate's link 1 needs a Corp bid: 1 credit makes it 2; the broke Runner cannot answer.
    const { s, ichi } = atIchi([], { corpCredits: 1, runnerCredits: 0, runnerHand: [] });
    const r = act(act(s, runnerPass).state, bid('corp', 1));
    expect(r.events.slice(-6)).toEqual([
      { type: 'trace_resolved', cardId: 'c21', strength: 2, total: 1, success: true },
      { type: 'tags_changed', amount: 1, tags: 1 },
      { type: 'brain_damage', amount: 1, cardIds: [], maxHandSize: 4 },
      { type: 'subroutine_resolved', iceUid: ichi, cardId: 'c21', outcome: { sub: 2, op: 'trace', amount: 1 } },
      { type: 'run_ended', server: 'hq', outcome: 'flatline' },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
  });
});
