"use client";

import { useEffect, useCallback, useState } from "react";
import { Globe, Loader2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { usePublishStore } from "../../state/publish-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { fetchLinkedPublicItems } from "../../lib/client-api";
import { PUBLISHING_VIEW_ID } from "../../manifest";
import { PublishItemRow } from "./PublishItemRow";
import { PrePublishDialog } from "../dialogs/PrePublishDialog";
import { CreatePublicItemDialog } from "../dialogs/CreatePublicItemDialog";

interface PublishTabProps {
  contentId: string | null;
  contentTitle?: string | null;
}

export function PublishTab({ contentId, contentTitle }: PublishTabProps) {
  const {
    linkedItems,
    setLinkedItems,
    isLoadingLinkedItems,
    setIsLoadingLinkedItems,
  } = usePublishStore();
  const setActiveView = useLeftPanelViewStore((s) => s.setActiveView);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

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
        <Globe className="w-6 h-6 text-gray-300" />
        <p className="text-xs text-gray-500">No content selected.</p>
        <p className="text-[11px] text-gray-400">Open a note to manage publishing.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PrePublishDialog onRefresh={load} />
      {showCreateDialog && (
        <CreatePublicItemDialog
          contentNodeId={contentId}
          contentTitle={contentTitle ?? null}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            void load();
          }}
        />
      )}

      {/* Header — structure mirrors the People companion panel
          (components/content/people/PeoplePanel.tsx) so the right-sidebar
          surfaces feel like siblings. Heading + subtitle on the left,
          action buttons on the right. */}
      <div className="border-b border-gray-200/60 dark:border-white/10 px-3 py-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200">
              {linkedItems.length > 0 ? "Published as" : "Publish"}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {linkedItems.length > 0
                ? "Where this content lives publicly"
                : "Publish this content to a site"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="rounded p-1.5 text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
              title="Add to publishing"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoadingLinkedItems ? (
          <div className="flex items-center justify-center py-8 text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : linkedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
            <Globe className="w-6 h-6 text-gray-300" />
            <div>
              <p className="text-xs text-gray-600 font-medium">Not yet published</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Add this note to a publishing path to make it public.
              </p>
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-700 transition-colors border border-gray-200"
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
        <div className="shrink-0 border-t border-gray-100 px-3 py-2">
          <button
            onClick={() => setActiveView(PUBLISHING_VIEW_ID)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open publishing workspace
          </button>
        </div>
      )}
    </div>
  );
}
