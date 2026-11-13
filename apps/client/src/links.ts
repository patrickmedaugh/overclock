// S-06-1: the links that join a game (`?join=CODE`). Pure.
import { normalizeCode } from '@overclock/protocol';

/** The `?join=CODE` of a page address, normalised, or null. */
export function joinCodeFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('join');
  if (raw === null) return null;
  const code = normalizeCode(raw);
  return code === '' ? null : code;
}

/**
 * The link to send for `code`: the web game's address with `?join=CODE`.
 * `page` = this page (web build); `webUrl` = OVERCLOCK_WEB_URL (the app has no
 * web address of its own). Null when there is no web address to send.
 */
export function shareLink(code: string, opts: { native: boolean; page: string; webUrl: string }): string | null {
  const base = opts.native ? opts.webUrl : opts.page;
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', code);
  return url.toString();
}

/** What the share sheet sends: a line of text with the code (and the link, when there is one). */
export function shareText(code: string): string {
  return `Join my OVERCLOCK game. Code: ${code}`;
}
