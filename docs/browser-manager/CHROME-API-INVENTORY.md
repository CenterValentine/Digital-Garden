# Browser Manager — Chrome Extension API Inventory and Consolidation Scope

**Status:** Discovery / architecture research  
**Date:** 2026-11-12  
**Location:** Digital-Garden repository, `docs/browser-manager/`  
**Scope:** Browser API feasibility and the minimum architecture for AI-assisted tab consolidation. This is not a full product specification, implementation mandate, or authorization to modify anyone's open tabs.

## Objective

Design a Chrome Manifest V3 extension that inventories all accessible open tabs across browser windows, identifies relationships among tabs—especially common domains and workspace/project context—and creates a compact **tab profile** that an AI planning agent can use to recommend sensible native Chrome tab groups. The extension presents the plan for user review and applies only approved actions. Initial consolidation means *organizing into Chrome tab groups*, not merging page contents, deleting tabs, or silently closing anything.

### In scope
- Snapshot tabs, window placement, titles, URLs/domains, existing group memberships, pinned/active/discarded state and relevant tab metadata where permitted.
- Detect exact duplicates and related URLs/domains; infer topics and projects from titles, URL paths, and optional page-level hints.
- Preserve existing groups and user constraints, develop proposed group names/colors/window assignments, and produce a reversible execution manifest.
- Offer a side-panel review with explanations, confidence, exceptions, dry run and action confirmation.
- Capture a lightweight before-state snapshot and verify results.

### Out of scope (first iteration)
- Automatic closing of tabs, deduplication by removal, archiving content, reading passwords/messages/form fields, Chrome history crawling, full-page scraping by default, and autonomous cross-site actions.
- Assuming a Chrome native tab group is the same as a durable application workspace.
- Assuming all open tabs belong to the same project merely because they share a domain.

## Native Chrome APIs — ranked by importance

| API | Relevant calls/events/data | Why useful | Permissions / constraints |
|---|---|---|---|
| `chrome.tabs` | `query({})`, `get()`, `group({tabIds,groupId?,createProperties?})`, `ungroup()`, `move()`, `update()`, `onCreated/onUpdated/onRemoved/onMoved/onAttached/onDetached/onActivated`; fields `id,windowId,index,groupId,pinned,active,discarded,url,title,favIconUrl` | Core inventory and grouping executor | `tabs` or matching host permissions are needed for sensitive URL/title/favicon fields; not every tabs method requires `tabs`. Avoid grouping pinned tabs without special handling. |
| `chrome.tabGroups` | `query()`, `get()`, `update(groupId,{title,color,collapsed})`, group events | Read existing groups and label/collapse new ones | Requires `tabGroups`; actual membership changes go through `tabs.group/ungroup`. Group IDs are session-scoped. |
| `chrome.windows` | `getAll({populate:true})`, `getLastFocused()`, window events | Organize tabs by window and detect workspace boundaries | Grouping is window-specific; moving between windows is a separate, potentially disruptive step. |
| `chrome.storage` | `local`, `session`, `sync`, `onChanged` | Store snapshots, plan drafts, preferences, opt-outs | Requires `storage`; prefer `local` for project state, `session` for ephemeral plans, `sync` for small settings. Do not rely solely on worker global memory. |
| `chrome.sidePanel` | `setPanelBehavior()`, `open()`, `setOptions()` | Review proposed clusters, compare before/after, approve plan | Requires `sidePanel`; opening programmatically is subject to user-interaction rules. |
| `chrome.runtime` | `sendMessage()`, `onMessage`, `onInstalled` | Coordinator between service worker, UI and optional content scripts | Core extension messaging. Validate sender, payload and action authorization. |
| `chrome.scripting` | `executeScript()` | Optional semantic hints: page heading, canonical URL, metadata, visible article structure | Requires `scripting` AND host access or temporary `activeTab` grant. Not available for every protected/internal page. |
| `chrome.permissions` | `request()`, `contains()`, `remove()` | Progressive permissions for deeper analysis | Optional host access should be sought only after explicit request. |
| `chrome.webNavigation` | `onCommitted`, `onHistoryStateUpdated` | Better awareness of SPA navigation and URL churn | Requires `webNavigation`; not required for initial on-demand inventory. |
| `chrome.sessions` | `getRecentlyClosed()`, `restore()` | Recovery assistance after unintended changes | Requires `sessions`; recently closed inventory is bounded and not a substitute for durable snapshots. |
| `chrome.alarms` | `create()`, `onAlarm` | Optional periodic refresh / reminders | Requires `alarms`; not needed for initial manual review flow. |
| `chrome.commands` / `chrome.action` | keyboard shortcuts / toolbar trigger | User-invoked inventory or opening panel | Useful ergonomics; keep action user-initiated. |
| `chrome.contextMenus` | right-click actions | 'Send related tabs to workspace' shortcut | Optional, later. |
| `chrome.bookmarks` | create/list folders/bookmarks | Later save/park a cluster without keeping tabs open | Requires `bookmarks`; outside tab-group-only MVP. |

**Availability caution:** Chrome API features and minimum versions vary; set/test a `minimum_chrome_version` against the exact methods used. Chrome docs increasingly show a `browser.*` namespace; `chrome.*` remains a practical baseline for Chrome extension code.

## Permission strategy

**Metadata-first MVP manifest (illustrative):**
```json
{
  "manifest_version": 3,
  "name": "Browser Manager",
  "version": "0.1.0",
  "permissions": ["tabs", "tabGroups", "storage", "sidePanel"],
  "background": {"service_worker": "background.js"},
  "action": {"default_title": "Review tab organization"},
  "side_panel": {"default_path": "panel.html"}
}
```

Use `tabs` for metadata spanning **all tabs**. `activeTab` alone is insufficient for a full-tab inventory; it grants temporary access to a user-invoked active tab rather than unrestricted access to every tab. Do **not** request `<all_urls>` host permissions for the first pass. Optional later: `scripting`, specific optional host patterns and `permissions.request` for page-level extraction. Incognito access is separate and user-controlled; exclude incognito by default.

## Proposed data contract

```ts
type TabFact = {
  tabId: number; windowId: number; index: number;
  groupId: number; pinned: boolean; active: boolean; discarded?: boolean;
  title?: string; url?: string; origin?: string; hostname?: string;
  pathname?: string; favIconUrl?: string;
  restrictions?: string[]; // e.g. chrome://, sensitive, no-content-access
};

type WorkspaceCandidate = {
  id: string; label: string; evidence: string[];
  tabIds: number[]; confidence: number;
  crossWindow: boolean;
};

type ConsolidationPlan = {
  snapshotId: string;
  proposedGroups: Array<{
    name: string; color: string; targetWindowId: number;
    tabIds: number[]; rationale: string; confidence: number;
  }>;
  excludedTabIds: number[];
  warnings: string[];
  requiresConfirmation: true;
};
```

These tab IDs and group IDs are **live browser-session identifiers**, not durable identifiers. Refresh and revalidate them just before executing a plan. Persist stable URL-derived fingerprints only when genuinely necessary; identical URLs can represent distinct user tasks.

## Classification hierarchy

1. **Deterministic:** same canonical URL (candidate duplicate), same site origin/registrable domain, matching URL path structures, same existing group/window.
2. **Heuristics:** title tokens, repository/project identifiers in URL, document/file identity, tab adjacency, pinned status, common task pattern.
3. **Semantic:** optional local/remote AI labeling of ambiguous clusters using minimized metadata, user-defined workspace descriptions and explicit opt-in.
4. **Exceptions:** same-domain tabs can be unrelated (e.g. Google Docs, GitHub or search pages); different-domain tabs can be the same project (design document + issue tracker + deployment console). Let intent override domain when confidence is high and preserve an easy reject path.

Never send full URLs containing query parameters, tokens, document identifiers or private titles to an external model by default. Sanitize, redact and request user approval before any external AI transfer. Webpage text is untrusted input, **not agent instructions**.

## First-pass workflow

```text
User opens side panel
  -> inventory tabs and windows
  -> normalize URL/domain metadata
  -> detect existing groups and protected tabs
  -> generate domain-based clusters + cross-domain suggestions
  -> produce AI-ready profile (bounded/redacted)
  -> planning agent returns structured proposed plan
  -> local validator checks IDs, window constraints, exclusions
  -> user previews and explicitly approves
  -> executor groups tabs, names/colors groups, verifies outcome
  -> report before/after and allow supported undo/recovery
```

**Safety constraints:** preserve pinned tabs by default; never auto-close or auto-discard tabs; do not move tabs across windows without a separate opt-in; do not rewrite existing group assignments silently. A review panel should show counts of moved tabs, newly created groups and edits to existing groups. Before executing, snapshot tab positions/window/group membership. An undo action is **best-effort** (tabs or windows can be changed/closed by the user in the meantime), not a guaranteed atomic rollback.

## Technical concerns to validate in a spike

- Semantics and edge cases of `tabs.group` for pinned tabs, already-grouped tabs, mixed windows, and races when tabs change during approval.
- Which permissions expose titles/URLs for inaccessible schemes and pages; protected Chrome UI pages are special cases.
- Difference between domain, origin and registrable domain (public suffix handling), URL redirects and canonicalization.
- Existing saved/synced/shared tab groups: avoid claiming full management of Chrome's persistent group identity or sync metadata.
- Service worker suspension: persist snapshots and plans; do not depend on background worker globals.
- External LLM privacy budget, prompt-injection protections, and explicit consent.
- Scale: cluster hundreds of tabs locally, send only compact context to AI, and avoid per-tab model calls.

## Suggested build sequence

1. **Capability spike:** inventory 100+ tabs across multiple windows and existing tab groups; capture the key fields and permission behavior.
2. **Deterministic planner:** propose same-domain groups without AI, with user corrections.
3. **AI planning:** cross-domain/project classification from a minimal tab profile, including rationale/confidence and schema validation.
4. **Approval + executor:** dry-run preview, group edits, verification and best-effort undo.
5. **Optional enhancement:** page-context extraction, learned workspace profiles, persistence and archived sessions.

## Success criteria for MVP

- Captures all accessible normal-window tabs without content scraping.
- Correctly reports existing groups and window boundaries.
- Produces actionable clusters and does not force grouping for ambiguous tabs.
- Applies only explicitly confirmed changes, with accurate before/after counts.
- Has no default page-content exfiltration or destructive cleanup behavior.

## Authoritative references

- Chrome tabs: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome tabGroups: https://developer.chrome.com/docs/extensions/reference/api/tabGroups
- Chrome windows: https://developer.chrome.com/docs/extensions/reference/api/windows
- Chrome storage: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome sidePanel: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome scripting: https://developer.chrome.com/docs/extensions/reference/api/scripting
- Chrome sessions: https://developer.chrome.com/docs/extensions/reference/api/sessions
- Chrome extension API index: https://developer.chrome.com/docs/extensions/reference/api/
- MV3 worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

## Open product decisions

- Is a workspace a named logical project across windows, or an actual window? Recommendation: logical project first, native groups as a representation.
- Should grouped tabs remain in their existing windows? Recommendation: yes for MVP.
- Should AI run locally, via the Garden's provider routing, or with a user-owned model key? Recommendation: make transport pluggable, minimize data and obtain consent.
- Should this extension be a distinct Digital Garden module or part of its existing Chrome content-acquisition extension? Inspect existing extension capabilities before implementation; avoid parallel overlapping background services.
