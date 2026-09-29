import type { ExtensionRuntime } from "@/lib/extensions/types";
import { READER_DEFAULT_VIEWER_MIME_TYPES } from "@/lib/domain/reader/types";
import { useContentStore } from "@/state/content-store";
import { ReaderContentViewer } from "./components/ReaderContentViewer";
import {
  READER_EXTENSION_ID,
  READER_LIBRARY_CONTENT_ID,
  READER_VIRTUAL_CONTENT_TYPE,
  READER_VIRTUAL_PREFIX,
} from "./manifest";
import ReaderSettingsDialog from "./settings/ReaderSettingsDialog";
import { useReaderSession } from "./state/reader-store";

function openLibrary(parentId: string | null) {
  useReaderSession.getState().setLibraryTargetParentId(parentId);
  useContentStore.getState().setSelectedContentId(READER_LIBRARY_CONTENT_ID, {
    title: "Library",
    contentType: READER_VIRTUAL_CONTENT_TYPE,
    pin: true,
  });
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
  createMenuItems: [
    {
      id: "new-reader",
      label: "Reader",
      iconName: "BookOpen",
      submenu: [
        {
          id: "new-reader-books",
          label: "Books",
          iconName: "Library",
          title: "Find free books, connect your library, or open your books",
          onSelect: ({ parentId }) => openLibrary(parentId),
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
  ],
  settingsDialog: ReaderSettingsDialog,
};
