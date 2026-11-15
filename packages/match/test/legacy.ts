// Sprint 8: the Sprint 2–7 match tests play on the frozen starter decks. These wrappers default
// `deckSet` to 'starter' (the product default is 'core'); pass `{deckSet: 'core'}` to override.
import {
  newGame as engineNewGame,
  replay as engineReplay,
  type Action,
  type GameEvent,
  type GameOptions,
  type GameState,
} from '@overclock/engine';
import { LocalMatch as BaseMatch } from '../src/index';

export const STARTER: Pick<GameOptions, 'deckSet'> = { deckSet: 'starter' };

const starter = (options?: Partial<GameOptions>): Partial<GameOptions> => ({ ...STARTER, ...options });

export function newGame(seed: number, options?: Partial<GameOptions>): GameState {
  return engineNewGame(seed, starter(options));
}

export function replay(seed: number, actions: readonly Action[], options?: Partial<GameOptions>): { state: GameState; events: GameEvent[] } {
  return engineReplay(seed, actions, starter(options));
}

export class LocalMatch extends BaseMatch {
  constructor(seed: number, options?: Partial<GameOptions>) {
    super(seed, starter(options));
  }

  static override restore(seed: number, actions: readonly Action[], options?: Partial<GameOptions>): BaseMatch {
    return BaseMatch.restore(seed, actions, starter(options));
  }
}
