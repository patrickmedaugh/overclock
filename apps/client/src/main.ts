// Must come first: makes Pixi generate shaders/uniform code without
// `new Function`, so the game runs under a strict Content Security Policy
// (no 'unsafe-eval'; see vite.config.ts) and in locked-down WebViews.
import 'pixi.js/unsafe-eval';
import type { Action } from '@overclock/engine';
import { Application } from 'pixi.js';
import { Board } from './board';
import { setCardRenderer } from './cardFace';
import type { AnimRecord, OverclockTestHook } from './hook-types';
import { HotSeat, seedFromUrl } from './hotseat';
import { lastInput } from './input';
import { computeLayout } from './layout';
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
  const invalidate = () => {
    dirty = true;
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
    onNewGame: () => window.location.assign(window.location.pathname),
    log,
  });
  app.stage.addChild(board.stage);

  app.ticker.remove(app.render, app);
  // Large frame gaps (slow device, background tab) advance tweens by real
  // time, up to 250ms, so animations finish on wall-clock budget.
  app.ticker.minFPS = 4;
  app.ticker.add((t) => {
    // Only frames where a tween actually moved something are drawn: a hint
    // sitting on screen (waiting for its fade-out) costs no GPU time.
    const fxMoved = fx.tick(t.deltaMS);
    const uiMoved = ui.tick(t.deltaMS);
    if (dirty || fxMoved || uiMoved) {
      dirty = false;
      app.render();
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
    board.setLayout(computeLayout(w, h, insets));
    invalidate();
  };
  relayout();
  board.render(game.view(), []);
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  // Insets can settle a moment after an orientation change on iOS.
  window.visualViewport?.addEventListener('resize', relayout);

  // Test hook for Playwright (always on for now; build flag later).
  window.__overclock = {
    getView: () => game.view(),
    dispatch,
    lastEvents: () => game.lastEvents(),
    layout: () => board.snapshot(),
    anims: () => records.map((r) => ({ ...r, box: r.box ? { ...r.box } : undefined })),
    clearAnims: () => {
      records.length = 0;
    },
    lastInput,
  };
  document.getElementById('boot')?.remove();
  document.body.dataset.ready = 'true';
}

start().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Could not start the game on this device.';
});
