  # Tool Surfaces & Context Rules (Scalable Architecture)

**Status:** Draft (Proposed)
**Created:** 2026-02-19

## Purpose

Define a single, authoritative model for **context-aware tools** in Digital‑Garden. This document standardizes **tool surfaces**, **context rules**, **permissions**, **blocking behavior**, and **predictable placement** so the system remains scalable as new tools and content types are added.

This spec adapts conductor‑one’s terminology and scope, using **Side Panel** instead of “Tool Panel.”

## Core Principles

- **Content-driven:** Tools declare the supported `ContentType` and only render for matching nodes.
- **State-driven:** Tools may require a selection or active node; hide or disable otherwise.
- **Permission-driven:** Read-only or restricted sessions disable mutation tools.
- **Non-blocking:** Toolbelt actions never block primary editing; heavier workflows live in the Side Panel.
- **Predictable placement:** Toolbar is fixed to the content header, toolbelt floats, side panel is right‑side only.

## Tool Surfaces (Glossary)

- **Toolbar**: Inline actions in the content header (download/share/quick actions). Always present when a content node is open, but individual tools can be hidden or disabled.
- **Toolbelt**: Floating, headless icon strip anchored to the content area. Context‑aware and light‑weight; appears only when the active content node and selection state support the tool.
- **Side Panel**: Right‑side panel for complex workflows (RAG, tool settings, inspectors). Context‑aware; renders only when the active content node supports it and the user has required permissions.
- **Interaction Surface**: Ephemeral context tools (future) based on hover/selection. Must never block primary editing.

## Context Model (Required)

A tool’s visibility and enabled state are computed from a single **ToolContext** object:

```ts
export type ToolContext = {
  activeContentId: string | null;
  contentType: ContentType | null;
  mode: "view" | "edit";
  selection: null | { type: "text" | "node"; length?: number };
  focusTarget: "content" | "toolbar" | "panel" | null;
  capabilities: {
    downloadable: boolean;
    editable: boolean;
    filterable: boolean;
    aiEnabled?: boolean;
  };
  permissions: {
    readOnly: boolean;
    role: "owner" | "admin" | "member" | "guest";
  };
};
```

All tool gating logic **must** use the above context shape. (enums can be adapted as needed)

## Tool Definition (Required)

Tools are declared in a single registry with deterministic ordering.

```ts
export type ToolSurface = "toolbar" | "toolbelt" | "sidePanel" | "interaction";

export type ToolDefinition = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  order: number;
  surfaces: ToolSurface[];
  contentTypes: ContentType[] | "all";
  availableWhen: (ctx: ToolContext) => boolean;
  enabledWhen?: (ctx: ToolContext) => boolean;
  disabledReason?: (ctx: ToolContext) => string;
  renderPanel?: (ctx: ToolContext) => JSX.Element;
  onClick?: (ctx: ToolContext) => void;
};
```

## Deterministic Resolution Rules

When rendering a surface:

1. Filter by `surfaces`.
2. Filter by `contentTypes`.
3. Filter by `availableWhen(ctx)`.
4. Sort by `order`.
5. Evaluate `enabledWhen(ctx)` at render time.

Tools must never mutate UI state outside these rules.

## Blocking Rules

- **Toolbelt is non-blocking**: must not open modal flows or block editing focus; use Side Panel for heavy workflows.
- **Side Panel is blocking‑tolerant**: can hold multi-step workflows (AI settings, RAG, tool configuration).
- **Toolbar is deterministic**: always present; no async loading or layout shift.

## Placement Rules

- **Toolbar** is fixed in the content header for all open nodes.
- **Toolbelt** floats within content area and should never overlap primary selection/typing.
- **Side Panel** lives on the right side and is the only panel for complex flows.
- **Interaction Surface** is ephemeral and must not displace layout.

## Permissions & States

- Read‑only sessions disable mutation tools.
- Guest roles are view‑only by default.
- Selection‑required tools hide when `selection` is null.
- Content‑type tools hide when `contentType` does not match.

## Relationship to Existing DG Patterns

- Toolbelt implementation exists under `components/content/tool-belt/` and remains the base for the **Toolbelt** surface.
- Right Sidebar refactor establishes consistent **Side Panel** structure and should be reused for tool surfaces.

## Non‑Goals

- No new UX paradigms beyond these surfaces.
- No content‑type specific tools without registry entry.
- No ad‑hoc panels outside the Side Panel.

## Required Follow‑ups

- Build/merge a centralized `tool-registry` that enforces these rules.
- Replace any ad‑hoc tool gating with registry + context rules.

