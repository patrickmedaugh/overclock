// S-06-1: the start screen. A DOM overlay over the canvas (the code needs a
// real text field and the phone's keyboard): Play on this device / Play online
// -> Start a game (pick Corp or Runner) / Join with code. No game logic: it
// only asks the handlers to start or join.
import type { DeckDef } from '@overclock/cards';
import type { Side } from '@overclock/engine';
import { CODE_LENGTH, DECK_CODE_LENGTH, formatDeckCode, isGameCode, normalizeCode } from '@overclock/protocol';
import { type DeckEntry, type DeckLibrary, dealOf } from './deckStore';
import type { DeckSync, SyncStatus } from './deckSync';
import { DECK_TEXT, ONLINE_DECK_TEXT, SYNC_TEXT } from './deckText';
import {
  DeckEditor,
  type DeckPicks,
  type ZoomImage,
  type ZoomInfo,
  hasReadyDeck,
  renderDeckList,
  renderNewDeck,
  renderOnlinePicker,
  renderPicker,
} from './decksScreen';
import { SIDE_NAME } from './terms';
import './start.css';

export const START_TEXT = {
  title: 'OVERCLOCK',
  tagline: 'A two-player hacking card game',
  playHere: 'Play on this device',
  playHereSub: 'Take turns on one screen',
  playOnline: 'Play online',
  playOnlineSub: 'Each player on their own device',
  startGame: 'Start a game',
  startGameSub: 'Get a code to send',
  joinGame: 'Join with code',
  joinGameSub: 'Type the code you got',
  pickTitle: 'Which side do you play?',
  pickNote: 'The other player gets the other side.',
  corpSub: 'Guards servers, scores agendas',
  runnerSub: 'Breaks in, steals agendas',
  joinTitle: 'Join with code',
  join: 'Join',
  badCode: `Codes are ${CODE_LENGTH} letters or numbers, like K7QF`,
  notSetUp: "Online play isn't set up yet",
  notSetUpNote: 'Play on this device works now.',
  back: 'Back',
  /** Sprint 11 (S-11-3): the saved pass-the-phone game, and an online game left for now ("Continue game · K7QF"). */
  continueGame: 'Continue game',
  /** Owner Q3 A: a save from before a rules update. */
  outdated: "That saved game can't continue on this new version of the game. Start a new game.",
  lobbyTitle: 'Your game code',
  lobbyNote: 'Send it to the other player. They tap Play online, then Join with code.',
  share: 'Share',
  shareSub: 'Send the code',
  copied: 'Link copied. Paste it in a message.',
  waiting: 'Waiting for the other player…',
  connecting: 'Connecting…',
} as const;

/** Plain words for why an online game could not start or go on (protocol error codes and the network). */
export const FAIL_TEXT: Record<string, string> = {
  no_game: 'No game with that code',
  full: 'That game already has two players',
  network: "Can't reach the online game. Check your connection and try again.",
  // Sprint 14 (S-14-4 AC4): the other phone (or the service) speaks another version.
  version: 'Update the game to play online',
  expired: 'That game has ended.',
  bad_token: 'That seat belongs to another device now.',
  replaced: 'This game was opened on another screen.',
  bad_message: 'Something went wrong. Try again.',
};

/**
 * Sprint 13: `decks` (the Decks list), `new_deck`, `deck` (the editor), `here` (the pass-the-phone
 * deck picker). Sprint 14: `deck_code` (My deck code), `link` (I have a deck code), `online_deck`
 * (the starter picks a deck after the side), `choose` (the joiner picks a deck for their side).
 */
export type StartScreenName =
  | 'home'
  | 'online'
  | 'pick'
  | 'join'
  | 'not_set_up'
  | 'message'
  | 'lobby'
  | 'decks'
  | 'new_deck'
  | 'deck'
  | 'here'
  | 'deck_code'
  | 'link'
  | 'online_deck'
  | 'choose';

/** Screens laid out from the top (lists), not centred. */
const FULL: ReadonlySet<StartScreenName> = new Set(['decks', 'deck', 'here', 'online_deck', 'choose']);

export interface StartHandlers {
  /**
   * Start a pass-the-phone game. Sprint 13: `decks` holds the sides whose picked deck isn't the
   * standard one (absent: today's standard game).
   */
  playHere(decks?: Partial<Record<Side, DeckDef>>): void;
  /** Sprint 13: the decks kept on this device. */
  library: DeckLibrary;
  /** Sprint 13: the game's zoom face of a card (the editor's hold). */
  zoomFace(cardId: string): ZoomImage | null;
  /** True when this build knows the online service's address. */
  onlineReady(): boolean;
  /** Start an online game playing `side` with `deck` (Sprint 14; absent: the standard deck). */
  startOnline(side: Side, deck?: DeckEntry): void;
  /** Sprint 14: the joiner's deck for the seat the service gave them (absent: the standard deck). */
  pickOnline(deck?: DeckEntry): void;
  /** Sprint 14: the decks kept online (null: this build has no online service). */
  deckSync: DeckSync | null;
  /** Sprint 14: copies text to the clipboard (true if it worked). */
  copy(text: string): Promise<boolean>;
  /** Sprint 14: the Decks list opened (true) or closed (false): the online copy is checked every few seconds while it's open. */
  decksOpen(open: boolean): void;
  /** Join the online game with this (normalised, well-formed) code. */
  joinOnline(code: string): void;
  /**
   * Sprint 11: the saved pass-the-phone game (whose turn it is; null for a save that
   * can't continue on this version, which still shows so Continue can say why), or null if none.
   */
  savedHere(): { turn: Side | null } | null;
  /** Continue the saved pass-the-phone game. */
  continueHere(): void;
  /** The online game this phone has a seat in (offered as "Continue game · CODE"), or null. */
  rejoinSeat(): { code: string; seat: Side } | null;
  rejoin(): void;
  /** Share the lobby's code (share sheet, or copy the link). */
  share(code: string): void;
  /** Back from a screen that is waiting on the online service (connecting, lobby): give it up. */
  cancel(): void;
}

/** Where Back goes from each screen (home has nowhere to go: the app closes). */
const PARENT: Record<StartScreenName, StartScreenName | null> = {
  home: null,
  online: 'home',
  pick: 'online',
  join: 'online',
  not_set_up: 'home',
  message: 'online',
  lobby: 'online',
  decks: 'home',
  new_deck: 'decks',
  deck: 'decks',
  here: 'home',
  deck_code: 'decks',
  link: 'decks',
  online_deck: 'pick',
  choose: 'online',
};

export interface ShowOptions {
  code?: string;
  error?: string;
  message?: string;
  title?: string;
  note?: string;
  /** `deck`: which deck; `new_deck`: which side. */
  deckId?: string;
  side?: Side;
  /** `here`: decks to pick at first (each only if still Ready to play). */
  picks?: Partial<DeckPicks>;
  /** Sprint 14 `lobby`: the friend has joined and is picking a deck. */
  picking?: boolean;
}

export class StartScreen {
  readonly root: HTMLElement;
  private current: StartScreenName = 'home';
  private editor: DeckEditor | null = null;
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  /** Sprint 14: re-enables "I have a deck code" when the wait is over. */
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  /** Sprint 14: a request started from this screen (My deck code / Link) whose answer is still wanted. */
  private ask = 0;

  constructor(
    parent: HTMLElement,
    private readonly handlers: StartHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'start';
    parent.appendChild(this.root);
    this.show('home');
    // Sprint 14: decks from another device arrive while the Decks list shows: draw it again.
    handlers.library.onChange((c) => {
      if (c === 'remote' && this.visible && this.current === 'decks') this.redrawDecks();
    });
    handlers.deckSync?.onStatus((st) => this.setSyncLine(st));
  }

  get screen(): StartScreenName {
    return this.current;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /** Back (the phone's button or the on-screen one). False on the home screen (nothing to go back to). */
  back(): boolean {
    if (this.editor?.back()) return true;
    const to = PARENT[this.current];
    if (to === null) return false;
    if (this.current === 'message' || this.current === 'lobby' || this.current === 'choose') this.handlers.cancel();
    this.show(to);
    return true;
  }

  show(name: StartScreenName, opts: ShowOptions = {}): void {
    // Leaving the editor: its changes are written now.
    this.editor?.close();
    this.editor = null;
    if (this.current === 'decks' && name !== 'decks') this.handlers.decksOpen(false);
    if (this.lockTimer !== null) clearTimeout(this.lockTimer);
    this.lockTimer = null;
    this.ask++;
    this.current = name;
    this.root.hidden = false;
    this.root.dataset.screen = name;
    this.root.classList.toggle('full', FULL.has(name));
    this.root.replaceChildren();
    this.toastEl = null;
    const screen = el('div', 'screen');
    this.root.appendChild(screen);
    if (PARENT[name] !== null) {
      const back = el('button', 'back', START_TEXT.back);
      back.dataset.action = 'back';
      tapNow(back, () => this.back());
      this.root.appendChild(back);
    }
    switch (name) {
      case 'home': {
        screen.append(el('h1', '', START_TEXT.title), el('p', opts.note ? 'error' : '', opts.note ?? START_TEXT.tagline));
        // Sprint 11: saved games first (pass-the-phone, then an online seat left for now).
        const here = this.handlers.savedHere();
        const rejoin = this.handlers.onlineReady() ? this.handlers.rejoinSeat() : null;
        if (here || rejoin) {
          const row = el('div', 'choices');
          if (here) row.append(this.choice('continue-here', START_TEXT.continueGame, continueHereSub(here.turn), 'corp', () => this.handlers.continueHere()));
          if (rejoin) row.append(this.choice('continue-online', continueOnlineLabel(rejoin.code), continueOnlineSub(rejoin.seat), 'corp', () => this.handlers.rejoin()));
          screen.appendChild(row);
        }
        const row = el('div', 'choices');
        row.append(
          this.choice('play-here', START_TEXT.playHere, START_TEXT.playHereSub, 'runner', () => this.show('here')),
          this.choice('play-online', START_TEXT.playOnline, START_TEXT.playOnlineSub, 'corp', () =>
            this.show(this.handlers.onlineReady() ? 'online' : 'not_set_up'),
          ),
          this.choice('decks', DECK_TEXT.decks, DECK_TEXT.decksSub, 'plain', () => this.show('decks')),
        );
        row.classList.add('three');
        screen.appendChild(row);
        break;
      }
      case 'online': {
        screen.append(el('h2', '', START_TEXT.playOnline));
        if (opts.note) screen.append(el('p', 'error', opts.note));
        const row = el('div', 'choices');
        row.append(
          this.choice('start-game', START_TEXT.startGame, START_TEXT.startGameSub, 'runner', () => this.show('pick')),
          this.choice('join-game', START_TEXT.joinGame, START_TEXT.joinGameSub, 'runner', () => this.show('join')),
        );
        screen.appendChild(row);
        break;
      }
      case 'pick': {
        screen.append(el('h2', '', `${START_TEXT.startGame}: ${START_TEXT.pickTitle.toLowerCase()}`));
        const row = el('div', 'choices');
        row.append(
          this.choice('side-corp', 'Corp', START_TEXT.corpSub, 'corp', () => this.pickSide('corp')),
          this.choice('side-runner', 'Runner', START_TEXT.runnerSub, 'runner', () => this.pickSide('runner')),
        );
        screen.append(row, el('p', '', START_TEXT.pickNote));
        break;
      }
      case 'online_deck': {
        // Sprint 14 (S-14-3): the starter's deck for the side just picked.
        const side = opts.side ?? 'corp';
        renderOnlinePicker(screen, this.deckDeps(), side, { title: ONLINE_DECK_TEXT.pickTitle(side), go: ONLINE_DECK_TEXT.start, ...(opts.error ? { error: opts.error } : {}) }, (d) =>
          this.handlers.startOnline(side, d.standard ? undefined : d),
        );
        break;
      }
      case 'choose': {
        // Sprint 14 (S-14-3): the joiner sees their side and picks a deck for it.
        const side = opts.side ?? 'runner';
        const text = { title: ONLINE_DECK_TEXT.youPlay(side), sub: ONLINE_DECK_TEXT.pickTitle(side), go: ONLINE_DECK_TEXT.join, ...(opts.error ? { error: opts.error } : {}) };
        renderOnlinePicker(screen, this.deckDeps(), side, text, (d) => this.handlers.pickOnline(d.standard ? undefined : d));
        break;
      }
      case 'join': {
        screen.append(el('h2', '', START_TEXT.joinTitle));
        const form = el('form', 'code') as HTMLFormElement;
        const input = document.createElement('input');
        input.name = 'code';
        input.placeholder = 'K7QF';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'characters');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('aria-label', 'Game code');
        input.enterKeyHint = 'go';
        input.maxLength = CODE_LENGTH + 4;
        input.value = opts.code ?? '';
        const error = el('p', 'error', opts.error ?? '');
        error.setAttribute('role', 'alert');
        input.addEventListener('input', () => {
          const v = normalizeCode(input.value);
          if (v !== input.value) input.value = v;
          error.textContent = '';
        });
        const submit = this.choice('join', START_TEXT.join, '', 'runner', () => form.requestSubmit());
        submit.type = 'submit';
        form.append(input, submit);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const code = normalizeCode(input.value);
          if (!isGameCode(code)) {
            error.textContent = START_TEXT.badCode;
            return;
          }
          this.handlers.joinOnline(code);
        });
        screen.append(form, error);
        // Open the keyboard straight away (no-op where the browser won't).
        if (!opts.code) queueMicrotask(() => input.focus());
        break;
      }
      case 'not_set_up': {
        screen.append(el('h2', '', START_TEXT.notSetUp), el('p', '', START_TEXT.notSetUpNote));
        const row = el('div', 'choices');
        row.append(this.choice('play-here', START_TEXT.playHere, START_TEXT.playHereSub, 'runner', () => this.show('here')));
        row.style.maxWidth = '320px';
        screen.appendChild(row);
        break;
      }
      case 'message': {
        if (opts.title) screen.append(el('h2', '', opts.title));
        screen.append(el('p', 'busy', opts.message ?? ''));
        break;
      }
      case 'lobby': {
        const code = opts.code ?? '';
        screen.classList.add('dense');
        const big = el('div', 'code-big', code);
        big.dataset.code = code;
        big.setAttribute('aria-label', `Game code ${code.split('').join(' ')}`);
        const row = el('div', 'choices');
        row.style.maxWidth = '280px';
        row.append(this.choice('share', START_TEXT.share, START_TEXT.shareSub, 'runner', () => this.handlers.share(code)));
        const info = el('p', 'busy', opts.message ?? (opts.picking ? ONLINE_DECK_TEXT.friendPicking : START_TEXT.waiting));
        info.dataset.role = 'lobby-status';
        screen.append(el('h2', '', START_TEXT.lobbyTitle), big, el('p', '', START_TEXT.lobbyNote), row, info);
        break;
      }
      case 'decks': {
        this.renderDecks(screen);
        // Sprint 14: opening Decks checks the online copy (and keeps checking while it's open).
        this.handlers.decksOpen(true);
        break;
      }
      case 'deck_code':
        this.renderDeckCode(screen);
        break;
      case 'link':
        this.renderLink(screen, opts);
        break;
      case 'new_deck': {
        const side = opts.side ?? 'corp';
        renderNewDeck(screen, side, (from) => {
          const lib = this.handlers.library;
          const d = lib.create(side, from === 'standard' ? lib.standard(side).cards : null);
          this.show('deck', { deckId: d.id });
        });
        break;
      }
      case 'deck': {
        const lib = this.handlers.library;
        const deck = opts.deckId ? lib.get(opts.deckId) : null;
        if (!deck) {
          this.show('decks');
          return;
        }
        this.editor = new DeckEditor(screen, this.deckDeps(), deck, {
          copy: () => {
            const d = lib.create(deck.side, deck.cards);
            this.show('deck', { deckId: d.id });
          },
          deleted: () => this.show('decks'),
        });
        break;
      }
      case 'here': {
        renderPicker(screen, this.deckDeps(), opts.picks ?? {}, (picked) => {
          const decks: Partial<Record<Side, DeckDef>> = {};
          for (const side of ['corp', 'runner'] as const) if (!picked[side].standard) decks[side] = dealOf(picked[side]);
          this.handlers.playHere(Object.keys(decks).length > 0 ? decks : undefined);
        });
        break;
      }
    }
  }

  /** Sprint 14: Start a game → side: the deck picker if this side has a Ready deck of the player's, else straight on (standard deck). */
  private pickSide(side: Side): void {
    if (hasReadyDeck(this.handlers.library, side)) this.show('online_deck', { side });
    else this.handlers.startOnline(side);
  }

  private renderDecks(screen: HTMLElement): void {
    const sync = this.handlers.deckSync;
    let online: { status: HTMLElement; buttons: HTMLElement[] } | undefined;
    if (sync?.enabled) {
      const status = el('small', 'deck-sync');
      status.dataset.testid = 'deck-sync';
      status.setAttribute('role', 'status');
      online = {
        status,
        buttons: [
          this.smallButton('my-deck-code', SYNC_TEXT.myCode, () => this.show('deck_code')),
          this.smallButton('have-deck-code', SYNC_TEXT.haveCode, () => this.show('link')),
        ],
      };
    }
    renderDeckList(
      screen,
      this.deckDeps(),
      {
        open: (id) => this.show('deck', { deckId: id }),
        newDeck: (side) => this.show('new_deck', { side }),
      },
      online,
    );
    if (sync) this.setSyncLine(sync.status());
  }

  /** The Decks list again (decks from another device), keeping where each column was scrolled. */
  private redrawDecks(): void {
    const tops = [...this.root.querySelectorAll<HTMLElement>('.deck-col')].map((c) => c.scrollTop);
    const screen = el('div', 'screen');
    this.renderDecks(screen);
    this.root.querySelector('.screen')?.replaceWith(screen);
    this.root.querySelectorAll<HTMLElement>('.deck-col').forEach((c, i) => {
      c.scrollTop = tops[i] ?? 0;
    });
  }

  /** The Decks screen's line: "✓ Saved online" / "Saving online…" / "Saved on this device · goes online when you're connected". */
  private setSyncLine(st: SyncStatus): void {
    const line = this.root.querySelector<HTMLElement>('[data-testid="deck-sync"]');
    if (!line) return;
    line.dataset.status = st;
    line.replaceChildren();
    line.className = `deck-sync ${st}`;
    if (st === 'saved') line.append(el('span', 'tick', '✓'), ` ${SYNC_TEXT.saved}`);
    else if (st === 'saving') line.append(SYNC_TEXT.saving);
    else if (st === 'pending') line.append(SYNC_TEXT.pending);
  }

  /** My deck code: the code (asked from the service if this device has none yet), Copy, keep it safe. */
  private renderDeckCode(screen: HTMLElement): void {
    screen.classList.add('dense', 'deck-code');
    screen.append(el('h2', '', SYNC_TEXT.codeTitle));
    const big = el('div', 'code-big deck-code-big', '');
    big.dataset.testid = 'deck-code';
    const status = el('p', 'busy', SYNC_TEXT.gettingCode);
    status.setAttribute('role', 'status');
    const row = el('div', 'choices');
    row.style.maxWidth = '240px';
    const copy = this.choice('copy-deck-code', SYNC_TEXT.copy, '', 'runner', () => {
      const code = big.dataset.code;
      if (!code) return;
      void this.handlers.copy(formatDeckCode(code)).then((ok) => {
        if (ok) this.toast(SYNC_TEXT.copied, true);
      });
    });
    copy.hidden = true;
    row.append(copy);
    screen.append(big, row, status);
    const show = (code: string) => {
      big.dataset.code = code;
      big.textContent = formatDeckCode(code);
      big.setAttribute('aria-label', `Deck code ${code.split('').join(' ')}`);
      copy.hidden = false;
      status.className = '';
      status.textContent = `${SYNC_TEXT.codeNote} ${SYNC_TEXT.keepSafe}`;
    };
    const sync = this.handlers.deckSync;
    if (sync?.code) {
      show(sync.code);
      return;
    }
    const ask = this.ask;
    void (sync ? sync.myCode() : Promise.resolve({ ok: false as const, reason: 'network' as const })).then((r) => {
      if (ask !== this.ask) return;
      if (r.ok) show(r.code);
      else {
        status.className = 'error';
        status.textContent = r.reason === 'wait' ? SYNC_TEXT.waitNew(r.waitMs) : SYNC_TEXT.noService;
      }
    });
  }

  /** I have a deck code: type it, Link; wrong codes and the wait after too many say so. */
  private renderLink(screen: HTMLElement, opts: ShowOptions): void {
    screen.classList.add('dense');
    screen.append(el('h2', '', SYNC_TEXT.linkTitle));
    const form = el('form', 'code deck-link') as HTMLFormElement;
    const input = document.createElement('input');
    input.name = 'deck-code';
    input.placeholder = 'KX4P-9MTR-QZ7D';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-label', 'Deck code');
    input.dataset.testid = 'deck-code-input';
    input.enterKeyHint = 'go';
    input.maxLength = DECK_CODE_LENGTH + 8;
    input.value = opts.code ? formatDeckCode(opts.code) : '';
    const error = el('p', 'error', opts.error ?? '');
    error.setAttribute('role', 'alert');
    error.dataset.testid = 'deck-link-error';
    input.addEventListener('input', () => {
      const v = formatDeckCode(normalizeCode(input.value).slice(0, DECK_CODE_LENGTH));
      if (v !== input.value) input.value = v;
      error.textContent = '';
    });
    const submit = this.choice('link-deck-code', SYNC_TEXT.link, '', 'runner', () => form.requestSubmit());
    submit.type = 'submit';
    form.append(input, submit);
    const sync = this.handlers.deckSync;
    let busy = false;
    const lock = () => {
      const wait = (sync?.lockUntil ?? 0) - Date.now();
      const locked = wait > 0;
      input.disabled = locked;
      submit.setAttribute('aria-disabled', String(locked));
      submit.classList.toggle('dim', locked);
      if (!locked) return;
      error.textContent = SYNC_TEXT.wait(wait);
      if (this.lockTimer !== null) clearTimeout(this.lockTimer);
      // Re-check once a minute (the minutes count down) and when the wait ends.
      this.lockTimer = setTimeout(() => {
        this.lockTimer = null;
        if (this.current !== 'link') return;
        if ((sync?.lockUntil ?? 0) - Date.now() <= 0) error.textContent = '';
        lock();
      }, Math.min(wait + 50, 60_000));
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (busy || input.disabled) return;
      const code = normalizeCode(input.value);
      if (code.length !== DECK_CODE_LENGTH) {
        error.textContent = SYNC_TEXT.badCode;
        return;
      }
      if (!sync) {
        error.textContent = SYNC_TEXT.noService;
        return;
      }
      busy = true;
      error.className = 'busy';
      error.textContent = SYNC_TEXT.linking;
      const ask = this.ask;
      void sync.link(code).then((r) => {
        if (ask !== this.ask) return;
        busy = false;
        error.className = 'error';
        if (r.ok) {
          this.show('decks');
          this.toast(SYNC_TEXT.linked, true);
          return;
        }
        error.textContent = r.reason === 'bad_code' ? SYNC_TEXT.badCode : r.reason === 'no_decks' ? SYNC_TEXT.noDecks : r.reason === 'wait' ? SYNC_TEXT.wait(r.waitMs) : SYNC_TEXT.noService;
        lock();
      });
    });
    screen.append(form, error, el('p', 'online-note', SYNC_TEXT.linkNote));
    lock();
    if (!input.disabled && !opts.code) queueMicrotask(() => input.focus());
  }

  private smallButton(action: string, label: string, fn: () => void): HTMLButtonElement {
    const b = el('button', 'deck-act') as HTMLButtonElement;
    b.type = 'button';
    b.dataset.action = action;
    b.textContent = label;
    tapNow(b, fn);
    return b;
  }

  /** Sprint 13 (test hook): what the editor's zoom shows, or null. */
  zoomInfo(): ZoomInfo | null {
    return this.editor?.zoomInfo() ?? null;
  }

  /** A short note at the bottom that fades by itself (never blocks a tap). `good`: a success note (green). */
  toast(text: string, good = false): void {
    if (!this.toastEl) {
      this.toastEl = el('div', 'toast');
      this.toastEl.setAttribute('role', 'status');
      this.toastEl.dataset.testid = 'toast';
      this.root.appendChild(this.toastEl);
    }
    const t = this.toastEl;
    t.textContent = text;
    t.classList.toggle('good', good);
    t.classList.add('on');
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }

  private deckDeps() {
    return { library: this.handlers.library, zoomFace: (id: string) => this.handlers.zoomFace(id), toast: (text: string) => this.toast(text) };
  }

  /** The lobby's status line (e.g. "Link copied…"), while the lobby shows. */
  setLobbyStatus(text: string): void {
    const p = this.root.querySelector<HTMLElement>('[data-role="lobby-status"]');
    if (p) p.textContent = text;
  }

  private choice(action: string, label: string, sub: string, side: Side | 'plain', onTap: () => void): HTMLButtonElement {
    const b = el('button', `choice ${side}`) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.action = action;
    b.append(el('b', '', label));
    if (sub) b.append(el('small', '', sub));
    tapNow(b, onTap);
    return b;
  }
}

/** "Continue game · K7QF" (the game code, so nobody retypes it). */
export function continueOnlineLabel(code: string): string {
  return `${START_TEXT.continueGame} · ${code}`;
}

/** The Continue button's small line for the pass-the-phone save: "On this device · Runner's turn". */
export function continueHereSub(turn: Side | null): string {
  return turn ? `On this device · ${SIDE_NAME[turn]}'s turn` : 'On this device';
}

/** The online Continue's small line: "Online · you play the Corp". */
export function continueOnlineSub(seat: Side): string {
  return `Online · you play the ${SIDE_NAME[seat]}`;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Press feedback on pointer down, action on `click` (keyboard and screen
 * readers too). Phones send `click` right after the finger lifts (the page has
 * width=device-width, so there is no 300 ms tap delay).
 */
function tapNow(b: HTMLElement, onTap: () => void): void {
  b.addEventListener('pointerdown', () => b.classList.add('pressed'));
  for (const t of ['pointerup', 'pointercancel', 'pointerleave'] as const) b.addEventListener(t, () => b.classList.remove('pressed'));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onTap();
  });
}
