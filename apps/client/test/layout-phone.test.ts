// Phone (held sideways) layout and installed-card slots, plus "desktop is
// unchanged" against a frozen snapshot of the Sprint 1 desktop layout.
import { describe, expect, it } from 'vitest';
import type { Box, Insets } from '../src/hook-types';
import {
  type BoardLayout,
  type InstalledSlot,
  FIT_ICE,
  MIN_TOUCH,
  computeLayout,
  handSlots,
  rigSlots,
  serverSlots,
} from '../src/layout';
import sprint1 from './fixtures/desktop-layout-sprint1.json';

const PHONES: [number, number][] = [
  [844, 390], // reference phone, sideways
  [640, 360], // small phone, sideways
  [667, 375], // older iPhone, sideways
  [932, 430], // large iPhone, sideways
  [740, 360], // tall-screen Android, sideways
];

const PHONE_INSETS: [string, Partial<Insets>][] = [
  ['none', {}],
  ['notch left 47', { left: 47 }],
  ['notch right 47', { right: 47 }],
  ['gesture bar 21', { bottom: 21 }],
  ['notch left 47 + bar 21', { left: 47, bottom: 21 }],
  ['notch right 47 + bar 21', { right: 47, bottom: 21 }],
];

const CASES = PHONES.flatMap(([w, h]) => PHONE_INSETS.map(([name, i]) => [w, h, name, i] as const));
/** The two sizes the plan pins floors for. */
const PINNED = CASES.filter(([w, h]) => (w === 844 && h === 390) || (w === 640 && h === 360));

function inside(b: Box, r: Box): boolean {
  const e = 0.001;
  return b.width > 0 && b.height > 0 && b.x >= r.x - e && b.y >= r.y - e && b.x + b.width <= r.x + r.width + e && b.y + b.height <= r.y + r.height + e;
}

function overlaps(a: Box, b: Box): boolean {
  const e = 0.001;
  return a.x + e < b.x + b.width && b.x + e < a.x + a.width && a.y + e < b.y + b.height && b.y + e < a.y + a.height;
}

function safeRect(w: number, h: number, i: Partial<Insets>): Box {
  const t = i.top ?? 0;
  const l = i.left ?? 0;
  return { x: l, y: t, width: w - l - (i.right ?? 0), height: h - t - (i.bottom ?? 0) };
}

function noOverlaps(named: [string, Box][]): void {
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [an, a] = named[i]!;
      const [bn, b] = named[j]!;
      expect(overlaps(a, b), `${an} ${JSON.stringify(a)} vs ${bn} ${JSON.stringify(b)}`).toBe(false);
    }
  }
}

/** Rail and strip elements (everything but installed cards). */
function chrome(l: BoardLayout): [string, Box][] {
  const out: [string, Box][] = [];
  for (const pos of ['top', 'bottom'] as const) {
    for (const k of ['label', 'credits', 'clicks', 'discard', 'deck'] as const) out.push([`${pos}.${k}`, l[pos][k]]);
  }
  out.push(['banner', l.banner], ['sub', l.sub], ['hintArea', l.hintArea], ['endTurn', l.endTurn], ['hand', l.handArea]);
  out.push(['zone.top', l.zones.top], ['zone.bottom', l.zones.bottom]);
  return out;
}

/** The busy board from S-02-5 / S-02-6, at the plan's fit target: HQ, R&D, Archives and 3 remotes, 2 ICE each, plus New server; 6 rig cards. */
const BUSY_SERVERS = [
  { ice: 2, root: 0 },
  { ice: 2, root: 0 },
  { ice: 2, root: 0 },
  { ice: 2, root: 1 },
  { ice: 2, root: 1 },
  { ice: 2, root: 1 },
];
const BUSY_RIG = 6;

/** Every installed slot (servers in one band, rig in the other), named. */
function busySlots(l: BoardLayout, corpPos: 'top' | 'bottom'): [string, InstalledSlot][] {
  const runnerPos = corpPos === 'top' ? 'bottom' : 'top';
  const row = serverSlots(l, corpPos, BUSY_SERVERS, true);
  const rig = rigSlots(l, runnerPos, BUSY_RIG);
  const out: [string, InstalledSlot][] = [];
  row.columns.forEach((c, i) => {
    c.root.forEach((s, k) => out.push([`server ${i} root ${k}`, s]));
    c.ice.forEach((s, k) => out.push([`server ${i} ice ${k}`, s]));
  });
  // The New server ghost and the Install spot are tap targets too.
  const ghost = row.newServer!;
  out.push(['new server', { box: ghost.rootSlot, hit: { ...ghost.column }, rotated: false }]);
  rig.cards.forEach((s, k) => out.push([`rig ${k}`, s]));
  out.push(['install spot', rig.install]);
  return out;
}

describe('phone layout (sideways)', () => {
  it.each(CASES)('%ix%i, insets %s: everything is inside the safe area and nothing overlaps', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    expect(l.mode).toBe('phone');
    const safe = safeRect(w, h, insets);
    expect(l.safe).toEqual(safe);
    const named = chrome(l);
    for (const [name, b] of [...named, ['gameOver', l.gameOver] as [string, Box], ['zoom', l.zoom] as [string, Box], ['rail', l.rail!] as [string, Box]]) {
      expect(inside(b, safe), `${name} ${JSON.stringify(b)} inside safe ${JSON.stringify(safe)}`).toBe(true);
    }
    noOverlaps(named);
  });

  it.each(CASES)('%ix%i, insets %s: rail on the right; opponent band, viewer band, hand strip from the top', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    const rail = l.rail!;
    // The rail holds both sides' piles and counters, the banner, help, hint and End turn.
    for (const b of [l.top.deck, l.top.discard, l.top.credits, l.top.clicks, l.top.label, l.bottom.deck, l.bottom.credits, l.banner, l.sub, l.hintArea, l.endTurn]) {
      expect(inside(b, rail)).toBe(true);
    }
    // Opponent's block on top, then banner, help, hint, End turn, viewer's block at the bottom.
    expect(l.top.deck.y + l.top.deck.height).toBeLessThanOrEqual(l.banner.y);
    expect(l.banner.y + l.banner.height).toBeLessThanOrEqual(l.sub.y);
    expect(l.sub.y + l.sub.height).toBeLessThanOrEqual(l.hintArea.y);
    expect(l.hintArea.y + l.hintArea.height).toBeLessThanOrEqual(l.endTurn.y);
    expect(l.endTurn.y + l.endTurn.height).toBeLessThanOrEqual(l.bottom.label.y);
    // Main area left of the rail.
    for (const b of [l.zones.top, l.zones.bottom, l.handArea]) expect(b.x + b.width).toBeLessThanOrEqual(rail.x);
    expect(l.zones.top.y + l.zones.top.height).toBeLessThanOrEqual(l.zones.bottom.y);
    expect(l.zones.bottom.y + l.zones.bottom.height).toBeLessThanOrEqual(l.handArea.y);
    // Rows are the bands (the board tints them per side).
    expect(l.top.row).toEqual(l.zones.top);
    expect(l.bottom.row).toEqual(l.zones.bottom);
  });

  it.each(CASES)('%ix%i, insets %s: buttons, piles and hand cards are at least 44px', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    for (const [name, b] of [
      ['End turn', l.endTurn],
      ['viewer deck', l.bottom.deck],
      ['viewer discard', l.bottom.discard],
      ['viewer credits', l.bottom.credits],
      ['opponent deck', l.top.deck],
      ['opponent discard', l.top.discard],
      ['hand card', l.card],
    ] as [string, { width: number; height: number }][]) {
      expect(b.width, name).toBeGreaterThanOrEqual(MIN_TOUCH);
      expect(b.height, name).toBeGreaterThanOrEqual(MIN_TOUCH);
    }
  });

  it('floors for installed cards: 44 at 844x390, 36 at 640x360', () => {
    expect(computeLayout(844, 390, {}, 'phone').hitFloor).toBe(44);
    expect(computeLayout(640, 360, {}, 'phone').hitFloor).toBe(36);
  });

  for (const corpPos of ['top', 'bottom'] as const) {
    it.each(PINNED)(`%ix%i, insets %s, Corp ${corpPos}: the busy board fits, nothing overlaps, every card is big enough to tap`, (w, h, _n, insets) => {
      const l = computeLayout(w, h, insets, 'phone');
      const safe = safeRect(w, h, insets);
      const slots = busySlots(l, corpPos);
      expect(slots.length).toBe(6 * 2 + 3 + 1 + 6 + 1);
      const runnerPos = corpPos === 'top' ? 'bottom' : 'top';
      for (const [name, s] of slots) {
        const zone = name.startsWith('rig') || name === 'install spot' ? l.zones[runnerPos] : l.zones[corpPos];
        expect(inside(s.box, zone), `${name} drawn inside its band`).toBe(true);
        expect(inside(s.hit, zone), `${name} hit inside its band`).toBe(true);
        expect(inside(s.hit, safe), `${name} inside the safe area`).toBe(true);
        expect(inside(s.box, s.hit), `${name} drawn card inside its hit box`).toBe(true);
        expect(s.hit.width, `${name} hit width`).toBeGreaterThanOrEqual(l.hitFloor);
        expect(s.hit.height, `${name} hit height`).toBeGreaterThanOrEqual(l.hitFloor);
      }
      // Hit boxes never overlap each other (they may extend into gaps), nor the rail / hand.
      noOverlaps(slots.map(([n, s]) => [n, s.hit]));
      noOverlaps(slots.map(([n, s]) => [n, s.box]));
      const others: [string, Box][] = chrome(l).filter(([n]) => !n.startsWith('zone.'));
      for (const [n, s] of slots) for (const [on, o] of others) expect(overlaps(s.hit, o), `${n} vs ${on}`).toBe(false);
      // Full size at the fit target: ICE drawn sideways at the installed size, no shrinking.
      const row = serverSlots(l, corpPos, BUSY_SERVERS, true);
      for (const c of row.columns) {
        for (const ice of c.ice) {
          expect(ice.rotated).toBe(true);
          expect(ice.box.width).toBeCloseTo(l.installed.height, 5);
          expect(ice.box.height).toBeCloseTo(l.installed.width, 5);
        }
      }
    });
  }

  it.each(CASES)('%ix%i, insets %s: ICE stacks toward the opponent, outermost farthest from the root', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    for (const pos of ['top', 'bottom'] as const) {
      const c = serverSlots(l, pos, [{ ice: 3, root: 1 }], false).columns[0]!;
      const root = c.root[0]!.box;
      const ys = c.ice.map((s) => s.box.y);
      if (pos === 'bottom') {
        // Viewer's servers: ICE above the root, each one higher (toward the top band).
        expect(ys[0]! + c.ice[0]!.box.height).toBeLessThanOrEqual(root.y);
        for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeLessThan(ys[i - 1]!);
        expect(c.label.y).toBeGreaterThanOrEqual(root.y + root.height);
      } else {
        expect(ys[0]!).toBeGreaterThanOrEqual(root.y + root.height);
        for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
        expect(c.label.y + c.label.height).toBeLessThanOrEqual(root.y);
      }
    }
  });

  it.each(CASES)('%ix%i, insets %s: past the fit target cards shrink but stay inside and apart', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    const many = Array.from({ length: 10 }, () => ({ ice: 4, root: 2 }));
    const row = serverSlots(l, 'top', many, true);
    const all = row.columns.flatMap((c) => [...c.root, ...c.ice]);
    for (const s of all) {
      expect(inside(s.box, l.zones.top)).toBe(true);
      expect(inside(s.hit, l.zones.top)).toBe(true);
    }
    noOverlaps(all.map((s, i) => [`slot ${i}`, s.hit]));
    expect(all[0]!.box.width).toBeLessThan(l.installed.width + 0.001);
    const rig = rigSlots(l, 'bottom', 12);
    for (const s of [...rig.cards, rig.install]) expect(inside(s.hit, l.zones.bottom)).toBe(true);
    noOverlaps([...rig.cards, rig.install].map((s, i) => [`rig ${i}`, s.hit]));
  });

  it.each(CASES)('%ix%i, insets %s: the hand strip shows cards side by side, then overlaps keeping 44px visible', (w, h, _n, insets) => {
    const l = computeLayout(w, h, insets, 'phone');
    const fit44 = 1 + Math.floor((l.handArea.width - l.card.width) / MIN_TOUCH);
    // Sprint 1 turns reach 9 cards (6 + 3 draws).
    expect(fit44).toBeGreaterThanOrEqual(9);
    for (let n = 1; n <= 15; n++) {
      const slots = handSlots(l, n);
      expect(slots).toHaveLength(n);
      for (const s of slots) expect(inside(s, l.handArea)).toBe(true);
      expect(new Set(slots.map((s) => s.y)).size).toBe(1);
      for (let i = 1; i < n; i++) {
        const step = slots[i]!.x - slots[i - 1]!.x;
        if (n <= fit44) expect(step).toBeGreaterThanOrEqual(MIN_TOUCH - 0.001);
        else expect(step).toBeGreaterThan(0);
      }
    }
  });

  it('notch on the left or right: nothing needed sits under it', () => {
    for (const [w, h] of PHONES) {
      const left = computeLayout(w, h, { left: 47 }, 'phone');
      const right = computeLayout(w, h, { right: 47 }, 'phone');
      for (const [, b] of chrome(left)) expect(b.x).toBeGreaterThanOrEqual(47);
      for (const [, b] of chrome(right)) expect(b.x + b.width).toBeLessThanOrEqual(w - 47);
    }
  });

  it('zoomed card is much larger than a hand card and fits the height', () => {
    for (const [w, h] of PHONES) {
      const l = computeLayout(w, h, {}, 'phone');
      expect(l.zoom.width).toBeGreaterThan(l.card.width * 2.5);
      expect(l.zoom.height).toBeLessThanOrEqual(l.safe.height);
    }
  });

  it(`a server's two ICE cells each get at least the hit floor (FIT_ICE = ${FIT_ICE})`, () => {
    for (const [w, h, , insets] of PINNED) {
      const l = computeLayout(w, h, insets, 'phone');
      const c = serverSlots(l, 'bottom', [{ ice: FIT_ICE, root: 1 }], false).columns[0]!;
      for (const s of c.ice) expect(s.hit.height).toBeGreaterThanOrEqual(l.hitFloor);
    }
  });
});

describe('desktop layout', () => {
  type Entry = { w: number; h: number; insets: Partial<Insets>; layout: Record<string, unknown> };
  it.each((sprint1 as Entry[]).map((e) => [e.w, e.h, JSON.stringify(e.insets), e] as const))(
    '%ix%i, insets %s: every Sprint 1 box is unchanged',
    (w, h, _i, e) => {
      const l = computeLayout(w, h, e.insets);
      expect(l.mode).toBe('desktop');
      expect(l.rail).toBeNull();
      expect(l).toMatchObject(e.layout);
    },
  );

  it('the installed-card zones sit in the center band between the help line and the action bar', () => {
    for (const [w, h] of [[1280, 800], [1920, 1080], [1024, 700]] as const) {
      const l = computeLayout(w, h);
      for (const z of [l.zones.top, l.zones.bottom]) {
        expect(inside(z, l.center)).toBe(true);
        expect(z.y).toBeGreaterThanOrEqual(l.sub.y + l.sub.height);
        expect(z.y + z.height).toBeLessThanOrEqual(l.endTurn.y);
      }
      expect(l.zones.top.y + l.zones.top.height).toBeLessThanOrEqual(l.zones.bottom.y);
      // The busy board still fits there (cards shrink, nothing overlaps).
      const slots = busySlots(l, 'top');
      for (const [n, s] of slots) expect(inside(s.hit, n.startsWith('rig') || n === 'install spot' ? l.zones.bottom : l.zones.top), n).toBe(true);
      noOverlaps(slots.map(([n, s]) => [n, s.hit]));
    }
  });
});
