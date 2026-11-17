// Must come first: makes Pixi generate shaders/uniform code without
// `new Function`, so the game runs under a strict Content Security Policy
// (no 'unsafe-eval'; see vite.config.ts) and in locked-down WebViews.
import 'pixi.js/unsafe-eval';
import { getCard } from '@overclock/cards';
import type { Action, GameEvent, Side } from '@overclock/engine';
import { Application, updateRenderGroupTransforms } from 'pixi.js';
import { Board } from './board';
import { fullFaceInfo, setCardRenderer, smallFaceLayout } from './cardFace';
import { forceFrameSpeed, noteDraw, noteTick } from './frameClock';
import type { BackAction } from './back';
import type { AnimRecord } from './hook-types';
import { HotSeat, seedFromUrl } from './hotseat';
import { joinCodeFromUrl, shareLink, shareText } from './links';
import { lastInput } from './input';
import { coverFor, coverText } from './passCover';
import { readSafeArea } from './safeArea';
import type { Session } from './session';
import { FAIL_TEXT, START_TEXT, StartScreen, continueOnlineLabel } from './startScreen';
import { OnlineMatch, type StoreLike, browserDeps, forgetStoredSeat, readStoredSeat, seatOutdated } from './online';
import { type HotSeatSave, SaveWriter, forgetHotSeatSave, readHotSeatSave } from './savedGame';
import { SIDE_NAME } from './terms';
import { theme } from './theme';
import { Tweens } from './tween';

async function start(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('#app missing');

  const app = new Application();
  await app.init({
    resizeTo: window,
    background: theme.bg,
    // MSAA only where pixels are big; on 2x+ screens it doubles fill cost for no gain.
    antialias: (window.devicePixelRatio || 1) < 2,
    autoDensity: true,
    // Cap at 2x: 3x phones cost 2.25x the pixels for little visible gain.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
  });
  host.appendChild(app.canvas);
  setCardRenderer(app.renderer);
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const params = new URLSearchParams(window.location.search);
  // Test-only switches (left out of the Android app with the test hook; DECISIONS 2026-11-13):
  // `cover=off` plays pass-the-phone without the S-06-5 cover (the specs written
  // before it), `server=` points "Play online" at a local service.
  const coverOn = !(__TEST_HOOK__ && params.get('cover') === 'off');
  // `server=none`: as if no online service was set up.
  const serverParam = __TEST_HOOK__ ? params.get('server') : null;
  const serverUrl = serverParam === 'none' ? '' : (serverParam ?? __SERVER_URL__);
  // `decks=starter`: pass-the-phone with the Sprint 7 15/17-card decks and no identities
  // (the specs written before Sprint 8 keep their deals). Production always plays the core decks.
  const deckSet = __TEST_HOOK__ && params.get('decks') === 'starter' ? ('starter' as const) : null;
  /** The start screen's address (a reload there forgets the board; test switches for the service stay). */
  const startUrl = () => `${window.location.pathname}${serverParam !== null ? `?server=${encodeURIComponent(serverParam)}` : ''}`;
  let storage: StoreLike | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  // Sprint 11 (S-11-3): the pass-the-phone game saves itself after every accepted move
  // (off the tap path), and at once when the page is hidden or closed.
  const saver = new SaveWriter(storage);
  window.addEventListener('pagehide', () => saver.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saver.flush();
  });

  // The game being played (null on the start screen). The board talks only to the Session interface.
  let game: Session | null = null;
  // fx: event animations (skippable). ui: feedback, hints, zoom (never skipped).
  const fx = new Tweens();
  const ui = new Tweens();

  // Animation log for the test hook: one record per animation/hint start.
  const records: AnimRecord[] = [];
  const log = (r: Omit<AnimRecord, 'startedAt'>) => {
    records.push({ ...r, startedAt: performance.now() });
    if (records.length > 200) records.splice(0, records.length - 200);
  };

  // Render on demand: only while something moves or after a change.
  // Idle boards cost no GPU time (battery on phones, CPU in CI).
  let dirty = true;
  // Pixi hit-tests against world transforms, which are otherwise refreshed only
  // when a frame is drawn. A tap that lands before the next frame (a fast tap on
  // a just-lit target, a tap right after a turn change) must hit what is on
  // screen now, so changes from input refresh transforms at once (no draw).
  const invalidate = () => {
    dirty = true;
    const group = app.stage.renderGroup;
    if (group) updateRenderGroupTransforms(group, true);
  };

  // Test hook: every action the board sent (Sprint 9 stub checks).
  const sent: Action[] = [];
  const dispatch = (action: Action): GameEvent[] => {
    if (!game) return [];
    if (__TEST_HOOK__) sent.push(action);
    game.submit(action);
    return game.lastEvents();
  };
  const seat = (): Side => game?.seat ?? 'corp';
  // Taps act for the seat at the bottom (pass-the-phone: always the active
  // player). It switches the moment the turn passes, even while the flip still animates.
  const board = new Board(fx, ui, {
    onDeckTap: () => dispatch({ type: 'draw', player: seat() }),
    onCreditsTap: () => dispatch({ type: 'gain_credit', player: seat() }),
    onEndTurn: () => dispatch({ type: 'end_turn', player: seat() }),
    onDiscard: (handIndices) => dispatch({ type: 'discard', player: seat(), handIndices }),
    // Install / play actions come straight from the view's handOptions.
    onAction: (action) => dispatch(action),
    // Pass-the-phone: a new game straight away (same test switches). Online: Back to start.
    onNewGame: () => newGame(),
    changed: () => invalidate(),
    // S-07-6: a dragged card moved: drawn on the next frame (no hit-test refresh per move).
    redraw: () => {
      dirty = true;
    },
    log,
    buildTime: __BUILD_TIME__,
  });
  app.stage.addChild(board.stage);

  app.ticker.remove(app.render, app);
  // Large frame gaps (slow device, background tab) advance tweens by real
  // time, up to 250ms, so animations finish on wall-clock budget.
  app.ticker.minFPS = 4;
  app.ticker.add((t) => {
    noteTick(t.elapsedMS);
    // Only frames where a tween actually moved something are drawn: a hint
    // sitting on screen (waiting for its fade-out) costs no GPU time.
    const fxMoved = fx.tick(t.deltaMS);
    const uiMoved = ui.tick(t.deltaMS);
    if (dirty || fxMoved || uiMoved) {
      dirty = false;
      app.render();
      noteDraw();
    }
  });

  let lastKey = '';
  const relayout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const insets = readSafeArea();
    const key = `${w}x${h}:${insets.top},${insets.right},${insets.bottom},${insets.left}`;
    if (key === lastKey) return;
    lastKey = key;
    app.renderer.resize(w, h);
    board.setViewport(w, h, insets);
    invalidate();
  };
  relayout();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  // Insets can settle a moment after an orientation change on iOS.
  window.visualViewport?.addEventListener('resize', relayout);
  // S-04-2: the GPU can drop the drawing surface (low memory, the app sent to
  // the background). Pixi restores the context; every baked card picture is
  // then gone, so the board draws everything again (after Pixi's own handler).
  app.canvas.addEventListener('webglcontextrestored', () => board.redrawAll());

  // S-04-2: the phone's Back button. Closing the app exists only in the app;
  // the web build counts the request (for the tests).
  let exitRequests = 0;
  const exit = (): void => {
    exitRequests++;
    if (__NATIVE__) void import('@capacitor/app').then(({ App }) => App.exitApp());
  };
  // Pass-the-phone: Leave closes the app (the game is saved). Online, Leave for now keeps the seat and goes to the start screen.
  let leaveGame: () => void = exit;
  let newGame = (): void => window.location.assign(`${window.location.pathname}?play=here${coverOn ? '' : '&cover=off'}`);
  const back = (): BackAction => {
    if (game) return board.back(leaveGame);
    // The start screen: Back steps back one screen; on the first screen it closes the app.
    if (start.back()) return 'close_panel';
    exit();
    return 'exit';
  };
  if (__NATIVE__) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('backButton', () => back());
      // Back from another app: draw every card again (none blank); an online game catches up.
      void App.addListener('resume', () => {
        board.redrawAll();
        wake();
      });
    });
  }

  // The Android app's SystemBars plugin sets --safe-area-inset-* on <html>
  // whenever the insets change (after load, on rotation): lay out again then.
  new MutationObserver(relayout).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  // Sprint 6: an online game wakes up when the page shows again or the network returns.
  let online: OnlineMatch | null = null;
  const wake = () => online?.wake();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake();
  });
  window.addEventListener('online', wake);

  /** Test hook: wall-clock ms (`Date.now()` scale) when the board last took a presentation; 0 before. */
  let shownAt = 0;
  /**
   * Plays `session` on the board (from the start screen, or at once with `?play=here`).
   * `coverTo`: a restored pass-the-phone game opens behind the "Pass to …" cover for that seat.
   */
  const play = (session: Session, coverTo?: Side): void => {
    game = session;
    start.hide();
    if (session instanceof HotSeat) {
      // One save slot: a new game replaces the old save straight away.
      session.onSaved((g) => saver.mark(g));
      saver.mark(session);
    }
    if (session instanceof OnlineMatch) {
      const m = session;
      board.setOnline(true);
      leaveGame = () => {
        m.leave();
        window.location.assign(startUrl());
      };
      newGame = () => {
        m.forget();
        window.location.assign(startUrl());
      };
      const showStatus = () => board.setStatus(onlineStatusText(m));
      m.onStatus(showStatus);
      m.onPhase(showStatus);
      // After the first draw (the status line is placed on the board's layout).
      queueMicrotask(showStatus);
    }
    // The other seat's decision the board showed before each change (for the S-06-5 covers).
    let shownDecision = session.decision()?.seat ?? null;
    session.onPresent((p) => {
      board.show(p);
      // Test hook: when the board last took a new view (wall clock), so specs can time a move's
      // arrival without counting the test machine's (software) drawing of the frames after it.
      if (__TEST_HOOK__) shownAt = performance.timeOrigin + performance.now();
      if (coverOn && session.kind === 'hotseat') {
        const cover = coverFor(p, shownDecision);
        if (cover) board.setCover(cover);
      }
      shownDecision = p.kind === 'same' ? (p.decision?.seat ?? null) : null;
      invalidate();
    });
    board.render(session.view(), [], session.decision());
    // Sprint 11: nothing of a restored game shows until the right player takes the phone.
    if (coverOn && coverTo) board.setCover(coverText(coverTo));
    invalidate();
    // Test hook for Playwright. Left out of the Android app (__TEST_HOOK__ is a
    // compile-time constant, so the bundler drops this whole block there).
    if (__TEST_HOOK__) {
      window.__overclock = {
        getView: () => session.view(),
        decision: () => session.decision(),
        stub: (view, events, decision) => {
          board.show({ kind: 'same', view, events, decision });
          invalidate();
        },
        sent: () => sent.slice(),
        dispatch,
        lastEvents: () => session.lastEvents(),
        layout: () => board.snapshot(),
        anims: () => records.map((r) => ({ ...r, box: r.box ? { ...r.box } : undefined })),
        clearAnims: () => {
          records.length = 0;
        },
        lastInput,
        endTurn: () => board.endTurnClock(),
        smallFace: (cardId, width, height) => {
          const def = getCard(cardId);
          return def ? smallFaceLayout(def, width, height) : null;
        },
        fullFace: (cardId, width, height) => {
          const def = getCard(cardId);
          const z = width !== undefined && height !== undefined ? { width, height } : board.zoomSize();
          if (!def || !z) return null;
          const f = fullFaceInfo(def, z.width, z.height);
          return { width: z.width, height: z.height, texts: f.texts, textOverflow: f.overflow, stats: f.stats };
        },
        back,
        exitRequests: () => exitRequests,
        frameSpeed: (mode) => forceFrameSpeed(mode),
        online: () =>
          online && game === online
            ? { code: online.gameCode, seat: online.seat, phase: online.phase.kind, ...online.status(), busy: online.busy, shownAt }
            : null,
      };
    }
  };
  const playHere = () => play(new HotSeat(seedFromUrl(window.location.search), deckSet ? { deckSet } : undefined));

  // Sprint 11: the saved pass-the-phone game, read (replayed) once, when the start screen first asks.
  let hereSave: HotSeatSave | null = null;
  const savedHere = (): HotSeatSave => (hereSave ??= readHotSeatSave(storage));
  const continueHere = (): void => {
    const saved = savedHere();
    hereSave = { kind: 'none' };
    if (saved.kind === 'ready') {
      const session = HotSeat.restore(saved.match);
      play(session, session.toAct);
    } else {
      // Owner Q3 A: saved under other rules: a plain note, and a new game is one tap away.
      forgetHotSeatSave(storage);
      start.show('home', saved.kind === 'outdated' ? { note: START_TEXT.outdated } : {});
    }
  };

  /**
   * Runs an online game from the start screen: the lobby while waiting, the
   * board once both phones are in, the reason on the start screen if it fails.
   */
  const goOnline = (m: OnlineMatch, failTo: (text: string) => void): void => {
    online?.leave();
    online = m;
    m.onPhase((p) => {
      if (online !== m) return;
      if (p.kind === 'lobby') {
        if (!start.visible || start.screen !== 'lobby') start.show('lobby', { code: p.code });
      } else if (p.kind === 'playing') {
        if (game !== m) play(m);
      } else if (p.kind === 'failed') {
        const text = FAIL_TEXT[p.reason] ?? FAIL_TEXT['network']!;
        if (game === m) board.setStatus(text);
        else failTo(text);
      }
    });
  };
  const deps = () => browserDeps(serverUrl);
  const share = (code: string): void => {
    const url = shareLink(code, { native: __NATIVE__, page: window.location.href, webUrl: __WEB_URL__ });
    const text = shareText(code);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      nav.share(url ? { title: 'OVERCLOCK', text, url } : { title: 'OVERCLOCK', text }).catch(() => undefined);
      return;
    }
    const copy = url ? `${text}\n${url}` : text;
    navigator.clipboard
      ?.writeText(copy)
      .then(() => start.setLobbyStatus(START_TEXT.copied))
      .catch(() => start.setLobbyStatus(url ?? text));
  };

  // S-06-1: the start screen.
  const start = new StartScreen(document.body, {
    playHere,
    savedHere: () => {
      const s = savedHere();
      return s.kind === 'ready' ? { turn: s.turn } : s.kind === 'outdated' ? { turn: null } : null;
    },
    continueHere,
    onlineReady: () => serverUrl !== '',
    startOnline: (side) => {
      start.show('message', { title: START_TEXT.startGame, message: START_TEXT.connecting });
      goOnline(OnlineMatch.create(deps(), side), (note) => start.show('online', { note }));
    },
    joinOnline: (code) => {
      start.show('message', { title: `Joining ${code}`, message: START_TEXT.connecting });
      goOnline(OnlineMatch.join(deps(), code), (error) => start.show('join', { code, error }));
    },
    rejoinSeat: () => {
      const seat = readStoredSeat(storage, serverUrl);
      return seat ? { code: seat.code, seat: seat.seat } : null;
    },
    rejoin: () => {
      const seat = readStoredSeat(storage, serverUrl);
      if (!seat) return start.show('home');
      if (seatOutdated(seat)) {
        // Owner Q3 A: stored under other rules: a plain note; the seat is forgotten (the service expires the game).
        forgetStoredSeat(storage);
        return start.show('home', { note: START_TEXT.outdated });
      }
      start.show('message', { title: continueOnlineLabel(seat.code), message: START_TEXT.connecting });
      goOnline(OnlineMatch.resume(deps(), seat), (note) => start.show('home', { note }));
    },
    share,
    cancel: () => {
      // Giving up a game nobody has joined yet: it is not offered for Rejoin.
      if (online && game !== online) online.forget();
      online = null;
    },
  });
  if (__TEST_HOOK__) {
    // Online tests: start a game with a fixed deal and a prelude (the service must run in test mode).
    window.__overclockStart = {
      screen: () => (start.visible ? start.screen : null),
      back,
      exitRequests: () => exitRequests,
      startOnline: (side, test) => {
        start.show('message', { title: START_TEXT.startGame, message: START_TEXT.connecting });
        goOnline(OnlineMatch.create(deps(), side, test), (note) => start.show('online', { note }));
      },
    };
  }
  const joinCode = joinCodeFromUrl(window.location.search);
  if (joinCode !== null) {
    // A shared link: join at once (the code leaves the address, so a reload doesn't join again).
    params.delete('join');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    if (serverUrl === '') start.show('not_set_up');
    else start.show('join', { code: joinCode });
    if (serverUrl !== '') start.root.querySelector('form')?.requestSubmit();
  } else if (params.get('play') === 'here') {
    // Sprint 11: `play` leaves the address, so a reload opens the start screen (Continue game)
    // instead of starting over and replacing the save. Test switches stay.
    params.delete('play');
    const rest = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    playHere();
  }

  document.getElementById('boot')?.remove();
  document.body.dataset.ready = 'true';
}

/** The status line over an online board: the connection first, then the other player. */
function onlineStatusText(m: OnlineMatch): string | null {
  const st = m.status();
  if (m.phase.kind === 'failed') return FAIL_TEXT[m.phase.reason] ?? null;
  if (st.connection === 'reconnecting' || st.connection === 'connecting') return 'Reconnecting…';
  // Sprint 11: the other player chose Leave for now.
  if (st.opponent === 'away' && st.left) return `The ${SIDE_NAME[m.seat === 'corp' ? 'runner' : 'corp']} left for now. The game is saved`;
  if (st.opponent === 'away') return 'Waiting for the other player to come back…';
  return null;
}

start().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Could not start the game on this device.';
});
