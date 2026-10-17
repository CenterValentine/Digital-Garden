"use client";

/**
 * One textarea, three hosts: the toolbelt's second row (dark glass), the
 * pinned thread card and the Comments tab (page surfaces). Enter posts,
 * Shift+Enter breaks a line, Esc cancels. Grows with its text.
 *
 * `@` opens a picker of the note's collaborators (owner + grantees, fetched
 * once per note on first use); a pick inserts `@username ` and, on submit,
 * every `@username` that names a collaborator becomes a mention id for the
 * server (which notifies them and never notifies a stranger).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { commentsApi } from "@/lib/domain/comments/client";
import { COMMENT_BODY_MAX, type CommentAuthorDto } from "@/lib/domain/comments/types";

export interface CommentComposerProps {
  placeholder?: string;
  submitLabel?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** "dark" inside the bubble menu's black glass; "surface" on page surfaces. */
  tone?: "dark" | "surface";
  /** Enables the `@` collaborator picker for this note. */
  contentId?: string | null;
  onSubmit: (body: string, mentions: string[]) => Promise<void> | void;
  onCancel?: () => void;
  /** The host may keep itself open while the textarea has focus. */
  onFocusChange?: (focused: boolean) => void;
  className?: string;
}

/** `@username` tokens — usernames are 1–50 chars of word characters, dots, dashes. */
export const MENTION_TOKEN_RE = /(^|[^\w@])@([\w.-]{1,50})/g;

const collaboratorCache = new Map<string, Promise<CommentAuthorDto[]>>();
function loadCollaborators(contentId: string): Promise<CommentAuthorDto[]> {
  const hit = collaboratorCache.get(contentId);
  if (hit) return hit;
  const promise = commentsApi.collaborators(contentId).catch(() => {
    collaboratorCache.delete(contentId);
    return [] as CommentAuthorDto[];
  });
  collaboratorCache.set(contentId, promise);
  return promise;
}

/** Resolve typed `@username`s against the note's collaborators → user ids. */
export function mentionIdsIn(body: string, collaborators: CommentAuthorDto[]): string[] {
  if (collaborators.length === 0) return [];
  const byName = new Map(collaborators.map((c) => [c.username.toLowerCase(), c.id]));
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    const id = byName.get(match[2].toLowerCase());
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export function CommentComposer({
  placeholder = "Comment…",
  submitLabel = "Comment",
  initialValue = "",
  autoFocus = false,
  tone = "surface",
  contentId = null,
  onSubmit,
  onCancel,
  onFocusChange,
  className,
}: CommentComposerProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [collaborators, setCollaborators] = useState<CommentAuthorDto[] | null>(null);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; text: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
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

  // Collaborators load on the first `@`, once per note.
  useEffect(() => {
    if (!mentionQuery || collaborators !== null || !contentId) return;
    let cancelled = false;
    void loadCollaborators(contentId).then((list) => {
      if (!cancelled) setCollaborators(list);
    });
    return () => {
      cancelled = true;
    };
  }, [collaborators, contentId, mentionQuery]);

  const suggestions = useMemo(() => {
    if (!mentionQuery || !collaborators) return [];
    const needle = mentionQuery.text.toLowerCase();
    return collaborators.filter((c) => c.username.toLowerCase().startsWith(needle)).slice(0, 6);
  }, [collaborators, mentionQuery]);

  const detectMention = (text: string, caret: number) => {
    if (!contentId) return;
    const before = text.slice(0, caret);
    const match = /(^|[^\w@])@([\w.-]{0,50})$/.exec(before);
    if (!match) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery({ start: caret - match[2].length - 1, text: match[2] });
    setHighlight(0);
  };

  const pickMention = (user: CommentAuthorDto) => {
    if (!mentionQuery) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, mentionQuery.start)}@${user.username} ${value.slice(caret)}`;
    setValue(next);
    setMentionQuery(null);
    const position = mentionQuery.start + user.username.length + 2;
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(position, position);
    }, 0);
  };

  const submit = useCallback(async () => {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const list = contentId && MENTION_TOKEN_RE.test(body) ? await loadCollaborators(contentId) : [];
      MENTION_TOKEN_RE.lastIndex = 0;
      await onSubmit(body, mentionIdsIn(body, list));
      setValue("");
      setMentionQuery(null);
    } finally {
      setBusy(false);
    }
  }, [busy, contentId, onSubmit, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(suggestions[highlight] ?? suggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
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
    <div className={cn("relative flex items-end gap-1", className)}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        maxLength={COMMENT_BODY_MAX}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          detectMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
        onKeyUp={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const el = event.currentTarget;
            detectMention(el.value, el.selectionStart ?? el.value.length);
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => {
          onFocusChange?.(false);
          // Let a click on a suggestion land before the list goes.
          window.setTimeout(() => setMentionQuery(null), 150);
        }}
        disabled={busy}
        aria-label={placeholder}
        aria-autocomplete={contentId ? "list" : undefined}
        className={cn(
          "min-h-[30px] flex-1 resize-none rounded px-2 py-1 text-sm leading-5 outline-none",
          dark
            ? "bg-white/10 text-white placeholder:text-gray-400 ring-1 ring-white/10 focus:ring-white/30"
            : "bg-black/[0.04] text-foreground placeholder:text-muted-foreground ring-1 ring-black/10 focus:ring-gold-primary/60 dark:bg-white/5 dark:ring-white/10",
        )}
      />
      {mentionQuery && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention a collaborator"
          className={cn(
            "absolute bottom-full left-0 z-10 mb-1 max-h-48 w-56 overflow-y-auto rounded-md border p-1 text-sm shadow-lg",
            dark ? "border-white/10 bg-[#1a1a1a] text-white" : "border-black/10 bg-white text-foreground dark:border-white/10 dark:bg-[#1a1a1a]",
          )}
        >
          {suggestions.map((user, index) => (
            <li
              key={user.id}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault();
                pickMention(user);
              }}
              onMouseEnter={() => setHighlight(index)}
              className={cn(
                "cursor-pointer rounded px-2 py-1",
                index === highlight ? "bg-gold-primary/15 text-gold-primary" : "hover:bg-black/5 dark:hover:bg-white/10",
              )}
            >
              @{user.username}
            </li>
          ))}
        </ul>
      )}
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
