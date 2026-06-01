---
title: AI Chat Revamp — Big-Three Parity + Engine Revival
status: in_progress
last_updated: 2026-05-26
owner: centervalentine
branch: feature/ai-chat-revamp
related:
  - app/api/ai/chat/
  - app/api/conversations/
  - components/content/ai/
  - components/content/viewer/ChatViewer.tsx
  - lib/domain/ai/
  - lib/features/conversations/
  - lib/design/system/ai-providers.ts
  - state/ai-chat-store.ts
  - prisma/schema.prisma
---

> **Status (2026-05-28):**
> Branch `feature/ai-chat-revamp` from `main`.
> - ✅ Session 1 — Engine consolidation + AI Gateway + revival (shipped, strict-BYOK pivot landed mid-session)
> - ✅ Session 2 — Conversation entity + migration + persistence (shipped; schema applied to dev DB; routes live at `/api/conversations`)
> - ✅ Session 3 — MakeAndModelPicker + per-provider theming + per-message stamps (shipped; provider icons + avatar tooltip iterations landed)
> - ✅ Session 3.5 — Connections as the universal unit (shipped)
> - ✅ Session 3.6 — Feature routing registry (shipped)
> - ✅ Session 4a — Sidebar tabs + association graph + manual pinning + picker + auto-title + per-conversation provider memory (shipped)
> - ✅ Session 4b — Cross-surface sync infra: conversation event bus + SSE stream + `conversation-cache-store`; reverse-view `AssociatedContentChips` on ChatViewer; tool-call auto-association interceptor; recursion guard (shipped)
> - ✅ Session 5a — Edit/regenerate: `useConversationBinding` extraction (shared by ChatPanel + ChatViewer); per-message hover edit (user) / regenerate (assistant); reconcile-model supersession via `hideMessagesFrom` + `/messages/truncate`; client→DB id map. Plus: branch/fork, open-in-full-view, per-provider fonts, typewriter reveal, inline header rename (shipped)
> - ✅ Session 5b — Attachments. **5b-1**: image + text-like attachments via composer (paperclip/paste/drop), R2 upload (`/api/ai/attachments/upload`), vision capability guard, chips + thumbnails. **5b-2**: PDF → R2 upload + server-side text extraction; native document parts for Anthropic/Google, inline text fallback. Persistence via `pendingUserPartsRef`. Attachments become `referenced` FilePayload ContentNodes (clickable → open in viewer; file-tree show/hide toggle + hint). **5b-3**: file-tree drag-to-attach — dropping a tree node into the composer inserts a mention pill at the caret. Implementation: react-arborist drags through `react-dnd`'s HTML5 backend, whose window-level `dragover` stamps `dropEffect="none"` on any element that is *not* a registered react-dnd target — so the composer registers via `useDrop({ accept: "NODE" })` on the existing `DndWrapper` manager. Title + contentType come from a `tree-drag-store` populated by `FileNode.onDragStart`; the arborist drag item only carries `{ id, dragIds }`. **5b-3 hardening**: (a) user-message bubble tokenizes `@[Title](id)` and renders inline `<MentionPill>`s via a narrow `UserMessageText` component that explicitly does *not* run markdown (so `**bold**` stays literal); (b) **composer is now a contenteditable** — `<textarea>` replaced with a contenteditable `<div>` whose `value` is the canonical `@[Title](id)` form throughout. Mentions render as atomic, non-editable pill spans (backspace deletes one in a single keystroke). `useConversationEngine.handleSend` extracts IDs directly from the canonical value with `MENTION_RE`; the intermediate plain `@Title` form, parallel mentions array, and chip strip are gone. Session 5 complete.
> - ✅ Architecture unification — **promote-on-open**: ChatViewer promotes a legacy ChatPayload chat to a Conversation on mount (`fromContentNodeId`, idempotent) and binds to it. ContentNode = shell/anchor, Conversation+ConversationMessage = live store, ChatPayload = dormant payload. Retires the dual persistence path; legacy `persistMessages` remains only as a promote-failure fallback. Trash & Data system + 30-day purge cron also shipped.
> - ✅ Session 6 — Reasoning surface. Four renderers (`ReasoningBlockClaude` — beige italic collapsible; `ReasoningBlockChatGPT` — numbered step rail split on `\n{2,}`; `ReasoningBlockGemini` — gradient block with heading/bullet parser; `ReasoningBlockGeneric` — neutral fallback) routed by the *message's* stamped providerId via `ReasoningRouter`. Open/closed state is derived (`userPref ?? streaming`), not synced via `useEffect` — React Compiler caught the original effect-driven version. Settings toggle `ai.showReasoning` (default on) gates rendering. Chat route opts in via `toUIMessageStreamResponse({ sendReasoning: true })` so reasoning parts actually reach the client. **Reasoning models**: `o3-mini` added to OpenAI catalog (auto-emits); `claude-sonnet-4` and `gemini-2.5-pro` flagged `reasoning: "enabled"` so the chat route synthesizes `providerOptions.anthropic.thinking` (5000-token budget) and `providerOptions.google.thinkingConfig.includeThoughts: true` respectively. Per-model `reasoning?: "auto" | "enabled"` + `thinkingBudgetTokens?` flags live on `ModelMeta` so future models can opt in by data, not code.
> - ✅ Session 7 — Suggested follow-ups + polish. **Follow-ups**: `lib/domain/ai/follow-ups.ts` generates 2–3 structured suggestions via `generateObject` using the user's Feature Routing entry for `follow-ups` (falls back to active chat provider). `/api/ai/follow-ups` endpoint with soft-fail (returns empty list on any error so UX never breaks). `useConversationEngine` adds `followUps` state + `clearFollowUps`, fires the call in `onFinish` when `ai.showFollowUps !== false`, clears on send. `FollowUpsStrip` component sits between messages and composer in both `ChatPanel` + `ChatViewer`; click chip → loads into composer. Settings toggle (default on). **Streaming indicators**: per-provider variants already landed via `theme.streamingIndicator` in Session 3 — Claude smooth bar, OpenAI cursor pulse, Gemini shimmer gradient, generic dots; no new work needed. **A11y baseline**: picker already has `aria-label`/`aria-pressed` per provider chip; chips/buttons use real `<button>` elements so keyboard focus works natively. Deeper a11y audit (tab strip nav, focus management on edit/regenerate) parked as follow-up.

# AI Chat Revamp — Big-Three Parity + Engine Revival

A two-axis upgrade to the AI chat feature:

1. **Engine revival** — adopt Vercel AI Gateway as the default transport, sweep
   the AI SDK changelog since `ai@6.0.104`, and consolidate the chat engine
   into a single hook consumed by both the sidebar and full-page chat surfaces.
2. **Big-three parity** — match the look and feel of ChatGPT, Claude, and
   Gemini chat interfaces as closely as practical, including per-provider
   theming, rich-text rendering, reasoning UX, attachments, edit/regenerate,
   and suggested follow-ups. Conversations become first-class entities with
   the existing `chat` ContentNode preserved as the archive path.

## Goals

- A new first-class `Conversation` Prisma entity, decoupled from the existing
  `ChatPayload` content node (which remains as the archive target).
- `ChatViewer` (full-page) and `ChatPanel` (sidebar) share one engine and one
  set of rendering atoms. **Absolute parity** on every behavior except surface
  size and panel-association affordances.
- Per-provider theming (background, typography, code-block chrome, bubble
  shape, markdown extension styling). Big-three (Anthropic, OpenAI, Google)
  get hot-swap chips under the chat input; other providers behind a "more"
  overflow.
- Mixed-provider state visible: background gradient blending contributing
  brand colors + a "Mixed" chip beside the make-and-model picker.
- Sidebar chats associated with content through three sources:
  **snapshot** (panels open at conversation creation), **auto**
  (@mention or AI tool-call referencing a content node, capped + LRU-
  evicted), and **manual** (user-pinned via the open-chat picker or by
  promoting an auto row). Multi-chat navigation via a tabbed strip at the
  top of the side panel, each tab tinted in its conversation's provider
  color with an inline source glyph.
- "+ Pin a chat" affordance in the sidebar header is the **primary**
  cross-surface discovery gesture — opens a conversation picker; selecting
  one writes manual associations from the open panels and activates the
  chat. Replaces the previously planned "Continue as side chat" full-page
  header action.
- Reverse view in the full-page ChatViewer: a chip row showing every
  associated content node, with source glyphs and click-to-open.
- **UX vocabulary uses the pinning model** (Pin/Unpin verbs, `Pin`/`PinOff`
  icons) on top of the internal `association` data model. Compound
  "Pin association" used where the noun must be explicit; bare "Pin"
  where context disambiguates. Internal code identifiers stay as
  `association`/`associate`.
- **Cross-surface state stays consistent** via a shared
  `conversation-cache-store` (Zustand) fed by a typed event bus over SSE.
  Sidebar tabs, ChatViewer headers, reverse-view chips, and the picker
  all read from one source of truth; a title change in one surface is
  visible in every other surface without a manual reload.
- **Recursion guard:** any content can associate with any other content
  (chats included), but a conversation never appears as its own side
  tab while it's the active main content.
- Behavioral parity must-haves: edit + regenerate (user and assistant
  messages), user-uploaded attachments (images, PDFs, text files, drag from
  the file tree), reasoning surface for capable models, suggested follow-ups
  as an optional feature.
- Provider-matched reasoning renderers for Claude / ChatGPT / Gemini, picked
  per-message by the originating provider stamp.

## Non-goals (v1)

- Voice input/output (deferred — separate scoping later).
- Long-term memory feature (ChatGPT-style "remembers you across chats").
- Web search tool (today's tools stay notes-scoped).
- Artifacts / Canvas split-pane for long code or documents.
- "Custom instructions" / Projects / Gems persona presets (light system-prompt
  customization may sneak into a later session; out of v1 explicitly).
- Mobile RN parity (waits on Garden Companion phase work).
- Tool registry overhaul. The existing `lib/domain/ai/tools/registry.ts` and
  base/editor tool sets stay as-is.

## Current state (baseline)

Stack health is **good** as of 2026-05-23:

| Package                | Version    | Notes                                |
| ---------------------- | ---------- | ------------------------------------ |
| `ai`                   | ^6.0.104   | v6 GA — `useChat` / transport stable |
| `@ai-sdk/react`        | ^3.0.106   | Current                              |
| `@ai-sdk/anthropic`    | ^3.0.49    | v3                                   |
| `@ai-sdk/openai`       | ^3.0.36    | v3                                   |
| `@ai-sdk/google`       | ^3.0.43    | v3                                   |
| `@ai-sdk/xai`          | ^3.0.67    | v3                                   |
| `@ai-sdk/mistral`      | ^3.0.24    | v3                                   |
| `@ai-sdk/groq`         | ^3.0.29    | v3                                   |
| `zod`                  | ^4.2.1     | v4 across `tool()` schemas           |

No forced migration. Revival is changelog hygiene + Gateway adoption + a
shared-engine consolidation.

Surfaces today:

- [`components/content/ai/ChatPanel.tsx`](../../../../components/content/ai/ChatPanel.tsx)
  — sidebar, transient, per-contentId session, `setMessages([])` on switch,
  "Save conversation" → `chat` ContentNode.
- [`components/content/viewer/ChatViewer.tsx`](../../../../components/content/viewer/ChatViewer.tsx)
  — full-page, auto-persists to `ChatPayload`, loads stored messages on mount.

Shared atoms (already extracted): `ChatMessage`, `ChatInput`, `ModelPicker`.
Diverging concerns: lifecycle (sidebar in-memory vs viewer persistent),
binding (sidebar to `contentId` vs viewer to its own ContentNode), title
generation, and conversation history surface (none for sidebar, implicit for
viewer).

Gap vs the big three (matrix from the planning conversation):

| Capability                          | ChatGPT | Claude | Gemini | DG today |
| ----------------------------------- | ------- | ------ | ------ | -------- |
| Persistent conversation list        | ✅      | ✅     | ✅     | ❌       |
| Full-screen chat surface            | ✅      | ✅     | ✅     | ✅ (ChatViewer) |
| Artifacts / Canvas                  | ✅      | ✅     | ✅     | ❌       |
| User-uploaded file/image attachments| ✅      | ✅     | ✅     | ❌       |
| Reasoning/thinking surface          | ✅      | ✅     | ✅     | ❌       |
| Per-message regenerate              | ✅      | ✅     | ✅     | ❌       |
| Edit-and-resubmit user message      | ✅      | ✅     | ✅     | ❌       |
| Suggested follow-ups                | ✅      | ⚠️     | ✅     | ❌       |
| Streaming cursor visual             | ✅      | ✅     | ✅     | ⚠️ dots  |
| Custom instructions / persona       | ✅      | ✅     | ✅     | ⚠️ hard-coded |
| Memory                              | ✅      | ⚠️     | ⚠️     | ❌       |
| Voice                               | ✅      | ❌     | ✅     | ❌       |
| Web search                          | ✅      | ✅     | ✅     | ❌       |
| Provider-themed styling             | n/a     | n/a    | n/a    | ❌       |

## Architecture

### New entity: `Conversation`

```prisma
model Conversation {
  id                        String   @id @default(cuid())
  ownerId                   String
  title                     String?
  archivedToContentNodeId   String?  @unique
  archivedToContentNode     ContentNode? @relation("ConversationArchive", fields: [archivedToContentNodeId], references: [id], onDelete: SetNull)
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  deletedAt                 DateTime?

  messages                  ConversationMessage[]
  associations              ConversationAssociation[]

  owner                     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  @@index([ownerId, updatedAt])
  @@index([ownerId, deletedAt])
}

model ConversationMessage {
  id              String       @id @default(cuid())
  conversationId  String
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  role            ChatMessageRole          // user | assistant | system | tool
  providerId      String?                  // anthropic | openai | google | xai | ...
  modelId         String?                  // claude-sonnet-4 | gpt-4o | gemini-2.5-pro | ...

  // AI SDK v6 parts[] preserved verbatim — text, reasoning, tool calls/results,
  // attachments. This is the single source of truth for re-render.
  parts           Json

  // Cached plaintext for full-text search and quick summary.
  textCache       String?

  // Edit/branch lineage — the parent_id chain is how we render an edit history.
  parentId        String?
  parent          ConversationMessage?  @relation("MessageBranch", fields: [parentId], references: [id], onDelete: SetNull)
  branches        ConversationMessage[] @relation("MessageBranch")
  isHidden        Boolean  @default(false)     // hidden when superseded by an edit

  // Per-message metadata (token usage, finishReason, latency)
  metadata        Json?

  createdAt       DateTime @default(now())

  @@index([conversationId, createdAt])
  @@index([conversationId, parentId])
}

model ConversationAssociation {
  conversationId    String
  contentNodeId     String
  source            ConversationAssociationSource  // snapshot | manual | auto

  // Updated on every new mention or tool-call referencing this content.
  // Drives LRU eviction when the per-conversation auto cap is hit.
  // Always populated, but only consulted for source: auto rows.
  lastReferencedAt  DateTime @default(now())

  // Count of distinct trigger events that auto-created/refreshed the row
  // (mentions + tool-call reads/writes). Useful for telemetry + promotion
  // heuristics ("promoted from auto to manual after 5 references").
  referenceCount    Int      @default(1)

  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  contentNode       ContentNode  @relation("ConversationAssoc", fields: [contentNodeId], references: [id], onDelete: Cascade)

  createdAt         DateTime @default(now())

  @@id([conversationId, contentNodeId])
  @@index([contentNodeId])
  @@index([conversationId, source, lastReferencedAt])  // for LRU eviction queries
}

enum ChatMessageRole {
  user
  assistant
  system
  tool
}

enum ConversationAssociationSource {
  snapshot   // bound automatically at conversation creation (open panel set)
  manual     // user-pinned later (also: promoted from auto by explicit pin action)
  auto       // bound via in-conversation @mention or AI tool-call referencing this content
}
```

**Why a sidecar entity, not extending `ChatPayload`:**
- Conversations are user-owned and surface-independent; `ChatPayload` is
  surface-bound (it IS the content node).
- Edit lineage requires per-message identity and branch pointers — clumsy to
  shoehorn into the `ChatPayload.messages` JSON blob.
- "Archive into knowledge graph" remains a one-shot promotion: copy
  conversation → `ChatPayload`, flatten parts for search, set
  `archivedToContentNodeId` on the source.

### Engine consolidation: `useConversationEngine`

A new hook in `lib/domain/ai/use-conversation-engine.ts` (client-safe). Owns:

- AI SDK `useChat()` setup with `DefaultChatTransport`
- Active provider/model state (sourced from settings, overridable per-conversation)
- Message edit/regenerate primitives
- Attachment staging buffer
- Reasoning render delegation
- Follow-up generation trigger

Both surfaces become **thin presentational shells** over this hook:

```
useConversationEngine({ conversationId, associatedContentIds?, mode })
  ├─ ChatPanel (sidebar)   → renders engine in narrow column, tabbed-strip wrapper
  └─ ChatViewer (full-page) → renders engine in wide column, no tabs
```

### Provider theming

New module `lib/design/system/ai-providers.ts`:

```ts
export interface ProviderTheme {
  id: AIProviderId;
  brandColor: string;        // accent
  surfaceBackground: string; // chat-area bg gradient
  typography: {
    fontFamily: string;
    headingScale: { h1: string; h2: string; h3: string; };
    body: { size: string; lineHeight: number; weight: number; };
  };
  codeBlock: {
    headerStyle: "compact" | "structured" | "rounded";
    showLanguagePill: boolean;
    showCopyButton: boolean;
    chrome: "tight" | "soft";
  };
  bubble: {
    shape: "minimal" | "no-bubble" | "rounded-soft";
    paddingX: string;
    paddingY: string;
    columnWidthCh: number;
  };
  markdownExtensions: {
    math: boolean;
    mermaid: boolean;
    callouts: boolean;
  };
  streamingIndicator: "cursor" | "smooth" | "shimmer";
}
```

Themes resolved at:
- **Surface level** — drives bg + picker + tab tinting from the active
  provider of the conversation. When mixed, surface bg becomes a gradient
  computed from contributing themes.
- **Message level** — every assistant message stamps its own `providerId`;
  the message bubble renders with that provider's theme regardless of
  whether the active surface theme has since switched.

### Mixed-provider detection

```ts
function detectMixedProvider(messages: ConversationMessage[]): {
  isMixed: boolean;
  contributors: AIProviderId[];
} {
  const providers = new Set(
    messages
      .filter(m => m.role === "assistant" && m.providerId)
      .map(m => m.providerId!)
  );
  const contributors = Array.from(providers) as AIProviderId[];
  return { isMixed: contributors.length > 1, contributors };
}
```

Surface bg becomes:
- 1 contributor → solid `providerTheme.surfaceBackground`
- 2+ contributors → CSS gradient blending each contributor's accent at low
  opacity over the base Glass-0 surface
- "Mixed" chip rendered beside the make-and-model picker, hover-tooltip lists
  contributors with token counts per provider

### Assumption: associations are content-uniform

The `ConversationAssociation` graph treats every `ContentNode` as a valid
target regardless of `contentType`. `chat`-type nodes (archived
conversations) can be associated with live conversations exactly like
notes or folders. We do **not** introduce a separate live-conversation ↔
live-conversation edge in v1 — any cross-conversation linking flows
through the archive-to-ContentNode path.

The general principle the rest of the plan assumes without restating it:
**any content can associate with any other content.** Sidebars surface
conversations associated with the active main content; only conversations
get the tabbed sidebar treatment.

### Recursion guard: a conversation is never its own side tab

When the active main panel is a `ChatViewer` viewing conversation X, the
side panel still queries associations and renders the tab strip
normally — but **conversation X is filtered out of its own results**. A
conversation can have other conversations as side chats; it doesn't show
itself as a redundant side tab. This is a one-line predicate in the
sidebar query, not an architectural restriction:

```ts
// In the sidebar tab-strip query
.where({ NOT: { conversationId: activeMainConversationId } })
```

### Association model — three sources, one merged set

Associations are written by three distinct mechanisms and surface together
in the sidebar. Source values are visible to the UI for styling but every
source results in the same join behavior for "show this chat in the side
panel of this content."

**1. `snapshot` — written at conversation creation.**
- When the user starts a new side-chat with panels {A, B, C} open, one
  `ConversationAssociation` row per panel is written with `source: snapshot`.
- Closing/reopening panels does **not** mutate snapshot rows.

**2. `auto` — written when a chat references content.**
- **@mention** in a user message → upsert `auto` row for that content;
  bump `lastReferencedAt` and `referenceCount` on each new mention.
- **AI tool-call** that reads or writes a `contentId` (today:
  `read_first_chunk`, `apply_diff`, `replace_document`, `getCurrentNote`,
  and any future tool whose schema includes a `contentId` arg) → upsert
  `auto` row for the touched content.
- Auto rows make conversations recallable from the side panel of any
  content the chat has referenced — without the user having to manually
  pin.

**3. `manual` — written by explicit user action.**
- "Pin to this content" / "Unpin" from the tab context menu.
- Promotion: pinning an existing `auto` row flips its `source` to
  `manual` (immune to LRU eviction going forward).

**LRU cap on auto rows.**
- Per-conversation cap: **20 `auto` associations** (config constant
  `CONVERSATION_AUTO_ASSOC_CAP`, lives in `lib/features/conversations/`).
- When the cap is hit and a new `auto` association is created, the row
  with the **oldest `lastReferencedAt`** among `source: auto` is deleted.
- `source: snapshot` and `source: manual` rows are **never evicted**
  regardless of count or age. They're intentional bindings.
- Manual cap does **not** exist — the user can pin as many as they want.

**Folder cascade rule.**
- Folder mentions/tool-calls write a single `auto` row for the folder
  itself. They do **not** auto-write rows for descendants.
- The sidebar query is plain `contentNodeId IN (open panel ids)` — no
  recursion. A user opening a child of an associated folder will not see
  the chat. Rationale: cascading would inflate the auto set unpredictably
  and produce stale recall.
- If we want "descendants of an associated folder also surface the chat"
  later, we'd do it via a *query-time* recursion (Postgres recursive CTE
  over `parentId`) rather than writing extra rows. Deferred.

**Open-from-sidebar (primary discovery gesture).**
- Sidebar header has a "+ Pin a chat" affordance opening a picker over all
  the user's conversations (most-recent first, search by title).
- Selecting one upserts a `source: manual` association from each currently-
  open panel to that conversation, then activates the conversation as the
  current tab.
- This is the **primary** way conversations cross from "exists somewhere"
  to "available here." Replaces the previously planned "Continue as side
  chat" header action.

**Reverse view in full-page ChatViewer.**
- Header of the full-page surface renders a row of chips for every
  associated content node — provider color matches the surface theme.
- Chips show source-source indicator (snapshot=`▸`, manual=`📌`,
  auto=`↪`).
- Clicking a chip opens that content in a new panel (or pops focus to it
  if already open).
- Right-click on a chip: unpin, promote to manual, dismiss.

### Sidebar multi-chat: tabbed strip

```
┌─ Side panel header ────────────────────────────┐
│ [Claude]  [GPT-4o↪]  [Sonnet📌]  …  + Pin    │
├────────────────────────────────────────────────┤
│ Active chat fills the panel                    │
│ … messages …                                   │
│ … messages …                                   │
├────────────────────────────────────────────────┤
│ Make-and-Model picker                          │
│ [Input area]                                   │
└────────────────────────────────────────────────┘
```

- Tab labels: conversation title (truncated to ~12ch); tab background uses
  the conversation's active-provider color at low opacity
- Caps gracefully at 5 visible tabs; overflow goes into a "…" menu
- Active tab gets full provider tint
- **Source indicator inline on each tab:** none for `snapshot`/`manual`
  (these feel "native to this content"); subtle `↪` glyph + lighter tint
  for `auto` (these are inferred, the user might not remember pinning
  them); `📌` glyph for `manual` after promotion
- Right-click on a tab: pin (auto→manual), unpin (delete association),
  open in full page, detach from this content only
- The "+ Pin" affordance launches the conversation picker described in
  the association model section (full label in copy: "+ Pin a chat")

### Pinning as the UX layer over associations

The data model uses `source: snapshot|auto|manual`. The **user-facing
language and iconography is the pinning vocabulary** the codebase
already uses elsewhere (file tree pins, tab pins).

**Verb mapping:**

| Action                                             | Surface verb / label  | Icon            |
| -------------------------------------------------- | --------------------- | --------------- |
| Promote an `auto` row to `manual`                  | "Pin association"     | `Pin`           |
| Create a `manual` row from the open-chat picker    | "Pin to open content" | `Pin`           |
| Delete any association row regardless of source    | "Unpin"               | `PinOff`        |
| Detach from this content only (multi-association)  | "Unpin from here"     | `PinOff`        |
| Open existing chat (sidebar header affordance)     | "+ Pin a chat"        | `Pin` + `Plus`  |

Compound phrasing — **"Pin association"** is fine when the surface needs
to clarify the noun (right-click menus, settings copy). Bare **"Pin"** /
**"Unpin"** is preferred when context already makes the target obvious
(tab right-click on a specific chat).

Internal vocabulary (Prisma fields, telemetry events, code identifiers)
stays as **association/associate** — the UI layer is the translation
boundary. This keeps the code self-documenting while presenting users
with the more familiar pin language.

### State synchronization across surfaces

The same conversation title can appear in **3+ surfaces simultaneously**:
the sidebar tab, the ChatViewer header (if open in another panel), the
reverse-view chip strip, and the "+ Pin a chat" picker. Any of these can
be the surface where the change originates (autotitle after first turn,
manual rename, provider switch flipping the tab tint, association
add/remove).

**Pattern:** a single client-side **conversation cache store** is the
source of truth for visible conversation metadata; every surface reads
from it; server events flow into it via a typed event bus.

```ts
// state/conversation-cache-store.ts
interface ConversationCacheEntry {
  id: string;
  title: string | null;
  activeProviderId: AIProviderId | null;
  activeModelId: string | null;
  isMixedProvider: boolean;
  contributors: AIProviderId[];
  lastMessageAt: string;
  associationSources: Record<string, ConversationAssociationSource>;
  // ^ keyed by contentNodeId → drives source-glyph rendering everywhere
}

interface ConversationCacheStore {
  entries: Record<string, ConversationCacheEntry>;
  upsert: (entry: Partial<ConversationCacheEntry> & { id: string }) => void;
  remove: (id: string) => void;
  // Bulk-prime from a server response (e.g. tab-strip query result).
  prime: (entries: ConversationCacheEntry[]) => void;
}
```

**Event bus** (`lib/features/conversations/events.ts`) — small typed
emitter; surfaces subscribe and dispatch `upsert(...)` into the store:

```ts
type ConversationEvent =
  | { kind: "title-changed"; conversationId: string; title: string }
  | { kind: "model-changed"; conversationId: string; providerId: AIProviderId; modelId: string }
  | { kind: "association-added"; conversationId: string; contentNodeId: string; source: ConversationAssociationSource }
  | { kind: "association-removed"; conversationId: string; contentNodeId: string }
  | { kind: "association-promoted"; conversationId: string; contentNodeId: string }
  | { kind: "message-appended"; conversationId: string; providerId: AIProviderId; modelId: string };
```

Server mutations emit the corresponding event over a lightweight
subscription channel (Server-Sent Events on `/api/conversations/events`,
filtered server-side by `ownerId`). The client connects once at app
load and routes events into the cache store. Optimistic UI updates
(pin/unpin clicks) write to the cache immediately and reconcile on the
server confirmation.

**Why a dedicated store vs. existing patterns:**
- The existing pattern for cross-surface refresh is
  `window.dispatchEvent(new CustomEvent("dg:tree-refresh"))` —
  un-typed and forces a full refetch. We want incremental + typed.
- Sidebar tabs, ChatViewer headers, and reverse-view chips don't share
  a parent; props-drilling is impossible without an architectural
  uplift. A store with selector subscriptions is the lowest-friction
  shared state for sibling surfaces.

**Test gate (S4):** open two main panels, drive a conversation's title
change in one, verify the tab strip in the other surface and the
reverse-view chip update without a manual reload.

### AI Gateway adoption — opt-in only; strict BYOK is the foundation

**Decision (2026-05-25, post-Session-1 testing):** the app is strict-BYOK.
Vercel AI Gateway authenticates with a single `AI_GATEWAY_API_KEY` env
var that would be shared across *every* user of a multi-user deployment.
That's the wrong model for a hosted multi-tenant app:

- All users' calls bill to one Vercel account
- Rate limits aggregate across users (one heavy user starves the rest)
- No way to enforce per-user limits or terms

Therefore, **Gateway is opt-in via env, default off.** Only self-hosted
single-user deployments should ever enable it.

New path: `lib/domain/ai/providers/gateway.ts`

```ts
import { gateway } from "@ai-sdk/gateway";

export function isGatewayEnabled(): boolean {
  return process.env.AI_USE_GATEWAY === "true"; // default OFF
}

export async function resolveChatModelViaGateway(
  providerId: string,
  upstreamModelId: string,
) {
  return gateway(`${providerId}/${upstreamModelId}`);
}
```

Resolver decision tree in `lib/domain/ai/providers/registry.ts`:

```
if (user has stored BYOK key for this provider) {
  → direct path via @ai-sdk/<provider>, user's key
} else if (AI_USE_GATEWAY === "true") {
  → Gateway path (self-hosted opt-in only)
} else {
  → throw BYOKRequiredError → 402 with code "BYOK_REQUIRED"
}
```

**Strict BYOK enforcement:** the resolver throws `BYOKRequiredError` when
no user key is stored and Gateway isn't opt-in. The chat route maps this
to a `402` response with `code: "BYOK_REQUIRED"` and the missing
`providerId`, so the client can render a "Set up your API key" CTA in
Settings → AI.

What this means in practice:
- A new install with no BYOK keys configured cannot use AI chat until a
  key is added
- No shared env-var fallback for `ANTHROPIC_API_KEY` etc. in production
  (the per-provider `case` branches in the resolver keep the existing
  defensive code, but the strict gate prevents them from being reached
  without a key)
- Self-hosted single-user deployments that want one-key-for-all can flip
  `AI_USE_GATEWAY=true` and provision `AI_GATEWAY_API_KEY`

Benefits we keep from the Gateway integration:
- Single-user deployments still get unified observability + retries
- The code path is exercised, ready for future BYOK-Gateway support
  (a user supplying their OWN Vercel Gateway key — out of scope for v1)

Migration is reversible: `AI_USE_GATEWAY=true` re-enables Gateway for
non-BYOK calls in environments where that's appropriate.

## Session sequencing

Nine sessions, each independently shippable behind a feature flag
(`ai.revamp.<session>`). Sessions are sequenced because data and engine
layers must precede UI work. Sessions 3.5 and 3.6 were appended after
the initial seven-session plan and slot between the visual-parity work
(S3) and the multi-conversation UX (S4).

### Completed work snapshot

| Session | Status   | Notable outcomes / pivots                                                                                 |
| ------- | -------- | --------------------------------------------------------------------------------------------------------- |
| 1       | ✅ Shipped | AI SDK 6.0.104 → 6.0.191 bump. **Strict-BYOK pivot mid-session** — Gateway became opt-in via `AI_USE_GATEWAY=true` (default off) after testing revealed the shared-key anti-pattern. `useConversationEngine` extracted. Per-call body via `sendMessage(msg, { body })` (no transport refs). `BYOKRequiredError` + 402 response shape. |
| 2       | ✅ Shipped | `Conversation` / `ConversationMessage` / `ConversationAssociation` + 2 enums in the dev DB. CRUD service (`lib/features/conversations/`) + API routes (`/api/conversations/*`). Client-safe `conversation-persistence.ts` helpers ready for surface integration (un-wired in S2, wired in S4). |
| 3       | ✅ Shipped | `MakeAndModelPicker` with big-3 chips + "More" overflow. `lib/design/system/ai-providers.ts` with 6 themes. Per-message provider stamping via `useConversationEngine`'s `getMessageStamp`. Dramatically stronger surface tints (base color + gradient overlay) per provider. Assistant avatar tooltip (1s delay, anchored right of icon) showing provider + model. Gemini model ID corrected. Provider brand icons (`ProviderIcon` with custom SVGs for all 6). |

### Sessions in progress / next

### Session 1 — Engine consolidation + AI Gateway + revival sweep

**Why first:** every later session depends on a shared engine and a stable
transport.

- Read AI SDK changelog since `ai@6.0.104`; adopt anything we're missing
  (likely a few minor `useChat` and tool-call ergonomics)
- Add `@ai-sdk/gateway` dependency, write `gateway.ts` provider, gate via
  `AI_USE_GATEWAY` env flag
- Extract shared `useConversationEngine()` hook from `ChatPanel` + `ChatViewer`
- Migrate both surfaces to consume the hook with no UI changes
- Smoke test: side-by-side parity check (golden path + tool calls + image gen)

**Deliverables:** `lib/domain/ai/use-conversation-engine.ts`,
`lib/domain/ai/providers/gateway.ts`, refactored `ChatPanel`/`ChatViewer`,
`AI_USE_GATEWAY` documented in `.env.example`.

### Session 2 — `Conversation` entity + migration + persistence layer

- Prisma migration creating `Conversation`, `ConversationMessage`,
  `ConversationAssociation`, two new enums
- Server actions/route handlers for CRUD: create, list (by association,
  by recent), get, append message, edit message (creates new branch),
  archive-to-ContentNode
- Backfill migration: existing `ChatPayload` ContentNodes optionally
  surface in the conversation list (read-only view) without copying — we
  query both sources and union on the list endpoint
- Engine hook switches its persistence layer to `Conversation` for new
  chats; old `ChatPayload` viewer route still works for archived chats

**Deliverables:** migration SQL, `lib/features/conversations/` module,
`app/api/conversations/` routes, `lib/domain/ai/persistence.ts` strategy.

### Session 3 — Make-and-Model picker + provider theming + mixed-provider

- New `MakeAndModelPicker` component (under-input affordance)
- `lib/design/system/ai-providers.ts` with theme definitions for all six
  providers (full styling spec for big three; minimal for the rest)
- Surface bg, typography, code-block chrome, bubble shape, markdown
  extension styling all switch on active provider
- `detectMixedProvider()` helper, gradient bg, "Mixed" chip
- Per-message provider stamp drives per-message theming regardless of
  surface theme

**Deliverables:** `components/content/ai/MakeAndModelPicker.tsx`,
`lib/design/system/ai-providers.ts`, updated `ChatMessage`/`ChatInput`,
new `MixedProviderChip` component.

### Session 3.5 — Connections as the universal unit (appended 2026-05-26)

**Why inserted here:** the existing provider catalog assumed "one
provider = one fixed lab catalog." Real users have a richer story —
direct provider keys (Anthropic, OpenAI, ...), gateway keys (Vercel AI
Gateway, Fireworks, Together, OpenRouter), and arbitrary custom
endpoints (any AI-SDK-compatible service). Adopting the universal
"Connection" model now means S4–S7 ride on top of the broader concept
instead of having to retrofit each.

**Locked decisions (2026-05-26):**

| Decision                                                 | Choice                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Routing when direct + gateway overlap for same lab       | Per-provider preference toggle in settings (defer the UI; field exists on connection or user settings) |
| Adding any provider (built-in or custom)                 | One universal "Add Connection" form; built-ins are pre-filled templates                                |
| Storage                                                  | New `AIConnection` model, one-time backfill from `AIProviderKey`, drop `AIProviderKey` after backfill  |
| Custom-provider maintenance burden                       | On the user — they own model ID lists, baseURL, etc. We provide the form, not the catalog              |
| Picker chip strip                                        | Big-3 always (if a connection exists); user-pinned customs appended; everything else in "More"         |
| Pin-to-picker for customs                                | Deferred from this session — track as part of 3.5b                                                     |
| Dynamic model fetching from gateway APIs (`/v1/models`)  | Deferred from this session. Users enter models manually; auto-fetch lands in 3.5b                      |

**Universal "Connection" concept:**

```ts
type ConnectionKind = "direct" | "gateway" | "custom";

interface AIConnection {
  id: string;
  ownerId: string;
  kind: ConnectionKind;
  presetId: string | null;     // "anthropic" | "openai" | ... | "vercel-gateway" | ... | null
  label: string;               // user-editable display name
  baseURL: string | null;      // null for built-ins that route to provider SDK defaults
  encryptedKey: string;        // existing crypto layer
  adapterKind: string;         // "openai-compat" | "anthropic" | "google" | "xai" | "mistral" | "groq"
  models: { id: string; name: string; contextWindow?: number; capabilities?: string[] }[];
  isPinned: boolean;
  pinOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

**Built-in templates ship in code** (not the DB):
- Direct: `anthropic`, `openai`, `google`, `xai`, `mistral`, `groq`
- Gateway: `vercel-gateway`, `fireworks`, `together`, `openrouter`
- Custom: blank form, user fills everything

Each template pre-fills `adapterKind`, `baseURL` (where applicable),
default model suggestions, and which fields are locked vs editable.

**Phases:**

1. **Schema** — new `AIConnection` model + `ConnectionKind` enum +
   inverse relation on `User`. User applies via paste. Schema patch
   prepared by the assistant.
2. **Backfill** — `prisma/scripts/backfill-ai-connections.ts` migrates
   existing `AIProviderKey` rows to `AIConnection` with `kind=direct`,
   `presetId=<providerId>`, `label=<provider name>`. Idempotent.
3. **Drop old table** — after backfill verified, a second schema patch
   removes `AIProviderKey` + the User inverse relation.
4. **Service + API** — `lib/features/ai-connections/` module with CRUD;
   routes at `/api/ai/connections` and `/api/ai/connections/[id]`.
5. **Resolver refactor** — `resolveChatModel` accepts a connection
   shape (not provider+model strings). Per-kind/per-adapter branches.
   `AI_USE_GATEWAY` env flag retired — every Gateway call now requires
   a user-owned Gateway connection.
6. **Settings UI** — new Connections list page with template picker
   ("Add Connection" → grid of templates → universal form).
7. **Picker integration** — `MakeAndModelPicker` reads connections, not
   the static catalog. Chip strip = big-3 (if configured) + pinned
   customs + "More". Model dropdown shows the active connection's
   stored model list.
8. **Quality gate**.

**Deferred (Session 3.5b):**

- Pin-to-picker UI for customs
- Per-direct-provider routing preference toggle (the "use direct or
  via gateway when both exist" choice)
- Dynamic model fetching from gateway `/v1/models` endpoints
  (Vercel AI Gateway, Fireworks, Together, OpenRouter)
- Featured/curated model lists per gateway (pre-paint UX before fetch)
- "Test Connection" button in the form

**Deliverables (3.5):** schema patch, backfill script,
`lib/features/ai-connections/` module, `/api/ai/connections/*` routes,
refactored `resolveChatModel`, updated chat route, Settings →
Connections page, refactored `MakeAndModelPicker`.

### Session 3.6 — Feature routing registry (appended 2026-05-26)

**Why inserted here:** future features (agents, MCP-driven tools,
flashcard MCP, image-gen variants, follow-ups, extension-introduced
capabilities) will each need their own "best AI for this job" mapping
— with optional backup chains for resilience when a provider rate-
limits, errors, or goes down. Building this plumbing now keeps later
sessions from each inventing their own provider-election toggles.

**Cross-examination with the existing plan** (recorded for the future):

| Session | Without 3.6                              | With 3.6 as plumbing                                                                             | Net           |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------- |
| 4       | No model decisions                       | No change                                                                                        | ✅ Independent |
| 5       | Image-gen implicit DALL·E default        | "image-generation" registered as feature; user elects connection + backups                       | 🟢 Improves   |
| 6       | Reasoning from current chat provider     | "reasoning-extended" can be its own elected feature (different from chat default)                | 🟢 Improves   |
| 7       | Bespoke "preferred provider for follow-ups" toggle | That toggle *is* a feature route — the bespoke S7 UI collapses into the generic registry UI | 🟢 Simplifies |

**Concept:**

- A **Feature** = anything in the app that needs to call an AI model.
  Examples: `chat`, `image-generation`, `follow-ups`,
  `chat-title-generation`, `flashcard-mcp`, `agent-planning`,
  `agent-execution`, etc.
- A **FeatureRoute** = an ordered list of `(connectionId, modelId)`
  pairs for a given user + featureId. Position 0 is primary; 1+ are
  ordered backups.
- A **fallback wrapper** runs the AI call and falls through the route
  list on retriable errors only.

**Storage:**

```prisma
model AIFeatureRoute {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId       String   @db.Uuid
  featureId     String   @db.VarChar(100)
  position      Int      // 0 = primary; 1+ = ordered backups
  connectionId  String   @db.Uuid
  modelId       String   @db.VarChar(100)
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @db.Timestamptz(6)

  owner       User         @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  connection  AIConnection @relation(fields: [connectionId], references: [id], onDelete: Cascade)

  @@unique([ownerId, featureId, position])
  @@index([ownerId, featureId])
}
```

FK cascade on `connectionId` deletion cleans up orphan routes
automatically. No JSON-blob settings to clean — every route is a real
row with referential integrity.

**Plumbing files:**

- `lib/domain/ai/features/registry.ts` — `FEATURE_REGISTRY` array, one
  entry per feature: `{ id, label, description, requiredCapabilities,
  defaultSuggestions }`. Features can register themselves via the
  same pattern as the extension registry (`installed.ts`-style) so
  later sessions add features without touching this module.
- `lib/domain/ai/features/router.ts` — `resolveFeatureRoute(userId,
  featureId)` returns the ordered `[{ connection, modelId }, ...]`
  list, filtered to those whose capabilities satisfy the feature's
  requirements. If no routes are configured, falls back to a sensible
  default per feature.
- `lib/domain/ai/features/execute-with-fallback.ts` — wraps an AI
  call. Tries each route in order; falls through on retriable errors
  (429, 503, network timeout, generic 5xx). Fatal errors (400, 401,
  402, 403) abort without falling through. Logs per-attempt
  telemetry with `feature_id`, `attempt_index`, `connection_id`,
  `outcome`.

**Settings UI** (Settings → AI → "Feature Routing"):

- Lists every registered feature with: label, description,
  capability badges (`text`, `tools`, `vision`, `streaming`,
  `reasoning`, `image`), and the current ordered route list.
- Each row supports inline add/remove/reorder of route entries.
- Connection+model dropdown is filtered to those that satisfy
  `requiredCapabilities`.
- Empty state for a feature shows "Using fallback default: <model>"
  with a CTA to configure.

**Initial features registered:**

- `chat` — text + streaming + tools + (vision optional). Per-
  conversation override via the picker remains; settings route is the
  *default* for new chats.
- `image-generation` — `image` capability. User elects
  DALL·E / Imagen / Flux / etc.
- `follow-ups` — text + streaming. Replaces the S7 bespoke toggle.
- `chat-title-generation` — text, low cost preferred. Used to auto-
  title conversations (future).

**Retriable error policy** (curated):

| Status | Outcome    |
| ------ | ---------- |
| 429    | Fall back  |
| 502    | Fall back  |
| 503    | Fall back  |
| 504    | Fall back  |
| Network timeout (>30s) | Fall back |
| 400    | Abort      |
| 401    | Abort      |
| 402 (BYOK required) | Abort      |
| 403    | Abort      |
| Other 4xx | Abort   |
| Other 5xx | Fall back |

**Deliverables (3.6):** schema patch, feature registry + router +
fallback wrapper, Settings → Feature Routing page, refactor of
existing chat code to call `resolveFeatureRoute('chat')` for new
chats, telemetry for fallback events.

**Out of scope here:**

- Health monitoring / circuit-breaker per connection (a future
  "Reliability" track)
- Cost-optimization-aware routing (e.g. "use the cheapest model that
  satisfies these caps") — feature-routing is *user-elected*, not
  automatic optimization
- Cross-feature shared route templates (e.g. "use this elected set
  for any 'agent' feature") — possible follow-on if usage demands

### Session 4 — Sidebar tabbed strip + association graph (snapshot/auto/manual)

This is the most architecturally dense session — the auto-association
graph touches the engine hook (mention/tool-call interceptors), the
persistence layer (LRU eviction), and the sidebar UI.

**Tabbed strip:**
- Sidebar wrapper queries open panel ids → joins `ConversationAssociation`
  → renders tabbed strip (sorted by `updatedAt` desc, capped at 5 visible
  with overflow "…" menu)
- Source-indicator glyphs inline: none for snapshot/manual, `↪` + lighter
  tint for auto, `📌` for promoted-manual
- Tab right-click: pin (auto→manual), unpin (delete row), open in full
  page, detach from this content only

**"+ Pin a chat" primary discovery affordance:**
- Sidebar header button opens a conversation picker (recent first, search
  by title, optional filter "only chats I haven't seen here yet")
- Selecting a conversation writes one `manual` association row per
  currently-open panel, activates the conversation as the active tab

**"New chat" affordance:**
- Creates new `Conversation` row, writes one `snapshot` association per
  currently-open panel, activates it

**Auto-association interceptors** (lives in engine hook, not UI):
- **Mention interceptor** — on `sendMessage`, scan reconstructed mention
  tokens (`@[Title](id)` format already used by `ChatPanel.handleSend`);
  for each unique content id, upsert `auto` association
- **Tool-call interceptor** — on each AI tool-call with a `contentId` arg
  (or any arg matching a known content-id schema), upsert `auto`
  association. Tool registry annotation: each tool declares which arg
  fields are content-id-bearing
- Both interceptors bump `lastReferencedAt` and increment `referenceCount`
  on existing rows rather than creating duplicates

**LRU eviction:**
- Server-side, runs inside the upsert transaction
- Query: `SELECT id FROM ConversationAssociation WHERE conversationId = ?
  AND source = 'auto' ORDER BY lastReferencedAt ASC LIMIT 1` — delete if
  count exceeds `CONVERSATION_AUTO_ASSOC_CAP` (20)
- Snapshot + manual rows ignored by the eviction query

**Reverse view in ChatViewer header:**
- Chip row above the messages, one per association
- Provider-tinted; source-glyph inline; click opens content; right-click
  context menu with same actions as the sidebar tab menu
- Overflows behind a "…" chip on small viewports

**Telemetry (light):**
- Log `auto_assoc_created` / `auto_assoc_evicted` / `auto_promoted_manual`
  span events so we can tell if the cap is too tight in real usage

**Pinning vocabulary** (see "Pinning as the UX layer over associations"):
- Tab right-click menu: "Pin" (auto→manual promote), "Unpin" (delete row),
  "Open in full page", "Unpin from here"
- Sidebar header: "+ Pin a chat" (was "+ Open chat" — pin language wins)
- Picker confirm button: "Pin to open content"
- Reverse-view chip right-click: same menu as sidebar tab

**Recursion guard:** sidebar tab query filters out the active
conversation when the main panel is its own ChatViewer (one-line
predicate). A conversation can have other conversations as side tabs;
it does not show itself as a redundant tab.

**Cross-surface state sync:**
- New `state/conversation-cache-store.ts` (Zustand, see "State
  synchronization across surfaces")
- New `lib/features/conversations/events.ts` typed event bus
- New SSE endpoint `app/api/conversations/events/route.ts` filtered by
  authenticated user — emits the typed events on server mutations
- Engine hook, sidebar tabs, ChatViewer header, reverse-view chips, and
  the picker all read from the cache store; props-drilling is removed

**Deliverables:**
- `components/content/ai/SidebarChatTabs.tsx`
- `components/content/ai/ConversationPicker.tsx` (the "+ Pin a chat" UI)
- `components/content/ai/AssociatedContentChips.tsx` (full-page header)
- `lib/features/conversations/associations.ts` (interceptor logic + LRU)
- `lib/features/conversations/events.ts` (typed event bus + SSE client)
- `state/conversation-cache-store.ts`
- `app/api/conversations/events/route.ts` (SSE source)
- Tool registry annotation extension for content-id-bearing args
- Updated `ChatPanel` and `ChatViewer` to consume the cache store and
  the new graph

### Session 5 — Edit / regenerate + attachments

- Per-message hover affordances: edit (user messages), regenerate
  (assistant messages)
- Edit creates a new `ConversationMessage` with `parentId` set; superseded
  message gets `isHidden: true`. Regenerate calls the model again with
  the same prompt branch
- Attachment buffer in the engine hook: image paste/drop/picker, PDF
  upload (server-side parse → text inline), text/json/csv files inlined,
  binary stored but flagged as non-model-readable
- Drag from file-tree → attaches the ContentNode payload as context
- All upstream models that accept these inputs route through their native
  vision/document APIs; unsupported models fall back to "inline text"

**Deliverables:** edit/regenerate handlers in engine,
`AttachmentPicker.tsx`, `lib/domain/ai/attachments/` (PDF parser, file
classifier), file-tree DnD adapter.

### Session 6 — Reasoning surface (3 provider-matched renderers)

- `<ReasoningRouter>` picks renderer based on **message's** `providerId`
- `ReasoningBlockClaude.tsx` — beige collapsible, italic dim text
- `ReasoningBlockChatGPT.tsx` — stepped breadcrumb cards
- `ReasoningBlockGemini.tsx` — bulleted trace with sub-headings
- `ReasoningBlockGeneric.tsx` — fallback for non-big-three providers
- Settings toggle: "Show reasoning when available" (default on)

**Deliverables:** four reasoning components, router, settings toggle in
the AI settings page.

### Session 7 — Suggested follow-ups + provider override + polish

- Optional toggle in settings: "Show suggested follow-ups"
- Sibling override picker: "Use this provider for follow-ups" (blanket
  across all chats; default = same as active provider)
- After each assistant `onFinish`, fire a small structured-output call
  to the chosen follow-up provider asking for 2-3 suggestions; render
  as chips below the message
- Streaming indicator polish: provider-matched (cursor / smooth /
  shimmer)
- Accessibility pass: keyboard nav across tabs, focus management for
  edit/regenerate, screen-reader labels on provider/model picker
- Regression sweep: `pnpm typecheck` / `pnpm lint` / `pnpm build` /
  manual smoke of every parity surface

**Deliverables:** `lib/domain/ai/follow-ups.ts`, settings UI, streaming
indicator variants, a11y audit notes, regression checklist.

## Risks and mitigations

| Risk                                                          | Mitigation                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| AI Gateway behavior differs subtly from direct provider calls | Side-by-side smoke tests in Session 1; flag for rollback                   |
| `parts[]` serialization for edit/branch grows hairy with reasoning + tool calls + images | Store parts verbatim; never flatten until archive-to-ContentNode |
| Per-provider markdown extension parsing causes content to unrender on theme switch | Always parse the union; theme decides style, not capability         |
| Big-three web apps redesign their reasoning UX quarterly       | Match the current snapshot; treat reasoning components as cosmetic ratchet |
| Sidebar tab strip overflow at >5 tabs degrades UX              | Cap at 5 with "…" overflow menu; revisit if heavy users hit it             |
| Auto-association cap of 20 may be too tight (or too loose) for real usage | Log `auto_assoc_evicted` and `auto_promoted_manual` events; revisit cap value after 2 weeks of real telemetry; manual rows are always safe |
| Mention/tool-call interceptors may double-fire and inflate `referenceCount` | Interceptors run server-side inside the same transaction as the message append; idempotent upsert keyed on `(conversationId, contentNodeId)` |
| Tool-call interceptor needs to know which args are content-id-bearing | Each tool in `lib/domain/ai/tools/` declares a `contentIdArgs: string[]` annotation; interceptor reads from this; default empty (no interception) |
| Folder auto-association without cascade may surprise users searching for past chats | Surface the recall behavior in the empty-state copy of the side panel ("no chats for this content — try a parent folder?") |
| Attachment vision/PDF capability matrix per model is moving target | Capability matrix lives in `providers/catalog.ts`; per-model flags     |
| BYOK keys interact weirdly with Gateway path                  | Hard split: any BYOK key → direct path, no Gateway involvement             |
| Existing `chat` ContentNodes need a graceful list-side coexistence | Union query in Session 2; no destructive backfill                   |

## Observability standards

Concise by default. Reuse existing `logger` / `startSpan` / `withSpan` /
`spanPayload` infrastructure from [`lib/core/logger`](../../../../lib/core/logger);
do not introduce a parallel telemetry surface for chat work.

**Span events worth emitting** (state transitions, not data plane):

| Event                          | Layer            | Attrs                                         |
| ------------------------------ | ---------------- | --------------------------------------------- |
| `conv.create`                  | conversation     | `snapshot_count`                              |
| `conv.archive`                 | conversation     | `messages`, `content_node_id`                 |
| `assoc.create`                 | conversation     | `source`, `via` ("mention" \| "tool-call" \| "picker" \| "snapshot") |
| `assoc.promote.manual`         | conversation     | `prior_source`                                |
| `assoc.evict.lru`              | conversation     | `evicted_age_ms`                              |
| `picker.open`                  | conversation     | `result_count`                                |
| `gateway.fallback`             | ai               | `provider`, `model`, `reason`                 |
| `engine.message.edit`          | ai               | `branch_depth`                                |
| `engine.message.regenerate`    | ai               | `provider`, `model`                           |

**Never emit:**
- Per-message append events (the existing `chat_stream` span already
  captures token usage on finish — duplicating per-message would 100×
  the event volume).
- Per-keystroke or per-mention-search events.
- Content text (mention contents, message bodies, attachment contents)
  in attrs — only IDs and counts.
- Association upserts that change only `lastReferencedAt`/`referenceCount`
  (these are routine bumps, not state changes).

**Client telemetry** via `clientLogger` (already exists at
`lib/core/logger/client`) — lighter touch, used for UX correlation:
- `chat.pin.click` (with `from_source`) and `chat.unpin.click`
- `chat.picker.select` (with `position_in_list`)
- `chat.provider.switch` (with `from_provider`, `to_provider`,
  `mid_conversation`)

Sampling: state-change spans are unsampled (low volume); client logs at
1.0 in dev, drop to 0.25 in prod for the high-frequency ones
(`provider.switch`) and 1.0 for the rare ones (`unpin`).

## Open questions

These do not block planning but should be revisited at the relevant session:

- **S3:** exact brand color tokens for OpenAI / Google / xAI / Mistral /
  Groq — Anthropic is well-known beige, ChatGPT has its green, Gemini has
  its blue gradient. Need stable hex values for the others.
- **S5:** image storage path for user-uploaded attachments — do they go
  through the existing R2 storage abstraction or a new `attachments/`
  bucket? Probably the former.
- **S5:** PDF parsing library choice (`pdf-parse` vs `unpdf` vs Vercel
  Sandbox + `pdfplumber`). `unpdf` is small and pure-JS; preferred unless
  it loses formatting badly on real-world docs.
- **S6:** how to surface reasoning during a multi-step tool loop — do
  reasoning parts from intermediate steps render or only the final?
- **S7:** follow-up call latency budget — if >300ms, defer with a skeleton
  chip placeholder, otherwise stream chips in line.
- **S4:** the conversation picker's default filter — "all my chats"
  vs "chats I haven't seen here yet" vs "chats I started here." Probably
  configurable but we need a default. Leaning toward "all my chats,
  most-recent first" since the picker IS the discovery surface.
- **S4:** should `auto` rows from tool-call writes (apply_diff /
  replace_document) be more permanent than read-only mention rows?
  A potential refinement: write-source `auto` rows could carry a higher
  weight in LRU comparison (e.g. multiply `lastReferencedAt` distance by
  0.5) so they survive eviction longer. Deferred until we see if it
  matters.

## Out of scope for v1 (revisit list)

- Voice input/output
- Long-term memory / cross-conversation context
- Web search tool
- Artifacts / Canvas split-pane
- Custom instructions / persona presets
- Mobile RN bridge
- Web search citations renderer
- Image-output editing inside a turn (e.g. "make it more blue")
- Folder-cascade recall via recursive CTE (deferred; folders bind to
  themselves only in v1)
- Per-conversation auto-association cap override (the constant is global)
- Cross-conversation deduplication ("you've already discussed this in
  chat X" suggestion when starting a new chat about a previously-touched
  content node)

## CI gates (each session)

- `pnpm typecheck` clean
- `pnpm lint` no new warnings (ratchet holds)
- `pnpm build` green
- Manual smoke: both sidebar and full-page paths, every provider chip
- Visual regression: capture snapshots per provider theme after S3
