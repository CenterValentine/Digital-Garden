---
title: Flashcards Anki Import + Audio + Cloze Plan
status: planned
last_updated: 2026-05-23
owner: centervalentine
related:
  - docs/notes-feature/work-tracking/FLASHCARDS-FSRS-PLAN.md
  - extensions/flashcards/
  - prisma/schema.prisma
  - lib/domain/blocks/
  - lib/domain/editor/extensions/blocks/
  - lib/domain/collaboration/extensions.ts
  - lib/infrastructure/storage/
---

> **2026-05-23 revision:** corrected to match actual codebase state.
> - FSRS work is largely shipped (Epoch 19 Sprints 1–8). Was "prerequisite"; is now "done foundation."
> - Audio is a **block** (block-registry pattern), not an inline node. The `lib/domain/blocks/` registry (Epoch 11 Sprint 43) provides shared chrome via `createBlockNodeView` — drag handle, ± buttons, properties panel, slash menu auto-pickup. The original "inline + atom" framing was based on an outdated mental model; block is the right pattern for the user's "maximum space, most usable and aesthetic" requirement.
> - File structure is now paired: `<block>.tsx` (server-safe, `createBlockSchema` + `registerBlock`) + `<block>-client.tsx` (React NodeView). Splitting prevents the server bundler tracing `react-dom/client`.

# Flashcards Anki Import + Audio + Cloze Plan

Three coupled features that together let users migrate "simple" Anki decks into the Digital Garden flashcards system. Builds directly on top of the FSRS plan ([FLASHCARDS-FSRS-PLAN.md](./FLASHCARDS-FSRS-PLAN.md)) — must not start until that plan's Sessions 1 and 2 have shipped.

The feature sequence is intentional: each phase delivers standalone value, and each one is a prerequisite the importer depends on to faithfully translate Anki content.

```
FSRS plan (in flight)
  ↓
Phase A — Audio block        (~1 session)
  ↓
Phase B — Cloze cards        (~1.5–2 sessions)
  ↓
Phase C — Opinionated .apkg importer  (~2 sessions)
```

Total: roughly **5 additional half-day sessions** on top of the FSRS plan. Pausable between phases.

## Goals

- **Audio block** — new inline TipTap `audioEmbed` node with maximum-width, aesthetic player. Reusable across all notes; powers pronunciation cards.
- **Cloze cards** — Anki-style `{{c1::word}}` deletions, one-at-a-time reveal, sibling cards grouped by source note.
- **Importer** — opinionated `.apkg` importer that always succeeds: imports text, images, audio, basic cards, and cloze cards; collapses unfamiliar content to plain front/back with HTML stripped; discards scheduling state and review history.

## Non-goals

- Anki `.apkg` **export** (write direction) — deferred to v1.2+.
- Importing Anki review history, scheduling state, ease factors, or per-card statistics.
- Importing MathJax, custom CSS, JS hooks, conditional template fields, image-occlusion, or any third-party Anki add-on content. Stripped or rendered as plain text.
- Importing Anki "filtered decks" (dynamic deck definitions).
- Mobile React Native shell support for audio playback (waits on Garden Companion Phase 6).
- Voice recording from microphone — audio block is upload/embed only in v1. Recording is a future enhancement.
- Text-to-speech generation for cards without audio — future feature.

## Cross-cutting schema change: `noteId` (backport into FSRS plan)

**This change goes into FSRS Migration A** — not Phase B — to avoid a second migration. Add as nullable now, populated only when this plan's Phase B and Phase C run.

Single new column on `Flashcard`:

```prisma
model Flashcard {
  // ...existing FSRS-plan columns...
  noteId  String?  @db.Uuid                  // NEW — groups sibling cards (cloze ordinals, future multi-template notes)

  @@index([ownerId, noteId])
}
```

No new table. `noteId` is just a grouping UUID — not a foreign key, not a separate `FlashcardNote` row. The conventions:

- Basic single cards: `noteId` left NULL, no grouping needed.
- Cloze cards: all sibling cards generated from the same source TipTap document share one `noteId` UUID.
- Future multi-template notes (front→back + back→front + audio→meaning): same pattern — generate UUID, share across siblings.

The lightweight UUID approach (vs. a full `FlashcardNote` table) is deliberate: it adds zero migration surface, no JOIN cost, and lets us upgrade later to a real table if multi-template authoring needs more shared state (source field values, template definition). For now, "siblings share a UUID" is sufficient.

**Action:** update the FSRS plan's Migration A in [FLASHCARDS-FSRS-PLAN.md](./FLASHCARDS-FSRS-PLAN.md) to include this column. Bump the FSRS plan's session 1 by ~10 minutes of schema work.

---

## Phase A — Audio block

### Pattern

Follows the block-registry pattern (`lib/domain/blocks/`) — same as `flashcardEmbed`, `cardPanel`, `accordion`, `sectionHeader`. Two paired files:

- `lib/domain/editor/extensions/blocks/audio-embed.tsx` — server-safe. Uses `createBlockSchema` to declare a Zod attrs schema, exports `ServerAudioEmbed` Node + an attrs spec, calls `registerBlock` to publish a `BlockDefinition`. No React, no DOM imports.
- `lib/domain/editor/extensions/blocks/audio-embed-client.tsx` — client only. Imports the shared attrs spec, exports `AudioEmbed` Node with `addNodeView` wired through `createBlockNodeView` from `lib/domain/blocks/node-view-factory`.

The factory provides — for free — drag handle, ± insert buttons, type badge, properties menu (opens right sidebar), delete button, selection outline, wrap/size chrome (opt-in via `supportWrap`). The audio block contributes only its content renderer: the audio player itself.

### Attrs schema

```ts
const { schema: audioEmbedSchema, defaults: audioEmbedDefaults } =
  createBlockSchema("audioEmbed", {
    src:              z.string().nullable().default(null).describe("Storage URL (R2/S3/Blob)"),
    filename:         z.string().nullable().default(null).describe("Original filename for display"),
    durationSeconds:  z.number().nullable().default(null).describe("Audio duration in seconds"),
    mimeType:         z.string().nullable().default(null).describe("MIME type"),
    fileSize:         z.number().nullable().default(null).describe("File size in bytes"),
    autoplayOnFlip:   z.boolean().default(false).describe("Auto-play when revealed in flashcard"),
    showBackground:   z.boolean().default(true).describe("Show background fill"),
  });
```

`baseBlockAttrsSchema` is merged automatically — gives us `blockId` (auto-UUID) and `blockType` (audit).

### BlockDefinition

```ts
registerBlock({
  type: "audioEmbed",
  label: "Audio",
  description: "Embed an audio file for playback",
  iconName: "Music",
  family: "content",
  group: "media",
  contentModel: null,
  atom: true,
  attrsSchema: audioEmbedSchema,
  defaultAttrs: audioEmbedDefaults(),
  slashCommand: "/audio",
  searchTerms: ["audio", "sound", "mp3", "music", "voice", "podcast"],
});
```

**Correction (Session 1 finding):** `registerBlock` does **NOT** auto-add the slash command. The block registry powers the properties panel and the block picker (± button popups), but the slash menu in `slash-commands.tsx` is hand-curated. Adding a slash command for a new block requires a hand-written entry in [lib/domain/editor/commands/slash-commands.tsx](../../lib/domain/editor/commands/slash-commands.tsx) — same pattern as flashcards. Both the registry entry AND the slash entry must be written.

### NodeView UI (AudioEmbedNodeView)

Lives in `extensions/audio/components/AudioEmbedNodeView.tsx` (new directory — audio gets its own extension folder; reusable beyond flashcards).

**Visual design:**
- Full-width when on own line (no `supportWrap` initially — keep it simple, all-glass aesthetic).
- Glass-1 surface from the design system, rounded corners.
- Left edge: static waveform-ish SVG approximation (real waveform via Web Audio API is a v1.1 follow-up).
- Center: scrubber + current time / duration.
- Right: play/pause button, volume, download icon.
- Light/dark theme via design tokens.
- **Empty state:** when `src === null`, render an upload affordance (file picker button + drop zone) instead of the player. Click → file picker → upload pipeline → on success, update node attrs with `src`/`filename`/`durationSeconds`/`mimeType`/`fileSize`.

**Accessibility:**
- `aria-label` from filename.
- Keyboard: space play/pause, arrow keys seek.
- Honors `prefers-reduced-motion`.

### Storage path

Reuse the existing two-phase upload from [lib/infrastructure/storage/](../../lib/infrastructure/storage/):

1. Client posts to `/api/content/content/upload/initiate` with audio MIME type → gets presigned URL.
2. Client PUTs the file directly to R2/S3/Blob.
3. Client posts to `/api/content/content/upload/finalize` to confirm.
4. Server returns the public URL and metadata (duration via client-side `<audio>.duration` after probe load; ffprobe deferred).

**Required allow-list addition:** `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/x-m4a`. Locate in the upload route's MIME validation.

### Insertion paths

- **Slash command:** `/audio` (registered via a hand-written entry in `slash-commands.tsx`, NOT auto-picked from `registerBlock`) inserts an empty-state node. The NodeView's empty state handles file picking.
- **Drag-and-drop / paste:** detect audio MIME → upload → insert node with `src` populated.
- **Programmatic (importer):** importer constructs nodes with pre-uploaded URLs directly.

### Collab semantics

Attribute-only Y.Doc state — same as `flashcardEmbed`. Audio file lives in storage; node carries URL + display metadata. No Y sub-map.

### Registration

- `getEditorExtensions()` → `AudioEmbed` ([lib/domain/editor/extensions-client.ts](../../lib/domain/editor/extensions-client.ts))
- `getServerExtensions()` → `ServerAudioEmbed` ([lib/domain/editor/extensions-server.ts](../../lib/domain/editor/extensions-server.ts))
- `getViewerExtensions()` → inherits via `getEditorExtensions()`
- `getCollaborationServerExtensions()` → `ServerAudioEmbed` ([lib/domain/collaboration/extensions.ts](../../lib/domain/collaboration/extensions.ts))
- Bump `TIPTAP_SCHEMA_VERSION` minor in [lib/domain/editor/schema-version.ts](../../lib/domain/editor/schema-version.ts)
- Import `audio-embed.tsx` for its `registerBlock` side effect — the registry import-once pattern (matches existing blocks).

### NodeView UI (AudioEmbedNodeView)

Located in `extensions/audio/components/AudioEmbedNodeView.tsx` (new directory — audio gets its own extension folder since it has standalone value beyond flashcards).

**Visual design:**
- Full-width inline-block player (occupies the full line width when inserted on an empty paragraph; respects surrounding text when inline).
- Glass-1 surface from the design system, rounded corners.
- Left edge: animated waveform visualization (static SVG approximation during initial load; can upgrade to real waveform later via Web Audio API).
- Center: scrubber + current time / duration.
- Right: play/pause button, volume, download icon, three-dot menu.
- Honors light/dark theme via the existing design tokens.

**Accessibility:**
- `aria-label` from filename.
- Keyboard: space play/pause, arrow keys seek.
- Honors `prefers-reduced-motion` — disables waveform animation.

### Storage path

Reuse the existing two-phase upload from [lib/infrastructure/storage/](../../lib/infrastructure/storage/):

1. Client posts to `/api/content/content/upload/initiate` with audio MIME type → gets presigned URL.
2. Client PUTs the file directly to R2/S3/Blob.
3. Client posts to `/api/content/content/upload/finalize` to confirm.
4. Server returns the public URL and computed metadata (duration via ffprobe or client-side `<audio>.duration`).

**Required allow-list addition:** `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/x-m4a`. Locate in the storage upload validation — currently in [lib/infrastructure/storage/](../../lib/infrastructure/storage/) (find the MIME whitelist).

### Insertion paths

- **Slash command:** `/audio` opens file picker (single audio file).
- **Drag-and-drop:** detect audio MIME on drop into editor → upload → insert node at drop position.
- **Paste:** clipboard with audio file → same path as drag-and-drop.
- **Programmatic (importer):** importer inserts pre-uploaded audio nodes directly.

### Collab semantics

Attribute-only Y.Doc state — same pattern as `wikiLink`. The audio file itself lives in storage; the node carries only its URL and display metadata. No Y sub-map needed.

### Registration

- `getEditorExtensions()` → `AudioEmbed` ([lib/domain/editor/extensions-client.ts](../../lib/domain/editor/extensions-client.ts))
- `getServerExtensions()` → `ServerAudioEmbed` ([lib/domain/editor/extensions-server.ts](../../lib/domain/editor/extensions-server.ts))
- `getViewerExtensions()` → inherits via `getEditorExtensions()`
- `getCollaborationServerExtensions()` → `ServerAudioEmbed` ([lib/domain/collaboration/extensions.ts](../../lib/domain/collaboration/extensions.ts))
- Bump `TIPTAP_SCHEMA_VERSION` minor in [lib/domain/editor/schema-version.ts](../../lib/domain/editor/schema-version.ts)

### Flashcard integration

`FlashcardReviewOverlay` and `FlashcardEmbedNodeView` walk the TipTap JSON for `audioEmbed` nodes with `autoplayOnFlip: true`. When the card is flipped to the side containing the node, the corresponding `<audio>` element is `.play()`-ed.

Default `autoplayOnFlip` value on insert:
- Inside a `flashcardEmbed` context: `true`.
- Anywhere else: `false`.

---

## Phase B — Cloze cards

### Schema changes (Phase B migration, not in FSRS Migration A)

```prisma
model Flashcard {
  // ...
  clozeOrdinal  Int?     // NEW — which {{c1::}}, {{c2::}}, etc. this card represents
}
```

`noteId` was already added in FSRS Migration A (see cross-cutting section above). For cloze, all siblings generated from the same TipTap document share one UUID written into `noteId`.

`FlashcardCardType` enum gains `cloze` value (also already reserved in FSRS plan).

### Cloze mark spec

**Mark, not node.** Marks compose with other marks (bold, italic) and don't break text selection. New file: `lib/domain/editor/extensions/cloze-deletion.ts`.

```ts
export const ClozeDeletion = Mark.create({
  name: "clozeDeletion",
  addAttributes: () => ({
    ordinal: { default: 1 },         // 1-indexed: {{c1::}}, {{c2::}}, ...
    hint:    { default: null },      // optional: {{c1::word::hint}} → hint shown in place of [...]
  }),
  parseHTML: () => [{ tag: "span[data-cloze]" }],
  renderHTML: ({ HTMLAttributes, mark }) =>
    ["span", {
      "data-cloze": "true",
      "data-cloze-ordinal": mark.attrs.ordinal,
      "data-cloze-hint": mark.attrs.hint ?? "",
      ...HTMLAttributes,
    }, 0],
});
```

Plus `ServerClozeDeletion` in the same file. Register in all extension sets + bump schema version.

**Editor UX:**
- Clozed text renders with subtle highlight (Glass-1 surface, tinted) + ordinal badge (`①`, `②`, `③`...) before the text.
- Keyboard shortcut: `Cmd+Shift+C` wraps selected text in the next available ordinal.
- BubbleMenu button when text is selected: "Make cloze" with ordinal picker (or auto-assign).
- Slash command: `/cloze` inserts an empty cloze placeholder at cursor.

### Card synthesis: `extractClozeCards`

New utility at `lib/domain/flashcards/cloze/extract.ts`:

```ts
export type ClozeCard = {
  ordinal: number;
  frontJson: TipTapJson;   // source doc with {ordinal} masked
  backJson: TipTapJson;    // source doc with {ordinal} revealed (others masked)
};

export function extractClozeCards(sourceJson: TipTapJson): ClozeCard[];
```

The walker traverses the TipTap document, finds all `clozeDeletion` marks, collects unique ordinals, and produces one card per ordinal. For each card:

- **Front:** the marked text for *this* ordinal is replaced with `[...]` (or the hint, if set). All other ordinals are left visible.
- **Back:** the marked text for *this* ordinal is revealed (highlighted as the answer). All other ordinals remain visible.

**One-at-a-time reveal** is enforced by this synthesis: each card asks about exactly one ordinal. If a user wants "reveal all", they write distinct cards.

### Card rendering

`FlashcardReviewOverlay` and `FlashcardEmbedNodeView` need a `cardType === "cloze"` branch:

- Read `source` from the Flashcard (new column `clozeSourceJson`, or store the rendered front/back already — see decision below).
- Render the front/back TipTap docs using the read-only viewer.
- Highlight the revealed answer on the back with a brief animation.

**Storage decision (open):** persist the source TipTap doc once on the parent note and render front/back on the fly, OR persist pre-rendered front/back JSON per card row?

- **On-the-fly:** less storage, edits to the source propagate to all siblings, but every render runs the extractor.
- **Pre-rendered:** more storage, edits require re-extracting and updating all siblings, but rendering is cheap.

**Recommendation: pre-rendered**, with a `clozeSourceJson` column on the parent card (the one with the lowest ordinal in the sibling set) to allow re-extraction on edit. This matches Anki's mental model — cards are first-class, the source is incidental.

### Authoring flow

New card-creation mode "Cloze note":
- Single TipTap editor (not split front/back).
- User types the full sentence, selects text, presses `Cmd+Shift+C` to mark cloze deletions.
- On save: extractor runs, N Flashcard rows are written with shared `noteId`, `cardType: cloze`, sequential `clozeOrdinal`.

`FlashcardQuickAddDialog` gains a tab toggle: "Basic" (existing front/back form) vs "Cloze" (single source editor).

### Browse panel updates

`FlashcardsPanel` groups sibling cloze cards under their `noteId`:
- One collapsible row per note.
- Header shows source text preview with ordinals as badges.
- Expanded: one child row per sibling card with state, due date, last reviewed.

### Quality gate

`pnpm flashcards:cloze:check` (new optional CI script) — synthesizes a cloze card from a fixture document, asserts ordinals are correctly masked/revealed, ensures sibling cards share `noteId`.

---

## Phase C — Opinionated .apkg importer

### Opinionated simplifications (explicit)

The importer **always succeeds**. The contract:

| Anki concept | Action |
|---|---|
| Basic notes (Front / Back) | Imported as Flashcard with `cardType: basic` |
| Basic (and reversed) | Imported as two Flashcards sharing `noteId` |
| Cloze notes (`{{c1::}}`) | Cloze infrastructure (Phase B) — sibling cards per ordinal |
| Custom note types with N fields | Collapsed: field 0 → front, fields 1..N joined by `\n\n` → back. HTML stripped. Logged in report. |
| Tags | Imported into `Tag` table, deduped by name |
| Deck hierarchy (`Spanish::Verbs`) | Nested `FlashcardDeck` rows with matching `path` |
| Images (`<img src>`) | Uploaded to storage, rewritten to `imageEmbed` node |
| Audio (`[sound:file]`) | Uploaded to storage, rewritten to `audioEmbed` inline node |
| MathJax, JS, CSS, conditional fields | Stripped silently |
| Review history (`revlog`) | Discarded |
| Scheduling state (due, ivl, factor, reps, lapses) | Discarded — cards start as `state: new` |
| Suspended cards in Anki | Imported as suspended (`state: suspended`) — small concession; reflects user intent |
| Filtered decks | Skipped, logged in report |

### Parser pipeline

Server route: `POST /api/flashcards/import/anki` — multipart upload (single `.apkg` file). Synchronous for v1; document the practical limit (~1000 cards / 200 MB media) and plan async job queue for v1.1.

Pipeline stages:

1. **Unzip** — use `unzipper` or `jszip`. The `.apkg` is a ZIP containing:
   - `collection.anki2` (legacy) / `collection.anki21` / `collection.anki21b` (current; zstd-compressed)
   - `media` (JSON manifest: `{"0": "hola.mp3", "1": "perro.jpg", ...}`)
   - Numbered media files (`0`, `1`, `2`, ...)

2. **Decompress if needed** — `.anki21b` requires zstd decompression. Use `@mongodb-js/zstd` or `fzstd`.

3. **Open SQLite** — `better-sqlite3` in read-only mode. Query the schema:
   - `col` table: row 1, columns `decks` (JSON), `models` (JSON note types), `conf` (config).
   - `notes` table: `id`, `mid` (model id → models JSON), `flds` (tab-separated field values), `tags` (space-separated).
   - `cards` table: `id`, `nid` (note id), `did` (deck id), `ord` (template index), `queue` (suspended = -1).

4. **Build deck tree** — parse `col.decks` JSON, sort by `::`-separated depth, create `FlashcardDeck` rows in dependency order.

5. **Translate each note → cards:**
   - Look up model by `mid`.
   - If model name contains "Cloze" or model has any field with `{{cloze:}}` in its template: → cloze path.
   - Else basic / multi-field path.
   - HTML → TipTap via a one-way converter (see below).
   - Media references rewritten as upload jobs (deferred until end of pass).

6. **Concurrent media uploads** — max 5 in-flight. Each: look up numeric filename in manifest → read file from ZIP → infer MIME from extension + magic bytes → upload via storage layer → record URL.

7. **Commit cards** — only after all media is staged. Single transaction per deck (per-owner transactions, not one giant one).

8. **Return import report** — counts of decks, cards (by type), media (by type), skipped notes with reasons.

### HTML → TipTap converter

Reuse logic from the existing markdown/HTML export pipeline running in reverse. New utility: `lib/domain/flashcards/import/html-to-tiptap.ts`.

**Whitelist (mapped to TipTap):**
- `<b>`, `<strong>` → bold mark
- `<i>`, `<em>` → italic mark
- `<u>` → underline mark
- `<s>`, `<del>` → strike mark
- `<a href>` → link mark
- `<br>` → hardBreak node
- `<p>` → paragraph node
- `<ul>`, `<ol>`, `<li>` → list nodes
- `<h1>`–`<h6>` → heading node
- `<img src>` → imageEmbed node (after media upload)
- `<audio src>` (rare in Anki, more common in exports) → audioEmbed inline node
- `[sound:file.ext]` (Anki text marker, not HTML) → audioEmbed inline node
- `{{c1::word}}` / `{{c1::word::hint}}` (cloze syntax) → clozeDeletion mark

**Everything else:** drop tag, preserve text content. DOMPurify with a strict whitelist runs first as a safety net.

### Cloze import path

When the note type is cloze:
- Convert all fields to TipTap.
- The `Text` field (typically field 0) contains the `{{c1::}}` markers.
- Run `extractClozeCards(sourceJson)` from Phase B.
- Write N Flashcard rows with shared `noteId`, `cardType: cloze`, sequential ordinals.
- If the note type has an "Extra" field, prepend or append it to each card's back side.

This is exactly why cloze must ship before the importer — without `extractClozeCards`, we'd silently drop these notes or convert them to broken basic cards.

### Import UI location

**Decision: flashcards rail.**

The actual parsing/upload happens server-side. Client perf is identical whether the upload button lives in settings or the flashcards rail — the client only ships a file picker + progress UI (<5KB).

UX reasoning: users mentally file "import a deck" under flashcards, not under app-wide settings. Settings is for cross-cutting concerns (backup/restore, data export, account migration). Deck import is a flashcards concern.

**Contingency — if the import UI ever moves to settings:** the settings shell must gain a "Back to *previous surface*" affordance so users can return to whatever content they had open before navigating to settings. Today's settings surface doesn't preserve return context, which becomes painful for any deep-link flow (import deck → study the imported cards → currently lose your place). The minimum implementation: capture `document.referrer` or push a `?returnTo=` query param on the link into settings, render a back chevron in the settings header that pops the user back. Track this as a settings-surface follow-up regardless — even if import stays in the flashcards rail, the back affordance is the right pattern for other future settings deep-links.

Specifically: add an "Import" button to the `FlashcardsPanel` toolbar that opens an `AnkiImportDialog`. The dialog:

1. File picker (`.apkg` only).
2. Optional target-deck override (default: import preserves deck names from the file).
3. Duplicate handling: "Skip duplicates" (by content hash, default) / "Import all".
4. Tag prefix option: "Prefix all tags with deck name" (default: off).
5. Upload + progress (sync for v1, polling later when async).
6. Final import report modal: counts, skipped notes list, success/failure.

### Import report shape

```ts
type AnkiImportReport = {
  decksCreated: number;
  cardsImported: {
    total: number;
    basic: number;
    cloze: number;
    sibling: number;        // basic-and-reversed pairs
  };
  mediaImported: {
    images: number;
    audio: number;
    unresolved: string[];   // references in cards but not found in manifest
  };
  skipped: Array<{
    noteId: number;
    reason: "filtered-deck" | "unknown-model" | "empty-fields" | "media-too-large";
    preview: string;        // first 80 chars of source for debugging
  }>;
  durationMs: number;
};
```

---

## Quality gates

- `pnpm typecheck` — clean. New types in `lib/domain/flashcards/cloze/`, `lib/domain/flashcards/import/`, `extensions/audio/`.
- `pnpm lint` — zero new warnings against the `--max-warnings 175` ratchet.
- `pnpm collab:schema:check` — passes. All four new TipTap contributions (`AudioEmbed` + `ServerAudioEmbed`, `ClozeDeletion` + `ServerClozeDeletion`) registered in collab extensions.
- `pnpm build` — green.
- **New optional CI gates:**
  - `pnpm flashcards:cloze:check` — fixture cloze doc → 3 sibling cards with correct ordinals.
  - `pnpm flashcards:anki:check` — fixture `.apkg` (small, committed in tests) → expected card/media counts.
- Playwright visual regressions in [`tests/e2e/extensions/`](../../tests/e2e/extensions/):
  - `audio-block-inline.spec.ts` — audio node inline in prose, light + dark.
  - `audio-block-full-width.spec.ts` — audio on own paragraph, full-width player.
  - `cloze-card-front.spec.ts` — cloze card with `[...]` mask.
  - `cloze-card-back.spec.ts` — cloze card with revealed answer.
  - `anki-import-dialog.spec.ts` — dialog open state.

---

## Session breakdown

Five sessions, roughly half-day each. Sessions are sequential — each depends on the previous.

### Build-gate + manual-verification checkpoints

**Every session ends with a hard stop.** No starting the next session until:

1. `pnpm build` passes locally (full pipeline — `prisma generate` → tokens → tsc → collab schema check → lint → next build).
2. User manually exercises the new surface in the browser per the session's verification script (specified inline below).
3. User explicitly confirms "move on to next session."

This is not optional. The features in this plan touch the schema, the editor, the collab schema, and the storage layer — each session builds load-bearing infrastructure for the next. A type-checked build that misbehaves at runtime is the failure mode to avoid; the only protection is hands-on verification before stacking more work on top.

### Session 1 — Audio block (server + node)

- Add audio MIME types to storage upload allow-list.
- Create `lib/domain/editor/extensions/blocks/audio-embed.tsx` with `AudioEmbed` + `ServerAudioEmbed`.
- Register in all four extension sets.
- Bump `TIPTAP_SCHEMA_VERSION` minor.
- Build `extensions/audio/components/AudioEmbedNodeView.tsx` with full-width inline player, Glass-1 surface, scrubber, play/pause, download.
- **Slash command `/audio` + file picker dialog — must invoke the upload pipeline end-to-end.** This is the critical user-facing path for Session 1 verification.
- Drag-and-drop / paste handler for audio MIME types.
- Visual regression baselines.
- Confirm `pnpm collab:schema:check` green.

**🛑 Session 1 verification (user-performed before Session 2 begins):**

1. `pnpm build` clean.
2. `pnpm dev` running.
3. Open a note in the editor.
4. Type `/audio` — confirm slash command menu shows the audio entry.
5. Select it — confirm file picker opens.
6. Upload a real audio file (mp3 or m4a recommended).
7. Confirm the file uploads (network tab shows `initiate` → presigned PUT → `finalize`).
8. Confirm the audio node renders with the player UI, filename, duration.
9. Click play — confirm audio plays.
10. Save the note, reload the page, confirm the audio node + URL persist and still play.
11. Drag-and-drop a second audio file directly into the editor — confirm it inserts a working node.

If any step fails, the bug is fixed before Session 2 starts. Session 2 wires `autoplayOnFlip` into flashcards — that work is meaningless if Session 1's upload + playback isn't solid.

### Session 2 — Audio in flashcards + cloze schema

- Plumb `autoplayOnFlip` attribute into `FlashcardReviewOverlay` and `FlashcardEmbedNodeView` — walk TipTap JSON for `audioEmbed` nodes, play on card flip.
- Add cloze-related schema: `clozeOrdinal` column on `Flashcard`, `clozeSourceJson` on parent card (or document on-the-fly alternative if changing minds). Migration runs separately from FSRS migrations.
- Add `noteId` index test (the column was added in FSRS Migration A; verify it's queryable).
- Wire `cardType: cloze` value into the enum (already added in FSRS plan, just confirm).

**🛑 Session 2 verification:**

1. `pnpm build` clean.
2. Create a basic flashcard with an audio node embedded on the back side (or front), `autoplayOnFlip: true`.
3. Open the review overlay for that card.
4. Flip the card — confirm the audio auto-plays on the revealed side. Note: browser autoplay policies may suppress the *very first* flip after page load; the second flip onward must work reliably.
5. Set `autoplayOnFlip: false` on a different card — confirm flipping that card does NOT auto-play (manual play button still works).
6. Confirm the new schema columns exist via `npx prisma studio` (`clozeOrdinal`, `clozeSourceJson`).

### Session 3 — Cloze mark + extractor + rendering

- Create `lib/domain/editor/extensions/cloze-deletion.ts` with `ClozeDeletion` mark + `ServerClozeDeletion`.
- Register in all four extension sets. Bump schema version.
- Build `lib/domain/flashcards/cloze/extract.ts` — `extractClozeCards` with one-at-a-time reveal semantics.
- Unit tests: single cloze, multiple ordinals, hint syntax, nested marks (bold within cloze), empty cloze.
- BubbleMenu integration: "Make cloze" button + ordinal picker.
- Slash command `/cloze`, keyboard shortcut `Cmd+Shift+C`.
- Update `FlashcardReviewOverlay` and `FlashcardEmbedNodeView` with `cardType === "cloze"` rendering branch.
- Visual regression baselines for cloze front/back states.

**🛑 Session 3 verification:**

1. `pnpm build` clean.
2. In a note, type a sentence. Select one word, press `Cmd+Shift+C` — confirm the word renders with cloze styling and ordinal badge `①`.
3. Select another word, press `Cmd+Shift+C` — confirm it gets `②`.
4. (Manual prep needed) Wire that note's content into a Flashcard with `cardType: cloze` — easiest via a dev script or direct DB write since the authoring UI ships in Session 4.
5. Open the review overlay. Confirm card 1 hides ordinal 1 (shows `[...]`) and reveals ordinal 2.
6. Flip — confirm ordinal 1 is revealed.
7. Confirm card 2 hides ordinal 2 and reveals ordinal 1.
8. Confirm the cloze mark survives a save / reload cycle (the schema check is the gate, but eyeball it).

### Session 4 — Cloze authoring + browse panel

- Add "Cloze" tab to `FlashcardQuickAddDialog` with single-editor source flow.
- On save: run extractor, write N siblings with shared `noteId`.
- Update `FlashcardsPanel` to group siblings by `noteId` in collapsible rows.

**🛑 Session 4 verification:**

1. `pnpm build` clean.
2. Open `FlashcardQuickAddDialog`. Switch to the "Cloze" tab.
3. Type a sentence with three cloze deletions of your choice. Save.
4. Open `FlashcardsPanel` — confirm exactly one collapsible row appears (not three flat rows). Confirm the row header shows the source sentence with ordinal badges.
5. Expand the row — confirm three sibling cards listed, each with its own state and due date.
6. Click "Review" on the parent deck — confirm all three sibling cards appear in the queue in order.
7. Rate each card (anything except Again) — confirm they update independently.

### Session 5 — Anki importer

- `pnpm add unzipper @mongodb-js/zstd better-sqlite3 dompurify isomorphic-dompurify`.
- Create `lib/domain/flashcards/import/` directory with: `parser.ts` (SQLite + ZIP), `html-to-tiptap.ts`, `media.ts` (upload pipeline), `synthesizer.ts` (note → cards).
- Create `POST /api/flashcards/import/anki` route. Validate file size, run pipeline, return report.
- Create `extensions/flashcards/components/AnkiImportDialog.tsx`. File picker, options form, progress, report view.
- Add "Import" button to `FlashcardsPanel` toolbar.
- Test with three fixture decks: basic-only, mixed basic+cloze, deck-with-audio (commit to `tests/fixtures/anki/` as small representative samples).
- Update [`docs/notes-feature/STATUS.md`](../STATUS.md), [`BACKLOG.md`](./BACKLOG.md).

**🛑 Session 5 verification:**

1. `pnpm build` clean.
2. Import the basic-only fixture deck. Confirm the report shows expected card count and zero skipped notes.
3. Open the imported deck — confirm cards have legible text (no raw HTML tags visible).
4. Import the mixed basic+cloze fixture. Confirm cloze notes produced sibling cards grouped under one `noteId` in the browse panel.
5. Import the audio fixture. Confirm audio nodes are clickable and play after upload completes.
6. Re-import the basic-only fixture with "Skip duplicates" enabled — confirm report shows 0 new cards and the dedupe count matches.
7. Try an intentionally malformed `.apkg` (random ZIP, or empty file). Confirm the importer fails gracefully with a user-visible error, no half-imported cards in DB.

---

## Risks

- **`.anki21b` zstd format** — modern Anki defaults to zstd-compressed collection files. Older parser libraries don't always handle it. Verify with a test export from current Anki before Session 5 starts; have `@mongodb-js/zstd` confirmed working.

- **Media filename Unicode / case sensitivity** — Anki's `[sound:]` references can disagree with the media manifest on case and Unicode normalization. The manifest is authoritative; the importer should match references to manifest entries via NFC-normalized lowercase. Log unresolved references in the report rather than failing.

- **Large decks block the request** — synchronous import with 5000 cards + 500 MB media will exceed typical request timeouts. v1 documents a soft limit (~1000 cards / 200 MB media); v1.1 moves to a background job queue with progress polling.

- **Cloze with HTML formatting inside the deletion** — Anki cloze can wrap arbitrary HTML (`{{c1::<b>bold</b>}}`). The mark approach handles this naturally because marks compose with other marks, but the parser must walk into the cloze content to convert inner HTML before applying the mark. Easy to forget; add a fixture test.

- **Anki "Type the answer" fields** — special template syntax (`{{type:Back}}`) that prompts the user to type the answer. Opinionated simplification: treat as a normal front/back card; the type-answer UI doesn't exist in our system. Logged in report.

- **Audio autoplay browser policies** — browsers block autoplay without user interaction. The first card flip in a session may not autoplay; subsequent ones will (because the user has interacted). Document this; possibly show a "tap to enable audio" prompt on the first card.

- **Storage cost surprise** — a single Anki language deck can be 1 GB of audio. Make the storage usage visible to the user in the import dialog before they commit.

- **Cloze source storage** — if we go with pre-rendered front/back per card (recommendation), edits to the source require finding all siblings via `noteId` and re-extracting. Failure mode: user edits a cloze, only some siblings update. Mitigation: extract+update in a single transaction.

---

## Deferred items (v1.x and beyond)

| Item | Why deferred | Earliest target |
|---|---|---|
| Anki `.apkg` **export** | Symmetric to import but lower urgency | v1.2 |
| Background job queue for large imports | Sync version covers ~1000-card decks | v1.1 |
| Voice recording from microphone | Audio block ships upload-only first | v1.1 |
| Text-to-speech generation for cards without audio | Needs TTS provider integration | v1.2 |
| Image-occlusion card type | Distinct card type, substantial UI | v1.3 |
| Typing-the-answer card type | Distinct card type | v1.3 |
| Multiple-choice card type | Distinct card type | v1.3 |
| Import progress UI with cancel | Waits on job queue | v1.1 |
| Importing Anki scheduling state | FSRS ≠ SM-2; would need translation logic of dubious value | not planned |
| Importing Anki review history | Privacy + storage cost; opt-in if ever | not planned |
| Bulk audio normalization (loudness, format) | Quality-of-life, not blocking | v1.2 |
| Web Audio waveform rendering | Currently SVG approximation | v1.1 |
| Anki add-on content (MathJax, conditional fields) | Out of scope per "opinionated simplicity" charter | not planned |

---

## Open follow-ups before implementation kicks off

- Confirm `clozeSourceJson` is stored on the parent (lowest-ordinal) sibling vs. somewhere else (separate table, or on every sibling). Recommendation: parent only, with an index for sibling lookups via `noteId`.
- Confirm the audio block default `autoplayOnFlip` value: `true` inside `flashcardEmbed`, `false` elsewhere. Or always `false` and the flashcard UI overrides? (Recommend: attribute defaults `false`, flashcard NodeView reads the attribute and respects it; insertion inside flashcards sets it to `true` via slash command.)
- Confirm import duplicate-detection strategy: content hash (front + back text, lowercased, whitespace-normalized) vs. Anki note `guid` (if preserved). Recommend content hash — survives re-export from Anki where guids may change.
- Confirm the cloze BubbleMenu UX matches how slash commands feel — same dialog patterns, same keyboard shortcuts.
- Decide whether suspended cards in Anki should import as `suspended` or as `new`. Spec above says `suspended` (preserves user intent); revisit if testers find this confusing.
