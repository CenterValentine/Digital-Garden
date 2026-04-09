"use client";

import { WorkspaceSelector } from "@/extensions/workplaces/components/WorkspaceSelector";

export function WorkplacesShellNavigationControls() {
  return (
    <>
      <WorkspaceSelector />
      <div className="h-4 w-px bg-black/10 dark:bg-white/10" />
    </>
  );
}
