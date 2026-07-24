"use client";

import { X } from "lucide-react";

/**
 * MarkdownPasteToast (v3.2 T2)
 *
 * Rendered via sonner `toast.custom` when the user pastes markdown-looking text
 * into the rich-text editor. Offers three explicit choices — never auto-guesses:
 *   • Paste as Markdown  → format this one paste
 *   • Always format      → format this one AND every future markdown paste
 *   • Don't show again   → keep pastes literal, stop hinting
 */

interface MarkdownPasteToastProps {
  onConvert: () => void;
  onAlways: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

export function MarkdownPasteToast({
  onConvert,
  onAlways,
  onClose,
  onDismiss,
}: MarkdownPasteToastProps) {
  return (
    <div className="relative flex w-[22rem] max-w-full flex-col gap-2 rounded-lg border border-border bg-popover p-4 pr-10 text-popover-foreground shadow-lg">
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss paste suggestion"
        title="Dismiss"
        className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="text-sm font-semibold">Pasted as plain text</div>
      <div className="text-xs text-muted-foreground">
        That looked like Markdown. Format it as rich text?
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConvert}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Paste as Markdown
        </button>
        <button
          type="button"
          onClick={onAlways}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Always format
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
}
