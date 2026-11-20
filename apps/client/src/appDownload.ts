// Sprint 15 (S-15-5, owner Q4 A): the "Get the Android app" button on the play site's start
// screen. The site publishes `app/latest.json` ({buildTime, versionCode, branch, commit, apk})
// next to the app file; the button shows only when that file loads (never in the Android app,
// never in a test link without the file). Pure, so the parsing is unit tested.

export interface AppDownload {
  /** The app file, relative to the site (`app/<apk>`). */
  href: string;
  /** "Built …" of the app, as published. */
  buildTime: string;
}

/** The button's link from `app/latest.json`'s text, or null when it is missing, broken or names an odd file. */
export function appDownloadFrom(json: unknown): AppDownload | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const apk = o['apk'];
  // Only a plain file name in the same folder (no path, no other site).
  if (typeof apk !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/.test(apk)) return null;
  const buildTime = typeof o['buildTime'] === 'string' ? o['buildTime'] : '';
  return { href: `app/${apk}`, buildTime };
}
