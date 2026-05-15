---
feature: Dark Mode
branch: feature/dark-mode
duration: 3 sprints (estimated)
status: planning
scope: Full app, manual toggle (light/dark/system), ship complete across all surfaces including third-party viewers
trigger: Browser-extension overlay forces a dark context; the embedded app currently renders light, creating a visible seam between overlay chrome and app content.
---

# Feature: Dark Mode

## Goal
Ship a complete dark mode across every surface of the Digital Garden app — editor, dialogs, menus, sidebars, settings, auth pages, and third-party viewers (Mermaid, Excalidraw, diagrams.net, OnlyOffice, PDF, code). User chooses `light | dark | system` from `/settings/preferences`. No partial release; no "beta" flag.

## Why Now
The browser-extension overlay introduced in Phase 5 always renders in a dark shell (`#0c0e12`). When the `/embed/*` iframe loads the app inside that shell, the light-canvas editor creates an unmistakable visual seam. Fixing the overlay-only path would require duplicating the editor surface retrofit anyway, so we're doing the full pass.

A secondary motivator: two third-party viewers (Mermaid, OnlyOffice) are currently hardcoded to dark themes, which clashes with the light-canvas app today. Shipping dark mode incidentally fixes a pre-existing light-mode bug — those viewers will start following the user's theme instead of always rendering dark.

## Current State (audit summary)

**What exists:**
- `@custom-variant dark (&:is(.dark *))` registered in [globals.css:5](app/globals.css#L5) — Tailwind v4 dark variant works when an ancestor has `.dark`.
- `.dark { ... }` token swap block at [globals.css:140-160](app/globals.css#L140-L160) — swaps `--background`, `--foreground`, `--card`, `--border`, etc.
- `body` reads tokens at [globals.css:231-235](app/globals.css#L231-L235) — page background auto-flips when `.dark` is applied.
- `settings.ui.theme: "light" | "dark" | "system"` declared in [lib/features/settings/validation.ts:13](lib/features/settings/validation.ts#L13). Default is `"system"`.
- `getSurfaceStyles(surface, isDark)` already has a `surfacesDark` variant at [lib/design/system/surfaces.ts:35-48](lib/design/system/surfaces.ts#L35-L48) — but every callsite passes the default `false`.
- 251 `dark:` Tailwind variants already in the codebase, heavily concentrated in `extensions/workplaces/` (workspace selector + dialogs).

**What's missing:**
- No theme provider. Nothing applies `.dark` to `<html>`. No `next-themes`, no custom provider, no FOUC-prevention inline script.
- `settings.ui.theme` is never read anywhere in the app.
- No UI toggle. `/settings/preferences/page.tsx` has no theme control.
- Zero `dark:` variants on the core editor surface: `MarkdownEditor.tsx`, `MainPanelContent.tsx`, `MainPanelWorkspace.tsx`, `ContentToolbar.tsx`, `MainPanelHeader.tsx`, `MainPanelNavigation.tsx`.
- ~566 lines of ProseMirror / prose / hljs / callout / wiki-link CSS in `globals.css` use hardcoded hex colors (`#FFD700`, `rgba(229, 212, 176, ...)`, `color: white`, etc.). Only ~20 lines participate in `.dark` token swaps; the rest is fixed.
- Third-party viewers in inconsistent states:
  - Mermaid: hardcoded `theme: "dark"` at [MermaidViewer.tsx:28](components/content/viewer/MermaidViewer.tsx#L28).
  - OnlyOffice: hardcoded `uiTheme: "theme-dark"` at [OnlyOfficeEditor.tsx:146](components/content/viewer/OnlyOfficeEditor.tsx#L146).
  - DiagramsNet: per-instance theme state at [DiagramsNetViewer.tsx:71](components/content/viewer/DiagramsNetViewer.tsx#L71) — not wired to user setting.
  - Excalidraw: no theme prop at all at [ExcalidrawViewer.tsx:577](components/content/viewer/ExcalidrawViewer.tsx#L577). Defaults to light.
  - Code viewer (Shiki): uses a fixed theme.
  - PDF, image viewers: render content unchanged but their chrome doesn't react to theme.

## Decisions Locked
- **Scope:** Full app, all surfaces (no partial / beta release).
- **Toggle:** Manual selection (light / dark / system) in `/settings/preferences`. `system` follows OS via `prefers-color-scheme`.
- **Default theme:** `system` — follows OS color-scheme preference. Matches the schema's existing default; no per-user migration.
- **Per-diagram theme overrides (DiagramsNet):** Override beats global. Initialize from global theme; users can pin a specific diagram to a theme; "reset to global" is one click away. Matches Obsidian's pattern.
- **Embed iframe theme:** Honor user choice. Light-mode users see a light embed; dark-mode users see a dark embed. Reconciling the overlay chrome / embed seam in light mode is out of scope for this epoch.
- **Visual regression testing:** Add a minimal Playwright harness for dark-mode coverage (operational) AND stub out coverage for unrelated regression types (auth flow, editor save, etc.) as non-operational scaffolding so future sprints have a place to flesh them out. Filling those stubs is backlogged.
- **Third-party viewers:** Included in scope.

## Remaining Design Question (resolved at Sprint A kickoff)

**Liquid Glass aesthetic in dark mode**: `surfacesDark` in `surfaces.ts` is much more opaque (`rgba(0,0,0,0.3-0.5)`) than its light counterpart (`rgba(255,255,255,0.02-0.06)`). Worth confirming the intended aesthetic before retrofitting 50+ surfaces. Treated as a half-day design-token tuning task at the top of Sprint A — we'll flip the dev toggle (A.0) once the foundation lands and decide whether to keep or retune.

---

## Sprint A: Foundation + Editor Surface

**Goal:** A user can toggle between light and dark mode in settings and the entire editor surface (main panel, tree, toolbar, bubble menu, prose content) renders correctly in both. Other surfaces (dialogs, third-party viewers, auth pages) may still look broken — that's acceptable at end of Sprint A.

**Why this slice first:** The editor surface is the dominant visual experience and the source of the overlay-iframe mismatch that triggered this work. It also exercises the foundation end-to-end, so any provider / FOUC / persistence bugs will surface immediately.

### A.0 Temporary dev toggle (FIRST — enables iterative testing)

**Purpose:** A throwaway in-chrome toggle so we can flip themes without round-tripping through `/settings/preferences` every retrofit. Lands before A.1 so every subsequent piece of work can be verified live. **Not for production users — removed in Sprint C.**

- **New file:** `components/dev/DevThemeToggle.tsx` — small client component, fixed-position pill in a corner of the content layout (e.g., bottom-right above the status bar), three-state cycle Light → Dark → System, shows current resolved theme as a label. Uses the same `useResolvedTheme()` / `setUISettings({ theme })` plumbing the final toggle will use — so we're dogfooding the real foundation, just exposing it more conveniently.
- **Modify:** `app/(authenticated)/content/layout.tsx` — mount `<DevThemeToggle />` directly. Gate behind `process.env.NODE_ENV !== "production"` so production builds drop the import entirely (tree-shaken).
- **Why content layout specifically:** Sprints A & B are entirely about content-area surfaces. Placing the toggle here keeps it scoped to where we're testing and out of marketing/auth pages.
- **Visual treatment:** Intentionally ugly / obviously-dev (e.g., dashed border, "dev" tag) so it's never confused for a finished feature and is easy to spot for removal.
- **Tracked for removal:** add a `// TODO(dark-mode-sprint-c): remove` comment at the import site and inside the component so the Sprint C cleanup task can be found by grep.

### A.1 Foundation
- **New file:** `lib/features/theme/provider.tsx` — `ThemeProvider` that reads `settings.ui.theme`, resolves `system` via `window.matchMedia('(prefers-color-scheme: dark)')`, listens for OS changes, applies `.dark` to `<html>` via `useEffect`.
- **New file:** `lib/features/theme/script.ts` — inline `<script>` content for the root layout that resolves theme from localStorage *before* React hydration. Pattern is identical to `next-themes`' approach. Avoids FOUC.
- **Modify:** root layout (`app/layout.tsx`) — inject the inline script in `<head>`, wrap children in `<ThemeProvider>`.
- **Modify:** `useSettingsStore` — no schema changes needed (field exists). Verify `setUISettings({ theme })` round-trips through `/api/user/settings` correctly.
- **New helper:** `useResolvedTheme()` hook — returns `"light" | "dark"` (collapsing `"system"`), exported from `lib/features/theme/`. This is the canonical accessor for any component that needs to make a theme-aware decision (e.g., third-party viewers in Sprint C).

### A.2 Settings UI
- **Modify:** `app/(authenticated)/settings/preferences/page.tsx` — add a theme section with three radio cards (Light / Dark / System), each showing a preview thumbnail. Save on selection; toast via sonner. Follow Glass-0 card pattern per `CLAUDE.md`.

### A.3 Editor surface retrofit (`dark:` variant pass)
Each of these files has zero `dark:` variants today and needs a full audit:
- `components/content/MainPanelWorkspace.tsx` (~5 hardcoded `bg-white/...` overlay chips)
- `components/content/content/MainPanelContent.tsx` (includes one `prose prose-invert` block that currently inverts unconditionally — fix to be theme-conditional)
- `components/content/editor/MarkdownEditor.tsx`
- `components/content/editor/BubbleMenu.tsx`
- `components/content/editor/EditorToolbelt.tsx`
- `components/content/editor/ImageBubbleMenu.tsx`
- `components/content/editor/TableBubbleMenu.tsx`
- `components/content/editor/LinkDialog.tsx`
- `components/content/toolbar/ContentToolbar.tsx`
- `components/content/headers/MainPanelHeader.tsx`
- `components/content/MainPanelNavigation.tsx`
- `components/content/file-tree/**` (react-arborist nodes, drag previews)

### A.4 ProseMirror / prose content CSS
- **Modify:** `app/globals.css` ProseMirror block ([globals.css:297+](app/globals.css#L297)) — convert hardcoded colors to CSS variables, add `.dark .ProseMirror` overrides where needed. Targets: paragraph text, headings, blockquotes, code blocks, tables, list markers, callout blocks, wiki-link styling, tag pills, empty placeholders.
- **Modify:** Syntax highlighting (`hljs-*` rules, ~lines 449-480) — current palette is dark-friendly. Either keep as-is (one palette for both modes) or pair with a light palette via `.dark .hljs-*` overrides. Recommendation: keep one palette to avoid re-tuning hundreds of tokens; verify legibility against both backgrounds.

### A.5 Surface tokens
- **Modify:** every caller of `getSurfaceStyles(surface)` to pass `getSurfaceStyles(surface, isDark)` via `useResolvedTheme()`. Search-and-replace target.
- Resolve open question #4 (Liquid Glass dark aesthetic) by either tuning `surfacesDark` opacities or accepting them as-is.

### Sprint A definition of done
- [ ] User can switch between light/dark/system in settings; choice persists across reloads and devices.
- [ ] No FOUC on initial page load in either theme.
- [ ] OS-level theme change is reflected live (without reload) when `system` is selected.
- [ ] Editor surface renders correctly in both themes: backgrounds, text, borders, hover states, focus rings, bubble menu, slash menu, file tree, headers, toolbar.
- [ ] All ProseMirror content types render legibly in both themes: paragraph, heading, code, table, blockquote, callout, wiki-link, tag, image, embedded block placeholders.
- [ ] No regressions in the embed iframe (`/embed/*`) — the original motivator. Theme matches user setting.
- [ ] `pnpm build` passes (including `collab:schema:check`).

---

## Sprint B: Long-Tail Surfaces

**Goal:** Every non-editor surface in the app renders correctly in both themes. After Sprint B, the only known dark-mode gaps are third-party viewers (handled in Sprint C).

**Why second:** Sprint A proves the foundation. Sprint B is mostly mechanical `dark:` variant work across many files. Lower risk per file but high in aggregate.

### B.1 Dialogs (~10-15 files)
Inventory under `components/content/dialogs/` and `components/content/people/`. Most already have some `dark:` coverage (the workplaces extension is the reference model). Audit each for completeness:
- `CategoryMoveDialog.tsx`, `PageTemplateEditorDialog.tsx`
- `PeopleProfileDialog.tsx`, `PeopleCreateDialog.tsx`, `PeoplePanel.tsx`
- `TemplateEditorDialog.tsx`, `SnippetEditorDialog.tsx`
- `LinkDialog.tsx` (already in Sprint A, verify)
- Any `Dialog` / `DialogContent` shared from `components/ui/`

### B.2 Menus, popovers, context menus
- `components/content/context-menu/ContextMenu.tsx`
- `components/content/IconSelector.tsx`
- Slash command menu (`lib/domain/editor/commands/slash-commands.tsx`)
- WikiLink suggestion, Tag suggestion, PersonMention popovers
- Sonner toaster styling

### B.3 Sidebars (left & right)
- `components/content/headers/RightSidebar.tsx`, `LeftSidebar.tsx`
- `components/content/OutlinePanel.tsx`, `ChatOutlinePanel.tsx`, `SearchPanel.tsx` (partial coverage exists)
- Backlinks panel, tags tab
- AI chat panel (`components/content/ai/`)

### B.4 Settings pages & auth
- All `app/(authenticated)/settings/**/page.tsx` files
- Auth pages, sign-in flow, error pages
- Admin panel

### B.5 Extension surfaces
- `extensions/daily-notes/` components
- `extensions/flashcards/`, `extensions/people/`, `extensions/calendar/`
- `extensions/workplaces/` already has heavy `dark:` coverage — verify it actually looks correct (it was authored against an imagined dark mode that never shipped).

### B.6 `globals.css` long-tail
- Remaining hardcoded colors outside the ProseMirror block. Convert to CSS variables paired with `.dark { ... }` overrides as needed.
- Neon glow filters, react-arborist styles, scrollbar styles.

### Sprint B definition of done
- [ ] Every dialog, menu, sidebar, settings page, auth page, and extension surface renders correctly in both themes.
- [ ] No "patches" of unstyled white-on-dark or black-on-light visible in any documented user flow.
- [ ] `pnpm build` passes.

---

## Sprint C: Third-Party Viewers + Variable-ification + QA

**Goal:** All embedded viewers honor the user's theme; remaining hardcoded colors in `globals.css` are eliminated; visual QA pass across every route in both themes.

### C.1 Third-party viewer integration
Each viewer reads theme via `useResolvedTheme()` and forwards it to the underlying library:

| Viewer | Today | Change |
|---|---|---|
| Mermaid (`MermaidViewer.tsx`) | Hardcoded `theme: "dark"` | Pass `theme: isDark ? "dark" : "default"`; re-render on theme change (`useEffect` keyed on `isDark`). |
| OnlyOffice (`OnlyOfficeEditor.tsx`) | Hardcoded `uiTheme: "theme-dark"` | Pass `uiTheme: isDark ? "theme-dark" : "theme-light"`. Verify the DocServer supports live theme swap; may require iframe reload. |
| DiagramsNet (`DiagramsNetViewer.tsx`) | Per-instance theme state | Initialize from `useResolvedTheme()`; preserve per-diagram override (decision pending — see open question #2). |
| Excalidraw (`ExcalidrawViewer.tsx`) | No theme prop | Pass `<Excalidraw theme={isDark ? "dark" : "light"}>`. Verify collaboration sub-doc doesn't bake in theme. |
| Code viewer (Shiki) | Fixed theme | Pass appropriate Shiki theme per resolved theme (e.g., `github-light` / `github-dark`). |
| PDF viewer | Renders content unchanged | Only chrome (toolbar, controls) needs theming. |
| Image viewer | n/a | Chrome only. |
| Audio / Video player | n/a | Chrome only. |
| JSON viewer, Data viewer | Hardcoded styling | Audit and retrofit. |

### C.2 Mermaid block in collaboration
The `MermaidBlock` TipTap node renders Mermaid output inline in notes. Same theme propagation as the standalone viewer, but check that `ServerMermaidBlock` (used by the collab schema check) doesn't need changes.

### C.3 `globals.css` final variable-ification
- Sweep remaining hardcoded colors (anything not already covered in Sprints A-B). Goal: every color in `globals.css` is either a CSS variable or intentionally fixed (e.g., neon accents).
- Document any fixed-color decisions inline so future contributors know they're intentional.

### C.4 Visual regression harness + broader Playwright scaffolding

**Two layers of work here — operational dark-mode coverage now, non-operational stubs for everything else (backlogged to fill in later).**

**C.4.a — Operational: dark-mode screenshot coverage**
- Install Playwright (`@playwright/test`), wire into `package.json` scripts (`test:e2e`, `test:e2e:update-snapshots`).
- Add `playwright.config.ts` at repo root. Configure for two projects: `light` and `dark` (sets a cookie or query param resolving to the theme so we don't fight FOUC in test).
- Author screenshot tests for ~10 representative routes, each run in both themes:
  - `/notes` (empty state)
  - `/notes` (with content selected — note, file, external link)
  - `/settings/preferences`
  - `/notes/daily` (daily note)
  - Flashcard review (one card)
  - Calendar view
  - AI chat panel open
  - Search results
  - Embed iframe (rendered in `/embed/content/[id]`)
  - One representative dialog (e.g., page template editor)
- Wire into CI as a soft gate: surfaces diffs in the PR, doesn't block merge. Snapshots committed to the repo under `tests/e2e/__snapshots__/`.

**C.4.b — Non-operational: scaffold the broader regression coverage**
- Create empty (or `.skip()`d) test files at conventional paths so future sprints have an obvious home for the work, not a greenfield setup decision. Each file has a one-paragraph header comment explaining intent. Examples:
  - `tests/e2e/auth/sign-in.spec.ts` — sign-in OAuth flow, redirect after auth.
  - `tests/e2e/auth/session-persistence.spec.ts` — session survives reload.
  - `tests/e2e/editor/autosave.spec.ts` — 2-second debounce indicator.
  - `tests/e2e/editor/wiki-link-navigation.spec.ts` — `[[link]]` autocomplete and click.
  - `tests/e2e/editor/collaboration.spec.ts` — two-client sync (probably needs Hocuspocus local).
  - `tests/e2e/file-tree/drag-drop.spec.ts`
  - `tests/e2e/content/upload-finalize.spec.ts`
  - `tests/e2e/search/full-text.spec.ts`
  - `tests/e2e/extensions/daily-notes.spec.ts`
  - `tests/e2e/extensions/flashcards-review.spec.ts`
- Each file: one `test.skip("placeholder", async ({ page }) => {})` per scenario so the runner reports the count of skipped scenarios. This makes future progress measurable without hiding stubs.
- Add a `tests/e2e/README.md` documenting the harness layout, how to run, how to update snapshots, and the stub convention.
- **Backlog item to file at end of Sprint C:** "Complete Playwright stubs (currently `.skip()`d)" — track as a separate future sprint per `BACKLOG.md` convention.

### C.5 Print / export QA
- Verify markdown / HTML exports don't carry the user's current theme into shared content (exports should be theme-neutral or always light).
- Print stylesheet check (uncommon but cheap).

### C.6 Remove the temporary dev toggle (A.0 cleanup)
- Delete `components/dev/DevThemeToggle.tsx`.
- Remove the mount + import from `app/(authenticated)/content/layout.tsx`.
- Grep the codebase for `TODO(dark-mode-sprint-c)` to catch any other stragglers.
- Verify the production toggle in `/settings/preferences` is the only way to change theme.

### Sprint C definition of done
- [ ] All third-party viewers render in the user's chosen theme.
- [ ] No remaining hardcoded white/black/gray hex colors in `globals.css` outside intentional accent palettes.
- [ ] Operational Playwright harness running ~10 dark-mode screenshot tests in CI (soft gate).
- [ ] Non-operational Playwright stubs in place for auth, editor, file-tree, content, search, and extension scenarios — each scenario `.skip()`d with a placeholder.
- [ ] `tests/e2e/README.md` documents the harness layout and stub convention.
- [ ] Backlog item "Complete Playwright stubs" filed in `BACKLOG.md`.
- [ ] Manual QA walkthrough of every route in both themes — checklist signed off.
- [ ] Exports remain theme-neutral.
- [ ] Embed iframe parity confirmed in real browser-extension overlay.
- [ ] Temporary dev toggle removed; no `TODO(dark-mode-sprint-c)` markers remain.
- [ ] `pnpm build` passes.

---

## Risks

| Risk | Mitigation |
|---|---|
| Editor surface retrofit reveals more hardcoded colors than estimated | Sprint A budget already assumes high uncertainty here; treat overflow as Sprint B work. |
| Hocuspocus collaboration breaks if `ServerExcalidrawBlock` / `ServerMermaidBlock` need theme-aware changes | Server variants are render-free, so theme is a client concern. Verify in code review during C.1 / C.2. |
| Third-party viewer theme APIs are stale (especially OnlyOffice DocServer) | Spike at the start of Sprint C to confirm. If a viewer can't theme-switch live, document the limitation and reload on theme change. |
| Liquid Glass dark surfaces clash with the rest of the app | Resolve open question #4 at the top of Sprint A — better to retune `surfacesDark` once than retrofit 50+ files twice. |
| User preferences drift between localStorage and backend during sign-in flow | Existing `useSettingsStore.fetchFromBackend()` handles this. Theme provider must read from store after hydration, not from a separate localStorage key. |
| Visual regressions in surfaces nobody actively maintains (archive routes, third-party-showcase pages) | These have `dark:` variants already; spot-check, don't deep-audit. |

## Out of Scope
- Custom user-supplied themes (e.g., color palette JSON). Future enhancement.
- High-contrast / accessibility modes. Future enhancement.
- Per-workspace theme. Future enhancement.
- Light-on-dark theme variants for the Mermaid syntax highlighter, neon accent palette, etc. — keeping current accent palettes as-is.
- Theming the browser extension popup / overlay UI (it's always dark by design).

## Branch & PR Strategy
- Single feature branch `feature/dark-mode`.
- One PR per sprint (A / B / C), each rebased on the previous, merged sequentially. Allows reviewable chunks without three separate releases.
- Each sprint PR includes a "before / after" screenshot grid for the affected surfaces.
- Final merge to `main` only after Sprint C definition-of-done is met.

## Status Tracking
After each sprint, update:
- `docs/notes-feature/STATUS.md` — frontmatter `last_updated`, move item to "Recent Completions".
- `docs/notes-feature/work-tracking/CURRENT-SPRINT.md` — sprint tracking.
- `docs/notes-feature/work-tracking/BACKLOG.md` — if any items defer.
