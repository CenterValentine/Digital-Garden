---
last_updated: 2026-10-08
---

# OCR pipeline — how an image becomes text, and how to tune it

Text recognition runs on the user's device (Tesseract.js in a Web Worker) for
four surfaces: ⇧⌘V on an image, the image right-click actions, the clipboard
menu's *Paste text from image*, and the assistant's `read_image_text` tool.
This guide is for **refining** it: what each stage does, every threshold with
the evidence behind it, and how to measure a change before shipping it.

Decision record (why, in order it happened): `work-tracking/OCR-PASTE-PLAN.md`
D1–D11. Code: `lib/features/ocr/`.

---

## 1. The pipeline, stage by stage

| # | Stage | Where | What it decides |
|---|---|---|---|
| 1 | **Gesture** | `paste-modifier.ts` | ⇧⌘V is watched from keydown; if no paste with content arrives within 80 ms the editor reads the clipboard itself (Chrome sends no usable paste for this chord). |
| 2 | **Engine lifecycle** | `local-engine.ts` | Lazy spawn, one worker per page, 120 s idle termination, whole reads queued one at a time, respawn when the language setting changes. |
| 3 | **Languages** | `languages.ts` | English always; others from `editor.ocrLanguages` (Settings → Editor & Files → Text recognition). |
| 4 | **Preprocess** | `preprocess.ts` | Grayscale; invert if the median luminance is dark; upscale narrow images. |
| 5 | **Layout mode** | `preprocess.ts` + `local-engine.ts` | Read in normal layout (PSM 3); below 85 confidence, re-read in sparse layout (PSM 11) and keep the more confident read. |
| 6 | **Tables** | `table.ts` | Cells split at gaps wider than 1.2 word heights; ≥ 3 consecutive rows whose cells fall in distinct columns become a markdown table (→ a real table node). |
| 6b | **Reading order** | `layout.ts` | No table: if most lines are 1–2-word fragments, rebuild rows from word boxes (Tesseract reads aligned short words as columns). |
| 7 | **Reflow** | `reflow.ts` | Which line ends are word-wraps and which are real breaks; bullets and `1)` → markdown; hyphenated wraps rejoined. |
| 8 | **Into the editor** | `to-content.ts`, `editor-ocr.ts` | Markdown-looking text through the editor's own paste parser, else plain paragraphs; inside a code block the raw lines. |

Stages 4–6 are the accuracy levers; 6 and 7 are the structure levers.

### The AI path (⌥⌘V / Ctrl+Alt+V)

A second engine for what the local one cannot do. It shares stages 1 and 8
and replaces 2–7 with one model call:

| Stage | Where | What it does |
|---|---|---|
| Gesture | `paste-modifier.ts` `isAiPasteChord` | Physical V key with ⌥⌘ / Ctrl+Alt, not Shift, not AltGr; reads the clipboard at once. Also: editor context menu → *Paste text from image with AI*. |
| Model | `lib/domain/ai/features/registry.ts` → `image-text` | Settings → AI → Feature Routing → *Read Text in Images (AI)*; requires vision. Unrouted: registry default, then the first vision-capable model connected. |
| Upload | `ai-engine.ts` | Images over 3.5 MB shrink to ≤ 2400 px JPEG (Vercel caps bodies at 4.5 MB; the route accepts ≤ 4 MB). |
| Read | `app/api/ai/image-text/route.ts` | One `generateText` call; the instructions ask for markdown — tables as tables, code/terminal in fences, icons ignored, nothing translated. **Tune the AI's behaviour here.** |
| Into the editor | `to-content.ts` `buildAiContent` | Straight to the paste parser — no reflow (it would mangle code fences). |

The image leaves the device on this path. The first AI read in a browser
names the provider and model that read it (`editor-ocr.ts`,
`dg:ocr-ai-notice-shown`).

---

## 2. Every tunable, with its evidence

| Constant | File | Value | Evidence | Raise / lower it and… |
|---|---|---|---|---|
| `DARK_BACKGROUND_BELOW` | `preprocess.ts` | 128 | White-on-blue chat bubble: 25% → 0% error when inverted | Higher inverts mid-gray UIs that read fine as is. |
| `TARGET_WIDTH`, `MAX_SCALE` | `preprocess.ts` | 1600 px, 3× | Dark sidebar list: 44% → 31% | More scale = slower, little gain past 3×; slightly hurt one address-bar image (16% → 23%). |
| `SPARSE_PASS_BELOW` | `preprocess.ts` | 85 | Prose reads at 92–95 (one pass); UI list 72 → sparse 80, error 31% → 14%; 90 gave identical results | Higher = more second passes (≈ +1 s each) on ordinary screenshots. |
| `FRAGMENT_MAX_WORDS`, `FRAGMENTED_SHARE`, `FRAGMENTED_MIN_LINES` | `layout.ts` | 2, 60%, 4 | Terminal output 64% → 10% | Looser rules risk interleaving a real two-column article. |
| `COLUMN_GAP_HEIGHTS` | `table.ts` | 1.2 word heights | Word spacing is a fraction of a letter's height; synthetic tables split cleanly | Lower splits ordinary words into cells; higher merges narrow columns. |
| `MIN_TABLE_ROWS`, `MIN_COLUMNS` | `table.ts` | 3, 2 | A header plus two rows is the smallest table worth structuring | — |
| `MAX_WORDS_PER_CELL` | `table.ts` | 5 (median) | A two-column article stayed text | Higher risks turning two prose columns into a "table". |
| `ICON_COLUMN_CONFIDENCE` | `table.ts` | 50 | The sidebar list's icon column read at low confidence and is dropped, so the list stays a list | Higher may drop a real column of short codes. |
| `TALL_WORD` | `layout.ts` | 1.5× median | Three stacked ✓ read as one tall "NNN" had merged three rows | — |
| `PARAGRAPH_GAP_ROWS` | `layout.ts` | 1.6 rows | — (geometry convention) | — |
| `SHORT_LINE_RATIO`, `MIN_WRAP_WIDTH` | `reflow.ts` | 0.6, 40 chars | A line stopping well short of the column is a real break (heading, sign-off) | See the 17 reflow fixtures before changing. |
| `PASTE_EVENT_GRACE_MS` | `paste-modifier.ts` | 80 ms | Paste events fire synchronously after keydown | Longer only delays the fallback. |
| `OCR_IDLE_MS` | `local-engine.ts` | 120 s | Owner: "bursty start, idle termination" | Shorter re-downloads nothing (HTTP cache + IndexedDB) but re-compiles WASM (~1 s). |

Rejected, with numbers (do not retry without new evidence): Sauvola
thresholding (`thresholding_method=2`) — bubble 0% → 100%, list → 99%; a
word-confidence filter at 60 — dropped real words; always-sparse layout —
same list gain but worse on the address bar.

---

## 3. Measuring a change

```bash
pnpm ocr:assets
pnpm ocr:accuracy --show
pnpm ocr:accuracy --dir ~/ocr-samples --show
```

`scripts/ocr-accuracy.mjs` runs the shipped engine in headless Chromium and
prints each image's character error rate (whitespace-normalised Levenshtein ÷
truth length), its confidence and the layout mode that won. Built-in cases are
synthetic (paragraph light/dark, terminal, three-column table, Spanish with and
without the pack). `--dir` adds every `name.png` with a `name.txt` truth file
beside it — keep real screenshots in a local folder, never in the repo.

Baseline on 2026-10-08:

| Case | Error |
|---|---|
| Paragraph, light / dark | 0% / 0% |
| Terminal | 10% (✓ marks read as stray letters) |
| Three-column table | 0%, pasted as a real table |
| Table with an empty cell | 0%, empty cell kept |
| Two-column article | not mistaken for a table |
| Spanish, English only / + Spanish | 8% / 0% |

The owner's real screenshots (2026-10-08) measured the same way: console
error 0%, white-on-blue bubble 0%, dark sidebar list 14%, address bar 23%.

**Refining safely:** measure before and after with `ocr:accuracy`; keep
`pnpm ocr:blocks:check` green (it pins every threshold above); for a new rule,
mutation-test the gate — break the rule on purpose and confirm the check fails.

---

## 4. Known limits, and which remedy fits

| Symptom | Cause | Remedy |
|---|---|---|
| "DB Al" for "DB AI", `|` for `I` | Look-alike glyphs in sans-serif UI fonts | None locally; a vision model |
| Stray letters from icons and ✓ marks | Tesseract reads any glyph as text | None locally; a vision model |
| A table pastes as flat lines | A cell wraps onto a second line, or the table has fewer than three rows | Local detection handles clean single-line cells (`table.ts`); wrapped cells need a vision model |
| Two prose columns come back interleaved line by line | Tesseract's own reading order for side-by-side text columns | A vision model |
| Sideways phone photos | No orientation detection | Try 90/180/270° on very low confidence (not built; see plan) |
| Handwriting, stylised fonts | Outside Tesseract's training | A vision model |
| Accents dropped | Language pack not enabled | Settings → Text recognition |

"A vision model" in this table means ⌥⌘V (Ctrl+Alt+V): the `ai` engine,
routed in Settings → AI → Feature Routing.
