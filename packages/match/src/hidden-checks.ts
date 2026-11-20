/**
 * Sprint 6 (test-only, exported from `@overclock/match/testing`): what the Runner may
 * learn about Corp cards, as pure functions returning a list of problems (empty =
 * clean). Same rules as `packages/engine/test/hidden.ts` (the engine's own property
 * tests), without a test-runner dependency so the server's leak test and Node-side
 * e2e code can use them on what was actually sent to the Runner.
 *
 * A Corp card id may appear in the Runner's view only where the card is face up or
 * being accessed, and in its events only in events that reveal a card publicly.
 * Sprint 12: `card_exposed` (the exposed card), `card_returned_to_hand` (only a face-up pick),
 * Accelerated Beta Test's `looked` cards (count only).
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
  // Sprint 8 (spec change): a face-up Corp card trashed to Archives in this batch (Adonis Campaign emptied) is public.
  const trashed = new Map<string, string>();
  for (const e of events) if (e.type === 'corp_card_trashed') trashed.set(e.uid, e.cardId);
  const archivesUp = after.players.corp.discard.filter((d) => d.faceUp).map((d) => d.cardId);
  for (const e of events) {
    if (REVEALING.has(e.type)) continue;
    if (e.type === 'corp_card_trashed') {
      if (!archivesUp.includes(e.cardId)) out.push(`corp_card_trashed names ${e.cardId}, not face up in Archives`);
      continue;
    }
    // Sprint 8 (spec change): the Corp's identity is a public card; its own trigger may name it.
    if (e.type === 'ability_triggered' && e.uid === 'id:corp') {
      if (e.cardId !== after.players.corp.identity) out.push(`ability_triggered names ${e.cardId}, not the Corp identity`);
      continue;
    }
    if (e.type === 'ability_triggered' && e.uid.startsWith('score:corp:')) {
      // Sprint 9 (spec change): a scored agenda's ability (Private Security Force) names that face-up agenda.
      if (after.players.corp.scoreArea[Number(e.uid.split(':')[2])] !== e.cardId) out.push(`ability_triggered names ${e.cardId}, not the scored agenda ${e.uid}`);
      continue;
    }
    if (e.type === 'card_rezzed' || e.type === 'ability_triggered') {
      // Sprint 7: may name a Corp card only once it is face up (installed, rezzed, same id).
      const corp = after.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((c) => c.uid === e.uid);
      if (corp && !(corp.rezzed && corp.cardId === e.cardId)) out.push(`${e.type} names ${e.cardId}, not face-up ${e.uid}`);
      if (!corp && trashed.has(e.uid)) {
        if (trashed.get(e.uid) !== e.cardId) out.push(`${e.type} names ${e.cardId}, not the card trashed from ${e.uid}`);
      } else if (!corp && CORP_ID.test(JSON.stringify(e))) out.push(`${e.type} names a Corp card not installed: ${JSON.stringify(e)}`);
      continue;
    }
    if (e.type === 'trace_started' || e.type === 'trace_resolved') {
      // Sprint 9 (spec change): names the rezzed ICE (in a run) or the played operation, face up in Archives.
      const ice = after.servers.flatMap((sv) => sv.ice).find((c) => c.rezzed && c.cardId === e.cardId);
      if (!ice && !archivesUp.includes(e.cardId)) out.push(`${e.type} names ${e.cardId}, neither rezzed ICE nor face up in Archives`);
      continue;
    }
    if (e.type === 'subroutine_resolved') {
      const ice = after.servers.flatMap((sv) => sv.ice).find((c) => c.uid === e.iceUid);
      if (!(ice?.rezzed && ice.cardId === e.cardId)) out.push(`subroutine_resolved names ${e.cardId}, not rezzed ICE ${e.iceUid}`);
      if (CORP_ID.test(JSON.stringify(e.outcome))) out.push(`subroutine_resolved outcome names a Corp card: ${JSON.stringify(e)}`);
      continue;
    }
    if (e.type === 'card_exposed') {
      // Sprint 12 (Infiltration): names the installed Corp card at `uid` (public; it stays face down).
      const c = after.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((x) => x.uid === e.uid);
      if (c?.cardId !== e.cardId) out.push(`card_exposed names ${e.cardId}, not the card at ${e.uid}`);
      continue;
    }
    if (e.type === 'card_returned_to_hand') {
      // Sprint 12 (Archived Memories): the id only for a card that lay face up in Archives.
      if (e.cardId !== undefined && !e.faceUp) out.push(`card_returned_to_hand names face-down ${e.cardId}`);
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
  // Sprint 8 (spec change): identities are public cards.
  check(same(v.players.corp.identity?.cardId ?? null, s.players.corp.identity), 'Corp identity differs');
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
  if (v.choice) {
    // Sprint 8 (spec change): an in-run choice names the rezzed ICE whose subroutine opened it.
    const ice = s.run ? s.servers.find((sv) => sv.id === s.run!.server)?.ice[s.run.position] : undefined;
    // Sprint 9 (spec change): a trace from an operation (SEA Source) names it; it lies face up on top of Archives.
    const top = s.players.corp.discard.at(-1);
    const played = s.run === null && top?.faceUp === true && top.cardId === v.choice.cardId;
    const ok = s.players.corp.scoreArea.includes(v.choice.cardId) || (ice?.rezzed === true && ice.cardId === v.choice.cardId) || played;
    check(ok, 'choice names a card neither in the score area, the rezzed current ICE nor the operation just played');
  }
  // Sprint 12: the cards Accelerated Beta Test set aside are only counted for the Runner.
  if (v.choice?.looked) check(v.choice.looked.every((x) => x === null), 'looked-at cards named');
  // Sprint 7: installed-card options only for the Runner's own rig cards.
  const rigUids = new Set(s.rig.map((c) => c.uid));
  for (const uid of Object.keys(v.installedOptions)) check(rigUids.has(uid), `Runner option on non-rig card ${uid}`);
  const rest = {
    ...v,
    players: {
      corp: { ...v.players.corp, discard: [], scored: [], identity: null },
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

// ---- Sprint 14: the Corp side (what the Corp may learn about Runner cards) ------------------

const RUNNER_ID_G = /"(r\d\d)"/g;

/** Runner card ids anywhere in `x` (as JSON strings). */
function runnerIdsIn(x: unknown): Set<string> {
  return new Set([...JSON.stringify(x).matchAll(RUNNER_ID_G)].map((m) => m[1]!));
}

/**
 * Sprint 14 (S-14-4 AC2): the Runner card ids the Corp must never see in `s`: ids held only in the
 * Stack or the Grip (not also face up in the rig, the Heap or as the identity). An own deck's
 * unusual cards are exactly these until they are played, installed or discarded.
 */
export function hiddenRunnerIds(s: GameState): Set<string> {
  const r = s.players.runner;
  const open = new Set<string>([...s.rig.map((c) => c.cardId), ...r.discard.map((d) => d.cardId)]);
  if (r.identity) open.add(r.identity);
  return new Set([...r.deck, ...r.hand].filter((id) => !open.has(id)));
}

/** Problems with `v` as the Corp's view of `s` (defaults to `viewFor('corp', s)`): no Grip, no Stack order, no hidden Runner card id. */
export function corpViewLeaks(s: GameState, v: PlayerView = viewFor('corp', s)): string[] {
  const out: string[] = [];
  if (v.viewer !== 'corp') out.push('view is not the Corp view');
  if (v.players.runner.hand !== null) out.push('Runner Grip visible');
  if (v.players.runner.handCount !== s.players.runner.hand.length) out.push('Runner Grip count differs');
  if (v.players.runner.deckCount !== s.players.runner.deck.length) out.push('Runner Stack count differs');
  if (!same(v.players.runner.discard, s.players.runner.discard.map((d) => d.cardId))) out.push('Heap differs (it is face up)');
  for (const id of runnerIdsIn(v)) if (hiddenRunnerIds(s).has(id)) out.push(`view names ${id}, held only in the Stack/Grip`);
  return out;
}

/**
 * Problems with `events` as sent to the Corp (already `viewEvents('corp', …)`-projected). `after` =
 * the full state the events led to: no event may name a card that is then only in the Stack/Grip
 * (a draw, a shuffle, a deck list).
 */
export function corpEventLeaks(events: readonly GameEvent[], after: GameState): string[] {
  const hidden = hiddenRunnerIds(after);
  const out: string[] = [];
  for (const e of events) for (const id of runnerIdsIn(e)) if (hidden.has(id)) out.push(`${e.type} names ${id}, held only in the Stack/Grip`);
  return out;
}
