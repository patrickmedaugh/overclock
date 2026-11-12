import { describe, expect, it } from 'vitest';
import { classifyDevice } from '../src/device';

describe('classifyDevice', () => {
  it('a touch phone held sideways is a phone, no prompt', () => {
    expect(classifyDevice(true, 844, 390)).toEqual({ mode: 'phone', rotatePrompt: false });
    expect(classifyDevice(true, 640, 360)).toEqual({ mode: 'phone', rotatePrompt: false });
  });

  it('a touch phone held upright is a phone with the rotate prompt', () => {
    expect(classifyDevice(true, 390, 844)).toEqual({ mode: 'phone', rotatePrompt: true });
    expect(classifyDevice(true, 360, 640)).toEqual({ mode: 'phone', rotatePrompt: true });
  });

  it('short side up to 500px counts as a phone', () => {
    expect(classifyDevice(true, 932, 500).mode).toBe('phone');
    expect(classifyDevice(true, 1024, 501).mode).toBe('desktop');
  });

  it('tablets and touch laptops with room keep the desktop view, upright or not', () => {
    expect(classifyDevice(true, 768, 1024)).toEqual({ mode: 'desktop', rotatePrompt: false });
    expect(classifyDevice(true, 1280, 800)).toEqual({ mode: 'desktop', rotatePrompt: false });
  });

  it('a mouse is never a phone, even in a small window', () => {
    expect(classifyDevice(false, 390, 844)).toEqual({ mode: 'desktop', rotatePrompt: false });
    expect(classifyDevice(false, 844, 390)).toEqual({ mode: 'desktop', rotatePrompt: false });
  });

  it('a square phone screen counts as sideways (no prompt)', () => {
    expect(classifyDevice(true, 400, 400).rotatePrompt).toBe(false);
  });
});
