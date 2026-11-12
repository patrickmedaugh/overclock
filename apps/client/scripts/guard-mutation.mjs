// Mutation check for the End turn double-tap guard e2e (S-03-6).
//
// Proves the guard tests can still fail: in a temporary git worktree of HEAD it
// breaks the guard on purpose, one way at a time, and runs the guard specs
// against each broken build. Every test that taps inside the guard must go red
// on every project; the unbroken build must be green. Exits non-zero otherwise.
//
//   npm run test:guard-mutation            (from apps/client or the repo root)
//
// Tests the committed HEAD (commit first). The temporary worktree shares this
// checkout's node_modules, so `npm ci` must have run here. E2E_CPU_THROTTLE is
// passed through. Takes a few minutes: one build and run per mutation.
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
if (!root || !existsSync(join(root, 'node_modules'))) {
  console.error('guard-mutation: run from inside the repo after `npm ci`.');
  process.exit(2);
}

/** Each breaks the guard; `find` must occur exactly once in `file`. */
const MUTATIONS = [
  { name: 'guard 300ms -> 0ms', file: 'apps/client/src/theme.ts', find: 'endTurnGuard: 300,', replace: 'endTurnGuard: 0,' },
  {
    name: 'judge taps by handling time (performance.now())',
    file: 'apps/client/src/board.ts',
    find: 'if (inputTime() < this.endTurnArmedAt) return;',
    replace: 'if (performance.now() < this.endTurnArmedAt) return;',
  },
  {
    name: 'no guard check on End turn',
    file: 'apps/client/src/board.ts',
    find: 'if (inputTime() < this.endTurnArmedAt) return;',
    replace: '/* guard check removed (mutation) */',
  },
];

const SPECS = ['e2e/qa-sprint01.spec.ts', 'e2e/guard-slow-frame.spec.ts'];
const GREP = 'double-tap guard';
const PROJECTS = ['phone', 'phone-small', 'desktop'];
/** Terminal colour codes in Playwright's error messages. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
/** Tests that tap inside the guard; the slow-frame "control" (tap after the guard) may pass when broken. */
const mustFail = (title) => !title.startsWith('control:');

const port = String(process.env.E2E_PORT ?? 4400 + Math.floor(Math.random() * 500));
const dir = mkdtempSync(join(tmpdir(), 'overclock-guard-mutation-'));
const tree = join(dir, 'tree');
const json = join(dir, 'report.json');

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** Runs the guard specs in the worktree; returns [project, title, status][] . */
function runGuardSpecs() {
  rmSync(json, { force: true });
  const r = spawnSync(
    'npx',
    ['playwright', 'test', ...SPECS, '-g', GREP, '--retries=0', '--reporter=json', ...PROJECTS.flatMap((p) => ['--project', p])],
    { cwd: join(tree, 'apps/client'), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, E2E_PORT: port, PLAYWRIGHT_JSON_OUTPUT_NAME: json } },
  );
  let report;
  try {
    report = JSON.parse(readFileSync(json, 'utf8'));
  } catch {
    throw new Error(`playwright gave no JSON report (exit ${r.status}):\n${r.stdout.slice(-2000)}\n${r.stderr.slice(-2000)}`);
  }
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests) {
        const res = t.results.at(-1);
        const msg = (res?.error?.message ?? '').replace(ANSI, '').split('\n')[0];
        out.push({ project: t.projectName, title: spec.title, status: res?.status ?? 'none', msg });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  return out;
}

let ok = true;
try {
  sh('git', ['worktree', 'add', '--detach', tree, 'HEAD'], root);
  symlinkSync(join(root, 'node_modules'), join(tree, 'node_modules'), 'dir');
  const expected = 2 * 2 * PROJECTS.length; // 2 qa-sprint01 + 2 slow-frame tests per project
  const runs = [{ name: 'baseline (unbroken)', file: null }, ...MUTATIONS];
  for (const m of runs) {
    sh('git', ['checkout', '--', '.'], tree);
    if (m.file) {
      const path = resolve(tree, m.file);
      const src = readFileSync(path, 'utf8');
      if (src.split(m.find).length !== 2) throw new Error(`mutation "${m.name}": "${m.find}" is not in ${m.file} exactly once`);
      writeFileSync(path, src.replace(m.find, m.replace));
    }
    const results = runGuardSpecs();
    const bad = [];
    if (results.length !== expected) bad.push(`expected ${expected} test results, got ${results.length}`);
    for (const t of results) {
      if (t.status === 'skipped') bad.push(`skipped: [${t.project}] ${t.title}`);
      else if (!m.file && t.status !== 'passed') bad.push(`red without a mutation: [${t.project}] ${t.title}: ${t.msg}`);
      else if (m.file && mustFail(t.title) && t.status === 'passed') bad.push(`still green: [${t.project}] ${t.title}`);
    }
    const red = results.filter((t) => t.status !== 'passed').length;
    console.log(`${bad.length ? 'FAIL' : 'ok  '} ${m.name}: ${red}/${results.length} red`);
    for (const t of results) console.log(`       ${t.status.padEnd(8)} [${t.project}] ${t.title}${t.msg ? ` -- ${t.msg.slice(0, 140)}` : ''}`);
    for (const b of bad) console.log(`       !! ${b}`);
    if (bad.length) ok = false;
  }
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  ok = false;
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: root });
  rmSync(dir, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'prune'], { cwd: root });
}
console.log(ok ? 'guard-mutation: ok (unbroken guard green; every broken guard red)' : 'guard-mutation: FAILED');
process.exit(ok ? 0 : 1);
