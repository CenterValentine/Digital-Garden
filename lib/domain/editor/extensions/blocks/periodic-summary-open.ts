"use client";

import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useExtensionActivationStore } from "@/state/extension-activation-store";
import { useContentStore } from "@/state/content-store";

interface OpenPeriodicSummaryContentOptions {
  id: string;
  title: string;
  contentType: string;
  autoBorrowDurationMinutes: number;
}

export async function openPeriodicSummaryContent({
  id,
  title,
  contentType,
  autoBorrowDurationMinutes,
}: OpenPeriodicSummaryContentOptions) {
  const options = { title, contentType };
  const workplacesEnabled =
    useExtensionActivationStore.getState().isExtensionEnabled("workplaces");

  if (!workplacesEnabled) {
    useContentStore.getState().setSelectedContentId(id, options);
    return;
  }

  const workspaceStore = useWorkspaceStore.getState();
  await workspaceStore.requestOpenContent(id, options);

  const stateAfterOpen = useWorkspaceStore.getState();
  if (stateAfterOpen.pendingOpenIntent?.contentId !== id || !stateAfterOpen.conflict) {
    return;
  }

  const durationMs =
    Math.max(1, Math.trunc(autoBorrowDurationMinutes || 60)) * 60 * 1000;
  await stateAfterOpen.borrowPendingContent(
    new Date(Date.now() + durationMs).toISOString()
  );
}
