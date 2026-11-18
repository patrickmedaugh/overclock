// Sprint 13: the deck builder's screens (DOM, inside the start screen's overlay, native scroll):
// the Decks list (S-13-1, S-13-4), "New deck" (start from the standard deck / empty), the editor
// (S-13-2, S-13-3) and the pass-the-phone deck picker (S-13-5). No rules here: every number, the
// dimmed + and "Ready to play" come from `deckStatus` / `addBlock` (`@overclock/cards`); the words
// come from `deckText.ts`.
import { type CardDef, type DeckDef, MAX_COPIES, addBlock, deckPool, deckStatus, getCard } from '@overclock/cards';
import { type Side, isPlayableDeck } from '@overclock/engine';
import { type DeckEntry, type DeckLibrary, STANDARD_ID, dealOf } from './deckStore';
import {
  DECK_TEXT,
  FACTION_NAME,
  GROUP_NAME,
  addBlockText,
  agendaText,
  barFlags,
  cardCountText,
  copiesText,
  deckNote,
  influenceText,
  problemsText,
  sizeText,
  standardDeckName,
} from './deckText';
import { timing } from './theme';
import './decks.css';

/** The game's long-press zoom face of a card, drawn to a canvas (null when it can't be drawn now). */
export interface ZoomImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  texts: string[];
  overflow: boolean;
}

export interface DeckScreenDeps {
  library: DeckLibrary;
  zoomFace(cardId: string): ZoomImage | null;
  /** A short non-blocking note ("Max 3 copies"). */
  toast(text: string): void;
}

/** What the zoom shows now (test hook). */
export interface ZoomInfo {
  cardId: string;
  width: number;
  height: number;
  texts: string[];
  overflow: boolean;
}

const FACTION_COLOR: Record<string, string> = {
  haas_bioroid: '#b98cff',
  jinteki: '#ff5470',
  nbn: '#ffd36b',
  weyland: '#5fd38a',
  anarch: '#ff8a3d',
  criminal: '#4aa8ff',
  shaper: '#8cff5a',
  neutral: '#9fb0c8',
};

/** A deck's display name (the standard decks are named by side and identity). */
export function deckName(d: DeckEntry): string {
  return d.standard ? standardDeckName(d.side, d.identity) : d.name;
}

/**
 * "45 cards" and the Ready tick or the first red note. Ready = `isPlayableDeck` (exactly what the
 * game deals: `checkDeck` clean and the identity is the deck's side), so the picker never offers a
 * deck `newGame` would refuse (e.g. a hand-edited store with the other side's identity).
 */
export function deckSummary(d: DeckEntry): { count: string; ready: boolean; note: string } {
  const deal = dealOf(d);
  const s = deckStatus(deal);
  const n = deckNote(s, d.identity);
  const ready = isPlayableDeck(deal, d.side);
  return { count: cardCountText(s.size), ready, note: n.ready && !ready ? DECK_TEXT.otherSide : n.text };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Press feedback on pointer down, the action on click (keyboard too). */
export function onTap(b: HTMLElement, fn: () => void): void {
  b.addEventListener('pointerdown', () => b.classList.add('pressed'));
  for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(t, () => b.classList.remove('pressed'));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    fn();
  });
}

function button(cls: string, text: string, action: string, fn: () => void): HTMLButtonElement {
  const b = el('button', cls, text);
  b.type = 'button';
  b.dataset.action = action;
  onTap(b, fn);
  return b;
}

/** The deck's note: "✓ Ready to play" (green) or the red note. */
function noteEl(ready: boolean, text: string): HTMLElement {
  const n = el('span', ready ? 'note ok' : 'note bad');
  if (ready) n.append(el('span', 'tick', '✓'), ' ');
  n.append(text);
  return n;
}

// ---- the Decks list (S-13-1, S-13-4) -------------------------------------------------------

export interface DeckListNav {
  open(id: string): void;
  newDeck(side: Side): void;
}

export function renderDeckList(screen: HTMLElement, deps: DeckScreenDeps, nav: DeckListNav): void {
  screen.classList.add('decks');
  const head = el('div', 'deck-title');
  head.append(el('h2', '', DECK_TEXT.title));
  screen.append(head);
  if (deps.library.readOnly) screen.append(el('p', 'error', DECK_TEXT.newer));
  const cols = el('div', 'deck-cols');
  for (const side of ['corp', 'runner'] as const) {
    const col = el('section', `deck-col ${side}`);
    col.dataset.side = side;
    col.append(el('h3', '', side === 'corp' ? 'Corp' : 'Runner'));
    for (const d of [deps.library.standard(side), ...deps.library.mine(side)]) col.append(deckItem(d, () => nav.open(d.id)));
    if (!deps.library.readOnly) col.append(button(`deck-new ${side}`, DECK_TEXT.newDeck(side), `new-${side}`, () => nav.newDeck(side)));
    cols.append(col);
  }
  screen.append(cols);
}

function deckItem(d: DeckEntry, fn: () => void): HTMLButtonElement {
  const b = el('button', `deck-item ${d.side}`);
  b.type = 'button';
  b.dataset.deck = d.id;
  b.dataset.testid = 'deck-item';
  const sum = deckSummary(d);
  b.dataset.ready = String(sum.ready);
  const line = el('small');
  line.append(`${sum.count} · `, noteEl(sum.ready, sum.note));
  b.append(el('b', '', deckName(d)), line);
  onTap(b, fn);
  return b;
}

// ---- New deck --------------------------------------------------------------------------

export function renderNewDeck(screen: HTMLElement, side: Side, create: (from: 'standard' | 'empty') => void): void {
  screen.append(el('h2', '', DECK_TEXT.newTitle(side)));
  const row = el('div', 'choices');
  const choice = (action: string, label: string, sub: string, fn: () => void) => {
    const b = el('button', `choice ${side}`);
    b.type = 'button';
    b.dataset.action = action;
    b.append(el('b', '', label), el('small', '', sub));
    onTap(b, fn);
    return b;
  };
  row.append(
    choice('from-standard', DECK_TEXT.fromStandard, DECK_TEXT.fromStandardSub, () => create('standard')),
    choice('from-empty', DECK_TEXT.empty, DECK_TEXT.emptySub, () => create('empty')),
  );
  screen.append(row);
}

// ---- the editor (S-13-2, S-13-3, S-13-4) ---------------------------------------------------

interface RowEls {
  card: CardDef;
  row: HTMLElement;
  count: HTMLElement;
  minus: HTMLButtonElement | null;
  plus: HTMLButtonElement | null;
  why: HTMLElement;
  sub: string;
  block: string | null;
}

export interface EditorNav {
  /** Copy to edit (standard deck): make a copy and open it. */
  copy(): void;
  /** The deck was deleted: back to the list. */
  deleted(): void;
}

export class DeckEditor {
  private deck: DeckEntry;
  private readonly rows = new Map<string, RowEls>();
  private readonly groups: { head: HTMLElement; ids: string[] }[] = [];
  private inDeckOnly: boolean;
  private readonly bar: HTMLElement;
  private readonly parts: { size: HTMLElement; influence: HTMLElement; agenda: HTMLElement | null; note: HTMLElement };
  private readonly list: HTMLElement;
  private dialog: HTMLElement | null = null;
  private readonly hold: HoldZoom;
  private readonly editable: boolean;

  constructor(
    private readonly screen: HTMLElement,
    private readonly deps: DeckScreenDeps,
    deck: DeckEntry,
    private readonly nav: EditorNav,
  ) {
    this.deck = deck;
    this.editable = !deck.standard && !deps.library.readOnly;
    // A standard deck opens on its own cards (it is read only); an editable deck shows every card.
    this.inDeckOnly = !this.editable;
    screen.classList.add('deck-editor', deck.side);
    screen.dataset.deck = deck.id;
    this.hold = new HoldZoom(screen, deps);

    // Row 1: name (tap to rename), In deck switch, Copy to edit / Delete.
    const head = el('div', 'deck-head');
    if (this.editable) {
      const name = el('input', 'deck-name');
      name.value = deck.name;
      name.maxLength = 40;
      name.autocomplete = 'off';
      name.spellcheck = false;
      name.enterKeyHint = 'done';
      name.setAttribute('aria-label', DECK_TEXT.rename);
      name.dataset.testid = 'deck-name';
      const commit = () => {
        this.deps.library.rename(this.deck.id, name.value);
        this.deck = this.deps.library.get(this.deck.id) ?? this.deck;
        name.value = this.deck.name;
      };
      name.addEventListener('change', commit);
      name.addEventListener('blur', commit);
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') name.blur();
      });
      head.append(name);
    } else {
      const t = el('h2', 'deck-name', deckName(deck));
      t.dataset.testid = 'deck-name';
      head.append(t);
    }
    const sw = el('button', 'deck-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.dataset.testid = 'deck-in-deck';
    sw.append(el('span', 'track'), el('span', 'label', DECK_TEXT.inDeck));
    const setSwitch = () => sw.setAttribute('aria-checked', String(this.inDeckOnly));
    setSwitch();
    onTap(sw, () => {
      this.inDeckOnly = !this.inDeckOnly;
      setSwitch();
      this.applyFilter();
    });
    head.append(sw);
    if (deck.standard) head.append(button('deck-act', DECK_TEXT.copyToEdit, 'copy-to-edit', () => this.nav.copy()));
    else if (this.editable) head.append(button('deck-act danger', DECK_TEXT.delete, 'delete-deck', () => this.askDelete()));
    screen.append(head);

    // Row 2: the rules bar.
    this.bar = el('div', 'deck-bar');
    this.bar.dataset.testid = 'deck-bar';
    this.bar.setAttribute('aria-live', 'polite');
    const part = (name: string) => {
      const p = el('span', 'part');
      p.dataset.part = name;
      return p;
    };
    this.parts = { size: part('size'), influence: part('influence'), agenda: deck.side === 'corp' ? part('agenda') : null, note: el('span', 'notes') };
    this.parts.note.dataset.part = 'note';
    this.bar.append(this.parts.size, this.parts.influence);
    if (this.parts.agenda) this.bar.append(this.parts.agenda);
    this.bar.append(this.parts.note);
    screen.append(this.bar);

    // The list: identity on top, then each type's cards.
    this.list = el('div', 'deck-list');
    this.list.dataset.testid = 'deck-list';
    this.list.addEventListener('contextmenu', (e) => e.preventDefault());
    const id = getCard(deck.identity);
    if (id) {
      const idRow = el('div', 'deck-identity');
      idRow.dataset.card = id.id;
      idRow.dataset.testid = 'deck-identity';
      idRow.style.setProperty('--faction', FACTION_COLOR[id.faction] ?? '#9fb0c8');
      const extra = [id.minDeckSize !== undefined ? `Min ${id.minDeckSize} cards` : '', id.influenceLimit !== undefined ? `Influence limit ${id.influenceLimit}` : '']
        .filter(Boolean)
        .join(' · ');
      idRow.append(el('b', '', id.name), el('small', '', `Identity · ${FACTION_NAME[id.faction]}${extra ? ` · ${extra}` : ''}`));
      this.hold.attach(idRow, id.id);
      this.list.append(idRow);
    }
    for (const g of deckPool(deck.side)) {
      const head = el('div', 'deck-group', GROUP_NAME[g.type] ?? g.type);
      head.dataset.group = g.type;
      this.list.append(head);
      const ids: string[] = [];
      for (const c of g.cards) {
        this.list.append(this.makeRow(c));
        ids.push(c.id);
      }
      this.groups.push({ head, ids });
    }
    screen.append(this.list);
    this.refresh();
  }

  get deckId(): string {
    return this.deck.id;
  }

  /** The phone's Back: closes the delete question or the zoom first. True if it did. */
  back(): boolean {
    if (this.dialog) {
      this.closeDialog();
      return true;
    }
    return this.hold.hide();
  }

  /** Leaving the editor: the change is kept now. */
  close(): void {
    this.hold.hide();
    this.deps.library.flush();
  }

  zoomInfo(): ZoomInfo | null {
    return this.hold.info();
  }

  private makeRow(c: CardDef): HTMLElement {
    const row = el('div', 'deck-row');
    row.dataset.testid = 'deck-row';
    row.dataset.card = c.id;
    row.style.setProperty('--faction', FACTION_COLOR[c.faction] ?? '#9fb0c8');
    const info = el('div', 'card-info');
    // Agendas show what it takes to score them (advancements); other cards their cost.
    const adv = c.type === 'agenda' || c.cost === undefined;
    const cost = adv ? el('span', 'cost adv', c.advancementRequirement !== undefined ? String(c.advancementRequirement) : '–') : el('span', 'cost', String(c.cost));
    cost.title = adv ? 'Advancements to score' : 'Cost';
    const names = el('span', 'names');
    const sub = subLine(c);
    const why = el('small', 'why', sub);
    names.append(el('b', 'name', c.name), why);
    const dots = el('span', 'dots', '●'.repeat(c.influence ?? 0));
    dots.setAttribute('aria-label', `Influence ${c.influence ?? 0}`);
    info.append(cost, names, dots);
    this.hold.attach(info, c.id);
    const count = el('span', 'count');
    count.dataset.testid = 'deck-count';
    row.append(info, count);
    let minus: HTMLButtonElement | null = null;
    let plus: HTMLButtonElement | null = null;
    if (this.editable) {
      minus = el('button', 'pm minus', '−');
      minus.type = 'button';
      minus.dataset.testid = 'deck-minus';
      minus.setAttribute('aria-label', `Remove a ${c.name}`);
      plus = el('button', 'pm plus', '+');
      plus.type = 'button';
      plus.dataset.testid = 'deck-plus';
      plus.setAttribute('aria-label', `Add a ${c.name}`);
      onTap(minus, () => this.change(c.id, -1));
      onTap(plus, () => this.change(c.id, +1));
      row.append(minus, plus);
    }
    this.rows.set(c.id, { card: c, row, count, minus, plus, why, sub, block: null });
    return row;
  }

  private change(cardId: string, delta: 1 | -1): void {
    const r = this.rows.get(cardId);
    if (!r) return;
    const n = this.deck.cards[cardId] ?? 0;
    if (delta > 0 && r.block !== null) {
      this.deps.toast(r.block);
      return;
    }
    if (delta < 0 && n <= 0) return;
    this.deps.library.setCount(this.deck.id, cardId, n + delta);
    this.deck = this.deps.library.get(this.deck.id) ?? this.deck;
    this.refresh();
  }

  /** Counts, dimmed buttons and the bar (only what changed is touched). */
  private refresh(): void {
    const deal = dealOf(this.deck);
    for (const r of this.rows.values()) this.refreshRow(r, deal);
    this.refreshBar(deal);
    this.applyFilter();
  }

  private refreshRow(r: RowEls, deal: DeckDef): void {
    const n = this.deck.cards[r.card.id] ?? 0;
    const text = copiesText(n, MAX_COPIES);
    if (r.count.textContent !== text) r.count.textContent = text;
    r.row.dataset.count = String(n);
    r.row.classList.toggle('has', n > 0);
    if (r.minus) {
      r.minus.classList.toggle('dim', n <= 0);
      r.minus.setAttribute('aria-disabled', String(n <= 0));
    }
    if (!this.editable) return;
    const b = addBlock(deal, r.card.id);
    const block = b ? addBlockText(b) : null;
    if (block === r.block) return;
    r.block = block;
    if (r.plus) {
      r.plus.classList.toggle('dim', block !== null);
      r.plus.setAttribute('aria-disabled', String(block !== null));
      if (block) r.plus.title = block;
      else r.plus.removeAttribute('title');
      r.plus.dataset.block = block ?? '';
    }
    // A card that can never go in (another faction's agenda) says why on its row; "Max 3" shows on a tap.
    const always = b && b.kind !== 'max_copies';
    r.why.textContent = always ? block : r.sub;
    r.why.classList.toggle('bad', !!always);
  }

  private refreshBar(deal: DeckDef): void {
    const s = deckStatus(deal);
    const bad = barFlags(s);
    const set = (p: HTMLElement, text: string, isBad: boolean) => {
      if (p.textContent !== text) p.textContent = text;
      p.classList.toggle('bad', isBad);
      p.classList.toggle('ok', !isBad);
    };
    set(this.parts.size, sizeText(s), bad.size);
    set(this.parts.influence, influenceText(s), bad.influence);
    if (this.parts.agenda) set(this.parts.agenda, agendaText(s) ?? '', bad.agenda);
    const note = this.parts.note;
    note.replaceChildren(s.legal ? noteEl(true, DECK_TEXT.ready) : noteEl(false, problemsText(s, this.deck.identity).join(' · ')));
    this.bar.dataset.legal = String(s.legal);
  }

  private applyFilter(): void {
    this.screen.classList.toggle('in-deck-only', this.inDeckOnly);
    for (const g of this.groups) {
      const any = g.ids.some((id) => (this.deck.cards[id] ?? 0) > 0);
      g.head.classList.toggle('empty', !any);
    }
  }

  private askDelete(): void {
    if (this.dialog) return;
    const d = el('div', 'deck-dialog');
    d.setAttribute('role', 'dialog');
    d.dataset.testid = 'deck-delete-dialog';
    const box = el('div', 'box');
    const row = el('div', 'row');
    row.append(
      button('deck-act danger', DECK_TEXT.delete, 'confirm-delete', () => {
        this.closeDialog();
        this.hold.hide();
        this.deps.library.remove(this.deck.id);
        this.deps.library.flush();
        this.nav.deleted();
      }),
      button('deck-act', DECK_TEXT.keep, 'keep-deck', () => this.closeDialog()),
    );
    box.append(el('p', '', DECK_TEXT.deleteAsk(this.deck.name)), row);
    d.append(box);
    this.screen.append(d);
    this.dialog = d;
  }

  private closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
  }
}

/** The small line under a card's name: its faction, and agenda points for an agenda. */
function subLine(c: CardDef): string {
  const parts = [FACTION_NAME[c.faction]];
  if (c.agendaPoints !== undefined) parts.push(`${c.agendaPoints} ${c.agendaPoints === 1 ? 'point' : 'points'}`);
  if (c.subtype) parts.push(c.subtype.replace('breaker_', 'breaker: ').replace('_', ' '));
  return parts.join(' · ');
}

/**
 * Hold a card (350 ms, as in a game) to see the game's zoom face; letting go (or scrolling)
 * returns to the list.
 */
class HoldZoom {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shown: { el: HTMLElement; info: ZoomInfo } | null = null;
  private start: { x: number; y: number; id: number } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly deps: DeckScreenDeps,
  ) {}

  attach(target: HTMLElement, cardId: string): void {
    target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.cancel();
      this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      target.classList.add('holding');
      this.timer = setTimeout(() => {
        this.timer = null;
        this.show(cardId);
      }, timing.longPress);
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.start || e.pointerId !== this.start.id || this.shown) return;
      if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 10) this.cancel(target);
    });
    const end = () => {
      this.cancel(target);
      this.hide();
    };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
    target.addEventListener('lostpointercapture', end);
  }

  info(): ZoomInfo | null {
    return this.shown ? { ...this.shown.info, texts: [...this.shown.info.texts] } : null;
  }

  /** True if a zoom was showing. */
  hide(): boolean {
    if (!this.shown) return false;
    this.shown.el.remove();
    this.shown = null;
    return true;
  }

  private cancel(target?: HTMLElement): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.start = null;
    target?.classList.remove('holding');
    for (const h of this.host.querySelectorAll('.holding')) h.classList.remove('holding');
  }

  private show(cardId: string): void {
    this.hide();
    const img = this.deps.zoomFace(cardId);
    if (!img) return;
    const z = el('div', 'deck-zoom');
    z.dataset.testid = 'deck-zoom';
    z.dataset.card = cardId;
    img.canvas.style.width = `${img.width}px`;
    img.canvas.style.height = `${img.height}px`;
    z.append(img.canvas);
    this.host.append(z);
    this.shown = { el: z, info: { cardId, width: img.width, height: img.height, texts: img.texts, overflow: img.overflow } };
  }
}

// ---- the pass-the-phone deck picker (S-13-5) -------------------------------------------------

export type DeckPicks = Record<Side, string>;

/**
 * "Corp deck" and "Runner deck" choices (standard decks picked unless `picks` names Ready decks)
 * and Start. A deck that isn't Ready to play is dimmed with its red note and can't be picked.
 */
export function renderPicker(screen: HTMLElement, deps: DeckScreenDeps, picks: Partial<DeckPicks>, start: (decks: Record<Side, DeckEntry>) => void): void {
  screen.classList.add('deck-pick');
  const chosen: DeckPicks = { corp: STANDARD_ID.corp, runner: STANDARD_ID.runner };
  const head = el('div', 'deck-title');
  head.append(el('h2', '', DECK_TEXT.pickTitle));
  const go = el('button', 'choice runner deck-start');
  go.type = 'button';
  go.dataset.action = 'start-here';
  go.append(el('b', '', DECK_TEXT.start));
  head.append(go);
  screen.append(head);
  const cols = el('div', 'deck-cols');
  const entries: Record<Side, DeckEntry[]> = { corp: [], runner: [] };
  for (const side of ['corp', 'runner'] as const) {
    const col = el('section', `deck-col ${side}`);
    col.dataset.side = side;
    col.setAttribute('role', 'radiogroup');
    col.setAttribute('aria-label', side === 'corp' ? DECK_TEXT.corpDeck : DECK_TEXT.runnerDeck);
    col.append(el('h3', '', side === 'corp' ? DECK_TEXT.corpDeck : DECK_TEXT.runnerDeck));
    const opts: HTMLButtonElement[] = [];
    const mark = () => {
      for (const o of opts) o.setAttribute('aria-checked', String(o.dataset.deck === chosen[side]));
    };
    entries[side] = [deps.library.standard(side), ...deps.library.mine(side)];
    for (const d of entries[side]) {
      const sum = deckSummary(d);
      if (picks[side] === d.id && sum.ready) chosen[side] = d.id;
      const b = el('button', `deck-item pick ${side}`);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.deck = d.id;
      b.dataset.testid = 'deck-pick';
      b.dataset.ready = String(sum.ready);
      if (!sum.ready) {
        b.classList.add('dim');
        b.setAttribute('aria-disabled', 'true');
      }
      const line = el('small');
      line.append(`${sum.count} · `, noteEl(sum.ready, sum.note));
      b.append(el('b', '', deckName(d)), line);
      onTap(b, () => {
        if (!sum.ready) {
          deps.toast(sum.note);
          return;
        }
        chosen[side] = d.id;
        mark();
      });
      opts.push(b);
      col.append(b);
    }
    mark();
    cols.append(col);
  }
  screen.append(cols);
  onTap(go, () => {
    const get = (side: Side) => entries[side].find((d) => d.id === chosen[side]) ?? deps.library.standard(side);
    start({ corp: get('corp'), runner: get('runner') });
  });
}
