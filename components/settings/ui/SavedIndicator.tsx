"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/core/utils";

import type { SaveStatus } from "./save-state";

interface SavedIndicatorProps {
  status: SaveStatus;
  error?: string | null;
  className?: string;
}

/**
 * Inline save feedback shown in a SettingSection header's action slot.
 * The one consistent persistence signal across settings — toasts are
 * reserved for errors and destructive confirmations.
 */
export function SavedIndicator({
  status,
  error,
  className,
}: SavedIndicatorProps) {
  if (status === "idle") return null;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "saving" && "text-muted-foreground",
        status === "saved" && "text-emerald-600 dark:text-emerald-400",
        status === "error" && "text-red-600 dark:text-red-400",
        className
      )}
    >
      {status === "saving" && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Saving…
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Saved
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {error || "Save failed"}
        </>
      )}
    </span>
  );
}
