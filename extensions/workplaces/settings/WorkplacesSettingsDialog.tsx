"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers3, Loader2, Lock, RotateCcw, ShieldAlert } from "lucide-react";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import type { SessionData } from "@/lib/infrastructure/auth/types";

interface ClaimedContentItem {
  workspaceId: string;
  workspaceName: string;
  contentId: string;
  contentTitle: string;
  contentType: string;
  assignmentType: "primary" | "shared" | "borrowed";
  scope: "item" | "recursive";
  expiresAt: string | null;
}

export default function WorkplacesSettingsDialog() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const assignContentToWorkspace = useWorkspaceStore(
    (state) => state.assignContentToWorkspace
  );
  const unassignContentFromWorkspace = useWorkspaceStore(
    (state) => state.unassignContentFromWorkspace
  );
  const resetWorkspaces = useWorkspaceStore((state) => state.resetWorkspaces);

  const [claimsOpen, setClaimsOpen] = useState(false);
  const [claimActionKey, setClaimActionKey] = useState<string | null>(null);
  const [reassignTargets, setReassignTargets] = useState<Record<string, string>>({});
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);
  const [resetInFlight, setResetInFlight] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const lockedCount = workspaces.filter((workspace) => workspace.isLocked).length;

  const claimedItems = useMemo<ClaimedContentItem[]>(
    () =>
      workspaces
        .flatMap((workspace) =>
          workspace.items.map((item) => ({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            contentId: item.contentId,
            contentTitle: item.content.title,
            contentType: item.content.contentType,
            assignmentType: item.assignmentType,
            scope: item.scope,
            expiresAt: item.expiresAt,
          }))
        )
        .sort((a, b) => {
          const workspaceCompare = a.workspaceName.localeCompare(b.workspaceName);
          if (workspaceCompare !== 0) return workspaceCompare;
          return a.contentTitle.localeCompare(b.contentTitle);
        }),
    [workspaces]
  );

  const claimedItemCount = claimedItems.length;
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

  const availableWorkspacesByClaim = useMemo(() => {
    return Object.fromEntries(
      claimedItems.map((claim) => [
        `${claim.workspaceId}:${claim.contentId}`,
        workspaces.filter((workspace) => workspace.id !== claim.workspaceId),
      ])
    );
  }, [claimedItems, workspaces]);

  const handleReleaseClaim = async (claim: ClaimedContentItem) => {
    const claimKey = `release:${claim.workspaceId}:${claim.contentId}`;
    setClaimActionKey(claimKey);
    try {
      await unassignContentFromWorkspace(claim.workspaceId, claim.contentId);
    } finally {
      setClaimActionKey((current) => (current === claimKey ? null : current));
    }
  };

  const handleReassignClaim = async (claim: ClaimedContentItem) => {
    const selectionKey = `${claim.workspaceId}:${claim.contentId}`;
    const nextWorkspaceId = reassignTargets[selectionKey];
    if (!nextWorkspaceId) return;

    const claimKey = `move:${selectionKey}`;
    setClaimActionKey(claimKey);
    try {
      await assignContentToWorkspace(nextWorkspaceId, claim.contentId, {
        assignmentType: claim.assignmentType,
        scope: claim.scope,
        expiresAt: claim.expiresAt,
        moveFromWorkspaceId: claim.workspaceId,
      });
    } finally {
      setClaimActionKey((current) => (current === claimKey ? null : current));
    }
  };

  const handleStartReset = () => {
    if (resetInFlight) return;
    setResetCountdown(10);
  };

  const handleResetAllWorkplaces = async () => {
    if (resetCountdown !== 0 || resetInFlight) return;
    setResetInFlight(true);
    try {
      await resetWorkspaces();
      setClaimsOpen(false);
      setReassignTargets({});
      setResetCountdown(null);
    } finally {
      setResetInFlight(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-4xl font-semibold tracking-tight text-white">
          Workplaces
        </h2>
        <p className="mt-3 max-w-3xl text-base text-gray-400">
          Workplaces manages your saved layouts, content claims, and overlap
          reminders. Re-enable Workplaces to restore your prior workplaces.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
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
          <div className="mt-4 text-xl font-semibold text-white">
            {activeWorkspace?.name ?? "Main Workspace"}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            This is the workspace you are currently active in.
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
            {renderStatValue(workspaces.length)}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Use the selector in the top workspace bar to switch, rename, or
            create workplaces.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setClaimsOpen((value) => !value)}
          className={`rounded-2xl border p-5 text-left transition-colors ${
            claimsOpen
              ? "border-gold-primary/40 bg-gold-primary/10"
              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
          }`}
        >
          <div className="flex items-center gap-3 text-gold-primary">
            <Lock className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.16em]">
              Claimed Content
            </span>
          </div>
          <div className="mt-4 text-xl font-semibold text-white">
            {renderStatValue(claimedItemCount)}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {lockedCount} locked workplace{lockedCount === 1 ? "" : "s"} currently
            protect assigned files or folders.
          </p>
        </button>
      </div>

      {claimsOpen ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Claimed Content</h3>
              <p className="mt-1 text-sm text-gray-400">
                Release claims or move them into a different workplace.
              </p>
            </div>
            <div className="text-sm text-gray-400">
              {claimedItemCount} claim{claimedItemCount === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {claimedItems.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">
                No content is currently claimed.
              </div>
            ) : (
              claimedItems.map((claim) => {
                const claimKey = `${claim.workspaceId}:${claim.contentId}`;
                const availableTargets =
                  availableWorkspacesByClaim[claimKey] ?? [];
                const selectedTarget =
                  reassignTargets[claimKey] ?? availableTargets[0]?.id ?? "";
                const inFlight =
                  claimActionKey === `release:${claimKey}` ||
                  claimActionKey === `move:${claimKey}`;

                return (
                  <div
                    key={claimKey}
                    className="rounded-xl border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {claim.contentTitle}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {claim.workspaceName} · {claim.assignmentType} · {claim.scope}
                          {claim.expiresAt
                            ? ` · expires ${new Date(claim.expiresAt).toLocaleString()}`
                            : ""}
                        </div>
                      </div>
                      <div className="text-xs uppercase tracking-[0.14em] text-gold-primary">
                        {claim.contentType}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleReleaseClaim(claim)}
                        disabled={inFlight}
                        className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claimActionKey === `release:${claimKey}` ? "Releasing..." : "Release"}
                      </button>

                      <select
                        value={selectedTarget}
                        onChange={(event) =>
                          setReassignTargets((current) => ({
                            ...current,
                            [claimKey]: event.target.value,
                          }))
                        }
                        disabled={inFlight || availableTargets.length === 0}
                        className="min-w-[14rem] rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                      >
                        {availableTargets.length === 0 ? (
                          <option value="">No other workplace available</option>
                        ) : (
                          availableTargets.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))
                        )}
                      </select>

                      <button
                        type="button"
                        onClick={() => void handleReassignClaim(claim)}
                        disabled={inFlight || !selectedTarget}
                        className="rounded-md border border-gold-primary/30 px-3 py-2 text-sm font-medium text-gold-primary transition-colors hover:bg-gold-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {claimActionKey === `move:${claimKey}` ? "Reassigning..." : "Reassign"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-200" />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-100">
              Disabling Workplaces
            </h3>
            <p className="mt-2 text-sm text-amber-50/90">
              Turning Workplaces off hides the selector, claim dialogs, and
              workplace controls. Re-enable Workplaces to restore your prior
              workplaces.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-5 w-5 text-red-200" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-red-100">
              Nuke Workspaces
            </h3>
            <p className="mt-2 text-sm text-red-50/85">
              This removes every saved workplace, content, and claims, then
              returns you to a single Main Workspace.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {resetCountdown === null ? (
                <button
                  type="button"
                  onClick={handleStartReset}
                  disabled={resetInFlight}
                  className="rounded-md border border-red-400/30 px-3 py-2 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset
                </button>
              ) : resetCountdown > 0 ? (
                <>
                  <button
                    type="button"
                    disabled
                    className="rounded-md border border-red-400/30 px-3 py-2 text-sm font-medium text-red-100 opacity-80"
                  >
                    Wait {resetCountdown}s before confirming
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetCountdown(null)}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10"
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
                    className="inline-flex items-center gap-2 rounded-md border border-red-400/40 bg-red-500/15 px-3 py-2 text-sm font-medium text-red-50 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
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
