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

/** The Runner's projection of `events` names Corp cards only in revealing events, and those match the state. */
export function expectRunnerEventsClean(events: readonly GameEvent[], where: string): void {
  for (const e of viewEvents('runner', events)) {
    if (REVEALING.has(e.type)) continue;
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
    expect(v.run.access?.cards.map((c) => c.cardId) ?? null, where).toEqual(real.access?.cards.map((c) => c.cardId) ?? null);
  }
  // An open choice names the agenda that opened it, which is face up in the score area.
  if (v.choice) expect(s.players.corp.scoreArea, where).toContain(v.choice.cardId);
  // Nothing else names a Corp card.
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
    run: v.run ? { ...v.run, ice: null, access: null } : null,
    choice: v.choice ? { ...v.choice, cardId: '' } : null,
  };
  expect(JSON.stringify(rest), where).not.toMatch(CORP_ID);
}
