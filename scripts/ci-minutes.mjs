#!/usr/bin/env node
// Sprint 15 (CI minutes plan): how many GitHub Actions minutes this month's
// runs were billed. A private repo on the free plan gets 2,000 a month; the
// lead records the total in docs/STATE.md each sprint and tells the owner at
// 1,500. GitHub bills each job rounded up to a whole minute (Linux ×1,
// Windows ×2, macOS ×10). Minutes used while the repo was public were free:
// pass --since <date it went private> to count only billed ones.
//
// Usage: node scripts/ci-minutes.mjs [--month YYYY-MM] [--since YYYY-MM-DD]
//                                    [--repo owner/name] [--json]
// Needs the GitHub CLI (`gh`), signed in.
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const FREE_MINUTES = 2000;
export const TELL_OWNER_AT = 1500;

/** Billed minutes of one job (0 if it never ran). */
export function jobMinutes(job) {
  if (!job.started_at || !job.completed_at || job.conclusion === 'skipped') return 0;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  if (!(ms > 0)) return 0;
  const labels = (job.labels ?? []).join(' ').toLowerCase();
  const rate = labels.includes('macos') ? 10 : labels.includes('windows') ? 2 : 1;
  return Math.ceil(ms / 60_000) * rate;
}

/** First and last day of a `YYYY-MM` month (UTC), for the runs API `created` filter. */
export function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`--month must be YYYY-MM, got ${month}`);
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

/**
 * @param {{id: number, name: string, event: string, created_at: string}[]} runs
 * @param {Map<number, object[]>} jobsByRun
 */
export function summarize(runs, jobsByRun, since) {
  const byWorkflow = new Map();
  let total = 0;
  for (const r of runs) {
    if (since && r.created_at < since) continue;
    const minutes = (jobsByRun.get(r.id) ?? []).reduce((s, j) => s + jobMinutes(j), 0);
    const key = `${r.name} (${r.event})`;
    const w = byWorkflow.get(key) ?? { runs: 0, minutes: 0 };
    w.runs += 1;
    w.minutes += minutes;
    byWorkflow.set(key, w);
    total += minutes;
  }
  return {
    total,
    left: Math.max(0, FREE_MINUTES - total),
    tellOwner: total >= TELL_OWNER_AT,
    byWorkflow: [...byWorkflow].map(([workflow, w]) => ({ workflow, ...w })).sort((a, b) => b.minutes - a.minutes),
  };
}

async function gh(path) {
  const { stdout } = await run('gh', ['api', '--paginate', path, '--jq', '.workflow_runs // .jobs | .[]'], { maxBuffer: 256 * 1024 * 1024 });
  return stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const month = opt('--month') ?? new Date().toISOString().slice(0, 7);
  const since = opt('--since');
  const repo = opt('--repo') ?? (await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])).stdout.trim();
  const { from, to } = monthRange(month);

  const runs = await gh(`repos/${repo}/actions/runs?created=${from}..${to}&per_page=100`);
  const jobsByRun = new Map();
  const queue = [...runs];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let r = queue.shift(); r; r = queue.shift()) jobsByRun.set(r.id, await gh(`repos/${repo}/actions/runs/${r.id}/jobs?filter=all&per_page=100`));
    }),
  );
  const s = summarize(runs, jobsByRun, since);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ repo, month, since: since ?? null, ...s }, null, 2));
    return;
  }
  console.log(`GitHub Actions minutes for ${repo}, ${month}${since ? ` (runs since ${since})` : ''}:`);
  for (const w of s.byWorkflow) console.log(`  ${w.workflow.padEnd(32)} ${String(w.runs).padStart(4)} runs ${String(w.minutes).padStart(6)} min`);
  console.log(`  ${'total'.padEnd(32)} ${String(s.byWorkflow.reduce((n, w) => n + w.runs, 0)).padStart(4)} runs ${String(s.total).padStart(6)} min — ${s.left} of ${FREE_MINUTES} free minutes left`);
  if (s.tellOwner) console.log(`TELL THE OWNER: ${s.total} minutes used (limit ${FREE_MINUTES}; we agreed to say so at ${TELL_OWNER_AT}).`);
  if (runs.length >= 1000) console.log('Note: GitHub lists at most 1,000 runs per search; use --since to split the month.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.stderr || e.message);
    process.exit(1);
  });
}
