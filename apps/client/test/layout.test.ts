import type { Side } from '@overclock/engine';
import { describe, expect, it } from 'vitest';
import type { Box, Insets } from '../src/hook-types';
import { type BoardLayout, type BoardShape, EMPTY_SHAPE, MIN_TOUCH, computeLayout, handSlots } from '../src/layout';

/** S-02-5: 3 remotes with 2 ICE each (plus an asset/agenda), ICE on the centrals too, 4 Runner installs. */
const BUSY: BoardShape = {
  servers: [
    { id: 'hq', ice: 2, content: 0 },
    { id: 'rd', ice: 2, content: 0 },
    { id: 'archives', ice: 1, content: 0 },
    { id: 'remote1', ice: 2, content: 1 },
    { id: 'remote2', ice: 2, content: 1 },
    { id: 'remote3', ice: 2, content: 1 },
  ],
  rig: 4,
};

/** Past the busy board: more servers, ICE and installs than the room kept for them. */
const OVERFLOW: BoardShape = {
  servers: [
    { id: 'hq', ice: 3, content: 1 },
    { id: 'rd', ice: 2, content: 0 },
    { id: 'archives', ice: 0, content: 0 },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `remote${n}` as const, ice: n === 2 ? 5 : 2, content: n === 4 ? 2 : 1 })),
  ],
  rig: 9,
};

/** Sideways phones (the Definition of Done sizes) and desktop. */
const MAIN: [number, number][] = [
  [844, 390],
  [640, 360],
  [1280, 800],
];

const INSETS: [string, Insets][] = [
  ['none', { top: 0, right: 0, bottom: 0, left: 0 }],
  ['notch left 47', { top: 0, right: 0, bottom: 0, left: 47 }],
  ['notch right 47', { top: 0, right: 47, bottom: 0, left: 0 }],
  ['bottom bar 21', { top: 0, right: 0, bottom: 21, left: 0 }],
  ['notch left 47 + bottom bar 21', { top: 0, right: 0, bottom: 21, left: 47 }],
];

const SIDES: Side[] = ['corp', 'runner'];

/** Other shapes that must still fit cleanly (sizes may drop under 44px on narrow portrait). */
const OTHER: [number, number][] = [
  [390, 844], // upright phone (shows the rotate prompt, still laid out)
  [360, 640],
  [768, 1024], // tablet portrait
  [1024, 768], // tablet landscape (taller than 500: column layout)
  [1920, 1080],
  [568, 320], // tiny sideways phone
  [932, 430], // large sideways phone
];

const MAIN_CASES = MAIN.flatMap(([w, h]) => INSETS.flatMap(([name, i]) => SIDES.map((v) => [w, h, name, v, i] as const)));
const OTHER_CASES = OTHER.flatMap(([w, h]) => SIDES.map((v) => [w, h, v] as const));

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

/** Every drawn element that must not overlap another (server columns are containers, checked apart). */
function elements(l: BoardLayout): [string, Box][] {
  const out: [string, Box][] = [];
  for (const pos of ['top', 'bottom'] as const) {
    for (const k of ['label', 'credits', 'clicks'] as const) out.push([`${pos}.${k}`, l[pos][k]]);
  }
  for (const s of l.corp.servers) {
    out.push([`${s.id}.label`, s.label]);
    if (s.root) out.push([`${s.id}.root`, s.root]);
    s.content.forEach((b, i) => out.push([`${s.id}.content${i}`, b]));
    s.ice.forEach((b, i) => out.push([`${s.id}.ice${i}`, b]));
  }
  out.push(['newServer.label', l.corp.newServer.label]);
  out.push(['rig.stack', l.rig.stack], ['rig.heap', l.rig.heap], ['rig.install', l.rig.install], ['rig.memory', l.rig.memory]);
  l.rig.cards.forEach((b, i) => out.push([`rig.card${i}`, b]));
  out.push(['banner', l.banner], ['sub', l.sub], ['hintArea', l.hintArea], ['endTurn', l.endTurn], ['hand', l.handArea]);
  return out;
}

function expectClean(l: BoardLayout, w: number, h: number, insets: Insets): void {
  const safe = safeRect(w, h, insets);
  expect(l.safe).toEqual(safe);
  const columns: [string, Box][] = [...l.corp.servers, l.corp.newServer].map((s) => [`${s.id}.column`, s.column]);
  const all = [...elements(l), ...columns, ['gameOver', l.gameOver] as [string, Box], ['zoom', l.zoom] as [string, Box], ['action', l.action] as [string, Box]];
  for (const [name, b] of all) expect(inside(b, safe), `${name} ${JSON.stringify(b)} inside safe ${JSON.stringify(safe)}`).toBe(true);
  const flat = elements(l);
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const [an, a] = flat[i]!;
      const [bn, b] = flat[j]!;
      expect(overlaps(a, b), `${an} ${JSON.stringify(a)} vs ${bn} ${JSON.stringify(b)}`).toBe(false);
    }
  }
  // Columns never overlap each other, the rig band or anything outside the Corp band.
  for (let i = 0; i < columns.length; i++) {
    for (let j = i + 1; j < columns.length; j++) expect(overlaps(columns[i]![1], columns[j]![1]), `${columns[i]![0]} vs ${columns[j]![0]}`).toBe(false);
    expect(inside(columns[i]![1], l.corp.band)).toBe(true);
  }
  expect(overlaps(l.corp.band, l.rig.band), 'corp band vs rig band').toBe(false);
  for (const [n, b] of [['hand', l.handArea], ['endTurn', l.endTurn], ['banner', l.banner], ['hint', l.hintArea]] as const) {
    expect(overlaps(l.corp.band, b), `corp band vs ${n}`).toBe(false);
  }
  // The Play button sits inside the help area (it replaces the help text while shown).
  expect(inside(l.action, l.sub)).toBe(true);
  // Each server's cards sit in its column.
  for (const s of [...l.corp.servers, l.corp.newServer]) {
    for (const b of [s.label, ...(s.root ? [s.root] : []), ...s.content, ...s.ice]) expect(inside(b, s.column), `${s.id} slot in its column`).toBe(true);
  }
}

/** Every tap target of the viewer, plus every card that can be held to zoom. */
function targets(l: BoardLayout): [string, Box][] {
  const out: [string, Box][] = [
    ['deck', l.bottom.deck],
    ['credits', l.bottom.credits],
    ['endTurn', l.endTurn],
    ['action', l.action],
    ['card', { x: 0, y: 0, ...l.card }],
    ['install', l.rig.install],
    ['newServer', l.corp.newServer.column],
    ['stack', l.rig.stack],
    ['heap', l.rig.heap],
  ];
  for (const s of l.corp.servers) {
    out.push([`${s.id}.column`, s.column]);
    if (s.root) out.push([`${s.id}.root`, s.root]);
    s.content.forEach((b, i) => out.push([`${s.id}.content${i}`, b]));
    s.ice.forEach((b, i) => out.push([`${s.id}.ice${i}`, b]));
  }
  l.rig.cards.forEach((b, i) => out.push([`rig${i}`, b]));
  return out;
}

describe('computeLayout: sideways phones and desktop (S-02-5, S-02-6)', () => {
  it.each(MAIN_CASES)('%ix%i, insets %s, %s viewing: empty and busy boards are inside the safe area, nothing overlaps', (w, h, _n, viewer, insets) => {
    expectClean(computeLayout(w, h, insets, { viewer }), w, h, insets);
    expectClean(computeLayout(w, h, insets, { viewer, shape: BUSY }), w, h, insets);
  });

  it.each(MAIN_CASES)('%ix%i, insets %s, %s viewing: every target and card on the busy board is at least 44x44', (w, h, _n, viewer, insets) => {
    const l = computeLayout(w, h, insets, { viewer, shape: BUSY });
    for (const [name, b] of targets(l)) {
      expect(b.width, `${name} width`).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(b.height, `${name} height`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
    // Hand: 10 cards still show 44px each.
    const slots = handSlots(l, 10);
    for (let i = 1; i < slots.length; i++) if (slots[i]!.y === slots[i - 1]!.y) expect(slots[i]!.x - slots[i - 1]!.x).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
  });

  it.each(MAIN_CASES)('%ix%i, insets %s, %s viewing: the opponent is on top, the viewer and the hand below', (w, h, _n, viewer, insets) => {
    const l = computeLayout(w, h, insets, { viewer, shape: BUSY });
    const corpTop = viewer === 'runner';
    const topBand = corpTop ? l.corp.band : l.rig.band;
    const bottomBand = corpTop ? l.rig.band : l.corp.band;
    expect(topBand.y + topBand.height).toBeLessThanOrEqual(bottomBand.y);
    expect(bottomBand.y + bottomBand.height).toBeLessThanOrEqual(l.handArea.y);
    expect(l.corp.outward).toBe(corpTop ? 'down' : 'up');
    // ICE stacks outward, toward the Runner: index 0 is next to the server's cards.
    for (const s of l.corp.servers.filter((x) => x.ice.length === 2)) {
      if (corpTop) expect(s.ice[1]!.y).toBeGreaterThan(s.ice[0]!.y);
      else expect(s.ice[1]!.y).toBeLessThan(s.ice[0]!.y);
    }
    // ICE is drawn sideways.
    for (const s of l.corp.servers) for (const b of s.ice) expect(b.width).toBeGreaterThan(b.height);
    // The deck and discard of each side are R&D / Archives and the Stack / Heap.
    const corpRow = viewer === 'corp' ? l.bottom : l.top;
    const runnerRow = viewer === 'corp' ? l.top : l.bottom;
    expect(corpRow.deck).toEqual(l.corp.servers[1]!.root);
    expect(corpRow.discard).toEqual(l.corp.servers[2]!.root);
    expect(runnerRow.deck).toEqual(l.rig.stack);
    expect(runnerRow.discard).toEqual(l.rig.heap);
  });

  it('phones use the sideways layout, desktop keeps the column', () => {
    expect(computeLayout(844, 390).mode).toBe('landscape');
    expect(computeLayout(640, 360).mode).toBe('landscape');
    expect(computeLayout(1280, 800).mode).toBe('portrait');
    expect(computeLayout(390, 844).mode).toBe('portrait');
  });

  it('sideways: the rail (banner, hint, End turn, your credits and clicks) is right of the board', () => {
    for (const [w, h] of [[844, 390], [640, 360]] as const) {
      const l = computeLayout(w, h, {}, { shape: BUSY });
      const boardRight = l.board.x + l.board.width;
      for (const b of [l.banner, l.sub, l.hintArea, l.endTurn, l.bottom.credits, l.bottom.clicks, l.bottom.label]) expect(b.x).toBeGreaterThanOrEqual(boardRight);
      expect(l.endTurn.y + l.endTurn.height).toBe(l.safe.y + l.safe.height - l.pad);
    }
  });

  it('a notch on either side moves everything out from under it', () => {
    const plain = computeLayout(844, 390, {}, { shape: BUSY });
    const left = computeLayout(844, 390, { left: 47 }, { shape: BUSY });
    const right = computeLayout(844, 390, { right: 47 }, { shape: BUSY });
    expect(left.corp.servers[0]!.column.x).toBeGreaterThanOrEqual(47);
    expect(plain.corp.servers[0]!.column.x).toBeLessThan(47);
    expect(right.endTurn.x + right.endTurn.width).toBeLessThanOrEqual(844 - 47);
  });

  it('cards keep their place and size as the board fills up to the busy board', () => {
    for (const [w, h] of MAIN) {
      const empty = computeLayout(w, h, {}, { shape: EMPTY_SHAPE });
      const busy = computeLayout(w, h, {}, { shape: BUSY });
      expect(busy.sizeKey).toBe(empty.sizeKey);
      expect(busy.unit).toEqual(empty.unit);
      expect(busy.corp.servers.slice(0, 3).map((s) => s.column)).toEqual(empty.corp.servers.map((s) => s.column));
    }
  });

  it('turning the board over (other viewer) keeps every size', () => {
    for (const [w, h] of MAIN) {
      const a = computeLayout(w, h, {}, { viewer: 'corp', shape: BUSY });
      const b = computeLayout(w, h, {}, { viewer: 'runner', shape: BUSY });
      expect(a.sizeKey).toBe(b.sizeKey);
    }
  });

  it.each(MAIN_CASES)('%ix%i, insets %s, %s viewing: past the busy board everything shrinks to fit (no scrolling)', (w, h, _n, viewer, insets) => {
    const busy = computeLayout(w, h, insets, { viewer, shape: BUSY });
    const l = computeLayout(w, h, insets, { viewer, shape: OVERFLOW });
    expectClean(l, w, h, insets);
    expect(l.unit.width).toBeLessThanOrEqual(busy.unit.width);
    expect(l.corp.servers).toHaveLength(9);
    expect(l.rig.cards).toHaveLength(9);
  });

  it('ignores junk inset values', () => {
    const l = computeLayout(844, 390, { top: Number.NaN, bottom: -5 });
    expect(l.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('the zoomed card is much larger than a hand card', () => {
    for (const [w, h] of [...MAIN, ...OTHER]) {
      const l = computeLayout(w, h);
      expect(l.zoom.width).toBeGreaterThan(l.card.width * 2.5);
    }
  });
});

describe('computeLayout: other screen shapes', () => {
  it.each(OTHER_CASES)('%ix%i, %s viewing: everything inside, nothing overlaps (empty, busy, past busy)', (w, h, viewer) => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const shape of [EMPTY_SHAPE, BUSY, OVERFLOW]) expectClean(computeLayout(w, h, none, { viewer, shape }), w, h, none);
  });

  it('desktop and tablets keep 44px targets on the busy board', () => {
    for (const [w, h] of [[1280, 800], [1920, 1080], [768, 1024], [1024, 768]] as const) {
      const l = computeLayout(w, h, {}, { shape: BUSY });
      for (const [name, b] of targets(l)) expect(Math.min(b.width, b.height), `${w}x${h} ${name}`).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it('portrait: opponent row, opponent band, controls, viewer band, viewer row, hand', () => {
    for (const viewer of SIDES) {
      const l = computeLayout(1280, 800, {}, { viewer, shape: BUSY });
      const corpTop = viewer === 'runner';
      const topBand = corpTop ? l.corp.band : l.rig.band;
      const bottomBand = corpTop ? l.rig.band : l.corp.band;
      expect(l.top.credits.y + l.top.credits.height).toBeLessThanOrEqual(topBand.y);
      expect(topBand.y + topBand.height).toBeLessThanOrEqual(l.banner.y);
      expect(l.endTurn.y + l.endTurn.height).toBeLessThanOrEqual(bottomBand.y);
      expect(bottomBand.y + bottomBand.height).toBeLessThanOrEqual(l.bottom.label.y);
      expect(l.bottom.credits.y + l.bottom.credits.height).toBeLessThanOrEqual(l.handArea.y);
    }
  });
});

describe('handSlots', () => {
  const ALL = [...MAIN_CASES.map(([w, h, , , i]) => [w, h, i] as const), ...OTHER.map(([w, h]) => [w, h, { top: 0, right: 0, bottom: 0, left: 0 }] as const)];

  it.each(ALL)('%ix%i %o: up to 15 cards stay inside the hand area; up to 10 show 44px each and never stack', (w, h, insets) => {
    const l = computeLayout(w, h, insets);
    for (let n = 1; n <= 15; n++) {
      const slots = handSlots(l, n);
      expect(slots).toHaveLength(n);
      for (const s of slots) expect(inside(s, l.handArea)).toBe(true);
      // Never two cards in the same place.
      expect(new Set(slots.map((s) => `${s.x},${s.y}`)).size).toBe(n);
      if (n <= 10 && l.mode === 'landscape') {
        for (let i = 1; i < n; i++) expect(slots[i]!.x - slots[i - 1]!.x).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
      }
    }
  });

  it.each(ALL)('%ix%i %o: up to 5 cards never overlap', (w, h, insets) => {
    const l = computeLayout(w, h, insets);
    for (let n = 1; n <= 5; n++) {
      const slots = handSlots(l, n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(overlaps(slots[i]!, slots[j]!)).toBe(false);
    }
  });
});
