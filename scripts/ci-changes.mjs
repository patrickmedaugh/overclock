#!/usr/bin/env node
// Sprint 15 (CI minutes plan, DECISIONS 2026-11-20): the `changes` job of
// ci.yml. Decides what a CI run must test:
//   code — run `checks` (lint, typecheck, unit tests, test:dev, Android bundle)
//   e2e  — run the 4 e2e shards + guard-mutation
// Rules:
//  - workflow_dispatch: everything (QA's full CI pass: `gh workflow run ci.yml --ref sprint-NN`).
//  - pull_request: e2e + checks unless the PR changes only docs. On a new push
//    to an open PR, a docs-only push skips both only if the previous head
//    already has a successful pull_request/workflow_dispatch ci run (so code a
//    cancelled run never tested is never skipped); otherwise the whole PR diff
//    decides.
//  - push (main, sprint-NN): checks only (e2e runs on the PR), skipped for a
//    docs-only push whose previous head has a successful ci run.
// "Docs only" = every changed file is under docs/ or is markdown (*.md), and
// none is a doc that tests read (TEST_INPUT_DOCS). Dependency-free: runs before `npm ci`.
//
// Usage (in CI): node scripts/ci-changes.mjs   (env from ci.yml; writes $GITHUB_OUTPUT)
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Docs that unit tests read: changing them must run the tests (scripts/test/ci-changes.test.mjs checks this list). */
export const TEST_INPUT_DOCS = ['docs/GLOSSARY.md', 'docs/RULES_SPEC.md'];

export function isDocsOnly(files) {
  return files.every((f) => (f.startsWith('docs/') || f.endsWith('.md')) && !TEST_INPUT_DOCS.includes(f));
}

const ZERO = /^0+$/;

/**
 * @param {{event: string, action?: string, before?: string, after: string, baseSha?: string, headSha?: string}} ctx
 * @param {{diff: (from: string, to: string, threeDot?: boolean) => string[] | null, verified: (sha: string, kind: 'checks'|'e2e') => boolean}} io
 * @returns {{code: boolean, e2e: boolean, reason: string}}
 */
export function decide(ctx, io) {
  const all = (reason) => ({ code: true, e2e: true, reason });
  if (ctx.event === 'workflow_dispatch') return all('manual run: everything');

  if (ctx.event === 'pull_request') {
    if (ctx.action === 'synchronize' && ctx.before && !ZERO.test(ctx.before)) {
      const pushed = io.diff(ctx.before, ctx.headSha ?? ctx.after);
      if (pushed && isDocsOnly(pushed) && io.verified(ctx.before, 'e2e')) {
        return { code: false, e2e: false, reason: `docs-only push; previous head ${ctx.before.slice(0, 7)} passed the full PR run` };
      }
    }
    const whole = ctx.baseSha && ctx.headSha ? io.diff(ctx.baseSha, ctx.headSha, true) : null;
    if (whole && isDocsOnly(whole)) return { code: false, e2e: false, reason: 'the pull request changes only docs' };
    return all(whole ? 'pull request with code changes' : 'pull request (diff unknown)');
  }

  // push
  if (!ctx.before || ZERO.test(ctx.before)) return { code: true, e2e: false, reason: 'new branch: checks (e2e runs on the pull request)' };
  const pushed = io.diff(ctx.before, ctx.after);
  if (pushed && isDocsOnly(pushed) && io.verified(ctx.before, 'checks')) {
    return { code: false, e2e: false, reason: `docs-only push; previous head ${ctx.before.slice(0, 7)} passed ci` };
  }
  return { code: true, e2e: false, reason: `${pushed ? (isDocsOnly(pushed) ? 'docs-only push after an untested head' : 'code push') : 'push (diff unknown)'}: checks (e2e runs on the pull request)` };
}

function git(args) {
  try {
    const out = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function realIo(repo) {
  return {
    diff: (from, to, threeDot = false) => git(['diff', '--name-only', threeDot ? `${from}...${to}` : `${from}..${to}`]),
    verified: (sha, kind) => {
      try {
        const out = execFileSync(
          'gh',
          ['api', `repos/${repo}/actions/runs?head_sha=${sha}&status=success&per_page=100`, '--jq', '.workflow_runs[] | [.path, .event] | @tsv'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return out
          .split('\n')
          .map((l) => l.split('\t'))
          .some(([path, event]) => path === '.github/workflows/ci.yml' && (kind === 'checks' || event === 'pull_request' || event === 'workflow_dispatch'));
      } catch (e) {
        console.log(`::warning::could not read earlier ci runs of ${sha} (${e.message.split('\n')[0]}); testing this push in full`);
        return false;
      }
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  const ctx = {
    event: env.EVENT_NAME ?? '',
    action: env.PR_ACTION || undefined,
    before: env.BEFORE_SHA || undefined,
    after: env.GITHUB_SHA ?? '',
    baseSha: env.PR_BASE_SHA || undefined,
    headSha: env.PR_HEAD_SHA || undefined,
  };
  const d = decide(ctx, realIo(env.GITHUB_REPOSITORY ?? ''));
  console.log(`code=${d.code} e2e=${d.e2e} — ${d.reason}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `code=${d.code}\ne2e=${d.e2e}\nreason=${d.reason}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `**What this run tests:** code=${d.code}, e2e=${d.e2e} — ${d.reason}\n`);
}
