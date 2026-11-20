// Sprint 15 (S-15-2, S-15-3): where cards fly after an action, planned from the viewer's own
// projected events only. Pure (no Pixi, no DOM): unit tested in Node, and the leak/budget test
// (E1) runs it over whole seeded games.
//
// The one rule that keeps hidden cards hidden: a flight's `cardId` is taken only from the event
// the viewer's projection carried. An event that omits it (the other side's draw, a Corp install
// or discard seen by the Runner, the Runner's view of an Accelerated Beta Test trash) flies a card
// back (`cardId: null`). The board resolves anchors to boxes; it never adds a face.
import type { GameEvent, Side } from '@overclock/engine';

export type FlightKind = 'draw' | 'install' | 'play' | 'showcase' | 'discard' | 'trash' | 'score' | 'steal' | 'damage' | 'mill' | 'return';

/** A place a flight starts or ends at (the board turns it into a box on screen). */
export type Anchor =
  /** A side's hand (`index`: the hand slot, when the viewer knows it; the other side's hand is the top edge). */
  | { at: 'hand'; side: Side; index?: number }
  | { at: 'deck' | 'discard' | 'score'; side: Side }
  /** An installed card's place (where it is drawn now, or where it was before it left). */
  | { at: 'installed'; uid: string }
  /** The middle of the table (a one-shot card shows there for a moment). */
  | { at: 'center' }
  /** The accessed card as shown large during a run (falls back to the middle). */
  | { at: 'access'; cardId: string }
  /** Where the player let go of a dragged card. */
  | { at: 'drop' };

export interface Flight {
  kind: FlightKind;
  /** The face shown in flight; null = a card back (the viewer may not know the card). */
  cardId: string | null;
  /** Whose card it is (picks the card back's colour). */
  side: Side;
  from: Anchor;
  to: Anchor;
  /** Start after the batch starts (ms). */
  delayMs: number;
  /** In the air, landing settle included (ms). */
  durationMs: number;
  /** The counter that changes when this card lands (pile counts change on landing, not before). */
  land?: { counter: 'deck' | 'discard' | 'score' | 'hand'; side: Side };
  /** Index of the event (in the planned batch) this flight comes from, and of its card within that event. */
  source: number;
  item: number;
}

/** Owner Q1 A (quick and snappy, ~0.25 s per flight). Tech plan timings; see DECISIONS 2026-11-20 (ui-dev) for the showcase trim. */
export const MOTION = {
  flight: 240,
  /** Landing settle after an install flight (scale 0.92 -> 1). */
  settle: 110,
  /** One-shot cards: hand -> middle, hold, middle -> discard (total 480 <= the 500 ms batch budget). */
  showcaseIn: 170,
  showcaseHold: 140,
  showcaseOut: 170,
  /** Ripple: the gap between cards moving in one batch (at most), and the batch's end (at most). */
  stagger: 60,
  /**
   * The gap in the end-of-turn discard ripple (pass-the-phone): the board turns over only once
   * those cards have landed, so this ripple stands between Confirm and the next player's turn
   * (CLAUDE.md: nothing blocks input > 600 ms). About one frame per card; with the 130 ms
   * `timing.discardFlight`, 4 cards land by 175 ms (was 360 at the 60 ms gap and 180 ms flight;
   * Sprint 14: 210). DECISIONS 2026-11-20 (ui-dev, turn-change ripple).
   */
  turnStagger: 15,
  batchMs: 500,
  /** At most this many sprites in the air in one batch; the rest land at once (counts stay right). */
  maxInAir: 4,
} as const;

/** One card movement before ripple timing is applied (`chain`: a second leg that follows the first). */
interface Leg {
  flight: Omit<Flight, 'delayMs' | 'source' | 'item'>;
  /** Extra delay after its card's start (the showcase's second leg). */
  offset: number;
}

/** The legs one event moves (one card = one group; a showcase is one group of two legs). */
function legsOf(viewer: Side, e: GameEvent): Leg[][] {
  switch (e.type) {
    case 'card_drawn': {
      // Only the drawer's own projection names the card; never trust a stray id for the other side.
      const cardId = e.player === viewer ? (e.cardId ?? null) : null;
      return [[{ offset: 0, flight: { kind: 'draw', cardId, side: e.player, from: { at: 'deck', side: e.player }, to: { at: 'hand', side: e.player }, durationMs: MOTION.flight, land: { counter: 'hand', side: e.player } } }]];
    }
    case 'card_installed': {
      const own = e.player === viewer;
      const from: Anchor =
        e.handIndex !== undefined ? { at: 'hand', side: e.player, index: e.handIndex } : own && e.player === 'corp' ? { at: 'deck', side: 'corp' } : { at: 'hand', side: e.player };
      return [[{ offset: 0, flight: { kind: 'install', cardId: e.cardId ?? null, side: e.player, from, to: { at: 'installed', uid: e.uid }, durationMs: MOTION.flight + MOTION.settle } }]];
    }
    case 'card_played': {
      const from: Anchor = e.handIndex !== undefined ? { at: 'hand', side: e.player, index: e.handIndex } : { at: 'hand', side: e.player };
      return [
        [
          { offset: 0, flight: { kind: 'play', cardId: e.cardId, side: e.player, from, to: { at: 'center' }, durationMs: MOTION.showcaseIn } },
          {
            offset: MOTION.showcaseIn + MOTION.showcaseHold,
            flight: { kind: 'showcase', cardId: e.cardId, side: e.player, from: { at: 'center' }, to: { at: 'discard', side: e.player }, durationMs: MOTION.showcaseOut, land: { counter: 'discard', side: e.player } },
          },
        ],
      ];
    }
    case 'cards_discarded': {
      const out: Leg[][] = [];
      for (let i = 0; i < e.count; i++) {
        const index = e.handIndices?.[i];
        out.push([
          {
            offset: 0,
            flight: {
              kind: 'discard',
              cardId: e.cardIds?.[i] ?? null,
              side: e.player,
              from: index !== undefined ? { at: 'hand', side: e.player, index } : { at: 'hand', side: e.player },
              to: { at: 'discard', side: e.player },
              durationMs: MOTION.flight,
              land: { counter: 'discard', side: e.player },
            },
          },
        ]);
      }
      return out;
    }
    case 'card_trashed': {
      const from: Anchor = e.uid !== undefined ? { at: 'installed', uid: e.uid } : { at: 'access', cardId: e.cardId };
      return [[{ offset: 0, flight: { kind: 'trash', cardId: e.cardId, side: 'corp', from, to: { at: 'discard', side: 'corp' }, durationMs: MOTION.flight, land: { counter: 'discard', side: 'corp' } } }]];
    }
    case 'corp_card_trashed':
    case 'rig_card_trashed': {
      const side: Side = e.type === 'corp_card_trashed' ? 'corp' : 'runner';
      return [[{ offset: 0, flight: { kind: 'trash', cardId: e.cardId, side, from: { at: 'installed', uid: e.uid }, to: { at: 'discard', side }, durationMs: MOTION.flight, land: { counter: 'discard', side } } }]];
    }
    case 'agenda_scored':
      return [[{ offset: 0, flight: { kind: 'score', cardId: e.cardId, side: 'corp', from: { at: 'installed', uid: e.uid }, to: { at: 'score', side: 'corp' }, durationMs: MOTION.flight, land: { counter: 'score', side: 'corp' } } }]];
    case 'agenda_stolen':
      return [[{ offset: 0, flight: { kind: 'steal', cardId: e.cardId, side: 'corp', from: { at: 'access', cardId: e.cardId }, to: { at: 'score', side: 'runner' }, durationMs: MOTION.flight, land: { counter: 'score', side: 'runner' } } }]];
    case 'net_damage':
    case 'meat_damage':
    case 'brain_damage':
      // Damage cards go face up to the Heap (public).
      return e.cardIds.map((cardId) => [
        { offset: 0, flight: { kind: 'damage', cardId, side: 'runner', from: { at: 'hand', side: 'runner' }, to: { at: 'discard', side: 'runner' }, durationMs: MOTION.flight, land: { counter: 'discard', side: 'runner' } } },
      ]);
    case 'rd_cards_trashed': {
      const out: Leg[][] = [];
      for (let i = 0; i < e.count; i++) {
        out.push([
          {
            offset: 0,
            flight: { kind: 'mill', cardId: e.cardIds?.[i] ?? null, side: 'corp', from: { at: 'deck', side: 'corp' }, to: { at: 'discard', side: 'corp' }, durationMs: MOTION.flight, land: { counter: 'discard', side: 'corp' } },
          },
        ]);
      }
      return out;
    }
    case 'card_returned_to_hand':
      return [
        [
          {
            offset: 0,
            flight: { kind: 'return', cardId: e.cardId ?? null, side: 'corp', from: { at: 'discard', side: 'corp' }, to: { at: 'hand', side: e.player }, durationMs: MOTION.flight, land: { counter: 'hand', side: e.player } },
          },
        ],
      ];
    default:
      return [];
  }
}

/**
 * The flights one batch of events makes, for `viewer`'s screen. Cards moving in one batch go
 * one just after another (a ripple) and the whole batch ends within `MOTION.batchMs`; past
 * `MOTION.maxInAir` cards the rest land at once (duration 0), so the counts still end right.
 * `opts.stagger`: a different (at most) gap between cards (the turn change uses `MOTION.turnStagger`).
 */
export function planMotion(viewer: Side, events: readonly GameEvent[], opts: { stagger?: number } = {}): Flight[] {
  const groups = events.flatMap((e, source) => legsOf(viewer, e).map((g, item) => g.map((l) => ({ ...l, source, item }))));
  if (groups.length === 0) return [];
  const span = (g: readonly Leg[]) => Math.max(...g.map((l) => l.offset + l.flight.durationMs));
  const flying = groups.slice(0, MOTION.maxInAir);
  const longest = Math.max(...flying.map(span));
  const stagger = flying.length > 1 ? Math.max(0, Math.min(opts.stagger ?? MOTION.stagger, Math.floor((MOTION.batchMs - longest) / (flying.length - 1)))) : 0;
  const out: Flight[] = [];
  groups.forEach((g, i) => {
    const air = i < MOTION.maxInAir;
    const start = air ? i * stagger : 0;
    for (const l of g) {
      out.push({ ...l.flight, delayMs: air ? start + l.offset : 0, durationMs: air ? l.flight.durationMs : 0, source: l.source, item: l.item });
    }
  });
  return out;
}

/** When the last flight of a batch has landed (ms after the batch starts; 0 for none). */
export function motionSpan(flights: readonly Flight[]): number {
  return flights.reduce((m, f) => Math.max(m, f.delayMs + f.durationMs), 0);
}
