#!/usr/bin/env node
// Publishes the Android app on the repo's Releases page (S-05-4), called by
// .github/workflows/android.yml after the APK is built and checked. One rolling
// release per branch, tag `app-<branch>`.
//
// The release must never be left without an APK (the owner may be downloading
// it right now), and any GitHub error must fail the job (never hidden):
//   - `gh release view TAG`: "release not found" -> create it at GITHUB_SHA with
//     the APK; any other error fails.
//   - it exists: upload the new APK (--clobber) -> move the tag to GITHUB_SHA
//     (git refs API, force) -> edit title / notes / pre-release / latest ->
//     delete the *other* .apk assets.
// At every step the release has at least one APK: the new one is up before any
// old one goes. A stop between steps (cancel, error) leaves an APK behind.
//
// Usage (all from the environment; the workflow sets them):
//   TAG APK (path) TITLE NOTES_FILE GITHUB_SHA GITHUB_REPOSITORY GITHUB_REF_NAME
//   node apps/android/scripts/publish-release.mjs
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs `gh` with `args`; resolves to { code, stdout, stderr }. Never throws.
 * @param {string[]} args
 * @returns {Promise<{ code: number; stdout: string; stderr: string }>}
 */
export async function realGh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.error) return { code: 127, stdout: '', stderr: String(r.error) };
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

export class PublishError extends Error {}

/** True if `gh release view` failed because the release does not exist (and only then). */
export function isNotFound(stderr) {
  return /release not found/i.test(stderr);
}

/**
 * @param {{
 *   gh: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
 *   tag: string; apk: string; title: string; notesFile: string;
 *   sha: string; repo: string; latest: boolean;
 *   log?: (line: string) => void;
 * }} o
 * @returns {Promise<'created' | 'updated'>}
 */
export async function publish(o) {
  const log = o.log ?? (() => {});
  const apkName = basename(o.apk);
  const run = async (what, args) => {
    log(`gh ${args.join(' ')}`);
    const r = await o.gh(args);
    if (r.code !== 0) throw new PublishError(`${what} failed (gh exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
    return r;
  };
  // main: the "Latest" release; sprint branches: pre-releases, never "Latest".
  const kind = o.latest ? ['--prerelease=false', '--latest'] : ['--prerelease', '--latest=false'];

  log(`gh release view ${o.tag}`);
  const view = await o.gh(['release', 'view', o.tag, '--json', 'assets']);
  if (view.code !== 0) {
    if (!isNotFound(view.stderr)) throw new PublishError(`checking release ${o.tag} failed (gh exit ${view.code}): ${view.stderr.trim()}`);
    await run('creating the release', ['release', 'create', o.tag, o.apk, '--target', o.sha, '--title', o.title, '--notes-file', o.notesFile, ...kind]);
    return 'created';
  }
  let assets;
  try {
    assets = JSON.parse(view.stdout).assets.map((a) => a.name);
  } catch {
    throw new PublishError(`could not read the assets of ${o.tag}: ${view.stdout.slice(0, 200)}`);
  }

  // 1. The new APK goes up first.
  await run('uploading the APK', ['release', 'upload', o.tag, o.apk, '--clobber']);
  // 2. The tag points at this build's commit.
  await run('moving the tag', ['api', '-X', 'PATCH', `repos/${o.repo}/git/refs/tags/${o.tag}`, '-f', `sha=${o.sha}`, '-F', 'force=true']);
  // 3. Title, notes, pre-release / latest.
  await run('updating the release', ['release', 'edit', o.tag, '--title', o.title, '--notes-file', o.notesFile, ...kind]);
  // 4. Only now do the older APKs go.
  for (const name of assets) {
    if (name === apkName || !name.toLowerCase().endsWith('.apk')) continue;
    await run(`deleting old asset ${name}`, ['release', 'delete-asset', o.tag, name, '-y']);
  }
  return 'updated';
}

async function main() {
  const env = process.env;
  const need = (k) => {
    const v = env[k];
    if (!v) throw new PublishError(`missing environment variable ${k}`);
    return v;
  };
  const result = await publish({
    gh: realGh,
    tag: need('TAG'),
    apk: need('APK'),
    title: need('TITLE'),
    notesFile: need('NOTES_FILE'),
    sha: need('GITHUB_SHA'),
    repo: need('GITHUB_REPOSITORY'),
    latest: need('GITHUB_REF_NAME') === 'main',
    log: (line) => console.log(line),
  });
  console.log(`release ${env.TAG}: ${result}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
