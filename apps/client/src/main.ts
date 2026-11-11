import { Application } from 'pixi.js';
import { Board } from './board';
import type { OverclockTestHook } from './hook-types';
import { computeLayout } from './layout';
import { Session, seedFromUrl } from './session';
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
  app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const session = new Session(seedFromUrl(window.location.search));
  // fx: event animations (skippable). ui: feedback, hints, zoom (never skipped).
  const fx = new Tweens();
  const ui = new Tweens();

  const board = new Board(fx, ui, {
    onDeckTap: (side) => dispatch({ type: 'draw', player: side }),
  });
  app.stage.addChild(board.stage);

  // Render on demand: only while something animates or after a change.
  // Idle boards cost no GPU time (battery on phones, CPU in CI).
  let dirty = true;
  const invalidate = () => {
    dirty = true;
  };
  app.ticker.remove(app.render, app);
  // Large frame gaps (slow device, background tab) advance tweens by real
  // time, up to 250ms, so animations finish on wall-clock budget.
  app.ticker.minFPS = 4;
  app.ticker.add((t) => {
    const animating = fx.active || ui.active;
    fx.tick(t.deltaMS);
    ui.tick(t.deltaMS);
    if (dirty || animating) {
      dirty = false;
      app.render();
    }
  });

  const dispatch: OverclockTestHook['dispatch'] = (action) => {
    const events = session.dispatch(action);
    board.render(session.view(), events);
    invalidate();
    return events;
  };

  let lastSize = '';
  const relayout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const key = `${w}x${h}`;
    if (key === lastSize) return;
    lastSize = key;
    app.renderer.resize(w, h);
    board.setLayout(computeLayout(w, h));
    invalidate();
  };
  relayout();
  board.render(session.view(), []);
  window.addEventListener('resize', relayout);

  // Test hook for Playwright (always on in Sprint 0; build flag later).
  window.__overclock = {
    getView: () => session.view(),
    dispatch,
    lastEvents: () => session.lastEvents(),
    layout: () => board.snapshot(),
  };
  document.body.dataset.ready = 'true';
}

start().catch((err: unknown) => {
  console.error(err);
  const el = document.getElementById('boot');
  if (el) el.textContent = 'Could not start the game on this device.';
});
