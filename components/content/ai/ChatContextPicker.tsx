/**
 * Chat Context Picker
 *
 * Composer affordance for selecting a custom-instruction "context" that
 * shapes the assistant's voice/output (ChatGPT custom-instructions
 * analogue). Mirrors `ModelPicker`'s visual language — a compact trigger
 * chip that opens an upward dropdown — and additionally lets the user
 * create / edit / delete contexts inline, without leaving the chat.
 *
 * Controlled: `value` is the active context id (or null); `onChange`
 * fires on selection. CRUD talks to `/api/ai/contexts`. The list is
 * fetched lazily on first open and mutated in place afterward.
 */

"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import {
  SlidersHorizontal,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/core/utils";
import { toast } from "sonner";
import {
  CHAT_CONTEXT_BODY_MAX,
  CHAT_CONTEXT_NAME_MAX,
  type ChatContextView,
} from "@/lib/features/chat-contexts/types";

interface ChatContextPickerProps {
  /** Active context id, or null for "no context". */
  value: string | null;
  /** Fires when the user selects a context (or clears with null). */
  onChange: (id: string | null) => void;
  disabled?: boolean;
  /** Icon-only trigger for narrow containers (the chat side panel). */
  compact?: boolean;
}

type FormDraft = { id: string | null; name: string; body: string };

export function ChatContextPicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}: ChatContextPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [contexts, setContexts] = useState<ChatContextView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const active = contexts.find((c) => c.id === value) ?? null;
  const displayName = active?.name ?? "Context";

  // ── data ──
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/contexts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contexts");
      const body = await res.json();
      setContexts((body?.data as ChatContextView[]) ?? []);
      setLoaded(true);
    } catch {
      toast.error("Couldn't load contexts");
    } finally {
      setLoading(false);
    }
  }, []);

  // Lazy-load on first open.
  useEffect(() => {
    if (isOpen && !loaded && !loading) void fetchList();
  }, [isOpen, loaded, loading, fetchList]);

  // Close on outside click / Escape (skip while editing — Escape there
  // cancels the form first, handled in the input's onKeyDown).
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setDraft(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !draft) setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, draft]);

  // ── actions ──
  const handleSelect = useCallback(
    (id: string | null) => {
      onChange(id);
      setIsOpen(false);
    },
    [onChange],
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const bodyText = draft.body.trim();
    if (!name || !bodyText) {
      toast.error("Name and instructions are both required.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = draft.id != null;
      const res = await fetch(
        isEdit ? `/api/ai/contexts/${draft.id}` : "/api/ai/contexts",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, body: bodyText }),
        },
      );
      const payload = await res.json();
      if (!res.ok)
        throw new Error(payload?.error ?? "Failed to save context");
      const saved = payload.data as ChatContextView;
      setContexts((prev) =>
        isEdit
          ? prev.map((c) => (c.id === saved.id ? saved : c))
          : [saved, ...prev],
      );
      // Selecting a freshly-created context is the expected flow.
      if (!isEdit) onChange(saved.id);
      setDraft(null);
      toast.success(isEdit ? "Context updated" : "Context created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [draft, onChange]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/ai/contexts/${id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete");
        setContexts((prev) => prev.filter((c) => c.id !== id));
        if (value === id) onChange(null);
        toast.success("Context deleted");
      } catch {
        toast.error("Couldn't delete context");
      }
    },
    [value, onChange],
  );

  return (
    <div ref={containerRef} className="relative">
      {isOpen && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl">
          {draft ? (
            // ── Form view (create / edit) ──
            <div className="p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
                  {draft.id ? "Edit context" : "New context"}
                </span>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded p-0.5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={draft.name}
                onChange={(e) =>
                  setDraft({ ...draft, name: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setDraft(null);
                  }
                }}
                placeholder="Name (e.g. Concise & technical)"
                maxLength={CHAT_CONTEXT_NAME_MAX}
                autoFocus
                className="mb-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-white placeholder:text-gray-500 focus:border-white/25 focus:outline-none"
              />
              <textarea
                value={draft.body}
                onChange={(e) =>
                  setDraft({ ...draft, body: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setDraft(null);
                  }
                }}
                placeholder="How should the assistant respond? e.g. 'Be terse. Prefer code examples. Assume I'm a senior engineer.'"
                maxLength={CHAT_CONTEXT_BODY_MAX}
                rows={5}
                className="scrollbar-hide w-full resize-none rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs leading-relaxed text-white placeholder:text-gray-500 focus:border-white/25 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-md px-2.5 py-1 text-[11px] text-gray-400 hover:bg-white/10 hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/20 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            // ── List view ──
            <div className="max-h-72 overflow-y-auto py-1">
              {/* None / clear */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                  value === null
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200",
                )}
              >
                <span>No context</span>
                {value === null && <Check className="h-3.5 w-3.5" />}
              </button>

              {loading && (
                <div className="px-3 py-2 text-[11px] text-gray-500">
                  Loading…
                </div>
              )}

              {!loading && loaded && contexts.length === 0 && (
                <div className="px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                  No contexts yet. Create one to shape how the assistant
                  replies.
                </div>
              )}

              {contexts.map((ctx) => {
                const isSelected = ctx.id === value;
                return (
                  <div
                    key={ctx.id}
                    className={cn(
                      "group flex items-center gap-1 px-1.5",
                      isSelected && "bg-white/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(ctx.id)}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between rounded px-1.5 py-2 text-left text-xs transition-colors",
                        isSelected
                          ? "text-white"
                          : "text-gray-400 hover:text-gray-200",
                      )}
                    >
                      <span className="truncate">{ctx.name}</span>
                      {isSelected && (
                        <Check className="ml-2 h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          id: ctx.id,
                          name: ctx.name,
                          body: ctx.body,
                        })
                      }
                      className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-gray-300 group-hover:opacity-100"
                      aria-label={`Edit ${ctx.name}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ctx.id)}
                      className="rounded p-1 text-gray-500 opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                      aria-label={`Delete ${ctx.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}

              {/* New context */}
              <div className="mt-1 border-t border-white/5 pt-1">
                <button
                  type="button"
                  onClick={() => setDraft({ id: null, name: "", body: "" })}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  New context
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trigger chip */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] transition-colors",
          active
            ? "text-emerald-300/90 hover:text-emerald-200"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-300",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        title={
          active
            ? `Context: ${active.name}`
            : "Shape replies with a custom context"
        }
      >
        <SlidersHorizontal className="h-3 w-3 shrink-0" />
        {!compact && (
          <>
            <span className="max-w-[120px] truncate">{displayName}</span>
            <ChevronUp
              className={cn(
                "h-3 w-3 shrink-0 transition-transform",
                isOpen && "rotate-180",
              )}
            />
          </>
        )}
      </button>
    </div>
  );
}
