"use client";

import { WorkspaceSelector } from "@/extensions/workplaces/components/WorkspaceSelector";
import { WorkspaceTabDropTarget } from "./WorkspaceTabDropTarget";

export function WorkplacesShellNavigationControls() {
  return (
    <>
      <WorkspaceTabDropTarget>
        <WorkspaceSelector />
      </WorkspaceTabDropTarget>
      <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
    </>
  );
}
