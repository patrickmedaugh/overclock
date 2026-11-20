export { LocalMatch } from './local-match';
export type { LoadResult, MatchUpdate, SeatUpdate } from './local-match';
export { MAX_SAVED_DECK_CARDS, SAVE_FORMAT, parseSavedGame } from './saved-game';
export type { LoadFailure, SavedGame } from './saved-game';
// Sprint 13: the on-device deck store format. Sprint 14: format 2 (tombstones), merge, upload check.
export {
  DECK_STORE_FORMAT,
  MAX_DECK_CARD_ENTRIES,
  MAX_DECK_ID_LENGTH,
  MAX_DECK_NAME_LENGTH,
  MAX_DECK_UPLOAD_BYTES,
  MAX_STORE_DECKS,
  MAX_STORE_TOMBSTONES,
  MAX_STORED_COPIES,
  checkDeckUpload,
  mergeDeckStores,
  parseDeckStore,
} from './saved-decks';
export type { DeckStore, DeckTombstone, StoredDeck, UploadProblem } from './saved-decks';
