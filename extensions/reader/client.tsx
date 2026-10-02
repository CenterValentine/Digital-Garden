import { toast } from "sonner";
import type { ExtensionCreateMenuItem, ExtensionRuntime } from "@/lib/extensions/types";
import {
  READER_DEFAULT_VIEWER_MIME_TYPES,
  type BookMetaDto,
} from "@/lib/domain/reader/types";
import { useContentStore } from "@/state/content-store";
import { resolveServerCreateParent } from "@/lib/domain/content/create-target";
import { ReaderBookshelfController } from "./components/ReaderBookshelfController";
import { ReaderContentViewer } from "./components/ReaderContentViewer";
import { ReaderSidebarPanel } from "./components/ReaderSidebarPanel";
import { withOptimisticTreeRow } from "@/lib/features/content/tree-optimistic";
import { SCRIPTURE_RESOURCE_TYPE, VERSE_ANCHOR_KIND, type ScriptureCorpusInfo } from "@/lib/domain/scripture/types";
import { staticScriptureTable } from "@/lib/domain/scripture/tables";
import { useContentAnchorStore } from "@/state/content-anchor-store";
import { scriptureApi } from "./lib/api";
import { READER_SIDEBAR_SVG_PATH } from "./lib/sidebar";
import { readerLinkAnchors } from "./lib/link-anchors";
import { scriptureLinkSuggestions } from "./lib/scripture-links";
import { placeShortcut } from "./lib/use-acquire";
import {
  READER_EXTENSION_ID,
  READER_LIBRARY_CONTENT_ID,
  READER_RESEARCH_CONTENT_ID,
  READER_SCRIPTURES_CONTENT_ID,
  READER_VIRTUAL_CONTENT_TYPE,
  READER_VIRTUAL_PREFIX,
} from "./manifest";
import ReaderSettingsDialog from "./settings/ReaderSettingsDialog";
import { useReaderBookshelf } from "./state/bookshelf-store";
import { useReaderSession } from "./state/reader-store";
import { useResearchStore } from "./state/research-store";

/** Books listed directly in the "+" menu; the rest are one click away in the Library. */
const SHELF_MENU_LIMIT = 12;

function openLibrary(parentId: string | null) {
  // Books added from the Library land where this "+" pointed.
  useReaderSession.getState().setLibraryTargetParentId(resolveServerCreateParent(parentId));
  useContentStore.getState().setSelectedContentId(READER_LIBRARY_CONTENT_ID, {
    title: "Library",
    contentType: READER_VIRTUAL_CONTENT_TYPE,
    pin: true,
  });
}

/** Research: Works added from the tab land where this "+" pointed. */
function openResearch(parentId: string | null) {
  useResearchStore.getState().setTargetParentId(resolveServerCreateParent(parentId));
  useContentStore.getState().setSelectedContentId(READER_RESEARCH_CONTENT_ID, {
    title: "Research",
    contentType: READER_VIRTUAL_CONTENT_TYPE,
    pin: true,
  });
}

function openBook(book: BookMetaDto) {
  useContentStore.getState().setSelectedContentId(book.contentId, {
    title: book.title,
    contentType: book.kind === "link" ? "external" : "file",
    pin: true,
  });
}

/**
 * Choosing a book from "+ → Reader → Books": drop a shortcut to it where the
 * "+" pointed (the tree's create rule: folder → inside, item → beside it,
 * nothing → top of the tree / view root), then open it. The book file never
 * moves.
 */
async function placeBook(book: BookMetaDto, parentId: string | null) {
  try {
    const result = await placeShortcut(book, resolveServerCreateParent(parentId));
    if (result.outcome === "created") {
      toast.success(`Shortcut to “${book.title}” added`);
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not place the book");
  }
  openBook(book);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function openScriptureCatalog() {
  useContentStore.getState().setSelectedContentId(READER_SCRIPTURES_CONTENT_ID, {
    title: "Scriptures",
    contentType: READER_VIRTUAL_CONTENT_TYPE,
    pin: true,
  });
}

/**
 * "+ → Reader → Scriptures → <collection>": a session in the tree where the
 * "+" pointed (the tree's create rule, as for books), then open it.
 */
async function placeScriptureSession(
  corpus: ScriptureCorpusInfo,
  parentId: string | null,
  /** Where the new session opens ("verse:alma/32", "scripture-view:book/alma"); covers if omitted. */
  startAt?: string
) {
  const serverParentId = resolveServerCreateParent(parentId);
  try {
    const session = await withOptimisticTreeRow(
      { title: corpus.title, contentType: "external", parentId: serverParentId },
      () => scriptureApi.createSession({ corpusId: corpus.id, parentId: serverParentId }),
      (created) => created.contentId
    );
    // The session's reader takes this on open (lib/domain/content/link-anchor.ts).
    if (startAt) useContentAnchorStore.getState().request(session.contentId, startAt);
    useContentStore.getState().setSelectedContentId(session.contentId, {
      title: session.title,
      contentType: "external",
      pin: true,
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not add the session");
  }
}

/** Chapters listed one per row up to this many; longer books group them by tens. */
const CHAPTERS_LISTED = 20;
const CHAPTER_GROUP = 10;

/**
 * "+ → Reader → Scriptures → <collection>": hover drills volumes → books →
 * chapters; every pick adds a session where the "+" pointed and opens it
 * there (a session is the whole collection — you move on from wherever it
 * opens). Books with hundreds of chapters (Psalms 150, D&C 138) group them
 * by tens so no submenu is a wall of rows.
 */
function scriptureCollectionItem(corpus: ScriptureCorpusInfo): ExtensionCreateMenuItem {
  const place = (startAt?: string) => ({ parentId }: { parentId: string | null }) =>
    void placeScriptureSession(corpus, parentId, startAt);
  const table = staticScriptureTable(corpus.id);
  const base = {
    id: `reader-scripture-${corpus.id}`,
    label: truncate(corpus.title, 44),
    iconName: "BookMarked",
    title: `Add a ${corpus.title} session here — its own name, icon and reading place`,
  };
  if (!table) return { ...base, onSelect: place() };

  const chapterItem = (bookSlug: string, label: string, chapter: number): ExtensionCreateMenuItem => ({
    id: `reader-scripture-${corpus.id}-${bookSlug}-${chapter}`,
    label: `${label} ${chapter}`,
    iconName: "Bookmark",
    onSelect: place(`${VERSE_ANCHOR_KIND}:${bookSlug}/${chapter}`),
  });

  const bookItem = (
    book: { slug: string; name: string; chapters: number },
    chapterLabel: string
  ): ExtensionCreateMenuItem => {
    const id = `reader-scripture-${corpus.id}-${book.slug}`;
    if (book.chapters === 1) {
      return { id, label: book.name, iconName: "BookOpen", onSelect: place(`${VERSE_ANCHOR_KIND}:${book.slug}/1`) };
    }
    const numbers = Array.from({ length: book.chapters }, (_, index) => index + 1);
    const chapters: ExtensionCreateMenuItem[] =
      book.chapters <= CHAPTERS_LISTED
        ? numbers.map((chapter) => chapterItem(book.slug, chapterLabel, chapter))
        : Array.from({ length: Math.ceil(book.chapters / CHAPTER_GROUP) }, (_, group) => {
            const first = group * CHAPTER_GROUP + 1;
            const last = Math.min(first + CHAPTER_GROUP - 1, book.chapters);
            return {
              id: `${id}-${first}-${last}`,
              label: `${chapterLabel}s ${first}–${last}`,
              iconName: "Layers",
              submenu: numbers.slice(first - 1, last).map((chapter) => chapterItem(book.slug, chapterLabel, chapter)),
            };
          });
    return {
      id,
      label: book.name,
      iconName: "BookOpen",
      submenu: [
        {
          id: `${id}-all`,
          label: `All ${chapterLabel.toLowerCase()}s`,
          iconName: "Library",
          title: `Open ${book.name} at its ${chapterLabel.toLowerCase()} cards`,
          onSelect: place(`scripture-view:book/${book.slug}`),
        },
        ...chapters,
      ],
    };
  };

  return {
    ...base,
    submenu: [
      {
        id: `${base.id}-covers`,
        label: "Open at the covers",
        iconName: "BookMarked",
        onSelect: place(),
      },
      ...table.map<ExtensionCreateMenuItem>((volume) =>
        // A one-book volume (D&C) skips straight to that book's sections.
        volume.books.length === 1
          ? { ...bookItem(volume.books[0], volume.chapterLabel), id: `${base.id}-${volume.slug}`, label: volume.title, iconName: "Library" }
          : {
              id: `${base.id}-${volume.slug}`,
              label: volume.title,
              iconName: "Library",
              submenu: volume.books.map((book) => bookItem(book, volume.chapterLabel)),
            }
      ),
    ],
  };
}

function scriptureMenu(): ExtensionCreateMenuItem[] {
  const { scriptures } = useReaderBookshelf.getState();
  return [
    ...scriptures.map(scriptureCollectionItem),
    {
      id: "reader-scripture-catalog",
      label: scriptures.length ? "Browse traditions…" : "Browse traditions to enable…",
      iconName: "Library",
      title: "Scripture collections across traditions — install (owner) and enable",
      onSelect: () => openScriptureCatalog(),
    },
  ];
}

function readerMenu(): ExtensionCreateMenuItem[] {
  const { books } = useReaderBookshelf.getState();
  const recent = [...books]
    .sort((a, b) => (b.readingStatus === "reading" ? 1 : 0) - (a.readingStatus === "reading" ? 1 : 0))
    .slice(0, SHELF_MENU_LIMIT);

  const shelf: ExtensionCreateMenuItem[] = [
    {
      id: "reader-open-library",
      label: "Library…",
      iconName: "Library",
      title: "Find free books, connect catalogs, import highlights",
      onSelect: ({ parentId }) => openLibrary(parentId),
    },
    ...recent.map<ExtensionCreateMenuItem>((book) => ({
      id: `reader-book-${book.contentId}`,
      label: truncate(book.title, 44),
      iconName: "BookOpen",
      title: `Add a shortcut to “${book.title}” here and open it`,
      onSelect: ({ parentId }) => void placeBook(book, parentId),
    })),
  ];
  if (books.length > SHELF_MENU_LIMIT) {
    shelf.push({
      id: "reader-all-books",
      label: `All ${books.length} books…`,
      iconName: "Library",
      onSelect: ({ parentId }) => openLibrary(parentId),
    });
  }

  return [
    {
      id: "new-reader",
      label: "Reader",
      iconName: "BookOpen",
      submenu: [
        {
          id: "new-reader-books",
          label: "Books",
          iconName: "Library",
          title: "Your bookshelf — pick a book to add it here, or open the Library",
          submenu: shelf,
        },
        {
          id: "new-reader-scriptures",
          label: "Scriptures",
          iconName: "ScrollText",
          title: "Scripture collections you've enabled — or browse the traditions",
          submenu: scriptureMenu(),
        },
        {
          id: "new-reader-research",
          label: "Research",
          iconName: "FlaskConical",
          title: "Find papers, preprints and trials; paste a DOI, arXiv id or citation",
          onSelect: ({ parentId }) => openResearch(parentId),
        },
      ],
    },
  ];
}

export const readerExtensionRuntime: ExtensionRuntime = {
  id: READER_EXTENSION_ID,
  contentViewer: ReaderContentViewer,
  matchesContentViewer: ({ selectedContentId, contentType, mimeType, externalResourceType }) =>
    Boolean(
      selectedContentId?.startsWith(READER_VIRTUAL_PREFIX) ||
        // Scripture sessions: link nodes the reader owns (see sessions.ts).
        (contentType === "external" && externalResourceType === SCRIPTURE_RESOURCE_TYPE) ||
        (contentType === "file" &&
          mimeType &&
          READER_DEFAULT_VIEWER_MIME_TYPES.includes(mimeType))
    ),
  virtualContent: [
    { prefix: READER_VIRTUAL_PREFIX, contentType: READER_VIRTUAL_CONTENT_TYPE },
  ],
  contentSidebarPanel: {
    label: "Book",
    svgPath: READER_SIDEBAR_SVG_PATH,
    component: ReaderSidebarPanel,
  },
  createMenuItems: readerMenu,
  // `[[Book#` → link to a highlight (lib/domain/content/link-anchor.ts).
  linkAnchors: readerLinkAnchors,
  // `[[Alma 32:21` → a verse link straight from the typed reference.
  linkAnchorSuggestions: scriptureLinkSuggestions,
  shellControllers: [ReaderBookshelfController],
  settingsDialog: ReaderSettingsDialog,
};
