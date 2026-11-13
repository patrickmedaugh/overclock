// Compile-time flags set by vite.config.ts (`define`). See the Android build
// contract in docs/sprints/sprint-04-tech-plan.md.

/** True in the web build (the Playwright test hook is included); false in the Android app. */
declare const __TEST_HOOK__: boolean;
/** True only in the Android app build (`vite build --mode android`). */
declare const __NATIVE__: boolean;
/** When this build was made, e.g. "2026-11-13 14:32 UTC". */
declare const __BUILD_TIME__: string;
/** The online service's WebSocket address (OVERCLOCK_SERVER_URL at build time), '' when not set up. */
declare const __SERVER_URL__: string;
/** The web game's address for share links from the app (OVERCLOCK_WEB_URL at build time), or ''. */
declare const __WEB_URL__: string;
