#!/usr/bin/env node
// Sprint 15 (S-15-5): checks the play site before the android workflow pushes
// it to the `play` branch (https://overcloc.netlify.app). Fails (exit 1) if:
//  - the web game is missing or built for another base path (e.g. /overclock/),
//    or a page script/style it links is missing;
//  - its build time is not the APK's (OVERCLOCK_BUILD_TIME), or Play online's
//    service is not in the page's CSP;
//  - it mentions github.io (the old, private-repo-dead GitHub Pages link);
//  - app/latest.json is malformed or does not match this build;
//  - app/overclock.apk and app/<apk> are missing, differ, or are not APKs;
//  - netlify.toml would build anything, or misses the APK download headers.
//
// Usage: node scripts/check-site.mjs <siteDir>
//   env BUILD_TIME, VERSION_CODE, BRANCH, GITHUB_SHA, OVERCLOCK_SERVER_URL (optional).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const APK_TYPE = 'application/vnd.android.package-archive';
const TEXT = /\.(html|js|css|json|webmanifest|toml|txt|svg)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Header blocks of a netlify.toml: `for` path → the block's text. */
function headerBlocks(toml) {
  const blocks = new Map();
  for (const part of toml.split('[[headers]]').slice(1)) {
    const m = /for\s*=\s*"([^"]+)"/.exec(part);
    if (m) blocks.set(m[1], part);
  }
  return blocks;
}

/**
 * @param {string} dir the assembled site
 * @param {{buildTime: string, versionCode: string|number, branch: string, commit: string, serverUrl?: string}} expect
 * @returns {string[]} problems (empty = good)
 */
export function checkSite(dir, expect) {
  const problems = [];
  const bad = (msg) => problems.push(msg);

  // --- the web game
  const indexFile = join(dir, 'index.html');
  if (!existsSync(indexFile)) return [`${indexFile} is missing (no web build)`];
  const html = readFileSync(indexFile, 'utf8');
  const links = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const link of links) {
    if (/^(https?:|data:|#|mailto:)/.test(link)) continue;
    if (link.startsWith('/overclock/')) bad(`index.html links ${link}: built for /overclock/ (GitHub Pages), not BASE_PATH=/`);
    const file = join(dir, link.replace(/^\.?\//, '').split(/[?#]/)[0]);
    if (/\.(js|css|webmanifest|png|svg)$/.test(file) && !existsSync(file)) bad(`index.html links ${link} but the site has no ${relative(dir, file)}`);
  }
  if (!links.some((l) => /\.js$/.test(l))) bad('index.html loads no script');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1];
  if (!csp) bad('index.html has no Content-Security-Policy');
  if (csp && expect.serverUrl) {
    const origin = new URL(expect.serverUrl);
    if (!csp.includes(`${origin.protocol}//${origin.host}`)) bad(`the page's CSP does not allow the online service ${origin.protocol}//${origin.host} (Play online would fail)`);
  }

  const files = walk(dir);
  const scripts = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8'));
  if (!scripts.some((s) => s.includes(expect.buildTime))) bad(`no script contains the build time "${expect.buildTime}" (web and app must share OVERCLOCK_BUILD_TIME)`);
  for (const f of files.filter((f) => TEXT.test(f))) {
    if (readFileSync(f, 'utf8').includes('github.io')) bad(`${relative(dir, f)} mentions github.io (the old GitHub Pages link)`);
  }

  // --- app/latest.json + the APK
  const latestFile = join(dir, 'app', 'latest.json');
  let latest = null;
  try {
    latest = JSON.parse(readFileSync(latestFile, 'utf8'));
  } catch (e) {
    bad(`app/latest.json is missing or not JSON (${e.message})`);
  }
  if (latest) {
    const want = { buildTime: expect.buildTime, versionCode: Number(expect.versionCode), branch: expect.branch, commit: expect.commit };
    for (const [k, v] of Object.entries(want)) if (latest[k] !== v) bad(`app/latest.json ${k} is ${JSON.stringify(latest[k])}, expected ${JSON.stringify(v)}`);
    if (!Number.isInteger(latest.versionCode) || latest.versionCode <= 0) bad('app/latest.json versionCode is not a positive whole number');
    if (!/^[0-9a-f]{40}$/.test(String(latest.commit))) bad('app/latest.json commit is not a full commit id');
    if (typeof latest.apk !== 'string' || !/^overclock-[A-Za-z0-9._-]+\.apk$/.test(latest.apk)) bad(`app/latest.json apk ${JSON.stringify(latest.apk)} is not an overclock-….apk file name`);
  }
  const fixedApk = join(dir, 'app', 'overclock.apk');
  const namedApk = latest && typeof latest.apk === 'string' ? join(dir, 'app', latest.apk) : null;
  for (const f of [fixedApk, namedApk]) {
    if (!f) continue;
    if (!existsSync(f)) {
      bad(`${relative(dir, f)} is missing`);
      continue;
    }
    const bytes = readFileSync(f);
    if (bytes.length < 100_000) bad(`${relative(dir, f)} is only ${bytes.length} bytes`);
    if (bytes.subarray(0, 4).toString('latin1') !== 'PK\u0003\u0004') bad(`${relative(dir, f)} is not an APK (zip) file`);
  }
  if (namedApk && existsSync(fixedApk) && existsSync(namedApk) && !readFileSync(fixedApk).equals(readFileSync(namedApk))) {
    bad(`app/overclock.apk differs from app/${latest.apk}`);
  }

  // --- netlify.toml: no build, APK download headers
  const tomlFile = join(dir, 'netlify.toml');
  if (!existsSync(tomlFile)) {
    bad('netlify.toml is missing (Netlify would try to build the play branch)');
  } else {
    const toml = readFileSync(tomlFile, 'utf8');
    const command = /^\s*command\s*=\s*"([^"]*)"/m.exec(toml)?.[1];
    if (command === undefined || /\b(npm|npx|yarn|pnpm|vite|node)\b/.test(command)) bad(`netlify.toml build command ${JSON.stringify(command)} must exist and build nothing`);
    if (!/^\s*publish\s*=\s*"\.\/?"/m.test(toml)) bad('netlify.toml must publish the branch root (publish = ".")');
    const blocks = headerBlocks(toml);
    const apks = ['overclock.apk', ...(latest && typeof latest.apk === 'string' ? [latest.apk] : [])];
    for (const apk of apks) {
      const block = blocks.get(`/app/${apk}`);
      if (!block) {
        bad(`netlify.toml has no headers for /app/${apk}`);
        continue;
      }
      if (!block.includes(`Content-Type = "${APK_TYPE}"`)) bad(`netlify.toml: /app/${apk} is not served as ${APK_TYPE}`);
      if (!/Content-Disposition = "attachment/.test(block)) bad(`netlify.toml: /app/${apk} is not served as a download (attachment)`);
      if (!/Cache-Control = "no-cache"/.test(block)) bad(`netlify.toml: /app/${apk} may be cached (no-cache missing)`);
    }
    if (!/Cache-Control = "no-cache"/.test(blocks.get('/app/latest.json') ?? '')) bad('netlify.toml: /app/latest.json may be cached (no-cache missing)');
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  const env = process.env;
  const missing = ['BUILD_TIME', 'VERSION_CODE', 'BRANCH', 'GITHUB_SHA'].filter((k) => !env[k]);
  if (!dir || missing.length) {
    console.error(`usage: check-site.mjs <siteDir> (env BUILD_TIME, VERSION_CODE, BRANCH, GITHUB_SHA[, OVERCLOCK_SERVER_URL])${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
    process.exit(2);
  }
  const problems = checkSite(dir, {
    buildTime: env.BUILD_TIME,
    versionCode: env.VERSION_CODE,
    branch: env.BRANCH,
    commit: env.GITHUB_SHA,
    serverUrl: env.OVERCLOCK_SERVER_URL || undefined,
  });
  for (const p of problems) console.error(`::error::play site: ${p}`);
  if (problems.length) process.exit(1);
  console.log(`play site OK: ${dir} (${env.BRANCH} ${env.GITHUB_SHA.slice(0, 7)}, built ${env.BUILD_TIME})`);
}
