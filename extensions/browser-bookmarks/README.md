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

## Current v1 Scope

- Bookmark and folder sync foundation
- Resource classification and bookmark descriptions
- Rules export/import
- Session capture
- Simple text description placeholder
- Preserve-HTML capture mode in contracts/storage

Rich TipTap note editing and fuller preserve-HTML affordances are deferred beyond v1.
