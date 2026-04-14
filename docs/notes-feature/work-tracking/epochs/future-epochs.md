---
status: stubs
last_updated: 2026-04-07
---

# Future Epochs (Unplanned)

These epochs are not yet numbered or scheduled. They represent major feature areas identified during roadmap planning.

---

## Collaboration & Sharing Epoch

> Promoted to [Epoch 13: People + Collaboration](epoch-13-people-and-collaboration.md), starting at Sprint 58. This section remains as historical backlog context.

**Theme:** Real-time collaboration, content sharing, permissions

- Content sharing with non-users and users (view-only, edit)
- TipTap collaboration features (real-time collaborative editing)
- **Security review required** — security agent audit before implementation
- Mentions system (@user)
- Annotations & commenting layers
- Non-users cannot access AI features (session validation required)
- Requires compatibility with Multiple Tabs epoch
- Dynamic drag/drop reordering between multiple users
- Limit number of open editors per session for performance

### Prerequisites
- Epoch 8 (Editor Stabilization) complete
- Main Panel Multiple Tabs epoch complete (or at least compatible)

---

## UI Revisions Epoch

**Theme:** Theming, styling customization, user personalization

- Default design themes + custom user themes
- Editor styling customization
- Font customization (file tree, main panel, side panel)
- Background colors / surface customization
- Define what styling is consistent (app-wide) vs customizable (user preference)

### Scope Definition Needed
- Which surfaces are themeable (editor, panels, headers, tree)?
- How do custom themes interact with Liquid Glass tokens?
- Where are themes stored (user settings, CSS variables, both)?

---

## Main Panel Multiple Tabs Epoch

**Theme:** Multi-document editing with tab management

- Multiple ContentNodes open simultaneously in tabs
- Tab behavior defaults to Obsidian-like (click opens, middle-click closes, drag reorder)
- Must be collaboration-friendly (multiple users see each other's tabs?)
- Reference: conductor-one project for implementation patterns

### Prerequisites
- Performance profiling of multiple TipTap instances
- Editor session limits established

---

## YouTube Playlists & Summarizing Epoch (much later)

**Theme:** Video content management and AI summarization

- YouTube playlist support and management
- Summarizing integrations for video content
- Transcript extraction and indexing
- Integration with AI chat for video Q&A

### Prerequisites
- Epoch 10 (AI TipTap) complete
- YouTube embed support from Sprint 38

---

## Deferred Items (from earlier planning)

These items from previous backlogs may be incorporated into the above epochs or remain in the icebox:

- **BYOK key management UI** (originally Epoch 7 Sprint 35 — may become part of AI TipTap or standalone)
- **Speech-to-text / text-to-speech** (originally Epoch 7 — standalone sprint or fold into AI epoch)
- **RAG / embeddings** (originally Epoch 7 — standalone epoch or fold into AI enhancements)
- **Agent mode** (multi-step tool use with user confirmation — may be addressed in Sprint 44)
- **Mermaid viewer in TipTap** (deferred from earlier work)
- **Payload stubs** (Excalidraw, Canvas, Whiteboard, PDF — from Sprint 28 backlog)
- **Mobile & PWA** (responsive layout, offline, touch gestures)
- **Advanced folder views** (Table, Timeline views)

---

**Last Updated**: Mar 5, 2026
