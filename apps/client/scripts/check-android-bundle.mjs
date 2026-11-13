#!/usr/bin/env node
// Checks the Android app's web bundle (apps/client/dist-android, made by
// `vite build --mode android`) before it goes into the app (S-04-1 / S-04-2):
// - the Playwright test hook (window.__overclock) is not in it;
// - the "Turn your phone sideways" prompt (#rotate) is not in it;
// - index.html, the styles and the web manifest load nothing from the internet
//   (no http:// or https:// URLs): the app works in airplane mode;
// - assets load from the web root (Capacitor serves the app at https://localhost/).
// Exits 1 with a list of problems, else prints a short OK.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-android');
const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(join(root, 'index.html'))) {
  console.error(`check-android-bundle: ${root}/index.html is missing (run: npx vite build --mode android)`);
  process.exit(1);
}

const files = walk(root);
const text = (p) => readFileSync(p, 'utf8');
const rel = (p) => relative(root, p);

for (const f of files.filter((p) => /\.(js|mjs|html|css)$/.test(p))) {
  if (text(f).includes('__overclock')) problems.push(`${rel(f)}: contains the test hook (__overclock)`);
}

const index = text(join(root, 'index.html'));
if (/id=["']?rotate\b|#rotate\b/.test(index)) problems.push('index.html: contains the rotate prompt (#rotate)');
if (/Turn your phone sideways/.test(index)) problems.push('index.html: contains the "Turn your phone sideways" text');

const noUrls = [join(root, 'index.html'), ...files.filter((p) => /\.css$/.test(p) || /manifest\.webmanifest$/.test(p))];
for (const f of noUrls) {
  const m = text(f).match(/https?:\/\/[^\s"'<>)]*/);
  if (m) problems.push(`${rel(f)}: loads from the internet (${m[0]})`);
  if (/\.css$/.test(f) && /#rotate\b/.test(text(f))) problems.push(`${rel(f)}: contains the rotate prompt (#rotate)`);
}

const srcs = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const s of srcs) {
  if (s.startsWith('/overclock/')) problems.push(`index.html: ${s} uses the web base path (/overclock/), not the app's web root`);
}
if (!/<meta http-equiv="Content-Security-Policy"/.test(index)) problems.push('index.html: the Content Security Policy is missing');

if (problems.length > 0) {
  console.error(`check-android-bundle: ${problems.length} problem(s) in ${root}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-android-bundle: OK (${files.length} files in ${root})`);
