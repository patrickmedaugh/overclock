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
  /**
   * Corp, approach step: rez the approached ICE `uid` (pays its cost). Free-rez choice: any unrezzed ICE.
   * Sprint 7: also in the Corp's action phase (no click): an unrezzed asset/upgrade in any server.
   */
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
   * installed breaker `uid`. `sub` (subroutine index of the current ICE) is required for `count: 1`
   * breaks. Sprint 8: `count: 2` breaks ("break up to 2", Battering Ram) take `subs` instead: 1–2
   * distinct unbroken subroutine indices, ascending (`sub` absent); `subs` on any other ability is
   * `invalid_action`.
   */
  | {
      readonly type: 'use_ability';
      readonly player: Side;
      readonly uid: string;
      readonly ability: number;
      readonly sub?: number;
      readonly subs?: readonly number[];
    }
  /** Runner, access step: steal the agenda at `card` (index into `run.access.cards`). */
  | { readonly type: 'steal'; readonly player: Side; readonly card: number }
  /** Runner, access step: pay the trash cost of the card at `card` (index into `run.access.cards`). */
  | { readonly type: 'trash'; readonly player: Side; readonly card: number }
  /** Corp, 1 click + 1 credit: put an advancement counter on its installed agenda (Sprint 7: or advanceable ICE) `uid`. */
  | { readonly type: 'advance'; readonly player: Side; readonly uid: string }
  /** Corp, no click, own turn outside a run: score installed agenda `uid` once it has enough counters. */
  | { readonly type: 'score'; readonly player: Side; readonly uid: string }
  /**
   * Sprint 7: use ability `ability` (index into `CardDef.cardAbilities`) of the player's own
   * installed, face-up card `uid`. `click` abilities: own action phase; `successful_run_remote`:
   * run step `success`. Pays the ability's clicks and credits.
   * Sprint 9: `uid` may also be a scored uid (`scoredUid('corp', i)`, `score:corp:<i>`): `ability` then
   * indexes that agenda's `scoredAbilities` (Corp, own action phase).
   */
  | { readonly type: 'activate'; readonly player: Side; readonly uid: string; readonly ability: number }
  /**
   * Sprint 8: answer an open `trash_target` choice (Corp: `uid` = the Runner card to trash, one of
   * the candidates) or `prevent_trash` choice (Runner: `uid` = the preventer to trash instead).
   * `pass` in `prevent_trash` = let it be trashed; in `trash_target` it is refused (mandatory).
   */
  | { readonly type: 'choose'; readonly player: Side; readonly uid: string }
  /**
   * Sprint 9: bid `credits` (a non-negative integer, at most the player's max) in an open trace choice
   * (`trace_corp` / `trace_runner`). `pass` in a trace choice is refused (`bad_target`; bid 0 instead).
   */
  | { readonly type: 'trace_bid'; readonly player: Side; readonly credits: number }
  /** Sprint 9: Runner basic action, 1 click + 2 credits: remove 1 tag (own action phase; needs a tag). */
  | { readonly type: 'remove_tag'; readonly player: Side }
  /**
   * Sprint 9: Corp basic action, 1 click + 2 credits: trash the Runner's installed resource `uid`
   * (own action phase; only while the Runner is tagged).
   */
  | { readonly type: 'trash_resource'; readonly player: Side; readonly uid: string };

export type ActionType = Action['type'];

/** Narrows `Action` to one action type. */
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;
