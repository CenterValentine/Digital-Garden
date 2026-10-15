---
last_updated: 2026-10-06
status: built on `feat/ocr-paste` (engine, editor surfaces, AI read_image_text) — gates green, owner smoke pending, not pushed; co-browse read_screen backlogged
---

# OCR paste — paste an image, keep only its text

> **Tuning or refining the pipeline?** Start with the guide, `docs/notes-feature/guides/editor/OCR-PIPELINE.md`: every stage, every threshold with its evidence, and how to measure a change (`pnpm ocr:accuracy`). This file is the decision record.

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
  `eng.traineddata.gz` 2.9 MB (`4.0.0_best_int`, v7's LSTM default; the 10.9 MB `4.0.0` pack is legacy-engine only).
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

**Shift detection (as built).** One window-level tracker
(`lib/features/ocr/paste-modifier.ts`): capture-phase `keydown`/`keyup` record
`event.shiftKey`, window `blur` clears it. A ClipboardEvent carries no
modifier state, so the last key event decides. Chosen over per-editor
`handleDOMEvents` because the flashcards editor's shared hook has no DOM-event
seam, and one tracker serves both. Not `view.input.shiftKey` — internal to
prosemirror-view, not public API.

**Correction (owner smoke, 2026-10-08): the chord cannot rely on a paste
event.** In Chrome on macOS, ⇧⌘V with a screenshot did nothing — the paste
handler never saw the image (no event, or one without the file). The
assumption that Chrome delivers the image on a Shift paste was never tested
and was wrong. Fix (`paste-modifier.ts`): the editor's `handleKeyDown` watches
the chord. After an 80 ms grace it checks whether a paste event **with
content** arrived (`notePasteEvent(event)` in each paste handler; an empty
event does not count). If one did, the paste handler owns it. If not, the
editor does "paste as text" itself: `navigator.clipboard.read()`, an image
goes to OCR, otherwise `text/plain` goes through `view.pasteText`. The
clipboard is read only when no paste arrived, so Chrome's one-time clipboard
permission prompt appears on the first image ⇧⌘V and never interrupts a
paste the browser handled. Headless Chromium cannot reproduce the real chord
(Playwright maps only ⌘V to a paste on macOS), so the logic was verified in
Chromium by simulating each outcome: image with no event, text with no event,
event with text, empty event with an image, and plain ⌘V (5/5).

**Safari** behaviour for the chord is still unverified; whichever of the two
outcomes it produces, one of the paths above handles it.

### D2 — Fallback surfaces: two image actions and one clipboard action

Right-click on an image node in the editor:

1. **Extract text from image** — runs OCR on the image, inserts the text as
   blocks *after* the image node, keeps the image.
2. **Replace image with text** (renamed from "…with its text", owner 2026-10-09) — the extract-and-destroy variant: same
   OCR, then one transaction replaces the image node with the text blocks. If
   OCR returns nothing, do nothing destructive: toast "No text found", image
   stays.

Both fetch the image bytes from the node's own `src` (the
`/api/content/content/{id}/download?stream=true` URL for uploaded images,
the URL itself for `source:"url"` images). No clipboard involved, so these
work in every browser and are the robust path.

Clipboard section, beside "Paste as Markdown":

3. ~~**Paste text from image**~~ — **removed 2026-10-09 (owner):** the menu cannot tell whether the clipboard holds an image without reading it, so the item usually did nothing; ⇧⌘V / ⌥⌘V carry the action. As built until then: `navigator.clipboard.read()`, take the first
   `image/*` item, OCR, insert at the context editor's selection. Read the
   clipboard **before** awaiting the engine import: the read must happen inside
   the user gesture or Safari voids it. A refused read gets its own message
   pointing at ⇧⌘V (`clipboardBlockedGuidance()` points at the markdown
   toast, which is the wrong fallback for an image).

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
- **Language pack: v7's own LSTM default, pinned.** `langPath:
  "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int"`
  (2.9 MB gzipped). *Corrected 2026-10-06 during the build:* the 10.9 MB
  figure first measured is the legacy+LSTM pack, which v7 only loads for the
  legacy engine; for LSTM-only it already defaults to `4.0.0_best_int`. The
  `4.0.0_fast` pack (2.0 MB) would save ~1 MB at lower accuracy, so it was
  dropped. Pinning `@1.0.0` makes the URL immutable. Cached in IndexedDB
  afterwards under the same key the speed reader already used, so a user who
  ran the speed reader never downloads it again.
- **An engine interface** with one implementation today:

  ```ts
  export interface OcrEngine {
    id: "local";                       // "ai" is a planned second member
    recognize(image: Blob, opts?: { onProgress?: (p: OcrProgress) => void }): Promise<OcrResult>;
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
  from `node_modules` by `scripts/copy-ocr-assets.mjs` (`public/ocr/` is
  gitignored). Files: `worker.min.js` plus the LSTM core variants tesseract.js
  picks between via `wasm-feature-detect` —
  `tesseract-core-{relaxedsimd-lstm,simd-lstm,lstm}.wasm.js`. Each `.wasm.js`
  embeds its WASM inline, so the `.wasm` siblings are not copied; a browser
  downloads exactly one variant (3.9 MB). Set `workerPath:
  "/ocr/worker.min.js"`, `corePath: "/ocr"` (a directory: the library appends
  the right variant), and **`workerBlobURL: false`** — by default tesseract.js
  spawns the worker from a `blob:` URL, which `script-src 'self'` blocks just
  as it blocks a CDN. The copy (`pnpm ocr:assets`, idempotent, plain Node)
  runs from `dev`, `build`, `vercel-build` and the app `Dockerfile` — every
  entry point that serves `public/`. **Not from `postinstall`** (tried first,
  reverted during the build): both Dockerfiles run `pnpm install` before
  `COPY . .`, so the script is not in the image yet and the hook would fail
  the Hocuspocus image build. ESLint ignores `public/ocr/**` (minified
  third-party code; CI installs before linting).
- **Language pack stays on the CDN** (jsdelivr, pinned, see D3). It is
  data, not code; the embed CSP's `connect-src` already allows https.

Why self-host rather than widen the CSP for jsdelivr: the side panel page
(`/embed/panel`) carries `script-src 'self'` and is the **trust-gated bridge
to `chrome.debugger`**. Third-party executable code must never run there, and
workers cannot carry Subresource Integrity. One asset config is used on every
route so the main app and the panel behave identically. The embed CSP already
has `'unsafe-eval'`, which also satisfies WebAssembly compilation; if that is
ever tightened, `'wasm-unsafe-eval'` is the narrow replacement.

### D5 — Co-browse: `read_screen` reads the bound tab off its pixels

> **POSTPONED (owner, 2026-10-06).** The AI co-browsing / scraping slice waits
> on another feature. Rule: if that feature is built by the time the rest is
> written, this is built in the same run; otherwise it moves to the backlog
> unchanged. **Outcome: backlogged** — the prerequisite was not built in this
> run. The owner then clarified that the AI reading *images* is wanted now and
> is separable from co-browsing; that became D8, built. The design below stays
> as the record of what this slice will be.

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
many short lines. `lib/features/ocr/reflow.ts` (`reflowOcrText`) decides, per
line end, wrap or real break. **As built:**

- A blank line is a paragraph break.
- A new list item always starts its own line. Bullet glyphs (`•`, `▪`, `–` …)
  become `- `; `1)` becomes `1.` — the paste detector only knows markdown forms.
- A wrapped list item's continuation lines join the item (they carry no
  marker, so the rule looks at the item being built, not the raw line).
- **A line that stops well short of the block's column** (< 60% of its longest
  line, in blocks ≥ 40 chars wide) is a real break: headings, address lines,
  sign-offs. This replaced the planned "indented by two spaces" rule —
  Tesseract's plain-text output does not keep indentation.
- In narrow blocks, a short line ending a sentence before a capitalised line
  is a real break.
- `infor-` + `mation` rejoins without the hyphen.
- Consecutive markdown list items stay on adjacent lines (one list); every
  other kept break becomes a paragraph break, because a single newline in
  markdown renders as a space.
- The result goes through the existing paste path (`buildOcrContent`): if
  `isLikelyMarkdown()` is true, the editor's own `markdownPasteToTiptap()`;
  otherwise plain paragraphs. The parser is a parameter so the gate can bind a
  tsx-safe twin.

This rule set is the one piece of product judgement in the feature and the
natural place to tune by hand. Pinned by `pnpm ocr:blocks:check`
(`scripts/validate-ocr-blocks.ts`, 17 fixtures, each naming the rule it pins),
in `quality.yml`'s Markdown job. **Mutation-tested: 13 mutants, all killed** —
the first run let two survive (the short-sentence rule masked a broken
paragraph split; the parser-fallback hard breaks had no fixture), and both got
fixtures.

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
- Inside a code block, paste inserts the raw recognised lines (a code
  screenshot's line breaks are the content), never reflowed prose.

### D8 — The AI reads the text in images (built; owner, 2026-10-06)

The owner separated this from co-browsing: the assistant should be able to
read images now. Two pieces, because the first finding was that **the AI
could not see images at all** — `extractSearchTextFromTipTap` drops image
nodes, so `read_content` on a note holding a screenshot returned the
surrounding text and nothing to say an image was there.

1. **`read_content` names a note's images** — name and content id, after the
   note text (`lib/domain/content/note-images.ts`). Private content is
   stripped first; the file is a registered `private:content:check` seam with
   a behavioural check (an image in a private block is never listed). An
   image *file* with no extracted text now points at the tool instead of
   "attach it".
2. **`read_image_text({ contentId })`**, a CLIENT-executed tool (no server
   `execute`). The engine's `onToolCall` downloads the image through the
   authenticated download route (the embed layout's fetch bridge covers the
   side panel) and reads it with the shared local engine
   (`lib/features/ocr/read-for-model.ts`). Text comes back as
   `untrustedImageText` (prompt-injection labelling, like
   `untrustedWebContent`), with the mean confidence and a note when it is low,
   empty, truncated, or failed. It never throws.

Gating and discovery:

- Registered only when the request body says `localOcrAvailable` (a browser
  with Worker + WebAssembly), sent on both the resolver body and every
  per-call body. A headless caller is never offered a tool nothing would run.
- **User-configurable** (Settings → AI tools → Core), unlike the browser
  tools, which are harness-internal because the extension's own trust settings
  are their off-switch. This one has no other off-switch.
- `read_content` mentions the tool only when it is registered **and enabled**
  this turn (`ToolExecuteContext.imageTextReadable`, set after tool filtering).
- In the `reading` family of the tool menu, summonable — not core. Its schema
  costs nothing on turns that never touch an image.
- Resume predicate (`lastMessageHasResolvedBrowserRead`), the run inspector's
  client-executed set, the drift gate's client-tool enumeration, the dev
  tool-prefix route and the chat chip all know it. Drift-gate and
  private-content extensions mutation-tested (5 mutants, all killed).

Why local OCR and not a vision model: it works with text-only models, costs no
tokens to recognise, and the image never leaves the device for this. The
vision-model engine stays the planned second `OcrEngine` member (§4).

**D8 addendum — mentioned and open image files (owner smoke, 2026-10-09).**
A chat open on a PNG book cover answered "no text content available", even
when the file was @-mentioned. The chat route renders mentioned and bound
items itself (route.ts, the mention sections); an image file with no stored
text fell through to the generic "(no text content available)", so the model
reported the file empty and never called the tool. Now described by
`describeImageMention` (read-image-text.ts): "Image file (<mime>, contentId
…)" plus an instruction to call read_image_text before answering — or, when
the tool is not offered, to say it cannot read images. Gate: 2 mutants killed.
**Not addressed:** "what does it show" about a PICTURE (the boar on the
cover) needs vision, not OCR — read_image_text reads words only. Sending a
mentioned image to a vision-capable chat model as an image part is the
follow-up (a provider-payload change; see BACKLOG).

### D9 — Reading hard screenshots: preprocess, then pick the layout mode (owner smoke, 2026-10-08)

The first build read prose perfectly but missed a white-on-blue chat bubble
entirely and read a dark UI list as icon noise. Measured on six images (the
owner's three screenshots, the owner's address-bar screenshot, and a wrapped
paragraph rendered light and dark), character error on whitespace-normalised
text:

| Setting | Para light | Para dark | Address bar | Console | Bubble | List | Mean |
|---|---|---|---|---|---|---|---|
| First build | 0% | 0% | 20% | 0% | 25% | 46% | 15.1% |
| Invert dark backgrounds | 0% | 0% | 16% | 0% | 0% | 44% | 10.1% |
| + upscale | 0% | 0% | 23% | 0% | 0% | 31% | 9.0% |
| + always sparse mode (PSM 11) | 0% | 0% | 28% | 0% | 0% | 14% | 7.0% |
| **+ sparse only below 85 confidence (shipped)** | 0% | 0% | 23% | 0% | 0% | 14% | **6.2%** |

Rejected: Sauvola thresholding (`thresholding_method=2`) wrecked the bubble
and the list (100% / 99%); a word-confidence filter dropped real words.

Shipped (`lib/features/ocr/preprocess.ts`, thresholds pinned by
`ocr:blocks:check`, 7 mutants killed): grayscale; invert when the median
luminance is below 128; upscale narrow images toward 1600 px (≤3×); read in
normal layout (PSM 3); if the mean confidence is below 85, re-read in sparse
layout (PSM 11) and keep the more confident read. Whole reads are queued,
because the second pass changes a worker-wide parameter (two concurrent reads
verified to keep their own modes). The bundled shipped engine reproduces the
6.2% mean exactly.

Known limits (font, not settings): capital I / lowercase l / pipe look alike
in many sans-serif UI fonts ("DB Al"); tightly spaced labels can lose a space;
badge icons can leak a stray character. The vision-model engine (§4) is the
route for UI screenshots that must be exact.

### D10 — Languages are a setting (owner, 2026-10-08)

Settings → Editor & Files → **Text recognition**: English is always on;
Spanish, French, German, Portuguese, Italian and Dutch are switches
(`editor.ocrLanguages`, written through the settings store's editor setter).
The engine reads the setting on every read and respawns its worker when the
set changes. Packs come from tesseract.js's per-language default URL
(`@tesseract.js-data/<code>/4.0.0_best_int`, 0.7–3.0 MB each, all at 1.0.0
on 2026-10-08) — the earlier `eng@1.0.0` pin was one base URL and could not
serve a second language. Measured: a Spanish sentence read with English only
lost every accent and ñ (8% error); with Spanish on, exact (0%), fetching only
the Spanish pack.

### D11 — Reading order for tables and terminal output (owner smoke, 2026-10-08)

Six terminal lines "✓ Compiled in 135ms" came back as three columns
("Compiled Compiled …"). Tesseract's normal layout mode read them that way at
86 confidence — no second pass was involved, and confidence cannot see order.
`lib/features/ocr/layout.ts`: when at least 60% of at least four lines are
one- or two-word fragments, the page is rebuilt row by row from word boxes;
prose, including a true two-column article, keeps Tesseract's order. Words
taller than 1.5× the median (glued glyphs such as three ✓ read as "NNN")
cannot stretch a row. Terminal case 64% → 10%; every other test image
unchanged. Gate mutation run: 7 killed, after fixing two weak fixtures and
removing one redundant filter.

### D12 — Tables become tables, locally (owner, 2026-10-09)

The owner's biggest issue: a three-column table pasted as flat lines.
Measured, Tesseract read every word and row correctly (0% character error) —
only the columns were lost. `lib/features/ocr/table.ts` recovers them from
word boxes: a gap wider than 1.2 word heights ends a cell; the most common
multi-cell count defines the columns; three or more consecutive rows whose
cells fall in distinct columns become a GFM markdown table, which the
editor's own paste parser turns into a table node (gate-verified). A missing
cell stays empty. Guards: median cell ≤ 5 words (a two-column article stays
text) and low-confidence glyph columns dropped (the owner's sidebar list
stays a list). Reflow passes table blocks through; the speed reader flattens
them to comma-separated rows. Gate: 12 checks, 9 mutants killed. Not
handled: cells that wrap onto a second line — the vision-model path.

**D12 addendum — wrapped cells (owner smoke, 2026-10-09).** A table whose
cells wrap onto two lines came back 3/12 cells right: each visual line was a
row, and a line with text in one column ("Keep them concise and clear.")
ended the table. Rows now span lines: a line within 1.25× of the table's
tightest spacing continues the row above (appending to its columns, even
one column only); a wider step starts a row that needs two columns of text.
Continuations apply only when the table has two spacings, measured below
multi-column lines, so a title above evenly spaced rows cannot merge them.
A cell must sit inside its own column on both sides (a note under the table
stays text — found by a new gate check, which failed on the first fix).
Hyphenated wraps rejoin with the hyphen. The prose guard became "short cells
OR a short header row". Owner's table: 12/12; harness gains a cell score and
a synthetic wrapped table. Gate: 10 row-rule mutants + 8 earlier, all killed.

### D13 — ⌥⌘V reads with the user's AI model (owner, 2026-10-09; stub)

Owner: a separate special-paste shortcut for an AI model the user designates.
**Chord: ⌥⌘V (Ctrl+Alt+V)** — "Paste Special" in Office, unbound in the app
and the browsers, fires no native paste (the clipboard is read directly).
Rejected: ⌥⇧⌘V (macOS Paste and Match Style — the browser pastes first).
Matched on `event.code` (Option rewrites `event.key` on a Mac); skipped
when `getModifierState("AltGraph")` (AltGr+V types a character on some
Windows layouts).

**Designation reuses Feature Routing**: a `image-text` feature requiring
`vision` — no new setting UI; the user picks the model where every other
AI feature's model is picked. The Text recognition section links there.
Server: `POST /api/ai/image-text` (multipart, ≤ 4 MB; client shrinks larger
images). The model returns markdown, which skips the local reflow. First use
names the provider. Also in the editor context menu and the flashcards
editor. Gate: chord and content rules, 4 mutants killed.

**Stub limits (deliberate):** no per-call usage/cost record beyond what the
provider bills; no "Read with AI" upgrade action on a local result's toast;
no AI variants of the image right-click actions; no fallback chain across
routed models (`resolvePrimaryRoute` only). Verified by typecheck, gates and
the chord/content checks — **not yet exercised against a live model**.

### D14 — No text is no text; the menu keeps only image actions (owner, 2026-10-09)

An image of four toolbar icons pasted as "Igy] OF". Measured: 31 confidence;
every real screenshot 76 or higher. A best read below **50** (`NO_TEXT_BELOW`)
is now reported as no text — the editor shows "No text found" with "Paste
image instead"; `read_image_text` answers "no readable text". Gate: 3 mutants
killed. Also: "Replace image with its text" → "Replace image with text", and
the two clipboard items ("Paste text from image", "…with AI") left the
context menu (see D2 item 3).

### Not built — rotation detection

Tesseract's own orientation detector (PSM 0/1/12, `worker.detect()`) needs
the legacy engine core and the `osd` pack — several MB more on first use,
beyond what an English-only reader downloads. The cheaper route, when wanted:
only for very low first-pass confidence, try the image turned 90° / 180° /
270° and keep the most confident read.

---

## 2. Architecture (as built)

```
lib/features/ocr/                     # client-only; importing it loads nothing heavy
├── index.ts          # barrel: getOcrEngine(), ocrTextToContent(), isLocalOcrSupported()
├── types.ts          # OcrEngine / OcrResult / OcrProgress — "local" today, "ai" planned
├── local-engine.ts   # lazy spawn, ONE shared worker, per-job progress routing,
│                     #   OCR_IDLE_MS = 120 s termination, failed spawn self-clears;
│                     #   /ocr worker+core, workerBlobURL:false, pinned jsdelivr lang pack
├── reflow.ts         # D6 rule set (pure) — pinned by ocr:blocks:check
├── to-content.ts     # buildOcrContent(raw, parser) — parser injected (tsx-safe gate)
├── paste-modifier.ts # window-level Shift tracker for ⇧⌘V (D1)
├── editor-ocr.ts     # pasteImageAsText / pasteClipboardImageAsText / imageNodeToText
└── read-for-model.ts # client half of read_image_text (D8); never throws

scripts/copy-ocr-assets.mjs     # node_modules → public/ocr (gitignored, eslint-ignored)
scripts/validate-ocr-blocks.ts  # pnpm ocr:blocks:check — 17 fixtures, quality.yml

components/content/editor/MarkdownEditor.tsx    # ⇧ + image paste → OCR (ref, frozen-closure safe)
lib/domain/editor/hooks/use-image-paste.ts      # same branch for the flashcards editor
components/content/context-menu/editor-actions.tsx
  image section:     Extract text from image · Replace image with text
  clipboard section: Cut/Paste/Paste as Markdown/Insert Template/Insert Snippet → contextEditor
extensions/speed-reader/lib/extractors/ocr.ts   # thin adapter; no terminate (shared worker)

lib/domain/ai/tools/read-image-text.ts   # client-safe contract (name, schema, description)
lib/domain/content/note-images.ts        # listNoteImages — private-content seam
lib/domain/ai/tools/registry.ts          # readImageTextTool; read_content lists images
app/api/ai/chat/route.ts                 # localOcrAvailable gate; imageTextReadable
lib/domain/ai/use-conversation-engine.ts # body flag ×2, resume predicate, onToolCall
lib/domain/ai/tools/{metadata,menu}.ts   # user-configurable; reading family
```

No new TipTap node or mark: no schema bump, **no Hocuspocus redeploy**. The
Hocuspocus image is unaffected (the asset copy is not in `postinstall`).

---

## 3. Build sequence (as built — one branch, `feat/ocr-paste`)

| Commit | Slice |
|---|---|
| `01ddcf19` | Shared engine + self-hosted assets + reflow gate; speed reader rewired |
| `17f1ead9` | Two fixtures added after the first mutation run |
| `4086503f` | Editor: ⇧⌘V, image context actions, clipboard item, contextEditor fix |
| `e0778d22` | AI: `read_image_text` + `read_content` lists images |
| later | Lint ignore for `public/ocr`; asset copy moved out of `postinstall` |

Co-browse `read_screen` (D5): **backlogged**, see the D5 note.

**Smoke lines (owner, in the browser):**

- [ ] ⇧⌘V with a screenshot on the clipboard → its text appears; no image file is created in the tree.
- [ ] ⌘V with the same screenshot → the image uploads as before.
- [ ] Right-click an image → Extract text from image → text below it, image kept.
- [ ] Right-click an image → Replace image with text → image replaced; one ⌘Z brings it back.
- [ ] ⇧⌘V in the **right** pane of a split → text lands in that pane's note.
- [ ] Screenshot of a bulleted list → a real bullet list.
- [ ] Network tab on first use → `/ocr/worker.min.js` and one `/ocr/tesseract-core-*.wasm.js` from this origin, `eng.traineddata.gz` from jsdelivr; nothing on later uses until ~2 min idle, then the worker is gone.
- [ ] AI chat on a note holding a screenshot: "what does the image say?" → `read_content` lists the image, `read_image_text` returns its text, the chip reads "Read text in an image (N characters)".
- [ ] Side panel (extension): the same AI question works there (embed CSP + fetch bridge).
- [ ] Safari: ⇧⌘V — record whether the paste event fires; if not, the context-menu item is the path.

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
  build is ever wanted; it is 2.9 MB and would join `public/ocr/`.
- **Upload-dialog `enableOCR`** (server-side, Node worker files) — separate
  problem, separate fix; a server engine would be a fourth consumer of
  `OcrEngine`, not a reason to change it.
