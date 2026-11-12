// U2 / S-02-5 / S-02-6: the busy board (3 remote servers with 2 ICE each, 4
// Runner cards) fits sideways phones and a desktop window: everything inside
// the safe area (notch on either side, swipe bar), nothing overlapping, every
// target at least 44x44. Both seats, since the board is viewer-relative.
import type { Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import type { Box, Insets } from '../src/hook-types';
import {
  type BoardLayout,
  type ServerShape,
  FIT_COLUMNS,
  MIN_TOUCH,
  computeLayout,
  corpColumns,
  handSlots,
  isLandscape,
  runnerRig,
} from '../src/layout';

const SIZES: [string, number, number][] = [
  ['phone 844x390', 844, 390],
  ['small phone 640x360', 640, 360],
  ['desktop 1280x800', 1280, 800],
];

const INSETS: [string, Insets][] = [
  ['no insets', { top: 0, right: 0, bottom: 0, left: 0 }],
  ['notch left 47', { top: 0, right: 0, bottom: 0, left: 47 }],
  ['notch right 47', { top: 0, right: 47, bottom: 0, left: 0 }],
  ['swipe bar 21', { top: 0, right: 0, bottom: 21, left: 0 }],
  ['notch left 47 + swipe bar 21', { top: 0, right: 0, bottom: 21, left: 47 }],
  ['iPhone sideways 47/47/21', { top: 0, right: 47, bottom: 21, left: 47 }],
];

const VIEWERS: Side[] = ['corp', 'runner'];

const CASES = SIZES.flatMap(([n, w, h]) =>
  INSETS.flatMap(([i, ins]) => VIEWERS.map((v) => [n, i, v, w, h, ins] as const)),
);

const BUSY: ServerShape[] = [
  { id: 'hq', ice: 0, content: 0 },
  { id: 'rd', ice: 0, content: 0 },
  { id: 'archives', ice: 0, content: 0 },
  { id: 'remote1', ice: 2, content: 1 },
  { id: 'remote2', ice: 2, content: 1 },
  { id: 'remote3', ice: 2, content: 1 },
];
const BUSY_RIG = 4;

function inside(b: Box, r: Box): boolean {
  const e = 0.001;
  return b.width > 0 && b.height > 0 && b.x >= r.x - e && b.y >= r.y - e && b.x + b.width <= r.x + r.width + e && b.y + b.height <= r.y + r.height + e;
}

function overlaps(a: Box, b: Box): boolean {
  const e = 0.001;
  return a.x + e < b.x + b.width && b.x + e < a.x + a.width && a.y + e < b.y + b.height && b.y + e < a.y + a.height;
}

function safeRect(w: number, h: number, i: Insets): Box {
  return { x: i.left, y: i.top, width: w - i.left - i.right, height: h - i.top - i.bottom };
}

interface Board {
  /** Every separately drawn element; no two may overlap. */
  leaves: [string, Box][];
  /** Everything you can tap or hold on the busy board. */
  targets: [string, Box][];
}

function busyBoard(l: BoardLayout, handCount: number): Board {
  const leaves: [string, Box][] = [];
  const targets: [string, Box][] = [];
  for (const pos of ['top', 'bottom'] as const) {
    const r = l[pos];
    leaves.push([`${pos}.label`, r.label], [`${pos}.credits`, r.credits], [`${pos}.clicks`, r.clicks]);
    targets.push([`${pos}.credits`, r.credits]);
    leaves.push([`${pos}.deck`, r.deck], [`${pos}.discard`, r.discard]);
    targets.push([`${pos}.deck`, r.deck], [`${pos}.discard`, r.discard]);
  }
  leaves.push(['banner', l.banner], ['sub', l.sub], ['endTurn', l.endTurn]);
  targets.push(['endTurn', l.endTurn]);
  if (l.mode === 'column') leaves.push(['hintArea', l.hintArea]);

  const cols = corpColumns(l, BUSY);
  for (const c of cols) {
    targets.push([`${c.id} column`, c.column]);
    leaves.push([`${c.id} label`, c.label]);
    const pile = l.centralPiles && (c.id === 'rd' || c.id === 'archives');
    if (!pile && c.id !== 'hq') leaves.push([`${c.id} root`, c.root]);
    c.content.forEach((x, k) => {
      targets.push([`${c.id} content ${k}`, x.hit]);
      expect(inside(x.hit, c.root), `${c.id} content ${k} in its root cell`).toBe(true);
    });
    c.ice.forEach((x, k) => {
      leaves.push([`${c.id} ICE ${k}`, x.hit]);
      targets.push([`${c.id} ICE ${k}`, x.hit]);
    });
  }
  const rig = runnerRig(l, BUSY_RIG);
  leaves.push(['memory', rig.memory], ['install', rig.install]);
  targets.push(['install', rig.install]);
  if (rig.pileLabels) leaves.push(['stack label', rig.pileLabels.deck], ['heap label', rig.pileLabels.discard]);
  rig.cards.forEach((c, k) => {
    leaves.push([`rig ${k}`, c.hit]);
    targets.push([`rig ${k}`, c.hit]);
  });
  handSlots(l, handCount).forEach((h, k) => {
    leaves.push([`hand ${k}`, h]);
    targets.push([`hand ${k}`, h]);
  });
  return { leaves, targets };
}

describe('landscape mode', () => {
  it('sideways phones use it; desktop windows and upright phones keep the column', () => {
    expect(isLandscape(844, 390)).toBe(true);
    expect(isLandscape(640, 360)).toBe(true);
    expect(isLandscape(1280, 800)).toBe(false);
    expect(isLandscape(390, 844)).toBe(false);
    expect(computeLayout(844, 390).mode).toBe('landscape');
    expect(computeLayout(1280, 800).mode).toBe('column');
  });
});

describe.each(CASES)('busy board, %s, %s, %s at the bottom', (_n, _i, viewer, w, h, insets) => {
  const l = computeLayout(w, h, insets, viewer);
  const safe = safeRect(w, h, insets);

  it('everything is inside the safe area', () => {
    const { leaves } = busyBoard(l, 5);
    const all: [string, Box][] = [...leaves, ['hintArea', l.hintArea], ['gameOver', l.gameOver], ['zoom', l.zoom], ['handArea', l.handArea]];
    for (const c of corpColumns(l, BUSY)) all.push([`${c.id} column`, c.column]);
    for (const [name, b] of all) expect(inside(b, safe), `${name} ${JSON.stringify(b)} inside ${JSON.stringify(safe)}`).toBe(true);
  });

  it('nothing overlaps (with 5 and with 9 cards in hand)', () => {
    for (const n of [5, 9]) {
      const { leaves } = busyBoard(l, n);
      for (let a = 0; a < leaves.length; a++) {
        for (let b = a + 1; b < leaves.length; b++) {
          const [an, ab] = leaves[a]!;
          const [bn, bb] = leaves[b]!;
          if (an.startsWith('hand ') && bn.startsWith('hand ')) continue; // checked below
          expect(overlaps(ab, bb), `${an} ${JSON.stringify(ab)} vs ${bn} ${JSON.stringify(bb)}`).toBe(false);
        }
      }
    }
    // Server columns side by side, never overlapping.
    const cols = corpColumns(l, BUSY);
    expect(cols).toHaveLength(FIT_COLUMNS);
    for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) expect(overlaps(cols[a]!.column, cols[b]!.column)).toBe(false);
  });

  it('every target is at least 44x44 (hand cards: 44px of each showing)', () => {
    const { targets } = busyBoard(l, 9);
    for (const [name, b] of targets) {
      if (name.startsWith('hand ')) continue;
      expect(b.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(b.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
    const hand = handSlots(l, 9);
    expect(hand[0]!.height).toBeGreaterThanOrEqual(MIN_TOUCH);
    for (let k = 1; k < hand.length; k++) {
      const a = hand[k - 1]!;
      const b = hand[k]!;
      if (a.y === b.y) expect(b.x - a.x).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
    }
  });

  it('ICE stacks outward, toward the Runner', () => {
    for (const c of corpColumns(l, BUSY).filter((x) => x.ice.length === 2)) {
      const inner = c.ice[0]!;
      const outer = c.ice[1]!;
      if (viewer === 'corp') {
        // Corp at the bottom: the Runner is above, so ICE climbs up from the root.
        expect(outer.hit.y).toBeLessThan(inner.hit.y);
        expect(inner.hit.y + inner.hit.height).toBeLessThanOrEqual(c.root.y);
      } else {
        expect(outer.hit.y).toBeGreaterThan(inner.hit.y);
        expect(inner.hit.y).toBeGreaterThanOrEqual(c.root.y + c.root.height);
      }
    }
  });

  if (l.mode === 'landscape') {
    it('the R&D and Archives columns hold the Corp deck and discard pile', () => {
      const cols = corpColumns(l, BUSY);
      const corp = viewer === 'corp' ? l.bottom : l.top;
      expect(inside(corp.deck, cols[1]!.root)).toBe(true);
      expect(inside(corp.discard, cols[2]!.root)).toBe(true);
    });

    it('the opponent is on top, the viewer below, the hand at the bottom, the rail on the right', () => {
      expect(l.zones.top.y + l.zones.top.height).toBeLessThanOrEqual(l.zones.bottom.y);
      expect(l.zones.bottom.y + l.zones.bottom.height).toBeLessThanOrEqual(l.handArea.y);
      expect(l.rail).not.toBeNull();
      expect(l.handArea.x + l.handArea.width).toBeLessThanOrEqual(l.rail!.x);
      expect(l.bottom.credits.y).toBeGreaterThan(l.top.credits.y);
    });
  }
});

describe('overflow beyond the busy board shrinks (never scrolls)', () => {
  for (const [w, h] of [
    [844, 390],
    [640, 360],
  ] as const) {
    it(`${w}x${h}: 6 remotes narrow the remote columns and stay inside the band`, () => {
      const l = computeLayout(w, h, {}, 'runner');
      const servers: ServerShape[] = [...BUSY, ...[4, 5, 6].map((n) => ({ id: `remote${n}`, ice: 1, content: 1 }))];
      const cols = corpColumns(l, servers);
      const band = l.zones.top;
      for (const c of cols) expect(inside(c.column, band)).toBe(true);
      for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) expect(overlaps(cols[a]!.column, cols[b]!.column)).toBe(false);
      // Centrals (and the piles in them) never move.
      expect(cols[1]!.column).toEqual(corpColumns(l, BUSY)[1]!.column);
    });

    it(`${w}x${h}: 5 ICE on one server overlap inside the band`, () => {
      const l = computeLayout(w, h, {}, 'corp');
      const cols = corpColumns(l, [...BUSY.slice(0, 3), { id: 'remote1', ice: 5, content: 1 }]);
      const r1 = cols[3]!;
      expect(r1.ice).toHaveLength(5);
      for (const x of r1.ice) expect(inside(x.hit, l.zones.bottom)).toBe(true);
      for (let a = 1; a < 5; a++) expect(r1.ice[a]!.hit.y).toBeLessThan(r1.ice[a - 1]!.hit.y);
    });

    it(`${w}x${h}: 10 rig cards overlap and leave the Install spot inside the band`, () => {
      const l = computeLayout(w, h, {}, 'runner');
      const rig = runnerRig(l, 10);
      for (const c of rig.cards) expect(inside(c.hit, l.zones.bottom)).toBe(true);
      expect(inside(rig.install, l.zones.bottom)).toBe(true);
      for (const c of rig.cards) expect(overlaps(c.hit, rig.install)).toBe(false);
    });
  }
});
