import type { ExtensionRuntime } from "@/lib/extensions/types";
import { FlashcardQuickAddDialog } from "./components/FlashcardQuickAddDialog";
import { FlashcardSelectionCommit } from "./components/FlashcardSelectionCommit";
import { FlashcardSelectionLauncher } from "./components/FlashcardSelectionLauncher";
import { FlashcardSelectionOverlay } from "./components/FlashcardSelectionOverlay";
import { FlashcardSelectionStarter } from "./components/FlashcardSelectionStarter";
import { FlashcardsPanel } from "./components/FlashcardsPanel";
import FlashcardsSettingsDialog from "./settings/FlashcardsSettingsDialog";
import { FLASHCARDS_EXTENSION_ID } from "./manifest";

export const flashcardsExtensionRuntime: ExtensionRuntime = {
  id: FLASHCARDS_EXTENSION_ID,
  leftSidebarPanel: FlashcardsPanel,
  globalDialogs: [
    FlashcardQuickAddDialog,
    FlashcardSelectionOverlay,
    FlashcardSelectionStarter,
    FlashcardSelectionCommit,
    FlashcardSelectionLauncher,
  ],
  settingsDialog: FlashcardsSettingsDialog,
};
