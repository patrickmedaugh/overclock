// Sprint 15 CI-minutes plan + S-15-5 AC5/AC6: ci-changes, check-workflows, ci-minutes.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_INPUT_DOCS, decide, isDocsOnly } from '../ci-changes.mjs';
import { checkWorkflows } from '../check-workflows.mjs';
import { jobMinutes, monthRange, summarize } from '../ci-minutes.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..', '..');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const BASE = 'c'.repeat(40);

/** Fake git/gh: `diffs` maps "from..to" / "from...to" to file lists; `ok` lists verified shas per kind. */
function io(diffs, ok = {}) {
  const calls = [];
  return {
    calls,
    diff: (from, to, threeDot) => {
      calls.push(`${from}${threeDot ? '...' : '..'}${to}`);
      return diffs[`${from}${threeDot ? '...' : '..'}${to}`] ?? null;
    },
    verified: (sha, kind) => (ok[kind] ?? []).includes(sha),
  };
}

describe('ci-changes: what a run tests', () => {
  it('docs-only = docs/ or markdown, but not docs that tests read', () => {
    expect(isDocsOnly(['docs/STATE.md', 'docs/sprints/x.png', 'apps/android/README.md'])).toBe(true);
    expect(isDocsOnly(['docs/STATE.md', 'apps/client/src/main.ts'])).toBe(false);
    expect(isDocsOnly(['docs/GLOSSARY.md'])).toBe(false);
    expect(isDocsOnly(['docs/RULES_SPEC.md'])).toBe(false);
    expect(isDocsOnly(['.github/workflows/ci.yml'])).toBe(false);
  });

  it('every docs file a unit/e2e test reads is in TEST_INPUT_DOCS', () => {
    const walk = (d) => readdirSync(d).flatMap((n) => (n === 'node_modules' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
    const dirs = ['apps', 'packages'].flatMap((top) =>
      readdirSync(join(root, top)).flatMap((w) => ['test', 'e2e'].map((t) => join(root, top, w, t))),
    );
    const names = new Set();
    for (const d of dirs) {
      let files = [];
      try {
        files = walk(d);
      } catch {
        continue;
      }
      for (const f of files.filter((f) => /\.(ts|mjs|js)$/.test(f))) {
        for (const m of readFileSync(f, 'utf8').matchAll(/['"`/]([A-Z][A-Z_]+\.md)['"`]/g)) names.add(m[1]);
      }
    }
    expect([...names].sort()).toEqual(TEST_INPUT_DOCS.map((d) => d.replace(/^docs\//, '')).sort());
  });

  it('a manual run tests everything', () => {
    expect(decide({ event: 'workflow_dispatch', after: A }, io({}))).toMatchObject({ code: true, e2e: true });
  });

  it('a pull request with code runs checks and the full e2e suite', () => {
    const d = decide({ event: 'pull_request', action: 'opened', after: A, baseSha: BASE, headSha: A }, io({ [`${BASE}...${A}`]: ['apps/client/src/board.ts', 'docs/STATE.md'] }));
    expect(d).toMatchObject({ code: true, e2e: true });
  });

  it('a docs-only pull request (e.g. a sprint proposal) runs neither', () => {
    const d = decide({ event: 'pull_request', action: 'opened', after: A, baseSha: BASE, headSha: A }, io({ [`${BASE}...${A}`]: ['docs/sprints/sprint-16-proposal.md'] }));
    expect(d).toMatchObject({ code: false, e2e: false });
  });

  it('a docs-only push to a code PR is skipped only when the previous head passed a full run', () => {
    const ctx = { event: 'pull_request', action: 'synchronize', before: A, after: B, baseSha: BASE, headSha: B };
    const diffs = { [`${A}..${B}`]: ['docs/sprints/sprint-15-demo.md'], [`${BASE}...${B}`]: ['apps/client/src/board.ts', 'docs/sprints/sprint-15-demo.md'] };
    expect(decide(ctx, io(diffs, { e2e: [A] }))).toMatchObject({ code: false, e2e: false });
    // previous run cancelled / failed / only a push run: the whole PR decides → full run
    expect(decide(ctx, io(diffs, { checks: [A] }))).toMatchObject({ code: true, e2e: true });
    expect(decide(ctx, io(diffs))).toMatchObject({ code: true, e2e: true });
  });

  it('a code push to a PR always runs the full suite', () => {
    const ctx = { event: 'pull_request', action: 'synchronize', before: A, after: B, baseSha: BASE, headSha: B };
    expect(decide(ctx, io({ [`${A}..${B}`]: ['packages/engine/src/apply.ts'], [`${BASE}...${B}`]: ['packages/engine/src/apply.ts'] }, { e2e: [A] }))).toMatchObject({ code: true, e2e: true });
  });

  it('an unknown diff on a PR runs the full suite', () => {
    expect(decide({ event: 'pull_request', action: 'synchronize', before: A, after: B, baseSha: BASE, headSha: B }, io({}, { e2e: [A] }))).toMatchObject({ code: true, e2e: true });
  });

  it('a push runs checks (never e2e); a docs-only push after a passing commit runs nothing', () => {
    expect(decide({ event: 'push', before: A, after: B }, io({ [`${A}..${B}`]: ['apps/client/src/main.ts'] }, { checks: [A] }))).toMatchObject({ code: true, e2e: false });
    expect(decide({ event: 'push', before: A, after: B }, io({ [`${A}..${B}`]: ['docs/STATE.md'] }, { checks: [A] }))).toMatchObject({ code: false, e2e: false });
    expect(decide({ event: 'push', before: A, after: B }, io({ [`${A}..${B}`]: ['docs/STATE.md'] }))).toMatchObject({ code: true, e2e: false });
    expect(decide({ event: 'push', before: A, after: B }, io({ [`${A}..${B}`]: ['docs/GLOSSARY.md'] }, { checks: [A] }))).toMatchObject({ code: true });
  });

  it('a new branch or a force-push (old head unknown) runs checks', () => {
    expect(decide({ event: 'push', before: '0'.repeat(40), after: B }, io({}))).toMatchObject({ code: true, e2e: false });
    expect(decide({ event: 'push', before: A, after: B }, io({}, { checks: [A] }))).toMatchObject({ code: true, e2e: false });
  });
});

describe('check-workflows', () => {
  let tmp;
  afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }));

  /** A copy of the files check-workflows reads, with one edit. */
  function copyWith(file, edit) {
    tmp = mkdtempSync(join(tmpdir(), 'oc-wf-'));
    for (const p of ['.github', 'apps/client/src', 'apps/client/index.html', 'netlify.toml', 'docs/sprints']) {
      cpSync(join(root, p), join(tmp, p), { recursive: true });
    }
    if (file) {
      const f = join(tmp, file);
      mkdirSync(join(f, '..'), { recursive: true });
      let before = '';
      try {
        before = readFileSync(f, 'utf8');
      } catch {
        // new file
      }
      writeFileSync(f, edit(before));
    }
    return tmp;
  }

  it('passes on this repository', () => {
    expect(checkWorkflows(root)).toEqual([]);
  });

  it('fails if a workflow still deploys to GitHub Pages', () => {
    const r = copyWith('.github/workflows/deploy.yml', () => 'name: deploy\non: push\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4\n');
    expect(checkWorkflows(r).join('\n')).toMatch(/deploy\.yml uses GitHub Pages/);
  });

  it('fails on a github.io or Releases link in client source, netlify.toml or the Sprint 15+ demo notes', () => {
    let r = copyWith('apps/client/src/links.ts', (s) => `${s}\n// https://patrickmedaugh.github.io/overclock/\n`);
    expect(checkWorkflows(r).join('\n')).toMatch(/apps\/client\/src\/links\.ts:\d+ links github\.io/);
    r = copyWith('docs/sprints/sprint-15-demo.md', () => 'Get the app: https://github.com/patrickmedaugh/overclock/releases/tag/app-sprint-15\n');
    expect(checkWorkflows(r).join('\n')).toMatch(/sprint-15-demo\.md:1/);
    r = copyWith('netlify.toml', (s) => `${s}\n# https://x.github.io/\n`);
    expect(checkWorkflows(r).join('\n')).toMatch(/netlify\.toml/);
    // older demo notes are history: not checked
    r = copyWith('docs/sprints/sprint-14-demo.md', (s) => `${s}\nhttps://patrickmedaugh.github.io/overclock/\n`);
    expect(checkWorkflows(r)).toEqual([]);
  });

  it('fails if ci runs on every branch or a workflow runs on play', () => {
    let r = copyWith('.github/workflows/ci.yml', (s) => s.replace("branches: [main, 'sprint-[0-9][0-9]']", "branches: ['**']"));
    expect(checkWorkflows(r).join('\n')).toMatch(/runs on every branch/);
    r = copyWith('.github/workflows/server.yml', (s) => s.replace("branches: [main, 'sprint-[0-9][0-9]']", "branches: [main, play]"));
    expect(checkWorkflows(r).join('\n')).toMatch(/server\.yml runs on the play branch/);
  });

  it('fails if ci loses a test step, a required job name or the PR e2e run', () => {
    let r = copyWith('.github/workflows/ci.yml', (s) => s.replace('      - run: npm run typecheck\n', ''));
    expect(checkWorkflows(r).join('\n')).toMatch(/lost the step "npm run typecheck"/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace('    name: e2e\n', '    name: e2e-summary\n'));
    expect(checkWorkflows(r).join('\n')).toMatch(/job e2e must keep the name "e2e"/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace("    if: needs.changes.outputs.e2e == 'true'\n    strategy:", "    if: github.event_name == 'workflow_dispatch'\n    strategy:"));
    expect(checkWorkflows(r).join('\n')).toMatch(/e2e-shard must run when changes says e2e/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace('shard: [1, 2, 3, 4]', 'shard: [1, 2]'));
    expect(checkWorkflows(r).join('\n')).toMatch(/shards \[1, 2, 3, 4\]/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace('--shard=${{ matrix.shard }}/4', '--shard=${{ matrix.shard }}/4 --project=phone'));
    expect(checkWorkflows(r).join('\n')).toMatch(/narrows the e2e run/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace('      - run: npm run test:guard-mutation\n', ''));
    expect(checkWorkflows(r).join('\n')).toMatch(/guard-mutation lost its test/);
    r = copyWith('.github/workflows/ci.yml', (s) => s.replace(/( {2}checks:\n(?:.*\n)*?) {4}if: always\(\)\n/, '$1'));
    expect(checkWorkflows(r).join('\n')).toMatch(/checks must run with if: always\(\)/);
  });

  it('fails if android.yml stops publishing the play site', () => {
    const r = copyWith('.github/workflows/android.yml', (s) => s.replace('HEAD:refs/heads/play', 'HEAD:refs/heads/gh-pages'));
    expect(checkWorkflows(r).join('\n')).toMatch(/site job lost "HEAD:refs\/heads\/play"/);
  });
});

describe('ci-minutes', () => {
  const job = (start, end, extra = {}) => ({ started_at: start, completed_at: end, conclusion: 'success', labels: ['ubuntu-latest'], ...extra });

  it('bills each job rounded up to a whole minute, by runner type', () => {
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:00:01Z'))).toBe(1);
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:14:00Z'))).toBe(14);
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:14:01Z'))).toBe(15);
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:01:30Z', { labels: ['windows-latest'] }))).toBe(4);
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:01:30Z', { labels: ['macos-14'] }))).toBe(20);
  });

  it('skipped or never-started jobs cost nothing', () => {
    expect(jobMinutes(job('2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z', { conclusion: 'skipped' }))).toBe(0);
    expect(jobMinutes(job(null, null, { conclusion: 'cancelled' }))).toBe(0);
  });

  it('month range covers the whole month', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(() => monthRange('11-2026')).toThrow();
  });

  it('sums per workflow and flags 1,500 minutes', () => {
    const runs = [
      { id: 1, name: 'ci', event: 'push', created_at: '2026-11-19T09:00:00Z' },
      { id: 2, name: 'ci', event: 'pull_request', created_at: '2026-11-21T09:00:00Z' },
      { id: 3, name: 'android', event: 'push', created_at: '2026-11-21T10:00:00Z' },
    ];
    const jobs = new Map([
      [1, [job('2026-11-19T09:00:00Z', '2026-11-19T09:20:00Z')]],
      [2, [job('2026-11-21T09:00:00Z', '2026-11-21T09:30:00Z'), job('2026-11-21T09:00:00Z', '2026-11-21T09:00:30Z')]],
      [3, [job('2026-11-21T10:00:00Z', '2026-11-21T10:05:00Z')]],
    ]);
    const all = summarize(runs, jobs);
    expect(all.total).toBe(56);
    expect(all.byWorkflow[0]).toEqual({ workflow: 'ci (pull_request)', runs: 1, minutes: 31 });
    expect(all.tellOwner).toBe(false);
    const since = summarize(runs, jobs, '2026-11-20');
    expect(since.total).toBe(36);
    const big = summarize([{ id: 9, name: 'ci', event: 'pull_request', created_at: '2026-11-21' }], new Map([[9, [job('2026-11-21T00:00:00Z', '2026-11-22T01:00:00Z')]]]));
    expect(big.tellOwner).toBe(true);
    expect(big.total).toBe(1500);
    expect(big.left).toBe(500);
  });
});
