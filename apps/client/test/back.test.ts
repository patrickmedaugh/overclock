// S-04-2: the Back button's decision (owner answer A).
import { describe, expect, it } from 'vitest';
import { type BackState, backAction } from '../src/back';

const none: BackState = { dialogOpen: false, zoomOpen: false, gameOver: false };

describe('backAction', () => {
  it('during a game it asks "Leave the game?"', () => {
    expect(backAction(none)).toBe('ask_leave');
  });
  it('with the question showing, Back is Stay (closes it)', () => {
    expect(backAction({ ...none, dialogOpen: true })).toBe('close_dialog');
    expect(backAction({ dialogOpen: true, zoomOpen: true, gameOver: true })).toBe('close_dialog');
  });
  it('with a zoomed card showing, Back closes the zoom (even after the game ended)', () => {
    expect(backAction({ ...none, zoomOpen: true })).toBe('close_zoom');
    expect(backAction({ ...none, zoomOpen: true, gameOver: true })).toBe('close_zoom');
  });
  it('on the game-over screen, Back closes the app', () => {
    expect(backAction({ ...none, gameOver: true })).toBe('exit');
  });
  it('S-05: with the ICE report or the Last run strip open, Back closes it (a zoom over it first)', () => {
    expect(backAction({ ...none, panelOpen: true })).toBe('close_panel');
    expect(backAction({ ...none, panelOpen: true, zoomOpen: true })).toBe('close_zoom');
    expect(backAction({ ...none, panelOpen: true, gameOver: true })).toBe('close_panel');
  });
});
