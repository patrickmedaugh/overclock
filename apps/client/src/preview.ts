// Layout preview (`?preview=busy`): draws the S-02-5 busy board (HQ, R&D,
// Archives and three remotes with 2 ICE each, the New server spot, 6 rig
// cards and the Install spot) into the real layout slots, so a layout can be
// reviewed on screen before the board draws installed cards from the engine's
// view. Display only: it never touches the game, and no taps reach it.
import { getCard } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { Container, Graphics, Text } from 'pixi.js';
import { createCardBack, createCardFace } from './cardFace';
import type { Box } from './hook-types';
import { type BandPos, type BoardLayout, type InstalledSlot, rigSlots, serverSlots } from './layout';
import { sideColor, theme } from './theme';

export type PreviewKind = 'busy';

export function previewFromUrl(search: string): PreviewKind | null {
  return new URLSearchParams(search).get('preview') === 'busy' ? 'busy' : null;
}

const SERVERS = [
  { label: 'HQ', ice: 2, root: 0 },
  { label: 'R&D', ice: 2, root: 0 },
  { label: 'Archives', ice: 2, root: 0 },
  { label: 'Server 1', ice: 2, root: 1 },
  { label: 'Server 2', ice: 2, root: 1 },
  { label: 'Server 3', ice: 2, root: 1 },
];
/** Display-only sample rig (card ids from the starter pool). */
const RIG = ['r04', 'r05', 'r06', 'r08', 'r09', 'r10'];

function label(text: string, b: Box, color: number, out: Container): void {
  const t = new Text({
    text,
    style: { fontFamily: theme.monoFamily, fontSize: Math.max(7, b.height * 0.85), fontWeight: '700', fill: color, letterSpacing: 0.5 },
  });
  t.anchor.set(0.5, 0.5);
  t.position.set(b.x + b.width / 2, b.y + b.height / 2);
  if (t.width > b.width - 2) t.scale.set((b.width - 2) / t.width);
  out.addChild(t);
}

function ghost(b: Box, color: number, text: string, out: Container): void {
  const g = new Graphics();
  g.roundRect(b.x, b.y, b.width, b.height, Math.max(3, b.width * 0.08)).fill({ color: 0x000000, alpha: 0.3 }).stroke({ width: 1, color, alpha: 0.6 });
  out.addChild(g);
  label(text, { x: b.x, y: b.y + b.height / 2 - 6, width: b.width, height: 12 }, color, out);
}

function card(slot: InstalledSlot, make: (w: number, h: number) => Container, out: Container): void {
  const b = slot.box;
  // Cards are drawn upright; ICE is turned sideways.
  const w = slot.rotated ? b.height : b.width;
  const h = slot.rotated ? b.width : b.height;
  const c = make(w, h);
  c.position.set(b.x + b.width / 2, b.y + b.height / 2);
  if (slot.rotated) c.rotation = -Math.PI / 2;
  out.addChild(c);
}

/** Draws the busy board for the seat `viewer` (Corp servers face down, rig face up). */
export function drawPreview(layout: BoardLayout, viewer: Side): Container {
  const out = new Container();
  out.eventMode = 'none';
  const corpPos: BandPos = viewer === 'corp' ? 'bottom' : 'top';
  const runnerPos: BandPos = corpPos === 'top' ? 'bottom' : 'top';
  const corp = sideColor('corp');
  const runner = sideColor('runner');

  const row = serverSlots(layout, corpPos, SERVERS, true);
  row.columns.forEach((col, i) => {
    label(SERVERS[i]!.label, col.label, corp, out);
    if (col.root.length === 0) {
      const g = new Graphics();
      const b = col.rootSlot;
      g.roundRect(b.x, b.y, b.width, b.height, Math.max(3, b.width * 0.08)).stroke({ width: 1, color: corp, alpha: 0.35 });
      out.addChild(g);
    }
    for (const s of [...col.root, ...col.ice]) card(s, (w, h) => createCardBack('corp', w, h), out);
  });
  if (row.newServer) {
    label('New', row.newServer.label, theme.textDim, out);
    ghost(row.newServer.rootSlot, theme.textDim, '+', out);
  }

  const rig = rigSlots(layout, runnerPos, RIG.length);
  label('Memory 2/4', { ...rig.memory, width: Math.min(rig.memory.width, 90) }, runner, out);
  rig.cards.forEach((s, i) => {
    const def = getCard(RIG[i]!);
    card(s, (w, h) => (def ? createCardFace(def, w, h, 'small') : createCardBack('runner', w, h)), out);
  });
  ghost(rig.install.box, theme.textDim, 'Install', out);
  return out;
}
