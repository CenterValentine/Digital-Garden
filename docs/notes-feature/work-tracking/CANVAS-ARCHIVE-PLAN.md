---
status: built — P1, P2 and P3 on `feat/canvas-archive` (2026-11-02). Owner: P0 access check, apply migration 20261102120000_canvas_archive, real-course smoke. See §15 for where the build differs from the design below.
created: 2026-11-02
---

# Canvas archive: bring completed Canvas courses into the notebook

The entry point is **+ → Canvas Course…**, in the header "+" menu and in the
tree's right-click → New menu. You pick courses you have **already taken**.
Each one arrives as an ordinary folder tree: a course folder, a folder per
module, and the module's items (pages, files, assignments, links) as notes,
files and external nodes, in Canvas order. The goal is **reference**: the
content becomes searchable, linkable with `[[…]]`, readable by the AI, and
yours to keep after Canvas access ends. You can drop your own notes between
the imported items. Imported titles stay locked to Canvas.

This is **not live sync.** Completed courses don't change, so instead of
re-sync there is **re-import**: you check a course for changes from the
right-sidebar Canvas tab, choose which modules to refresh, and settle any
conflicts in one review queue.

---

## 1. Judged against the product principles

- **Principle 1: a course is a folder.** No new `ContentType`. "Canvas
  Course…" is a *create action that produces folders*. The course folder and
  module folders are plain `folder` nodes with a `lucide:graduation-cap` icon
  on the course. Search, trash, move, tags, export, workbenches and
  folder-scoped AI context work unchanged.
- **Principle 2: unrefined → structured.** "Course notes → study: one concept
  → Concepts → Flashcards, Examples" is a row in the principle's own table.
  Imported pages are the raw material, and flashcards and databases built from
  them keep their link back to the source node. **Gaps are data:** anything
  that couldn't be captured (an embedded image, a link to an item you couldn't
  access) leaves a visible placeholder and a line in the import report. It
  never leaves silence or a broken `<img>`.
- **Extension-gating ladder.** This needs first-class typed data (connection,
  sync links), several coordinated shell surfaces (a create-menu item, the
  import dialog, a right-sidebar tab) and a server pipeline. That justifies
  **`extensions/canvas/`**, `enabledByDefault: false`, `canDisable: true`.
  Templates or blocks can't express an external import.

## 2. Use case and scope

- **The user** was enrolled as a student in courses that have finished. The
  instructor wasn't the user.
- **Read-only against Canvas.** Every request is a `GET`, so the importer can
  never change anything in Canvas.
- **Private by default.** The materials are the instructor's copyrighted work.
  Imported nodes are never published by default, and publishing a
  Canvas-sourced node shows a warning. The course folder records attribution
  (instructor, institution, term).
- **What gets imported** for each course:
  - the syllabus;
  - modules and their items;
  - for each assignment: **your submission, your grade and the instructor's
    feedback**;
  - for each discussion: the prompt and **your own replies only**.
    Classmates' posts are their writing, so they are left out by default.
- **Out of scope:**
  - live or background sync;
  - OAuth / developer keys (only needed to offer this to other users;
    see §11);
  - quiz questions (the API doesn't give students quiz content);
  - courses you were never enrolled in (use the `.imscc` importer, Phase 3).

## 3. What exists today (codebase map, 2026-11-02)

| Need | Exists | Where |
|---|---|---|
| Extension "+" menu entry with `parentId` | ✅ | `ExtensionRuntime.createMenuItems` (`lib/extensions/types.ts:152`), rendered by `new-content-menu.tsx:496`, header (`LeftSidebarHeaderActions.tsx:507`) and context menu (`file-tree-actions.tsx:339`). Template: `extensions/reader/client.tsx:219` |
| Manual folder order | ✅ | `FolderPayload.sortMode` `null` = manual (`prisma/schema.prisma:1184`) |
| Tree icons | ✅ | `ContentNode.customIcon` / `iconColor`, rendered in `FileNode.tsx:337` |
| Server HTML → TipTap | ✅ (needs export) | `@tiptap/html` bridge in `lib/domain/content/markdown-serialize.ts:59-69` + `sanitizeTipTapJsonWithExtensions`. **Don't** use `@tiptap/core` `generateJSON` on the server (see §14). |
| Note create / collaboration-safe replace | ✅ | First import: nested `contentNode.create`, like `create-note.ts:34`. Re-import: `writeNoteContent({ mode: "replace", destructiveApproved: true })` (`write-note-content.ts:161`), then tag/image/mention sync, like `updateExtensionNoteContent` |
| Server-side file storage | ✅ (copied 3×) | Best template: `storeBookFile` (`lib/domain/reader/server/library.ts:132`), with checksum dedupe and the correct `storageProvider`. Extract a shared `storeBufferAsFileNode` as part of this work. |
| Encrypted credential | ✅ pattern | `encrypt()`/`decrypt()` (`lib/infrastructure/crypto/encryption.ts`), same shape as `ReaderConnection.tokenEncrypted` |
| Link table keyed by external id | ✅ pattern | `BookmarkSyncLink` `@@unique([connectionId, chromeNodeId])` |
| Right-sidebar tab for content | ✅ (needs a trigger) | `contentSidebarPanel` + `useContentSidebarClaims` (`lib/extensions/content-sidebar.ts`). Core viewers render the imported nodes, so a `shellController` claims the tab for Canvas-linked ids (§9.1). |
| Per-node extension context actions | ❌ | Not in `ExtensionRuntime`. Deferred (§10). |

## 4. Data model (migration, owner-run)

```prisma
model CanvasConnection {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId        String   @db.Uuid
  baseUrl        String   // https://school.instructure.com
  tokenEncrypted String   // encrypt({ kind: "pat", token }); later { kind: "oauth", … }
  canvasUserId   String?
  lastUsedAt     DateTime? @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  links          CanvasSyncLink[]
  @@unique([ownerId, baseUrl])
}

model CanvasSyncLink {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  connectionId    String   @db.Uuid
  contentId       String   @db.Uuid
  canvasCourseId  String
  canvasType      String   // course | module | page | file | assignment | discussion | quiz | external_url | external_tool | syllabus
  canvasId        String
  moduleId        String?  // owning module, for module-scoped re-import
  remoteUpdatedAt DateTime? @db.Timestamptz(6) // last Canvas version the user has seen
  importedHash    String?  @db.VarChar(64)      // node bodyHash right after import/replace
  status          String   @default("linked")   // linked | removed_upstream | dismissed
  importedAt      DateTime @default(now()) @db.Timestamptz(6)
  @@unique([connectionId, canvasType, canvasId])
  @@unique([connectionId, contentId])
  @@index([connectionId, canvasCourseId, moduleId])
}
```

- **A link table, not a column on `ContentNode`.** Deleting the connection
  removes provenance and leaves your notes alone. `ContentNode` doesn't change.
- **The link table is what makes re-runs safe.** Its unique key means
  re-running a failed import skips what already landed instead of duplicating
  it.
- **`remoteUpdatedAt`** is the last Canvas version the user has *seen*. When a
  conflict is resolved (either choice), it moves to the new Canvas value, so
  the same conflict isn't offered again until Canvas changes once more.
- **`importedHash`** tells "untouched since import" apart from "the user
  edited this".

## 5. Tree mapping

```
📁 BIO 201 — Cell Biology (Fall 2023)      course folder, graduation-cap, locked
  📝 Syllabus                               first child, locked
  📝 Import report                          last child (§6.4); not locked
  📁 Module 1: Membranes                    module folder, locked
    📝 Reading: Lipid Bilayers              Page → note
    📄 Lecture 1 slides.pdf                 File → file node (eager download)
    📝 Problem Set 1                        Assignment → prompt / My submission / Feedback
    🔗 Khan Academy: Diffusion              ExternalUrl → external node
```

| Canvas item | Becomes | Notes |
|---|---|---|
| Page | note | Body HTML → TipTap (§3) |
| File | file node | Downloaded eagerly, because access ends with the term. Above a size threshold (default 200 MB, configurable) it stays an external link instead, and the report notes that. |
| Assignment | note | Sections: prompt; due date as an inline timestamp; **My submission** (text plus attachments as file nodes); **Grade**; **Feedback** (submission comments) |
| Discussion | note | Prompt plus your own replies, with dates |
| Quiz | note | Description plus your score; questions aren't available to students |
| ExternalUrl | external node | Straight mapping |
| ExternalTool (LTI) | external node → Canvas launch URL | LTI tools can only launch from inside Canvas; the report notes that |
| SubHeader | **open (§13)** | Skip, divider note, or sub-folder |

## 6. Import pipeline

### 6.1 Dialog flow (`+ → Canvas Course…`)
1. **Connect.** Shown only when no `CanvasConnection` exists: paste base URL
   and personal access token. A test call (`/api/v1/users/self`) runs before
   saving.
2. **Pick courses.** Lists past enrollments (`/api/v1/courses` filtered to
   completed enrollments, with `include[]=term`). Already-imported courses show
   "Imported Oct 2024 · Re-import".
3. **Import** into the `parentId` the menu passed in (root when opened from
   the header "+").

### 6.2 Pass 1: structure and content
- **Fetch:** modules with items, plus each item's body (pages, assignments
  with `submission` + `submission_comments`, discussion entries filtered to
  the user, file metadata).
- **Request style:** sequential requests. Canvas throttling is per token and
  forgiving to serial calls. Handle both 403 "Rate Limit Exceeded" and 429
  with backoff.
- **Create nodes in Canvas order** (`displayOrder` from `position`). Each
  node's `CanvasSyncLink` is written in the same transaction as the node.

### 6.3 Pass 2: links and images
- **Internal links** (`/courses/:id/pages/:slug`, `/courses/:id/files/:id`,
  `/courses/:id/assignments/:id`, …) become wiki-links to the imported node.
  If the target wasn't imported, the link stays a Canvas URL with a visible
  "not captured" marker.
- **Embedded `<img>`** pointing at Canvas files: download, store, and rewrite
  the `src`. If that fails, insert a placeholder naming the missing file.

### 6.4 Import report
A note in the course folder listing counts per type, links rewritten, files
over the threshold, and every item that couldn't be captured, with the reason.
The importer writes this note, so its title is not locked.

### 6.5 Execution
- **How it runs:** one long request (`maxDuration = 300`, as scripture install
  uses) that streams progress to the dialog.
- **Interruptions:** if the request is cut off, re-running resumes, because
  the unique link key skips what already landed.
- **Later:** Workflow SDK durability only if real courses exceed the request
  window.
- **After creating nodes:** call `markContextDirty([parentId])`, as the normal
  create route does.

## 7. Title lock

- **One predicate, `isSyncLocked(contentId)`** (`lib/domain/canvas/lock.ts`),
  true when a `CanvasSyncLink` with status `linked` points at the node.
- **Called explicitly at every place a rename can happen,** following the
  `stripPrivateContent` pattern:
  - the content PATCH route `title` branch
    (`app/api/content/content/[id]/route.ts:751`). This also guards the stored
    file rename at :1324.
  - the AI `rename_note` tool (`lib/domain/ai/tools/registry.ts:3787`) and any
    MCP path that reuses it;
  - any other title writer the gate finds.
- **Gate:** `pnpm canvas:lock:check` pins the list of call sites, so a new
  rename path that skips the predicate fails the build. Mutation-test it.
- **The server enforces the lock; the UI only reflects it.** The tree hides
  "Rename" and shows a small lock badge. The AI tool returns a real outcome:
  "That title comes from Canvas and is locked."
- **Still editable:** note bodies (protected on re-import by §9.3), icon and
  color, and everything you add yourself.
- **Moves and deletes:** deleting an imported node sets its link to
  `dismissed`, and re-import respects that. Moves *within* the course folder
  are allowed. Moves *out of* it are blocked, because an imported item living
  elsewhere makes module-scoped re-import ambiguous.

## 8. Your notes between imported items

Manual order (`sortMode: null`) already holds a note dropped between two
imported items. Only re-import (§9) has to preserve it:

- **Anchor rule, worked out at re-import time (never stored).** Within a
  module folder, each node without a link attaches to the nearest linked node
  above it, or to the folder top if there isn't one.
- **New order:** linked nodes in Canvas order, each followed by its attached
  notes, in their existing relative order.
- **Anchor removed upstream:** the anchor node is kept (§9.3), so its notes
  stay attached.
- **Anchor moved to another module upstream:** the anchor stays in its current
  folder and is flagged in the change list, so your notes never move to
  another folder without your say.

## 9. Re-import

### 9.1 The Canvas sidebar tab (the single place to check)
- **When it shows:** whenever the selected node belongs to an imported course
  (course folder, module folder, or any imported note or file).
- **How it's claimed:** an extension `shellController` watches the selection
  and claims the tab for Canvas-linked ids, using one cached id set per
  course.
- **Contents:**
  - **Provenance:** course, module, "↗ open in Canvas", import date.
  - **Check for changes:** list calls per course (modules with items, pages,
    files, assignments) compare each item's Canvas `updated_at` with the
    link's `remoteUpdatedAt`. Nothing is downloaded at this step.
  - **Change list per module:** "2 changed · 1 new · 1 removed", each module
    with a checkbox. If a module folder is selected, its box is pre-ticked.
  - **Re-import selected.**

### 9.2 Plan, then apply
Re-import computes a **plan** for the ticked modules before writing anything:
creates, replaces, upstream removals and **conflicts**. Changes that don't
conflict are applied together with the conflict resolutions, in one pass,
after the queue (§9.3) is settled.

### 9.3 What happens to each item

| Case | Behavior |
|---|---|
| Changed upstream, your copy untouched (`bodyHash == importedHash`) | Replace through `writeNoteContent`; refresh `importedHash` and `remoteUpdatedAt` |
| **Changed upstream and edited by you** | **Conflict, goes to the queue (§9.4)** |
| New upstream | Create at its Canvas position |
| Removed upstream | Keep it; link status becomes `removed_upstream`; a "no longer in Canvas" badge |
| Link `dismissed` (you deleted it) | Skip; it is never recreated |
| File changed upstream | Download the new version. If you haven't touched the file node, replace its bytes. Otherwise it's a conflict. |

### 9.4 Conflict queue (owner decision, 2026-11-02)
Every conflict in the plan is shown in **one review queue** in the sidebar
tab, so all conflicts are settled in a single pass:

```
3 items changed in Canvas that you've also edited
[ Skip all ]  [ Add all as siblings ]

  Reading: Lipid Bilayers        ( • Skip   ○ Add sibling )
  Problem Set 2                  ( ○ Skip   • Add sibling )
  Lecture 3 notes.pdf            ( • Skip   ○ Add sibling )

                     [ Apply 2 changes, 1 conflict resolution… ]
```

- **Two choices per item. The default is Skip.**
  - **Skip:** keep your version. The link's `remoteUpdatedAt` advances, so
    this version isn't offered again; a newer Canvas edit will be.
  - **Add sibling:** create the Canvas version directly after yours, titled
    `<title> (Canvas, <Mon YYYY>)`. Your node stays the linked one: it's the
    one your wiki-links point at, and its title stays locked. The sibling is a
    plain note with provenance in `NotePayload.metadata`
    (`canvasSnapshotOf: <linkId>`) and an unlocked title. `remoteUpdatedAt`
    advances.
- **Bulk actions:** "Skip all" and "Add all as siblings" set every row, and
  individual rows can still be changed afterwards.
- **Nothing is written until Apply.** The result line reports what actually
  happened ("2 replaced, 1 sibling added, 1 skipped").
- **Later (not Phase 2):** a "Compare" action per row that opens the Canvas
  version beside yours.

## 10. Entry points

- **`createMenuItems`:** one top-level item, **"Canvas Course…"**, iconName
  `GraduationCap`. Add the icon to `lib/extensions/icons.tsx`; the
  `extensions:check` gate asserts it.
- **Later:** if `.imscc` / Notion importers arrive, group all importers under
  one **Import ▸** submenu.
- **Deferred:** a right-click "Re-import from Canvas…" needs a new, generic
  `ExtensionRuntime.nodeContextActions` hook. Build it only when a second
  extension needs per-node actions. The sidebar tab covers the need until
  then.

## 11. Access and authentication

- **Phase 1 uses a personal access token:** Canvas → Account → Settings →
  Approved Integrations → New Access Token, with an expiry set. The token has
  the user's full permissions, so it is stored encrypted, decrypted only
  server-side, and never sent to the client.
- **Check access first (Phase 0):** Canvas → Courses → All Courses → Past
  Enrollments must list the courses and they must open. Institutions may hide
  concluded courses, delete old ones, or deactivate alumni logins. If the
  courses aren't accessible, the fallback is an `.imscc` export from the
  instructor (Phase 3).
- **Offering this to other users later:** needs an OAuth developer key per
  institution (issued by its Canvas admin) and the vendor-review work that
  comes with it. `tokenEncrypted` stores `{ kind, … }` so OAuth only adds a way
  to get the token; the sync code doesn't change.

## 12. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P0** (owner) | Confirm Past Enrollments are visible; generate a token | none |
| **P1 Archive import** | Extension skeleton, migration, connect + picker dialog, pass 1 + pass 2, import report, title lock + `canvas:lock:check`, private-by-default + publish warning, shared `storeBufferAsFileNode` | `pnpm canvas:mapper:check`: fixture Canvas JSON → expected node plan, no network (like `reader:check`); `canvas:lock:check` |
| **P2 Re-import** | Sidebar tab + `shellController` claim, check for changes, module selection, plan/apply, anchor rule, conflict queue | Mapper fixtures for the anchor rule and the conflict plan |
| **P3 `.imscc` import** | Common Cartridge file → the same "course → modules → items" mapper, with the source as a pluggable input. Covers courses you can no longer reach and is the start of option 2 | Fixture `.imscc` |
| Later | OAuth, Import ▸ submenu, node context actions, Compare view | n/a |

## 13. Open questions

1. **SubHeader items:** skip, divider note, or sub-folder grouping the items
   below it?
2. **File size threshold** for eager download: 200 MB default?
3. **Discussions:** the default is your replies only. Should there be an
   opt-in for the full thread (with classmates' names)?
4. **Attribution:** where does it live? Course folder metadata, or the first
   lines of the Syllabus note?

## 14. Incidental findings (unverified, from the 2026-11-02 survey)

1. **Cron routes may never run:** every `app/api/cron/*` route exports only
   `POST`, but Vercel Cron sends `GET`. Purge-trash, scheduled-publish and
   the others may be returning 405.
2. `lib/domain/browser-extension/service.ts:1073` calls `generateJSON` from
   `@tiptap/core` server-side. That version needs a browser DOM, so it may
   fail in Node.
3. Image, speech and workflow-DOCX storage hardcode `storageProvider: "r2"`
   regardless of the user's default provider.
4. **Found and fixed during the build:** the content GET cache
   (`lib/domain/content/content-cache.ts`) was a module-level `Map`. Next
   compiles each route with its own copy of the module, so
   `invalidateCachedContent` called from any route other than
   `content/[id]` cleared a cache the GET never read. After a re-import the
   GET served the old body for up to 30 s, and an offline editor could
   autosave it back over the update. The map now lives on `globalThis`, one
   per process. This is the only change to shared content code.

## 15. As built (2026-11-02)

**Where the build differs from the design above:**
- **Schema (§4):**
  - `CanvasSyncLink.canvasKey` (`course`, `syllabus`, `report`,
    `module:<id>`, `item:<moduleItemId>`) is unique per
    `(connectionId, courseId)`.
  - `remoteVersion` is a string: `updated_at` for the API, a content hash
    for cartridges.
  - `contentId` is nullable with `SetNull`. "Dismissed" is derived: the link
    has no node (purged) or its node is in the trash. No status value is
    needed, and a purge can't resurrect the item on re-import.
  - `CanvasConnection.kind` is `api` or `cartridge`. Every cartridge import
    shares one `cartridge:local` row.
- **Edit detection:** "untouched since import" compares a content
  fingerprint (`lib/domain/canvas/fingerprint.ts`), not `bodyHash`. Opening
  a note gives its blocks ids and fills attribute defaults, so raw JSON would
  flag every note you merely read as edited.
- **The planner always plans every module,** with an `inScope` flag, so a
  re-import of Module 3 still turns its links into Module 5's pages into
  wiki-links. Only in-scope nodes are written.
- **Publishing is refused, not warned:** course material is the instructor's
  work. The import report is exempt.
- **"Disconnect" forgets the token** but keeps the connection row, because
  provenance and title locks hang off it.

**Open questions (§13), resolved by owner-default:**
- SubHeader → a sub-folder holding the items below it.
- Files over 200 MB stay links to Canvas.
- Discussions → your replies only.
- Attribution → first lines of the Syllabus note and of the Import report.

**Gate:** `pnpm canvas:check` (`scripts/validate-canvas.ts`, in `build`, so
`ci:gates` runs it in CI).
- **Coverage:** 90 checks — planner rules, ordering, fingerprint, HTML for
  both sources, composers, an in-memory `.imscc`, and 10 lock seams.
- **Mutation-tested four ways, each caught:** order drops attachments (4
  checks failed), conflicts overwrite (6), move seam removed (1), fingerprint
  counts block ids (1).

**Trying it without a school (`pnpm canvas:mock`):**
1. Start the mock Canvas: `pnpm canvas:mock`.
2. Serve with `CANVAS_ALLOW_LOCAL=1 pnpm dev`.
3. + → Canvas Course…, address `http://localhost:4580`, any token except
   `bad`.
4. `POST /__mock/change` edits the course; `GET /__mock/demo.imscc` serves
   the same course as an export.

**Smoke, 2026-11-02:** against the mock with a smoke user on a per-worktree
DB (`dg_canvas`).
- **API journey (45/45):** connect (bad token refused), list
  (restricted stub hidden), import, content fidelity (wiki-links, stored
  images, visible gaps, submission + grade + feedback, own replies only,
  quiz score), every lock (rename 423, move-out 423, move-within OK, publish
  423), user note between items, edit, check for changes, re-import with a
  sibling resolution, check again ("everything matches"), cartridge import.
- **Headless UI (10/10):** lock badges, + menu entry, connected dialog with
  the imported course marked, greyed Rename, Canvas tab with provenance and
  "Everything matches Canvas", no page errors.

**Follow-ups (not built):**
- OAuth / developer keys (§11).
- A generic `ExtensionRuntime.nodeContextActions` hook ("Re-import from
  Canvas…" on right-click).
- A Compare view for conflicts.
- An Import ▸ submenu, once a second importer exists.
- Moving the three hardcoded-`r2` storage paths onto
  `storeFileBody` (`lib/domain/canvas/server/write.ts`).
- Verifying findings 1–3 above.
