// Every game word the board shows, in one table (S-02-5: the real game's
// words, the same everywhere). Each term must appear in docs/GLOSSARY.md
// (test/terms.test.ts checks it).
import type { CardType, Side } from '@overclock/cards';

export const SIDE_LABEL: Record<Side, string> = { corp: 'Corp', runner: 'Runner' };

/** Card type lines on card faces (shown in capitals). */
export const TYPE_LABEL: Record<CardType, string> = {
  event: 'EVENT',
  program: 'PROGRAM',
  hardware: 'HARDWARE',
  resource: 'RESOURCE',
  agenda: 'AGENDA',
  asset: 'ASSET',
  upgrade: 'UPGRADE',
  operation: 'OPERATION',
  ice: 'ICE',
};

export const TERMS = {
  ice: 'ICE',
  hq: 'HQ',
  rd: 'R&D',
  archives: 'Archives',
  /** A remote server's name: `${remote} 1`. */
  remote: 'Server',
  newServer: 'New server',
  stack: 'Stack',
  heap: 'Heap',
  grip: 'Grip',
  memory: 'Memory',
  install: 'Install',
  play: 'Play',
  credits: 'Credits',
  clicks: 'Clicks',
} as const;

/** "HQ", "R&D", "Archives", "Server 1", ... for a server id; "New server" for 'new'. */
export function serverLabel(id: string): string {
  if (id === 'hq') return TERMS.hq;
  if (id === 'rd') return TERMS.rd;
  if (id === 'archives') return TERMS.archives;
  if (id === 'new') return TERMS.newServer;
  const n = /^remote(\d+)$/.exec(id);
  return n ? `${TERMS.remote} ${n[1]}` : id;
}

/** The Corp's or the Runner's name for its deck / discard pile. */
export function pileLabel(side: Side, pile: 'deck' | 'discard'): string {
  if (side === 'corp') return pile === 'deck' ? TERMS.rd : TERMS.archives;
  return pile === 'deck' ? TERMS.stack : TERMS.heap;
}

/** "free", "1 credit", "3 credits". */
export function priceText(cost: number): string {
  if (cost === 0) return 'free';
  return `${cost} ${cost === 1 ? 'credit' : 'credits'}`;
}

/** "Memory 2/4". */
export function memoryText(used: number, limit: number): string {
  return `${TERMS.memory} ${used}/${limit}`;
}
