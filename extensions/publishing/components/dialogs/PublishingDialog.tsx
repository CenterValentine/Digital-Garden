/**
 * Shared shell primitive for publishing dialogs.
 *
 * Consolidates the backdrop + panel + header + close-button pattern that
 * was previously duplicated across PrePublishDialog, CreatePublicItemDialog,
 * CreatePublicPathDialog, and EditPublicPathDialog.
 *
 * Side effect of the consolidation: CreatePublicItemDialog switches from
 * bg-card to bg-zinc-900, matching the other three dialogs and giving its
 * dark-mode panel proper contrast against the slate page background.
 * (Pre-consolidation it inherited --card #2D4A4B in dark mode, which is the
 * same hue as the page surface.)
 */

"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { FormEventHandler, ReactNode } from "react";

type PublishingDialogSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<PublishingDialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

interface PublishingDialogProps {
  /** Heading text or node shown in the dialog header. */
  title: ReactNode;
  /** Optional icon rendered before the title (e.g. status indicator). */
  titleIcon?: ReactNode;
  /** Invoked on backdrop click or close-button click. */
  onClose: () => void;
  /** Hide the X close button (e.g. for confirmation flows with a footer
   *  Cancel button instead). Defaults to true. */
  showCloseButton?: boolean;
  /** Panel max-width. Defaults to "sm". */
  size?: PublishingDialogSize;
  /** If provided, the panel renders as a <form> with this submit handler. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** Dialog body — caller is responsible for body padding (typically px-4 py-3). */
  children: ReactNode;
}

export function PublishingDialog({
  title,
  titleIcon,
  onClose,
  showCloseButton = true,
  size = "sm",
  onSubmit,
  children,
}: PublishingDialogProps) {
  const panelClasses = cn(
    "relative z-10 w-full mx-4 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl",
    SIZE_CLASS[size],
  );

  const header = (
    <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
      <div className="flex items-center gap-2">
        {titleIcon}
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      {showCloseButton && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-white/30 hover:text-white/70 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {onSubmit ? (
        <form onSubmit={onSubmit} className={panelClasses}>
          {header}
          {children}
        </form>
      ) : (
        <div className={panelClasses}>
          {header}
          {children}
        </div>
      )}
    </div>
  );
}
