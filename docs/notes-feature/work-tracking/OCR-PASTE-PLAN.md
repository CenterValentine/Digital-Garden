---
last_updated: 2026-10-06
status: planned — decisions settled with the owner 2026-10-06; handed to the implementing agent; no code yet
---

# OCR paste — paste an image, keep only its text

**What this is.** A paste gesture that takes an image off the clipboard, reads
the text out of it locally, and inserts only that text. The same engine is
reachable from a right-click on an image already in a note, and from the
co-browse engine as a way for the AI to read a page off its pixels when the
page's DOM and accessibility tree give it nothing.

**What already exists (verified 2026-10-06, read before changing anything):**

- `tesseract.js@7.0.0` is a direct dependency (`package.json`, also in
  `pnpm.onlyBuiltDependencies`). The speed-reader extension already runs it in
  the browser: `extensions/speed-reader/lib/extractors/ocr.ts` does
  `await import("tesseract.js")` + `createWorker("eng")` and caches one worker
  for the life of the page. It passes no paths, so the worker script, WASM core
  and language pack are fetched at runtime from jsdelivr / tessdata.projectnaptha.
- The *server-side* OCR in `lib/infrastructure/media/document-extractor.ts`
  and the upload dialog's `enableOCR` are disabled for an unrelated reason
  (Node worker files under pnpm). This plan does not touch them.
- The editor's paste handler is `components/content/editor/MarkdownEditor.tsx`
  `editorProps.handlePaste`; its first branch already routes `image/*` files
  to `insertImageFromFileRef.current(file)`. The flashcards editor carries a
  duplicate of that branch in `lib/domain/editor/hooks/use-image-paste.ts`.
- ProseMirror sets `view.input.shiftKey` on keydown and treats Shift+paste as
  plain text for *text*. `handlePaste` still fires for files on a Shift+paste.
  `view.input` is not in prosemirror-view's public typings, so the editor
  tracks Shift itself (D1).
- Nothing in the app binds any Mod+…+V chord. The only Mod+Alt bindings are
  TipTap's Mod-Alt-0..6 / Mod-Alt-c and the app's Cmd+Alt+W (close tab).
- The editor context menu (`components/content/context-menu/editor-actions.tsx`)
  has an image section (`download-image`, matched on `.image-resize-wrapper img`)
  and a clipboard section (Paste, Paste as Markdown, Select All).
- The side panel already captures screenshots for the chat's vision input
  (`capture-screenshot` in `extensions/browser-bookmarks/browser-extension/src/panel/index.js`
  → `chrome.tabs.captureVisibleTab`, JPEG q70). It is user-triggered only and
  captures the *active* tab, not the co-browse-bound tab.
- First-run download sizes, measured: worker 111 KB, SIMD-LSTM core 3.9 MB,
  `eng.traineddata.gz` 10.9 MB (default `4.0.0`) or 2.0 MB (`4.0.0_fast`).
  The language pack is cached in IndexedDB by tesseract.js after the first run.

---

## 1. Decisions (settled 2026-10-06)

### D1 — Gesture: Cmd+Shift+V is "paste as text", extended to images

Shift+paste already means "I want the text, not the rich thing" everywhere
(browser, ProseMirror). The text of an image is its OCR. So:

- Shift held + an `image/*` file on the clipboard → OCR, insert text, **never
  upload the image**.
- Plain Cmd+V with an image → unchanged (upload + insert image node).
- Shift+paste with text → unchanged (ProseMirror plain-text paste).

Why not a dedicated chord: Cmd+Option+V fires no native paste event, so it
would need our own keydown + `navigator.clipboard.read()` with per-browser
permission prompts, and Ctrl+Alt is AltGr on several Windows layouts.
Cmd+Option+Shift+V is macOS "Paste and Match Style". Cmd+Shift+V rides the
native paste event and needs no permission.

**Shift detection.** Add `keydown`/`keyup` to the editor's existing
`handleDOMEvents` that write `event.shiftKey` into a ref owned by
MarkdownEditor; `handlePaste` reads the ref. Do not read `view.input.shiftKey`
(internal; the typing can change under a prosemirror-view bump). Clear the ref
on `blur`.

**Safari caveat.** Whether Safari dispatches a `paste` event for Cmd+Shift+V is
unverified. Smoke it. If it does not, the keydown path from the context-menu
item (D2) is the fallback and the gesture degrades to "use the menu" on
Safari; do not add a second chord to compensate.

### D2 — Fallback surfaces: two image actions and one clipboard action

Right-click on an image node in the editor:

1. **Extract text from image** — runs OCR on the image, inserts the text as
   blocks *after* the image node, keeps the image.
2. **Replace image with its text** — the extract-and-destroy variant: same
   OCR, then one transaction replaces the image node with the text blocks. If
   OCR returns nothing, do nothing destructive: toast "No text found", image
   stays.

Both fetch the image bytes from the node's own `src` (the
`/api/content/content/{id}/download?stream=true` URL for uploaded images,
the URL itself for `source:"url"` images). No clipboard involved, so these
work in every browser and are the robust path.

Clipboard section, beside "Paste as Markdown":

3. **Paste text from image** — `navigator.clipboard.read()`, take the first
   `image/*` item, OCR, insert at the context editor's selection. Read the
   clipboard **before** awaiting the engine import: the read must happen inside
   the user gesture or Safari voids it. Reuse `clipboardBlockedGuidance()` from
   `lib/domain/content/markdown-detect.ts` when the read is refused.

**Adjacent fix, same change:** the existing Paste and Paste as Markdown items
pick `Object.values(editorsByContentId).find(Boolean)` (the first registered
editor). In a split layout that can paste into the wrong note. All three new
items and the two existing ones must use `contextEditor` (`editor-actions.tsx`,
the editor resolved from the right-clicked surface).

### D3 — Engine: one shared local engine, bursty lifecycle

Lift `extensions/speed-reader/lib/extractors/ocr.ts` into a shared module
(`lib/features/ocr/`, see §2) and have the speed-reader import it. The module
owns:

- **Lazy spawn.** `await import("tesseract.js")` + `createWorker("eng", …)` on
  the first `recognize()` call. Nothing is loaded at page load. The `tesseract.js`
  entry is 63 KB and only enters a chunk that is fetched on demand.
- **One worker per page**, shared by every caller (paste, context menu,
  speed-reader, co-browse). Concurrent `recognize()` calls queue on the same
  worker; tesseract.js serialises jobs internally.
- **Idle termination.** After `IDLE_MS = 120_000` with no job in flight, call
  `worker.terminate()` and drop the promise so the next call respawns. Paste is
  bursty; the WASM heap is tens of MB and should not sit in an editor tab for
  hours. The speed-reader currently keeps its worker for the page's life; after
  the rewire it inherits the idle timeout, which is fine for a reading session
  (each chunk's OCR happens up front).
- **Fast language pack.** `langPath: "https://tessdata.projectnaptha.com/4.0.0_fast"`
  → 2.0 MB instead of 10.9 MB on first run. Slightly lower accuracy on poor
  scans; negligible on screenshots of rendered text, which is the dominant
  paste case. Cached in IndexedDB afterwards (`cacheMethod` default `"write"`).
- **An engine interface** with one implementation today:

  ```ts
  export interface OcrEngine {
    id: "local";                       // "ai" is a planned second member
    recognize(input: Blob, opts?: { signal?: AbortSignal }): Promise<OcrResult>;
  }
  export interface OcrResult { text: string; confidence: number; engine: OcrEngine["id"]; }
  ```

  The `ai` engine (user's vision-capable connection, precedent:
  `app/api/flashcards/cards-from-media/route.ts` which sends an image file part
  through `generateObject`) is deferred: it needs a configured connection,
  sends the image to a vendor, and costs tokens. The seam exists so it slots in
  behind a future `editor.ocrEngine` setting without touching paste code. **No
  setting ships in v1** — there is nothing to choose between yet.

### D4 — Assets: self-host the executable parts, fetch the data part

tesseract.js loads three remote things: the worker script, the WASM core
(`importScripts` from inside the worker), and the language pack (data,
parsed by the WASM). Decision:

- **Worker + core are served from this origin** under `public/ocr/`, copied
  from `node_modules` by a prebuild script (`scripts/copy-ocr-assets.ts`,
  wired into both `build` and `vercel-build`; `public/ocr/` is gitignored).
  Files: `worker.min.js` plus the LSTM core variants tesseract.js picks between
  via `wasm-feature-detect` — `tesseract-core-{simd-lstm,relaxedsimd-lstm,lstm}.wasm.js`
  and their `.wasm` siblings. Set `workerPath: "/ocr/worker.min.js"`,
  `corePath: "/ocr"` (a directory: the library appends the right variant).
- **Language pack stays on the tessdata CDN** (`4.0.0_fast`, see D3). It is
  data, not code; the embed CSP's `connect-src` already allows https.

Why self-host rather than widen the CSP for jsdelivr: the side panel page
(`/embed/panel`) carries `script-src 'self'` and is the **trust-gated bridge
to `chrome.debugger`**. Third-party executable code must never run there, and
workers cannot carry Subresource Integrity. One asset config is used on every
route so the main app and the panel behave identically. The embed CSP already
has `'unsafe-eval'`, which also satisfies WebAssembly compilation; if that is
ever tightened, `'wasm-unsafe-eval'` is the narrow replacement.

### D5 — Co-browse: `read_screen` reads the bound tab off its pixels

A new `co_browse_act` action for pages whose DOM / accessibility tree is thin
(canvas, image-rendered text, anti-scrape markup):

```
model ──co_browse_act({action:"read_screen"})──▶ engine onToolCall
  ──▶ coBrowseReadScreen()  (lib/domain/browser-extension/co-browse.ts)
    ──▶ panel bridge op "screenshot"  (CO_BROWSE_OPS allow-list, panel/index.js)
      ──▶ background "cobrowse-screenshot": Page.captureScreenshot on the
          BOUND session (not captureVisibleTab — the bound tab may be backgrounded)
      ◀── { dataUrl, width, height, url }
    ◀── (bridge returns fast; well inside its 30 s timeout)
  ──▶ shared OCR engine runs in the panel page (self-hosted assets, D4)
◀── addToolResult({ untrustedWebContent: text, via: "screenshot-ocr", width, height, url })
```

Rules carried over from the agentic-browsing plan:

- Client-executed, no server `execute`, result via `addToolResult`, same
  resume predicate as the other `co_browse_act` actions. The
  `untrustedWebContent` field name is load-bearing for prompt-injection
  defence; keep it.
- OCR runs **after** the bridge call returns, on the app side, so a slow
  recognition can never trip the 30 s panel↔host timeout.
- Viewport only in v1 (`captureBeyondViewport: false`). A full-page strip
  capture composed with the existing `scroll`/`collect` loop is a follow-up.
- The `read_page_headless_or_browser` ladder does **not** gain an automatic
  OCR rung in v1. The model decides *whether* to read the screen; wiring OCR
  as a deterministic last rung ("the code decides how") is a follow-up once a
  thin-extraction heuristic exists.
- Text only. The chat's existing screenshot button already feeds vision
  models; attaching the capture as a multimodal tool output is a separate
  question about AI SDK tool-result media and is out of scope.
- Extension manifest version bump (currently 5.4.0 → 5.5.0) and the
  `CO_BROWSE_OPS` allow-list entry; the op is deliberately **not** relayed by
  `page-bridge.js` (all-pages content script), same as every other `cobrowse-*`.
- **Validate on a backgrounded bound tab**: `Page.captureScreenshot` through an
  attached debugger normally forces a frame, but the Phase-0 lazy-render wall
  and the Vivaldi focus-emulation finding mean this must be smoked, not assumed.

### D6 — OCR text → editor blocks

Tesseract returns one line per visual line, so a wrapped paragraph arrives as
many short lines. `lib/features/ocr/text-to-blocks.ts` applies one rule set:

- A blank line is a paragraph break.
- Inside a paragraph, a single newline **reflows to a space**, unless the next
  line starts with a list marker (`-`, `*`, `•`, `1.`, `a)`), is indented by
  two or more spaces, or the previous line ends a sentence and the next starts
  with a capital **and** the previous line is short (< 40 chars). Those keep
  their line break.
- Collapse runs of three or more newlines to two (the speed-reader already does
  this).
- The resulting text goes through the existing paste path: if
  `isLikelyMarkdown()` is true, `markdownPasteToTiptap()`; otherwise plain
  paragraphs. Lists and headings in a screenshot format themselves for free.

This rule set is the one piece of product judgement in the feature and is the
natural place for the owner to adjust by hand. Pin it with a fixture-based
check (`pnpm ocr:blocks:check`, `scripts/validate-ocr-blocks.ts`, ~10 cases:
wrapped paragraph, bullet list, numbered list, two paragraphs, code-ish
indent) and **mutation-test the gate** before trusting a first-run PASS.

### D7 — UX while recognising

- A toast "Reading text from image…" with tesseract's progress (`logger`
  callback, `status === "recognizing text"` → `progress` 0..1). Dismiss on
  completion.
- Text is inserted at the editor's **current** selection when OCR finishes,
  not at a position captured at paste time (the user may have moved; a stale
  position inserts text out of view). Paste and the clipboard item go through
  `insertContent`; the two image actions address the image node by position
  resolved at completion (re-find the node by `contentId`/`src`; it may have
  moved).
- Empty result on paste: toast "No text found in that image" with an action
  **Paste image instead** that runs the normal upload branch.
- Failure (asset fetch blocked, worker crash): toast with the error and the
  same "Paste image instead" action. Terminate the broken worker so the next
  attempt respawns.
- A second OCR request while one is running just queues; no "busy" state in
  the UI beyond the toast.

---

## 2. Architecture

```
lib/features/ocr/
├── index.ts            # recognize(blob), ocrTextToBlocks(text), OcrEngine types
├── engine.ts           # OcrEngine interface + `getOcrEngine()` (returns local)
├── local-tesseract.ts  # lazy spawn, shared worker, job queue, IDLE_MS termination,
│                       #   workerPath/corePath → /ocr, langPath → 4.0.0_fast
└── text-to-blocks.ts   # D6 rule set (pure, no DOM) — gated by ocr:blocks:check

scripts/copy-ocr-assets.ts       # node_modules → public/ocr (prebuild; gitignored output)
scripts/validate-ocr-blocks.ts   # D6 fixtures

components/content/editor/MarkdownEditor.tsx
  handleDOMEvents.keydown/keyup/blur → shiftHeldRef
  handlePaste: image file + shiftHeldRef → ocrPasteFromFile(file) else existing upload
lib/domain/editor/hooks/use-image-paste.ts   # same branch for the flashcards editor
components/content/context-menu/editor-actions.tsx
  image section: extract-text-from-image, replace-image-with-text
  clipboard section: paste-text-from-image (+ contextEditor fix on paste/paste-markdown)
extensions/speed-reader/lib/extractors/ocr.ts → re-export from lib/features/ocr

extensions/browser-bookmarks/browser-extension/
  src/background/index.js   "cobrowse-screenshot" (Page.captureScreenshot on bound session)
  src/panel/index.js        CO_BROWSE_OPS += "screenshot"
  manifest.json             5.5.0
lib/domain/browser-extension/co-browse.ts    coBrowseReadScreen()
lib/domain/ai/tools/co-browse-tools.ts       action enum += "read_screen" (+ describe())
lib/domain/ai/use-conversation-engine.ts     onToolCall: read_screen → capture → OCR → addToolResult
```

Rules that apply (from CLAUDE.md): the shared module lives in `lib/`, not in
an extension, because two extensions and the shared editor consume it. No new
TipTap node or mark, so no schema bump and no Hocuspocus redeploy. The
`co_browse_act` schema change is additive; run `pnpm ai:drift:check` (prompt
tool references, settings metadata).

---

## 3. Build sequence (three PRs, each independently shippable)

1. **`feat(ocr): shared local engine + self-hosted assets`** — `lib/features/ocr/`,
   copy script + `build`/`vercel-build` wiring, `.gitignore` entry,
   speed-reader rewired, `ocr:blocks:check` gate (mutation-tested). No UX
   change. Smoke: speed-reader OCR of an image still works and the Network
   tab shows `/ocr/worker.min.js` and `/ocr/…wasm` from this origin, the
   language pack from tessdata `4.0.0_fast`; worker terminates ~2 min after
   the last job (visible in the Memory / Workers panel).
2. **`feat(editor): paste an image as its text`** — D1, D2, D6, D7, the
   `contextEditor` fix, the flashcards hook branch. Smoke lines for the PR
   body, one per surface:
   - Cmd+Shift+V with a screenshot on the clipboard → text appears, no image
     uploaded (check the tree: no new file under the note's folder).
   - Cmd+V with the same screenshot → image uploads as before.
   - Right-click an image → Extract text from image → text below, image kept.
   - Right-click an image → Replace image with its text → image gone, text in
     its place, single Cmd+Z restores the image.
   - Paste text from image (context menu) in the **right-hand** pane of a
     split → text lands in that pane's note.
   - Screenshot of a bulleted list → inserts a real bullet list.
   - Safari: Cmd+Shift+V — record whether the paste event fires.
3. **`feat(co-browse): read the bound tab off its pixels`** — D5. Extension
   release. Smoke: bind a tab, switch away from it, ask the AI to "read the
   screen"; result text matches what the tab shows; the panel's Network tab
   shows OCR assets from this origin only (CSP intact).

Each PR: `pnpm typecheck` → `pnpm lint` (ratchet 175, zero new warnings) →
`NODE_OPTIONS='--max-old-space-size=8192' pnpm build`; PR 3 also builds the
extension. Update `STATUS.md` and this file's `status` line per PR.

---

## 4. Deferred (recorded so nobody re-litigates)

- **`ai` engine** behind `editor.ocrEngine` — vision connection, precedent
  in the flashcards media route; needs the capability-flag check
  (`effectiveCapabilities` includes `"vision"`) and a size guard (Vercel body
  limit 4.5 MB → downscale client-side).
- **Full-page co-browse capture** (strips via `Page.getLayoutMetrics` +
  `captureBeyondViewport`, composed with `collect`).
- **OCR as an automatic last rung** of the read ladder when extraction is thin.
- **Multimodal tool output** (hand the screenshot itself to a vision model as
  the tool result) — depends on AI SDK tool-result media support.
- **Self-hosting the language pack** too, if a fully offline / zero-third-party
  build is ever wanted; it is 2 MB and would join `public/ocr/`.
- **Upload-dialog `enableOCR`** (server-side, Node worker files) — separate
  problem, separate fix; a server engine would be a fourth consumer of
  `OcrEngine`, not a reason to change it.
