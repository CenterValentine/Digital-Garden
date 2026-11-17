/**
 * Opening CRM views as ordinary workspace tabs.
 *
 * Plain `useContentStore` calls — the workplaces open router intercepts and
 * persists them like any other open (CLAUDE.md, "Workplaces never gate").
 * "Beside" opens into the pane opposite the one the caller lives in,
 * splitting a single-pane layout into two (the tree's "Open In Pane" rule).
 */

import {
  resolveOppositePane,
  useContentStore,
  type WorkspacePaneId,
} from "@/state/content-store";
import { CRM_VIRTUAL_CONTENT_TYPE, crmTabId, type CrmView } from "@/lib/domain/crm/ids";
import { useCrmStore } from "../state/crm-store";

export function crmViewTitle(view: CrmView, businessName: string, recordName?: string): string {
  switch (view.kind) {
    case "inbox":
      return `Inbox · ${businessName}`;
    case "pipeline":
      return `Pipeline · ${businessName}`;
    case "record":
      return recordName ?? "Record";
  }
}

export function openCrmView(
  view: CrmView,
  title: string,
  options: { besidePaneId?: WorkspacePaneId } = {}
): void {
  const store = useContentStore.getState();
  const id = crmTabId(view);
  if (options.besidePaneId) {
    const from = options.besidePaneId;
    let target = resolveOppositePane(store.layoutMode, from);
    if (target === from) target = from === "top-right" ? "top-left" : "top-right";
    store.openContentInPane(id, target, {
      title,
      contentType: CRM_VIRTUAL_CONTENT_TYPE,
      pin: true,
      // The operator stays in the conversation; the record appears beside it.
      focusPane: false,
    });
    return;
  }
  store.setSelectedContentId(id, { title, contentType: CRM_VIRTUAL_CONTENT_TYPE, pin: true });
}

/** Open a business's inbox, optionally with one conversation selected. */
export function openCrmInbox(folderId: string, businessName: string, contactId?: string): void {
  if (contactId) useCrmStore.getState().selectContact(folderId, contactId);
  useCrmStore.getState().setActiveFolder(folderId);
  openCrmView({ kind: "inbox", folderId }, crmViewTitle({ kind: "inbox", folderId }, businessName));
}
