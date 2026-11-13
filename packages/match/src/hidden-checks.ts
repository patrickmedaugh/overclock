/**
 * Sprint 6 (test-only, exported from `@overclock/match/testing`): what the Runner may
 * learn about Corp cards, as pure functions returning a list of problems (empty =
 * clean). Same rules as `packages/engine/test/hidden.ts` (the engine's own property
 * tests), without a test-runner dependency so the server's leak test and Node-side
 * e2e code can use them on what was actually sent to the Runner.
 *
 * A Corp card id may appear in the Runner's view only where the card is face up or
 * being accessed, and in its events only in events that reveal a card publicly.
 */
import { viewFor, type GameEvent, type GameState, type PlayerView } from '@overclock/engine';

const CORP_ID = /"c\d\d"/;

/** Event types that may name a Corp card in the Runner's projection. */
const REVEALING: ReadonlySet<GameEvent['type']> = new Set([
  'card_played',
  'ice_rezzed',
  'card_accessed',
  'agenda_stolen',
  'card_trashed',
  'agenda_scored',
  'choice_opened',
]);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Problems with `events` as sent to the Runner (already `viewEvents('runner', …)`-projected).
 * `after` = the full state the events led to.
 */
export function runnerEventLeaks(events: readonly GameEvent[], after: GameState): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (REVEALING.has(e.type)) continue;
    if (e.type === 'subroutine_resolved') {
      const ice = after.servers.flatMap((sv) => sv.ice).find((c) => c.uid === e.iceUid);
      if (!(ice?.rezzed && ice.cardId === e.cardId)) out.push(`subroutine_resolved names ${e.cardId}, not rezzed ICE ${e.iceUid}`);
      if (CORP_ID.test(JSON.stringify(e.outcome))) out.push(`subroutine_resolved outcome names a Corp card: ${JSON.stringify(e)}`);
      continue;
    }
    if (CORP_ID.test(JSON.stringify(e))) out.push(`event names a Corp card: ${JSON.stringify(e)}`);
  }
  return out;
}

/** Problems with `v` as the Runner's view of the full state `s` (defaults to `viewFor('runner', s)`). */
export function runnerViewLeaks(s: GameState, v: PlayerView = viewFor('runner', s)): string[] {
  const out: string[] = [];
  const check = (ok: boolean, what: string) => {
    if (!ok) out.push(what);
  };
  check(v.viewer === 'runner', 'view is not the Runner view');
  check(same(v.players.corp.hand, null), 'Corp hand visible');
  check(same(v.players.corp.discard, s.players.corp.discard.map((d) => (d.faceUp ? d.cardId : null))), 'Archives: a face-down card is named');
  check(same(v.players.corp.scored, s.players.corp.scoreArea), 'Corp score area differs');
  check(same(v.players.runner.scored, s.players.runner.scoreArea), 'Runner score area differs');
  const installed = s.servers.flatMap((sv) => [...sv.ice, ...sv.content]);
  for (const c of v.corpServers.flatMap((sv) => [...sv.ice, ...sv.content])) {
    const real = installed.find((x) => x.uid === c.uid);
    check(real !== undefined && c.cardId === (real.rezzed ? real.cardId : null), `installed ${c.uid}: card id shown while face down`);
  }
  if (v.run) {
    const real = s.run;
    const ice = real ? s.servers.find((sv) => sv.id === real.server)?.ice[real.position] : undefined;
    if (v.run.ice) check(v.run.ice.cardId === (ice && ice.rezzed ? ice.cardId : null), 'run ICE named while face down');
    if (v.run.letFire) check(ice?.rezzed === true && v.run.letFire.iceCardId === ice.cardId, 'letFire names face-down ICE');
    check(same(v.run.access?.cards.map((c) => c.cardId) ?? null, real?.access?.cards.map((c) => c.cardId) ?? null), 'access cards differ');
  }
  const last = !s.run && s.lastRun && s.lastRun.cards.length > 0 ? s.lastRun : null;
  check(same(v.lastRun, last), 'lastRun differs from the recorded accesses');
  if (v.choice) check(s.players.corp.scoreArea.includes(v.choice.cardId), 'choice names a card not in the score area');
  const rest = {
    ...v,
    players: {
      corp: { ...v.players.corp, discard: [], scored: [] },
      runner: { ...v.players.runner, scored: [] },
    },
    corpServers: v.corpServers.map((sv) => ({
      ...sv,
      ice: sv.ice.filter((c) => !c.faceUp),
      content: sv.content.filter((c) => !c.faceUp),
    })),
    run: v.run ? { ...v.run, ice: null, access: null, letFire: v.run.letFire ? { ...v.run.letFire, iceCardId: '' } : null } : null,
    choice: v.choice ? { ...v.choice, cardId: '' } : null,
    lastRun: null,
  };
  if (CORP_ID.test(JSON.stringify(rest))) out.push(`view names a Corp card elsewhere: ${JSON.stringify(rest).match(CORP_ID)?.[0]}`);
  return out;
}
