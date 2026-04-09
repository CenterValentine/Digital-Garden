"use client";

import { Briefcase, Layers3, Lock, ShieldAlert } from "lucide-react";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";

export default function WorkplacesSettingsDialog() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const lockedCount = workspaces.filter((workspace) => workspace.isLocked).length;
  const claimedItemCount = workspaces.reduce(
    (count, workspace) => count + workspace.items.length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-semibold tracking-tight text-white">
          Workplaces
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-400">
          Workplaces owns the top-bar selector, saved pane layouts, tab claims,
          and overlap handling. Disable it to remove those runtime mounts without
          clearing the saved workspace state.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 text-gold-primary">
            <Briefcase className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Active
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {activeWorkspace?.name ?? "Main Workspace"}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Use the selector in the top workspace bar to switch, rename, or
            create workplaces.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 text-gold-primary">
            <Layers3 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Saved Workplaces
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {workspaces.length}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Prior state stays persisted even while the extension is disabled.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 text-gold-primary">
            <Lock className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Claimed Content
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {claimedItemCount}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {lockedCount} locked workplace{lockedCount === 1 ? "" : "s"} currently
            protect assigned files or folders.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-200" />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-100">
              Runtime Scope
            </h3>
            <p className="mt-2 text-sm text-amber-50/90">
              When Workplaces is disabled, the selector, tab menu actions,
              overlap dialog, and workspace runtime hooks do not mount. Re-enable
              it to restore the prior saved workspace state.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
