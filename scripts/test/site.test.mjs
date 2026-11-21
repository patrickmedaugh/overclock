// Sprint 15 (S-15-5): the play site the android workflow pushes to `play`.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assemble, latestJson, netlifyToml } from '../play-site.mjs';
import { checkSite } from '../check-site.mjs';

const BUILD = '2026-11-20 17:00 UTC';
const SHA = 'a'.repeat(40);
const APK = 'overclock-sprint-15-20261120-1700-b412.1.apk';
const SERVER = 'wss://overclock.example.workers.dev';
const expected = { buildTime: BUILD, versionCode: '412', branch: 'sprint-15', commit: SHA, serverUrl: SERVER };

let dir;
let site;
let apkFile;

function webBuild(base = '/') {
  mkdirSync(join(site, 'assets'), { recursive: true });
  writeFileSync(
    join(site, 'index.html'),
    `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ${SERVER} https://overclock.example.workers.dev">` +
      `<link rel="manifest" href="manifest.webmanifest"><script type="module" src="${base}assets/index-1.js"></script>` +
      `<link rel="stylesheet" href="${base}assets/index-1.css"></head></html>`,
  );
  writeFileSync(join(site, 'manifest.webmanifest'), '{}');
  writeFileSync(join(site, 'assets', 'index-1.js'), `const built = "${BUILD}";`);
  writeFileSync(join(site, 'assets', 'index-1.css'), 'body{}');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oc-site-'));
  site = join(dir, 'site');
  mkdirSync(site);
  apkFile = join(dir, APK);
  writeFileSync(apkFile, Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(200_000, 7)]));
  webBuild();
  assemble(site, apkFile, { buildTime: BUILD, versionCode: '412', branch: 'sprint-15', commit: SHA });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('play-site.mjs', () => {
  it('adds the APK twice, latest.json and a no-build netlify.toml', () => {
    expect(readFileSync(join(site, 'app', 'overclock.apk')).equals(readFileSync(apkFile))).toBe(true);
    expect(readFileSync(join(site, 'app', APK)).equals(readFileSync(apkFile))).toBe(true);
    expect(JSON.parse(readFileSync(join(site, 'app', 'latest.json'), 'utf8'))).toEqual({
      buildTime: BUILD,
      versionCode: 412,
      branch: 'sprint-15',
      commit: SHA,
      apk: APK,
    });
    const toml = readFileSync(join(site, 'netlify.toml'), 'utf8');
    expect(toml).toContain('publish = "."');
    expect(toml).toContain('for = "/app/overclock.apk"');
    expect(toml).toContain(`for = "/app/${APK}"`);
    expect(toml).toContain('Content-Type = "application/vnd.android.package-archive"');
    expect(toml).toContain('Content-Disposition = "attachment; filename=\\"overclock.apk\\""');
  });

  it('latest.json stores the version code as a number', () => {
    expect(JSON.parse(latestJson({ buildTime: BUILD, versionCode: '7', branch: 'main', commit: SHA, apk: APK })).versionCode).toBe(7);
  });

  it('netlify.toml lists one header block per APK name', () => {
    expect(netlifyToml('overclock.apk').match(/\[\[headers\]\]/g)).toHaveLength(2);
    expect(netlifyToml(APK).match(/\[\[headers\]\]/g)).toHaveLength(3);
  });
});

describe('check-site.mjs', () => {
  it('passes a correctly assembled site', () => {
    expect(checkSite(site, expected)).toEqual([]);
  });

  it('fails without a web build', () => {
    rmSync(join(site, 'index.html'));
    expect(checkSite(site, expected).join('\n')).toMatch(/no web build/);
  });

  it('fails a build for the GitHub Pages base path', () => {
    webBuild('/overclock/');
    expect(checkSite(site, expected).join('\n')).toMatch(/built for \/overclock\//);
  });

  it('fails when a linked script is missing', () => {
    rmSync(join(site, 'assets', 'index-1.js'));
    expect(checkSite(site, expected).join('\n')).toMatch(/has no assets\/index-1\.js/);
  });

  it("fails when the web build time is not the APK's", () => {
    expect(checkSite(site, { ...expected, buildTime: '2026-11-20 17:01 UTC' }).join('\n')).toMatch(/build time/);
  });

  it("fails when the online service is not in the page's CSP", () => {
    expect(checkSite(site, { ...expected, serverUrl: 'wss://elsewhere.example' }).join('\n')).toMatch(/CSP does not allow/);
  });

  it('fails when the site mentions github.io', () => {
    writeFileSync(join(site, 'assets', 'index-1.css'), '/* https://someone.github.io/overclock/ */');
    expect(checkSite(site, expected).join('\n')).toMatch(/github\.io/);
  });

  it('fails a latest.json for another commit, branch or version code', () => {
    const p = checkSite(site, { ...expected, commit: 'b'.repeat(40), branch: 'main', versionCode: '413' }).join('\n');
    expect(p).toMatch(/commit/);
    expect(p).toMatch(/branch/);
    expect(p).toMatch(/versionCode/);
  });

  it('fails a broken latest.json', () => {
    writeFileSync(join(site, 'app', 'latest.json'), '{nope');
    expect(checkSite(site, expected).join('\n')).toMatch(/not JSON/);
  });

  it('fails when an APK is missing, not a zip, or the two copies differ', () => {
    rmSync(join(site, 'app', APK));
    expect(checkSite(site, expected).join('\n')).toMatch(new RegExp(`${APK.replace(/\./g, '\\.')} is missing`));
    writeFileSync(join(site, 'app', APK), Buffer.alloc(200_000, 1));
    const p = checkSite(site, expected).join('\n');
    expect(p).toMatch(/not an APK/);
    expect(p).toMatch(/differs/);
    writeFileSync(join(site, 'app', 'overclock.apk'), 'PK\u0003\u0004');
    expect(checkSite(site, expected).join('\n')).toMatch(/only 4 bytes/);
  });

  it('fails a netlify.toml that builds, or lacks the download headers', () => {
    const file = join(site, 'netlify.toml');
    const good = readFileSync(file, 'utf8');
    writeFileSync(file, good.replace(/command = "[^"]*"/, 'command = "npm run build -w @overclock/client"'));
    expect(checkSite(site, expected).join('\n')).toMatch(/build nothing/);
    writeFileSync(file, good.replace(/Content-Disposition = "attachment[^\n]*\n/g, ''));
    expect(checkSite(site, expected).join('\n')).toMatch(/not served as a download/);
    writeFileSync(file, good.replace(/application\/vnd\.android\.package-archive/g, 'application/octet-stream'));
    expect(checkSite(site, expected).join('\n')).toMatch(/is not served as application\/vnd\.android/);
    rmSync(file);
    expect(checkSite(site, expected).join('\n')).toMatch(/netlify\.toml is missing/);
  });
});
