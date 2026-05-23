---
title: Flashcards Images Plan (Sprint 7 candidate)
status: planned
last_updated: 2026-05-22
owner: centervalentine
related:
  - extensions/flashcards/components/
  - lib/domain/editor/extensions/image.ts
  - lib/domain/editor/hooks/use-image-upload.ts
  - components/content/editor/MarkdownEditor.tsx
---

# Flashcards Image Support

## Goal

Let users put images on either side of a flashcard so the system handles
image-prompt-name-recall use cases — identifying a plant from a photo,
naming a face / place / building from an image, etc. Backwards: name on
the front, image on the back, for "draw / visualize the answer" study
modes.

## Status today

| Layer | Works? | Why |
|---|---|---|
| **Schema** — `frontContent` / `backContent` are `Json` | ✅ | Already supports any TipTap JSON, including `image` nodes |
| **Image node rendering** in the review overlay | ✅ | `AdaptiveFlashcardEditor` uses `getEditorExtensions()` in rich-text mode, which registers `EditorImage` |
| **Paste / drop a file → upload → insert image node** | ❌ | Handlers live in `MarkdownEditor.tsx` `editorProps.handleDOMEvents`, not on the flashcard editor |
| **"Insert image" toolbar button** | ❌ | No affordance in `FlashcardQuickAddForm` or `FlashcardInlineEditor` |
| **Plain-text mode preserves images** | ❌ | Plain mode strips down to `Document → Paragraph → Text`; images dropped on save |
| **Image-only card layout** (no caption) | ⚠️ | Renders, but inherits the editor's `text-xl leading-relaxed` typography rules — image isn't visually "the whole card" |

## Diagnosis — why paste doesn't work

The image *extension* is registered, so when the schema sees
`{ type: "image", attrs: { src, alt } }` it renders correctly. But the
*input pipeline* (paste an image file → upload → insert node) is
implemented in `components/content/editor/MarkdownEditor.tsx`:

```ts
// MarkdownEditor.tsx ~line 431 — Sprint 37 image-paste handler
editorProps: {
  handleDOMEvents: {
    paste: (view, event) => {
      // ... extract file from clipboard, call uploadImage(), setImage()
    },
    drop: (view, event) => { ... },
  },
}
```

`AdaptiveFlashcardEditor.tsx` and `FlashcardInlineEditor.tsx` call
`useEditor()` independently and don't replicate this wiring, so a
paste event on those editors falls through to TipTap's default
behavior (which doesn't upload).

The fix is **not** to make the extension more clever. It's to extract
the paste/drop logic from `MarkdownEditor` into a reusable hook so
both editors can wire it up identically.

## Proposed sprint shape

One session, 4 sub-tasks.

### Sub-task 1 — Extract `useImagePasteHandler` hook

New file: `lib/domain/editor/hooks/use-image-paste.ts`

```ts
export interface UseImagePasteOptions {
  editor: Editor | null;
  // Where uploaded blobs go. Defaults to /api/content/content/upload/simple.
  uploadEndpoint?: string;
  // Optional parent folder for placement. Flashcards probably pass null.
  parentFolderId?: string | null;
  // Optional progress callback for showing "uploading…" affordance.
  onUploadStart?: (file: File) => void;
  onUploadComplete?: (file: File, url: string) => void;
  onUploadError?: (file: File, error: Error) => void;
}

export function useImagePasteHandler(opts: UseImagePasteOptions): {
  handlePaste: (view: EditorView, event: ClipboardEvent) => boolean;
  handleDrop: (view: EditorView, event: DragEvent) => boolean;
};
```

The body is roughly the existing `MarkdownEditor.tsx:431-470` paste
handler + `461-490` drop handler, lifted into a hook. `MarkdownEditor`
refactors to call this hook (zero behavior change there — same code,
new location).

### Sub-task 2 — Wire the hook into the flashcard editor

`AdaptiveFlashcardEditor.tsx`:

```ts
const { handlePaste, handleDrop } = useImagePasteHandler({ editor });
const editor = useEditor({
  extensions,
  content: ...,
  editorProps: {
    handleDOMEvents: { paste: handlePaste, drop: handleDrop },
    attributes: { ... },
  },
});
```

There's a chicken-and-egg here — the hook needs the editor instance,
but the handlers go into `useEditor` options. Workaround: pass a ref
that the hook resolves later, or expose the hook as
`useImagePasteHandler()` that returns plain functions reading from a
ref. Standard TipTap pattern.

### Sub-task 3 — Add an "Insert image" toolbar button

`FlashcardQuickAddForm.tsx` — add an `ImageIcon` button next to the
existing "Enable rich text" toggle. Clicking it:

1. Auto-flips `isFrontRichText` (or the back-side equivalent) to true
   if currently false — silently. Otherwise users get the "image
   disappeared on save" failure mode.
2. Triggers a hidden `<input type="file" accept="image/*" />` click.
3. On file pick: calls `uploadImage(file)` and the editor's
   `.chain().focus().setImage({ src: url }).run()`.

Same affordance gets added to `FlashcardInlineEditor.tsx` (the
edit-in-place panel inside the review overlay).

### Sub-task 4 — Image-only card layout polish

When a card face's TipTap doc contains *only* an image (no text body),
the layout currently inherits the `text-xl leading-relaxed` typography
rules from `CardFace` in `FlashcardReviewOverlay`. Result: the image
sits at the top with a lot of empty space below.

Fix in `CardFace` and the equivalent inline preview in the editor block:

```tsx
// Detect "image-only" doc shape — single block, type "image"
const isImageOnly =
  content?.content?.length === 1 &&
  content.content[0].type === "image";

<div className={cn(
  "absolute inset-0 flex flex-col rounded-lg p-5 md:p-8",
  isImageOnly && "items-center justify-center p-2 md:p-4",
)}>
  {isImageOnly ? (
    <img
      src={content.content[0].attrs?.src}
      alt={content.content[0].attrs?.alt ?? ""}
      className="max-h-full max-w-full object-contain"
    />
  ) : (
    /* existing label + body render */
  )}
</div>
```

Keeps the typography for caption-style cards (image + label below);
swaps to centered fill-the-frame layout when the image is the whole
card.

## Non-goals (defer beyond Sprint 7)

- **Image cropping / annotation in-editor** — out of scope; users edit
  externally and paste.
- **Multi-image carousels** — one image per side in v1; carousels would
  be a separate node type.
- **Audio cards** — same story, different content type. Roadmap, not
  Sprint 7.
- **Anki `.apkg` image import** — already on the Sprint 6 / v1.2
  backlog; pulls images out of the apkg archive and uploads them via
  the same pipeline.
- **Plain-text mode preserving images** — design call: plain mode IS
  the "this card is just text" affordance. If you want an image, flip
  rich-text. Auto-flip-on-paste (sub-task 3) handles the failure mode.

## Verification gates

- `tsc --noEmit` exit 0
- `eslint --max-warnings 159` holds at 159
- Smoke test of the image-paste path: paste a screenshot into the
  flashcard front, save, reopen card → image renders correctly
- `pnpm collab:schema:check` — no change needed; image node already in
  the collaboration schema (`EditorImage` registered)
- New Playwright visual regression (deferred from Sprints 3/5):
  `flashcard-card-image-front.spec.ts` covering the image-only card
  layout

## Open follow-up to resolve before kicking off

- Confirm `/api/content/content/upload/simple` accepts orphan uploads
  (no `parentFolderId` — flashcards have no folder context). If it
  requires one, add `parentFolderId?: string | null` to the contract
  with `null` accepted. Most likely already works.
- Confirm the `uploadImage` helper's error handling — what does the
  flashcard editor show if the upload fails mid-paste? Toast via
  sonner is the project convention.
