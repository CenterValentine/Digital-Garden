"use client";

import { useMemo } from "react";
import type { ExtensionShellTabMenuSectionProps } from "@/lib/extensions/types";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";

export function WorkplacesTabMenuSection({
  tab,
  closeMenu,
}: ExtensionShellTabMenuSectionProps) {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const assignContentToWorkspace = useWorkspaceStore(
    (state) => state.assignContentToWorkspace
  );

  const targetWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.id !== activeWorkspaceId),
    [activeWorkspaceId, workspaces]
  );

  return (
    <>
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        Move to workplace
      </div>
      {targetWorkspaces.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-gray-500">
          Create another workplace first.
        </div>
      ) : (
        targetWorkspaces.map((workspace) => (
          <button
            key={`move-${workspace.id}`}
            type="button"
            className="flex w-full items-center rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => {
              closeMenu();
              void assignContentToWorkspace(workspace.id, tab.contentId, {
                assignmentType: "primary",
                scope: tab.contentType === "folder" ? "recursive" : "item",
                moveFromWorkspaceId: activeWorkspaceId,
              });
            }}
          >
            {workspace.name}
          </button>
        ))
      )}
      <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
        Share permanently
      </div>
      {targetWorkspaces.map((workspace) => (
        <button
          key={`share-${workspace.id}`}
          type="button"
          className="flex w-full items-center rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          onClick={() => {
            closeMenu();
            void assignContentToWorkspace(workspace.id, tab.contentId, {
              assignmentType: "shared",
              scope: tab.contentType === "folder" ? "recursive" : "item",
            });
          }}
        >
          {workspace.name}
        </button>
      ))}
    </>
  );
}
