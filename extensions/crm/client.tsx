import type { ExtensionRuntime } from "@/lib/extensions/types";
import { CRM_VIRTUAL_CONTENT_TYPE, CRM_VIRTUAL_PREFIX, isCrmTabId } from "@/lib/domain/crm/ids";
import { CrmContentViewer } from "./components/CrmContentViewer";
import { CrmContextPanel } from "./components/CrmContextPanel";
import { CrmNavPanel } from "./components/CrmNavPanel";
import { CRM_EXTENSION_ID } from "./manifest";

/** lucide MessagesSquare, as a 24×24 stroke path for the right-sidebar tab. */
const CRM_SIDEBAR_SVG_PATH =
  "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1";

export const crmExtensionRuntime: ExtensionRuntime = {
  id: CRM_EXTENSION_ID,
  leftSidebarPanel: CrmNavPanel,
  contentViewer: CrmContentViewer,
  matchesContentViewer: ({ selectedContentId }) => isCrmTabId(selectedContentId),
  virtualContent: [{ prefix: CRM_VIRTUAL_PREFIX, contentType: CRM_VIRTUAL_CONTENT_TYPE }],
  contentSidebarPanel: {
    label: "CRM",
    svgPath: CRM_SIDEBAR_SVG_PATH,
    component: CrmContextPanel,
  },
};
