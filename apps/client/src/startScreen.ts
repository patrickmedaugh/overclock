// S-06-1: the start screen. A DOM overlay over the canvas (the code needs a
// real text field and the phone's keyboard): Play on this phone / Play online
// -> Start a game (pick Corp or Runner) / Join with code. No game logic: it
// only asks the handlers to start or join.
import type { Side } from '@overclock/engine';
import { CODE_LENGTH, isGameCode, normalizeCode } from '@overclock/protocol';
import './start.css';

export const START_TEXT = {
  title: 'OVERCLOCK',
  tagline: 'A two-player hacking card game',
  playHere: 'Play on this phone',
  playHereSub: 'Pass the phone between turns',
  playOnline: 'Play online',
  playOnlineSub: 'Each player on their own phone',
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
  notSetUpNote: 'Play on this phone works now.',
  back: 'Back',
  rejoin: 'Rejoin game',
  rejoinSub: 'Back to your seat',
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
  version: 'This copy of the game is out of date. Reload the page, or update the app.',
  expired: 'That game has ended.',
  bad_token: 'That seat belongs to another phone now.',
  replaced: 'This game was opened on another screen.',
  bad_message: 'Something went wrong. Try again.',
};

export type StartScreenName = 'home' | 'online' | 'pick' | 'join' | 'not_set_up' | 'message' | 'lobby';

export interface StartHandlers {
  /** Start a pass-the-phone game. */
  playHere(): void;
  /** True when this build knows the online service's address. */
  onlineReady(): boolean;
  /** Start an online game playing `side`. */
  startOnline(side: Side): void;
  /** Join the online game with this (normalised, well-formed) code. */
  joinOnline(code: string): void;
  /** The code of a game this phone has a seat in (offered as Rejoin), or null. */
  rejoinCode(): string | null;
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
};

export class StartScreen {
  readonly root: HTMLElement;
  private current: StartScreenName = 'home';

  constructor(
    parent: HTMLElement,
    private readonly handlers: StartHandlers,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'start';
    parent.appendChild(this.root);
    this.show('home');
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
    const to = PARENT[this.current];
    if (to === null) return false;
    if (this.current === 'message' || this.current === 'lobby') this.handlers.cancel();
    this.show(to);
    return true;
  }

  show(name: StartScreenName, opts: { code?: string; error?: string; message?: string; title?: string; note?: string } = {}): void {
    this.current = name;
    this.root.hidden = false;
    this.root.dataset.screen = name;
    this.root.replaceChildren();
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
        const rejoin = this.handlers.onlineReady() ? this.handlers.rejoinCode() : null;
        if (rejoin) {
          const row = el('div', 'choices');
          row.append(this.choice('rejoin', `${START_TEXT.rejoin} ${rejoin}`, START_TEXT.rejoinSub, 'corp', () => this.handlers.rejoin()));
          screen.appendChild(row);
        }
        const row = el('div', 'choices');
        row.append(
          this.choice('play-here', START_TEXT.playHere, START_TEXT.playHereSub, 'runner', () => this.handlers.playHere()),
          this.choice('play-online', START_TEXT.playOnline, START_TEXT.playOnlineSub, 'corp', () =>
            this.show(this.handlers.onlineReady() ? 'online' : 'not_set_up'),
          ),
        );
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
          this.choice('side-corp', 'Corp', START_TEXT.corpSub, 'corp', () => this.handlers.startOnline('corp')),
          this.choice('side-runner', 'Runner', START_TEXT.runnerSub, 'runner', () => this.handlers.startOnline('runner')),
        );
        screen.append(row, el('p', '', START_TEXT.pickNote));
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
        row.append(this.choice('play-here', START_TEXT.playHere, START_TEXT.playHereSub, 'runner', () => this.handlers.playHere()));
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
        const info = el('p', 'busy', opts.message ?? START_TEXT.waiting);
        info.dataset.role = 'lobby-status';
        screen.append(el('h2', '', START_TEXT.lobbyTitle), big, el('p', '', START_TEXT.lobbyNote), row, info);
        break;
      }
    }
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
