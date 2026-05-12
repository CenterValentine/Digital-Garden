"use client";

import { useState } from "react";
import { OctagonAlert, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import { usePublishStore } from "../../state/publish-store";
import { publishItem } from "../../lib/client-api";

interface ValidationIssue {
  field?: string;
  message: string;
  severity: "warning" | "error";
}

function coerceIssues(raw: unknown[]): ValidationIssue[] {
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
    .map((i) => ({
      field: typeof i.field === "string" ? i.field : undefined,
      message: typeof i.message === "string" ? i.message : String(i),
      severity: i.severity === "error" ? "error" : "warning",
    }));
}

export function PrePublishDialog({ onRefresh }: { onRefresh: () => void }) {
  const {
    prePublishDialogOpen,
    pendingPublishItemId,
    linkedItems,
    closePrePublishDialog,
  } = usePublishStore();

  const [isPublishing, setIsPublishing] = useState(false);

  if (!prePublishDialogOpen || !pendingPublishItemId) return null;

  const item = linkedItems.find((i) => i.id === pendingPublishItemId);
  if (!item) return null;

  const issues = coerceIssues(item.validationIssues);
  const isBlocked = item.validationStatus === "blocked";
  const hasWarnings = item.validationStatus === "warnings";

  async function handlePublishAnyway() {
    if (!pendingPublishItemId) return;
    setIsPublishing(true);
    try {
      await publishItem(pendingPublishItemId);
      toast.success("Published successfully.");
      closePrePublishDialog();
      onRefresh();
    } catch {
      toast.error("Could not publish. Try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closePrePublishDialog}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            {isBlocked ? (
              <OctagonAlert className="w-4 h-4 text-rose-500" />
            ) : (
              <TriangleAlert className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-sm font-medium text-white">
              {isBlocked ? "Cannot publish" : "Publish with warnings"}
            </span>
          </div>
          <button
            onClick={closePrePublishDialog}
            className="p-1 rounded-md text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-xs text-white/50 mb-3">
            {isBlocked
              ? "Fix the issues below before publishing."
              : "This item has warnings. You can still publish, but consider fixing these first."}
          </p>

          {issues.length > 0 ? (
            <ul className="space-y-1.5">
              {issues.map((issue, i) => (
                <li key={i} className="flex items-start gap-2">
                  {issue.severity === "error" ? (
                    <OctagonAlert className="w-3 h-3 mt-0.5 shrink-0 text-rose-500" />
                  ) : (
                    <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                  )}
                  <span className="text-xs text-white/70">
                    {issue.field && (
                      <span className="text-white/40 mr-1">{issue.field}:</span>
                    )}
                    {issue.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-white/30 italic">No details available.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
          <button
            onClick={closePrePublishDialog}
            className="px-3 py-1.5 rounded-md text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
          {!isBlocked && hasWarnings && (
            <button
              onClick={handlePublishAnyway}
              disabled={isPublishing}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {isPublishing ? "Publishing…" : "Publish anyway"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
