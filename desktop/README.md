# Digital Garden — Desktop (Electron shell)

A thin **Electron** shell around the existing Next.js Digital Garden web app.
The web app stays the product. This shell adds desktop-only capabilities
(menus, global hotkeys, deep links, notifications, offline, local services)
and exposes them through a typed bridge. **Nothing in the web app is
reimplemented natively.**

Plan, decisions, and milestones:
[`docs/notes-feature/work-tracking/DESKTOP-APP-PLAN.md`](../docs/notes-feature/work-tracking/DESKTOP-APP-PLAN.md).

> Status: **M0 spike.** The window loads the app with the full security posture,
> and the bridge exposes `window.dgNative` to the app origin only.

---

## Layout

```
desktop/
  package.json            # isolated npm package (NOT a pnpm workspace member)
  electron.vite.config.ts # main + preload only; the renderer is the deployed web app
  src/
    shared/config.ts      # DG_DESKTOP_URL, session partition, origin helpers
    shared/messages.ts    # WebToNative / NativeToWeb contract + validating parser
    main/index.ts         # lifecycle, single-instance, permissions, navigation hardening
    main/windows.ts       # window creation, webPreferences, load-failure page
    main/navigation.ts    # in-app vs system browser vs new window policy
    main/bridge.ts        # IPC handler (authoritative sender-origin check)
    preload/index.ts      # contextBridge → window.dgNative (origin-gated)
```

## Why it's isolated from the main repo

Same arrangement as `mobile/`: own `package.json` and lockfile, excluded from
the root `tsconfig.json` and `eslint.config.mjs`, so Electron code never enters
`pnpm typecheck` / `pnpm lint`. Uses **npm**, because Electron packaging and
pnpm's symlinked `node_modules` don't mix without extra config.

## Install & run

```bash
cd desktop
npm install

npm run dev:prod     # loads https://davidvalentine.org/content
npm run dev          # loads http://localhost:3015/content — start `pnpm dev`
                     # (and `pnpm dev:collab`) from the repo root first
DG_DESKTOP_URL=http://localhost:3017/content npm run dev   # a `pnpm dev -wt` port

npm run typecheck
npm run build        # → out/main, out/preload
```

> **`ELECTRON_RUN_AS_NODE`.** Tools that run inside an Electron host (VS Code's
> extension host, and anything it spawns) set this, and it makes Electron
> behave as plain Node (`require("electron")` returns a path string; `app` is
> undefined). The npm scripts clear it with `env -u`. If you invoke `electron`
> directly, do the same.

Session data (cookies, IndexedDB, Y.js note cache) lives in the
`persist:garden` partition under
`~/Library/Application Support/digital-garden-desktop/`, and survives relaunches.

## Security posture

- `contextIsolation`, `sandbox`, no `nodeIntegration`, no `<webview>`.
- `window.dgNative` is exposed **only** to the top frame of the app origin.
  The main process re-checks the sender frame on every IPC message and drops
  anything that fails `parseWebToNativeMessage`.
- Permissions are allowlisted (`media`, clipboard, notifications, fullscreen)
  and only for the app origin.
- Off-origin navigation goes to the system browser. `accounts.google.com`
  stays in-window so the session cookie lands in the shell's jar (mobile's
  lesson). The `window.open` policy is an open TODO in `main/navigation.ts`.

## M0 risk checks

| Check | Result |
|---|---|
| Shell loads prod; bridge on app origin only; no Node globals in page | ✅ 2026-11-18 |
| Signed-out launch → `/sign-in?from=/content` → Google OAuth in-window | ⚠️ not UA-blocked, but **passkeys never prompt** (Electron has no WebAuthn authenticator UI). Use "Try another way" for now; M1 adds system-browser sign-in |
| Google sign-in via "Try another way" | ✅ 2026-11-18 |
| Relaunch → still signed in | ✅ 2026-11-18 |
| TipTap: typing, slash menu, `[[` wiki-link autocomplete, IME/emoji, rich paste, spellcheck | ✅ 2026-11-18 |
| AI chat streams; reload mid-stream resumes | ✅ 2026-11-18 |
| Upload: two-phase R2 + drag-in from Finder; stored image/PDF render | ✅ 2026-11-18 |
| Hocuspocus connects; two windows on one note show live presence | ✅ 2026-11-18. Surfaced web bug [#319](https://github.com/CenterValentine/Digital-Garden/issues/319): scroll jumps to top on collab sleep/wake (not desktop-specific) |
| Excalidraw + Mermaid render and edit | ✅ 2026-11-18 |
| Mic permission for speech-to-text | ✅ 2026-11-18 |
| External links → system browser | ✅ 2026-11-18 |
