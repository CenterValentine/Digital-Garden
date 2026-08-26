# Input Trace — Keystroke → Transaction Debug Tool

**Development only.** Records each keystroke alongside the ProseMirror transaction it produced, so a TipTap formatting quirk can be read back as cause and effect rather than reproduced by narration.

Lives inside the existing debug panel — it is a fifth view mode next to JSON / Tree / Markdown / Metadata, not a separate overlay.

---

## Using it

1. Open a note in the content IDE (`next dev` only — the tool does not exist in any deployed build).
2. Press **Cmd/Ctrl+Shift+D**, or click the 🐛 toggle in the note header, and choose **Input**.
3. Press **Record**.
4. Reproduce the quirk in the editor.
5. Press **Stop**.
6. Export:
   - **Copy** (clipboard icon) → a markdown report to paste to an AI assistant.
   - **Save** (disk icon) → writes `.local/input-trace/<timestamp>-<note>.md` **and** `.json`. `.local/` is gitignored. Point the assistant at the path instead of pasting.

The 🐛 toggle's status dot turns **red and pulses** while a trace is recording, so an active session is visible without opening the panel.

---

## Reading a trace

Each event is one user action correlated with everything it caused:

```text
#12  +1284ms  key  Enter  (src: cmg7x2k00001)
  before   doc › callout{type="warning"} › paragraph  sel 118  stored unset · resolved bold
  after    doc › paragraph  sel 121  stored unset · resolved —
  tx       1× docChanged
    · replace 118..118 ← <paragraph>
  ⚠ marks dropped: bold
  ⚠ node path changed: doc > callout > paragraph → doc > paragraph
```

**`stored` vs `resolved` marks is the field to read first.** ProseMirror tracks two mark sets, and conflating them explains most "my formatting turned itself off" reports:

| Value | Meaning |
|---|---|
| `stored unset` | No pending marks; the next character inherits marks from the document at the cursor. |
| `stored cleared` | Marks were explicitly emptied. **This is the usual cause of formatting dying at a node boundary.** |
| `stored bold, italic` | Those marks are pinned and will apply to the next inserted character. |

**Amber-flagged rows** are the diagnostic shortlist — events where marks were dropped, the node path shifted, the selection type changed, or a keystroke produced no transaction at all. The markdown report repeats them in a **Flagged events** digest at the top, so the assistant reads the interesting events before the full timeline.

Other fields worth knowing:

- **`inputType`** — the browser's declared intent from `beforeinput` (`insertParagraph`, `formatBold`, `deleteContentBackward`, `insertFromPaste`). More reliable than the key name for diagnosing what the browser *meant*.
- **`tx.meta`** — transaction meta keys. `y-sync$` means the change came from collaboration, not from your keystroke; `addToHistory=false` means undo will skip it. Both are frequent surprises.
- **`clip.htm`** — the raw pasted HTML (up to 2 KB). Pasting from Word or Google Docs is a top source of formatting quirks, and this is the evidence.
- **`kind: transaction`** — an event with no keystroke: a programmatic command, a remote collaborative update, or an async effect.

---

## What it does *not* do

- **Selection-only churn is dropped.** Unattributed transactions are recorded only when `docChanged` or `storedMarksSet` is true, so mouse-driven caret movement doesn't drown the log. Selection state still appears as the `before` of the next keystroke.
- **It never records outside `next dev`.** `attach()` and `start()` are no-ops in production.
- **It cannot change editor behaviour.** All DOM listeners are registered `{ capture: true, passive: true }` — capture phase so snapshots are genuinely "before", passive so the browser *enforces* that nothing calls `preventDefault`.

---

## Architecture

| Piece | Path | Role |
|---|---|---|
| Recorder singleton | [lib/domain/editor/debug/input-trace.ts](../../../../lib/domain/editor/debug/input-trace.ts) | Owns the buffer; correlates DOM input events with transactions. Framework-free. |
| Snapshots + step summaries | [lib/domain/editor/debug/snapshot.ts](../../../../lib/domain/editor/debug/snapshot.ts) | Pure, defensive conversion of live PM state into serializable shapes. |
| Report builder | [lib/domain/editor/debug/report.ts](../../../../lib/domain/editor/debug/report.ts) | Markdown + JSON rendering for export. |
| Reactive mirror | [state/input-trace-store.ts](../../../../state/input-trace-store.ts) | Zustand store the UI reads. Subscribes to the recorder; the recorder never imports it (no cycle). |
| UI | [components/content/viewer/debug/InputTraceDebugView.tsx](../../../../components/content/viewer/debug/InputTraceDebugView.tsx) | The `Input` debug view. |
| Save endpoint | [app/api/dev/input-trace/route.ts](../../../../app/api/dev/input-trace/route.ts) | Writes `.local/input-trace/`. Hard-404s outside development. |
| Attach point | [components/content/editor/MarkdownEditor.tsx](../../../../components/content/editor/MarkdownEditor.tsx) | One dev-gated `useEffect` per editor mount. |

### Correlation model

A keystroke opens an **event**; transactions arriving within a 32 ms settle window are attributed to it; a new keystroke seals the previous event immediately. 32 ms covers both dispatch paths — keymap-handled keys fire synchronously, while plain text insertion round-trips through `beforeinput` → DOM mutation → ProseMirror's `DOMObserver` flush a tick or two later — without merging neighbouring keystrokes at realistic typing speeds.

Appended transactions (input rules, collaboration sync) restart the settle window rather than sealing the event, so an input rule that rewrites what you just typed stays attached to the keystroke that triggered it.

### Bundle cost

Every TipTap and ProseMirror import in the debug module is `import type`, so the module adds nothing to the runtime import graph. Its only value import is `TIPTAP_SCHEMA_VERSION`, a pure constant.

### Multiple editors

The recorder is a process-wide singleton and each event carries a `source` (the note's `contentId`). Multi-pane layouts and the expandable editor all report into one timeline, so a quirk involving two panes is visible in a single trace.
