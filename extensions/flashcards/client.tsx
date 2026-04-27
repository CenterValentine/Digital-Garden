import type { ExtensionRuntime } from "@/lib/extensions/types";
import { FlashcardQuickAddDialog } from "./components/FlashcardQuickAddDialog";
import { FlashcardsPanel } from "./components/FlashcardsPanel";
import FlashcardsSettingsDialog from "./settings/FlashcardsSettingsDialog";
import { FLASHCARDS_EXTENSION_ID } from "./manifest";

export const flashcardsExtensionRuntime: ExtensionRuntime = {
  id: FLASHCARDS_EXTENSION_ID,
  leftSidebarPanel: FlashcardsPanel,
  globalDialogs: [FlashcardQuickAddDialog],
  settingsDialog: FlashcardsSettingsDialog,
};
