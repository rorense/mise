# Mise en

A cross-platform mobile app for keeping a personal recipe library and cook log. Recipes stay on your device (local SQLite), with search, tags, cuisines, and optional photos when you record a cook.

Built with [Expo](https://expo.dev) (SDK 54), [React Native](https://reactnative.dev) (New Architecture), and [TypeScript](https://www.typescriptlang.org).

## Features

- **Recipe library** — Browse, search, sort, and filter; grid or list; bulk tag editing  
- **Recipes** — Create and edit recipes; organize with tags and cuisine  
- **Cook log** — Log cooks and attach photos  
- **Import** — Bring recipes in via the import flow  
- **Settings** — App preferences and theming  
- **Offline-first** — Data stored locally with `expo-sqlite`

## Requirements

- **Node.js** (LTS recommended)  
- **npm** (or compatible package manager)  
- For **iOS**: Xcode and CocoaPods (macOS only)  
- For **Android**: Android Studio, SDK, and a device or emulator  

This project uses a [development client](https://docs.expo.dev/develop/development-builds/introduction/) (`expo-dev-client`), not Expo Go alone, because of native modules and custom build settings.

## Getting started

Clone the repository and install dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/mise.git
cd mise
npm install
```

Start the Metro bundler:

```bash
npm start
```

Run on a platform (after native projects are generated / built as needed):

```bash
npm run android
# or
npm run ios
```

First-time native builds may take a while. Use [Expo prebuild](https://docs.expo.dev/workflow/prebuild/) or EAS if you need to regenerate native folders.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm start`    | Start Expo dev server    |
| `npm run android` | Run on Android        |
| `npm run ios`     | Run on iOS            |
| `npm run lint`    | Run ESLint            |
| `npm test`        | Run Jest tests        |

## EAS Build

[EAS](https://expo.dev/eas) profiles are defined in `eas.json` (`development`, `preview`, `production`). Configure your Expo account and run builds from the EAS CLI when you are ready to ship.

## Tech stack (high level)

- **UI & navigation** — React 19, Expo Router, React Native Reanimated, Gesture Handler  
- **Storage** — Expo SQLite, Secure Store for sensitive flags  
- **Media** — Image picker, image manipulator, sharing  

## License

Specify your license here (e.g. MIT) or add a `LICENSE` file in the repository.
