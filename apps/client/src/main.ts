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
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
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
  app.ticker.add((t) => {
    fx.tick(t.deltaMS);
    ui.tick(t.deltaMS);
  });

  const dispatch: OverclockTestHook['dispatch'] = (action) => {
    const events = session.dispatch(action);
    board.render(session.view(), events);
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
