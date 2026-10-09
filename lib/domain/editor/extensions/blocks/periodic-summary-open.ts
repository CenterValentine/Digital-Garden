"use client";

import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useExtensionActivationStore } from "@/state/extension-activation-store";
import { useContentStore } from "@/state/content-store";

interface OpenPeriodicSummaryContentOptions {
  id: string;
  title: string;
  contentType: string;
}

export async function openPeriodicSummaryContent({
  id,
  title,
  contentType,
}: OpenPeriodicSummaryContentOptions) {
  const options = { title, contentType };
  const workplacesEnabled =
    useExtensionActivationStore.getState().isExtensionEnabled("workplaces");

  if (!workplacesEnabled) {
    useContentStore.getState().setSelectedContentId(id, options);
    return;
  }

  await useWorkspaceStore.getState().requestOpenContent(id, options);
}
