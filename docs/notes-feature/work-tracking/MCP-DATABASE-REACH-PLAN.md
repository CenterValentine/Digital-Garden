---
title: MCP Database Reach — find garden content and use it, databases first
status: 🟡 BUILDING — M1 + M2 on `feat/mcp-server` (2026-10-13); M3 OAuth, M4 in-chat client and the authorship signal remain
created: 2026-10-07
last_updated: 2026-10-07
owner: davidvalentine
extends: MCP-PLAN.md
---

# MCP Database Reach

**Status: 🔭 Planned.** This is a model of the Digital Garden MCP server with one job: let an
external agent (Claude Code, Claude Desktop, any MCP client) **find** content in the garden and
**use** it, with databases as the first-class case. It extends [MCP-PLAN.md](MCP-PLAN.md), which
settled transport (Streamable HTTP on a Next route via `mcp-handler`), token auth and the "adapter,
not new capability" rule. That plan has no database surface at all; this one supplies it.

Everything below is symbol-anchored to code that exists on `main` as of 2026-10-07. Where a
service is missing, §6 lists it as adapter work rather than pretending it exists.

---

## 1. What "use a database" means from outside

Inside the app, chat already reaches databases through `createDataTools` in
`lib/domain/ai/tools/data-tools.ts`: `describe_database`, `query_database`, `insert_rows`,
`update_row`/`update_rows`, plus proposal cards for schema changes. Three design facts from that
work carry over unchanged and are the spine of this model:

1. **Right-sized reads.** `query_database` returns an *index tier* (title, a few columns, linked
   titles) at roughly 65 tokens per row, addresses rows by 8-hex handles (`rowHandle`/`parseRowRef`
   in `lib/domain/data/read-format.ts`), and sizes every result in tokens against a threshold.
   Measured on the Career Evidence Library: UUIDs were 49% of a naive result; the index tier made
   whole-library reads possible.
2. **Relations are the data fact.** Relation cells live in `DataRowLink`, resolve by target title or
   handle (`lib/domain/data/server/relation-cells.ts`), and the schema digest names the graph
   (target table, backlink direction, rollup path). A reader that formats `row.data` alone cannot
   see links; that was the original "the product lacks relations" false alarm (PR #231).
3. **Jurisdiction from roots.** `resolveJurisdiction` in `lib/domain/data/server/resolve.ts`
   starts from root tables (bound, attached, charter-referenced, wiki-linked, nested) and follows
   relation columns with `relationReachableTableIds` (4 hops, 64 tables), then checks `canRead`.

An MCP client is a foreign agent with no chat, no approval card and no conversation to supply
roots. So the model replaces each in-app affordance with its MCP equivalent:

| In-app affordance | MCP equivalent |
|---|---|
| Approval card above the token threshold | Hard per-call token cap from the token's scope, plus a cursor. The client pages; nothing is held for a human. |
| Conversation roots (bound table, attachments, mentions) | Token roots: folders and databases named on the token at creation. |
| Proposal cards for schema changes | Not exposed. Schema changes stay in-app. MCP writes rows only. |
| `confirmedByUser` on bulk inserts | A write capability on the token plus a per-call row ceiling; compare-and-set on updates. |

---

## 2. Tool surface

Seventeen tools plus two aliases (§8.4). Three find things; four use databases (query, insert,
update, delete); six write files (note, code, upload, folder, insert block, update block); one
updates AI context; two read chats; one reports issues. Each write family is its own capability
(§4), so a token can be as narrow as "read, plus fill this one ledger".
Every tool resolves a database the way chat does, with `resolveDatabaseRef` (UUID, name, or the
single database in scope), and every tool returns both `content` text and `structuredContent`.

Three tools from the first draft were folded away on 2026-10-11 (owner review): `garden_backlinks`
and `garden_describe_database` into `garden_read` through a `parts` modifier, and `garden_get_rows`
into `garden_query_rows` through `rows` + `columns: "all"`, which is how chat's `query_database`
already works (chat has no separate get tool). Reasoning in §2.5.

### 2.1 Find

| Tool | Input | Backs onto | Returns |
|---|---|---|---|
| `garden_search` | `query` (empty = enumerate recent), `types?` (note, folder, data, file…), `tags?`, `limit` (≤ 50) | the search logic in `app/api/content/search/route.ts`, extracted to a service (§6.1). Matches title, note/html/code/file `searchText`, `DataPayload.searchText` **and** `DataRow.searchText`; a row hit surfaces its table with the matching row's handle | `{ id, type, title, path, snippet, matchedRow? }[]` |
| `garden_list_tree` | `rootId?`, `depth` (≤ 3) | the tree query behind `/api/content/content/tree`, filtered to token roots | folders and leaves with `contentType` and child counts |
| `garden_read` | `id`, `parts?` (default `["body", "tags"]`; may add `"backlinks"`, `"outline"`, and for databases `"profile"`; may omit `"body"`), `backlinkTypes?` (content types to include in backlinks; default every type **except** `conversation`) | type-dispatched like `read_content` in the registry (§2.4 for files): note → `tiptapToMarkdown(stripPrivateContent(json))`; data → `renderDataNodePreview` (the full schema digest from `buildDataSchemaDigest` plus a 25-row index-tier page under 1,500 tokens); folder → listing; external → URL + OG. `"profile"` re-runs the digest with `profile: true` (fill rates, option distributions, samples over up to 5,000 rows). `"backlinks"` calls the service behind `/api/content/backlinks/[id]` | rendered text plus metadata (`updatedAt`, tags; backlinks as `{ id, title, type }[]` when asked); for a database, structured `{ id, title, rowCount, columns: [{ key, name, type, description, config, options?, optionsTotal?, relation?: { targetId, targetTitle, backlinkColumn } }], views: [{ id, name, mode }] }` |

`garden_read` returns **rendered text, not raw TipTap JSON.** Notes come back as markdown from
the lossless serializer, which is the same text `garden_write_note` accepts, so a model reads and
writes in one representation and never has to hand-edit node JSON. Raw JSON is not offered: it
would invite whole-document rewrites that the `dg-block` fence rule (§2.4) exists to prevent.

`garden_search` is the entry point for databases too: `types: ["data"]` with an empty query lists
every database in scope, which is how `search_content` already answers "what databases do I have"
in chat. No separate `list_databases` tool (owner decision, PR #220: widen search, don't add a
niche lister).

**Chat records (owner direction, 2026-10-11): a separate tool set, excluded from content tools.**
Conversations are not ContentNodes (the `chat` content type is a stub); they live in
`Conversation` / `ConversationMessage` and point at content through `ConversationAssociation`
(`contentNodeId`, `source`, `referenceCount`). They have a different shape (messages, tool calls,
outputs, associations), a different size profile (a transcript is usually longer than the note
it discusses) and a different privacy posture, so they get their own tools rather than a type
flag on the content tools. A model that never reaches for a chat tool never sees a chat, which
is the "excluded by default" the owner asked for, enforced by the tool surface rather than by a
default parameter value.

| Tool | Input | Backs onto | Notes |
|---|---|---|---|
| `garden_chats_search` | `query?` (title match; empty = most recent), `about?` (a content id: chats bound to or associated with it), `since?`, `limit` (≤ 20) | `Conversation` + `ConversationAssociation` through the conversation persistence service | Message text is **not** indexed today (no `searchText` on the conversation tables). Body search is a backlog item: a `searchText` column on `Conversation` fed from message text, which the in-app chat list would gain at the same time. |
| `garden_chat_read` | `id`, `parts?` (default `["messages"]`; may add `"associations"`, `"outputs"`, `"diagnostics"`), `range?` (message window; default the last 40) | the transcript renderer behind the conversation routes | Returned as markdown with roles. Quoted note content passes through `stripPrivateContent`; tool payloads are folded the way chat's context diet already folds them (`context-diet.ts`), so a transcript read never replays a bulk database read. |

**The `diagnostics` part** returns what the app already persists per assistant turn in
`ConversationMessage.metadata` and uses to improve chat: the resolved model route (provider,
model, adapter), token usage per segment, `finishReason`, `toolCount`, the turn flags
(`step-cap-hit`, resumed, reserved final step), segment boundaries, fold states from the context
diet, and any recorded error. It is the same vocabulary `pnpm ai:diagnostics:check` pins in
`scripts/validate-turn-diagnostics.ts`, rendered as a per-turn table, so an external agent can do
what the owner does by hand today when a prod turn goes wrong: read the flags and the tool count
before theorising. It never includes provider keys or raw request bodies.

**No chat writes.** One chat writing into another has no use; the only shape where it would make
sense is spinning up garden agents from outside, which is a different feature with its own plan.
Chats stay read-only over MCP.

The content tools keep one pointer into chats: `garden_read` with `parts: ["backlinks"]` and
`backlinkTypes: ["conversation"]` lists the conversations associated with a node as
`{ id, type: "conversation", title, source, lastReferencedAt }`, and the model reads them with
`garden_chat_read`. Nothing else in §2.1 or §2.2 returns chat content.

**Scope.** Chats are not under any folder, so folder roots do not scope them. A token needs a
separate `garden:read-chats` capability, and a chat is in scope when it is bound to or associated
with content inside the token's roots. A per-token `allChats` flag widens that to every
conversation the user owns, for a personal token on a personal garden.

### 2.2 Use a database (read)

| Tool | Input | Backs onto | Returns |
|---|---|---|---|
| `garden_query_rows` | `database`; **selection**: `filters?` (a flat `[{ column, op, value }]` list, ANDed, exactly as `query_database` takes it; the recursive `DataView` tree is not exposed, see §8.3), `search?`, `rows?` (handles or ids, ≤ 100), `view?` (apply a saved view's filters and sorts by name); **shape**: `columns?` (names or `"all"`; default index tier), `relations?` (`titles` \| `handles` \| `counts`), `digests?`; **order**: `sortBy?`, `sortDirection?`, `groupBy?`, `limit` (default 100), `cursor?` | `loadRowPage` or, with `rows`, `resolveRowRefs` → `loadRowsByIds`; then `formatRows`; `loadRowDigests` when asked | rows keyed by handle; `nextCursor`; `truncatedByBudget: true` when the token cap cut the page |

Two shapes, one tool. A **page** call (filters, search or a view) answers "which rows" and
returns the index tier: title, a few columns, one linked title per relation, about 65 tokens a
row. A **fetch** call (`rows` + `columns: "all"`) answers "everything about these rows" and
returns full properties with relation cells expanded to `{ handle, title, tableId }`. The index
tier is the default because it is what made whole-library reads affordable (PR #235); the model
widens on purpose, never by accident.

Following a relation is two calls and no extra tool: a page call with `relations: "handles"`
yields the linked rows' handles and table id, and a fetch call on that table reads them. The
schema in `garden_read` tells the agent which table a relation column points to, so it never
guesses. This mirrors the "a relation cell's value IS its links" rule that kept `link_rows` out
of chat.

### 2.3 Use a database (write, `garden:write-rows` capability)

| Tool | Input | Backs onto | Guard |
|---|---|---|---|
| `garden_insert_rows` | `database`, `rows` (≤ 25, `{ columnName: value }`, relation cells by target title or handle), `dedupeBy?` | `createRows` → `writeRelationLinks`; `refreshTableSearchText` | row ceiling per call; `dedupeBy` returns the existing handle instead of inserting |
| `garden_update_rows` | `database`, `updates` (≤ 25, `{ row, cells, merge?, expect? }`) | `writeCells` in one transaction; relation cells replace, never append | `expect` is compare-and-set: the call fails with the current values when a cell changed since the agent read it. This is the conflict detection the 2026-03 sketch asked for, already built for chat. |

**Type safety on writes.** Every cell passes through `encodeCell` in `lib/domain/data/cells.ts`
before anything is stored, so a wrong-typed value cannot land:

| Column type | Accepts | Rejects |
|---|---|---|
| number | numbers; numeric strings after stripping `, $ £ €` and spaces | any other text (`"abc" is not a number`) |
| date | ISO strings, epoch numbers; time kept only when `config.includeTime` | unparseable text |
| checkbox | booleans, `"true"`, `"false"` | anything else |
| select, status | a known option label or id | an unknown option (`unknownOptionError` names the column and the value) |
| multiSelect | known labels; **freeform** columns mint new options up to `FREEFORM_OPTION_CAP` | past the cap: "turn it into its own database" |
| relation | target row titles or handles | unknown targets |
| file, contentLink | ids of file nodes / content nodes | non-file ids in file cells, non-image mimes when `imageOnly` |
| formula, rollup, lookup, autoNumber, created*/updated* | nothing | every write: "computed and cannot be written directly" |

Updates are **all-or-nothing** (one rejected cell, nothing changes). Inserts are **partial**: rows
are created without their rejected cells and the rejections are reported, matching chat's
`insert_rows`. The tool descriptions state both.

**Serving the right information first.** The model should not need the rejection to learn the
type. The schema it reads in `garden_read` already renders, per column, the type, the user's
description, the option labels (capped at `OPTION_CAP` in text, with `optionsTotal` in the
structured form), number precision and currency, date-with-time, and the relation target with its
backlink column. Two MCP-side additions close the remaining gap: (1) rejections come back
structured as `{ row, column, value, reason, expected }`, where `expected` is derived from the
column type ("a number, e.g. 1234.5", "a date as YYYY-MM-DD", "one of: Draft, Active, Done"), so a
retry is mechanical; (2) the `write` tool descriptions carry a one-line type legend for the eight
rows above. Chat's `update_row` returns the same facts as prose (`summarizeRejections`); MCP keeps
the prose in `content` and adds the structure.

### 2.4 Use files (read and write, `garden:write-files` capability for writes)

The point of vendor compatibility (§8) is that a Claude or OpenAI model can read and write the
garden's files, not only its rows. "File" here means any leaf ContentNode: a note (TipTap JSON),
a code node (`CodePayload`), an HTML node, or an uploaded binary (`FilePayload`). Reads extend
`garden_read`; writes are three tools that each wrap the path the in-app AI already uses.

**Reads.** `garden_read` dispatches on payload type:

| Payload | Returns | Backs onto |
|---|---|---|
| note | markdown, private content stripped; every in-app `/download` link rewritten to a 15-minute presigned storage URL (no MCP client holds a session cookie); `parts: ["images"]` attaches the note's images as MCP `image` blocks (≤ 6, ≤ 4 MB each) — built 2026-10-13, `lib/domain/mcp/media.ts` | `tiptapToMarkdown(stripPrivateContent(json))`, `generateDownloadUrl`, `listNoteImages` |
| code | the source text plus `language` | `CodePayload` |
| html | the text content | `HtmlPayload` |
| file, image mime | the extracted text, a presigned download URL, and the picture itself as an `image` block (vision models) — built; the OCR text for text-only models is backlog | `readImageTextForModel` in `lib/features/ocr/read-for-model.ts` (PR #291) |
| file, PDF | extracted text, page-delimited, capped by the token budget with `nextPage` | `createPDFProcessor` in `lib/infrastructure/media/pdf-processor.ts` |
| file, other | metadata plus a short-lived presigned download URL | the download route's default JSON envelope |

Only the text forms are useful to a model behind a cloud connector. The presigned URL is for
clients that can fetch, such as Claude Code with web fetch.

**Writes.**

| Tool | Input | Backs onto | Guard |
|---|---|---|---|
| `garden_write_note` | `id?` (absent = **create**); `title?` (required on create); `parentId?` (see placement below); `content` (markdown); `mode`: `append` (default) \| `replace`; `expectUpdatedAt?` | `markdownToTiptapResult` → `linkifyWikiRefsInTiptap` → `writeNoteContent` (`lib/domain/content/write-note-content.ts`), which writes **through the Y.Doc** and never to `NotePayload` directly. Without `id`, the create-document service runs first, then the same write. | `expectUpdatedAt` is compare-and-set on `replace`, required as in D2. `append` needs no expectation: it adds blocks and cannot lose edits. |

**Placement on create.** No `id` means create; that is the whole signal, so one tool covers both.
`parentId` is optional only when the token has exactly one root folder, which then becomes the
default. Otherwise it is required and the error names `garden_list_tree` as the way to choose. A
note is never created at the garden root: an external agent with a wide token would otherwise
pile notes there, and chat avoids the same thing with output placement (`output-target.ts`), which
MCP lacks because there is no bound content. The description tells the model to look at the tree
first and land the note where the user already keeps that kind of thing.
| `garden_write_code` | `id` **or** `parentId` + `title` + `language`; `code` | the `CodePayload` update path behind `PATCH /api/content/content/[id]` | compare-and-set on existing nodes |
| `garden_upload_file` | `parentId`, `filename`, `mimeType`, **one of** `base64` or `sourceUrl`, `overwriteContentId?` | the service behind `POST /api/content/content/upload/simple` (accepts `parentId` and `overwriteContentId`; overwrite keeps the node id via `overwriteFileNode`); `sourceUrl` streams the remote bytes into storage through the existing external-URL validation | `base64`: 2 MB decoded. `sourceUrl`: the storage provider's limit, SSRF-guarded. See "The 2 MB limit" below. |

**The 2 MB limit, and what it means in practice.** It applies to `base64` only, and it comes from
Vercel's 4.5 MB request-body cap: base64 inflates bytes by a third, and the JSON-RPC envelope needs
room, so 2 MB decoded is the safe ceiling per call. But the real limit is lower and comes from the
other side: a model does not upload files, it *emits tool-call arguments*, and base64 costs
roughly one token per three bytes. A 2 MB file is about 700k output tokens; no model can produce
that. The practical reach by caller:

| Caller | What `base64` can carry | Examples |
|---|---|---|
| A cloud model (Claude via the Messages API, GPT via Responses, ChatGPT, claude.ai) | what it can generate in one tool call, in the low hundreds of KB at most | a CSV it computed, an SVG diagram, a small `.docx` or `.ics` it built, a code file |
| A local harness that attaches existing bytes (Claude Code, Codex, Gemini CLI, a script) | up to 2 MB, paid for in context tokens | a screenshot, a phone photo after compression, a short text PDF, a spreadsheet export |
| Anything larger | not through `base64` | scanned PDFs, raw camera images, audio, video, EPUBs, slide decks with images |

`sourceUrl` exists for the third row: the model hands over a link and the server fetches and
streams the bytes, so nothing passes through the model's output. That covers "save this PDF from
the web into the library", a file already hosted in a vendor's Files store that exposes a URL, or
a presigned link a script obtained. Use cases this still gives up: a cloud model attaching a file
the *user* uploaded to the chat and that has no fetchable URL, and any local file from a harness
that is over 2 MB. Both are the app's own uploader's job, or a later presigned-PUT pair of tools
for scripts that can `curl`.
| `garden_create_folder` | `parentId`, `title` | the Create Folder tool's service | find-or-create, like the in-app tool |

Why `append` is the default: the lossless markdown system round-trips a note through
per-block self-verification, and blocks it cannot express as pretty markdown come back as verbatim
base64 `dg-block` fences. A model that reads a note and rewrites the whole thing must preserve
those fences byte for byte or the block is lost. Appending never touches them. The `replace`
description says this in plain words, and `garden_read` marks fenced blocks with a one-line
notice so the model knows they are opaque.

Not exposed, deliberately: column create/rename/retype, relation pairs, `applyLinkedSchema`, row
delete, promotion, note delete, move.

### 2.5 Whole-database reads ("give me the entire evidence bank") — approved 2026-10-11

A model asked for an entire table has one correct behaviour: read the schema, choose the columns
the task needs, page with `garden_query_rows` until `nextCursor` is null, and state its coverage.
The tool shape makes the honest path the easy path:

- Every result carries `{ returned, total, nextCursor }`. A model cannot truthfully say "all 312
  rows" without having seen `nextCursor: null`, and the description says so.
- The per-call cap is a **paging** control, not an approval. Chat's 6k default exists to trigger
  an approval card; MCP has no card, so the token's `readTokenCap` defaults to 12k and the model
  pages. At the measured 65 tokens a row, a 300-row evidence library is about 20k tokens in the
  index tier, two pages; the whole Career Evidence Library measured 22.7k nested.
- Narrowing is the lever. `columns` picks what matters, `relations: "counts"` drops linked
  titles, and a saved `view` applies the user's own filter. A model that pages a full-column read
  of a wide table is doing it wrong, and the description says to start from the index tier.
- **Resources get a larger budget than tools.** When the *user* attaches
  `garden://database/{id}/view/{viewId}` in Claude Desktop or Claude Code, a human chose to put
  the table in context, which is the same act as chat's "Ingest in full". Resource reads therefore
  use `INGEST_MAX_TOKENS` (60k) from `lib/domain/ai/charters/ingest.ts` rather than the tool cap,
  and return the view's rows in one piece up to that size. A table past 60k is cut at the cap
  with a trailing line naming `garden_query_rows` for the rest.
- A `format: "csv"` option on `garden_query_rows`, backed by `exportDatabaseCsv`, is the dense
  fallback for very large reference reads: roughly half the tokens of the index tier, with a
  handle column kept so rows stay addressable. Deferred until a real need; the index tier plus
  paging covers the evidence-bank case today.

### 2.6 Raw TipTap JSON versus the serializer

The reads and writes above use the lossless markdown serializer rather than raw TipTap JSON.
The trade, so it is not re-litigated:

| | Raw TipTap JSON | Lossless markdown |
|---|---|---|
| Fidelity | exact by definition | lossless **by per-block self-verification**: a block is pretty-printed only if it re-parses deep-equal, else it is emitted verbatim as a base64 `dg-block` fence |
| Tokens | 3 to 5× the markdown | compact; what models read and write natively |
| What the model must know | the node schema, attrs for every custom block, marks, `TIPTAP_SCHEMA_VERSION` drift | markdown, plus "leave fences alone" |
| Write failure mode | an unknown or malformed node is rewritten to `unsupportedBlock` by the sanitizer (content kept, structure lost) | a block the codec cannot express stays opaque in a fence; a model editing a whole note can drop or mangle the fence |
| Known defect class | none at the format level; defects move to the model's hand-edits | the cross-block join on re-parse that self-verify does not check, e.g. two adjacent lists merging (the accordion codec seam, PR #260) |

The defects the owner is conscious of live in that last row: a block round-trips, but its
*neighbour relationship* changes. They are rare, they do not lose content, and the first MCP cut
is weighted toward new notes and simple documents where typed blocks are few. So the serializer
is the right default and raw JSON is not offered for writes. **Standing awareness (owner,
2026-10-12): the lossless process is not yet confirmed perfect.** It is trusted, not proven, and
every serializer-driven write is treated as one that could need recovery.

**Conversion backup (prep work, see §6.8).** `ContentHistory` already exists in the schema
(`contentId`, `version`, `snapshot` Json, `changedBy`, `changedAt`) and has **no writer anywhere
in the app**. Before every serializer-driven write of an existing note (MCP `replace` and
`append`, chat's `update_note`, the source-view toggle and paste-as-markdown), write one
`ContentHistory` row holding the pre-write TipTap JSON, with `changedBy` the acting user and a
`source` tag in the snapshot envelope naming the path. Then the user always has the last
good document, and a "Restore previous version" affordance is a read of that row plus a write
through the Y.Doc. The table is there; the work is one helper (`recordPreWriteSnapshot`) called
at four sites and a gate that asserts each site calls it. A read-only `format: "tiptap"` on
`garden_read` is cheap to add later for harnesses that want exact structure; it is deferred, not
rejected. The D5 gate (fence survives `replace`) and the existing `markdown:blocks:check` gate are
where the serializer's guarantees are pinned.

### 2.7 Provisioning for typed blocks (not now, but shaped now)

The owner's direction: a service that writes **registered blocks** into a document, with the
markdown carrying a reference to each block rather than its body, so that an agent can draft
published content fast (hero, pricing, testimonial, timeline, and the rest of the publishing
block set) without hand-building node JSON. Two findings make this cheap to provision:

1. **Chat already has the service, and it covers the whole palette.** `lib/domain/ai/tools/editor-tools.ts`
   exposes `insert_block { blockType, attrs, content, afterBlockId }`, `list_document_blocks` and
   `update_block { blockId, attrs }`, built from the insert catalog and `buildBlockNode`, validated
   against each block's definition in `lib/domain/blocks/registry.ts` (`registerBlock`,
   `getBlockDefinition`). **Both block families register there**: the 25 publishing blocks in
   `extensions/publishing/blocks/` (hero, pricing, testimonial, timeline, …) and the 26 editor
   palette blocks in `lib/domain/editor/extensions/blocks/` (columns, tabs, card panel, section
   header, pull quote, table of contents, Mermaid, Excalidraw, the form inputs, habit tracker,
   stopwatch, daily and weekly summaries, …), plus the calendar and TTS blocks. Every definition
   carries `attrsSchema` (Zod), `defaultAttrs`, `aiHint`, `family`, `group`, `contentModel` and
   `atom`, so a tool can validate attrs, know whether a block takes nested content, and describe
   itself to a model from the registry alone. "Tooling for DG's internal chat" therefore exists
   for the entire palette; what it lacks is the markdown-side reference syntax.

   **The take on the editor palette (owner question, 2026-10-11):** nothing block-specific is
   needed for MCP. `garden_insert_block` mirrors `insert_block` over the same catalog, so it
   covers the editor blocks and the publishing blocks on day one, and any block registered later
   appears in both chat and MCP without a tool change. The split that matters is not editor
   versus publishing but **how a block gets into a document**: typed blocks go in through the
   block tools with validated attrs, and prose goes in through markdown. Only seven block types
   have markdown codecs today (callout, heading, private block and text, accordion, note window,
   wiki link), so every other palette block written *as markdown* arrives as an opaque fence.
   Until the reference codec lands, the tool descriptions say: prose in `garden_write_note`,
   blocks in `garden_insert_block`, and a block's nested content (columns, tabs, card panel,
   which have a `contentModel`) as markdown in that call's `content`, which is what chat's
   `insert_block` already accepts. `garden_read` with `parts: ["outline"]` lists each block with
   its `blockId`, type and attrs, so a model can see the palette in use before adding to it.
2. **The reference syntax has two precedents already in the serializer.** `dg-block` fences carry a
   block inline (base64 JSON, opaque). Wiki-link block embeds, `![[Title]]{#id block=…}` from
   `lib/domain/content/wiki-link-markdown.ts`, carry a block **by reference** to a block id in
   another note. A registered-block reference is the second form pointed at a block catalog
   instead of a note: something like `![[block:hero#b7a3f91c]]` or a fenced `dg-ref` whose body is
   a block id, resolved on parse by looking the block up, and emitted on serialize by writing the
   reference back. That is one codec in `markdown-block-codecs.ts` with a `toMarkdown` and a
   parse-side `reTag`, which is exactly the shape every other codec has.

What this plan provisions so the later work drops in without reshaping anything:

- **MCP mirrors the chat block tools now, not later** (owner, 2026-10-12: the service exists, so
  include it). Behind `garden:write-files`: `garden_insert_block { noteId, blockType, attrs,
  content?, afterBlockId? }` and `garden_update_block { noteId, blockId, attrs }`, each a thin
  wrapper over the same catalog and `buildBlockNode`, writing through the Y.Doc. There is no
  separate list tool: `garden_read` with `parts: ["outline"]` lists blocks with their `blockId`,
  type and attrs, which is `list_document_blocks` in read form. Two tools, shipping with the
  file writes.
- **Block ids are the reference key everywhere.** `list_document_blocks` already returns
  persisted `blockId` attrs; MCP uses the same ids, never the ephemeral `b7#…` handles of
  `append_to_document`, which are per-turn and never persisted (PR #244).
- **`garden_write_note` content stays markdown parsed by `markdownToTiptapResult`.** When the
  reference codec lands, markdown containing block references parses into real blocks through the
  same call, for chat and MCP alike, with no tool signature change.
- **Where registered blocks live** is the one open design question, and it is a product one:
  a block library as rows in a database (fits the structured-data loop and makes blocks
  queryable), or blocks as nodes under a folder (fits "existing structure is the path"). Decide
  it in its own plan; nothing here depends on the answer.

### 2.8 AI context, deletion, and issue reporting (owner round, 2026-10-12)

**AI context.** The app keeps a per-node AI context in `AgenticMetadata` (`nodeId` unique):
a structured context document (`tiptapJson` with sections and a one-liner), `derivedText`,
`sourceContentHash` for hash-based staleness, `contextDirty` set by edits, `summaryHash`, and
`contextOptOut`. Folder capsules are assembled from it (`assembleFolderCapsule`), freshness is
gated by `ensureFolderContextFresh`, and `refreshContextOnAccess` in
`lib/domain/ai-context/context-refresh.ts` already does the "self-improving on read" shape
in-app: refresh on access only when the hash says the context is stale, under a daily call cap.
None of that was in the first draft of this plan. Now it is, in two places:

| Tool | Behaviour |
|---|---|
| `garden_read` (any node) | includes `aiContext: { oneLiner, sections, updatedAt, stale, optedOut }` by default; `parts` may omit `"context"`. `stale` is the existing hash-or-dirty test. For a folder this is the capsule; for a note it is the note's own context. **MCP reads never trigger a refresh**, for the D4 reason: a refresh spends the owner's model keys. The read reports staleness; the agent that noticed it does the work with its own model. |
| `garden_update_ai_context` | `id`, `oneLiner?`, `sections?` (`{ kind: text }`), `mode: merge \| replace` (default merge). Writes through the same metadata writer chat uses, recomputes `sourceContentHash`, clears `contextDirty`, respects `contextOptOut` (refuses with the reason). Behind `garden:write-files`. |

The description on `garden_read` says: *if `aiContext.stale` is true and you have just read the
whole node, update its context before you finish.* That gives every MCP agent the in-app
behaviour without the in-app spend. "Only when significantly out of date" is the existing gate;
if the hash test proves too eager, tune it in `context-refresh.ts` and both surfaces follow.

**Row deletion: earmarked, implementable now.** `softDeleteRows` and `restoreRows` exist in
`mutations.ts`, so a delete is reversible. The question is only consent.

| | |
|---|---|
| Tool | `garden_delete_rows { database, rows (≤ 25), reason }` behind a separate `garden:delete-rows` capability |
| Policy | per database, `aiPolicy.delete: "confirm" \| "allow" \| "deny"`, default `confirm`, stored as a Json bag on `DataPayload` next to `rowDigests` (config over enum members, Database II D11) |
| `confirm` | the server asks the **user** through MCP **elicitation** when the client declared that capability (2026-era: on the request envelope; 2025-era: at `initialize`). **Rows the assistant inserted itself need no ask** (revision 2026-10-21 below). A client that cannot be asked gets the assistant's own rows deleted and the user's rows *held* and named: "this client cannot confirm; delete in the app or allow deletes for this database". A model-set `confirmedByUser` flag is not consent and is not offered. |
| `allow` | soft-delete, audit row, and an in-app notification through the existing notifications route ("token X deleted 12 rows from Y, Restore"), so the user sees it and can undo |
| `deny` | refuse |
| Settings | the per-database switch lives in the schema rail beside the digests switch, and a control-panel section under AI context lists every database's policy. Both persist through the same PATCH; a settings section needs its four registrations. |

Why elicitation and not a staged deletion: staging needs a new pending state on rows and UI to
resolve it, while elicitation is the protocol's own answer to "ask the human", and the clients
that lack it are the API connectors, where the user is not present anyway.

> **Revision (2026-10-21) — row authorship, and what "a client that cannot ask" really covers.**
> The ChatGPT connector reported it could not remove rows it had written itself: "the connector
> requires a deletion confirmation, but this connection can't display that confirmation prompt".
> Two findings. (1) **No 2025-era client can be asked on this route.** `mcp-handler` serves the
> 2025 era statelessly, so the per-request server never sees the client's `initialize`
> capabilities, and the SDK's legacy shim refuses every input request with exactly that message —
> ChatGPT, Claude.ai, Claude Code and every other 2025-era client hit the same wall, not only
> OpenAI. The `era === "legacy"` branch in `deleteRows` tested a field the request context does not
> have and was dead. The server now reads what the client *declared* (`clientCanElicit` in
> `server.ts`: envelope on the 2026 era, `initialize` on the 2025 era) instead of trying and
> catching. (2) **An assistant could not tell its own rows from the user's.** `DataRow.createdBy` is
> the user on every path, so the policy asked about everything. `DataRow.draftedBy / draftedByRef /
> draftedAt` (migration `20261021180000_data_row_drafted_by`, same vocabulary as content
> authorship: `"ai-chat"` with the conversation, `"mcp"` with the token) is stamped once by
> `insert_rows` and `garden_insert_rows`; `lib/domain/data/authorship.ts` is the rule. Under
> `confirm`, a set of only AI-drafted rows deletes at once with an inbox notice on both surfaces
> (chat's `needsApproval` returns false; the MCP skips the ask); a mixed set asks when it can,
> and otherwise deletes the assistant's own rows and **holds** the user's, naming them in the
> result and the notice; a user-only set on a client that cannot ask is refused with the remedy.
> `allow` and `deny` are unchanged. Rows from before the column read as the user's — nothing
> recorded who inserted them, so there is no honest backfill. Gates: `data:delete-policy:check`
> (section C) and `mcp:surface:check`; smoke `pnpm mcp:rows:smoke`.

**Issue reporting.** PR #211 (merged 2026-10-12) ships `POST /api/feedback`: templates and an area allowlist in
`lib/domain/feedback/issue-templates.ts` (`composeIssue`), filing to GitHub through
`GITHUB_FEEDBACK_TOKEN`, rate-limited 5/h and 15/day, with a `feedback:check` gate. Once it
merges, MCP wraps it:

| | |
|---|---|
| Tool | `garden_report_issue { kind: "bug" \| "feature" \| "small-change", title, body, area?, diagnostics? }` → `composeIssue` → the same filing service, labelled `source:mcp`, with the token name in the body and the same rate limits applied per token |
| Directing the agent | three layers, none of them a prompt hack: (1) the server's `initialize` result carries `instructions`, the protocol's own place for standing guidance, saying *if a garden tool fails twice with the same internal error, or a result contradicts what you just read, file it with `garden_report_issue`*; (2) every internal error result carries `reportable: true` and a prefilled `issue` body (tool, input shape, error id, no content), so filing is one call; (3) an MCP **prompt** named `report-garden-issue` for clients that list prompts, so a user can invoke it by hand |
| Caveat | the repo is public and PR #211 already warns the user; MCP filings carry the same warning in the tool description and strip note content from the prefilled body |

Dependency satisfied: PR #211 merged 2026-10-12 (`c2526747`), so `POST /api/feedback` and
`composeIssue` are on main and the tool can ship with M1.

### 2.9 Why three tools were folded (2026-10-11)

**Backlinks into `garden_read`.** The route behind `/api/content/backlinks/[id]` loads every
inbound link with one `findMany` and no pagination, so a separate tool could offer nothing the
modifier cannot. The one use case worth protecting is cheap graph traversal, reading backlinks of
many nodes without their bodies, and `parts: ["backlinks"]` with `"body"` omitted keeps it. What
is given up: paging past a cap on a hub note with hundreds of inbound links. The route cannot do
that today either, so nothing real is lost; `garden_read` caps the list at 50 and reports the
total.

**Describe into `garden_read`.** `renderDataNodePreview` already *starts* with the full schema
digest and appends a bounded index-tier page, so reading a database was already a describe. The
only thing `describe_database` added was `profile: true`, which scans up to 5,000 rows for fill
rates, option distributions and samples. That is now `parts: ["profile"]`. One fewer tool to pick
between, and the habit the PR #235 smoke exposed (models calling describe out of reflex) has no
tool to land on.

**Get into `garden_query_rows`.** Chat never had a get tool; `query_database` takes `rowIds` and
`columns: "all"`. The MCP draft had split that into two tools for clarity of description, but the
split invites the wrong call (a page call to fetch one row, or a fetch call to filter). One tool
with a selection group and a shape group makes the choice explicit in the schema instead. Those are either proposal-card flows that need a human in the app or
destructive. An agent that wants a new column says so in its answer; the user adds it in the grid
or through chat. Revisit after M2 of MCP-PLAN has an audit trail worth trusting.

---

## 3. Resources

Resources are how a *user* attaches garden content to a conversation without the model calling
anything. Four templates:

| URI template | Serves | Backs onto |
|---|---|---|
| `garden://note/{id}` | markdown of a note, private content stripped | `tiptapToMarkdown(stripPrivateContent(json))` |
| `garden://database/{id}` | schema markdown | `renderDatabaseSchemaMarkdown` |
| `garden://database/{id}/view/{viewId}` | the first page of that saved view (its filters, sorts, column prefs), index tier | `loadTable` for the view → `loadRowPage` → `formatRows` |
| `garden://row/{tableId}/{rowId}` | one row's properties block | `loadRowsByIds` → `buildRowPropertiesBlock` |
| `garden://file/{id}` | a code, HTML, image or PDF node as text, per the §2.4 read table | the same dispatch as `garden_read` |

The view resource is the product-principle move. Users already maintain views as the way they
look at a table; exposing *those* as the resource catalog means the structure they keep for
themselves is the structure an agent gets, with no parallel "MCP export" to curate. `resources/list`
enumerates databases in scope and their views; the agent sees "Job Candidates › Active" as a
pickable resource.

Subscriptions stay out of scope (MCP-PLAN §7). `loadRowChanges(tableId, since)` exists if a
change feed is wanted later.

---

## 4. Auth and scope

**Token.** A new `McpToken` Prisma model, a sibling of `BrowserExtensionToken` (schema line ~936)
and `ServiceToken`: `userId`, `name`, `tokenHash` (SHA-256 hex, unique), `tokenPrefix`,
`expiresAt`, `revokedAt`, `lastUsedAt`, plus two fields those models lack:

- `capabilities: String[]` — `garden:read`, `garden:read-chats`, `garden:write-rows`, `garden:delete-rows`, `garden:write-files`, `garden:report-issues`. Rows, deletes and files are separate grants so a token that fills a ledger cannot rewrite notes or empty a table; chats are a separate grant because they are not scoped by folder roots (§2.1).
- `allChats: Boolean` — widens `garden:read-chats` from chats associated with in-scope content to every conversation the user owns.
- `rootIds: String[]` — ContentNode ids (folders or databases) that scope the token.

Token string `dgmcp_` + 48 hex; validation copies `validateBrowserExtensionToken` in
`lib/domain/browser-bookmarks/auth.ts` (hash, look up, reject revoked/expired, stamp
`lastUsedAt`). The route is added to `NON_SESSION_401_PREFIXES` in
`lib/infrastructure/auth/session-interceptor.ts` so a bad token does not sign the owner out, and
`proxy.ts` must let `/api/mcp` through without a session cookie the way `/api/integrations` is.

**Jurisdiction.** A node is reachable when it is inside the subtree of a root, or it is a database
reachable from a root database through `relationReachableTableIds` (4 hops, 64 tables, the same
walk chat uses). Then `canRead` / `canWrite` from `lib/domain/data/server/access.ts` apply as the
owner's own checks. The adapter never decides access; it passes `{ userId, roots }` into the same
resolver chat uses. See D1 for whether relation reach should be on by default.

**Budgets.** Per call: the token's `readTokenCap`, defaulting to the user's
`ai.bulkReadTokenThreshold` (6k). The ceiling is enforced in `formatRows` sizing, which already
returns a truncated page; MCP surfaces that as `truncatedByBudget` plus `nextCursor`. Per day: a
call cap on the token, recorded the way `lib/domain/ai-context/context-spend.ts` records folder
context spend. Every call writes an audit row (actor = token id, tool, target ids) through the
existing admin audit logging.

**Private content.** The MCP read module is a new egress seam. It must call `stripPrivateContent`
and be added to `SEAMS` in `scripts/validate-private-content.ts`, or `pnpm private:content:check`
will not know it exists and commented-out prose will reach Claude Desktop. Rows have no private
mark today, so database reads need no strip; note bodies do.

---

## 5. A walkthrough

Claude Code, with the garden MCP attached, is asked: *"Which experiences in my Career Evidence
Library have no claims attached, and what are their dates?"*

1. `garden_search { query: "career evidence", types: ["data"] }` → the library's tables with ids.
2. `garden_read { id: "<Experiences>" }` → the schema, including
   `Claims (relation → Claims and metrics, backlink: Experience)`, plus a 25-row glimpse.
3. `garden_query_rows { database: "Experiences", filters: [{ column: "Claims", op: "isEmpty" }], columns: ["Title", "Start", "End"], relations: "counts" }` → handles and dates, well under the cap.
4. The agent answers with titles and dates and offers to draft claims. If the user says yes and the
   token carries `garden:write-rows`:
5. `garden_insert_rows { database: "Claims and metrics", rows: [{ Claim: "...", Experience: "Led migration to Neon" }] }` → relation cell resolves by title; the new row's handle comes back.

Five calls, no approval UI, nothing read that the token's roots do not cover.

---

## 6. Adapter work (the gaps that exist today)

1. **Extract a shared search service.** `app/api/content/search/route.ts` and the `search_content`
   tool in `lib/domain/ai/tools/registry.ts` run separate Prisma queries; only the route searches
   `DataRow.searchText`. Pull the route's logic into `lib/domain/content/search-service.ts` and
   call it from the route, the chat tool and MCP. Chat gains row-text search for free.
2. **`McpToken` model + migration.** Additive. Hand the owner the `prisma migrate dev` script per
   the migration handoff convention; `prisma/` is owner-protected.
3. **Settings page.** Replace the stub at `app/(authenticated)/settings/mcp/page.tsx`: create
   token (shown once), pick roots with the canonical content picker, tick capabilities, revoke.
   Four registrations apply if any setting persists through the settings store.
4. **MCP module.** Import domain services directly. `data-tools.ts` cannot be loaded standalone
   under tsx (it pulls TipTap through quests), so the MCP tools must not import it; they call
   `lib/domain/data/server/*` and `read-format.ts` the way `data-tools.ts` does, sharing the
   formatting helpers rather than the tool wrappers.
5. **Seam registration.** Add the MCP read module to `SEAMS` in `scripts/validate-private-content.ts`
   and mutation-test the gate (remove the strip, confirm it fails).
6. **Route + handler.** `app/api/mcp/[transport]/route.ts` via `mcp-handler`, stateless sessions.
   Pin `@modelcontextprotocol/sdk` and record the spec revision in this doc.

7. **The settings page, fully.** The stub at `app/(authenticated)/settings/mcp/page.tsx` shows an
   enable switch, a server URL field and a "Connect to Claude Desktop" button. What the design
   actually needs on that page, none of it addressed by the stub:

   | Section | Contents |
   |---|---|
   | Server | enable switch (switch = persists now, per the fieldset grammar); the server URL, read-only, with copy buttons for each client's config snippet: Claude Code command, Codex config block, Gemini CLI settings block, claude.ai and ChatGPT "add connector" URL |
   | Tokens | list (name, prefix, capabilities, roots, created, last used, expiry); create (shown once); rename; revoke. Per token: `readTokenCap`, daily call cap, `allChats` |
   | OAuth clients | the clients that registered themselves through dynamic client registration (claude.ai, ChatGPT, Gemini CLI), each with its granted token; revoke |
   | Audit | the last N calls per token (tool, target ids, outcome, tokens returned), from the admin audit log, with a filter |
   | AI context and deletion | not here: the per-database `aiPolicy.delete` lives in the control panel under AI context and in each schema rail (§2.8) |
   | External servers (M4) | the client side of MCP-PLAN §4: register a server (name, URL, auth header), per-tool allowlist, approval mode; a separate section because it is the opposite direction |

   Every section that persists goes through the settings store's four registrations; the
   "Connect to Claude Desktop" button becomes the Claude Code snippet, since Desktop connects by
   OAuth and needs no button.

8. **Prep PR (owner direction, 2026-10-12).** A preliminary PR that lands the pieces valuable
   on their own, before any MCP code, so the MCP PR is adapter work only:

   | Item | Why it stands alone | Status |
   |---|---|---|
   | `recordNoteHistory` → `ContentHistory` at every serializer-driven write, plus a gate | recovery for every markdown-driven write the app already does | ✅ `feat/mcp-prep` |
   | the shared search service (§6.1) | chat gains row-text search; one query instead of two | ✅ `feat/mcp-prep` |
   | chat body search | the in-app chat list gains body search | ✅ `feat/mcp-prep` — over per-message `textCache`, no column (revisit if slow) |
   | seam registration of the new read module in `validate-private-content.ts` | the gate learns the seam before the seam has traffic | ✅ `feat/mcp-prep` (`lib/domain/mcp/read.ts`) |
   | `McpToken` model and migration, with the handoff script | additive, deploys ahead of code, and the settings page can be built against it | ✅ `feat/mcp-prep` + helpers + `/api/mcp/tokens` |
   | `aiPolicy` Json on `DataPayload` with the `delete` key and the schema-rail switch | the in-app AI can honour the same policy on its own `softDeleteRows` path today | ✅ PR #296 |
   | search off Cmd+/ (the owner's extra prep item) | the editor's comment-out toggle shared the chord | ✅ `feat/mcp-prep` — Cmd+Shift+F |

   Order as built: the prep PR (#297), then the server (M1 + M2 together on `feat/mcp-server`), then the authorship signal, which attaches to the same write services the server already calls.

Proposed layout:

```
lib/domain/mcp/
  server.ts          createGardenMcpServer(ctx): registers tools + resources
  auth.ts            validateMcpToken, McpContext { userId, roots, capabilities, readTokenCap }
  jurisdiction.ts    reachableNodeIds(ctx), reachableTableIds(ctx) — wraps relationReachableTableIds
  tools/find.ts      garden_search, garden_list_tree, garden_read, garden_backlinks
  tools/data.ts      garden_describe_database, garden_query_rows, garden_get_rows,
                     garden_insert_rows, garden_update_rows
  resources.ts       the four garden:// templates
app/api/mcp/[transport]/route.ts
scripts/validate-mcp-surface.ts   gate: every tool's input schema parses the fixtures; every
                                  read tool is annotated readOnlyHint; write tools require the cap
```

---

## 7. Decisions for the owner

| # | Question | Recommendation | Why it is yours |
|---|---|---|---|
| D1 | Should a token reach databases by relation from its roots (chat's 4-hop walk), or only the explicit subtree? | Relation reach **on**, capped as in chat, shown in the token's settings row as "also reaches: …" | It trades convenience (a token on the library root sees all linked tables) against least privilege. **Approved 2026-10-11.** |
| D2 | Is `expect` (compare-and-set) required on `garden_update_rows`, or optional? | **Required** for MCP. Chat has a human watching; a foreign agent does not. | A silent overwrite from outside is the lost-edit class of bug. **Provisionally approved 2026-10-11, still under review.** |
| D3 | Does `garden_read` on a database return the 25-row preview, or redirect the agent to `garden_query_rows`? | Preview, with a trailing line naming `garden_query_rows` and the row count. | Matches `read_content` today and keeps "read this" working for small tables. **Provisionally approved 2026-10-11, still under review.** |
| D4 | Expose row digests (`DataRowDigest`) over MCP? | Yes when present, never trigger a refresh from MCP. | Digest refresh costs model calls on the owner's keys; an external agent should not spend them. **Approved 2026-10-11.** |
| D5 | Ship `garden_write_note` with `replace`, or `append` only until a gate covers the `dg-block` fence round trip? | **Append only** in the first cut; add `replace` with the gate. | A whole-note rewrite from outside is the one file write that can lose a block silently. |

---

## 8. Client compatibility: Claude and OpenAI

> **Revision note (2026-10-13):** the server is built on `mcp-handler` 2.x / `@modelcontextprotocol/server` 2.x, which serve the **2026-07-28** protocol natively (stateless, per-request envelope, `inputRequired` multi-round-trip for elicitation) with a fallback for 2025-era clients. That spec revision **deprecates dynamic client registration** in favour of **client-ID metadata documents (CIMD)**: a hosted OAuth client identifies itself with an HTTPS URL serving its metadata. Every mention of DCR below should be read as "CIMD, with DCR for older clients" when M3 is designed.

MCP is one protocol, so one server serves both vendors. The differences are in their clients.
Six consumers matter, and they split into two families by how they authenticate:

| Consumer | Transport | Auth it accepts | Sees | Notes |
|---|---|---|---|---|
| Claude Code | stdio or Streamable HTTP | `--header "Authorization: Bearer …"`, or OAuth | tools, resources, prompts | `claude mcp add --transport http garden https://…/api/mcp --header "Authorization: Bearer dgmcp_…"` |
| Claude Messages API (MCP connector) | Streamable HTTP, public HTTPS | `authorization_token` on the `mcp_servers` entry | **tools only** | `mcp_servers: [{ type: "url", url, name, authorization_token }]` **plus** `tools: [{ type: "mcp_toolset", mcp_server_name }]`, beta `mcp-client-2025-11-20`. One without the other is a validation error. Managed Agents use the same toolset shape. |
| claude.ai / Claude Desktop custom connector | Streamable HTTP, public HTTPS | **OAuth 2.1 only** (dynamic client registration, or a pre-registered client id and secret) | tools, resources, prompts | No bearer-token field in the UI. |
| OpenAI Responses API (remote MCP tool) | Streamable HTTP, public HTTPS | `headers: { Authorization: "Bearer …" }` or `authorization` | **tools only** | `tools: [{ type: "mcp", server_label: "garden", server_url, headers, require_approval, allowed_tools }]`. `require_approval` can be relaxed per tool. |
| ChatGPT connector (chat, Deep Research, Apps SDK) | Streamable HTTP, public HTTPS | **OAuth 2.1 only** (dynamic client registration) | tools | Expects two tools named exactly **`search`** and **`fetch`** with a fixed result shape. Anything else is ignored by Deep Research. |
| Codex CLI | stdio or Streamable HTTP | `url` plus a bearer token from an env var, or OAuth | tools | `[mcp_servers.garden]` in the Codex config. |

### 8.1 Auth: two token sources, one verifier

The PAT from §4 covers the API-level consumers and both CLIs on day one. The two consumer apps,
claude.ai and ChatGPT, only speak OAuth 2.1, which is MCP-PLAN's M3. The right shape is **one
verifier, two ways to mint a token**:

- `mcp-handler` wraps the route with `withMcpAuth(handler, verifyToken, { required: true, resourceMetadataPath })` and serves `/.well-known/oauth-protected-resource` through its `protectedResourceHandler`. `verifyToken` is `validateMcpToken` from §4, so a PAT and an OAuth-issued token are the same row in `McpToken` and pass through the same jurisdiction code.
- The garden becomes a small authorization server for its own MCP clients, using the TypeScript SDK's `OAuthServerProvider` interface and `mcpAuthRouter`. Google cannot be proxied here because Google does not offer dynamic client registration, which both claude.ai and ChatGPT require. The flow: the client registers itself, the user lands on a consent page already signed in through the normal Google session, the consent page **is** the token-creation UI from §6.3 (pick roots, tick capabilities), and the issued access token is a new `McpToken` row. The PAT page becomes the manual path to the same thing.
- If running an authorization server in-app proves heavier than wanted, delegate to a provider that supports dynamic client registration (Auth0, WorkOS AuthKit, Stytch) and keep `verifyToken` the only garden-side code. Record the choice and why in this doc per the library-over-bespoke rule.

Local dev: the Messages API connector, the Responses API tool, claude.ai and ChatGPT all call
the server from the vendor's cloud, so `localhost` never works for them. Smoke those four through
a tunnel or a preview deployment. Claude Code and Codex connect from the machine and work against
`localhost:3015` directly, which makes them the day-one smoke clients.

### 8.2 Resources are invisible to the API-level connectors

Both vendors' server-side connectors list tools only. The `garden://` resources in §3 serve Claude
Code, Claude Desktop and Codex, but an agent built on the Messages API or Responses API never
sees them. The rule that keeps the server useful everywhere: **every resource must also be
reachable through a tool.** It already is: notes, files and database schemas through
`garden_read`, a saved view through `garden_query_rows` with `view`, a row through
`garden_query_rows` with `rows`. Writes have no resource form in MCP at all, so for a model on either vendor's
API the §2.3 and §2.4 write tools are the only way into the garden. Add `view?: string` to `garden_query_rows` so a view's filters and sorts can be
applied by name from a tool call, not only from the resource URI.

### 8.3 Schemas both vendors parse the same way

Each client turns an MCP tool into its own function-calling shape, and the conversion is only
reliable on a plain subset of JSON Schema. Rules for every tool in §2:

- Top-level `type: "object"` with named `properties`; no `oneOf` / `anyOf` at the top level, no recursive `$ref`. This is why `filters` is a flat list rather than the `DataView` tree.
- `enum` for closed sets (`relations`, `op`, `sortDirection`), `description` on every property, defaults stated in the description since some clients drop `default`.
- Tool names match `^[a-zA-Z0-9_-]{1,64}$`. OpenAI prefixes them with the `server_label`, so keep them short.
- Always return a `text` block. `structuredContent` and `outputSchema` are read by Claude clients and ignored by the Responses tool, which reads text.
- Annotate every read tool `readOnlyHint: true` and the two write tools `destructiveHint: false, idempotentHint: false`. Claude Code and the Responses tool both use annotations to decide what needs a human.

### 8.4 ChatGPT's `search` and `fetch` contract

ChatGPT connectors call `search({ query })` and expect `{ results: [{ id, title, url }] }`, then
`fetch({ id })` and expect `{ id, title, text, url, metadata }`, each returned as a JSON string in
a single text block. Expose both as aliases on the same server, implemented over `garden_search`
and `garden_read`, with `id` carrying the garden node id (or `tableId:rowHandle` for a row hit)
and `url` the in-app content link. Two extra tool descriptions is the whole cost, and every other
client simply ignores them. For an Apps SDK widget later, the same `fetch` result gains `_meta`.

### 8.5 Gemini, and the auth families as a whole

**Two Googles.** §8.1 says Google cannot be proxied as an authorization server. That is Google as
the **identity provider** the garden's own users sign in with: Google issues tokens for Google
APIs, not for the garden, and it offers no dynamic client registration, so a hosted MCP client
cannot register itself against it. The garden therefore issues its own tokens after the user
proves identity through the normal Google session. Gemini as a **client** of the garden server is
unrelated to that and needs nothing special.

**Gemini consumers.**

| Consumer | Auth | Notes |
|---|---|---|
| Gemini CLI | `headers: { Authorization: "Bearer …" }` on the `mcpServers` entry, or OAuth 2.1 with dynamic client registration discovered from `/.well-known/oauth-protected-resource` | `{ "mcpServers": { "garden": { "httpUrl": "https://…/api/mcp", "headers": { … } } } }` in `~/.gemini/settings.json`. The CLI also has a Google-credentials auth type for servers behind Cloud Run IAM, a third family (platform identity) the Vercel route does not use. |
| Gemini API SDKs (`@google/genai`, `google-genai`) | whatever the in-process MCP client sends: bearer | The SDK runs the MCP client **in your process** and feeds the server's tools into automatic function calling. There is no server-side remote-MCP tool comparable to OpenAI's `mcp` tool or Anthropic's connector, so the model never contacts the garden; your code does. Verify against current Gemini docs at build time. |
| Google ADK / Vertex AI agents | bearer via `StreamableHTTPConnectionParams(url, headers)` on an `MCPToolset` | Same in-process shape as the SDK. |

**The auth families, and who they overlap.** Authentication is a property of the *host* that
runs the MCP client, never of the model. That is why one server reaches every model:

| Family | Who needs it | Where the MCP client runs |
|---|---|---|
| **Bearer token in a harness you run** | Every SDK agent loop: Gemini SDK/ADK, OpenAI Agents SDK, Anthropic Tool Runner, AI SDK `experimental_createMCPClient`, LangChain/LangGraph MCP adapters; every CLI and IDE that takes headers: Claude Code, Codex, Gemini CLI, Cursor, VS Code, Cline, Continue, Goose, OpenCode, Kimi CLI; local runners such as LM Studio, Ollama front ends and mcphost | your process or your machine |
| **Vendor-hosted connector with a bearer field** | Anthropic Messages API connector, OpenAI Responses `mcp` tool | the vendor's cloud, tools only |
| **OAuth 2.1 + dynamic client registration** | the hosted consumer apps: claude.ai, Claude Desktop, ChatGPT, Gemini CLI when OAuth is enabled | the vendor's cloud or the CLI, with the garden as resource server and issuer |
| **Platform identity** (Cloud Run IAM, Vercel OIDC) | servers deployed inside one cloud's trust boundary | not applicable to this route |

The first family is the universal one. It is also the only family that reaches **open-weight
models** such as Kimi K2, DeepSeek, Qwen, Llama and Mistral, because those models have no hosted
consumer app of their own and no server-side connector. Served through Moonshot, DeepSeek, Groq,
Together, OpenRouter, Ollama or vLLM, they do plain function calling; the harness is the MCP
client, converts each MCP tool into a function schema, executes calls against the garden with a
bearer token, and feeds results back. Nothing on the garden side changes between a Claude call and
a DeepSeek call: same route, same token, same jurisdiction.

The garden already **is** such a harness. Its chat runs on AI SDK v6 with DeepSeek, Groq, Mistral,
xAI, Google, OpenAI and Anthropic providers, and MCP-PLAN §4 (M4) describes exactly this: AI SDK's
MCP client turns an external server's tools into chat tools, namespaced per server. So the
open-weight path runs in both directions with one mechanism. An open-weight model inside garden
chat consumes external MCP servers through M4; an open-weight model inside any other MCP-capable
harness consumes the garden through this server with a `dgmcp_` token.

**Open-weight caveat that already bit this codebase.** During the PR #235 smoke, DeepSeek sent a
`columns` argument as a JSON string and as a comma list where the schema asked for an array, and
`query_database` grew lenient parsing for it. The §8.3 schema rules matter *more* for open-weight
models than for Claude or GPT: flat objects, enums, descriptions on every property, and lenient
coercion of strings-that-should-be-arrays at the tool boundary. Carry the same leniency into the
MCP tools, and keep the "schemas describe shape, execute judges" rule from the iteration-proposal
work.

### 8.6 What stays identical

Transport (Streamable HTTP, stateless sessions), the jurisdiction code, the token cap, the private-
content seam, the write guards. None of it branches on which vendor is calling. The one gate to
add: the `mcp:surface:check` script from §6 should also assert the §8.3 schema rules, so a future
tool with a top-level union fails the build instead of failing silently in one vendor's client.

## 9. Gates before this ships

`pnpm typecheck`, `pnpm lint`, `pnpm build`; `pnpm private:content:check` with the new seam;
`pnpm ai:drift:check` unaffected (no new chat tools); a new `mcp:surface:check` mutation-tested on
first run; MCP Inspector lists every tool in §2 plus the two §8.4 aliases and five resource
templates; Claude Code connects with a `dgmcp_` token and completes the §5 walkthrough against a
local garden; a token without `garden:write-rows` gets a clean refusal from both row-write tools
and one without `garden:write-files` from all four file-write tools; a note appended over MCP
appears in an open collaborative editor without a reload (proof the write went through the
Y.Doc); a `dg-block` fence survives a `replace` round trip unchanged.
