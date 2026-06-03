# Digital Garden — Mobile (Expo WebView spike)

A thin **React Native + WebView** shell that wraps the existing Next.js
Digital Garden web app. The web app stays the product core; this native
shell exists to host mobile-only capabilities later (camera, mic, push,
haptics, deep links). **Nothing in the web app is reimplemented natively.**

> Phase 1 status: loads the web app in a WebView, handles external links via a
> typed bridge, and ships the message contracts for future native features.

---

## Layout

```
mobile/
  package.json          # isolated Expo app (NOT in the repo's pnpm workspace)
  app.config.ts         # native identity + iOS-friendly defaults; reads env
  index.ts              # Expo entry → registers App
  App.tsx               # SafeAreaProvider + StatusBar + <MobileWebView/>
  src/
    config.ts           # web URL + origin helpers (env-driven)
    MobileWebView.tsx   # the WebView shell (loading/error/refresh/nav policy)
    bridge/
      messages.ts       # WebToNative / NativeToWeb typed contract + parser
      nativeBridge.ts   # message handlers + shouldOpenExternally() policy
```

The web side has a companion helper at
[`lib/mobile-bridge/client.ts`](../lib/mobile-bridge/client.ts) (`postToNative`,
`isNativeShell`, `openExternalUrl`) and a landing route at
[`app/mobile/page.tsx`](../app/mobile/page.tsx).

---

## Why it's isolated from the main repo

The repo has **no pnpm workspace**, so `pnpm install` at the root never
descends into `mobile/`. This app manages its **own** dependencies with **npm**
(Expo + Metro are happiest without pnpm's symlinked `node_modules`). The
`mobile/` folder is also excluded from the root `tsconfig.json` and
`eslint.config.mjs`, so React Native code never enters `pnpm typecheck` /
`pnpm lint`.

---

## Install

```bash
cd mobile
npm install

# Align every dependency to the resolved Expo SDK (recommended after install,
# and the canonical way to add native libs):
npx expo install --fix
npx expo install react-native-webview   # already in package.json; re-runs cleanly
```

> The versions in `package.json` target Expo SDK 52. If `expo install --fix`
> bumps them, commit the result — that's expected.

---

## Run (iOS first)

In **one** terminal, start the web app from the repo root:

```bash
pnpm dev            # serves http://localhost:3015
```

In **another**, start Expo and open iOS:

```bash
cd mobile
npx expo start --ios     # or: npx expo start, then press "i"
```

You need Xcode + an iOS Simulator installed. The simulator can reach
`http://localhost:3015`. A **physical device cannot** — see below.

---

## Pointing the shell at a different web URL

The WebView URL is resolved from `EXPO_PUBLIC_DIGITAL_GARDEN_URL`, falling back
to `http://localhost:3015/mobile`.

```bash
# Local dev (default)
npx expo start

# Physical device on the same Wi-Fi — use your Mac's LAN IP, not localhost:
EXPO_PUBLIC_DIGITAL_GARDEN_URL=http://192.168.1.42:3015/mobile npx expo start

# Staging / production
EXPO_PUBLIC_DIGITAL_GARDEN_URL=https://davidvalentine.org/mobile npx expo start
```

Find your LAN IP with `ipconfig getifaddr en0` (macOS).

---

## The bridge

Messages are a discriminated union shared in spirit by both sides
(`mobile/src/bridge/messages.ts` ↔ `lib/mobile-bridge/client.ts`).

**Web → Native** (`window.ReactNativeWebView.postMessage`):

| type                    | Phase 1 | Behavior                                  |
| ----------------------- | ------- | ----------------------------------------- |
| `web:open-external-url` | ✅ live  | Opens the URL in the system browser       |
| `web:set-title`         | ✅ live  | Hook for native title (callback provided) |
| `web:haptic`            | stub    | Contract only — no-op                     |
| `web:request-camera`    | stub    | Contract only — no-op                     |
| `web:request-microphone`| stub    | Contract only — no-op                     |
| `web:request-location`  | stub    | Contract only — no-op                     |

**Native → Web** (`native:ready`, `native:app-state`,
`native:permission-result`) are declared for later phases.

From web code:

```ts
import { openExternalUrl, isNativeShell } from "@/lib/mobile-bridge/client";

openExternalUrl("https://example.com"); // native browser in-shell, new tab otherwise
if (isNativeShell()) { /* mobile-only UI */ }
```

### Navigation policy — `shouldOpenExternally()`

`src/bridge/nativeBridge.ts` decides which link taps stay in the WebView vs.
open in the system browser. The default keeps same-origin navigation in-app and
externalizes other domains + `mailto:`/`tel:`. **This is the spot to tune for
your auth flow** — OAuth/payment redirects sometimes need to round-trip back to
your origin and should stay in-WebView. See the comment block in that file.

---

## Known limitations / risks (validate before relying on these)

- **Auth in WebView** — the web app uses a cookie session (`session_token`).
  `sharedCookiesEnabled` + `thirdPartyCookiesEnabled` are on, but verify login
  persists across app restarts and that the proxy's `/sign-in` redirect works
  inside the shell.
- **TipTap editing on iOS** — verify keyboard, caret visibility, selection,
  slash-menu positioning, and autosave inside the WebView.
- **AI streaming** — verify the chat stream renders incrementally (no buffering)
  and that session/CORS hold for streamed responses.
- **File uploads** — the web upload buttons are **not** wired to native pickers
  yet; confirm whether `<input type="file">` works in the WebView before relying
  on it.
- **`/mobile` deep-linking** — Flashcards and AI chat are panels inside
  `/content` (the Flashcards view is `localStorage`-driven, not URL-driven), so
  the landing links to the workspace and settings, not dedicated routes.
- **Android** is best-effort in this phase; the focus is iPhone.

---

## Next recommended steps

1. Manually run the four risk checks above (auth, TipTap, AI streaming, uploads).
2. Implement `web:set-title` end-to-end (native header) if you add native chrome.
3. Wire the first real native capability (likely `web:haptic` via `expo-haptics`
   — cheap, validates the round trip).
4. Add `native:app-state` emission (foreground/background) for the web app to
   react to.
5. Decide the production navigation allowlist in `shouldOpenExternally()`.
6. Set up EAS Build when you're ready for a TestFlight build.
```
