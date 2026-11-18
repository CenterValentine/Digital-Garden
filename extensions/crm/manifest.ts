import type { ExtensionManifest } from "@/lib/extensions/types";

export const CRM_EXTENSION_ID = "crm";
export const CRM_VIEW_KEY = "crm";

/**
 * CRM — an optional lens over a business folder's databases: an inbox, a
 * pipeline, and a record workspace for whatever the business services
 * (properties, vehicles, or the clients themselves). Off by default; turn
 * it on in Settings → Extensions.
 */
export const crmExtensionManifest: ExtensionManifest = {
  id: CRM_EXTENSION_ID,
  label: "CRM",
  description:
    "Conversations, pipeline and service records for a business, built on the databases in its folder.",
  iconName: "Handshake",
  enabledByDefault: false,
  canDisable: true,
  navItems: [
    {
      view: CRM_VIEW_KEY,
      label: "CRM",
      title: "CRM",
      iconName: "Handshake",
      order: 12,
    },
  ],
  surfaces: ["left-sidebar", "content-viewer"],
};
