// Sprint 12 words for the new choices and events (pure, unit tested):
// Accelerated Beta Test's look at the top of R&D (S-12-1), Archived Memories' Archives pick
// (S-12-2), Infiltration's expose (S-12-4). Numbers and names come from the view and events.
import { getCard } from '@overclock/cards';
import type { ChoiceView, GameEvent, Side } from '@overclock/engine';
import { SIDE_NAME, TERMS, plural } from './terms';

function nameOf(cardId: string | null | undefined, fallback: string): string {
  return (cardId ? getCard(cardId)?.name : undefined) ?? fallback;
}

/** "the top 3 cards" / "the top card". */
function topCards(n: number): string {
  return n === 1 ? 'the top card' : `the top ${n} cards`;
}

/** Which looked-at cards the engine lets the Corp install (a `select` option names them). */
export function lookInstallable(choice: Pick<ChoiceView, 'options'>): Set<number> {
  const out = new Set<number>();
  for (const o of choice.options) if (o.action.type === 'select') out.add(o.action.card);
  return out;
}

/**
 * Done's label: "Trash the rest (2)" while some looked-at ICE could still be installed,
 * "Trash 3 cards" when none can (one tap sends them all to Archives).
 */
export function lookDoneLabel(choice: Pick<ChoiceView, 'options' | 'looked'>): string {
  const n = choice.looked?.length ?? 0;
  if (lookInstallable(choice).size > 0) return `${TERMS.trash} the rest (${n})`;
  return `${TERMS.trash} ${plural(n, 'card', 'cards')}`;
}

/** The help column while the look-at choice is open. `picked`: an ICE is picked (its servers are lit). */
export function lookHelpText(choice: Pick<ChoiceView, 'options' | 'looked' | 'cardId' | 'waitingOn'>, mine: boolean, picked: boolean): string {
  const card = nameOf(choice.cardId, 'Agenda');
  const n = choice.looked?.length ?? 0;
  if (!mine) return `${SIDE_NAME[choice.waitingOn]} looks at ${topCards(n)} of ${TERMS.rd} (${card})…`;
  if (picked) return `Tap a lit server to install it free.\nTap the card again to cancel.`;
  if (lookInstallable(choice).size === 0) return `${card}: no ${TERMS.ice} to install.\nTap ${lookDoneLabel(choice)}.`;
  return `${card}: install any ${TERMS.ice} here free.\nTap an ${TERMS.ice}, then a server.`;
}

/** The help column while the Archives pick is open. */
export function archivesHelpText(choice: Pick<ChoiceView, 'cardId' | 'waitingOn'>, mine: boolean): string {
  const card = nameOf(choice.cardId, 'Operation');
  if (!mine) return `${SIDE_NAME[choice.waitingOn]} is picking a card from ${TERMS.archives} (${card})…`;
  return `${card}: tap a card to add it to ${TERMS.hq}.\nHold a card to read it.`;
}

/** The Archives sheet's title. */
export function archivesTitle(choice: Pick<ChoiceView, 'cardId'>): string {
  return `${nameOf(choice.cardId, 'Operation')}: pick a card for ${TERMS.hq}`;
}

/** A tap on a looked-at card that can't be installed. */
export function lookNotIceText(cardId: string | null): string {
  return `${nameOf(cardId, 'That card')} isn't ${TERMS.ice}: it goes to ${TERMS.archives}`;
}

/** The notice for one of the Sprint 12 events, as `viewer` sees it (null: none). */
export function s12Notice(e: GameEvent, viewer: Side): string | null {
  switch (e.type) {
    case 'cards_looked_at':
      return viewer === 'corp' ? `You look at ${topCards(e.count)} of ${TERMS.rd}` : `${SIDE_NAME.corp} looks at ${topCards(e.count)} of ${TERMS.rd}`;
    case 'rd_cards_trashed':
      return `${plural(e.count, 'card', 'cards')} to ${TERMS.archives}, face down`;
    case 'card_returned_to_hand': {
      const name = e.cardId ? nameOf(e.cardId, 'A card') : null;
      if (viewer === 'corp') return `${name ?? 'A card'} back to ${TERMS.hq}`;
      return name ? `${SIDE_NAME.corp} takes ${name} from ${TERMS.archives} to ${TERMS.hq}` : `${SIDE_NAME.corp} takes a face-down card from ${TERMS.archives} to ${TERMS.hq}`;
    }
    case 'card_exposed':
      return `Exposed: ${nameOf(e.cardId, 'a card')} (it stays face down)`;
    default:
      return null;
  }
}

/** The caption on the exposed card. */
export const EXPOSED_CAPTION = 'Exposed · tap to hide';

/** S-12-3 Modded / S-12-4 Infiltration: a choice of mode's button label (card data), with a price when not free. */
export function modeLabel(cardId: string | null | undefined, mode: number): string | null {
  return (cardId ? getCard(cardId)?.modes?.[mode]?.label : undefined) ?? null;
}

/** The help column while Infiltration's Expose is picked. */
export const EXPOSE_HELP = 'Tap a lit face-down card to expose it.\nTap Expose again to cancel.';
