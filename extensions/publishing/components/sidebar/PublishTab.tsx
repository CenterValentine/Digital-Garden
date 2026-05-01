"use client";

import { useEffect, useCallback } from "react";
import { Globe, Loader2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePublishStore } from "../../state/publish-store";
import { fetchLinkedPublicItems } from "../../lib/client-api";
import { PublishItemRow } from "./PublishItemRow";

interface PublishTabProps {
  contentId: string | null;
}

export function PublishTab({ contentId }: PublishTabProps) {
  const {
    linkedItems,
    setLinkedItems,
    isLoadingLinkedItems,
    setIsLoadingLinkedItems,
  } = usePublishStore();

  const load = useCallback(async () => {
    if (!contentId) {
      setLinkedItems([]);
      return;
    }
    setIsLoadingLinkedItems(true);
    try {
      const items = await fetchLinkedPublicItems(contentId);
      setLinkedItems(items);
    } catch {
      toast.error("Could not load publish status");
    } finally {
      setIsLoadingLinkedItems(false);
    }
  }, [contentId, setLinkedItems, setIsLoadingLinkedItems]);

  useEffect(() => {
    load();
  }, [load]);

  if (!contentId) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
        <Globe className="w-6 h-6 text-white/20" />
        <p className="text-xs text-white/40">No content selected.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Published as
        </span>
        <button
          onClick={() => toast.info("Add to publishing — coming soon")}
          className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
          title="Add to publishing"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoadingLinkedItems ? (
          <div className="flex items-center justify-center py-8 text-white/30">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : linkedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <Globe className="w-5 h-5 text-white/20" />
            <p className="text-xs text-white/40">Not yet published.</p>
            <button
              onClick={() => toast.info("Add to publishing — coming soon")}
              className="mt-1 text-xs text-white/30 hover:text-white/60 underline transition-colors"
            >
              Add to publishing
            </button>
          </div>
        ) : (
          <div className="py-1">
            {linkedItems.map((item) => (
              <PublishItemRow
                key={item.id}
                item={item}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer: link to publishing view */}
      {linkedItems.length > 0 && (
        <div className="shrink-0 border-t border-white/5 px-3 py-2">
          <button
            onClick={() => toast.info("Open publishing view — coming soon")}
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open publishing view
          </button>
        </div>
      )}
    </div>
  );
}
