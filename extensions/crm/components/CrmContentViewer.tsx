"use client";

import { useEffect } from "react";
import type { ExtensionContentViewerProps } from "@/lib/extensions/types";
import { useContentSidebarClaims } from "@/lib/extensions/content-sidebar";
import { parseCrmTabId } from "@/lib/domain/crm/ids";
import { CRM_EXTENSION_ID } from "../manifest";
import { CrmInbox } from "./CrmInbox";
import { CrmPipeline } from "./CrmPipeline";
import { CrmRecord } from "./CrmRecord";
import { CenterNote } from "./crm-ui";

/** One viewer for every `crm:` tab; the id says which view. */
export function CrmContentViewer({ selectedContentId, paneId }: ExtensionContentViewerProps) {
  const view = parseCrmTabId(selectedContentId);

  // Every CRM view's supporting context is the right sidebar's CRM tab
  // (CrmContextPanel) — claimed while the view is on screen. Unclaimed, a
  // virtual tab's sidebar would fall back to an empty outline.
  const claimable = view ? selectedContentId : null;
  useEffect(() => {
    if (!claimable) return;
    const { claim, release } = useContentSidebarClaims.getState();
    claim(claimable, CRM_EXTENSION_ID);
    return () => release(claimable, CRM_EXTENSION_ID);
  }, [claimable]);

  if (!view || !selectedContentId) return <CenterNote>This CRM link is not valid.</CenterNote>;
  switch (view.kind) {
    case "inbox":
      return <CrmInbox folderId={view.folderId} contentId={selectedContentId} paneId={paneId} />;
    case "pipeline":
      return <CrmPipeline folderId={view.folderId} paneId={paneId} />;
    case "record":
      return <CrmRecord folderId={view.folderId} rowId={view.rowId} paneId={paneId} />;
  }
}
