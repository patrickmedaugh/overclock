#!/usr/bin/env node
// Renders the app icon PNGs from our own SVG (icon/foreground.svg) with
// Playwright's Chromium. Run after changing the SVG, then commit the PNGs:
//   node apps/android/scripts/render-icons.mjs
// Outputs (android/app/src/main/res/mipmap-*):
//   ic_launcher_foreground.png  adaptive-icon foreground (108dp, transparent)
//   ic_launcher.png             legacy square icon (48dp, rounded, dark background)
//   ic_launcher_round.png       legacy round icon (48dp)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const res = join(app, 'android', 'app', 'src', 'main', 'res');
const fg = readFileSync(join(app, 'icon', 'foreground.svg'), 'utf8');
const BG = '#07060d';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** An SVG document of `px` square: optional background shape, the foreground scaled by `zoom`. */
function page(px, shape, zoom) {
  const inner = fg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const bg =
    shape === 'square'
      ? `<rect x="0" y="0" width="108" height="108" rx="22" fill="${BG}"/>`
      : shape === 'round'
        ? `<circle cx="54" cy="54" r="54" fill="${BG}"/>`
        : '';
  const t = `translate(54 54) scale(${zoom}) translate(-54 -54)`;
  return `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 108 108">${bg}<g transform="${t}">${inner}</g></svg></body></html>`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const p = await ctx.newPage();
async function render(file, px, shape, zoom) {
  await p.setViewportSize({ width: px, height: px });
  await p.setContent(page(px, shape, zoom));
  writeFileSync(file, await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } }));
}
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = join(res, `mipmap-${d}`);
  await render(join(dir, 'ic_launcher_foreground.png'), Math.round(108 * k), 'none', 1);
  // Legacy icons have no safe-zone crop: the art fills more of the square.
  await render(join(dir, 'ic_launcher.png'), Math.round(48 * k), 'square', 1.3);
  await render(join(dir, 'ic_launcher_round.png'), Math.round(48 * k), 'round', 1.3);
}
await browser.close();
console.log('icons rendered into', res);
