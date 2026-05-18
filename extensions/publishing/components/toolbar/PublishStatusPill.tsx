"use client";

import { useEffect, useRef } from "react";
import { Globe } from "lucide-react";
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

  if (linkedItems.length === 0) {
    // Not yet published — subtle globe indicator
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground text-xs">
        <Globe className="w-3.5 h-3.5 opacity-40" />
        <span className="opacity-40">Not published</span>
      </div>
    );
  }

  const representativeItem = publishedItem ?? anyItem;
  const stateIcon = PUBLISH_STATE_ICON[representativeItem.state];
  const pendingChanges =
    representativeItem.hasPendingChanges &&
    representativeItem.state === "published";

  const { Icon, color, label } = pendingChanges
    ? PENDING_CHANGES_ICON
    : stateIcon;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
        "border border-transparent transition-colors",
        "hover:bg-muted/60 cursor-default"
      )}
      title={
        linkedItems.length === 1
          ? `${label} · /${representativeItem.slug}`
          : `${linkedItems.length} public items`
      }
    >
      <Icon className={cn("w-3.5 h-3.5", color)} />
      <span className={color}>
        {pendingChanges
          ? "Changes pending"
          : linkedItems.length > 1
          ? `${linkedItems.length} published`
          : label}
      </span>
    </div>
  );
}
