// Types for the Playwright test hook (`window.__overclock`).
// Shared by the client (src) and the e2e specs, so keep this file type-only.
import type { Action, GameEvent, PlayerView, RunStep, RunView, Side } from '@overclock/engine';

/** Axis-aligned box in CSS pixels, relative to the page viewport. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Distances (CSS px) from each screen edge covered by a notch / status bar / gesture bar. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** One side's widgets, wherever they are drawn (top or bottom row). */
export interface SideLayout {
  deck: Box;
  credits: Box;
  clicks: Box;
  discard: Box;
  label: Box;
}

/** An installed card as drawn. */
export interface InstalledSnapshot {
  uid: string;
  /** null when it is face down to the viewer (the view never told the client what it is). */
  cardId: string | null;
  faceUp: boolean;
  /** Drawn bounds (ICE: sideways, wider than tall). */
  box: Box;
  /** The advancement counter drawn on it ("2"), or null when none is shown. */
  counter: string | null;
}

export interface ServerSnapshot {
  id: string;
  /** On-screen name: "HQ", "R&D", "Archives", "Server 1", ... */
  label: string;
  /** The whole column (tap target while lit). */
  box: Box;
  labelBox: Box;
  /** HQ marker / R&D deck / Archives pile (central servers). */
  root: Box | null;
  /** ICE, index 0 innermost. */
  ice: InstalledSnapshot[];
  content: InstalledSnapshot[];
}

/** A place a picked hand card can go, lit while the card is picked. */
export interface TargetSnapshot {
  /**
   * server / new_server / install / play: where a picked hand card can go
   * (play with `server`: a run event that names its server, e.g. Inside Job).
   * run: a server lit after tapping Run. advance / score: a picked installed agenda's choices.
   * free_rez / skip (S-04-4): the Corp's free-rez choice after scoring Priority Requisition
   * (each offered ICE, with `uid`; Skip in the Play slot).
   */
  kind: 'server' | 'new_server' | 'install' | 'play' | 'run' | 'advance' | 'score' | 'free_rez' | 'skip';
  /** For server targets (and run / server-named play targets). */
  server?: string;
  /** For advance / score: the installed card. */
  uid?: string;
  box: Box;
  /** The price label, e.g. "Install · 1 credit". */
  label: string;
  /** Bright (the engine would accept it) vs dim (shown with its price, refused with a hint). */
  lit: boolean;
  /** The engine's reason it would be refused (from view.handOptions). */
  reject: string | null;
}

/** A big button in the run panel (or the Run button), drawn from engine options. */
export interface PanelButtonSnapshot {
  label: string;
  /** Bright (the engine would accept it) vs dim (shown, refused with a hint when tapped). */
  lit: boolean;
  reject: string | null;
  box: Box;
  /** The action it submits (as the deciding seat). */
  action: Action;
  /** The label's text size as drawn, after any shrink to fit (px; QA-S3-4). */
  fontPx: number;
}

/** The run tracker and its decision panel. */
export interface RunSnapshot {
  server: string;
  step: RunStep;
  /** The seat the buttons act for (the Corp at approach, otherwise the Runner). */
  deciding: Side;
  /** Panel title, e.g. "Run on Server 1", and the step line, e.g. "Rez Wall of Static?". */
  title: string;
  stepLabel: string;
  /** Info lines (ICE name and strength, breaker strengths, next stop). */
  lines: string[];
  /** The current ICE's subroutines as listed (broken ones crossed out). */
  subroutines: { text: string; broken: boolean }[];
  /** The highlighted ICE (approached / encountered / just passed), null at the server. */
  iceUid: string | null;
  /** The current ICE's box, or the server column at access. */
  highlight: Box | null;
  /** The run's server column (outlined for the whole run). */
  serverBox: Box;
  /** The info panel's area. */
  infoBox: Box;
  /** The smallest text size in the info panel as drawn, after any shrink to fit (px; QA-S3-4). */
  infoFontPx: number;
  buttons: PanelButtonSnapshot[];
  /** Accessed cards, drawn large. */
  access: { cards: { cardId: string | null; stolen: boolean; box: Box }[] } | null;
}

export interface ScoreSnapshot {
  /** "Corp 1 point", "Runner 2 points". */
  text: string;
  box: Box;
}

export interface LayoutSnapshot {
  /** 'landscape' on sideways phones, 'portrait' (the column) elsewhere. */
  mode: 'landscape' | 'portrait';
  viewport: { width: number; height: number };
  /** Safe-area insets the layout used (env(safe-area-inset-*), read from #safe-probe). */
  safeArea: Insets;
  /** The seat drawn at the bottom (the active player in hot-seat). */
  viewer: Side;
  corp: SideLayout;
  runner: SideLayout;
  /** The area reserved for the viewer's hand. */
  handArea: Box;
  /** Rendered hand cards (the viewer's), in hand order. `marked` = picked for discard, `selected` = picked to play. */
  /** `outlined`: the card a hold-and-slide shows in the zoom (S-04-3). */
  hand: { cardId: string; box: Box; marked: boolean; selected: boolean; outlined: boolean }[];
  /** Corp servers in view order (hq, rd, archives, remotes). */
  servers: ServerSnapshot[];
  /** The Runner's installed cards, install order. */
  rig: InstalledSnapshot[];
  memory: { used: number; limit: number; text: string; box: Box };
  /** Lit targets for the picked hand card (empty when none is picked). */
  targets: TargetSnapshot[];
  /** Hand index picked to play, or null. */
  selected: number | null;
  /** Every board text on screen (labels, counters, buttons; not card faces). */
  labels: string[];
  /** Text shown on screen, so tests can read the canvas. */
  text: {
    banner: string;
    corpCredits: string;
    corpClicks: string;
    runnerCredits: string;
    runnerClicks: string;
    /** Hand-count text in each side's label, e.g. "6 cards in HQ", "5 cards in Grip". */
    corpHand: string;
    runnerHand: string;
    /** Count badge on each discard pile. */
    corpDiscard: string;
    runnerDiscard: string;
    /** The help text (rail / control strip), '' while hidden. */
    help: string;
  };
  /** S-04-4: the status notes by each side's credits ("Bad publicity 1", "+1 for this run"), null while hidden. */
  tags: { corp: { text: string; box: Box } | null; runner: { text: string; box: Box } | null };
  /** End turn button; null while the discard picker shows or the game is over. */
  endTurn: { box: Box; label: string; glowing: boolean; enabled: boolean } | null;
  /** Hand-limit discard picker, when the viewer must discard. */
  picker: { remaining: number; label: string; confirm: { box: Box; enabled: boolean } } | null;
  /** text = title + ": " + reason, e.g. "Runner wins: 7 agenda points". */
  gameOver: { text: string; title: string; reason: string; box: Box; button: string; buttonBox: Box } | null;
  /** Sprint 6: the status line over the board (online: reconnecting, the other player away), if showing. */
  status: { text: string; box: Box } | null;
  /** The run tracker and its buttons, while a run is on. */
  run: RunSnapshot | null;
  /** The Runner's Run button (rail), when the view offers runs; `picking` while servers are lit. */
  runButton: { box: Box; label: string; lit: boolean; picking: boolean } | null;
  /** Both sides' points, shown to both seats. */
  score: Record<Side, ScoreSnapshot>;
  /** uid of the installed card picked for its choices (Corp agendas: Advance / Score), or null. */
  selectedInstalled: string | null;
  /** The transient hint toast, if one is visible. */
  hint: { text: string; box: Box } | null;
  /**
   * The long-press zoomed card, if one is open, with every text it renders.
   * cardId is null for a face-down card the viewer may not see. `textOverflow`
   * is true if any text runs outside the card.
   */
  zoom: {
    cardId: string | null;
    box: Box;
    texts: string[];
    textOverflow: boolean;
    /**
     * S-05-3: the cards shown smaller behind it (hand and list zooms), left to
     * right. `offset`: slots from the zoomed card (-2..2, final, even mid-slide);
     * `box`: where it is drawn now; `full`: false while a stand-in shows.
     */
    carousel: { cardId: string; index: number; offset: number; box: Box; full: boolean }[];
  } | null;
  /**
   * S-05-2: what the ICE just did ("Enigma: you lost 1 click. Enigma ended your run."),
   * shown until the next tap anywhere (that tap only closes it). `box`: the message.
   */
  report: { text: string; box: Box } | null;
  /**
   * S-05-1: the Last run button (while the view has a last run) and its strip
   * of found cards (while open; hold a card to zoom it).
   */
  lastRun: {
    button: { box: Box; label: string } | null;
    strip: { title: string; box: Box; cards: { cardId: string; from: string; box: Box }[] } | null;
  };
  /** S-04-2: the "Leave the game?" question, if showing. */
  dialog: { title: string; text: string; box: Box; buttons: { label: string; box: Box }[] } | null;
  /** S-06-5: the opaque "Pass the phone" cover, if showing (`to`: who should take the phone). */
  cover: { to: Side; title: string; line: string; box: Box; content: Box } | null;
  /** S-04-1: the build date as shown ("Built 2026-11-13 14:32 UTC"), or null while hidden. */
  buildLabel: { text: string; box: Box } | null;
  /** True while any event animation runs (never blocks input). */
  animating: boolean;
}

export type AnimKind =
  /** S-06-5: the "Pass the phone" cover was tapped away (the board shows on the next frame). */
  | 'cover_lifted'
  | 'draw_flight'
  | 'credit_pop'
  | 'discard_flight'
  | 'turn_change'
  | 'hint'
  /** A hand card flies to its server / the Runner's row. */
  | 'install_flight'
  /** An operation/event flies to its owner's discard pile. */
  | 'play_flight'
  /** A new remote server's column appears. */
  | 'server_open'
  /** The ICE flips face up. */
  | 'ice_rez'
  /** A run step moves the tracker (approach, encounter, pass, access). */
  | 'run_step'
  /** A subroutine is crossed out. */
  | 'sub_broken'
  /** A subroutine happens (flash on the ICE, with a notice). */
  | 'sub_fired'
  /** A breaker's strength changes. */
  | 'strength_pop'
  /** Net damage: Grip cards fly to the Heap. */
  | 'net_damage'
  /** The Runner loses clicks. */
  | 'clicks_lost'
  /** A stolen or scored agenda flies to its score. */
  | 'score_flight'
  /** A trashed card flies to Archives. */
  | 'trash_flight'
  /** An advancement counter is added. */
  | 'advance_pop'
  /** A short non-blocking notice (run result, damage, bypass). */
  | 'notice'
  /** S-04-3: a hold-and-slide put another hand card in the zoom (`text`: its card id). */
  | 'zoom_swap'
  /** S-05-3: the carousel behind the zoom slides (`text`: the newly zoomed card id). */
  | 'carousel_slide'
  /** S-05-2: the ICE report opened (`text`: its words). */
  | 'ice_report'
  /** S-04-4: a status note pops (bad publicity taken, run-only credits gained or spent). */
  | 'tag_pop'
  /** S-04-4: the free-rez choice lights the offered ICE. */
  | 'choice_open';

/** Logged when an animation or hint starts. */
export interface AnimRecord {
  kind: AnimKind;
  /** performance.now() when it was started (same clock as event.timeStamp). */
  startedAt: number;
  /** Total scheduled duration including stagger delays (ms). Hints never block input. */
  scheduledMs: number;
  /** Hint text. */
  text?: string;
  /** Where it was shown (hints: the toast's final box). */
  box?: Box;
  /** Hints: the text size as drawn on screen (CSS px, after any fit-to-slot scaling). */
  fontPx?: number;
  /** zoom_swap: the input event's time (performance.now() clock) that caused it. */
  inputAt?: number;
  /** zoom_swap: true if the face was drawn ahead (QA-S4-1), false if it was drawn on the spot. */
  predrawn?: boolean;
}

/** Timestamps (performance.now() clock) of the last pointer release handled by a target. */
export interface InputStamp {
  /** The DOM event's timeStamp (when the browser saw the release). */
  eventAt: number;
  /** When the game's input handler started on it; budgets count from here. */
  handledAt: number;
  /** The label of the display object that handled it (e.g. "deck:corp", "target:install:"). */
  target?: string;
}

/** The game's own End turn clock (performance.now() timestamps; 0 before the first turn change). */
export interface EndTurnClock {
  /**
   * End turn ignores taps *made* before this (double-tap guard: 300ms after the event
   * time of the tap that ended the last turn). Taps are judged by their DOM event
   * timestamp (`InputStamp.eventAt`), not by when the game got to handle them.
   */
  armedAt: number;
  /** When the last turn change's board flip is scheduled (after any discard flight). */
  flipDueAt: number;
}

export interface OverclockTestHook {
  /** The bottom seat's view. */
  getView(): PlayerView;
  /** The other seat's run view while the game waits on it mid-run (the Corp's rez choice), else null. */
  decision(): { seat: Side; run: RunView } | null;
  /** Submits as seat `action.player`; returns that seat's projected events. */
  dispatch(action: Action): GameEvent[];
  lastEvents(): GameEvent[];
  layout(): LayoutSnapshot;
  anims(): AnimRecord[];
  clearAnims(): void;
  /** The last pointer release a game target handled (null before the first). */
  lastInput(): InputStamp | null;
  endTurn(): EndTurnClock;
  /**
   * Where a small (hand / installed) face of `cardId` drawn at w x h puts its
   * name and type label, card-local with (0, 0) at the card's center. Null for an unknown id.
   */
  smallFace(cardId: string, width: number, height: number): SmallFaceSnapshot | null;
  /** S-04-2: presses the phone's Back button (same handler as the app's); returns what it did. */
  back(): 'close_dialog' | 'close_zoom' | 'close_panel' | 'exit' | 'ask_leave';
  /** How many times the game asked to close the app (Leave, or Back after the game ended). Web only counts. */
  exitRequests(): number;
  /** Sprint 6: the online game's state (null in pass-the-phone). */
  online(): {
    code: string | null;
    seat: Side;
    phase: 'connecting' | 'lobby' | 'playing' | 'failed';
    connection: 'local' | 'connecting' | 'open' | 'reconnecting' | 'closed';
    opponent: 'none' | 'here' | 'away';
    busy: boolean;
  } | null;
  /** S-05-3: pins whether drawn frames count as slow (slow: the carousel jumps instead of sliding). */
  frameSpeed(mode: 'fast' | 'slow' | 'measured'): void;
}

export interface SmallFaceSnapshot {
  name: Box;
  type: Box;
  nameFontPx: number;
  nameText: string;
}

declare global {
  interface Window {
    __overclock?: OverclockTestHook;
    /** S-06-1: which start-screen page shows (null once a game is on). Set at load, before a game starts. */
    __overclockStart?: {
      screen(): string | null;
      /** The phone's Back button (same handler as the app's). */
      back(): 'close_dialog' | 'close_zoom' | 'close_panel' | 'exit' | 'ask_leave';
      exitRequests(): number;
      /** Starts an online game as `side`; `test` (seed + prelude) only works against a service in test mode. */
      startOnline(side: Side, test?: { seed: number; actions: Action[] }): void;
    };
  }
}
