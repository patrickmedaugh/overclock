// Must come first: makes Pixi generate shaders/uniform code without
// `new Function`, so the game runs under a strict Content Security Policy
// (no 'unsafe-eval'; see vite.config.ts) and in locked-down WebViews.
import 'pixi.js/unsafe-eval';
import { getCard } from '@overclock/cards';
import type { Action } from '@overclock/engine';
import { Application, updateRenderGroupTransforms } from 'pixi.js';
import { Board } from './board';
import { setCardRenderer, smallFaceLayout } from './cardFace';
import { forceFrameSpeed, noteDraw, noteTick } from './frameClock';
import type { AnimRecord, OverclockTestHook } from './hook-types';
import { HotSeat, seedFromUrl } from './hotseat';
import { lastInput } from './input';
import { readSafeArea } from './safeArea';
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

  const game = new HotSeat(seedFromUrl(window.location.search));
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

  const dispatch: OverclockTestHook['dispatch'] = (action: Action) => {
    board.show(game.submit(action));
    invalidate();
    return game.lastEvents();
  };
  // Taps act for the seat at the bottom (always the active player). It
  // switches the moment the turn passes, even while the flip still animates.
  const board = new Board(fx, ui, {
    onDeckTap: () => dispatch({ type: 'draw', player: game.seat }),
    onCreditsTap: () => dispatch({ type: 'gain_credit', player: game.seat }),
    onEndTurn: () => dispatch({ type: 'end_turn', player: game.seat }),
    onDiscard: (handIndices) => dispatch({ type: 'discard', player: game.seat, handIndices }),
    // Install / play actions come straight from the view's handOptions.
    onAction: (action) => dispatch(action),
    onNewGame: () => window.location.assign(window.location.pathname),
    changed: () => invalidate(),
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
  board.render(game.view(), [], game.decision());
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
  const back = () => board.back(exit);
  if (__NATIVE__) {
    void import('@capacitor/app').then(({ App }) => {
      void App.addListener('backButton', () => back());
      // Back from another app: draw every card again (none blank).
      void App.addListener('resume', () => board.redrawAll());
    });
  }

  // The Android app's SystemBars plugin sets --safe-area-inset-* on <html>
  // whenever the insets change (after load, on rotation): lay out again then.
  new MutationObserver(relayout).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  // Test hook for Playwright. Left out of the Android app (__TEST_HOOK__ is a
  // compile-time constant, so the bundler drops this whole block there).
  if (__TEST_HOOK__) {
    window.__overclock = {
      getView: () => game.view(),
      decision: () => game.decision(),
      dispatch,
      lastEvents: () => game.lastEvents(),
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
      back,
      exitRequests: () => exitRequests,
      frameSpeed: (mode) => forceFrameSpeed(mode),
    };
  }
  document.getElementById('boot')?.remove();
  document.body.dataset.ready = 'true';
}

start().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Could not start the game on this device.';
});
