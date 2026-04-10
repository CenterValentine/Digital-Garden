"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Folder, Search, User, Users, X } from "lucide-react";
import { toast } from "sonner";

import type { PeopleSearchResult } from "@/lib/domain/people";
import { PeopleCreateDialog } from "./PeopleCreateDialog";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useTreeStateStore } from "@/state/tree-state-store";

interface PeopleMountPickerDialogProps {
  parentId: string | null;
  onClose: () => void;
  onMounted: () => void;
}

interface PeopleSearchApiResponse {
  success: boolean;
  data?: {
    results: PeopleSearchResult[];
  };
  error?: {
    code: string;
    message: string;
  };
}

interface PeopleMountPolicyDecision {
  ok: boolean;
  action: "allow" | "require-confirmation" | "deny";
  reason?: string;
  conflicts?: Array<{
    mountId: string;
    contentParentId: string | null;
    reason: string;
    target: {
      kind: "peopleGroup" | "person";
      groupId?: string;
      personId?: string;
    };
    location?: {
      selectedNodeId: string | null;
      contentAncestorIds: string[];
      peopleAncestorIds: string[];
      fileTreePathLabel: string;
      peoplePathLabel: string | null;
      targetLabel: string;
      targetKind: "person" | "peopleGroup";
    } | null;
  }>;
}

interface PeopleMountPreviewResponse {
  success: boolean;
  data?: {
    decision: PeopleMountPolicyDecision;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface PeopleMountCreateResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

type PeopleMountTarget =
  | { kind: "peopleGroup"; groupId: string }
  | { kind: "person"; personId: string };

export function PeopleMountPickerDialog({
  parentId,
  onClose,
  onMounted,
}: PeopleMountPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeopleSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMountingId, setIsMountingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"person" | "group" | null>(null);
  const [previewResult, setPreviewResult] = useState<{
    result: PeopleSearchResult;
    target: PeopleMountTarget;
    decision: PeopleMountPolicyDecision;
  } | null>(null);

  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);

  const trimmedQuery = query.trim();
  const targetLabel = useMemo(() => (parentId ? "selected folder" : "root"), [parentId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: "30",
        });
        const response = await fetch(`/api/people/search?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const result = (await response.json()) as PeopleSearchApiResponse;

        if (!response.ok || !result.success || !result.data) {
          throw new Error(result.error?.message || "Failed to search People records");
        }

        setResults(result.data.results);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[PeopleMountPickerDialog] Search failed:", err);
        setResults([]);
        setError(err instanceof Error ? err.message : "Failed to search People records");
      } finally {
        setIsLoading(false);
      }
    }, trimmedQuery ? 180 : 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isMountingId) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMountingId, onClose]);

  const mountTarget = async (result: PeopleSearchResult) => {
    setIsMountingId(result.id);

    try {
      const target = toMountTarget(result);
      const preview = await requestMountPreview(target, parentId);
      const decision = preview.data?.decision;

      if (!preview.success || !decision) {
        throw new Error(preview.error?.message || "Failed to preview People mount");
      }

      if (!decision.ok || decision.action === "deny") {
        setPreviewResult({
          result,
          target,
          decision,
        });
        return;
      }

      if (decision.action === "require-confirmation") {
        setPreviewResult({
          result,
          target,
          decision,
        });
        return;
      }

      const created = await requestCreateMount(target, parentId, false);
      if (!created.success) {
        throw new Error(created.error?.message || "Failed to add People record to file tree");
      }

      toast.success("People record added", {
        description: `${result.label} was mounted at ${targetLabel}.`,
      });
      window.dispatchEvent(new CustomEvent("dg:people-refresh"));
      onMounted();
      onClose();
    } catch (err) {
      console.error("[PeopleMountPickerDialog] Mount failed:", err);
      toast.error("Failed to add People record", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsMountingId(null);
    }
  };

  const focusConflictLocation = (conflict: NonNullable<PeopleMountPolicyDecision["conflicts"]>[number]) => {
    const location = conflict.location;
    if (!location?.selectedNodeId) {
      return;
    }

    useTreeStateStore.getState().expandMany([
      ...location.contentAncestorIds,
      ...location.peopleAncestorIds,
    ]);
    useTreeStateStore.getState().setSelectedIds([location.selectedNodeId]);
    setActiveView("files");
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  };

  const confirmRemount = async () => {
    if (!previewResult) {
      return;
    }

    setIsMountingId(previewResult.result.id);
    try {
      const created = await requestCreateMount(previewResult.target, parentId, true);
      if (!created.success) {
        throw new Error(created.error?.message || "Failed to add People record to file tree");
      }

      toast.success("People record moved", {
        description: `${previewResult.result.label} was reassigned in the file tree.`,
      });
      window.dispatchEvent(new CustomEvent("dg:people-refresh"));
      onMounted();
      onClose();
    } catch (err) {
      console.error("[PeopleMountPickerDialog] Remount failed:", err);
      toast.error("Failed to move People record", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPreviewResult(null);
      setIsMountingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Add Person / Group</h2>
            <p className="mt-1 text-xs text-gray-500">
              Mount one canonical People record under {targetLabel}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(isMountingId)}
            className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            aria-label="Close People picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-200 px-4 py-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people, groups, or subgroups..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-500 focus:border-gold-primary/60"
            />
          </label>
        </div>

        <div className="max-h-[360px] overflow-y-auto px-2 py-2">
          {error ? (
            <PickerState icon={<Users className="h-9 w-9 text-red-400" />} title="Search failed" description={error} />
          ) : isLoading ? (
            <PickerState icon={<Users className="h-9 w-9 text-gray-400" />} title="Loading People" description="Searching available records." />
          ) : results.length === 0 ? (
            <PickerState
              icon={<Search className="h-9 w-9 text-gray-400" />}
              title="No matches"
              description="Create a new person profile or group, then mount it here."
              actionLabel={trimmedQuery ? `Create person "${trimmedQuery}"` : "Create person profile"}
              secondaryActionLabel={trimmedQuery ? `Create group "${trimmedQuery}"` : "Create group"}
              onAction={() => setCreateMode("person")}
              onSecondaryAction={() => setCreateMode("group")}
            />
          ) : (
            <div className="space-y-1">
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => void mountTarget(result)}
                  disabled={Boolean(isMountingId)}
                  className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ResultIcon result={result} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-gray-900">{result.label}</div>
                    <div className="truncate text-xs text-gray-500">{formatResultDescription(result)}</div>
                  </div>
                  {result.mount ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      Tree
                    </span>
                  ) : null}
                  {isMountingId === result.id ? (
                    <span className="shrink-0 text-xs text-gray-500">Adding...</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {createMode ? (
        <PeopleCreateDialog
          mode={createMode}
          initialName={trimmedQuery}
          onClose={() => setCreateMode(null)}
          onCreated={() => {
            setCreateMode(null);
            window.dispatchEvent(new CustomEvent("dg:people-refresh"));
          }}
        />
      ) : null}

      {previewResult ? (
        <ConflictDialog
          result={previewResult.result}
          decision={previewResult.decision}
          onClose={() => setPreviewResult(null)}
          onConfirm={canMoveCurrentRepresentation(previewResult) ? () => void confirmRemount() : undefined}
          onFocusConflict={focusConflictLocation}
          isSubmitting={Boolean(isMountingId)}
        />
      ) : null}
    </div>
  );
}

function toMountTarget(result: PeopleSearchResult): PeopleMountTarget {
  if (result.treeNodeKind === "peopleGroup") {
    return {
      kind: "peopleGroup",
      groupId: result.groupId,
    };
  }

  return {
    kind: "person",
    personId: result.personId,
  };
}

async function requestMountPreview(
  target: PeopleMountTarget,
  contentParentId: string | null
): Promise<PeopleMountPreviewResponse> {
  const response = await fetch("/api/people/mounts/preview", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target,
      contentParentId,
    }),
  });

  return (await response.json()) as PeopleMountPreviewResponse;
}

async function requestCreateMount(
  target: PeopleMountTarget,
  contentParentId: string | null,
  allowRemount: boolean
): Promise<PeopleMountCreateResponse> {
  const response = await fetch("/api/people/mounts", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target,
      contentParentId,
      allowRemount,
    }),
  });

  return (await response.json()) as PeopleMountCreateResponse;
}

function ResultIcon({ result }: { result: PeopleSearchResult }) {
  if (result.treeNodeKind === "peopleGroup") {
    return <Folder className="h-4 w-4 shrink-0 text-gold-primary" />;
  }

  return <User className="h-4 w-4 shrink-0 text-blue-500" />;
}

function formatResultDescription(result: PeopleSearchResult): string {
  if (result.treeNodeKind === "peopleGroup") {
    return result.isDefault ? "Default group" : "Group";
  }

  return result.email || result.phone || "Person";
}

function PickerState({
  icon,
  title,
  description,
  actionLabel,
  secondaryActionLabel,
  onAction,
  onSecondaryAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  secondaryActionLabel?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center p-6 text-center">
      <div className="mb-3">{icon}</div>
      <h3 className="mb-1 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="max-w-xs text-xs leading-5 text-gray-500">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-800"
        >
          {actionLabel}
        </button>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="mt-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {secondaryActionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ConflictDialog({
  result,
  decision,
  onClose,
  onConfirm,
  onFocusConflict,
  isSubmitting,
}: {
  result: PeopleSearchResult;
  decision: PeopleMountPolicyDecision;
  onClose: () => void;
  onConfirm?: () => void;
  onFocusConflict: (conflict: NonNullable<PeopleMountPolicyDecision["conflicts"]>[number]) => void;
  isSubmitting: boolean;
}) {
  const conflicts = decision.conflicts ?? [];

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {decision.action === "require-confirmation" ? "Move existing file-tree mounts?" : "People record already represented"}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {decision.reason || `${result.label} is already represented in the file tree.`}
          </p>
        </div>
        <div className="max-h-[360px] space-y-3 overflow-y-auto px-4 py-4">
          {conflicts.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              No conflict details were returned.
            </div>
          ) : (
            conflicts.map((conflict) => (
              <div key={conflict.mountId} className="rounded-lg border border-gray-200 px-3 py-3">
                <div className="text-sm font-medium text-gray-900">
                  {conflict.location?.targetLabel || "Existing mount"}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  File tree: {conflict.location?.fileTreePathLabel || "Root"}
                </div>
                {conflict.location?.peoplePathLabel ? (
                  <div className="mt-1 text-xs text-gray-500">
                    People path: {conflict.location.peoplePathLabel}
                  </div>
                ) : null}
                <div className="mt-1 text-xs text-gray-500">
                  Rule: {formatConflictReason(conflict.reason)}
                </div>
                {conflict.location?.selectedNodeId ? (
                  <button
                    type="button"
                    onClick={() => onFocusConflict(conflict)}
                    className="mt-3 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Go To Current Location
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
          >
            Close
          </button>
          {onConfirm ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onConfirm}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Moving..." : "Move To New Location"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatConflictReason(reason: string) {
  switch (reason) {
    case "same-target-mounted":
      return "This exact person or group is already mounted.";
    case "descendant-person-mounted":
      return "A person inside this group is already mounted elsewhere.";
    case "descendant-group-mounted":
      return "A subgroup inside this group is already mounted elsewhere.";
    case "ancestor-group-mounted":
      return "This person is already represented through an ancestor group mount.";
    default:
      return reason;
  }
}

function canMoveCurrentRepresentation(previewResult: {
  target: PeopleMountTarget;
  decision: PeopleMountPolicyDecision;
}) {
  return previewResult.decision.action === "require-confirmation";
}
