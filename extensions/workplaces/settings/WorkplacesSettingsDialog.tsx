"use client";

import { useEffect, useState } from "react";
import { Layers3, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import type { SessionData } from "@/lib/infrastructure/auth/types";

export default function WorkplacesSettingsDialog() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const resetWorkspaces = useWorkspaceStore((state) => state.resetWorkspaces);

  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const [resetInFlight, setResetInFlight] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const userInitial = session?.user.username?.charAt(0).toUpperCase() ?? "M";
  const statsReady = !isLoading && workspaces.length > 0;

  const renderStatValue = (value: number) => {
    if (!statsReady) {
      return (
        <div className="h-9 w-14 animate-pulse rounded-md bg-white/10" aria-hidden="true" />
      );
    }

    return <>{value}</>;
  };

  useEffect(() => {
    if (resetCountdown === null || resetCountdown <= 0) return;
    const timeoutId = window.setTimeout(() => {
      setResetCountdown((value) => (value !== null ? value - 1 : value));
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [resetCountdown]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/session", { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { success: boolean; data: SessionData | null }) => {
        if (data.success && data.data) {
          setSession(data.data);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("[WorkplacesSettingsDialog] Failed to load session:", error);
      });

    return () => controller.abort();
  }, []);

  const handleStartReset = () => {
    if (resetInFlight) return;
    setResetCountdown(10);
  };

  const handleResetAllWorkplaces = async () => {
    if (resetCountdown !== 0 || resetInFlight) return;
    setResetInFlight(true);
    try {
      await resetWorkspaces();
      setResetCountdown(null);
    } finally {
      setResetInFlight(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Workplaces manages your saved layouts, views, and workbenches.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 text-gold-primary">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gold-primary bg-gold-primary/20">
              <span className="text-sm font-semibold text-gold-primary">
                {userInitial}
              </span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Active
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            {activeWorkspace?.name ?? "Main Workspace"}
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This is the workspace you are currently active in.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-5">
          <div className="flex items-center gap-3 text-gold-primary">
            <Layers3 className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Saved Workplaces
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
            {renderStatValue(workspaces.length)}
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Use the selector in the top workspace bar to switch, rename, or
            create workplaces.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-200" />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-100">
              Disabling Workplaces
            </h3>
            <p className="mt-2 text-sm text-amber-900/85 dark:text-amber-50/90">
              Turning Workplaces off hides the selector and workplace
              controls. Re-enable Workplaces to restore your prior workplaces.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-200" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-red-700 dark:text-red-100">
              Delete All Workplaces
            </h3>
            <p className="mt-2 text-sm text-red-900/80 dark:text-red-50/85">
              This removes every saved workplace and its open tabs, then
              returns you to a single main workplace.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {resetCountdown === null ? (
                <button
                  type="button"
                  onClick={handleStartReset}
                  disabled={resetInFlight}
                  className="rounded-md border border-red-400/30 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-100 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset
                </button>
              ) : resetCountdown > 0 ? (
                <>
                  <button
                    type="button"
                    disabled
                    className="rounded-md border border-red-400/30 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-100 opacity-80"
                  >
                    Wait {resetCountdown}s before confirming
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetCountdown(null)}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleResetAllWorkplaces()}
                    disabled={resetInFlight}
                    className="inline-flex items-center gap-2 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm font-medium text-red-900 dark:text-red-50 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resetInFlight ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Delete all workplaces"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetCountdown(null)}
                    disabled={resetInFlight}
                    className="rounded-md border border-black/10 dark:border-white/10 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
