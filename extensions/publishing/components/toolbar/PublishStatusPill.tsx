"use client";

import { useEffect, useRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { usePublishStore } from "../../state/publish-store";
import { fetchLinkedPublicItems } from "../../lib/client-api";
import {
  PUBLISH_STATE_ICON,
  PENDING_CHANGES_ICON,
} from "../icons/state-icon-map";

interface PublishStatusPillProps {
  contentId: string;
}

export function PublishStatusPill({ contentId }: PublishStatusPillProps) {
  const { linkedItems, setLinkedItems, setIsLoadingLinkedItems } =
    usePublishStore();
  const prevContentId = useRef<string | null>(null);

  useEffect(() => {
    if (prevContentId.current === contentId) return;
    prevContentId.current = contentId;

    setIsLoadingLinkedItems(true);
    fetchLinkedPublicItems(contentId)
      .then(setLinkedItems)
      .catch(() => setLinkedItems([]))
      .finally(() => setIsLoadingLinkedItems(false));
  }, [contentId, setLinkedItems, setIsLoadingLinkedItems]);

  // Derive dominant state for the pill
  const publishedItem = linkedItems.find((i) => i.state === "published");
  const anyItem = linkedItems[0];

  // Icon-only indicator (no text → can never wrap, and stays a fixed width so
  // adjacent toolbar changes don't reflow it). The full state lives in the
  // tooltip. Eye = published, Eye-off = not published.
  if (linkedItems.length === 0) {
    return (
      <div
        className="flex shrink-0 items-center rounded-md px-1.5 py-1 text-muted-foreground"
        title="Not published"
        aria-label="Not published"
      >
        <EyeOff className="h-4 w-4 opacity-50" />
      </div>
    );
  }

  const representativeItem = publishedItem ?? anyItem;
  const stateIcon = PUBLISH_STATE_ICON[representativeItem.state];
  const pendingChanges =
    representativeItem.hasPendingChanges &&
    representativeItem.state === "published";

  // Keep the color/label from the state map for the tooltip, but render Eye so
  // the published indicator reads consistently regardless of sub-state.
  const { color, label } = pendingChanges ? PENDING_CHANGES_ICON : stateIcon;
  const tooltip = pendingChanges
    ? `Changes pending · /${representativeItem.slug}`
    : linkedItems.length > 1
      ? `${linkedItems.length} published`
      : `${label} · /${representativeItem.slug}`;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center rounded-md px-1.5 py-1",
        "border border-transparent transition-colors",
        "hover:bg-muted/60 cursor-default"
      )}
      title={tooltip}
      aria-label={tooltip}
    >
      <Eye className={cn("h-4 w-4", color)} />
    </div>
  );
}
