// Hidden-information checks shared by the property tests: what the Runner may
// learn about Corp cards. A Corp card id may appear in the Runner's view only
// where the card is face up or being accessed, and in its events only in
// events that reveal a card publicly (played, rezzed, accessed, stolen,
// trashed, scored).
import { expect } from 'vitest';
import { viewEvents, viewFor, type GameEvent, type GameState } from '../src/index';

const CORP_ID = /"c\d\d"/;

/** Event types that may name a Corp card in the Runner's projection. */
const REVEALING: ReadonlySet<GameEvent['type']> = new Set([
  'card_played',
  'ice_rezzed',
  'card_accessed',
  'agenda_stolen',
  'card_trashed',
  'agenda_scored',
  // Sprint 4: names the agenda just scored (face up in the score area).
  'choice_opened',
]);

/** Sprint 8: uids of Corp cards that went face up to Archives in this batch, with their ids. */
function trashedFaceUp(events: readonly GameEvent[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of events) if (e.type === 'corp_card_trashed') out.set(e.uid, e.cardId);
  return out;
}

/**
 * The Runner's projection of `events` names Corp cards only in revealing events, and those match the state.
 * `after` = the state the events led to.
 */
export function expectRunnerEventsClean(events: readonly GameEvent[], where: string, after: GameState): void {
  const trashed = trashedFaceUp(events);
  const archivesUp = after.players.corp.discard.filter((d) => d.faceUp).map((d) => d.cardId);
  for (const e of viewEvents('runner', events)) {
    if (REVEALING.has(e.type)) continue;
    // Sprint 8 (spec change): a face-up Corp card trashed to Archives (Adonis Campaign emptied) is public.
    if (e.type === 'corp_card_trashed') {
      expect(archivesUp, `${where}: corp_card_trashed ${e.cardId} face up in Archives`).toContain(e.cardId);
      continue;
    }
    // Sprint 8 (spec change): the Corp's identity is a public card; its own trigger may name it.
    if (e.type === 'ability_triggered' && e.uid === 'id:corp') {
      expect(e.cardId, `${where}: Corp identity trigger`).toBe(after.players.corp.identity);
      continue;
    }
    if (e.type === 'card_rezzed' || e.type === 'ability_triggered') {
      // Sprint 7 (spec change): may name a Corp card only once it is face up: the uid is an
      // installed Corp card with that id, rezzed, after the action. Otherwise (a rig card) no Corp id.
      const corp = after.servers.flatMap((sv) => [...sv.ice, ...sv.content]).find((c) => c.uid === e.uid);
      if (corp) expect(corp.rezzed && corp.cardId === e.cardId, `${where}: ${e.type} names face-up ${e.uid}`).toBe(true);
      else if (trashed.has(e.uid)) expect(trashed.get(e.uid), `${where}: ${e.type} names ${e.uid}, trashed face up`).toBe(e.cardId);
      else expect(JSON.stringify(e), where).not.toMatch(CORP_ID);
      continue;
    }
    if (e.type === 'trace_started' || e.type === 'trace_resolved') {
      // Sprint 9 (spec change): names the card that started the trace: the rezzed ICE (in a run) or the
      // played operation, face up in Archives (SEA Source).
      const ice = after.servers.flatMap((sv) => sv.ice).find((c) => c.rezzed && c.cardId === e.cardId);
      expect(ice !== undefined || archivesUp.includes(e.cardId), `${where}: ${e.type} names face-up ${e.cardId}`).toBe(true);
      continue;
    }
    if (e.type === 'subroutine_resolved') {
      // Sprint 5 (spec change): names the ICE whose subroutine fired; it must be installed and rezzed (face up).
      const ice = after.servers.flatMap((sv) => sv.ice).find((c) => c.uid === e.iceUid);
      expect(ice?.rezzed && ice.cardId === e.cardId, `${where}: subroutine_resolved names rezzed ICE ${e.iceUid}`).toBe(true);
      expect(JSON.stringify(e.outcome), where).not.toMatch(CORP_ID);
      continue;
    }
    expect(JSON.stringify(e), where).not.toMatch(CORP_ID);
  }
}

/** The Runner's view names Corp cards only where they are face up / accessed (checked against the full state). */
export function expectRunnerViewClean(s: GameState, where: string): void {
  const v = viewFor('runner', s);
  // Archives: face-up entries only.
  expect(v.players.corp.discard, where).toEqual(s.players.corp.discard.map((d) => (d.faceUp ? d.cardId : null)));
  // Score areas are face up.
  expect(v.players.corp.scored, where).toEqual(s.players.corp.scoreArea);
  expect(v.players.runner.scored, where).toEqual(s.players.runner.scoreArea);
  // Sprint 8 (spec change): identities are public cards.
  expect(v.players.corp.identity?.cardId ?? null, where).toBe(s.players.corp.identity);
  // Installed Corp cards: an id only when rezzed.
  const installed = s.servers.flatMap((sv) => [...sv.ice, ...sv.content]);
  for (const c of v.corpServers.flatMap((sv) => [...sv.ice, ...sv.content])) {
    const real = installed.find((x) => x.uid === c.uid)!;
    expect(c.cardId, where).toBe(real.rezzed ? real.cardId : null);
  }
  // The run: the current ICE only once rezzed; access cards exactly the ones being accessed.
  if (v.run) {
    const real = s.run!;
    const ice = s.servers.find((sv) => sv.id === real.server)!.ice[real.position];
    if (v.run.ice) expect(v.run.ice.cardId, where).toBe(ice && ice.rezzed ? ice.cardId : null);
    // Sprint 5 (spec change): the let-it-fire preview names only the encountered ICE, which is rezzed.
    if (v.run.letFire) expect(ice?.rezzed === true && v.run.letFire.iceCardId === ice.cardId, `${where}: letFire names rezzed ICE`).toBe(true);
    expect(v.run.access?.cards.map((c) => c.cardId) ?? null, where).toEqual(real.access?.cards.map((c) => c.cardId) ?? null);
  }
  // Sprint 5 (spec change): Last run = exactly the cards the most recent run accessed, only between runs.
  const last = !s.run && s.lastRun && s.lastRun.cards.length > 0 ? s.lastRun : null;
  expect(v.lastRun, where).toEqual(last);
  // Sprint 7: the Runner's installed-card options are for its own rig cards only (never a Corp uid).
  const rigUids = new Set(s.rig.map((c) => c.uid));
  for (const uid of Object.keys(v.installedOptions)) expect(rigUids.has(uid), `${where}: Runner option on ${uid}`).toBe(true);
  // An open choice names the agenda that opened it, which is face up in the score area; Sprint 8
  // (spec change): an in-run choice names the rezzed ICE whose subroutine opened it.
  if (v.choice) {
    const ice = s.run ? s.servers.find((sv) => sv.id === s.run!.server)?.ice[s.run.position] : undefined;
    // Sprint 9 (spec change): a trace from an operation (SEA Source) names it; it lies face up in Archives.
    const played = s.run === null && s.players.corp.discard.at(-1)?.faceUp === true && s.players.corp.discard.at(-1)?.cardId === v.choice.cardId;
    const ok = s.players.corp.scoreArea.includes(v.choice.cardId) || (ice?.rezzed === true && ice.cardId === v.choice.cardId) || played;
    expect(ok, `${where}: choice names ${v.choice.cardId}`).toBe(true);
  }
  // Nothing else names a Corp card.
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
  expect(JSON.stringify(rest), where).not.toMatch(CORP_ID);
}
