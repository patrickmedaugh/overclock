// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-android/**',
      // The Android project: generated files and the web bundle copied in by `cap sync`.
      'apps/android/android/**',
      '**/dist-types/**',
      '**/dist-worker/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Node-run config files at the repo root and in each workspace.
    files: ['*.{js,ts}', '**/*.config.{js,ts}', '**/scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Browser code for the game client.
    files: ['apps/client/src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The rules engine must be pure and deterministic: no randomness, clocks,
    // timers, or DOM. Randomness comes only from the seeded RNG in GameState.
    // The match host (packages/match) is held to the same rules so a game is
    // replayable from (seed, actions) whatever drives it.
    files: ['packages/engine/**/*.ts', 'packages/match/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine must be deterministic: no clocks.' },
        { name: 'setTimeout', message: 'Engine must not use timers.' },
        { name: 'setInterval', message: 'Engine must not use timers.' },
        { name: 'setImmediate', message: 'Engine must not use timers.' },
        { name: 'clearTimeout', message: 'Engine must not use timers.' },
        { name: 'clearInterval', message: 'Engine must not use timers.' },
        { name: 'queueMicrotask', message: 'Engine must be synchronous.' },
        { name: 'requestAnimationFrame', message: 'Engine must not use timers.' },
        { name: 'performance', message: 'Engine must be deterministic: no clocks.' },
        { name: 'crypto', message: 'Use the seeded RNG in GameState.' },
        { name: 'window', message: 'Engine must not touch the DOM.' },
        { name: 'document', message: 'Engine must not touch the DOM.' },
        { name: 'navigator', message: 'Engine must not touch the DOM.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in GameState (src/rng.ts).' },
        { object: 'globalThis', property: 'Date', message: 'Engine must be deterministic: no clocks.' },
        { object: 'globalThis', property: 'setTimeout', message: 'Engine must not use timers.' },
        { object: 'globalThis', property: 'window', message: 'Engine must not touch the DOM.' },
        { object: 'globalThis', property: 'document', message: 'Engine must not touch the DOM.' },
        { object: 'globalThis', property: 'crypto', message: 'Use the seeded RNG in GameState.' },
        { object: 'globalThis', property: 'performance', message: 'Engine must be deterministic: no clocks.' },
        { object: 'globalThis', property: 'setInterval', message: 'Engine must not use timers.' },
      ],
    },
  },
  {
    // Client and AI use only the public index of engine/cards/match (CLAUDE.md §2).
    files: ['apps/client/**/*.ts', 'packages/ai/**/*.ts'],
    ignores: ['**/*.config.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@overclock/engine/*', '@overclock/cards/*', '@overclock/match/*'],
              message: 'Import the package public index only.',
            },
            { group: ['**/packages/*/src/**'], message: 'Import the package public index only.' },
          ],
        },
      ],
    },
  },
  {
    // The client never runs the rules loop itself: it goes through the match
    // host (@overclock/match), which hands it per-seat projections.
    files: ['apps/client/**/*.ts'],
    ignores: ['**/*.config.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@overclock/engine',
              importNames: ['apply', 'newGame', 'legalActions', 'viewFor', 'replay'],
              message: 'The client goes through @overclock/match (LocalMatch); it never runs the engine directly.',
            },
          ],
          patterns: [
            {
              group: ['@overclock/engine/*', '@overclock/cards/*', '@overclock/match/*'],
              message: 'Import the package public index only.',
            },
            { group: ['**/packages/*/src/**'], message: 'Import the package public index only.' },
          ],
        },
      ],
    },
  },
  {
    // Node-side e2e setup may use the match's test helpers (planBusyBoard,
    // packages/engine/README.md "@overclock/match/testing"); the client src may not.
    files: ['apps/client/e2e/**/*.ts', 'apps/client/test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@overclock/engine',
              importNames: ['apply', 'newGame', 'legalActions', 'viewFor', 'replay'],
              message: 'The client goes through @overclock/match (LocalMatch); it never runs the engine directly.',
            },
          ],
          patterns: [
            {
              group: ['@overclock/engine/*', '@overclock/cards/*', '@overclock/match/*', '!@overclock/match/testing'],
              message: 'Import the package public index only (e2e may also use @overclock/match/testing).',
            },
            { group: ['**/packages/*/src/**'], message: 'Import the package public index only.' },
          ],
        },
      ],
    },
  },
  {
    // The AI must not cheat: it sees only viewFor() output (PlayerView).
    files: ['packages/ai/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@overclock/engine',
              importNames: ['GameState', 'PlayerState', 'apply', 'newGame', 'legalActions', 'viewFor', 'replay'],
              message: 'AI consumes only PlayerView (viewFor output); it must never see GameState.',
            },
          ],
          patterns: [
            {
              group: ['@overclock/engine/*', '@overclock/cards/*', '@overclock/match/*'],
              message: 'Import the package public index only.',
            },
            { group: ['**/packages/*/src/**'], message: 'Import the package public index only.' },
          ],
        },
      ],
    },
  },
);
