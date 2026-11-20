// Sprint 15 (S-15-5): the "Get the Android app" button reads app/latest.json.
import { describe, expect, it } from 'vitest';
import { appDownloadFrom } from '../src/appDownload';

describe('appDownloadFrom', () => {
  it('links the published app file next to latest.json', () => {
    expect(appDownloadFrom({ buildTime: '2026-11-20 17:00 UTC', versionCode: 120, branch: 'sprint-15', commit: 'abc', apk: 'overclock-sprint-15-120.apk' })).toEqual({
      href: 'app/overclock-sprint-15-120.apk',
      buildTime: '2026-11-20 17:00 UTC',
    });
  });
  it('no button for a missing, broken or odd file name', () => {
    expect(appDownloadFrom(null)).toBeNull();
    expect(appDownloadFrom('x')).toBeNull();
    expect(appDownloadFrom({})).toBeNull();
    expect(appDownloadFrom({ apk: '../evil.apk' })).toBeNull();
    expect(appDownloadFrom({ apk: 'https://elsewhere.example/x.apk' })).toBeNull();
    expect(appDownloadFrom({ apk: 'overclock.zip' })).toBeNull();
  });
});
