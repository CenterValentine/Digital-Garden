# Tool Surfaces Refactor Plan

**Status:** Draft (Proposed)
**Created:** 2026-02-19

## Goal

Rework Digital‑Garden’s tool system into a scalable, conductor‑one‑style architecture based on the **Tool Surfaces & Context Rules** spec. This plan covers the **refactor-first** track after the spec is approved.

## Target Architecture

```
lib/domain/tools/
├── context.ts          # ToolContext (single source of truth)
├── registry.tsx        # ToolDefinition + registry + resolver
├── surfaces.ts         # Surface types and helpers
└── index.ts            # Public exports

components/content/tools/
├── ToolToolbar.tsx     # Toolbar surface renderer (header)
├── ToolbeltSurface.tsx # Toolbelt renderer wrapper (uses existing tool-belt)
├── SidePanelTools.tsx  # Right-side panel tabs with tool panels
└── ToolPanelTabs.tsx   # Panel tabs / panel content
```

## Mapping: Current → Target

### Existing files (current system)
- `components/content/tool-belt/*` → **Toolbelt Surface**
- `components/content/RightSidebar.tsx` → **Side Panel host**
- `components/content/headers/RightSidebarHeader.tsx` → **Side Panel tabs**
- `components/content/content/RightSidebarContent.tsx` → **Side Panel content**
- `components/content/editor/BubbleMenu.tsx` → *Inline formatting (not part of tool surfaces)*
- `components/content/editor/TableBubbleMenu.tsx` → *Table context menu (stays separate)*

### New logical layers
- **ToolContext**: single source of truth derived from active content + selection + permissions.
- **ToolRegistry**: declarative tool definitions (surface, contentTypes, availability rules).
- **Surface Renderers**: simple components that render resolved tools.

## Phases

### Phase 1 — Spec Enforcement (No UX change)
1. Create `lib/domain/tools/context.ts` with ToolContext shape.
2. Create `lib/domain/tools/registry.tsx` with ToolDefinition and resolver.
3. Wire existing Toolbelt to use the registry + ToolContext (keep current UI).

### Phase 2 — Side Panel Alignment
1. Add `SidePanelTools` that renders tool panel tabs from registry.
2. Plug `SidePanelTools` into `RightSidebarContent` as a new tab.
3. Ensure all heavy workflows (AI, RAG, settings) live in Side Panel only.

### Phase 3 — Toolbar Normalization
1. Add `ToolToolbar` wrapper in content header.
2. Move header‑level actions (download/share) into registry.
3. Enforce deterministic ordering and visibility.

### Phase 4 — Remove Ad‑hoc Tooling
1. Remove any content‑type‑specific toolbar logic outside registry.
2. Ensure no tools appear without registry entries.
3. Add minimal tests/fixtures for tool resolution.

## Required Context Inputs

Implement a single ToolContext provider with these inputs:
- Active content node ID + content type
- Selection state (text vs node)
- Mode (view/edit)
- Permissions (readOnly, role)
- Capabilities (downloadable/editable/filterable/aiEnabled)

## Risks

- Existing Toolbelt configs are decentralized; careful migration required.
- Side panel content currently uses right sidebar tabs; must avoid regressions.
- Some viewer-specific actions may not fit registry without extensions.

## Open Decisions

- Where ToolContext state lives (global store vs local provider).
- Whether AI-related surfaces are tied to content types or global scope.

## Success Criteria

- All tools appear only via registry + context rules.
- Side Panel houses all heavy workflows.
- Toolbelt stays lightweight and non‑blocking.
- Placement is stable and predictable across content types.

