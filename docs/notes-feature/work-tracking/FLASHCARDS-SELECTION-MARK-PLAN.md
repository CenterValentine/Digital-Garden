---
title: Flashcards Selection-Mark Plan (Sprint 8 candidate)
status: planned
last_updated: 2026-05-23
owner: centervalentine
related:
  - extensions/flashcards/
  - lib/domain/editor/extensions/
  - lib/domain/editor/commands/slash-commands.tsx
---

# Text-Selection-to-Flashcard TipTap Mark

## Goal

Let a user create flashcards directly from a note by **highlighting two passages**: one for the front, one for the back. The selected ranges stay highlighted in the editor (subtly, with per-card-set colors) but never appear in published content. Triggered by a slash command + remembers the last-used deck for fast repeat use.

This is the **author-side counterpart** to the existing `flashcardEmbed` block (which is the reader/study side). The mark lets users build a deck while reading their notes; the block lets them study from any note.

## Why a TipTap **mark** (not a node, not a decoration)

- **Mark**: persists in document JSON like `bold` / `italic` / `link`. Survives reload, copy-paste, export, server round-trip. Stripped on publish via a server-side variant. ✓ matches "highlights persist at all times in the editor, but not for publishing."
- **Node**: would replace the selected text with a wrapping node. Bad for `wikiLink`-style inline highlights that need to flow naturally inside paragraphs.
- **Decoration**: lives in editor state, not document JSON. Lost on reload. Loses the persistence requirement.

Same architectural family as the existing `Tag` extension (Epoch 19's nearest precedent): inline atomic representation, mark-level attrs, server variant for export safety.

## User flow

1. **Trigger** — user types `/flashcard-select` (or aliases `/fc-mark`, `/highlight-card`) OR presses Enter while the selection-mode overlay is up
2. **Deck picker** — modal appears
   - First time: full deck tree, "Create new deck" inline
   - Subsequent: pre-selected last-used deck; user presses Enter to confirm or picks a different one
   - Cancel/Esc → no mode change, nothing highlighted
3. **Front-selection mode** — UI affordance:
   - Cursor changes (CSS `cursor: crosshair`)
   - Floating hint bar: "Highlight the FRONT of the card → [Esc to cancel]"
   - User drags a text range → mark applied with `side: "front"`, fresh `cardSetId`, color from rotation palette
4. **Back-selection mode** — same UI, hint changes to "Highlight the BACK → [Esc to discard]"
   - User drags a second range → mark applied with `side: "back"`, same `cardSetId`, same color
   - On range commit: API call `POST /api/flashcards` with the two text contents + deckId
5. **Card created** — toast confirms; both ranges keep their highlights
6. **Abandoned** — if user presses Esc or navigates away before completing the back side, the front-side mark is **removed** (no flashcard, no stale highlight)

### Quick-fire mode (Enter)

After a card is created, if the user has Quick-Fire enabled (a session-level toggle, persisted in settings), pressing Enter immediately re-enters front-selection mode for the same deck. Lets a user rapidly build a deck from a note without re-opening the deck picker between cards.

## Schema

### TipTap mark

```ts
// lib/domain/editor/extensions/flashcard-select.ts (NEW)
export const FlashcardSelect = Mark.create({
  name: "flashcardSelect",
  inclusive: false,
  exitable: true,
  addAttributes() {
    return {
      cardSetId: { default: null }, // UUID linking front + back
      side:      { default: "front" }, // "front" | "back"
      deckId:    { default: null }, // FK to FlashcardDeck (for re-linking on edit)
      flashcardId: { default: null }, // populated after POST /api/flashcards
      color:     { default: 0 }, // index into a fixed palette (rotates)
    };
  },
  parseHTML() { return [{ tag: 'span[data-flashcard-select]' }]; },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-flashcard-select": "",
        class: `flashcard-select flashcard-select--side-${HTMLAttributes["data-side"]} flashcard-select--c${HTMLAttributes["data-color"]}`,
      }),
      0,
    ];
  },
});
```

Server variant (`ServerFlashcardSelect`) renders the children inline with **no wrapping element** — the published HTML is plain text, the highlight disappears entirely on public pages. Same publish-safety pattern as `flashcardEmbed` (Sprint 8 follow-up: hidden div), but for inline content.

### Color palette

12-entry palette of subtle background hues with low alpha. Per-card-set color picked by `cardSetId.charCodeAt(0) % 12` so the same card set always gets the same color even after reload. Different card sets are visually distinguishable but none scream "look at me."

```css
/* app/globals.css additions */
.flashcard-select { background-color: var(--fc-select-c, transparent); border-bottom: 1px dashed currentColor; padding: 0 2px; }
.flashcard-select--c0 { --fc-select-c: rgba(201, 168, 108, 0.10); }  /* gold-tinted */
.flashcard-select--c1 { --fc-select-c: rgba(99, 102, 241, 0.10); }   /* indigo */
/* ... 10 more, equally subtle ... */
.flashcard-select--side-front { /* same color */ }
.flashcard-select--side-back  { /* same color, slightly different decoration */ border-bottom-style: solid; }
```

Subtle difference between front and back: front gets a dashed underline, back gets solid. Or background opacity difference. TBD via design pass.

### Settings additions

```prisma
// On User.settings.flashcards (Json subfield):
lastUsedSelectionDeckId?: string;
quickFireEnabled?: boolean;
```

No schema migration needed — `settings` is already a JSON column.

## State machine

A new Zustand store: `state/flashcard-selection-store.ts` (NEW).

```ts
type FlashcardSelectionState =
  | { phase: "idle" }
  | { phase: "picking-deck"; resolveOnPick: (deckId: string | null) => void }
  | { phase: "awaiting-front"; deckId: string; cardSetId: string; color: number }
  | { phase: "awaiting-back";  deckId: string; cardSetId: string; color: number;
      frontRange: { from: number; to: number } }
  | { phase: "submitting"; ... };
```

A FlashcardSelectionOverlay component subscribes to the store and renders the floating hint bar + cursor cue.

Editor-level keyboard handler:
- `Esc` while phase != "idle" → roll back any partial mark + reset to idle
- `Enter` while phase = "idle" AND quickFireEnabled AND lastUsedSelectionDeckId is set → jump straight to awaiting-front

## Selection commit flow

When the user drags a range while phase is `awaiting-front` or `awaiting-back`:

1. ProseMirror selection-change listener fires
2. If `selection.empty`, ignore (user just clicked)
3. If `phase === "awaiting-front"`:
   - Apply `FlashcardSelect` mark to selection with `{ cardSetId, side: "front", deckId, color }`
   - Save `frontRange` to store
   - Advance to `awaiting-back`
4. If `phase === "awaiting-back"`:
   - Apply mark with `{ cardSetId, side: "back", deckId, color }`
   - Extract plain text from both ranges via `extractPlainTextFromTiptap`
   - `POST /api/flashcards` with the front + back text, deckId
   - On success: update both marks with `flashcardId`, reset to idle
   - On failure: remove both marks, toast error, reset to idle

## Abandon path

If the user navigates away, presses Esc, or otherwise interrupts during `awaiting-back`:
- Find marks with matching `cardSetId` (front mark only at this point)
- Remove via `editor.chain().focus().unsetMark("flashcardSelect", { extendEmptyMarkRange: true }).run()` with a position filter
- No flashcard created — clean state

## Server-side image support

The user mentioned "select text **or an image**." The mark version above only handles text-range selections. For image selection:
- TipTap's `image` is a Node, not text. A range can't span across a node boundary cleanly.
- Workaround: if the front/back selection is a single `image` node, store the image's `src` + `contentId` directly in the flashcard's `frontContent` / `backContent` JSON. No mark is needed (the image node already has its own identity).
- The "highlight" affordance on an image becomes a CSS outline on the image node — applied via a ProseMirror decoration keyed by `flashcardId` looked up on mount.

## Publish-safety

The mark's server variant uses a no-op `renderHTML` (just renders the children, no wrapper span). Public pages show the text without any highlighting. Same `extensions-server.ts` registration pattern as the existing flashcards block.

## API additions

- `GET /api/flashcards/selection-defaults` — returns `{ lastUsedSelectionDeckId, quickFireEnabled }` from user settings
- `PATCH /api/flashcards/selection-defaults` — updates same
- Existing `POST /api/flashcards` — already accepts `deckId`, just needs the text-extraction client-side before posting

## Sprint shape — 4 sub-tasks

### Sub-task 1 — Mark + server variant + registration

- `lib/domain/editor/extensions/flashcard-select.ts` — client + server variants
- Register in extensions-client, extensions-server, collaboration/extensions
- Bump `TIPTAP_SCHEMA_VERSION` (MINOR — additive new mark)
- CSS palette in `app/globals.css`

### Sub-task 2 — Selection store + overlay

- `state/flashcard-selection-store.ts` (Zustand)
- `extensions/flashcards/components/FlashcardSelectionOverlay.tsx` — floating hint bar with phase-aware copy
- Editor-level keyboard handler (Esc, Enter for quick-fire)
- ProseMirror selection-change listener that drives the state machine

### Sub-task 3 — Slash command + deck-picker integration

- New slash entry in `lib/domain/editor/commands/slash-commands.tsx`
- Reuse `FlashcardDeckPickerDialog` with a `pickerMode: "selection-flow"` variant that remembers last-used deck
- Settings PATCH on deck pick (writes `lastUsedSelectionDeckId`)

### Sub-task 4 — Card creation + abandon path + image branch

- Wire the second-selection commit to `POST /api/flashcards`
- Implement Esc / blur / navigation abandon → unsetMark for the front side
- Image-as-side branch: detect single-node image selection, store `{ src, contentId }` in front/backContent JSON

## Non-goals (defer past Sprint 8)

- **Editing an existing card from its highlight** — clicking a highlight could open the card in the inline editor. Useful but more UI; defer to a polish sprint.
- **Highlight on hover popover** showing the card's other side — nice-to-have. Defer.
- **Highlight visibility toggle** per-user — "hide my flashcard highlights" setting. Defer.
- **AI-generated cards from a highlighted passage** — out of scope (MCP-era feature).
- **Mid-document image selection across two nodes** — the image-as-side branch only handles a single-image selection. Cropping or multi-image is out.

## Verification gates

- `tsc --noEmit` exit 0
- `eslint --max-warnings 159` holds at ratchet
- `pnpm collab:schema:check` validates the new mark is registered on the server side
- `pnpm vercel-build` produces a clean build (webpack server/client boundary respected)
- Manual smoke: type `/flashcard-select`, pick deck, highlight front, highlight back, see card in deck via the Panel

## Open follow-up before kicking off

- Confirm color palette aesthetic (gold-tinted family vs. multi-hue?). The current Liquid Glass token surface has accent intents — we could thread them through if the design system favors that.
- Confirm Quick-Fire UX: does pressing Enter at idle skip the deck picker silently, or does it briefly flash "using deck: Spanish Verbs" before going into front-selection?
- Decide whether the selection-mode overlay floats near the cursor or pins to the editor frame's top. Floating is more glance-friendly but tends to interfere with the user's reading flow.
