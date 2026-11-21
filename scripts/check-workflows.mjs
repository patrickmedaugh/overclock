#!/usr/bin/env node
// Sprint 15 (S-15-5 AC5/AC6, CI minutes plan): runs in ci.yml's `checks` job on
// every run (also docs-only ones, before `npm ci`). Fails (exit 1) if:
//  - a workflow still uses GitHub Pages (dead once the repo is private);
//  - a workflow, the game client's source/page, the root netlify.toml or a
//    sprint demo note (Sprint 15 on) links github.io or a GitHub Releases page
//    (both need a GitHub sign-in on a private repo);
//  - a workflow runs on pushes to every branch or to `play` (the play-site
//    publish must never start CI);
//  - ci.yml lost a required job name or a test step, or no longer runs the full
//    e2e suite on pull requests / manual runs (no test is removed or loosened);
//  - android.yml no longer publishes the play site the agreed way.
// Text checks on purpose: no YAML parser before `npm ci` (GitHub itself
// rejects a workflow that is not valid YAML).
//
// Usage: node scripts/check-workflows.mjs [repoRoot]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAGES = /actions\/(configure-pages|upload-pages-artifact|deploy-pages)|^\s*pages:\s*write|github-pages/m;
const DEAD_LINK = /github\.io|github\.com\/[\w.-]+\/[\w.-]+\/releases/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Files whose links must work without a GitHub sign-in. */
export function linkFiles(root) {
  const demos = walk(join(root, 'docs', 'sprints')).filter((f) => {
    const m = /sprint-(\d+)-demo\.md$/.exec(f);
    return m && Number(m[1]) >= 15;
  });
  return [
    ...walk(join(root, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f)),
    ...walk(join(root, 'apps', 'client', 'src')),
    join(root, 'apps', 'client', 'index.html'),
    join(root, 'netlify.toml'),
    ...demos,
  ].filter((f) => existsSync(f));
}

/** Text of one top-level job (`  <id>:` up to the next top-level job). */
function jobBlock(yml, id) {
  const lines = yml.split('\n');
  const start = lines.findIndex((l) => l === `  ${id}:`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^ {2}[\w-]+:\s*$/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

/** @returns {string[]} problems (empty = good) */
export function checkWorkflows(root) {
  const problems = [];
  const bad = (msg) => problems.push(msg);
  const wfDir = join(root, '.github', 'workflows');
  const workflows = walk(wfDir).filter((f) => /\.ya?ml$/.test(f));

  for (const f of workflows) {
    const yml = readFileSync(f, 'utf8');
    const name = relative(root, f);
    if (PAGES.test(yml)) bad(`${name} uses GitHub Pages (off for a private repo on the free plan)`);
    for (const m of yml.matchAll(/^\s*branches:\s*\[([^\]]*)\]/gm)) {
      const branches = m[1].split(',').map((b) => b.trim().replace(/^['"]|['"]$/g, ''));
      for (const b of branches) {
        if (b === '**' || b === '*') bad(`${name} runs on every branch (${b}); list main and 'sprint-[0-9][0-9]'`);
        if (b === 'play') bad(`${name} runs on the play branch (the play-site publish would start it)`);
      }
    }
    if (/^\s*-\s*['"]?(\*\*|\*|play)['"]?\s*$/m.test(yml.split(/^jobs:/m)[0])) bad(`${name}: a trigger branch list names every branch or play`);
  }

  for (const f of linkFiles(root)) {
    const text = readFileSync(f, 'utf8');
    const lineNo = text.split('\n').findIndex((l) => DEAD_LINK.test(l));
    if (lineNo >= 0) bad(`${relative(root, f)}:${lineNo + 1} links github.io or a GitHub Releases page (needs a GitHub sign-in on a private repo)`);
  }

  // --- ci.yml: required names, every test step, e2e on pull requests and manual runs
  const ciFile = join(wfDir, 'ci.yml');
  if (!existsSync(ciFile)) {
    bad('.github/workflows/ci.yml is missing');
  } else {
    const ci = readFileSync(ciFile, 'utf8');
    const on = ci.split(/^jobs:/m)[0];
    for (const t of ['pull_request:', 'workflow_dispatch:', 'push:']) if (!on.includes(t)) bad(`ci.yml no longer runs on ${t.slice(0, -1)}`);
    for (const [id, title] of [
      ['changes', 'changes'],
      ['checks', 'checks'],
      ['e2e-shard', 'e2e shard ${{ matrix.shard }}/4'],
      ['e2e', 'e2e'],
      ['guard-mutation', 'guard-mutation'],
    ]) {
      const block = jobBlock(ci, id);
      if (!block) {
        bad(`ci.yml lost the job ${id}`);
        continue;
      }
      if (!block.includes(`name: ${title}\n`)) bad(`ci.yml job ${id} must keep the name "${title}" (branch protection / TESTING.md rely on it)`);
    }
    const checks = jobBlock(ci, 'checks') ?? '';
    for (const step of [
      'node scripts/check-workflows.mjs',
      'npm run lint',
      'npm run typecheck',
      'npm test',
      'npm run test:dev --workspace apps/server',
      'npm run build:android --workspace apps/client',
      'npm run check:android --workspace apps/client',
    ]) {
      if (!checks.includes(`run: ${step}`)) bad(`ci.yml checks lost the step "${step}"`);
    }
    if (!/if:\s*always\(\)/.test(checks)) bad('ci.yml checks must run with if: always() (a skipped required job would count as passed)');
    const shards = jobBlock(ci, 'e2e-shard') ?? '';
    if (!/shard:\s*\[1,\s*2,\s*3,\s*4\]/.test(shards)) bad('ci.yml e2e-shard must run shards [1, 2, 3, 4]');
    if (!shards.includes('npm run test:e2e --workspace apps/client -- --shard=${{ matrix.shard }}/4')) bad('ci.yml e2e-shard lost the full e2e command');
    if (/--grep|--project=|--last-failed|--only-changed/.test(shards)) bad('ci.yml e2e-shard narrows the e2e run');
    for (const id of ['e2e-shard', 'guard-mutation']) {
      if (!/if:\s*needs\.changes\.outputs\.e2e == 'true'/.test(jobBlock(ci, id) ?? '')) bad(`ci.yml ${id} must run when changes says e2e`);
    }
    if (!(jobBlock(ci, 'guard-mutation') ?? '').includes('run: npm run test:guard-mutation')) bad('ci.yml guard-mutation lost its test');
    const e2e = jobBlock(ci, 'e2e') ?? '';
    if (!/if:\s*always\(\)/.test(e2e) || !e2e.includes('needs.e2e-shard.result')) bad('ci.yml e2e must always run and fail unless every shard passed when e2e was due');
    const changes = jobBlock(ci, 'changes') ?? '';
    if (!changes.includes('node scripts/ci-changes.mjs')) bad('ci.yml changes must decide with scripts/ci-changes.mjs');
  }

  // --- android.yml: the play-site publish
  const androidFile = join(wfDir, 'android.yml');
  const site = existsSync(androidFile) ? jobBlock(readFileSync(androidFile, 'utf8'), 'site') : null;
  if (!site) {
    bad('android.yml lost the site job (play link + app download)');
  } else {
    for (const must of [
      'node scripts/play-site.mjs',
      'node scripts/check-site.mjs',
      'HEAD:refs/heads/play',
      'group: play-publish',
      'cancel-in-progress: false',
      "if: needs.build.outputs.publish_site == 'true'",
    ]) {
      if (!site.includes(must)) bad(`android.yml site job lost "${must}"`);
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..');
  const problems = checkWorkflows(root);
  for (const p of problems) console.error(`::error::${p}`);
  if (problems.length) process.exit(1);
  console.log(`workflows OK (${linkFiles(root).length} files free of github.io / Releases links)`);
}
