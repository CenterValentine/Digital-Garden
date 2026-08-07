---
title: Panel Overlay Plan — file tree to right-side overlay, sidebar reclaimed for co-browse chat + content
status: >
  PLANNING (2026-08-06). Move #1 (trim the extension nav-tab row in the panel
  embed) SHIPPED on feat/panel-ui-simplify, ext bumped 4.0.0 -> 4.2.0. The
  interim "swap content-store to a new tab" idea is DROPPED (throwaway vs. this
  end-state). Cutover style: EXPLORATORY — rip old affordances early, move fast
  (owner, 2026-08-06). Phase 1 (tree-as-right-overlay) NEXT.
owner: centervalentine
extends: >
  BROWSER-REACH-PLAN.md (B1 panel shell, B4 overlay immersive projection) and
  AGENTIC-BROWSING-PLAN.md (co-browse session, surface-gated tools). This plan
  reshapes the panel UI those built.
related:
  - app/embed/panel/PanelShellClient.tsx           # the side-panel shell (Garden/Chat toggle, tree, workspace)
  - components/content/headers/LeftSidebarHeader.tsx # nav-tab row (move #1 hides it in embed)
  - components/content/LeftSidebar.tsx              # the file tree — becomes the overlay payload
  - extensions/browser-bookmarks/browser-extension/src/overlay/index.js  # on-page overlay (iframe of an app route)
  - extensions/browser-bookmarks/browser-extension/src/panel/index.js    # panel host relay
  - extensions/browser-bookmarks/browser-extension/src/background/index.js # open-side-panel / open-content-in-active-tab
  - lib/domain/browser-extension/panel-bridge.ts   # requestOverlayOpen + postMessage envelope
  - lib/domain/browser-extension/co-browse.ts       # isCoBrowseAvailable = isPanelEmbedSurface (SURFACE-gated)
  - components/content/viewer/ChatViewer.tsx        # chat-content-node surface (same engine, different anchor)
---

# Panel Overlay Plan

## North star (owner vision, 2026-08-06)

Reshape the browser-extension side panel so it stops inheriting the full web-app
left-sidebar chrome:

1. **The file tree leaves the sidebar** and becomes a **right-side, on-page
   overlay** (the projection/overlay system, not the panel iframe). It hides
   readily behind a minimal handle.
2. **Opening content still works both ways** — click an item → it opens in the
   **sidebar (default)** or the **overlay**, exactly as today.
3. **The sidebar is reclaimed for chat + content viewing** (eventually the same
   space). In the panel, chat is uniformly co-browse-capable — no visible
   "regular chat vs browser chat" split.
4. **Three minimal handles** replace the current open affordance:
   - open the **file tree** (overlay),
   - open the **side panel only** (with an in-panel affordance to launch the tree),
   - open **both** — the most prominent.

Later (owner has "other plans" for Garden, deferred): repurpose the vacated
tree slot. Out of scope here.

## Key determinations (from two read-only investigations, 2026-08-06)

### D1 — The overlay can host the tree, but it's an extension change
The overlay is an **iframe of a fixed app route** `/embed/content/{contentId}`
(`src/overlay/index.js:461,513`) and **already supports right-side full-height
docking** (`snap="right"` → `top:0;right:0;height:100vh;width:320px`,
`overlay:688-690`; default snap `right`). The iframe path is hard-coded and every
layer requires a `contentId` (`panel-bridge.ts:42`, `panel/index.js:478`,
`background:2742`). `contentKind` is already plumbed end-to-end but never varies
the path. → To render `LeftSidebar` as an overlay: (a) new app route
(`/embed/tree`), (b) thread a `"tree"` kind so the extension chooses the route
without a `contentId`.

### D2 — Co-browse is SURFACE-gated, not chat-gated → NO schema needed
`isCoBrowseAvailable()` = `isPanelEmbedSurface()` = pathname under `/embed/panel`
(`co-browse.ts:47`, `panel-bridge.ts:32`); the server registers co-browse tools
purely on `body.coBrowseAvailable === true` (`app/api/ai/chat/route.ts:330,1058`).
The `Conversation` model has **no** origin/browser-session/panel field
(`prisma/schema.prisma:1184-1213`); co-browse is entirely runtime/ephemeral
(`state/co-browse-store.ts`). **Therefore every chat opened in the panel is
already browser-enabled.** The perceived "two classes of chat" is really
**surface-vs-surface** (same conversation is live in the panel, inert in the main
app). Consequence: **drop the browser-session-chat filter / schema migration.**
Make chat uniform in the panel; don't dangle co-browse in the main app where it
can't run.

### D3 — The current open affordances the three handles replace
On-page **launcher button** (`overlay:1076`, `#dg-launcher-btn`) + **edge tab**
(`overlay:1077`, `#dg-edge-tab`) → single `open-side-panel`
(`background:2457`). Popup **"Open in Tree"** (`popup:451` → `show-tree-panel`).
In-panel: **Garden/Chat toggle** (`PanelShellClient:530`) and **"Files" collapse
bar** (`PanelShellClient:576`, `treeCollapsed`).

### D4 — Chat content nodes are the real leak
A chat archived to a content node opens via `ChatViewer`
(`MainPanelContent.tsx:2066`), resolving its conversation by
`archivedToContentNodeId` (`ChatViewer.tsx:131`). Same `useConversationEngine`
as the sidebar — two surfaces, one engine. In the panel it *should* light up
co-browse (surface-gated), but that path is **not runtime-verified** yet.

## Decision log

- **DROP the interim "swap content-store to a new tab."** Throwaway against this
  end-state (owner, 2026-08-06).
- **KEEP move #1** (nav-tab trim, shipped) — compatible with the end-state.
- **NO schema change for "co-browse chats only"** — surface-gated (D2). Uniform
  panel chat instead of a filtered class.
- **Cutover: EXPLORATORY** — rip old affordances early, move fast (owner,
  2026-08-06). No parallel old-model preservation required.
- **Versioning:** ext bump +0.0.1 per polish move; already at 4.2.0.

## Phased roadmap

Each phase is independently shippable; extension phases need rebuild+reload and a
+0.0.1 bump. Wire-map before each edit (owner discipline: "don't sever a wire").

### Phase 1 — Tree as right-side overlay (keystone)
- **App:** new route `app/embed/tree/` rendering `LeftSidebar` in the embed frame
  (mirror `PanelShellClient`'s theme + store seeding, DnD wrapper, compact context
  menu). File-click writes to `content-store` as today → opens in the sidebar
  (default target).
- **Extension:** allow the overlay to open the tree route without a `contentId` —
  thread `kind:"tree"` through `panel-bridge` → `panel/index.js` → `background` →
  `src/overlay` so the iframe src becomes `/embed/tree` and snaps `right`,
  full-height.
- **Ship:** tree renders as a right dock; content opens in the sidebar. Old tree
  in the Garden view still present (removed in Phase 3).

### Phase 2 — Three-handle control
- Replace the on-page launcher + edge tab (`overlay:1076/1077`) and popup "Open in
  Tree" (`popup:451`) with three minimal handles: **tree** / **panel-only**
  (+ in-panel tree launcher) / **both** (most prominent). Persist last state.

### Phase 3 — Reclaim the sidebar
- `PanelShellClient`: remove the file tree + `MainPanelWorkspace` from the Garden
  view (tree now lives in the overlay). Sidebar = content viewing + chat. Retire
  the Garden/Chat toggle and "Files" bar (their rationale dissolves). Content
  target selection (sidebar default vs. overlay) wired to the open action.

### Phase 4 — Uniform, honest co-browse (no schema)
- Verify a tree-opened `ChatViewer` in the panel actually sends `coBrowseAvailable`
  (D4); if not, pass panel context through (small, no schema).
- Present chat as one thing in the panel (no "which kind" ambiguity). Ensure the
  main-app chat doesn't advertise co-browse it can't perform.

## Risks / watch items

- **Overlay ↔ sidebar content-target coordination** — "open in overlay vs sidebar"
  needs one clear target signal; reuse the existing `content-store` +
  `requestOverlayOpen` paths, don't invent a parallel one.
- **Keep `ChatPanel`/`useConversationEngine` continuously mounted** through any
  sidebar restructure — remounting drops live `useChat`/streaming state.
- **Partitioned-iframe store seeding** — the tree overlay route is a fresh
  partitioned iframe (like the panel); it needs the same theme/store seeding or
  it renders empty (see `PanelShellClient` theme + settings seeding).
- **Extension load-path trap** — rebuild + reload at chrome://extensions after
  every extension-source phase; confirm the loaded dir is this worktree's.
