---
status: proposed — design only, nothing built. Needs owner decisions on the Open Questions (§9) before P0.
created: 2026-09-28
depends_on: none (P0 needs an owner-run migration: shared corpus tables)
---

# Scriptures integration — the standard works, talks, and study notes inside Digital Garden

Bring the LDS standard works (Old Testament, New Testament, Book of Mormon, Doctrine
and Covenants, Pearl of Great Price) into Digital Garden as **reference text you can
read, cite, and annotate**, with General Conference talks and other study material
clipped in on demand. The study itself — notes, highlights, cross-references, talk
notes, memorization — lives in the user's own notes and folders.

We build this on an existing open dataset, not from scratch (see §2).

---

## 1. The shape, judged against the product principles

Read `core/PRODUCT-PRINCIPLES.md` first. Two tests decide the architecture:

- **Principle 1 (project the user's structure, don't build a parallel one).** The
  canonical text is *reference material*, like a dictionary. It is not the user's
  structure, and nobody should maintain it. The user's *study* is their structure. So:
  - the text lives once, shared and read-only (§3);
  - everything the user writes is an ordinary note, in folders they choose, created
    **lazily**, only for the chapters and talks they actually touch (§5).
  - We deliberately do **not** drop 1,582 chapter notes into every user's tree. That
    would be a parallel structure nobody authored, it would bury the user's own
    notes, and it would let anyone edit scripture text by accident.
- **Principle 2 (unrefined → structured).** Scripture study already produces the
  repeated-unit shape the principle describes: *talk → the scriptures it cites →
  topics*, and *verse → cross-references → insights*. Citations get indexed
  automatically (§4.3). A talks library is a Database table whose rows point back at
  the talk notes (§6), not a second copy of those notes.

**Extension-gating ladder (CLAUDE.md).** Templates and blocks alone can't carry this.
It needs first-class typed data (versification, canonical verse identity, a shared
corpus), several coordinated shell surfaces (reader viewer, reference autocomplete,
a Citations sidebar tab, AI tools), and seed data. That justifies an extension:
**`extensions/scriptures/`**, with `enabledByDefault: false` and `canDisable: true`.
The generic pieces (§4.1 the inline reference, §4.2 the verse-quote block) are
written so another corpus could reuse them later (for example another Bible
translation). That is a direction, not a commitment.

---

## 2. Source data: take an existing repo, pin it

| Candidate | What it gives | Verdict |
|---|---|---|
| [bcbooks/scriptures-json](https://github.com/bcbooks/scriptures-json) (Ben Crowder) | All five standard works (2013 edition text, including the 2013 corrections). Hierarchical, flat and reference editions. Chapter headings, D&C section structure, Official Declarations. Public domain / CC0. | **Primary.** Clean structure, stable book names, explicitly excludes copyrighted apparatus. |
| [beandog/lds-scriptures](https://github.com/beandog/lds-scriptures) (LDS Documentation Project) | The same canon, exported as SQLite, Postgres, CSV and JSON. Normalized volume/book/chapter/verse tables. Public domain. | **Cross-check.** P0 verifies verse counts and text against it, and it is the fallback if bcbooks goes stale. |
| [Desktop-Scriptures](https://github.com/kz6fittycent/Desktop-Scriptures) | A reader with notes, tags and highlights. | **UX reference only.** No code reuse. |
| [`scripture-guide`](https://www.npmjs.com/package/scripture-guide) (npm) | Parses references, including LDS abbreviations ("1 Ne. 3:7", "D&C 88:118"). | **Evaluate for §4.1.** Following the CLAUDE.md library-first rule, adopt it if it is maintained and handles ranges and lists. Otherwise write a small grammar and record in this doc which gap forced it. |

**Copyright boundary.** This is non-negotiable, and it shapes Phase 4:

- **Ingested:** the verse text and the chapter/section headings that ship in bcbooks.
- **Not ingested:** footnotes, chapter summaries, the Topical Guide, the Bible
  Dictionary, the Guide to the Scriptures, the Joseph Smith Translation appendix, and
  the introductions. These are © Intellectual Reserve, Inc., and the public-domain
  datasets exclude them for that reason.
- **Conference talks are copyrighted** and are never bundled, scraped in bulk, or
  redistributed. The scraped datasets on GitHub
  ([johnmwood/LDS-Conference-Scraper](https://github.com/johnmwood/LDS-Conference-Scraper),
  [leezorba/generalconference_scraper](https://github.com/leezorba/generalconference_scraper),
  [bryanwhiting/generalconference](https://bryanwhiting.github.io/generalconference/))
  are **not** sources. Talks arrive only through a **user-initiated, one-at-a-time
  clip** into that user's private notes (§6). Before P4, the owner must check that this
  fits the Church's current site terms of use. I couldn't fetch the terms page from
  this environment, so this is unverified.
- **Publishing:** the copyright boundary also applies to the public site. A published
  note may quote scripture freely, but a clipped talk note must not be publishable
  wholesale. Phase 4 adds a guard on this.

**Pinning.** The seed script takes a git commit SHA of `bcbooks/scriptures-json`, not
`master`, and records it in `ScriptureCorpus.sourceRevision`. Re-seeding is an explicit,
versioned act (§3.2).

**Size.** About 1,582 chapters and about 41,995 verses (OT 23,145 · NT 7,957 ·
BoM 6,604 · D&C 3,654 · PGP 635). That is roughly 4–5 MB of text: trivial as one
shared copy, wasteful per user.

---

## 3. Storage: one shared, read-only corpus

### 3.1 Tables (new; `prisma/` is owner-run)

```prisma
model ScriptureCorpus {       // one row per ingested edition
  id              String  @id            // "lds-en-2013"
  sourceRepo      String                 // "bcbooks/scriptures-json"
  sourceRevision  String                 // pinned commit SHA
  version         Int                    // bump on re-seed; anchors in §4.4 carry it
}
model ScriptureBook {
  id        String @id                   // "bofm/1-ne"  (volume/book URI slug)
  corpusId  String
  volume    String                       // "ot" | "nt" | "bofm" | "dc-testament" | "pgp"
  title     String                       // "1 Nephi"
  abbrev    String                       // "1 Ne."
  order     Int
}
model ScriptureVerse {
  id        String @id                   // "bofm/1-ne/3/7"
  bookId    String
  chapter   Int
  verse     Int
  text      String                       // immutable within a corpus version
  // trigram GIN on text, same pattern as NotePayload.searchText
  @@unique([bookId, chapter, verse])
}
// Chapter headings: ScriptureChapter { bookId, chapter, heading? }
```

The IDs deliberately follow the church website's URI shape
(`/scriptures/bofm/1-ne/3?id=p7`). A reference can then deep-link out to the official
site, with its footnotes, without any mapping table.

**Why global and not `ownerId`-scoped.** Every `ContentNode` today is per-owner, and
there is no shared corpus concept (`MULTI-TENANCY-PLAN.md`: `Tenant` is a publishing
scope only). The corpus is not user content, though. It is closer to a code-shipped
dictionary. It gets its own tables with no `ownerId`, read-only to every signed-in
user, and writable only by the seed script. We rejected the alternatives:

| Alternative | Why not |
|---|---|
| Copy the corpus into each user as ~1,582 notes | ~5 MB per user. The text becomes editable, so scripture can be corrupted by accident. Backlinks already scan every owned note's JSON (`app/api/content/backlinks/[id]/route.ts`, O(corpus)), and this would add 1.5k notes to that scan. It buries the user's tree. It makes corpus upgrades a per-user migration. |
| A system user plus `ViewGrant`s | This forces a reference text into the content-sharing model. Every tree, search and AI read path would need "also include granted system content" logic. |
| A per-user `DataPayload` table (Database content type) | Same duplication. Rows are editable. 42k rows per user. |

### 3.2 Seeding

- `scripts/scriptures/seed.ts` (`pnpm scriptures:seed --rev <sha>`) downloads the pinned
  JSON and normalizes it. It then asserts:
  - verse counts per book against beandog;
  - no empty verses;
  - every ID is unique.
  After that it upserts inside one transaction, using chunked `createMany` (the
  bind-parameter pattern from `lib/domain/flashcards/from-data.ts`).
- Re-seeding a new revision bumps `ScriptureCorpus.version`. Verse IDs are stable across
  revisions, so references (§4.1) never break. Character-offset anchors (§4.4) carry
  the version they were made against and get re-anchored by text diff.

---

## 4. Core primitives

### 4.1 `scriptureRef`: an inline node, the load-bearing piece

- This is a TipTap inline atom. Attributes: `ref` (the canonical range
  `bofm/1-ne/3/7-8`, or a list), `display` (what the user typed, "1 Ne. 3:7–8").
  It needs a `Server*` variant, a collaboration registration, and a
  `TIPTAP_SCHEMA_VERSION` MINOR bump, following the CLAUDE.md "Adding a New TipTap
  Extension" checklist, and a Hocuspocus redeploy after merge.
- **Input:**
  - a suggestion menu, triggered by a typed reference pattern or a `/scripture`
    slash command;
  - paste-time auto-linking of recognized references (it can be undone, like
    autolink).
- **Hover** shows the verse text. **Click** opens the reader (§5.1) at that verse.
  **Cmd-click** opens the official page.
- **Markdown codec** (`markdown-block-codecs.ts`): serialize to
  `[1 Ne. 3:7](scripture:bofm/1-ne/3/7)`, so export and source view stay readable and
  the round trip is lossless. `pnpm markdown:blocks:check` gates it.

### 4.2 `scriptureQuote`: a verse-transclusion block

- This is a block atom. It renders the canonical text for a `ref` range, with verse
  numbers. It is **not editable**: the text comes from the corpus, so a note can
  never hold a subtly altered verse.
- The user's commentary goes in ordinary paragraphs around it. This is the
  "margin note" pattern: a verse, then your thinking under it.
- **Export** falls back to a blockquote plus a citation line
  (`> text — 1 Ne. 3:7`), so a quote still reads correctly outside Digital Garden.

### 4.3 The citation index: backlinks by verse, without O(corpus) scans

- `ScriptureCitation { contentId, ownerId, verseStartId, verseEndId, blockId? }`.
- It is rebuilt for a note on every save, from its `scriptureRef` and
  `scriptureQuote` nodes. This happens on the same write path that maintains
  `ContentLink`, and it runs for both REST writes and collaboration store-hook
  writes.
- Queries it answers:
  - "which of my notes cite Alma 32:21?"
  - "which talks cite this verse?"
  - "which verses in Moroni 10 have I written about?"
  All of these are indexed range-overlap lookups, never document scans.
- Private content is respected: a reference inside a `privateBlock` is still indexed
  for the author, because this is an author-only surface. The
  `stripPrivateContent` seams do not change.

### 4.4 Highlights and marks: an annotation store anchored to immutable text

- Today, highlighting means editing a note, because `ai-highlight` and
  `flashcard-select` are marks inside the document. The corpus has no document, so
  highlights need their own store:
  `ScriptureAnnotation { ownerId, verseId, start, end, color, label?, corpusVersion, noteContentId? }`.
- **Why this is cheap here and hard elsewhere:** the anchored text is immutable
  within a corpus version. Character offsets are therefore stable anchors, and none
  of the fuzzy re-anchoring that general web or note annotation needs is required.
  Only a re-seed triggers re-anchoring (§3.2).
- `noteContentId` optionally ties a highlight to the study note that discusses it.
  The highlight then shows a "has note" marker that opens that note.

---

## 5. Surfaces

### 5.1 Reader (content viewer)

- A virtual content target, `scripture:bofm/1-ne/3`, opens as a normal tab in the
  main panel. It gets back/forward history, workspaces, and tabs for free.
- **Layout:**
  - chapter heading, then numbered verses;
  - the user's highlights (§4.4);
  - a **margin gutter** that marks each verse with dots for the user's own
    citations (§4.3). Hovering a dot lists the notes and talks.
- The reader is the *projection* of the user's study onto the text, not a place to
  store it.
- Navigation uses a volume / book / chapter picker, previous/next chapter, and
  "go to reference" (the §4.1 parser in a command palette).
- The speed reader can read a chapter too: `load-source.ts` gets a `scripture:`
  source.

### 5.2 "Study this verse": the fast path leads into the user's notes

- Select verses in the reader, then choose **Add study note**. The chapter's study
  note is created or opened, and a `scriptureQuote` for the selection is appended
  with the cursor placed after it.
- **Where the note lives** is the user's choice:
  - A setting, *Study notes folder* (default `Scriptures/`), plus a layout choice:
    *one note per chapter* (default: `Scriptures/Book of Mormon/1 Nephi 3`),
    *one per book*, or *append to today's daily note* (`daily-notes`).
  - Folders and notes are created **lazily, on first use only**. The user's tree
    grows with their study, not with the canon.
  - This is Principle 1: the convenient route (one click from a verse) and the
    structurally sound route (a real note, in a real folder, with a real citation)
    are the same route.
- The same action exists from any `scriptureRef` hover card.

### 5.3 Citations sidebar tab

- For the open note, this tab lists every verse it cites, with the text inline.
- For the open reader chapter, it lists every note and talk citing the chapter,
  grouped by verse.
- It registers as a `sidebar-tab` in the tool-surfaces registry, filtered to notes
  and to the scripture viewer.

### 5.4 Search

- A **Scriptures** scope in search queries `ScriptureVerse.text` through the trigram
  index. It is separate from note search so results don't flood each other.
- "Search scriptures for *charity*" returns verses. Each result can be opened in the
  reader or inserted as a quote.

---

## 6. Talks and other study material: clip, don't bundle (Phase 4)

- **Clip a talk:** paste a General Conference talk URL. The server fetches that one
  page for that user, and the talk becomes an ordinary note under
  `Conference/2025 October/…` (the folder is configurable). Metadata is stored:
  speaker, calling, session, date, source URL.
- **Footnotes become citations.** The talk's scripture footnotes are parsed into
  `scriptureRef` nodes, so every clipped talk joins the citation index (§4.3)
  automatically. "Which talks that I've saved cite Ether 12:27?" needs no extra work.
- **Talks library as a Database (Principle 2).** An optional *Talks* table has these
  columns:
  - Speaker (select, a growing vocabulary)
  - Conference (select)
  - Date
  - Topics (multiSelect)
  - Talk (a `contentLink` to the talk note)
  Clipping appends a row. The table indexes the notes and does not copy them. A gap,
  such as a talk with no topics yet, is a deliberate blank.
- The same clip path covers *Come, Follow Me* lessons, Liahona articles, and
  devotionals. There is one "clip study material" action, not one per publication.
- **Guards:**
  - A clipped note carries `metadata.clippedFrom` plus a copyright flag.
  - Publishing refuses to publish a flagged note in full (quoting a passage inside
    the user's own note is fine).
  - No bulk "import all talks" action exists.

---

## 7. AI (Phase 4)

- Tools:
  - `read_scripture(ref)` returns canonical text for a reference or range;
  - `find_scripture_citations(ref)` queries the index in §4.3;
  - `search_scriptures(query)` searches the verse text.
  They are registered through the normal AI tool inventory, and `ai:drift:check`
  must pass.
- **Grounding rule** (system prompt plus tool descriptions): never quote scripture from
  model memory. Always fetch it with `read_scripture`, and cite with a `scriptureRef`.
  Models misquote and misnumber verses. The canonical text is one tool call away, so
  there is no reason to trust recall.
- **Unrefined → structured:** "turn my notes on Alma 32 into a table of
  principles → supporting verses" is the existing extraction-to-database loop. Verse
  references are the provenance column.

## 8. Flashcards: memorization (Phase 3)

- Add **Memorize** to a verse selection in the reader. It creates a `Flashcard`:
  - front: the reference (with an optional first-words cue);
  - back: the verse text.
  The card goes to a deck the user picks (for example *Doctrinal Mastery*).
- This needs a nullable `sourceScriptureRef` on `Flashcard` next to
  `sourceContentId`, because the source is not a `ContentNode`.
- FSRS scheduling works unchanged.

---

## 9. Open questions (owner)

1. **Shared corpus tables.** Is a global, `ownerId`-less, read-only table set
   acceptable (§3.1)? This is the first content of its kind in the schema.
2. **Talk clipping and site terms.** Confirm that user-initiated, private, one-at-a-time
   clipping fits the Church's terms of use before P4. If it doesn't, P4 shrinks to
   "store the URL, metadata and the user's own notes" (a bookmark-shaped note).
3. **Languages and editions.** English 2013 only to start? bcbooks is English only.
   Other languages would need another source.
4. **Default study-note layout** (§5.2): per chapter, per book, or the daily note?
5. **Excluded apparatus.** Do we link out to the official site for footnotes, the
   Topical Guide and the Bible Dictionary (proposed), or show nothing?

## 10. Phases

| Phase | Scope | Gate |
|---|---|---|
| **P0 Corpus** | Tables and migration (owner-run). Seed script pinned to a SHA. Count and text cross-check against beandog. Read API `GET /api/scriptures/{book}/{chapter}` and `GET /api/scriptures/ref?q=`. No UI. | Seed asserts pass. ~41,995 verses present. |
| **P1 Read and cite** | Extension skeleton (manifest, installed and manifests registration, `extensions:check`). Reference parser (library first). `scriptureRef` node, suggestion and paste autolink, hover card. Reader viewer. Citation index and reader margin dots. | typecheck, lint, `collab:schema:check`, `markdown:blocks:check`, build. Hocuspocus redeploy. Browser smoke. |
| **P2 Study** | `scriptureQuote` block. "Add study note" flow with folder and layout settings. Citations sidebar tab. Scripture search scope. Speed-reader source. | As P1, plus a Playwright stub for the reader. |
| **P3 Mark and memorize** | `ScriptureAnnotation` highlights in the reader. Flashcard "Memorize" (`sourceScriptureRef`). | Migration and smoke. |
| **P4 Talks and AI** | Talk and study-material clipping with footnote→ref parsing. Optional Talks database. Publishing copyright guard. AI tools and grounding rule. | Needs an answer to Q2. `ai:drift:check`. |
