---
status: proposed — design only, nothing built. Needs owner answers to §10 before R0.
created: 2026-09-29
supersedes_in_part: SCRIPTURES-INTEGRATION-PLAN.md §4.4 and §5.1 (the scripture reader and its highlight store move here; the corpus, references and citation index stay there)
---

# E-reader: books and scriptures you can read and mark up in Digital Garden

The entry point is **+ → Reader → [Scriptures, Books]**. It opens a reader that
renders a book or a scripture chapter and lets you **mark up the text itself**:
highlights, notes and bookmarks, plus a saved reading position. Books come from a
**library** layer that connects to free and paid e-book sources. Scriptures are the
first *corpus source* in the same reader. Their data, reference parsing and citation
index are designed in `SCRIPTURES-INTEGRATION-PLAN.md`, which is parked until R3.

---

## 1. Judged against the product principles

- **Principle 1: the library is a folder.** A book the user adds is an ordinary
  file node, placed in a folder the user chooses (default `Books/`). The "library"
  view is that folder in Grid view with covers. Search, trash, move, tags, export
  and workbenches keep working unchanged. The Library *dialog* is a way to **find and
  acquire** books. It never stores them. Users who already keep a library (Calibre,
  Kavita, Komga) connect it over OPDS, and Digital Garden reads that library instead
  of asking them to rebuild it.
- **Principle 2: unrefined → structured.** "Reading notes: one book → Books table
  → Highlights, Quotes, Concepts" is a row in the principle's own table. Highlights
  are the unrefined layer. Sending them to a note, and later to a Highlights
  database, is the loop. Each exported quote keeps a locator back to the exact spot
  in the book (§5).
- **Extension-gating ladder.** This needs first-class typed data (locators,
  annotations, reading progress, catalog connections) and several coordinated shell
  surfaces (a create-menu item, a viewer, the library dialog, an annotations tab).
  That justifies **`extensions/reader/`**, with `enabledByDefault: true` and
  `canDisable: true`. Scriptures stay a separate extension, but they register as a
  reader *source* and don't get a viewer of their own.

## 2. What exists today (codebase map, 2026-09-29)

| Need | State | Where |
|---|---|---|
| "+" menu | One hardcoded list. Submenus are supported. **Extensions can't add items.** | `components/content/menu-items/new-content-menu.tsx` (`getNewContentMenuItems`, `NewContentCallbacks`); rendered by `LeftSidebarHeaderActions.tsx`, `context-menu/file-tree-actions.tsx` and mobile `dg:create-node` |
| Extension-owned viewers | Yes. The first enabled `matchesContentViewer` wins, and virtual IDs work (`person:`). | `lib/extensions/client-registry.tsx` L161; `extensions/people/client.tsx`; `MainPanelContent.tsx` L2377 |
| File viewers | An if-chain on `mimeType`. The PDF viewer is an `<iframe>` of the browser's built-in viewer, with no text layer and no annotations. | `components/content/viewer/FileViewer.tsx`, `PDFViewer.tsx` |
| EPUB | Nothing. `application/epub+zip` is not an allowed MIME type. | `lib/infrastructure/media/file-validation.ts` |
| Annotations outside TipTap | None. There is no highlight model. | n/a |
| Reading position | None. The speed reader keeps its position in React state only. | `extensions/speed-reader/` |
| File storage | `FilePayload`, stored in R2/S3/Vercel. 100 MB cap, checksum dedupe, presigned downloads. | `app/api/content/content/upload/*`, `[id]/download` |
| Useful dependencies | `pdfjs-dist`, `jszip`, `jsdom`, `@mozilla/readability` | `package.json` |

## 3. Entry point: + → Reader

- Add a registry field instead of hardcoding the menu:
  `ExtensionRuntime.createMenuItems?: (ctx) => NewContentMenuItem[]`. It is read by
  `getNewContentMenuItems`, so disabled extensions disappear through the registry
  filter. That follows the CLAUDE.md rule "never add direct conditionals in shared
  UI". The same field then serves every future extension-owned content type.
- The reader extension contributes **Reader ▸ Books** and **Reader ▸ Scriptures**.
  The Scriptures item comes from the scriptures extension's runtime, so it shows only
  when that extension is enabled.
  - **Books** opens the Library dialog (§4).
  - **Scriptures** opens a volume / book / chapter picker. It then opens the virtual
    target `scripture:bofm/1-ne/3` in a tab. **No node is created.** Nodes appear
    only when the user writes a study note (scriptures plan §5.2).
- **Opening existing books.** Clicking an EPUB file node in the tree opens the
  reader: `matchesContentViewer` checks `contentType === "file"` together with the
  EPUB MIME type. The matcher input must gain `mimeType`, which is a small change to
  the viewer-matcher input. PDFs get **Open in reader** from the context menu, and
  the iframe viewer stays the default for PDFs until the reader's PDF mode is proven.

## 4. The library: sources and adapters

One interface, with several adapters. All of them run **server-side** so catalog
credentials never reach the browser. The existing external-URL validation is reused
as an SSRF guard.

```ts
interface BookSource {
  id: string;                                   // "opds:<catalogId>" | "gutendex" | "openlibrary" | "upload"
  search(q: string, page?: string): Promise<CatalogPage>;
  browse?(href?: string): Promise<CatalogPage>; // OPDS navigation feeds
  acquire(entry: CatalogEntry): Promise<AcquiredBook>; // file stream + metadata + license
}
```

| Adapter | Covers | Notes |
|---|---|---|
| **OPDS** (generic, v1 Atom and v2 JSON) | Project Gutenberg, Standard Ebooks, OAPEN/DOAB, and the user's own Calibre, Kavita, Komga or COPS | This is the one standard that covers the most sources. Evaluate a maintained OPDS parser before writing one (library-first rule). Catalogs live in `ReaderCatalog { ownerId, name, url, auth? }`, with credentials encrypted through `lib/infrastructure/crypto`. Gutenberg and OAPEN are presets. Standard Ebooks needs its full-catalog access approved (§10). |
| **Gutendex** | Gutenberg search with better filters than its OPDS | Public JSON API with no key. Self-host it if rate limits bite. |
| **Open Library** | Search, book details, covers (`covers.openlibrary.org`), and public-domain downloads | It is also the **default metadata source** for uploaded books (ISBN / title lookup). Borrowable in-copyright titles are protected: show a "Borrow on Open Library" link and nothing else. |
| **Upload** | DRM-free books bought elsewhere (Smashwords, Humble, Tor, Baen, many Kobo titles) | This is the existing upload path plus the EPUB MIME type. Metadata comes from the OPF, then Open Library. |

**Acquire** does three things:
1. Streams the file into storage through the existing upload/finalize path. Checksum
   dedupe comes free.
2. Creates the file node in the library folder.
3. Writes `BookMeta { contentId @unique, title, authors[], language, isbn?, olid?,
   coverUrl?, source { adapter, catalogUrl?, entryId? }, license, drm: false }`.
   This is a side table like other per-type metadata. It is not a new payload.

**DRM gate.** On upload or acquire, open the EPUB with `jszip`. If
`META-INF/encryption.xml` names Adobe ADEPT or LCP, refuse with a clear message:
"This book is copy-protected. Read it in the app you bought it from." Protected
files are never stored.

**Publishing guard.** Book files are not publicly shareable unless `license` is
public domain or Creative Commons.

**Deliberately not sources:** Kindle, Apple Books, Google Play Books, the Kobo store,
Hoopla and Everand have no API for other apps and use DRM. Library lending (Palace
Project, OverDrive/Libby, Internet Archive loans) needs Readium LCP, or EDRLab's
paid web replacement, WCP; that is a possible later phase (§9). Pirate libraries
are excluded.

## 5. The reader

- **Engine: [foliate-js](https://github.com/readest/foliate-js)** (MIT license).
  - It opens EPUB, Kindle MOBI/AZW3, FB2 and comic archives, and does PDF through
    pdf.js, which we already ship.
  - It has built-in paginated and scrolled layouts, search, text-to-speech hooks,
    and CFI support. A CFI is the EPUB standard address for an exact spot in a book.
  - It has an overlay module for drawing highlights.
  - It is client-only and loaded with a dynamic import.
  - Fallback: [Readium ts-toolkit](https://github.com/readium/ts-toolkit), which is
    heavier on standards and handles EPUB only.
- **Scriptures** render through a small `CorpusRenderer`: plain HTML verses from the
  scripture API, inside the same reader shell. It shares the toolbar, annotation
  layer, progress tracking and sidebar. The reader shell is the product; the engine
  is chosen per source.
- **Shell features:**
  - table of contents;
  - search inside the book;
  - typography settings (font, size, line height, theme), stored in the extension
    settings store;
  - page or scroll mode;
  - "continue where you left off";
  - the selection toolbar: Highlight (colors), Note, Bookmark, Copy with citation,
    Send to note, and, later, Memorize (flashcard) and Ask AI.

### 5.1 One locator, one annotation store, for every source

Store where each mark sits using the **Readium Locator** model. It is an existing
standard, so we don't invent our own format:

```ts
type Locator = {
  href: string;                 // EPUB resource path | "bofm/1-ne/3/7" (verse id) | "page:12" (PDF)
  locations: { cfi?: string; progression?: number; totalProgression?: number; position?: number;
               start?: number; end?: number };   // start/end: char offsets (scriptures)
  text?: { before?: string; highlight?: string; after?: string }; // quote selector: re-anchoring backstop
};
```

```prisma
model ReaderAnnotation {          // replaces ScriptureAnnotation from the scriptures plan
  id            String   @id @default(cuid())
  ownerId       String
  targetKey     String   // "content:<id>" (a book file) | "scripture:lds-en" (a corpus)
  kind          String   // highlight | note | bookmark
  locator       Json
  color         String?
  body          String?  // the note text
  noteContentId String?  // set once sent to a note: "has note" marker in the margin
  @@index([ownerId, targetKey])
}
model ReadingProgress {
  ownerId String; targetKey String; locator Json; percent Float; updatedAt DateTime @updatedAt
  @@id([ownerId, targetKey])
}
```

- **Why a separate store and not TipTap marks:** the text isn't the user's
  document. It's an immutable book file or corpus, so marks must sit *beside* it.
- **Why anchors survive:**
  - EPUB CFIs are stable for a given file.
  - Scripture offsets are stable for a given corpus version.
  - The `text.highlight` / `before` / `after` quote is the fallback when either one
    moves (a re-download, a corpus re-seed).
- Progress syncs across devices. Writes are debounced, and the latest write wins.

### 5.2 From highlights to notes (the principle 2 path)

- **Annotations sidebar tab:** all marks for the open book, grouped by chapter,
  filterable by color. Click a mark to jump to it.
- **Send to note:**
  - It appends a quote block to the book's notes note, which sits next to the book
    and is created on first use (`<Title> — Notes`). The target can instead be
    today's daily note, or a note the user picks.
  - The quote carries a `readerLink` back to the exact spot, and the annotation
    records `noteContentId`.
  - `readerLink` is the generalized form of the scriptures plan's `scriptureRef`:
    one inline node, `target + locator`, that opens the reader at that spot. Like
    `scriptureRef`, it needs the full new-TipTap-extension checklist.
- **Highlights → database (R4):** a Books / Highlights table, with each highlight a
  row whose `contentLink` points at the book and which carries the locator. This is
  the same loop as `EXTRACTION-TO-DATABASE-PLAN.md`.

## 6. Highlights from protected platforms (import only)

The book can't be read here, but the user's own highlights can come in:
- **Kindle `My Clippings.txt`** and the **Kindle / Apple Books notebook HTML
  exports**: free uploads, parsed locally.
- **[Readwise API v2](https://readwise.io/api_deets)** `/export`: the user brings
  their own token (Readwise is a paid service). One integration covers Kindle, Apple
  Books and Kobo. It syncs incrementally with `updatedAfter`.

Imported highlights attach to a matching book in the library, matched by ISBN, then
title and author. If there's no match, they attach to a metadata-only book node: a
note with `BookMeta` and no file. Their locators hold only `text`, so they don't jump
to a spot.

## 7. Book details and reading status (R4)

- **Open Library** is the default for book details and covers.
- **[Hardcover](https://github.com/hardcoverapp/hardcover-docs/)** GraphQL (free,
  bring your own token): optional two-way reading-status sync (want to read,
  reading, finished) and progress. Goodreads has no API, and StoryGraph has none yet.
- **[Google Books API](https://developers.google.com/books):** optional search and
  import of the user's Google shelves (OAuth). Its preview frame can't be marked up,
  so it's a way to find books, not to read them.
- **OverDrive / Libby Title Link API:** "available at your library → open in Libby"
  on a book's page. It needs OverDrive client credentials (§10).

## 8. Integrations with what exists

- **Speed reader:** `load-source.ts` gains `epub`, read through foliate section text
  or `jszip` plus readability, and `scripture:`. It should share `ReadingProgress` so
  the two readers resume at each other's position.
- **Flashcards:** Memorize a selection creates a card whose source is the locator
  (`Flashcard.sourceLocator`, alongside `sourceContentId`).
- **AI:**
  - `read_book_passage(contentId, locator | chapter)` and
    `list_annotations(contentId)`, both registered through the tool inventory, with
    `ai:drift:check` passing.
  - Ask AI on a selection sends the passage plus its locator as context.
  - Rule: quote from the book, never from memory. This is the same grounding rule as
    for scriptures.
- **Search:** index book text in `FilePayload.searchText` on acquire, so a book is
  findable by content (OPF title, headings, body). Capped so a large book doesn't
  bloat the trigram index.

## 9. Phases

| Phase | Scope |
|---|---|
| **R0: Read an uploaded book** | `createMenuItems` registry field + Reader submenu. `extensions/reader/` skeleton (both extension lists, `extensions:check`). EPUB MIME support plus the DRM gate. foliate-js viewer for EPUB file nodes. `ReadingProgress`. Typography settings. |
| **R1: Mark it up** | `ReaderAnnotation` (highlight, note, bookmark). Selection toolbar. Annotations sidebar tab. `readerLink` inline node (TipTap checklist, Hocuspocus redeploy). Send to note. |
| **R2: Library** | `BookSource` adapters: OPDS (with Gutenberg and OAPEN presets, plus custom catalogs), Gutendex, Open Library. Library dialog (search / browse / catalogs / upload). Acquire into the library folder. `BookMeta` and covers. Grid view as the library shelf. |
| **R3: Scriptures in the reader** | Scriptures plan P0 (corpus) and P1 (references, citation index) feed a `CorpusRenderer` source that uses the same annotation store. Replaces scriptures plan §4.4 and §5.1. |
| **R4: Bring in the rest** | Kindle clippings and Readwise import. Hardcover sync. Libby availability link. Highlights → database. Memorize to flashcards. AI tools. Speed-reader EPUB source. PDF in the reader by default. |
| **Later** | Library lending through Readium LCP / EDRLab WCP (Palace Project, OverDrive): certification plus licensing fees, a business decision first. Audiobooks (Readium supports them). |

## 10. Open questions (owner)

1. **A book as a `file` node plus `BookMeta` (proposed), or a new `book`
   ContentType?** File reuses storage, dedupe, download, trash and export. A new
   type would mean touching every ContentType union (and `lib/domain/tools/types.ts`
   has already drifted: it lacks `shortcut`).
2. **Default library folder:** `Books/` at the root, or a user setting chosen on
   first use?
3. **Catalogs on a home network.** A Calibre server at `192.168.x.x` can't be
   reached from Vercel. The options are:
   - (a) the user exposes it (Tailscale Funnel, Cloudflare Tunnel);
   - (b) the browser fetches the catalog directly, which Calibre's CORS headers may
     block;
   - (c) the browser-bookmarks extension's local helper acts as a relay.
   Which of these do we support first?
4. **Standard Ebooks:** apply for open-source OPDS access, or offer only its public
   feeds?
5. **OverDrive credentials:** worth applying for Title Link API access (R4), or skip
   Libby entirely?
6. **Per-user storage of public-domain books:** each user gets their own copy
   (proposed; it's simple and dedupe already runs per upload), or a shared cache
   keyed by source + checksum?
