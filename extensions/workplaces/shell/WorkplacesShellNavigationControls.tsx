"use client";

import { WorkspaceSelector } from "@/extensions/workplaces/components/WorkspaceSelector";
import { WorkspaceDropTarget } from "./WorkspaceDropTarget";

export function WorkplacesShellNavigationControls() {
  return (
    <>
      <WorkspaceDropTarget>
        <WorkspaceSelector />
      </WorkspaceDropTarget>
      <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
    </>
  );
}
