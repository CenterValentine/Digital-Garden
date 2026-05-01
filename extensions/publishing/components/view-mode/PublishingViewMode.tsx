"use client";

import { useEffect, useCallback } from "react";
import { Globe, FolderPlus, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePublishTreeStore } from "../../state/publish-tree-store";
import { PublishingTree } from "./PublishingTree";

async function fetchPublicPaths() {
  const res = await fetch("/api/publishing/paths");
  if (!res.ok) throw new Error(`Failed to load paths: ${res.status}`);
  return res.json();
}

export function PublishingViewMode() {
  const { paths, setPaths, isLoading, setIsLoading } = usePublishTreeStore();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchPublicPaths();
      setPaths(data);
    } catch (err) {
      toast.error("Could not load publishing paths");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [setPaths, setIsLoading]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-white/60 uppercase tracking-wider">
          <Globe className="w-3.5 h-3.5" />
          <span>Publishing</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={load}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toast.info("Create path — coming soon")}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            title="New path"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-white/30">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : paths.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <Globe className="w-6 h-6 text-white/20" />
            <p className="text-xs text-white/40">No public paths yet.</p>
            <p className="text-xs text-white/30">
              Open a note and publish it to get started.
            </p>
          </div>
        ) : (
          <PublishingTree paths={paths} />
        )}
      </div>
    </div>
  );
}
