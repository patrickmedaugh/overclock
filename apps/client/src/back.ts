// S-04-2: what the phone's Back button does (owner answer A, Sprint 4).
// Pure, so it is unit tested without a phone.

export type BackAction =
  /** "Leave the game?" is showing: Back means Stay. */
  | 'close_dialog'
  /** A zoomed card is showing: close it. */
  | 'close_zoom'
  /** S-05: the ICE report or the Last run strip is showing: close it. */
  | 'close_panel'
  /** The game is over: close the app. */
  | 'exit'
  /** A game in progress: ask "Leave the game?" (Leave / Stay). */
  | 'ask_leave';

export interface BackState {
  dialogOpen: boolean;
  zoomOpen: boolean;
  /** The ICE report or the Last run strip is open. */
  panelOpen?: boolean;
  gameOver: boolean;
}

export function backAction(s: BackState): BackAction {
  if (s.dialogOpen) return 'close_dialog';
  if (s.zoomOpen) return 'close_zoom';
  if (s.panelOpen) return 'close_panel';
  if (s.gameOver) return 'exit';
  return 'ask_leave';
}
