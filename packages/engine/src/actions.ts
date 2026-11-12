import type { ServerId, Side } from './state';

/**
 * Everything a player can ask the engine to do. Plain JSON. New actions must be
 * added to the validation table in `rules.ts` (a missing entry is a type error),
 * the README and the sprint tech plan.
 */
export type Action =
  /** 1 click: top card of your deck to your hand. */
  | { readonly type: 'draw'; readonly player: Side }
  /** 1 click: +1 credit. */
  | { readonly type: 'gain_credit'; readonly player: Side }
  /** Ends your turn; leftover clicks are lost. Hand > 5 enters the discard step first. */
  | { readonly type: 'end_turn'; readonly player: Side }
  /** Hand-limit step only: indices into the current hand (exactly hand - 5 of them). */
  | { readonly type: 'discard'; readonly player: Side; readonly handIndices: readonly number[] }
  /**
   * 1 click: install the hand card at `handIndex`. Corp: `server` is required (an existing
   * server id or 'new'). Runner: `server` must be absent (cards go to the rig).
   */
  | { readonly type: 'install'; readonly player: Side; readonly handIndex: number; readonly server?: ServerId | 'new' }
  /**
   * 1 click: play the operation/event at `handIndex` (pays its cost, goes face up to discard, resolves `onPlay`).
   * `server` is required for run events with no fixed server (Inside Job) and must be absent otherwise.
   */
  | { readonly type: 'play'; readonly player: Side; readonly handIndex: number; readonly server?: ServerId }
  /** Runner, 1 click: start a run on `server`. */
  | { readonly type: 'run'; readonly player: Side; readonly server: ServerId }
  /** Corp, approach step: rez the approached ICE `uid` (pays its cost). */
  | { readonly type: 'rez'; readonly player: Side; readonly uid: string }
  /**
   * The deciding side takes the default at the current run step: approach = Don't rez;
   * encounter = Let it through; continue = Continue; access = Leave it / Done.
   */
  | { readonly type: 'pass'; readonly player: Side }
  /** Runner, continue step only: end the run, nothing accessed. */
  | { readonly type: 'jack_out'; readonly player: Side }
  /**
   * Runner, encounter step: use ability `ability` (index into the card's `abilities`) of the
   * installed breaker `uid`. `sub` (subroutine index of the current ICE) is required for breaks.
   */
  | { readonly type: 'use_ability'; readonly player: Side; readonly uid: string; readonly ability: number; readonly sub?: number }
  /** Runner, access step: steal the agenda at `card` (index into `run.access.cards`). */
  | { readonly type: 'steal'; readonly player: Side; readonly card: number }
  /** Runner, access step: pay the trash cost of the card at `card` (index into `run.access.cards`). */
  | { readonly type: 'trash'; readonly player: Side; readonly card: number }
  /** Corp, 1 click + 1 credit: put an advancement counter on its installed agenda `uid`. */
  | { readonly type: 'advance'; readonly player: Side; readonly uid: string }
  /** Corp, no click, own turn outside a run: score installed agenda `uid` once it has enough counters. */
  | { readonly type: 'score'; readonly player: Side; readonly uid: string };

export type ActionType = Action['type'];

/** Narrows `Action` to one action type. */
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;
