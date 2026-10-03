---
status: parked 2026-10-02 — owner redirected toward making the existing provider editors (Google Sheets first) lighter and better integrated instead of a native editor; scope to follow. §2 (codebase map, incl. the Google-link staleness bug), §3 (library review) and §5b (Google sync) remain the reference. S0 (retire `xlsx@0.18.5`) still stands on its own.
created: 2026-10-02
---

# Native spreadsheets: an `.xlsx` you can open, calculate and edit without leaving Digital Garden

A spreadsheet in Digital Garden is a **file**. It already is — `.xlsx` and `.xls`
uploads are `file` nodes whose bytes live in `FilePayload` → R2 — and the only thing
missing is a renderer that belongs to us. Today
`components/content/viewer/OfficeDocumentViewer.tsx` hands the file to Google
Sheets, ONLYOFFICE (self-hosted), the Microsoft Office Online viewer (needs a public
URL) or a download button. This plan adds a **native** rung: the bytes are parsed by
a formula engine, drawn in a grid we own, edited in place, and serialized back to
the same `.xlsx` bytes through the same upload path. Every other reader stays
compatible because **the file is the format**; there is no Digital-Garden document
model for a spreadsheet, and no new `ContentType`, payload, migration or server.

Decisions of record (owner, 2026-10-02): build our own UI on an accelerating grid
library rather than embed Univer; no GPL (HyperFormula/Handsontable relicense the
shipped client and collide with App Store distribution of the mobile shell);
legacy `.xls` must open.

---

## 1. Judged against the product principles

- **Principle 1: the user's structure is the path of least resistance.** A
  spreadsheet is the user's own `.xlsx` in the user's own folder. No "Sheets"
  library, no parallel container, no conversion on upload. A `.xls` stays a `.xls`
  in the tree; we convert in memory to read it and offer "Save as .xlsx" as a new
  sibling, never a silent rewrite (§5).
- **Principle 2: unrefined → structured.** A spreadsheet is the archetypal
  *unrefined* grid. The loop this plan prepares, without building it, is
  "range → database rows" (§9 follow-ups): the engine already gives us typed,
  computed cell values, which is what `lib/domain/data/import.ts` wants.
- **Extension-gating ladder.** No extension. This is a viewer for an existing
  content type plus an engine library; it lives in `components/content/viewer/`
  and `lib/domain/spreadsheet/`. Nothing here needs typed data of its own,
  shell surfaces, or runtime contributions. If a later phase adds a slash
  command or a database bridge, revisit — not before.

## 2. What exists today (codebase map, 2026-10-02)

| Need | State | Where |
|---|---|---|
| Spreadsheet content type | None. `.xlsx`/`.xls` are `file` nodes (`FilePayload`). | `prisma/schema.prisma` `ContentType`; `FileViewer.tsx` L244 routes `ms-excel`/`sheet` MIME to `OfficeDocumentViewer` |
| Office viewer ladder | Google Sheets → ONLYOFFICE → Microsoft viewer → mammoth (docx) → download. Selected by a persisted user setting. | `OfficeDocumentViewer.tsx`; `state/upload-settings-store.ts` (`OfficeViewerMode = 'google-docs' \| 'onlyoffice' \| 'microsoft-viewer'`) |
| Save path for edited office files | ONLYOFFICE callback downloads the edited file and re-uploads it to storage. | `app/api/onlyoffice/callback/route.ts` |
| Google Sheets path | Uploads the file to the user's Drive **converted to a native Google Sheet** (`convert=true`, MIME → `application/vnd.google-apps.spreadsheet`), stores `externalProviders.googleDrive.fileId` in `FilePayload.metadata`, embeds the Sheets editor. **Edits persist in Drive only. Nothing exports back to storage** — `lastSynced` is declared and never written. The R2 bytes are frozen at upload time once a file has been opened in Google mode. | `GoogleDriveEditor.tsx`; `app/api/google-drive/upload/route.ts` L93–L210; `lib/domain/content/metadata-types.ts` |
| Blank workbook creation | `xlsx@0.18.5` (SheetJS CE, frozen on npm, **two unfixed high CVEs**: CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS) | `lib/features/office/blank-document-generator.ts`; `app/api/content/content/create-document/` |
| Formula evaluation anywhere | **None.** The database `formula`/`rollup`/`lookup` column types are declared ("computed on read") with no evaluator. | `schema.prisma` L1506; `lib/domain/data/` only lists the type in tier arrays |
| Grid rendering | `@tanstack/react-virtual` (headless), `react-arborist` (tree). No spreadsheet grid. | `package.json` |
| Save-conflict guard | Canonical `bodyHash` compare for notes. Reusable for file bytes. | `state/save-conflict-store.ts`, `components/content/content/SaveConflictBanner.tsx` |
| Upload path | initiate (presigned) → finalize; simple upload for small files; checksum dedupe. | `app/api/content/content/upload/*` |

## 3. Libraries (reviewed 2026-10-02; the review is in the session that produced this plan)

| Role | Choice | License | Why this one |
|---|---|---|---|
| Formula engine **and** `.xlsx` codec | **IronCalc** — `@ironcalc/wasm-xlsx` (browser), `@ironcalc/nodejs` (server, later) | MIT / Apache-2.0 | Owns all five engine concerns (parser, dependency graph, reference shifting on row/column ops, number formatting, codec) in one package, so there is no translation layer where a style or defined name can be lost. `UserModel` exposes `setUserInput` / `getFormattedCellValue` / undo / redo / range ops — exactly the grid contract. 300+ functions, named ranges, cross-sheet refs, dynamic arrays, i18n. Pre-1.0 (0.8.x), NLnet-funded, adopted by Macro and Nessie in 2026. |
| Grid | **Glide Data Grid** — `@glideapps/glide-data-grid` | MIT | Canvas-rendered, headless about data, ships selection/ranges, editing overlay, clipboard, column resize/reorder, custom cell renderers, theme object (feeds Liquid Glass tokens). 6.0 added iOS kinetic scrolling and touch-adaptive selection — relevant to the mobile shell. |
| Legacy `.xls` (BIFF) reader | **SheetJS CE 0.20.x** from `cdn.sheetjs.com` (tarball dependency; CE is still Apache-2.0 and maintained there, just not on npm) | Apache-2.0 | The only maintained open-source BIFF reader. 0.20.x fixes both CVEs that 0.18.5 carries. Lazy-loaded only when a `.xls` opens; never on the common path. |
| Blank workbook writer | **ExcelJS** | MIT | Maintained; retires the vulnerable `xlsx` dep from the create path with a ~1-day change. (IronCalc could write the blank file too; ExcelJS keeps server code free of WASM until S4 needs it.) |

Rejected, with the reason, so nobody re-litigates: **HyperFormula / Handsontable**
(GPLv3 — client JS is *conveyed*, so the combined client becomes GPLv3; App Store
terms conflict). **Univer full UI** (xlsx import/export is pro/server or a community
converter; multi-MB bundle; its own design system). **Univer headless engine**
(Apache-2.0 but still pulls `core`+`engine-render`+`docs`+`sheets`+…; no codec —
kept as the *fallback* if S1 fails). **formulajs** (function library only — no parser
or dependency graph; pairing it with a parser is the bespoke-engine anti-pattern).
**fast-formula-parser / hot-formula-parser** (unmaintained / deprecated).
**AG Grid Community** (range selection, fill handle and clipboard are Enterprise).
**react-datasheet-grid** (unmaintained).

## 4. Architecture

```
FileViewer ─► OfficeDocumentViewer ─► (officeViewerMode === "native")
                                        │
                                        ▼
                               SpreadsheetViewer (client)
                               ├─ loads bytes from downloadUrl
                               ├─ .xls?  ── lazy SheetJS ──► .xlsx bytes (in memory)
                               ├─ lazy @ironcalc/wasm-xlsx ──► UserModel
                               ├─ Glide Data Grid  ◄──── getFormattedCellValue
                               │       onCellEdited ────► setUserInput
                               ├─ FormulaBar · SheetTabs · SpreadsheetToolbar (secondary toolbar)
                               └─ autosave: toXlsx() ──► existing upload finalize ──► FilePayload
```

- **Source of truth: the `.xlsx` bytes.** The engine's in-memory model is a
  working copy; every save re-serializes the whole workbook. There is no partial
  "cell diff" persistence and no JSON mirror in Postgres.
- **Module layout.**
  - `lib/domain/spreadsheet/engine.ts` — the only file that imports IronCalc.
    Wraps `UserModel` behind a small interface (`SpreadsheetEngine`) so a failed
    S1 can swap in Univer-headless without touching the grid. Client-only; the
    WASM is reached through `import()` so SSR and the base bundle never see it.
  - `lib/domain/spreadsheet/legacy-xls.ts` — `.xls` → `.xlsx` bytes via a lazy
    SheetJS chunk. Pure function; also the place a future `.ods`/`.csv` opener goes.
  - `lib/domain/spreadsheet/addressing.ts` — A1 ↔ (row, col) and range helpers.
    Tiny, pure, unit-tested; shared by the grid and a future database bridge.
  - `components/content/viewer/spreadsheet/` — `SpreadsheetViewer.tsx`,
    `SpreadsheetGrid.tsx` (Glide + theme), `FormulaBar.tsx`, `SheetTabs.tsx`,
    `SpreadsheetToolbar.tsx`.
  - `state/spreadsheet-store.ts` — per-open selection, active sheet, dirty flag,
    save state. Session-scoped, not persisted.
- **Viewer-mode setting.** Add `'native'` to `OfficeViewerMode` and make it the
  **default for spreadsheets** once S2 ships (`.docx`/`.pptx` keep their current
  default — this plan doesn't touch them). Settings → Files gets the fourth radio.
  Users with ONLYOFFICE configured keep it one click away.
- **Toolbar rules (CLAUDE.md).** Generalizable actions (full screen, export,
  share, download) stay in `ContentToolbar`. The spreadsheet's *secondary* toolbar
  holds only spreadsheet-specific affordances: formula bar, number format, bold /
  align, insert/delete row/column, freeze, sheet tabs. Nothing opens a private side
  panel; a future "cell details / named ranges" view is a right-sidebar tab.
- **Save.** 2 s debounce after the last edit (same cadence as notes, same
  yellow→green indicator). `toXlsx()` → `upload/simple` for ≤ 4 MB, else
  initiate/finalize. Carry the `bodyHash` guard: hash the bytes we loaded; if the
  server's current checksum differs at save time, show the existing
  `SaveConflictBanner` with "Reload" / "Save as copy". Beforeunload prompt while dirty.
- **Mobile shell.** Nothing new: WASM runs in WKWebView; Glide 6 handles touch.
  Editing on a phone is "works, not optimized" in this plan.

## 5. Legacy `.xls`

Read-through, never rewrite:

1. `.xls` opens through the same `SpreadsheetViewer`. `legacy-xls.ts` loads the
   SheetJS chunk, parses BIFF, writes `.xlsx` bytes in memory, hands them to
   IronCalc. The user sees their workbook, formulas computing.
2. The grid is **read-only** for `.xls`. The first edit attempt shows an inline
   notice: "This is a legacy .xls file. Save as .xlsx to edit." The action creates a
   **new sibling file node** `<name>.xlsx` in the same folder (via the existing
   upload path) and opens it; the `.xls` is untouched. Writing BIFF back is
   explicitly out of scope — SheetJS CE's BIFF writer drops styles, and "strictly
   compatible" is only true for `.xlsx`.
3. Fidelity notice: anything SheetJS could not carry (rare BIFF-only features,
   VBA) is listed in a dismissible banner, not silently dropped. The list is what
   `XLSX.read` reports plus a diff of sheet names / dimensions.

## 5b. Google Sheets compatibility

Two separate questions hide in "compatible with Google Sheets". The first is a
format question and is mostly fine; the second is a *which copy is live* question
and is the real work.

**Format.** Google Sheets imports and exports `.xlsx` well: values, formulas,
number formats, merged cells, column widths, frozen panes, data validation and
most conditional formatting survive a round trip. What does not: Apps Script,
Sheets-only functions, some chart types, and protected ranges. IronCalc speaks
Excel's function set, which Sheets also supports, so a workbook authored natively
here opens in Sheets with its formulas live. The reverse has one gap: a sheet
authored in Google that uses **Sheets-only functions** (`QUERY`, `ARRAYFORMULA`,
`IMPORTRANGE`, `GOOGLEFINANCE`, `SPLIT`, `REGEXMATCH`, `SPARKLINE`, …) exports to
`.xlsx` with the formula text *and* the last computed value. The native viewer
must show that **cached value, marked "last computed by Google Sheets"**, not
`#NAME?`. Whether IronCalc preserves a cached value for a function it does not
know is an S1 check; if it discards it, the viewer reads the cached values from the
file itself (the codec exposes them) and overlays them for those cells, which stay
read-only until the formula is rewritten.

**Which copy is live.** Today a file that has been opened in Google mode has its
live copy in Drive and a stale copy in storage (§2). The rule this plan adopts:
**one live copy per file, and the viewer says which it is.**

- A file **without** Google metadata: storage is live; native and ONLYOFFICE both
  read and write it. Opening it in Google mode converts and links it, as today.
- A file **with** Google metadata, opened natively:
  1. On open, fetch the current bytes from Drive —
     `GET /drive/v3/files/{id}/export?mimeType=…spreadsheetml.sheet` (within the
     `drive.file` scope the OAuth plan is moving to; the app created the file, so
     the scope covers it) — write them to storage, stamp `lastSynced`, then open.
     Storage is now a *mirror* of Drive, never older than the last native open.
  2. On native save, push the new `.xlsx` to Drive with
     `PATCH /upload/drive/v3/files/{id}` (Google re-converts it into the same
     Sheet, keeping its id and sharing), update storage, stamp `lastSynced`.
     If the push fails (token expired, file deleted in Drive), the save still lands
     in storage and the existing `SaveConflictBanner` shows "Saved here, not to
     Google — Retry / Unlink from Google".
  3. The viewer header shows a small **"Linked to Google Sheets"** chip with
     "Open in Google Sheets" and "Unlink" (unlink = keep storage as live, clear the
     metadata; the Google copy is left alone).
  4. A native **export-on-open also fixes ONLYOFFICE** for linked files, which has
     the same staleness bug today; route it through the same helper.
- **v1 fallback** if the Drive write path slips: linked files open natively
  **read-only** after the export-on-open, with "Edit in Google Sheets" and
  "Unlink to edit here". That alone removes the silent-staleness bug.

Server pieces: `lib/features/google-drive/sheets-sync.ts` with `pullFromDrive`
and `pushToDrive`, used by `app/api/google-drive/sync/route.ts`
(`POST { contentId, direction }`). No schema change; `lastSynced` already exists.

Out of scope here: opening a Google Sheet that lives only in Drive (that is Drive
integration, not spreadsheet work), and live co-editing between a Google session
and a native session — the link is export/import, not a CRDT; the last writer
through either door wins, and `lastSynced` + the storage checksum make that
visible rather than silent.

## 6. Phases

### S0 — Retire `xlsx@0.18.5` (≈1 day, any time, its own small PR or folded into S1)

- Replace the import in `lib/features/office/blank-document-generator.ts` with
  ExcelJS; same `Buffer` out, same workbook properties.
- Remove `xlsx` from `package.json`. (S1 reintroduces SheetJS as `0.20.x` from
  `cdn.sheetjs.com` under a pinned tarball URL — a different, fixed artifact.)
- Gate: `pnpm audit` no longer reports the two highs; a blank `.xlsx` created
  from "+ → Spreadsheet" opens in Excel, Numbers and Google Sheets.

### S1 — Spike: native read-only viewer (3–5 days, **gated**)

The one question this phase answers: **does IronCalc round-trip the owner's real
workbooks faithfully?** Everything after rests on it.

- Add `@ironcalc/wasm-xlsx`, `@glideapps/glide-data-grid`. Solve the Turbopack
  `.wasm` import once (client-only `import()`; note the pattern in
  `lib/domain/spreadsheet/engine.ts`).
- `SpreadsheetViewer` as the `'native'` rung: load bytes, parse, draw formatted
  values, sheet tabs, frozen header row/column from the file, column widths from
  the file. Dark/light via Glide's theme object fed from design tokens.
- `.xls` read-through (§5 step 1).
- Google-linked files: export-on-open + read-only (§5b v1 fallback), so the
  spike never shows stale data.
- Google-export check: open one workbook that was authored in Google Sheets and
  uses a Sheets-only function; confirm the cached value shows, marked, not `#NAME?`.
- **Spike gate (owner, in browser):** open three real workbooks. Pass means
  every sheet present, formatted values match Excel/Numbers for the cells the
  owner checks, no `#NAME?` from missing functions on the sheets that matter, no
  lost column widths. Record the result in §11. **Fail →** switch `engine.ts` to
  Univer-headless + ExcelJS codec and re-run the gate before S2; the grid and
  viewer survive the swap by design.

### S2 — Editor (3–4 weeks)

- Cell editing (type to replace, F2/Enter to edit, Esc), formula bar with the raw
  formula and A1 address, autocomplete-free in this phase.
- Engine-driven recalculation: after `setUserInput`, repaint the cells the engine
  reports changed (not the whole sheet).
- Undo/redo through `UserModel`; Cmd+Z / Shift+Cmd+Z, scoped so the note editor's
  bindings don't fire.
- Insert/delete rows and columns; references shift in the engine.
- Clipboard: TSV in/out via Glide's `onPaste` / `getCellsForSelection`; paste of
  formulas keeps them as formulas.
- Basic formatting: number formats (general, number, currency, percent, date),
  bold/italic, horizontal alignment, fill colour. All written through IronCalc so
  they land in the file.
- Autosave + conflict guard (§4). Fresh "+ → Spreadsheet" lands in the *current*
  folder (the #85 rule).
- `.xls` "Save as .xlsx" (§5 step 2).
- Google-linked files: push-on-save, the "Linked to Google Sheets" chip, Unlink
  (§5b). Route ONLYOFFICE's open through the same `pullFromDrive`.
- `'native'` becomes the default `OfficeViewerMode` for spreadsheet MIME types.

### S3 — Finish (1–2 weeks)

- Freeze panes toggle, merged cells rendering, hyperlinks in cells, comments
  rendering (read-only), find within sheet (reuse the viewer hotkey guard).
- Full screen through `content-fullscreen-store.ts` (never a private button).
- Export: `ContentToolbar` export gains CSV of the active sheet.
- Share page: `components/share/SharedContentViewer.tsx` renders the read-only grid.
- Playwright: a fixtures route with a committed small `.xlsx`; light/dark snapshots.
- Docs: `guides/storage/ONLYOFFICE-SETUP-GUIDE.md` gets a "you may not need this"
  preface; STATUS/BACKLOG/CURRENT-SPRINT updated.

### S4 — Deferred, listed so they are not forgotten

- **Server-side workbooks for AI tools** (`create_xlsx` beside `create_docx`) via
  `@ironcalc/nodejs` in an ordinary Vercel Function — no server. Needs the
  drift/pricing gates like any new tool.
- **Database `formula` column** evaluation: load a row's cells into a scratch
  sheet with column names as named ranges, evaluate, read back. The engine is the
  same one; the grammar question (Excel-style vs. Notion-style column references)
  is the design to settle first. Not started here.
- **Range → database rows** (Principle 2): select a range → "Create database from
  selection" → `lib/domain/data/import.ts` with the engine's typed values.
- **Live collaboration.** Single editor + conflict guard matches ONLYOFFICE today.
  IronCalc has a real-time collaboration PR in flight (#1428); wait for it before
  designing a Y.js cell layer over Hocuspocus.

## 7. The engine ↔ grid contract (so the engine is swappable)

```ts
// lib/domain/spreadsheet/engine.ts — the only IronCalc import site
export interface SpreadsheetEngine {
  sheets(): Array<{ index: number; name: string; frozenRows: number; frozenCols: number }>;
  formatted(sheet: number, row: number, col: number): string;   // what the grid paints
  raw(sheet: number, row: number, col: number): string;         // what the formula bar shows
  setInput(sheet: number, row: number, col: number, text: string): CellAddress[]; // changed cells
  insertRows(sheet: number, at: number, count: number): void;
  deleteRows(sheet: number, at: number, count: number): void;
  insertColumns(sheet: number, at: number, count: number): void;
  deleteColumns(sheet: number, at: number, count: number): void;
  setStyle(sheet: number, range: CellRange, style: Partial<CellStyle>): void;
  undo(): CellAddress[]; redo(): CellAddress[];
  toXlsx(): Uint8Array;
}
export async function openXlsx(bytes: Uint8Array): Promise<SpreadsheetEngine>; // lazy WASM
```

The grid, formula bar and toolbar depend on this interface and nothing else.
`SpreadsheetEngine` is deliberately *narrower* than IronCalc; widen it only when a
phase needs the capability.

## 8. Gates and verification

- `pnpm typecheck && pnpm lint && pnpm build` green; the `.wasm` import must not
  appear in any server chunk (check `.next/server` for `ironcalc`).
- Browser smoke (owner): the S1 spike gate; then for S2 — type `=SUM(A1:A3)`,
  change A2, B1 updates; insert a row above A2, the formula now reads `A1:A4`;
  Cmd+Z twice returns the original; close and reopen the file in Excel, the
  formula and the number format are intact.
- Playwright (S3): fixture `.xlsx` snapshot in both themes.
- `pnpm audit`: the two SheetJS highs gone (S0), none reintroduced (S1 pins 0.20.x).
- No schema change → no migration; the `migration-drift` gate is untouched.

## 9. Risks, named

| Risk | Handling |
|---|---|
| IronCalc pre-1.0 API churn | Pin exact version; all calls behind `SpreadsheetEngine`. |
| Function gaps on real sheets (e.g. IF-family range criteria, issue #1454) | The S1 gate uses the owner's real files; a gap is a recorded fail with the Univer-headless fallback already designed. |
| WASM payload on first open | `wasm-xlsx` is lazy; the viewer shows the existing skeleton while it loads. Measure on S1. |
| Glide release cadence | Stable 6.x; it is a grid, not a platform — the surface we depend on is small. |
| Tarball dependency for SheetJS | Pinned URL in `package.json`; documented here. Only loaded for `.xls`. |
| Large workbooks (tens of MB) | `toXlsx()` on every autosave is O(file). Debounce; above the 4 MB simple-upload cap use initiate/finalize; above 100 MB (the storage cap) the file never opened natively anyway. |
| Hotkey collisions with the note editor | Scope the spreadsheet bindings to the grid's focus; reuse the viewer hotkey guard from the minor-bugs branch. |
| Google-linked file shows stale bytes | Export-on-open before the first native paint (§5b); never open a linked file from storage alone. |
| Sheets-only functions | Show the file's cached value, marked; S1 verifies IronCalc keeps it, else overlay from the codec. |
| Drive scope / token expiry on push | Save lands in storage regardless; banner offers Retry / Unlink. `drive.file` covers app-created files. |

## 10. Open decisions for the owner

1. **Default viewer for `.docx`/`.pptx`** stays as-is? (This plan says yes.)
2. **"+ → Spreadsheet" wording and placement** — under the existing office
   submenu, or top-level next to Note?
3. **Fidelity banner for `.xls`**: dismissible per file, or shown once per session?

## 11. Record

| Date | Phase | Result |
|---|---|---|
| 2026-10-02 | Plan | Drafted. No branch. |
