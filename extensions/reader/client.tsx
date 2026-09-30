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
import { READER_SIDEBAR_SVG_PATH } from "./lib/sidebar";
import { readerLinkAnchors } from "./lib/link-anchors";
import { placeShortcut } from "./lib/use-acquire";
import {
  READER_EXTENSION_ID,
  READER_LIBRARY_CONTENT_ID,
  READER_VIRTUAL_CONTENT_TYPE,
  READER_VIRTUAL_PREFIX,
} from "./manifest";
import ReaderSettingsDialog from "./settings/ReaderSettingsDialog";
import { useReaderBookshelf } from "./state/bookshelf-store";
import { useReaderSession } from "./state/reader-store";

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
          label: "Scriptures (coming soon)",
          iconName: "ScrollText",
          title: "The standard works, planned — see SCRIPTURES-INTEGRATION-PLAN.md",
          disabled: true,
        },
        {
          id: "new-reader-research",
          label: "Research (coming soon)",
          iconName: "FlaskConical",
          title: "Papers and open-access research, planned",
          disabled: true,
        },
      ],
    },
  ];
}

export const readerExtensionRuntime: ExtensionRuntime = {
  id: READER_EXTENSION_ID,
  contentViewer: ReaderContentViewer,
  matchesContentViewer: ({ selectedContentId, contentType, mimeType }) =>
    Boolean(
      selectedContentId?.startsWith(READER_VIRTUAL_PREFIX) ||
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
  shellControllers: [ReaderBookshelfController],
  settingsDialog: ReaderSettingsDialog,
};
