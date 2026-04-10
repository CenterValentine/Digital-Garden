"use client";

import { useEffect } from "react";
import { WorkspaceConflictDialog } from "@/extensions/workplaces/components/WorkspaceConflictDialog";
import {
  installWorkspaceOpenGuard,
  useWorkspaceStore,
} from "@/extensions/workplaces/state/workspace-store";
import { useContentStore } from "@/state/content-store";

export function WorkplacesShellController() {
  const workspaceSnapshotKey = useContentStore((state) =>
    JSON.stringify(state.getWorkspaceStateSnapshot())
  );
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const persistActiveWorkspace = useWorkspaceStore(
    (state) => state.persistActiveWorkspace
  );

  useEffect(() => installWorkspaceOpenGuard(), []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    void loadWorkspaces(urlParams.get("workspace"));
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) return;

    const timeoutId = window.setTimeout(() => {
      void persistActiveWorkspace();
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [activeWorkspaceId, workspaceSnapshotKey, persistActiveWorkspace]);

  return <WorkspaceConflictDialog />;
}
