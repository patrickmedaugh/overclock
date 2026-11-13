// Every game word shown on screen, in one table (owner decision 2026-11-12:
// the real game's words). test/terms.test.ts checks each one against
// docs/GLOSSARY.md, so the screen and the glossary say the same thing.
// Display names only: server numbering and ids come from the engine.
import type { ServerId, Side } from '@overclock/engine';

export const TERMS = {
  corp: 'Corp',
  runner: 'Runner',
  hq: 'HQ',
  rd: 'R&D',
  archives: 'Archives',
  /** Remote servers show as "Server 1", "Server 2", ... */
  remote: 'Server',
  newServer: 'New server',
  ice: 'ICE',
  grip: 'Grip',
  stack: 'Stack',
  heap: 'Heap',
  memory: 'Memory',
  credits: 'Credits',
  clicks: 'Clicks',
  install: 'Install',
  play: 'Play',
  endTurn: 'End turn',
  handLimit: 'Hand limit',
  // Sprint 3: runs, advancing and scoring.
  run: 'Run',
  jackOut: 'Jack out',
  rez: 'Rez',
  subroutine: 'Subroutine',
  icebreaker: 'Icebreaker',
  strength: 'Strength',
  break: 'Break',
  access: 'Access',
  steal: 'Steal',
  trash: 'Trash',
  advance: 'Advance',
  score: 'Score',
  netDamage: 'Net damage',
  flatline: 'Flatline',
  // Sprint 4: "when scored" bonuses.
  badPublicity: 'Bad publicity',
  forThisRun: 'for this run',
  skip: 'Skip',
} as const;

/** The Corp's black mark: "Bad publicity 2". */
export function badPublicityText(n: number): string {
  return `${TERMS.badPublicity} ${n}`;
}

/** The Runner's run-only credits: "+2 for this run". */
export function tempCreditsText(n: number): string {
  return `+${n} ${TERMS.forThisRun}`;
}

export const SIDE_NAME: Record<Side, string> = { corp: TERMS.corp, runner: TERMS.runner };

/** "HQ", "R&D", "Archives", "Server 1", ... */
export function serverLabel(id: ServerId | 'new'): string {
  switch (id) {
    case 'new':
      return TERMS.newServer;
    case 'hq':
      return TERMS.hq;
    case 'rd':
      return TERMS.rd;
    case 'archives':
      return TERMS.archives;
    default:
      return `${TERMS.remote} ${id.slice('remote'.length)}`;
  }
}

/** The side's hand, deck and discard pile in the real game's words. */
export function zoneName(side: Side, zone: 'hand' | 'deck' | 'discard'): string {
  if (side === 'corp') return zone === 'hand' ? TERMS.hq : zone === 'deck' ? TERMS.rd : TERMS.archives;
  return zone === 'hand' ? TERMS.grip : zone === 'deck' ? TERMS.stack : TERMS.heap;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Corp 1 point", "Runner 2 points". */
export function pointsText(side: Side, points: number): string {
  return `${SIDE_NAME[side]} ${plural(points, 'point', 'points')}`;
}

/** "free", "1 credit", "3 credits". */
export function priceText(cost: number): string {
  return cost === 0 ? 'free' : plural(cost, 'credit', 'credits');
}
