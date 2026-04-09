import { PeopleCompanionPanel } from "./components/PeopleCompanionPanel";
import { PeopleContentViewer } from "./components/PeopleContentViewer";
import { PEOPLE_EXTENSION_ID } from "./manifest";
import PeopleSettingsDialog from "./settings/PeopleSettingsDialog";
import type { ExtensionRuntime } from "@/lib/extensions/types";

export const peopleExtensionRuntime: ExtensionRuntime = {
  id: PEOPLE_EXTENSION_ID,
  leftSidebarPanel: PeopleCompanionPanel,
  contentViewer: PeopleContentViewer,
  matchesContentViewer: ({ selectedContentId, contentType }) =>
    Boolean(
      selectedContentId?.startsWith("person:") || contentType === "person-profile"
    ),
  settingsDialog: PeopleSettingsDialog,
};
