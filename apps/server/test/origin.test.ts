import { describe, expect, it } from 'vitest';
import { originAllowed } from '../src/origin';

const PROD = 'https://patrickmedaugh.github.io,https://overcloc.netlify.app,https://*--overcloc.netlify.app,https://localhost';
const DEV = 'http://localhost:*,http://127.0.0.1:*';

describe('originAllowed', () => {
  it.each([
    ['https://patrickmedaugh.github.io', PROD, true],
    ['https://overcloc.netlify.app', PROD, true],
    ['https://deploy-preview-15--overcloc.netlify.app', PROD, true],
    ['https://localhost', PROD, true], // the Android app (Capacitor)
    ['http://localhost:5173', PROD, false],
    ['https://evil.example', PROD, false],
    ['https://overcloc.netlify.app.evil.example', PROD, false],
    ['https://evil.example/https://overcloc.netlify.app', PROD, false],
    ['https://a.b--overcloc.netlify.app', PROD, false], // * never spans a dot
    ['https://patrickmedaugh.github.io:443', PROD, false],
    ['http://localhost:5173', DEV, true],
    ['http://127.0.0.1:4399', DEV, true],
    ['http://localhost', DEV, false],
    ['http://localhost:5173.evil.example', DEV, false],
  ])('%s with %#', (origin, list, ok) => {
    expect(originAllowed(origin, list)).toBe(ok);
  });

  it('a missing Origin or an empty list allows nothing', () => {
    expect(originAllowed(null, PROD)).toBe(false);
    expect(originAllowed('https://localhost', '')).toBe(false);
    expect(originAllowed('', ' , ')).toBe(false);
  });
});
