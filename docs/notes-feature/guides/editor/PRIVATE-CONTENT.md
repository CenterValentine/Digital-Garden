# Private Content — commenting out prose

> **One-line model:** private text is a commented-out line of code. It stays in
> the file, stays in version control, travels with an export, and the compiler
> never sees it. Here "the compiler" is every reader that is not the author's
> own editor: the AI, the public site, the search index.

## 1. What the user gets

| Way in | Shape it produces |
|---|---|
| **Cmd+/** with a selection inside one paragraph | inline `privateText` mark |
| **Cmd+/** with a bare cursor, or a selection crossing blocks | `privateBlock` wrapping those blocks |
| **Cmd+/** inside either | reverses it (the whole run / the whole block) |
| type `%%text%%` | inline mark, on the closing `%%` |
| type `%%` on its own line + Enter | opens a block; the same line inside closes it |
| `/private` (aliases `comment`, `hidden`, `%%`) | block |
| EyeOff button in the selection toolbelt | same decision as Cmd+/ |

The aesthetic is a code editor's comment: muted color, dotted underline for
the inline run, a dashed left rule and a small label for the block. Nothing is
boxed, collapsed or hidden — the point of commented-out code is that you still
see it. The `%%` delimiters are drawn by CSS (`::before`/`::after`), so the
typed syntax stays visible while the document holds only the meaning.

**Semantics are private-to-the-author, not "AI-ignore".** A comment that the
compiler skips but the linker reads is not a comment. So the same text is
absent from:

- the AI — chunked reads (`read_first_chunk`…), `read_content`, @mentions and
  attachments, charter bodies in the system prompt, search excerpts, the
  client-side outline previews, and the "document currently reads" dump
  apply_diff returns on a miss;
- the public site;
- the `searchText` column (written stripped on every save path). The author's
  in-page find still works because it reads the live editor DOM.

It is **present** in: the editor, the Y.Doc, the source-view markdown (as
`%%…%%`), markdown/HTML/JSON export, and duplicates/templates.

## 2. Architecture — one predicate, explicit at each seam

`stripPrivateContent(json)` in `lib/domain/content/private-content.ts` is pure
JSON: it drops `privateBlock` nodes and any inline node carrying the
`privateText` mark, collapses a paragraph/list item that stripping emptied, and
leaves structural cells (tables) in place. It is called **explicitly** at every
seam that turns note JSON into reader-facing text:

| Seam | Where |
|---|---|
| search column + `read_content` | `extractSearchTextFromTipTap` (`lib/domain/content/search-text.ts`) |
| chunked AI reads | `chunkDocument` (`lib/domain/ai/tools/chunking.ts`) |
| mentions / attachments | `resolveNote` (`lib/domain/ai-context/source-resolver.ts`) |
| charter bodies → system prompt | `renderCharterSection` / `…Plain` (`lib/domain/ai/charters/render.ts`) |
| public page | `TipTapContent` (`components/public/TipTapContent.tsx`) |
| client outline previews | `buildOutline` via `visibleTextOf` (`lib/domain/editor/ai/visible-text.ts`) |
| apply_diff context + dump | `visibleTextBetween` in `ChatPanel.tsx` |

The client-side editing tools work on the live ProseMirror node rather than
JSON, hence the `visibleText*` twins with the same rule.

**Why not inside `tiptapToMarkdown`?** The source-view toggle and the AI reads
share that serializer, and the author must still see their private text in
source view. Stripping there would silently rewrite the note on every toggle.
`pnpm private:content:check` asserts both halves: every listed seam calls the
predicate, and `markdown.ts` does not.

**Why is rendering faithful everywhere?** The cloze mark hides itself with a
blank server `renderHTML`; private content does not. Server twins render the
same `span[data-private=text]` / `div[data-private=block]` as the client, so
`generateJSON(generateHTML(node))` is symmetric and the lossless-markdown codec
round-trips. Hiding is a JSON strip before serialisation, never a blank render;
`.public-prose [data-private] { display: none }` exists only as a net.

## 3. Markdown

- Inline: `%%text%%` — `dgPrivateText` turndown rule out, `privateText` codec
  `reTag` back in (skipping `<pre>`/`<code>`, where `%%` is content — Mermaid's
  `%%{init}%%`).
- Block: `%%` / blank line / body / blank line / `%%` — the `privateBlock` codec
  at top level, `dgPrivateBlock` turndown rule when nested; one unanchored
  `reTag` reconstructs both.
- Literal `%%x%%` in ordinary prose re-parses as private, fails self-verify,
  and fences. Lossless, just opaque; the gate has a fixture for it.

## 4. Adding a new reader

If you add a path that hands note content to a model, a visitor, or an index:

1. Call `stripPrivateContent` on the JSON (or `visibleText*` on a PM node)
   before anything reads text out of it.
2. Add the file to `SEAMS` in `scripts/validate-private-content.ts`.
3. Mutation-test it: remove the call, run `pnpm private:content:check`, watch
   it fail, put the call back.

The same command runs `scripts/validate-private-content-editor.ts`, which
drives a real TipTap editor under jsdom through every affordance in §1. Add a
scenario there when you change the toggle, the input rule, or the Enter form.

## 5. Known edges

- `replace_document` rewrites the whole note from markdown the model composed
  without seeing private content, so private text inside the rewritten body is
  lost — the same as any whole-document rewrite. The tool is prompt-gated to
  explicit "rewrite everything" requests.
- Private blocks carry no `blockId`, so `insert_block` / `update_block` cannot
  address them, which is the intent.
- Hocuspocus must be redeployed after a merge that adds these node types; an
  older collab server rewrites them to `unsupportedInline` / `unsupportedBlock`.
