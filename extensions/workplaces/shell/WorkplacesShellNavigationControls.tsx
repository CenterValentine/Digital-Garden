"use client";

import { CircleX } from "lucide-react";
import { toast } from "sonner";
import { WorkspaceSelector } from "@/extensions/workplaces/components/WorkspaceSelector";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useContentStore } from "@/state/content-store";

export function WorkplacesShellNavigationControls() {
  const clearAllWorkspaceTabs = useContentStore(
    (state) => state.clearAllWorkspaceTabs
  );
  const workspaceTabCount = useContentStore(
    (state) => Object.keys(state.tabs).length
  );
  const persistActiveWorkspace = useWorkspaceStore(
    (state) => state.persistActiveWorkspace
  );

  const handleClearWorkspaceTabs = () => {
    if (workspaceTabCount === 0) return;
    clearAllWorkspaceTabs();
    void persistActiveWorkspace()
      .then(() => {
        toast.success("Cleared all workplace tabs");
      })
      .catch((error) => {
        console.error(
          "[WorkplacesShellNavigationControls] Failed to persist cleared workplace:",
          error
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to persist cleared workplace tabs"
        );
      });
  };

  return (
    <>
      <WorkspaceSelector />
      <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
      <button
        type="button"
        onClick={handleClearWorkspaceTabs}
        disabled={workspaceTabCount === 0}
        className="inline-flex items-center justify-center rounded-md border border-white/10 p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-red-400"
        title="Clear all tabs in this workplace"
      >
        <CircleX className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
