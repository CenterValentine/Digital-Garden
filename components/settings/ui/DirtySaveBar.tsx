"use client";

import { Button } from "@/components/client/ui/button";
import { cn } from "@/lib/core/utils";

interface DirtySaveBarProps {
  isDirty: boolean;
  isSaving?: boolean;
  onSave: () => void;
  onRevert?: () => void;
  saveLabel?: string;
  className?: string;
}

/**
 * Footer bar for explicit-save forms: Save disabled until dirty,
 * "Unsaved changes" cue while dirty, optional Reset back to baseline.
 * Pairs with useDirtyForm.
 */
export function DirtySaveBar({
  isDirty,
  isSaving = false,
  onSave,
  onRevert,
  saveLabel = "Save",
  className,
}: DirtySaveBarProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity",
          isDirty ? "opacity-100" : "opacity-0"
        )}
        aria-hidden={!isDirty}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Unsaved changes
      </span>
      <div className="flex items-center gap-2">
        {onRevert && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevert}
            disabled={!isDirty || isSaving}
          >
            Reset
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!isDirty || isSaving}
        >
          {isSaving ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
