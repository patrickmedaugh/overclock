// QA Sprint 9 (written by QA, not the developers): longer real play on the core decks from the
// planner's SPRINT9_GOALS, in pass-the-phone and online modes, through LocalMatch (both seats):
// - Hunter: the Corp bids so the Runner can just stop it, the Runner bids one short (tagged, 1 credit
//   left); then on his own turn Remove 1 tag is refused for credits, and later for clicks.
// - Private Security Force: three uses, a Runner turn, and the empty-Grip flatline on the next Corp turn;
//   and the "Runner isn't tagged" refusal after the Runner removed his tag.
// - Tags stay over several rounds.
// - A Runner with 0 credits: SEA Source's trace never waits on him (found by QA's own random play).
// Every update is checked for hidden-card leaks on the Runner seat, and both seats get the same events.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCard } from '@overclock/cards';
import { apply, legalActions, newGame, replay, viewFor, waitingOn, type Action, type GameEvent, type GameOptions, type GameState, type PlayerView, type Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import { LocalMatch, type MatchUpdate } from '../src/index';
import { planToStep, runnerEventLeaks, runnerViewLeaks, type StepGoal } from '../src/testing';

const MODES: [string, Partial<GameOptions>][] = [
  ['pass-the-phone', {}],
  ['online', { rezWindow: 'always' }],
];
const SEEDS = [3, 25, 60, 12345];

function setup(seed: number, goal: StepGoal, options: Partial<GameOptions>) {
  const plan = planToStep(seed, goal, 1500, options);
  const m = new LocalMatch(seed, { ...options, deckSet: plan.deckSet });
  for (const a of plan.actions) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
  return { m, info: plan.info as Record<string, string> };
}

function ok(m: LocalMatch, a: Action): MatchUpdate {
  const u = m.submit(a.player, a);
  expect(u[a.player].events.find((e) => e.type === 'action_rejected'), JSON.stringify(a)).toBeUndefined();
  const state = replay(m.seed, m.actions(), m.options).state;
  expect(runnerEventLeaks(u.runner.events, state)).toEqual([]);
  expect(runnerViewLeaks(state, u.runner.view)).toEqual([]);
  // The Sprint 9 events are public: both seats get them identically (draws/discards are private and may differ).
  const S9 = ['trace_started', 'trace_bid', 'trace_resolved', 'tags_changed', 'meat_damage', 'rig_card_trashed', 'choice_opened', 'choice_closed', 'game_over'];
  const pub = (events: GameEvent[]) => events.filter((e) => S9.includes(e.type));
  expect(pub(u.runner.events)).toEqual(pub(u.corp.events));
  for (const k of ['tags', 'link', 'credits', 'clicks', 'handCount'] as const) expect(u.corp.view.players.runner[k]).toEqual(u.runner.view.players.runner[k]);
  expect(u.corp.view.players.runner.discard).toEqual(u.runner.view.players.runner.discard);
  return u;
}

/** Ends the current player's turn with plain clicks (gain credit), discarding the first cards if asked. */
function endTurnPlain(m: LocalMatch): void {
  const side = m.view('corp').activePlayer;
  while (m.view(side).players[side].clicks > 0) ok(m, { type: 'gain_credit', player: side });
  ok(m, { type: 'end_turn', player: side });
  const v = m.view(side);
  if (v.pendingDiscard > 0) ok(m, { type: 'discard', player: side, handIndices: Array.from({ length: v.pendingDiscard }, (_, i) => i) });
}

const psfUse = (uid: string): Action => ({ type: 'activate', player: 'corp', uid, ability: 0 } as Action);

describe.each(MODES)('QA Sprint 9 real play (%s)', (_mode, options) => {
  it.each(SEEDS)('seed %i: Hunter — Corp bids so "spend N" equals the Runner\'s credits; he bids N−1 and is tagged; Remove 1 tag is refused for credits, then for clicks', (seed) => {
    const { m } = setup(seed, 'hunter_encounter', options);
    const runnerCredits = m.view('runner').players.runner.credits;
    const corpCredits = m.view('corp').players.corp.credits;
    ok(m, { type: 'pass', player: 'runner' });
    expect(m.view('corp').choice?.kind).toBe('trace_corp');
    const corpBid = Math.min(corpCredits, runnerCredits + 1 - 3);
    const u1 = ok(m, { type: 'trace_bid', player: 'corp', credits: corpBid });
    const t = u1.runner.view.choice!.trace!;
    expect(t).toMatchObject({ strength: 3 + corpBid, link: 1, needed: 2 + corpBid, runnerMaxBid: runnerCredits });
    expect(u1.corp.view.players.corp.credits).toBe(corpCredits - corpBid);
    const u2 = ok(m, { type: 'trace_bid', player: 'runner', credits: t.needed - 1 });
    expect(u2.runner.events).toContainEqual({ type: 'trace_resolved', cardId: 'c20', strength: 3 + corpBid, total: 1 + t.needed - 1, success: true });
    expect(u2.runner.view.players.runner.credits).toBe(runnerCredits - (t.needed - 1));
    expect(u2.corp.view.players.runner.tags).toBe(1);
    // Finish the run (no more decisions that matter: the Corp does not rez, the Runner goes on / jacks out / skips access).
    for (let k = 0; k < 20 && m.view('runner').run; k++) {
      const st = replay(m.seed, m.actions(), m.options).state;
      const who = waitingOn(st)!;
      const la = legalActions(st, who);
      const a = la.find((x) => x.type === 'jack_out') ?? la.find((x) => x.type === 'pass') ?? la.find((x) => x.type === 'choose') ?? la[0]!;
      ok(m, a);
    }
    const v = m.view('runner');
    expect(v.activePlayer).toBe('runner');
    expect(v.players.runner.tags).toBe(1);
    expect(v.players.runner.credits).toBe(1);
    expect(v.players.runner.clicks).toBeGreaterThan(0);
    expect(v.basicOptions).toEqual([{ action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject: 'no_credits' }]);
    while (m.view('runner').players.runner.clicks > 0) ok(m, { type: 'gain_credit', player: 'runner' });
    const tired = m.view('runner');
    expect(tired.players.runner.credits).toBeGreaterThanOrEqual(2);
    expect(tired.basicOptions).toEqual([{ action: { type: 'remove_tag', player: 'runner' }, cost: 2, clicks: 1, reject: 'no_clicks' }]);
    expect(m.submit('runner', { type: 'remove_tag', player: 'runner' }).runner.events).toContainEqual(expect.objectContaining({ type: 'action_rejected', reason: 'no_clicks' }));
  });

  it.each(SEEDS)('seed %i: PSF — 3 uses, a quiet Runner turn, then the Grip runs out: flatline, Corp wins', (seed) => {
    const { m, info } = setup(seed, 'psf_scored_tagged', options);
    const uid = info.uid!;
    let grip = Number(info.grip);
    expect(grip).toBe(5);
    for (let k = 0; k < 3; k++) {
      const u = ok(m, psfUse(uid));
      const md = u.corp.events.find((e) => e.type === 'meat_damage') as Extract<GameEvent, { type: 'meat_damage' }>;
      expect(md.cardIds).toHaveLength(1);
      expect(u.runner.view.players.runner.discard.at(-1)).toBe(md.cardIds[0]);
      expect(u.corp.view.players.runner.handCount).toBe(--grip);
    }
    expect(m.view('corp').installedOptions[uid]![0]!.reject).toBe('no_clicks');
    ok(m, { type: 'end_turn', player: 'corp' });
    if (m.view('corp').pendingDiscard > 0) ok(m, { type: 'discard', player: 'corp', handIndices: Array.from({ length: m.view('corp').pendingDiscard }, (_, i) => i) });
    // The Runner does nothing with his Grip and keeps his tag.
    endTurnPlain(m);
    expect(m.view('corp').activePlayer).toBe('corp');
    expect(m.view('corp').players.runner.tags).toBeGreaterThan(0);
    grip = m.view('corp').players.runner.handCount;
    expect(grip).toBe(2);
    let last: MatchUpdate | null = null;
    for (let k = 0; k <= grip; k++) last = ok(m, psfUse(uid));
    const ev = last!.runner.events;
    expect(ev.slice(-2)).toEqual([
      { type: 'meat_damage', amount: 1, cardIds: [] },
      { type: 'game_over', winner: 'corp', reason: 'flatline' },
    ]);
    for (const side of ['corp', 'runner'] as const) expect(last![side].view.result).toEqual({ winner: 'corp', reason: 'flatline' });
  });

  it.each(SEEDS)('seed %i: PSF — after the Runner removes his tag, the Corp\'s PSF is refused "condition_not_met"; tags stayed until then', (seed) => {
    const { m, info } = setup(seed, 'psf_scored_tagged', options);
    const uid = info.uid!;
    endTurnPlain(m); // Corp
    expect(m.view('runner').players.runner.tags).toBeGreaterThan(0);
    const tags = m.view('runner').players.runner.tags;
    for (let k = 0; k < tags; k++) {
      if (m.view('runner').players.runner.credits < 2) ok(m, { type: 'gain_credit', player: 'runner' });
      ok(m, { type: 'remove_tag', player: 'runner' });
    }
    expect(m.view('corp').players.runner.tags).toBe(0);
    endTurnPlain(m); // Runner
    const cv = m.view('corp');
    expect(cv.activePlayer).toBe('corp');
    expect(cv.installedOptions[uid]).toEqual([{ action: psfUse(uid), cost: 0, clicks: 1, reject: 'condition_not_met' }]);
    expect(m.submit('corp', psfUse(uid)).corp.events).toContainEqual(expect.objectContaining({ type: 'action_rejected', reason: 'condition_not_met' }));
  });

  it.each(SEEDS)('seed %i: tags stay over three rounds of plain turns', (seed) => {
    const { m, info } = setup(seed, 'runner_tagged_own_turn', options);
    const tags = Number(info.tags);
    for (let k = 0; k < 6; k++) {
      endTurnPlain(m);
      for (const side of ['corp', 'runner'] as const) expect(m.view(side).players.runner.tags).toBe(tags);
    }
  });
});

// ---- A Runner with 0 credits meets SEA Source (QA's own random play finds the board) ----

function prng(seed: number) {
  let x = (seed * 2246822519 + 3266489917) >>> 0 || 5;
  return (n: number) => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x % n;
  };
}
const W: Record<string, number> = { run: 14, rez: 14, install: 10, play: 12, advance: 8, score: 20, steal: 20, activate: 25, trash_resource: 25, remove_tag: 1, trace_bid: 5, choose: 5, end_turn: 1 };

/** QA's random play (core decks, pass-the-phone): the actions up to the Corp's action step with SEA Source playable, the Runner at 0 credits and the Corp at >= 3. */
function seaSourceRunnerBroke(seed: number): Action[] | null {
  const r = prng(seed);
  let s: GameState = newGame(seed, { deckSet: 'core' });
  const acts: Action[] = [];
  for (let step = 0; step < 900 && s.phase !== 'over'; step++) {
    const me = waitingOn(s);
    if (!me) return null;
    if (me === 'corp' && s.phase === 'action' && s.players.runner.credits === 0 && s.players.corp.credits >= 3) {
      const i = s.players.corp.hand.findIndex((id) => getCard(id)?.playIf === 'runner_successful_run_last_turn');
      if (i >= 0 && viewFor('corp', s).handOptions[i]!.some((o) => o.action.type === 'play' && o.reject === null)) return acts;
    }
    const legal = legalActions(s, me);
    const ws = legal.map((a) => W[a.type] ?? 3);
    let t = r(ws.reduce((x, y) => x + y, 0));
    let k = 0;
    while (t >= ws[k]!) t -= ws[k++]!;
    acts.push(legal[k]!);
    s = apply(s, legal[k]!).state;
  }
  return null;
}

/** The e2e (apps/client/e2e/qa-sprint09.spec.ts) replays this board from a JSON copy (the client may not run the engine). */
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../../../apps/client/e2e/qa-sprint09-sea-runner-broke.json');

describe('QA S-09-1 AC6: the Runner has 0 credits when SEA Source traces', () => {
  it('the e2e fixture is exactly QA\'s random play on seed 25 (UPDATE_FIXTURES=1 rewrites it)', () => {
    const acts = seaSourceRunnerBroke(25)!;
    if (process.env['UPDATE_FIXTURES'] === '1') writeFileSync(FIXTURE, `${JSON.stringify({ seed: 25, actions: acts })}\n`);
    expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual({ seed: 25, actions: acts });
  });

  it('seed 25 (QA random play): the Corp bids, the Runner is never asked (auto 0, no choice opened for him), tagged at once; the Corp\'s turn goes on', () => {
    const acts = seaSourceRunnerBroke(25)!;
    expect(acts).not.toBeNull();
    const m = new LocalMatch(25, { deckSet: 'core' });
    for (const a of acts) expect(m.submit(a.player, a)[a.player].events.some((e) => e.type === 'action_rejected')).toBe(false);
    const cv: PlayerView = m.view('corp');
    expect(cv.players.runner.credits).toBe(0);
    const i = cv.players.corp.hand!.findIndex((id) => id === 'c22');
    const play = ok(m, { type: 'play', player: 'corp', handIndex: i });
    expect(play.corp.view.choice?.kind).toBe('trace_corp');
    const u = ok(m, { type: 'trace_bid', player: 'corp', credits: 1 });
    expect(u.corp.events).toContainEqual({ type: 'trace_bid', player: 'runner', credits: 0, total: 1, auto: true });
    expect(u.corp.events.some((e) => e.type === 'choice_opened')).toBe(false);
    expect(u.corp.events).toContainEqual(expect.objectContaining({ type: 'trace_resolved', cardId: 'c22', strength: 4, total: 1, success: true }));
    expect(u.corp.view.choice).toBeNull();
    expect(u.corp.view.activePlayer).toBe('corp');
    expect(u.corp.view.phase).toBe('action');
    expect(u.runner.view.players.runner.tags).toBe(1);
    const side: Side = 'corp';
    expect(waitingOn(replay(25, m.actions(), m.options).state)).toBe(side);
  });
});
