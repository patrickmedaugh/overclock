import { describe, expect, it } from 'vitest';
import { joinCodeFromUrl, shareLink } from '../src/links';

describe('join links', () => {
  it('reads ?join= from the address, normalised', () => {
    expect(joinCodeFromUrl('?join=k7-qf')).toBe('K7QF');
    expect(joinCodeFromUrl('?seed=1')).toBeNull();
    expect(joinCodeFromUrl('?join=')).toBeNull();
  });
  it('web: this page with only ?join=CODE (other switches dropped)', () => {
    expect(shareLink('K7QF', { native: false, page: 'https://x.github.io/overclock/?seed=3#a', webUrl: '' })).toBe('https://x.github.io/overclock/?join=K7QF');
  });
  it('app: the web game address, never the app\'s own https://localhost', () => {
    expect(shareLink('K7QF', { native: true, page: 'https://localhost/', webUrl: 'https://x.github.io/overclock/' })).toBe('https://x.github.io/overclock/?join=K7QF');
    expect(shareLink('K7QF', { native: true, page: 'https://localhost/', webUrl: '' })).toBeNull();
  });
});

describe('Sprint 15: the Netlify play link', () => {
  it('the app shares the new play link (https://overcloc.netlify.app), never the old GitHub one', () => {
    const url = shareLink('K7QF', { native: true, page: 'https://localhost/', webUrl: 'https://overcloc.netlify.app/' });
    expect(url).toBe('https://overcloc.netlify.app/?join=K7QF');
    expect(url).not.toContain('github.io');
  });
  it('the play site shares its own address', () => {
    expect(shareLink('K7QF', { native: false, page: 'https://overcloc.netlify.app/?seed=3', webUrl: 'https://overcloc.netlify.app/' })).toBe('https://overcloc.netlify.app/?join=K7QF');
  });
});
