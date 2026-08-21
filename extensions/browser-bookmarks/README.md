# Browser Bookmarks Extension

This directory contains the Digital Garden browser-bookmarks integration in two parts:

- `manifest.ts`, `module.ts`, and `settings/` wire the feature into the main app as a built-in extension/settings surface.
- `browser-extension/` contains the Chromium MV3 browser artifact for Chrome and Vivaldi.

## App Surface

After signing in, manage trusted browsers, bookmark-root connections, and bookmark metadata preferences at:

- `/settings/browser-bookmarks`

The app exposes the integration API under:

- `/api/integrations/browser-bookmarks`

## Browser Extension

Load the unpacked extension from:

- `extensions/browser-bookmarks/browser-extension`

### Local install

1. Open `chrome://extensions` in Chrome or `vivaldi://extensions` in Vivaldi.
2. Enable Developer Mode.
3. Choose `Load unpacked`.
4. Select `extensions/browser-bookmarks/browser-extension`.

### Required setup

1. In Digital Garden, open `/settings/browser-bookmarks`.
2. Trust the current browser extension install.
3. Create at least one bookmark sync connection pairing a browser root folder with an app folder.
4. Bootstrap sync for the connection before relying on bidirectional changes.

### Optional: silence Chromium's debugger infobar (co-browse)

Co-browse attaches `chrome.debugger`, which makes Chromium show a *global*
`"…started debugging this browser"` infobar in every tab of every window of the
profile — standalone-PWA windows included. It cannot be scoped from extension
code. The extension carries its own signals instead: the amber **Co-browsing …
Stop** bar in the side panel, and an on-page banner painted into the driven tab
(`src/agentic/cdp/banner.js`). With those in place you can silence the infobar
locally by launching the browser with `--silent-debugger-extension-api`. This is
a per-launch, per-machine browser flag — it does not ship with the extension.

macOS (Vivaldi): the flag is not persisted anywhere, so use a launcher app that
passes it and start the browser from that instead of the Dock icon:

```bash
osacompile -o "$HOME/Applications/Vivaldi (co-browse).app" -e 'do shell script "open -a Vivaldi --args --silent-debugger-extension-api"'
cp /Applications/Vivaldi.app/Contents/Resources/app.icns "$HOME/Applications/Vivaldi (co-browse).app/Contents/Resources/applet.icns"
```

Quit Vivaldi fully first (⌘Q) — the flag only applies to a fresh process, and a
PWA window launched before the browser starts a flagless process. Verify with
`pgrep -f -- --silent-debugger-extension-api | wc -l` (≥1 once running).
The distribution-time fix is installing the extension via the
`ExtensionInstallForcelist` policy (policy-installed extensions never raise the
infobar); see the D-BANNER amendment in
`docs/notes-feature/work-tracking/AGENTIC-BROWSING-PLAN.md`.

## Current v1 Scope

- Bookmark and folder sync foundation
- Resource classification and bookmark descriptions
- Rules export/import
- Session capture
- Simple text description placeholder
- Preserve-HTML capture mode in contracts/storage

Rich TipTap note editing and fuller preserve-HTML affordances are deferred beyond v1.
