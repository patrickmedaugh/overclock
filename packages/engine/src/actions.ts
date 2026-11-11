import type { Side } from './state';

export type Action = { readonly type: 'draw'; readonly player: Side };

export type ActionType = Action['type'];
