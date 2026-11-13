# apps/android — the OVERCLOCK Android app

A [Capacitor](https://capacitorjs.com/) wrapper around the game client
(`apps/client`). The app is the same game as the web demo, built in
"android mode": no test hook, no "Turn your phone sideways" screen (the app is
locked sideways), assets served from the app itself (works offline).

- App id: `app.overclock.game` (never change it: Android treats a new id as a different app).
- Name on the phone: **OVERCLOCK**. Icon: drawn by us (`icon/foreground.svg`).
- Exact versions: `@capacitor/cli`, `@capacitor/android`, `@capacitor/core` 8.6.2,
  `@capacitor/app` 8.1.2.

## How the owner gets the app

GitHub builds it on every push to `main` or a `sprint-*` branch
(`.github/workflows/android.yml`) and puts it on the repo's **Releases** page:
one release per branch, named `OVERCLOCK app — <branch> — built <time>`, with
the file `overclock-<branch>-<YYYYMMDD-HHMM>-b<run>.<attempt>.apk`. `main` is the "Latest"
release; sprint branches are marked "Pre-release". On the phone: open the
Releases page, tap the `.apk`, allow installs from the browser once, then
**Install**. The build time on the release matches the small "Built …" note in
the corner of the board.

Publishing (S-05-4) is its own job, `publish`, after `build`. A newer push may
cancel a `build`, never a `publish`. `scripts/publish-release.mjs` creates
the release if GitHub says "release not found". Otherwise it uploads the new APK, moves the
tag to the commit, updates the title and notes, and only then deletes the older
`.apk` files, so the release always has an APK. Any other `gh` error fails the
run (red in Actions). Tested with a fake `gh`: `npm test --workspace @overclock/android`.

## Build it yourself

Needs Node 22 (the Capacitor 8 CLI refuses older), JDK 21 and the Android SDK (`ANDROID_HOME`, platform 36,
build-tools). From the repo root:

```sh
npm ci
npm run sync --workspace @overclock/android   # android web build + bundle check + cap sync
npm run apk  --workspace @overclock/android   # ./gradlew assembleRelease
# -> apps/android/android/app/build/outputs/apk/release/app-release.apk
```

Optional environment: `OVERCLOCK_BUILD_TIME` ("2026-11-13 14:32 UTC": shown on
the board and used as the app's version name) and `OVERCLOCK_VERSION_CODE`
(an integer that must grow with every release so updates install in place; CI
uses the workflow run number). Set `OVERCLOCK_BUILD_TIME` before the sync so the
web bundle and the app agree.

There is deliberately no `build` script here: the root `npm run build` must
never need the Android SDK.

## What is where

- `capacitor.config.json` — app id/name, `webDir: ../client/dist-android`,
  SystemBars plugin: bars hidden, safe-area insets handed to the page as CSS.
- `android/` — the generated Android project (committed). `cap sync` copies the
  web bundle into `android/app/src/main/assets/public` (not committed).
- `android/app/src/main/java/app/overclock/game/MainActivity.java` — full
  screen: status and navigation bars hidden (a swipe from the edge shows them
  briefly), re-hidden when the app comes back; drawn beside the camera cutout.
  The board stays clear of the cutout and the gesture bar using the safe-area
  insets (`#safe-probe` in `apps/client/index.html`).
- `AndroidManifest.xml` — `screenOrientation="sensorLandscape"` (sideways either way up).
- `keystore/overclock.jks` — the one release signing key (alias `overclock`,
  password `overclock`, RSA 2048, valid 10000 days). It is committed on purpose
  (personal app; DECISIONS 2026-11-13) so every build is signed the same way
  and installs over the previous one. Its certificate SHA-256 is checked in CI:
  `51053121 7c7bbbc0 1172c811 bc7c5a24 d6a5922e 2c495c4f e871fc26 d4deaa99`.
  **Never replace it**: a new key means the owner must uninstall the app first.
- `icon/foreground.svg` + `scripts/render-icons.mjs` — the icon. After editing
  the SVG run `node apps/android/scripts/render-icons.mjs` and commit the PNGs.

## In the app (client side)

- Back button (`@capacitor/app`): closes an open zoom; on the game-over screen
  closes the app; otherwise asks "Leave the game?" (**Leave** / **Stay**).
- Coming back to the app (`resume`) or the GPU dropping the drawing surface
  (`webglcontextrestored`) redraws every card.
- Checks: `npm run check:android --workspace @overclock/client` (bundle has no
  test hook, no rotate prompt, no internet URLs); Playwright project `android`
  serves the android build and checks it boots.
