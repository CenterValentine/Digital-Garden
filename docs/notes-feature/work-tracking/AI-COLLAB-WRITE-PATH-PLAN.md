# AI → collaborative document write path (the NotePayload ↔ Y.Doc seam)

**Branch:** `fix/ai-collab-write-path`
**Services touched:** Next.js (`lib/domain/ai`, `lib/domain/collaboration`) **and** Hocuspocus (separate Cloud Run deploy)
**Migration:** yes — one column + backfill, owner-run (§9)
**Confirmed incident:** note `7ea01169-db79-4b90-86a7-95a8340d330c` ("Rapid Scout II Shortlist — LinkedIn job screen"), 2026-08-12

---

## Why

The AI appended a second job to a shortlist. The owner exported the note and saw **two jobs**;
the browser editor showed **one**. Export reads `NotePayload.tiptapJson` directly
([bulk-export.ts:203-207](../../../lib/domain/export/bulk-export.ts)), the editor reads the Y.Doc — so
the two stores had diverged, with the AI's write stranded in the payload.

This is the `NotePayload` ↔ Y.Doc seam. `updateNote` writes the payload directly and then
reseeds the collaborative snapshot ([registry.ts:1690-1715](../../../lib/domain/ai/tools/registry.ts)), a
strategy whose own docstring admits it "does not reach into a live Hocuspocus in-memory
session" ([documents.ts:98-103](../../../lib/domain/collaboration/documents.ts)).

**The incident exonerates the model.** The exported payload contained job 1 *and* job 2, so the
model's rewrite preserved existing content correctly. The read path (`readNote` returning flat
text) did not cause this either. The seam is the whole bug.

---

## What we verified (do not re-litigate these)

| # | Fact | Anchor |
|---|---|---|
| 1 | A live session doesn't only *mask* an out-of-band write — its next store writes the stale snapshot back over `NotePayload`, destroying it. The only guard refuses *empty* over non-empty; stale-but-non-empty passes. | [documents.ts:186-225](../../../lib/domain/collaboration/documents.ts) |
| 2 | Bootstrap **trusts a meaningful stored Y state over the payload**. That is the masking mechanism. It self-heals only when the stored state is empty. | [documents.ts:40-52](../../../lib/domain/collaboration/documents.ts) |
| 3 | The bootstrap *fetch* hook **writes** — it upserts the `CollaborationDocument` row. So "first open" is a write, and any lock must cover the fetch path. | [documents.ts:54-81](../../../lib/domain/collaboration/documents.ts) |
| 4 | Reseeding mints a **rival document** (`TiptapTransformer.toYdoc` → fresh client/item ids). Y.js merge is additive, so merging a reseed with any surviving copy **duplicates** rather than replaces. Reseed is only sound when no other copy exists anywhere. | [documents.ts:130-135](../../../lib/domain/collaboration/documents.ts) |
| 5 | The client creates `IndexeddbPersistence` **unconditionally** at entry creation, before any provider connects. A browser cache can therefore exist with **no server row** (`localFallback` opens). The row is a leaky proxy for "a copy exists". | [runtime.ts:658](../../../lib/domain/collaboration/runtime.ts) |
| 6 | `openDirectConnection` + `transact` mutates the live doc, **broadcasts to every connection**, then forces an **immediate** store (`immediately=true` bypasses the debounce) and unloads. No browser required, no session held. | `@hocuspocus/server` 3.4.4 `DirectConnection.transact`, `storeDocumentHooks` |
| 7 | `y-prosemirror` exports **`updateYFragment(y, fragment, pmNode, meta)`** — an incremental diff that applies only what changed. `prosemirrorJSONToYXmlFragment` is the wrong tool (its own docstring: "should not be used to rehydrate a Y.Doc … once collaboration has begun as all history will be lost"). | `y-prosemirror/dist/y-prosemirror.cjs:1219,2210` |
| 8 | Non-note content types are filtered out of **both** collab hooks (`contentType: "note"`), so folder/chat notes are not collaborative and the payload write is correct for them. | [documents.ts:23,113,173](../../../lib/domain/collaboration/documents.ts) |
| 9 | Store errors are caught and logged, never raised — an unhandled rejection there crashes the process and drops all connections. A throwing guard is therefore **silent**. | [server.ts:262-271](../../../server/hocuspocus/server.ts) |
| 10 | The `onRequest` hook's `sendJsonAndStop` throws `null` as a stop-signal; wrapping it in a `try` that handles real failures swallows the signal and double-writes the response. | [server.ts:70-78](../../../server/hocuspocus/server.ts) |
| 11 | **`onRequest` does NOT fire on the websocket upgrade path** — upgrades dispatch through a separate `onUpgrade` hook. A bug in our endpoint cannot break the collaborative handshake; it can only reach users by crashing the process (a non-null throw is rethrown into an async handler). | `hocuspocus-server.cjs:2649` (upgrade) vs `:2673` (request) |
| 12 | The repo configures **only** `onRequest`, `onAuthenticate`, and `connected`. There is no `onDisconnect` hook, and `connected` does not fire for direct connections — so a synthetic write connection cannot disturb presence or access revalidation. Direct connections also bypass `onAuthenticate` (`isAuthenticated: true`), making the endpoint the **sole authorization boundary**. | [server.ts:182-218](../../../server/hocuspocus/server.ts) |
| 13 | A forced immediate store `clearTimeout`s any pending debounced store for that document and runs now; the hook serializes on `saveMutex` and stores the **full current state**. So an AI write to a document a human is editing stores *earlier*, never *less*. No user edits are lost. | `hocuspocus-server.cjs:2172-2202` |
| 14 | Undo is y-undo via `@tiptap/extension-collaboration`, scoped to local origins — so a user **cannot Ctrl+Z** a server-applied AI write (same as another human's edit). Revert is the chip, not the keyboard. | [extensions-client.ts:172](../../../lib/domain/editor/extensions-client.ts) |
| 15 | The client already POSTs `/api/collaboration/state` with the contentId during bootstrap, from Next.js, independent of Hocuspocus reachability. | [runtime.ts:1141-1148](../../../lib/domain/collaboration/runtime.ts) |

---

## The model: three states, one discriminator

"The content exists" and "a Y.Doc exists" are different facts, because the Y.Doc is created
lazily at **first open in an editor**, not at content creation. So writes fall into three states:

| State | Copies that exist | Write path |
|---|---|---|
| **S1 Create** | none yet | `NotePayload` (createNote, unchanged) |
| **S2 Exists, never opened** | payload only | `NotePayload` — nothing to write *through*; no Hocuspocus contact |
| **S3 Exists, has been opened** | Y.Doc + possibly browser caches | **Y.js only** |

S2 is the normal case for a playbook that creates a note and appends to it before anyone looks
at it. Routing S2 through Hocuspocus would wake the service for documents nobody has seen —
rejected on resource grounds (§11).

**Discriminator (decision D1): a `firstOpenedInEditorAt` timestamp on `ContentNode`**, set the
first time the editor mounts a runtime entry — the same moment IndexedDB caching begins (fact 5).
Chosen over the `CollaborationDocument` row because the row misses `localFallback` opens, and this
whole bug came from a proxy that looked equivalent to the real condition and wasn't.

Backfill: any note with a `CollaborationDocument` row has demonstrably been opened, so seed from
that. Notes only ever opened in fallback mode stay unknown — no worse than the row proxy.

**The timestamp is not a collab switch.** It records that a copy exists. It starts no session,
holds no connection, and does not enable Y.js on anything.

---

## Write contract

**D2 — `append` is the default op; `replace` is retained.** The model sends only the new blocks
for an append; Hocuspocus derives the target from the **live** doc (not the payload) inside the
same `transact`. Replace sends a full document target.

**D3 — no literal carriage return.** TipTap documents are block-structured; an appended paragraph
or list node *is* the new line. A literal `\n` would be swallowed or produce an empty paragraph.

**D4 — destruction is gated by shrink, not by mode.** Blanket approval on `replace` would put a
card in front of every ordinary edit. Instead:
- *Pre-check* (Next.js, drives the approval card): `mode === "replace"` and the target is
  materially smaller than the current payload → `needsApproval`.
- *Hard backstop* (inside `transact`, where the live doc is known): refuse and report if the
  target would drop the document below the threshold without an approved destructive intent.

  ⚠ **Implementation question to resolve first:** does `needsApproval` accept an *async*
  predicate in AI SDK 6.x? [registry.ts:951](../../../lib/domain/ai/tools/registry.ts) uses a sync arrow.
  If async is unsupported, the pre-check must derive from the input alone and the in-transact
  refusal becomes the only size guard (still correct, one extra turn).

**D5 — anchor misses and refusals fail loudly.** Never silently append when a target is missing,
never silently replace. Return the refusal with actionable detail.

---

## Architecture

```
updateNote (Next.js)
  ├─ markdown → TipTap  (markdownToTiptapResult + linkifyWikiRefsInTiptap — stays in Next.js:
  │                      one implementation, already covered by the lossless markdown CI gate)
  └─ writeNoteContent(contentId, mode, tiptapJson)        ← shared helper, also used by
        │                                                   the extension + sync scripts
        ├─ S2 (never opened) → NotePayload upsert. Done. No Hocuspocus contact.
        └─ S3 (opened)       → POST {HOCUSPOCUS_URL}/internal/apply
                                  { contentId, mode, tiptapJson }   [shared-secret auth]
                                  ├─ 2xx → done (the store hook wrote payload + ydocState)
                                  └─ unreachable / 404 / timeout →
                                       NotePayload upsert + reseed, receipt flagged
                                       "may be masked in an open editor"

Hocuspocus /internal/apply
  openDirectConnection(name)
    transact(doc => {
      fragment = doc.getXmlFragment('default')
      current  = TiptapTransformer.fromYdoc(doc, 'default')       ← live, not payload
      target   = mode === 'append' ? {...current, content: [...current.content, ...newBlocks]}
                                   : fullTarget
      guard(current, target)                                      ← shrink backstop
      updateYFragment(doc, fragment, Node.fromJSON(schema, target), { mapping: new Map() })
    })                                → broadcast to connections + immediate store
    disconnect()                       → doc unloads
```

**Why `updateYFragment` rather than a hand-rolled `Y.XmlElement` builder:** it applies a minimal
diff, so untouched blocks keep their identity and concurrent cursors elsewhere survive. It also
deletes the largest chunk of new Y.js code from this plan. It is exported but undocumented and
ships no types — we declare a narrow local type (no `any`, per repo standards) and pin behavior
with a unit test (§7 Gate 1c).

---

## Slices and gates

### Slice 1 — write-through (fixes the confirmed bug)
Hocuspocus `/internal/apply`; `writeNoteContent` helper branching on the **row proxy** for now;
`append` + `replace`; fallback path; receipts carrying op + size delta; **pre-write snapshot →
Undo chip parity (D10), with its `compactToolOutputs` strip key.**

- **Gate 1a:** `pnpm typecheck` + `pnpm lint` clean (ratchet 175).
- **Gate 1b:** `pnpm collab:schema:check` — the endpoint uses `getCollaborationServerExtensions()`.
- **Gate 1c:** unit test — `updateYFragment` round-trip: apply a target, assert `fromYdoc` equals
  the target **and** that an untouched block retained its Y identity (proves minimal diff, not
  delete-and-refill).
- **Gate 1d:** owner smoke (§12) with the note open in a second tab: the append appears **live**.
- **Gate 1e:** `/readyz` probed **5×** post-redeploy, `uptimeMs` climbing (CLAUDE.md ritual).

### Slice 2 — correct discriminator
`firstOpenedInEditorAt` + backfill; helper switches off the row proxy.

**No new client request (regression review, 2026-08-12).** The timestamp is stamped server-side
inside the existing `POST /api/collaboration/state`, which the client already calls during
bootstrap with the contentId and which runs in Next.js independent of Hocuspocus reachability
(fact 15). This removes the "client ping at editor mount" risk item entirely — zero added
requests, zero client-side change, nothing new on the path a user feels when opening a note.

Residual leak (accepted, narrower than the row proxy): if that state fetch itself fails, the
runtime entry — and its IndexedDB cache — can still exist without a timestamp. That is a failed
bootstrap, not merely an unreachable Hocuspocus.

- **Gate 2a:** migration applied by owner (§9) **before** the code deploy.
- **Gate 2b:** stamping must not change the route's response shape, latency budget, or failure
  behavior — a stamp failure is logged and ignored, never surfaced to bootstrap.
- **Gate 2c:** open a note with Hocuspocus **stopped** (`localFallback`), then AI-write it →
  routed through Y.js, not the payload. This is the leak Slice 2 exists to close.

### Slice 3 — the check-then-write race
Postgres advisory lock shared by the bootstrap fetch hook (fact 3) and `writeNoteContent`.

- **Gate 3a:** lock is `try`-flavored with fall-through, never blocking indefinitely.
- **Gate 3b:** lock scoped to DB work only — **never held across the Hocuspocus HTTP call**.
- **Gate 3c:** open 5 notes concurrently while an AI batch writes; no open stalls.

### Slice 4 — read fidelity (independent, low risk)
`readNote` → `tiptapToMarkdown` ([markdown.ts:148](../../../lib/domain/content/markdown.ts)) so replace-mode
targets are faithful and future anchors are visible.

- **Gate 4a:** measure context cost — markdown is larger than flat text; confirm the delta is
  acceptable against the context-diet budget before shipping.

### Cut from this plan
The **newer-payload guard** in `storeCollaborationYDocState`. Once write-through lands there is a
single writer, so the condition shouldn't arise; and by fact 9 a throwing guard is silent, while
the existing guard's throw skips **both** the `ydocState` and payload writes — i.e. it would
discard live user edits invisibly. If ever built: skip the payload write only, never the Y state.

---

## §7a — Existing surface this plan must reconcile with (found in regression review)

**A front-door, targeted AI edit path already exists**, and the plan as first written would have
built a second one beside it.

[lib/domain/ai/tools/editor-tools.ts](../../../lib/domain/ai/tools/editor-tools.ts) defines a suite gated on
`ctx.contentId` — the document the chat is rooted to: `apply_diff` (targeted before/after
replace), `replace_document`, `insert_block`, `update_block`, `list_document_blocks`,
`insert_image`, plus chunked reads (`read_first_chunk` / `read_next_chunk` /
`read_previous_chunk`). These return `__editPayload`, and
[edit-orchestrator.ts](../../../lib/domain/editor/ai/edit-orchestrator.ts) applies them **to the live TipTap
editor** — through the Y.Doc, i.e. the front door — with an editor lock, animation, and a
pre-edit snapshot that powers the "Undo" chip in the transcript.

So the real architecture is:

| Target | Path today | Correct? |
|---|---|---|
| The chat's **rooted** document | editor-tools → orchestrator → live editor → Y.js | ✅ front door, targeted, revertable |
| **Any other** document | `updateNote` → `NotePayload` + reseed | ❌ the seam; this incident |

The shortlist was not the rooted document of that chat, so the model reached for the blunt path.

**Three consequences:**

1. **The backlog item is partly built.** "Targeted editing" is not greenfield — `apply_diff` and
   `update_block` already express it. The real gap is that they require the document to be open
   *in the requesting client*. The long-run design is therefore **one op vocabulary, two
   executors** (client orchestrator when the doc is open here; server-side direct connection
   otherwise), chosen by the harness — not a second vocabulary bolted onto `updateNote`.
2. **Parallel-mechanism hazard.** This repo runs CI gates specifically because parallel tables
   drift (`collab:schema:check`, `ai:drift:check`). Adding server-side `append`/`replace` semantics
   that overlap `apply_diff`/`replace_document` creates exactly that class of debt.
3. **Revert asymmetry.** Orchestrator edits are revertable via the snapshot chip; a server-applied
   write would not be, and it is not Ctrl+Z-able either (fact 14). Either write-through captures a
   comparable snapshot, or the receipt must not imply reversibility.

**Why the split exists at all** — [route.ts:991-994](../../../app/api/ai/chat/route.ts):
`editableContentId = contentId && !isChatContent && !openWorkflowTitle`. Editor-tools are gated
**off when the rooted content is itself a chat**, so a sidebar chat on a note gets the good path
while a **full-page chat — the playbook flow — gets only `updateNote`.** That is the incident's
whole causal chain, and it is why (ii) matters specifically for playbooks.

**Revert chip status (regression review):** it works for orchestrator edits and is untouched by
Slice 1. It has never worked for `updateNote` (no snapshot is captured), so there is no regression
— but fixing the seam creates a **new** expectation, because those writes become visible and users
will want to undo them. Pre-existing limits worth knowing: snapshots live in an in-memory ref per
`ChatPanel` mount (lost on reload) and `revertEdit` requires the document open in that client.

**Decided (D10) — the snapshot ships in Slice 1.** The `transact` already reads the current
document to build an append target, so it returns it as a pre-write snapshot which the client
registers under the same `toolCallId`, reusing the existing `revertSnapshotsRef` mechanism. The
Undo chip then behaves identically for rooted and non-rooted writes. **Required:** a
`compactToolOutputs` strip key so the snapshot never reaches the model's context (same precedent as
`encryptedContent`) — without it this is a per-turn full-document token cost.

### What (ii) actually adds — reach vs precision

`updateNote` **already reaches any document** by contentId; reach was never the gap. What a
non-rooted document lacks is **precision and cost**:

| | Rooted document | Any other document |
|---|---|---|
| Write | `apply_diff` / `update_block` / `insert_block` — targeted | `updateNote` — whole document |
| Read | chunked (`read_first_chunk` …) | `readNote` — whole document, flat text |

Because Slice 1 applies via `updateYFragment`, a whole-document replace is a **minimal diff at the
Y level** — untouched blocks keep their identity and other cursors survive. What stays coarse is the
**token cost** (the model re-sends the whole document per edit) and the burden of reproducing it
faithfully. After Slice 1, whole-doc replace is therefore *safe but expensive*; (ii) fixes the
expense, not a correctness hole. That is the whole reason it can wait.

**Decision (approved):** **(i) now** — `updateNote`'s transport moves to Y.js, keeping `append` +
`replace`. **(ii) backlogged**, reframed from "build targeted editing" to "give the existing edit
ops a server-side executor."

**Recorded debt (D11):** Slice 1's `append` overlaps what a server-executed `insert_block` would do
once (ii) lands. Kept anyway — it serves the flow that actually broke, costs almost nothing on a path
we are already building, and removes the model-reproduces-the-document risk that makes a weak model
dangerous. When (ii) lands, `append` either delegates to the unified executor or is deprecated in
favour of it; it must not become a third way to do the same thing.

---

## Risks, ranked by blast radius

| Risk | Stage | Blast radius | Mitigation |
|---|---|---|---|
| `onRequest` branch breaks the stop-signal contract | HTTP only | `/readyz` breaks (deploy verification blind). **Cannot** break the websocket handshake — upgrades use a separate hook (fact 11) | Follow facts 9+10 literally: no `try` around `sendJsonAndStop`; scope trys to fallible work; Gate 1e |
| Non-null throw in `onRequest` or `transact` | process | rethrown into an async handler → unhandled rejection → crash → **all** connections dropped. The one path by which this work can reach an uninvolved user | Catch everything inside the handler, return 5xx, let Next.js fall back. Never rethrow |
| Endpoint is the only authorization boundary | — | direct connections bypass `onAuthenticate` (fact 12), so a leaked secret writes to any document | Verify ownership in Next.js before calling; secret server-only; add to `check-hocuspocus-env.ts` |
| Advisory lock in bootstrap | L2, every open | users cannot open documents | Gates 3a-3c; Slice 3 ships last and alone |
| ~~Client ping at editor mount~~ | — | **Removed** — the timestamp piggybacks an existing request (fact 15, Slice 2) | n/a |
| ~~Synthetic connection disturbs presence~~ | — | **Removed** — no `onDisconnect` hook exists and `connected` does not fire for direct connections (fact 12) | n/a |
| Two overlapping edit mechanisms | L6 | drift between the client orchestrator and a new server path; the model picking the blunt one | **Unresolved — see §7a. Blocks Slice 1 scope.** |
| `updateYFragment` behaves unlike `TiptapTransformer` | L3 | malformed doc → schema errors for real users | Gate 1c round-trip test; local type declaration |
| Migration/deploy ordering | deploy | 500s on every AI write, or endpoint 404s | Order: migration → Hocuspocus → Next.js. Treat 404 and unreachable identically in the fallback |
| Cold start exceeds tool budget | L6 | AI write silently takes the fallback | Short timeout + receipt flag; **do not** raise `min-instances` |
| Replace stomps a concurrent human edit | L3 | lost keystrokes in overlapping blocks | `updateYFragment` limits damage to changed blocks; `append` is the default; shrink gate (D4) |
| Approval-gated path is newly exercised | L6 | interacts with the resume/approval fix landed 2026-08-11 | Smoke the shrink-approval card *and* a mid-run navigation together |

**Adjacent, pre-existing, out of scope:** if the folder-notes or chat-notes editor mounts the
collab runtime, its stores hit the `contentType: "note"` filter (fact 8) and are logged-and-dropped.
Worth a separate look; not caused or fixed here.

---

## Chips & traceability

*Required for AI plans in this repo: live state, failure/stale states, durable transcript trace.*

**Approval card (shrink-gated replace only).** States: `proposed → approved | rejected → executed |
refused`. Stale states inherit the 2026-08-11 fix — an approval that is no longer the last message
renders expired, and an inapplicable stream replay restores the transcript rather than banner-ing.
A refusal from the in-transact backstop surfaces as a tool error chip, never as a silent no-op.

**Write receipt chip** (extends the existing `NotePayloadCard`): must carry **op** (`append` /
`replace`), **size delta** (blocks and/or words), and **route** — `via collaboration` vs
`via payload (may be masked in an open editor)`. This incident cost a long investigation precisely
because the receipt said only "updated"; the route and delta are what make it self-diagnosing.

**Durable trace.** Receipts persist in `ConversationMessage.parts`, so the transcript answers
"what did the AI write, where, and through which path" after the fact. Server-side log events:
`collab_write:applied`, `collab_write:fallback`, `collab_write:refused_shrink`.

---

## Migration handoff (owner-run)

`prisma/` is human-owned. Canonical SQL to review, then commit the generated migration in the
same PR as the code (CLAUDE.md: a schema change without a migration fails the drift gate).

```
SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shadow \
  npx prisma migrate dev --name add_first_opened_in_editor_at
```

```sql
ALTER TABLE "ContentNode" ADD COLUMN "firstOpenedInEditorAt" TIMESTAMPTZ(6);

UPDATE "ContentNode" c
SET "firstOpenedInEditorAt" = COALESCE(d."updatedAt", c."createdAt")
FROM "CollaborationDocument" d
WHERE d."contentId" = c.id AND c."firstOpenedInEditorAt" IS NULL;
```

Production: `npx prisma migrate deploy` **before** the Next.js deploy that reads the column.

---

## Deploy order and verification

1. Owner runs the migration (Slice 2 only).
2. Redeploy Hocuspocus — `gcloud builds submit --config cloudbuild.hocuspocus.yaml .` from a tree
   matching `origin/main` (`git diff origin/main --quiet` exits 0), region **us-west1**.
3. Verify with `gcloud run services list` that us-west1 was the target, then probe `/readyz` 5×.
4. Deploy Next.js.
5. Add `COLLABORATION_WRITE_SECRET` to `scripts/check-hocuspocus-env.ts` so a missing secret fails
   loudly rather than silently routing every AI write to the fallback.

---

## Owner smoke script

1. Open a note in the app. Leave it open.
2. In chat: "append a line to this note" → the line appears **live**, no refresh.
3. Export the note → export and editor agree.
4. Ask for a rewrite that drops most of the content → approval card appears; approve → applied.
5. Repeat step 4 and **reject** → nothing changes.
6. Ask the AI to create a note, then append to it **without opening it** → succeeds; confirm no
   `CollaborationDocument` row was created (S2 stayed off Hocuspocus).
7. Stop Hocuspocus; AI-write an opened note → fallback path, receipt flagged, no crash.
8. Mid-run navigation: approve a write, click the artifact chip, come back → transcript intact,
   no error banner (regression check on the 2026-08-11 fix).
9. **Undo chip (D10):** after an AI write to a note that is *not* the chat's root, the receipt shows
   an Undo chip; clicking it restores the prior content **live** in the open editor. Then confirm the
   snapshot never reached the model — inspect the next request's payload for the strip key.
10. **Regression, rooted path:** in a sidebar chat on an open note, an `apply_diff` edit still
   animates, locks the editor, and its Undo chip still works. Slice 1 must not touch this path.

---

## Non-goals

- Raising Cloud Run `min-instances`. Cold starts are accepted; the fallback covers them.
- Enabling collaboration on documents that have never been opened.
- Changing sleep mode, the presence heartbeat, or cooldown behavior. Write-through is
  server-to-server: it wakes no client and holds no connection.
- Sub-paragraph text surgery (see Backlog).

---

## Backlog — a server-side executor for the existing edit ops

*Reframed by the regression review: targeted editing already exists client-side (§7a). The gap is
the executor, not the vocabulary.*

Give `apply_diff`, `update_block`, `insert_block`, and the chunked reads a server-side executor via
the direct connection, so they work when the target document is not open in the requesting client.
Sub-paragraph precision then comes free from `apply_diff` rather than needing new `Y.XmlText` work.

**Rationale to preserve:** replace-mode costs **O(document) tokens per edit, in both directions** —
every shortlist update re-sends the whole shortlist. Append fixes that for additions only.
Targeted editing extends it to modifications, so the cost of editing stops scaling with document
length. Owner considers this expected in the long run; it is an efficiency requirement, not a
nicety. Prerequisite: Slice 4 (anchors must be visible in what the model reads).

Per repo convention this entry, and this plan, ride in the implementation PR rather than a
standalone docs commit.

---

## Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | `firstOpenedInEditorAt`, not the `CollaborationDocument` row | The row misses `localFallback` opens (fact 5); this bug came from exactly that class of proxy |
| D2 | `append` default, `replace` retained | Append is minimal and non-destructive; replace remains for genuine rewrites |
| D3 | No literal carriage return on append | Blocks are discrete nodes; the block boundary *is* the newline |
| D4 | Shrink-gated approval, not mode-gated | No friction on ordinary edits; a card exactly when content would be lost |
| D5 | Advisory lock, not reseed-retry, for the race | Reseed patches stored state only, not live memory; a retry is ambiguous under append (double-append) |
| D6 | Newer-payload store guard cut | Single writer after write-through; a throwing guard is silent and would drop live edits (fact 9) |
| D7 | Markdown parsing stays in Next.js | One implementation, already covered by the lossless markdown gate; keeps the Hocuspocus image thin |
| D8 | `updateYFragment`, not a hand-rolled builder | Minimal diff preserves untouched blocks and cursors; removes the largest new-code risk |
| D9 | Reseed demoted to the fallback path only | It is unsound wherever another copy exists (fact 4) |
| D10 | Pre-write snapshot ships in Slice 1 | Write-through makes previously-invisible writes visible, so users will want to undo them; the snapshot is already read inside the `transact`. Needs a strip key so it never reaches the model's context |
| D11 | `append` retained in Slice 1 despite overlapping a future server-executed `insert_block` | Serves the flow that broke, near-free on a path already being built, removes the model-reproduces-the-document risk. (ii) must absorb or deprecate it — never a third way |
