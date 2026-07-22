# AI v3.2 — The Six Unbuilt (hardening + polish)

Successor round to AI v3.1 (built; PR pending). Scope = the six backlog
items that were deferred behind the 3.1 UX work, promoted to a plan by the
owner 2026-07-22. Ordered so the foundational hardening (T1) lands before
the feature that sits on it (T2). Branch continues on
`worktree-ai-v3-core` (or a fresh `ai-v3.2` branch if 3.1 merges first).

The AI V4 thread (conversation memory bank, JIT retrieval, validated
compaction) stays separate — see `AI-V3.1-PLAN.md`'s final section.

## T1 — Harden the markdown ↔ TipTap translation seam

The owner directive ("I don't like this patching approach… manage
translations in a hardened way"). Recon (2026-07-21) found the
architecture already right — `lib/domain/content/markdown.ts` is the hub
for 12 of 17 call sites — but the **failure contract** is wrong: the
converter's `catch` silently wraps raw markdown in one paragraph, which is
the root of the R6 degraded-note bug AND the reason `registry.ts` carries
a band-aid.

- **Explicit failure, not silent fallback.** The converter returns a typed
  result that signals degradation, so a bad conversion is detectable at
  the call site and flaggable in note metadata — never shipped as
  invisible plain text.
- **One canonical entry point.** Formalize `markdown.ts` as THE converter;
  route `browser-extension/service.ts` through it and delete the
  `registry.ts` `isMarkdownFallback`/`paragraphSplitFallback` band-aid.
  Leave the two HTML-*rendering* files (`export/converters/html.ts`,
  `components/public/TipTapContent.tsx`) — different concern.
- **Round-trip tests.** markdown → TipTap → markdown over the real
  node/mark set (headings, lists, tables, callouts, code, links, marks) —
  the regression guarantee.
- **Collab-aware writes.** The converter stays pure; the R6 lesson (Y.doc
  is authoritative for collab notes) becomes a documented guard at the
  write sites. Fold the R6 salvage script (`pnpm notes:regen`) in as the
  backfill arm.
- **OWNER DECISION (pending):** when conversion genuinely can't produce
  structure, (a) hard-fail the AI tool call with a clear error, or (b)
  write a marked-degraded note (content preserved, flagged in metadata +
  visible badge, recoverable by the sweep). *Recommendation: (b) for AI
  writes — never lose the user's content; hard-fail only leaves them
  emptier-handed. Confirm before building.*
- **Gate:** round-trip tests pass over the full node set; a deliberately
  malformed input produces the chosen failure signal (flagged note or
  clear error), never silent plain text; the `registry.ts` band-aid is
  gone; existing degraded notes heal via the folded-in sweep.

## T2 — Markdown ↔ TipTap source-view toggle  ✅ BUILT (2026-07-21)

Owner request; the natural companion to T1 (excluded from 3.1
deliberately). A toolbar toggle to view/edit a note's markdown *source*
alongside the rich-text editor.

**Built** on `worktree-ai-v3-core`. Gates green (typecheck / lint / build /
`pnpm markdown:smoke` 11/11). Browser smoke = owner step.

- **Where the toggle lives:** the note *title header* (next to the dev
  `DebugViewToggle`), NOT `ContentToolbar`. The recon guessed the toolbar,
  but `ContentToolbar` is a registry-driven, content-type-agnostic component
  with no access to `noteContent` / `handleSave` / the editor instance —
  wiring editor-local state through it would fight its design. The header is
  where all that state is already in scope (mirrors how `DebugViewToggle`
  sits there). Notes only (`contentType === "note"`), non-embed.
- **Files:** new `components/content/editor/MarkdownSourceView.tsx` (dumb
  monospace textarea, ⌘/Ctrl+↵ applies); `MainPanelContent.tsx` — `sourceMode`
  + `sourceDraft` state, `enterSourceMode` / `applySourceMode` / `toggleSourceMode`,
  a reset-on-navigation effect, the header button, and a render swap.
- **Editor stays MOUNTED (hidden) in source mode** (`className={sourceMode ?
  "hidden" : "h-full"}`) — so the collab Y.doc connection and the live editor
  instance survive; apply writes back through that instance.
- **Collab-safe apply (the sensitive part):** on toggle-back,
  `markdownToTiptapResult(draft)` → `editor.commands.setContent(json,
  { emitUpdate:false })`. For a collab note this propagates into the Y.doc via
  y-prosemirror (Hocuspocus persists) and we do **not** REST-write — that would
  reintroduce the R6 NotePayload↔Y.doc divergence. For a plain note we also
  `handleSave(json, { userInitiated:true })` (REST is its persistence path).
  The collab gate `collaborationEnabled && contentType==="note" &&
  selectedContentId && collaborationRuntime` mirrors the editor's own
  `shouldUseCollaboration`, so apply behaves exactly like a normal edit.
- **Enter seeds from the LIVE editor JSON** (`getEditor(id)?.getJSON()`),
  falling back to `noteContent` — the Y.doc can be ahead of parent state.
- **Degraded feedback:** a source edit that can't parse to structure produces
  a toast ("saved as plain paragraphs"), not a silent drop. (It does NOT stamp
  `metadata.markdownDegraded` — that badge is for background AI writes; here
  the user is present and the toast is the immediate signal.)
- **Known limitation (documented, acceptable v1):** apply is a whole-document
  replace, so under true concurrent collaboration it's last-write-wins on the
  doc (normal Y.doc semantics, stays consistent across clients — not a
  divergence). Fine for the single-user source-edit case.

### T2 block-safety — lossless custom-block round-trip + CI gate (2026-07-21)

Owner found (via the toggle): custom blocks **disappeared** in a
tiptap→md→tiptap rotation. Root cause: the markdown pipeline
(marked ⇄ crude regex `htmlToMarkdown`) only handles a standard node subset;
custom blocks were flattened to plain text, and data-bearing blocks (Excalidraw,
Mermaid — payload in attrs) **vanished entirely**. Export's converter is no
better (one-way; `default` case concatenates children; no importer reconstructs
blocks). T2 promoted a lossy op into a round-trip *edit*, exposing it as data
loss. Owner directive: *"our own markdown syntax for all blocks that survive
without ANY harm"* + *"a CI gate so blocks are always safe."*

- **Opaque `dg-block` fence (lossless substrate), chosen by owner.** Any node
  the pipeline can't represent is emitted as a fenced code block carrying its
  EXACT JSON (base64) and restored verbatim — same philosophy as the
  `unsupportedBlock` safety net (preserve, never drop). Pure, extension-free
  helpers in **`lib/domain/content/markdown-fences.ts`** (`isFullyKnown`,
  `serializeUnknownBlock`, `restoreDgBlocks`, `KNOWN_MARKDOWN_NODES`). `markdown.ts`
  `tiptapToMarkdown` now **partitions** top-level blocks into pretty round-trippable
  runs vs fenced custom nodes; `markdownToTiptapResult` restores fences after parse.
- **Why a separate pure module:** importing `markdown.ts` under `tsx` crashes
  (`markdown.ts → extensions-server → code-block-lowlight`, CJS transform). The
  pure module has only a `type` import, so the CI gate can exercise it under tsx.
  Converters also gained an optional injected-`extensions` param (default
  unchanged) so the gate runs the real parse path with the tsx-safe collab set.
- **CI gate `pnpm markdown:blocks:check`** (`scripts/validate-markdown-block-safety.ts`):
  two layers — (1) a **construct battery** that deep-equals every structural
  construct (headings, alignment, each mark, ordered/task lists, code+language,
  images w/ attrs, blockquotes, tables) through the real converter path, and
  (2) **registry enumeration** asserting all 68 node types survive. Wired into
  the `build` script (next to `collab:schema:check`) AND a new `markdown-safety`
  job in `quality.yml`. A new block auto-appears → can't regress silently.

  **⚠ Correction (2026-07-21, owner audit):** the FIRST gate version only proved
  *custom blocks* (fenced) — it never tested that "known" standard nodes kept
  their attrs. An empirical 26-construct battery then found **17/26 LOSSY**: the
  crude `htmlToMarkdown` is attr-sensitive, so `heading`→paragraph,
  `orderedList`→bullets, `codeBlock`/`image`/`blockquote`/`horizontalRule`/`link`/
  `strike` all silently mangled (their HTML carries class/style/language attrs the
  bare-tag regexes miss). Fix: **`KNOWN_MARKDOWN_NODES` tightened to the
  empirically-proven-lossless set** (`doc, paragraph, text, bulletList, listItem`)
  + `KNOWN_MARKDOWN_MARKS` (`bold, italic, code`) + an attr gate (fence a known
  node carrying a meaningful attr, e.g. paragraph `textAlign`). Everything else
  now **fences** (lossless). The battery is green = proven. `htmlToMarkdown`
  extracted to a pure module so the gate exercises the real serializer under tsx.
- **Playwright:** UI-level conversion stub at
  `tests/e2e/editor/markdown-source-toggle.spec.ts` (owner's "possibly some
  playwright") — blocked on the auth fixture, per repo stub convention.
### T2 block-safety FINAL — turndown serializer, self-verifying (2026-07-22) ✅ BUILT

Replaced the crude attr-sensitive `htmlToMarkdown` with a **turndown-based,
self-verifying** serializer. Owner-approved after the empirical audit
(17/26 constructs were lossy) + the deny-by-default design conversation.

- **`lib/domain/content/markdown-serialize.ts`** — `tiptapToMarkdownRich` /
  `markdownToTiptapRich`. Deps added: `turndown` + `turndown-plugin-gfm`
  (jsdom already present; turndown bundles its own Node DOM).
- **Deny-by-default via self-verification (the core safety model).** Each
  top-level block is serialized pretty (turndown) ONLY if, when immediately
  re-parsed, it round-trips deep-equal to its canonical form. ANY discrepancy
  (dropped attr, escaping edge, unrepresentable mark) → **fence** (verbatim
  base64 JSON). Loss is structurally impossible — the serializer never ships
  markdown it can't prove reversible. Result: **pretty** for headings,
  paragraphs, all lists incl. **task lists `- [x]`**, blockquotes, code
  (+language, multiline), links, marks (bold/italic/strike/code), and the
  escaping cases that leaked before; **fenced** (lossless) for custom/data
  blocks, configured standard nodes (image width/align), and rare escaping edges.
- **Tier 3 (fence) = the save-the-document round-trip.** `JSON.stringify` →
  base64 → restore: verbatim, all attrs, so publishing blocks' full decor set
  is lossless (their draft/published divergence is render code over one attr
  bag — orthogonal to the toggle). Confirmed against pricing-card.
- **Parse extras:** `reTagTaskLists` (marked's checkbox `<ul>` → TipTap
  `data-type="taskList"` so task lists reconstruct with checked state);
  `normalizeCodeBlocks` (strip marked's added trailing `\n`); **blockId
  de-dupe** (a copied fence re-ids the duplicate so two blocks never share a
  Y.js sub-map).
- **Injectable `HtmlBridge`** — serializer uses isomorphic `@tiptap/html` root
  (Turbopack picks browser/node) so the client bundle is clean; the gate injects
  `@tiptap/html/server` for tsx. (`@tiptap/html/server` at top level breaks the
  client bundle — that was the one build failure, now fixed.)
- **CI gate — 5 layers, 113 checks** (`scripts/validate-markdown-block-safety.ts`):
  (1) construct battery, (2) **escaping battery** (literal metacharacters —
  closes the leak the clean-text battery missed), (3) **schema-driven attr
  sweep** (every attr the schema declares on each candidate node, set to a
  non-default value → lossless; coverage from the schema, not a hand-list —
  this is the attribute-loss protection), (4) registry enumeration (all 68
  node types), (5) blockId de-dupe.
- **Dead code removed:** `html-to-markdown.ts` (crude regex serializer) deleted;
  `markdown-fences.ts` trimmed to the fence primitives.
- **Tier-2 HTML fallback (2026-07-22) ✅ BUILT.** `serializeBlock` is now a
  self-verified 3-tier ladder: Tier 1 pretty markdown → **Tier 2 the node's own
  HTML** → Tier 3 base64 fence. Configured standard nodes markdown can't express
  (image width/align, text alignment, underline/highlight, link attrs) now
  serialize as legible inline HTML — lossless via TipTap's `parseHTML`, marked
  passes it through — instead of base64. Strict prettiness upgrade: nodes that
  used to fence (images, underline, alignment) render as HTML; data-bearing
  blocks (Excalidraw/Mermaid) whose HTML can't carry their payload still fence.
  Note: this app's image node has extra attrs (`wrap/size/source/…`) so even a
  *plain* image goes Tier-2 HTML (a top-level image can't round-trip through
  `![]()` — marked paragraph-wraps it) — which is still a win over the old base64.
  Gate proves image+width/underline → HTML, Excalidraw → fence.
- **North star — per-block markdown codecs (2026-07-22) ✅ BUILT.** A codec
  registry (`markdown-block-codecs.ts`) lets a CUSTOM block declare a
  human-readable markdown syntax — both halves: `toMarkdown` (node → markdown) +
  `reTag` (parse-side reconstruction, since marked doesn't know `> [!note]` is a
  callout — same as `- [ ]` for task items). A codec is USED only if it
  round-trips deep-equal (self-verify), else the block fences. `serializeBlock`
  tries a codec before the fence; `markdownToTiptapRich` applies every codec's
  re-tagger. **First codec: callout ⇄ `> [!type] Title`** (incl. nested content).
  Prerequisite: fixed the callout extension's HTML asymmetry — its `parseHTML`
  absorbed the title-chrome div as an extra content paragraph; added
  `contentElement: .callout-content` (also fixes callout fidelity for
  export/paste/collab HTML; no schema-shape change, collab:schema:check passes).
  Gate proves callout → `> [!warning]` markdown, Excalidraw → fence.
  **Adding pretty syntax for another custom block = add a codec here** (e.g.
  tag/wikiLink inline, tabs, columns) — the pattern is proven and gate-enforced.

### T2 paste affordances (2026-07-22) ✅ BUILT

Pasting raw markdown into the rich-text editor lands it as literal text (we
never auto-convert — that guess is unsafe; a code snippet or literal `#` must
stay literal). Two explicit affordances instead:
- **Warning toast** (`MarkdownEditor` `handlePaste` + `markdown-detect.ts`):
  when pasted text looks like markdown (conservative heuristic — one strong
  structural signal OR two inline signals; validated against plain-prose false
  positives), a dismissable toast fires with a one-click **"Paste as Markdown"**
  (undo + reparse) and a **"Don't show again"** that persists in localStorage.
  Literal paste still proceeds — deny-by-nag, not deny-by-convert.
- **Context menu "Paste as Markdown"** (editor clipboard actions): reads the
  clipboard, parses via the lossless converter, inserts through the editor
  (collab-safe). The reliable path without switching to source view.

- **Original scope notes below (kept for reference):**

- Toggle in the editor toolbar: rich-text ⇄ markdown source. Source view
  renders `tiptapToMarkdown(json)`; edits re-parse via the (now hardened,
  T1) `markdownToTiptap`.
- Collab-safe: source-edit commits go through the same write path as
  normal edits; for collab notes the Y.doc stays authoritative.
- **Gate:** round-trip a formatted note through source view with no
  content loss; a source edit reflects in rich-text on toggle-back.
- **Recon (2026-07-22):** integration map — the note editor lives in
  `MainPanelContent.tsx` (the `editorElement`, title header at ~2033 +
  the TipTap `MarkdownEditor`); `ContentToolbar` (line ~2198) is the
  toggle's home. There's an existing DEBUG markdown view
  (`state/debug-view-store.ts` → `MarkdownDebugView`) but it's read-only
  and dev-only — T2 is a separate USER-facing editable mode, not an
  extension of it. Approach: a `sourceMode` state; when on, swap the
  MarkdownEditor for a textarea seeded from `tiptapToMarkdown(noteContent)`;
  on toggle-off, `markdownToTiptapResult(text)` → setNoteContent → save
  (reuses T1's hardened converters + degraded flag). Collab-safe: routes
  through the existing `handleSave`, so Y.doc-backed notes stay
  authoritative. Sensitive surface (core editor) — build with care.

## T3 — S4c playbook progressive-disclosure registry

Deferred from v3 S4. Playbooks are invoked today by @-mentioning the note;
the registry adds discovery + per-phase disclosure.

- A registry of known playbooks (surface: a picker / slash affordance in
  chat) so users find procedures without knowing the note name.
- Progressive disclosure: expose a phase's detail only when the run
  reaches it, keeping the model's context proportional to the active
  phase (ties into the R5 context-discipline work).
- **Gate:** a user starts a playbook from the registry (no @-mention);
  phase detail loads per-phase, verifiable in the token meter.

## T4 — Resumable-stream store (live re-attach)

The S1 "survives reload" gate ships at the no-lost-work level (server
`consumeStream` + idempotent persistence); live re-attach to an in-flight
stream needs a resumable-stream store (Redis-class).

- Stand up a store (Upstash via Vercel Marketplace, or Redis on the
  Coolify homeserver) and wire `useChat` resume / `resumeStream`.
- **Gate:** reload mid-stream → the SAME in-flight response continues
  rendering live, not just the completed message on next load.

## T5 — Conversation title strategy for quick URL chats

Deferred S3-time call: page title vs. first-message summary for chats
opened from a URL.

- Decide + implement the title source for quick/URL-opened chats
  (first-message summary is the likely answer; confirm at build).
- **Gate:** a URL-opened chat gets a meaningful title without manual
  rename, consistent with sidebar-created chats.

## T6 — Acquisition explainer (owner walkthrough)

Umbrella post-V3 queue: a knowledge-transfer session/doc, not a build —
walk the owner through the Acquisition Service (envelope, policy engine,
P0 native search × 4, P1 server-fetch/read_page, garden hydration, and now
the app-executed BYOK search) so its extension points are owned, not
rediscovered.

- Deliverable: a concise architecture doc under
  `docs/notes-feature/guides/ai/` + a live walkthrough.
- **Gate:** owner can point to where a new acquisition provider or search
  backend plugs in without re-deriving it.

## Verification conventions

`pnpm typecheck → lint → build` per repo standard, plus in-app browser
smoke per session gate against localhost. T1 additionally ships unit
round-trip tests (the first test coverage this subsystem has had).

## Sequencing note

T1 → T2 are a pair (T2 depends on T1's hardened converter). T3–T5 are
independent and can reorder by owner priority. T4 needs infra (a Redis-
class store) provisioned before it starts. T6 is a doc/walkthrough,
schedulable any time.
