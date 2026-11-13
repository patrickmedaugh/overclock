// S-05-4: publishing the app never leaves the release without an APK, and any
// GitHub error fails the job. `gh` is faked: a tiny model of one release.
import { describe, expect, it } from 'vitest';
import { PublishError, isNotFound, publish } from '../scripts/publish-release.mjs';

const OLD = 'overclock-sprint-05-20261113-1700-b40.1.apk';
const NEW = 'overclock-sprint-05-20261113-1710-b41.1.apk';

/**
 * A fake `gh` over one release. `failAt(args, callIndex)` returns a failure
 * (or null). `stopAfter`: the job is cancelled after this many calls (later
 * calls never happen). After every call it records how many APKs the release
 * has, so a test can check none of the in-between states had zero.
 */
function fakeGh({ exists = true, assets = [OLD, 'notes.txt'], failAt = () => null, stopAfter = Infinity } = {}) {
  const rel = { exists, assets: [...assets], tagSha: 'old-sha', title: 'old', prerelease: true, latest: false };
  const calls = [];
  const apkCounts = [];
  const count = () => rel.assets.filter((a) => a.endsWith('.apk')).length;
  const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
  const gh = async (args) => {
    if (calls.length >= stopAfter) throw new Error('cancelled');
    calls.push(args);
    const fail = failAt(args, calls.length - 1);
    if (fail) return fail;
    const [a, b] = args;
    if (a === 'release' && b === 'view') {
      if (!rel.exists) return { code: 1, stdout: '', stderr: 'release not found\n' };
      return ok(JSON.stringify({ assets: rel.assets.map((name) => ({ name })) }));
    }
    if (a === 'release' && b === 'create') {
      rel.exists = true;
      rel.assets = [args[3].split('/').at(-1)];
      rel.tagSha = args[args.indexOf('--target') + 1];
    } else if (a === 'release' && b === 'upload') {
      const name = args[3].split('/').at(-1);
      // --clobber: an asset of the same name is replaced.
      rel.assets = [...rel.assets.filter((x) => x !== name), name];
    } else if (a === 'api') {
      rel.tagSha = args.find((x) => x.startsWith('sha=')).slice(4);
    } else if (a === 'release' && b === 'edit') {
      rel.title = args[args.indexOf('--title') + 1];
      rel.prerelease = !args.includes('--prerelease=false');
      rel.latest = args.includes('--latest');
    } else if (a === 'release' && b === 'delete-asset') {
      rel.assets = rel.assets.filter((x) => x !== args[3]);
    } else {
      return { code: 2, stdout: '', stderr: `fake gh: unknown command ${args.join(' ')}` };
    }
    apkCounts.push(count());
    return ok();
  };
  return { gh, rel, calls, apkCounts };
}

const base = { tag: 'app-sprint-05', apk: `build/${NEW}`, title: 'OVERCLOCK app — sprint-05', notesFile: 'notes.md', sha: 'new-sha', repo: 'o/r', latest: false };

describe('publish-release', () => {
  it('no release yet ("release not found"): creates it at this commit with the APK', async () => {
    const f = fakeGh({ exists: false });
    expect(await publish({ ...base, gh: f.gh })).toBe('created');
    expect(f.rel.assets).toEqual([NEW]);
    expect(f.rel.tagSha).toBe('new-sha');
    const create = f.calls[1];
    expect(create.slice(0, 4)).toEqual(['release', 'create', 'app-sprint-05', `build/${NEW}`]);
    expect(create).toContain('--prerelease');
    expect(create).toContain('--latest=false');
  });

  it('existing release: uploads first, then moves the tag, edits, and only then deletes the old APK', async () => {
    const f = fakeGh();
    expect(await publish({ ...base, gh: f.gh })).toBe('updated');
    expect(f.calls.map((c) => c.slice(0, 2).join(' '))).toEqual(['release view', 'release upload', 'api -X', 'release edit', 'release delete-asset']);
    expect(f.calls[1]).toContain('--clobber');
    expect(f.calls[2]).toEqual(['api', '-X', 'PATCH', 'repos/o/r/git/refs/tags/app-sprint-05', '-f', 'sha=new-sha', '-F', 'force=true']);
    expect(f.calls[4]).toEqual(['release', 'delete-asset', 'app-sprint-05', OLD, '-y']);
    // Only the new APK is left; other files are untouched.
    expect(f.rel.assets).toEqual(['notes.txt', NEW]);
    expect(f.rel.tagSha).toBe('new-sha');
    expect(f.rel.title).toBe(base.title);
    expect(f.apkCounts.every((n) => n >= 1)).toBe(true);
  });

  it('main is the "Latest" release, not a pre-release', async () => {
    const f = fakeGh();
    await publish({ ...base, latest: true, gh: f.gh });
    expect(f.rel.prerelease).toBe(false);
    expect(f.rel.latest).toBe(true);
    const g = fakeGh({ exists: false });
    await publish({ ...base, latest: true, gh: g.gh });
    expect(g.calls[1]).toContain('--latest');
    expect(g.calls[1]).not.toContain('--prerelease');
  });

  it('several old APKs (an earlier stop) are all removed once the new one is up', async () => {
    const f = fakeGh({ assets: [OLD, 'overclock-older.apk'] });
    await publish({ ...base, gh: f.gh });
    expect(f.rel.assets).toEqual([NEW]);
  });

  it('any other error from `release view` fails, and nothing is created or deleted', async () => {
    for (const stderr of ['HTTP 502: Bad Gateway', 'authentication required', 'error connecting to api.github.com']) {
      const f = fakeGh({ failAt: (args) => (args[1] === 'view' ? { code: 1, stdout: '', stderr } : null) });
      await expect(publish({ ...base, gh: f.gh })).rejects.toThrow(PublishError);
      expect(f.calls).toHaveLength(1);
      expect(f.rel.assets).toContain(OLD);
    }
    expect(isNotFound('release not found')).toBe(true);
    expect(isNotFound('HTTP 404: Not Found (https://api.github.com/repos/o/r/releases)')).toBe(false);
  });

  for (const step of ['create', 'upload', 'api', 'edit', 'delete-asset']) {
    it(`a failed ${step} fails the job and leaves an APK`, async () => {
      const f = fakeGh({
        exists: step !== 'create',
        failAt: (args) => (args[1] === step || args[0] === step ? { code: 1, stdout: '', stderr: `HTTP 500 during ${step}` } : null),
      });
      await expect(publish({ ...base, gh: f.gh })).rejects.toThrow(/failed \(gh exit 1\)/);
      if (step !== 'create') expect(f.rel.assets.some((a) => a.endsWith('.apk'))).toBe(true);
      // Nothing after the failed call ran.
      expect(f.calls.at(-1)[step === 'api' ? 0 : 1]).toBe(step);
    });
  }

  it('stopped after any step (cancel, crash), the release still has an APK', async () => {
    // 5 calls in all (view, upload, tag, edit, delete): stop before each one.
    for (let k = 0; k <= 4; k++) {
      const f = fakeGh({ stopAfter: k });
      await expect(publish({ ...base, gh: f.gh })).rejects.toThrow('cancelled');
      expect(f.rel.assets.filter((a) => a.endsWith('.apk')).length).toBeGreaterThanOrEqual(1);
      expect(f.apkCounts.every((n) => n >= 1)).toBe(true);
    }
  });

  it('two quick builds one after the other: the release ends with the newest APK only, and always had one', async () => {
    const f = fakeGh();
    await publish({ ...base, gh: f.gh });
    const NEWER = 'overclock-sprint-05-20261113-1711-b42.1.apk';
    await publish({ ...base, apk: `build/${NEWER}`, sha: 'newer-sha', gh: f.gh });
    expect(f.rel.assets).toEqual(['notes.txt', NEWER]);
    expect(f.rel.tagSha).toBe('newer-sha');
    expect(f.apkCounts.every((n) => n >= 1)).toBe(true);
  });

  it('a rerun with the same file name replaces it in place (no other APK deleted)', async () => {
    const f = fakeGh({ assets: [NEW] });
    await publish({ ...base, gh: f.gh });
    expect(f.rel.assets).toEqual([NEW]);
    expect(f.calls.some((c) => c[1] === 'delete-asset')).toBe(false);
  });
});
