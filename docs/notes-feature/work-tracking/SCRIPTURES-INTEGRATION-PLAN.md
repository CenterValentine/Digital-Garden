---
status: building — R3 (LDS standard works in the reader) built 2026-09-30 on `claude/inspiring-franklin-2g7h8l`, see §11. Schema migrated: `prisma/migrations/20260930120000_scripture_corpus`. Citation index, `scriptureRef`/`scriptureQuote` nodes, talks, flashcards and AI remain open.
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

## 11. As built — R3, LDS in the reader (2026-09-30)

The owner's call (2026-09-30): build the LDS standard works out completely and see
whether the shape is a good model for other traditions. It is one pipeline with the
tradition as data; the pieces below are the template a second tradition follows.

### 11.1 Model (`prisma/migrations/20260930120000_scripture_corpus`)

| Table | Holds | Keys |
|---|---|---|
| `ScriptureCorpus` | one tradition's canon in one edition (id `lds-standard-works`) — tradition, source URL, licence, versification, pinned version, `verseCount` | id (slug) |
| `ScriptureBook` | books in canonical order, grouped by `volume` (ot, nt, bofm, dc-testament, pgp), with abbreviations | corpusId + slug |
| `ScriptureVerse` | the text, book/chapter/verse + a corpus-wide `ordinal` | corpusId + bookSlug + chapter + verse; corpusId + ordinal |
| `UserScriptureCorpus` | which installed collections a user enabled | userId + corpusId |

Global and read-only (open question 1 answered: yes). **Each user adds the
collections they want** (owner decision, 2026-09-30): "Add" in the catalog
(`POST /api/reader/scriptures/install`, any signed-in user) loads the text the
first time anyone adds it, then enables it for that user; "Remove" only takes it off
their menu. Why no role gate: the text is pinned public-domain data, so an install
can't change what gets written. The one real hazard, concurrent installs, is closed
by running the write in one transaction under a per-corpus advisory lock — a second
add waits, then finds the corpus loaded; a failure rolls back, so no reader sees a
half-filled collection. Anything destructive later (remove a corpus for everyone,
re-pin a version) stays admin-only. Until a database has run `migrate deploy`, every scripture route
answers 503 with that instruction and the `+` menu shows only "Browse traditions…".

Annotations, bookmarks and progress reuse the reader tables with
`targetKey = scripture:<corpusId>`; a locator's `href` is `<book>/<chapter>[/<v>[-<v>]]`
and `locations.start/end` are character offsets into the first/last verse (the text is
pinned, so offsets are exact; the quote rides along in `text.highlight`).

### 11.2 Source — bcbooks/scriptures-json pinned to `3bda76e`

`lib/domain/scripture/adapters/lds.ts` normalizes the five volume files (D&C ships
`sections`, the others `books`). Verified against the real files: 87 books, every
chapter count matches the book table, 41,995 verses. Verse text and book headings only
— no footnotes, chapter summaries or Bible Dictionary (open question 5 answered in the
UI: an "Open in Gospel Library" button per chapter).

### 11.3 References — why not a library

`scripture-guide` (npm, the parser with LDS names) depends on `mysql2` and `dotenv` —
not acceptable in a client-side parser — and `bible-passage-reference-parser` has no
Restoration scripture. `lib/domain/scripture/reference.ts` is a small grammar over a
book table each corpus supplies: Church abbreviations ("1 Ne.", "D&C", "JS—H"),
ordinals ("First Nephi"), unambiguous prefixes ("Hela"), ranges, lists ("John 3:16,
17; Matt. 5:14–16; 6"), one-chapter books ("Enos 3" = Enos 1:3). Gated in
`reader:check` (every abbreviation resolves to its own book).

### 11.4 Surfaces

- **+ → Reader → Scriptures**: your added collections, then "Browse traditions…"
  (the catalog tab; the same component is Settings → Reader → Scriptures). The
  catalog shows addable collections as cards and folds planned / link-only
  traditions into one "More traditions" list.
- **Sessions — scripture in the file tree** (`lib/domain/scripture/server/sessions.ts`):
  "+ → Reader → Scriptures → <collection>" puts a session where the "+" pointed, the
  book convention. A session is an `external` content node with `resourceType:
  "scripture"` (collection id in `captureMetadata`, URL = the collection's public home
  page), so rename, move, icon, delete, search and trash are the tree's own. Default
  icon `lucide:BookMarked` in gold (books are BookOpen; charters ScrollText). Each
  session keeps its own reading position (`content:<sessionId>`); highlights and
  notes stay per collection (`scripture:<corpus>`), shared by every session — marks
  are about the verse. The viewer match gained `externalResourceType` (generic: any
  extension can claim a kind of link node, as `mimeType` does for files).
- **Menu drill-down**: hovering the collection in "+ → Reader → Scriptures" lists
  "Open at the covers", then volumes → books → chapters; any pick adds a session
  there and opens it at that spot (a session is still the whole collection). Books
  over 20 chapters group them by tens ("Chapters 141–150" — Psalms has 150, D&C 138
  sections) so no submenu is a wall of rows. Needs a book table that ships with the
  code (`lib/domain/scripture/tables.ts`; LDS has one) because the menu is built
  synchronously; other collections get a plain entry.
- **Browse** (the default way in, `ScriptureBrowse`): volumes as bound-book covers →
  a volume's books → a book's chapter cards (verse count, opening line, your mark
  count; `GET …/[corpus]/book`) → verses, with breadcrumbs back up at every level
  and a "Continue reading" card from saved progress. One-chapter books open straight
  to the text; a verse link skips browsing. Covers are drawn (leather tone + gold
  foil per volume, `lib/domain/scripture/covers.ts`) — official edition artwork is
  someone else's design, so it isn't copied or hotlinked.
- **Reader** (`reader:scripture/<corpus>`, `ScriptureReader`): chapter view in the
  reader's theme/typography; contents beside the text (volumes → books → chapter grid;
  hold/⌥-click opens the right rail); a "Alma 32:21 or a phrase" box that jumps to a
  reference or searches (reference first, then phrase matches in canonical order);
  ←/→ and prev/next across book boundaries; progress bar over the whole corpus.
- **Marks**: select text (or click a verse number for the whole verse) → the shared
  `MarkPopover` — highlight/underline in five colours, note, copy with citation. Same
  right-sidebar Book rail (notes, contents, display), same send-to-note ("<Book> — Notes"
  at the tree root, quote + a verse link back), same full-screen drawer, same speed
  read (a chapter is a page).
- **Links**: `[[Alma 32:21` in the link menu offers the passage in each enabled
  collection (with a verse preview) and inserts a `verse:` anchored link to the
  collection's tab, shown as "Alma 32:21" — the generic `LinkAnchorSuggester` in
  `lib/domain/content/link-anchor.ts`. `[[The Standard Works#` lists your scripture
  highlights as passage links. Clicking opens the tab at the verses.

### 11.5 Other traditions — what a second corpus needs

| Tradition | Catalog entry | Source / licence | Versification | Adapter work |
|---|---|---|---|---|
| Christian | BSB, WEB + deuterocanon | eBible.org, public domain | chapter-verse | USFX/VPL → rows; book table |
| Jewish | Tanakh (JPS 1917) | Sefaria API, public domain | chapter-verse | Hebrew book names/abbreviations |
| Islamic | Qur'an (Tanzil text + PD translation) | Tanzil (text licence: attribution, no alteration) | surah-ayah | surah names; "2:255" references |
| Buddhist | Pāli Canon (SuttaCentral, Sujato) | CC0 | sutta-segment | "MN 10" style; segments as verses |
| Hindu | Bhagavad Gita (Arnold) | public domain | chapter-verse | small |
| Sikh | Sri Guru Granth Sahib | public-domain English (Sant Singh Khalsa translation status to verify) | section-verse | ang-based addressing |
| Taoist | Tao Te Ching (Legge) | public domain | chapter-verse | 81 chapters, one book |
| Bahá'í | Bahá'í Reference Library | linking only | — | "Read online" link, no install |

Each needs: a catalog entry flipped to `available`, an adapter yielding book/verse
rows, and a book table with the tradition's reference spellings. The reader, marks,
links, search, speed read and send-to-note need nothing.

### 11.6 Not built yet (next)

- **AI context.** The AI Chat sidebar tab isn't offered on reader tabs (content type
  `reader`), and enabling it needs a virtual-id audit first: the chat route's bound
  content lookup and `listConversationsByContent` query `@db.Uuid` columns with the
  raw id, which throws on `reader:…`. (`collectWikiLinkRefs` already skips non-UUID
  link targets.) Today the AI sees scripture through notes it was sent to.
- Citation index / "cited in" by verse (§4.3), `scriptureRef` inline node and
  `scriptureQuote` block (§4.1–4.2), talks (§6), memorize (§8).

