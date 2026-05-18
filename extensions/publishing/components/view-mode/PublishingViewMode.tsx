"use client";

import { useEffect, useCallback, useState } from "react";
import { Globe, FolderPlus, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePublishTreeStore } from "../../state/publish-tree-store";
import { PublishingTree } from "./PublishingTree";
import { CreatePublicPathDialog } from "../dialogs/CreatePublicPathDialog";
import { clientLogger } from "@/lib/core/logger/client";

async function fetchPublicPaths() {
  const res = await fetch("/api/publishing/paths");
  if (!res.ok) throw new Error(`Failed to load paths: ${res.status}`);
  return res.json();
}

export function PublishingViewMode() {
  const { paths, setPaths, isLoading, setIsLoading } = usePublishTreeStore();
  const [showCreatePath, setShowCreatePath] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchPublicPaths();
      setPaths(data);
    } catch (err) {
      toast.error("Could not load publishing paths");
      clientLogger.error({
        layer: "ui",
        event: "publishing_paths_load:caught",
        summary: "publishing paths fetch failed",
        error: err,
      });
    } finally {
      setIsLoading(false);
    }
  }, [setPaths, setIsLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full">
      {showCreatePath && (
        <CreatePublicPathDialog
          onClose={() => setShowCreatePath(false)}
          onCreated={() => { setShowCreatePath(false); void load(); }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <Globe className="w-3.5 h-3.5" />
          <span>Publishing</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowCreatePath(true)}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="New path"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-300">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : paths.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <Globe className="w-6 h-6 text-gray-300" />
            <p className="text-xs text-gray-500">No public paths yet.</p>
            <p className="text-xs text-gray-400">
              Create a path, then publish notes to it.
            </p>
          </div>
        ) : (
          <PublishingTree paths={paths} onRefresh={load} />
        )}
      </div>
    </div>
  );
}
