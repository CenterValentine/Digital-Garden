# The Lossless Markdown System

**What it is:** the machinery behind the note editor's **Markdown source-view
toggle** (rich-text ⇄ markdown) and the **paste-as-markdown** affordances. Its
one job is a promise: **`tiptap → markdown → tiptap` never loses content.** A
callout, a diagram, an image with a width, a task list — round-trip them through
the source view and they come back byte-for-byte identical.

This guide is for when you want to **change or extend** that system — e.g. "make
custom callouts render as `> [!note]`" — without breaking the promise. Read the
mental model first; it explains *why* the safe path is safe.

---

## 1. The pipeline (only half is hard)

```
Open source view:   TipTap JSON  ──►  markdown        (the SERIALIZER — hard)
Toggle back / paste: markdown     ──►  TipTap JSON     (the PARSER — libraries)
```

The **parser** (`markdownToTiptapRich`) is `marked` (md → HTML) → TipTap's
`generateJSON` (HTML → JSON), plus a few reconstruction passes. It's mature.

Every hard problem lives in the **serializer** (`tiptapToMarkdownRich`):
markdown is a *lossy target* for a rich editor schema, so most of the design is
about **choosing a representation per block that provably round-trips**, and
falling back to something opaque-but-perfect when nothing pretty does.

Files:
- `lib/domain/content/markdown-serialize.ts` — serializer + parser (the core).
- `lib/domain/content/markdown-fences.ts` — the base64 `dg-block` fence.
- `lib/domain/content/markdown-block-codecs.ts` — per-block pretty-syntax codecs.
- `lib/domain/content/markdown-decompress.ts` — paste-only structural repair.
- `lib/domain/content/markdown.ts` — public API (`tiptapToMarkdown`,
  `markdownToTiptap`, `markdownPasteToTiptap`, degraded-signal contract).
- `scripts/validate-markdown-block-safety.ts` — the CI gate (`pnpm markdown:blocks:check`).

---

## 2. The core invariant: self-verification (deny-by-default)

**This is the whole safety story. Internalize it.**

For each top-level block, the serializer produces a candidate representation and
then **immediately re-parses it and checks the result is deep-equal to the
block's canonical form.** A representation is emitted **only if it round-trips**.
Anything that doesn't — a dropped attribute, an escaping edge, an asymmetric
extension — is rejected and we fall to the next option.

```
canonical(block) = generateJSON(generateHTML(block))     // schema-canonical
use candidate  ⟺  parse(candidate) deep-equals canonical(block)
```

Consequence: **you cannot introduce silent loss.** If your new pretty syntax is
even slightly lossy, the self-verify refuses it and the block fences instead.
The worst outcome of a bad idea is an *uglier* source view, never lost content.

The CI gate (`markdown:blocks:check`) is the same check applied to a battery of
constructs + every registered block + a schema-driven attribute sweep, run in
CI. It is the durable proof.

### 2a. The one exemption: presentational attributes

`withoutPresentationalAttrs()` in `markdown-serialize.ts` normalises a short list
of attributes away from **both sides** of the deep-equal check. Today that list
is exactly one entry: **`colwidth` on `tableCell` / `tableHeader`** — the pixel
widths you get by dragging a column border.

Why it exists: GFM has no column-width syntax, so before this exemption a table
whose columns had ever been resized failed the check and dropped to the raw-HTML
tier. The source view showed a wall of `<table style="min-width: 487px">…` that
no one can edit as markdown. The exemption buys a real markdown table for every
resized table; the price is that **toggling a resized table through source view
returns it with auto-sized columns**. Widths are otherwise untouched — they
persist through normal editing, autosave, collaboration and reload; only the
markdown round-trip drops them.

**Do not grow this list to make an inconvenient block "work".** Every entry is
content the system has stopped protecting, and the invariant above degrades to
"lossless except for a list you have to go read." An attribute belongs here only
if it is genuinely view state (not authored content), markdown genuinely can't
express it, and the HTML-tier fallback it would otherwise trigger is worse for
the author than losing it. The gate asserts both halves — that widths *are*
dropped and that *nothing else* is — so a widened list shows up as a failing
"everything except the widths round-trips unchanged" check, not as silent decay.

---

## 3. The tiered ladder

`serializeBlock` tries representations in order, each gated by self-verify:

| Tier | Representation | For | Example |
|---|---|---|---|
| **Codec** | per-block markdown syntax | custom blocks that opt in | callout → `> [!note]` |
| **1** | pretty markdown (turndown) | anything markdown expresses | heading, list, code, link |
| **2** | the node's **own HTML** | config markdown can't express | `<img width>`, `<u>`, `<p style="text-align">` |
| **3** | **base64 `dg-block` fence** | everything else | Excalidraw/Mermaid, publishing blocks |

- **Tier 2 (HTML)** works because markdown permits raw HTML and TipTap's
  `parseHTML` round-trips its own HTML. It's lossless *and* human-readable.
- **Tier 3 (fence)** is the **always-safe floor**: `JSON.stringify(node)` →
  base64 → restore. It's the identical round-trip that *saves your document*, so
  it carries any node verbatim — all attrs, nested content, everything. Opaque,
  but perfect. Data-bearing blocks (diagrams) land here because their payload
  lives in attrs/sub-maps the HTML can't carry.

**Design bias:** pretty when provable, fence when not. Never the reverse.

---

## 4. The parser side (how pretty syntaxes come back)

`marked` doesn't know that `> [!note]` is a callout or `- [ ]` is a task item —
it produces a plain blockquote / bullet list. So each pretty syntax needs a
**parse-side reconstruction** that rewrites `marked`'s HTML before
`generateJSON`:

- `reTagTaskLists` — checkbox `<ul>` → `data-type="taskList"`.
- `applyBlockReTags` — runs every codec's `reTag` (callout `> [!type]` blockquote
  → `<div data-callout-type>`).
- `restoreDgBlocks` — decodes base64 fences back to exact nodes.
- `dedupeBlockIds` — a *copied* fence gets a fresh `blockId` (so two blocks never
  share a Y.js sub-map).
- `normalizeCodeBlocks` — strips the trailing `\n` marked adds to code fences.

---

## 5. How to safely extend it

### 5a. Give a custom block pretty syntax → add a **codec**

This is the sanctioned way to do "custom callouts" and the like. In
`markdown-block-codecs.ts`, add a `BlockMarkdownCodec`:

```ts
{
  type: "myBlock",
  toMarkdown(node, serializeInner) {
    // node → markdown string (serializeInner renders child block content)
    // return null to decline (→ fence)
  },
  reTag(html) {
    // rewrite marked's HTML so generateJSON rebuilds myBlock
  },
}
```

Then it's used **only if it round-trips** — the self-verify decides, and the
gate proves it. If you get either half slightly wrong, the block simply fences;
you'll see it as base64 in the source view and the gate stays green (lossless),
which is your signal the codec isn't complete yet.

**Rule of thumb:** a codec needs *both halves*. `toMarkdown` alone gives you
pretty output that parses back to the wrong thing → self-verify rejects it →
fence.

**Variant — decorating a CORE node's serialization (the heading-fold lesson):**
when the pretty form is "the default markdown plus a marker" on a node
turndown already handles (heading folds: `## Title {.collapsed}` for
`heading.collapsed`), put the serialize half in a **turndown rule** in
`createTurndown()` that fires only for the decorated case (so the undecorated
node keeps the stock path byte-identical), and register a codec whose
`toMarkdown` returns `null` with only a real `reTag`. The codec registry is
consulted for core types too, so the parse-side reconstruction slots in
without touching the parser. Heading anchor ids are the counter-example:
they're *derived* from heading text (`lib/domain/content/heading-ids.ts`), so
they never appear in markdown at all — a round-trip regenerates them.
Derivable state needs no syntax; only stored state does.

### 5b. The extension-symmetry prerequisite (the callout lesson)

A codec (or Tier-2 HTML) can only round-trip if the block's **own
`renderHTML` ↔ `parseHTML` is symmetric** — i.e. `generateJSON(generateHTML(node))`
already equals `node`. If it doesn't, **fix the extension first.**

Real example: the callout extension rendered a title-chrome `<div>` that
`parseHTML` then **absorbed as an extra content paragraph** — so `norm(callout)`
had a duplicate paragraph. The fix was `contentElement: '.callout-content'` on
`parseHTML` (read content only from the content div, ignore chrome). Diagnose
with:

```ts
const canonical = generateJSON(generateHTML({type:"doc",content:[node]}, ext), ext);
// deep-equal to your original node? If not, the extension is asymmetric — fix it.
```

Fixing extension symmetry also improves **export, paste, and collaboration** HTML
fidelity — it's never wasted.

### 5c. Things that would fight the system (don't)

- **Don't emit a representation without both round-trip halves.** Pretty output
  that parses to something else = silent loss the self-verify was built to stop.
  (It'll stop it — by fencing — but you'll think your feature "doesn't work".)
- **Don't bypass the self-verify** to force pretty output. The moment you do,
  losslessness is gone and the gate can't help you.
- **Don't put structural repair in the toggle path.** `decompressMarkdown`
  (splitting collapsed `# A ## B` / `1. a 2. b`) is a *heuristic* and runs on
  **paste only** (`markdownPasteToTiptap`), never the source-view round-trip —
  the toggle must be a faithful mirror of the note's actual content.
- **Don't remove the fence fallback.** It's the floor that makes "pretty when
  provable" safe.

### 5d. Collaboration write rule (source-view apply)

Applying a source edit is **collab-aware**: for a collab note the Y.doc is
authoritative, so the edit is written **through the live editor instance**
(`editor.commands.setContent`, which y-prosemirror syncs to the Y.doc) — **never**
a REST PATCH of `NotePayload`, which would diverge the two stores. Plain notes
use REST. See `MainPanelContent`'s `applySourceMode`.

---

## 6. Running the gate

```bash
pnpm markdown:blocks:check   # 5 layers: construct battery, escaping battery,
                             # tier-2 HTML, custom-block codecs, schema-driven
                             # attr sweep, registry enumeration, blockId de-dupe
```

It runs in `pnpm build` and in CI (`.github/workflows/quality.yml`,
`markdown-safety` job). A new block auto-appears in the registry enumeration, so
it can't regress silently. If you add a codec, add a one-line assertion that the
block serializes to your syntax (not a fence) — see the callout example in the
gate.

---

## 7. TL;DR mental model

> **Losslessness is not a property you maintain by being careful — it's enforced
> by the self-verify.** Add pretty representations freely; the system will use
> them where they provably round-trip and fence them where they don't. To make a
> block prettier, add a codec (both halves) and, if needed, fix the extension's
> HTML symmetry first. The fence is the floor; the gate is the proof.
