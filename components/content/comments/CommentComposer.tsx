"use client";

/**
 * One textarea, three hosts: the toolbelt's second row (dark glass), the
 * pinned thread card and the Comments tab (page surfaces). Enter posts,
 * Shift+Enter breaks a line, Esc cancels. Grows with its text.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { COMMENT_BODY_MAX } from "@/lib/domain/comments/types";

export interface CommentComposerProps {
  placeholder?: string;
  submitLabel?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** "dark" inside the bubble menu's black glass; "surface" on page surfaces. */
  tone?: "dark" | "surface";
  onSubmit: (body: string) => Promise<void> | void;
  onCancel?: () => void;
  /** The host may keep itself open while the textarea has focus. */
  onFocusChange?: (focused: boolean) => void;
  className?: string;
}

export function CommentComposer({
  placeholder = "Comment…",
  submitLabel = "Comment",
  initialValue = "",
  autoFocus = false,
  tone = "surface",
  onSubmit,
  onCancel,
  onFocusChange,
  className,
}: CommentComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autosize: reset then grow to the content, capped by CSS max-height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      const el = textareaRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const submit = useCallback(async () => {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setValue("");
    } finally {
      setBusy(false);
    }
  }, [busy, onSubmit, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel?.();
    }
  };

  const dark = tone === "dark";
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <div className={cn("flex items-end gap-1", className)}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        maxLength={COMMENT_BODY_MAX}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        disabled={busy}
        aria-label={placeholder}
        className={cn(
          "min-h-[30px] flex-1 resize-none rounded px-2 py-1 text-sm leading-5 outline-none",
          dark
            ? "bg-white/10 text-white placeholder:text-gray-400 ring-1 ring-white/10 focus:ring-white/30"
            : "bg-black/[0.04] text-foreground placeholder:text-muted-foreground ring-1 ring-black/10 focus:ring-gold-primary/60 dark:bg-white/5 dark:ring-white/10",
        )}
      />
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          title="Cancel (Esc)"
          className={cn(
            "rounded p-1.5 transition-colors",
            dark ? "text-gray-300 hover:bg-white/10 hover:text-white" : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        title={`${submitLabel} (Enter)`}
        className={cn(
          "rounded p-1.5 transition-colors disabled:opacity-40",
          dark
            ? "text-gray-300 hover:bg-white/10 hover:text-white"
            : "text-gold-primary hover:bg-gold-primary/10",
        )}
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}
