---
name: verify
description: How to actually run Mise en to observe a change at runtime, and what is reachable on each surface.
---

# Verifying Mise en at runtime

Expo SDK 54 / RN 0.81 / expo-router. `.cursorrules` says **Android only**.

## Preferred surface: Android

```bash
npx expo run:android
```

Needs a dev client (native modules — not Expo Go), the Android SDK, and a JDK.
**As of 2026-08-24 this machine has none of them** — no `adb`, no emulator, no
`ANDROID_HOME`, no `java`. Check before planning around it:

```bash
ls "$HOME/AppData/Local/Android/Sdk/platform-tools/adb.exe"; java -version
```

If they're missing, Android is not a handle. Do not report BLOCKED without
first trying web below.

## Fallback surface: web (UI only)

`react-native-web` and `react-dom` are dependencies and Metro bundles the app
for web cleanly. This is the only way to see real screens without a device.

```bash
npx expo start --web --port 8099
```

Two native modules have no web implementation and **stop the app booting**, so
shim them temporarily and restore afterwards:

1. `db/client.web.ts` — ships a deliberate `Promise.reject(...)`. Root
   `_layout.tsx` gates render on `getDatabase()`, so replace it with a stub
   returning `Promise.resolve({} as SQLite.SQLiteDatabase)`.
2. `expo-secure-store` — `getValueWithKeyAsync is not a function` on web.
   Patch **inside `lib/secrets.ts`** with a `Platform.OS === 'web'` in-memory
   Map.

   **Do not add `lib/secrets.web.ts`.** Imports use the `@/lib/secrets` alias
   via `babel-plugin-module-resolver`, which resolves before Metro's platform
   extensions, so the `.web.ts` sibling is silently ignored. This costs a cycle
   to discover.

Back both up to a temp dir first and restore when done — they are app code, not
test code.

### What web can and cannot reach

- **Reachable:** every screen's layout and interaction — tabs, buttons,
  dialogs, empty states, navigation.
- **Not reachable:** anything touching the camera. `expo-image-picker`'s
  `launchCameraAsync` produces no file input and no error on desktop web, so
  the **photo-import pipeline cannot be driven here at all**. Same for real
  SQLite reads (the stub above has no `getAllAsync`).

### Driving it

Screenshots may fail with "the Browser pane is not displayed". Use
`read_page` (accessibility tree) and `get_page_text` — they capture fine and
are legitimate evidence.

The Expo dev error overlay sits above the app and swallows clicks. It lives in
a **shadow root**, so a plain `querySelectorAll('button')` will not find its
Dismiss control — walk `el.shadowRoot` recursively.

`app/import/index.tsx` reads the clipboard on mount, which the browser denies;
that raises an overlay on every load of `/import`. Expected on web.

## Not evidence

`npm test` and `npx tsc --noEmit` are CI. They do not verify a change here.
