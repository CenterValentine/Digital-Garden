"use client";

/**
 * The Comments rail tab — every thread on the open note, in DOCUMENT order
 * (positions come from the live editor's marks), filtered Open · Resolved ·
 * All. Threads on the note as a whole lead; threads whose mark is gone sit
 * at the bottom under "Original text removed" with Re-anchor. A "Comment on
 * note" composer starts an unanchored thread.
 *
 * Polls for replies/resolves every 30 s while mounted and the tab is visible
 * (new threads arrive through the marks, see comment-plugin.ts).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import { useCommentsStore } from "@/state/comments-store";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { CommentComposer } from "./CommentComposer";
import { ThreadCard } from "./ThreadCard";
import { useCommentAnchors } from "./use-comment-anchors";

type Filter = "open" | "resolved" | "all";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All" },
];

const POLL_MS = 30_000;

export function CommentsTab({ contentId }: { contentId: string | null }) {
  const editor = useEditorInstanceStore((s) => (contentId ? s.editorsByContentId[contentId] ?? null : null));
  const threads = useCommentsStore((s) => (contentId ? s.threadsByContentId[contentId] : undefined));
  const loaded = useCommentsStore((s) => Boolean(contentId && s.loadedAt[contentId]));
  const setShowResolved = useCommentsStore((s) => s.setShowResolved);
  const anchors = useCommentAnchors(editor);
  const [filter, setFilter] = useState<Filter>("open");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load + poll while visible.
  useEffect(() => {
    if (!contentId) return;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      useCommentsStore
        .getState()
        .load(contentId)
        .then(() => {
          if (!cancelled) setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load comments");
        });
    };
    load();
    const interval = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [contentId]);

  // The editor quiets resolved marks unless the user is looking at them here.
  useEffect(() => {
    setShowResolved(filter !== "open");
    return () => setShowResolved(false);
  }, [filter, setShowResolved]);

  const groups = useMemo(() => {
    const list = (threads ?? []).filter((t) =>
      filter === "all" ? true : filter === "resolved" ? Boolean(t.resolvedAt) : !t.resolvedAt,
    );
    const noteLevel = list.filter((t) => !t.anchor);
    const anchored = list
      .filter((t) => t.anchor && anchors.has(t.id))
      .sort((a, b) => (anchors.get(a.id)?.[0]?.from ?? 0) - (anchors.get(b.id)?.[0]?.from ?? 0));
    // Until the editor is mounted every anchored thread looks orphaned; show
    // them in creation order instead of under the orphan heading.
    const orphaned = editor ? list.filter((t) => t.anchor && !anchors.has(t.id)) : [];
    const unplaced = editor ? [] : list.filter((t) => t.anchor);
    return { noteLevel, anchored: [...anchored, ...unplaced], orphaned };
  }, [anchors, editor, filter, threads]);

  const jump = useCallback(
    (threadId: string) => {
      const ranges = anchors.get(threadId);
      if (!editor || !ranges?.length) return;
      const { from, to } = ranges[0];
      editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
      useCommentsStore.getState().setActiveThread(threadId);
    },
    [anchors, editor],
  );

  const reanchor = useCallback(
    (threadId: string) => {
      if (!editor) return;
      if (editor.state.selection.empty) {
        toast.message("Select the text to attach this thread to, then press Re-anchor");
        return;
      }
      if (!editor.chain().focus().setComment(threadId).run()) toast.error("Couldn't anchor the thread here");
    },
    [editor],
  );

  const dropMark = useCallback(
    (threadId: string) => {
      editor?.commands.unsetComment(threadId);
    },
    [editor],
  );

  const createNoteLevel = async (body: string) => {
    if (!contentId) return;
    try {
      const thread = await useCommentsStore.getState().create(contentId, { id: crypto.randomUUID(), body, anchor: null });
      useCommentsStore.getState().setActiveThread(thread.id);
      setComposing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't post the comment");
      throw e;
    }
  };

  if (!contentId) {
    return <div className="p-4 text-sm text-muted-foreground">Open a note to see its comments.</div>;
  }

  const total = threads?.length ?? 0;
  const shown = groups.noteLevel.length + groups.anchored.length + groups.orphaned.length;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-black/10 px-3 py-3 dark:border-white/10">
        <div className="flex items-center gap-1">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-current={filter === id ? "page" : undefined}
              className={cn(
                "h-8 rounded-lg px-2.5 text-xs font-medium transition-colors",
                filter === id
                  ? "bg-black/[0.06] text-foreground dark:bg-white/10"
                  : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
              )}
            >
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            title="Comment on this note"
            aria-label="Comment on this note"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              composing ? "bg-black/[0.06] text-foreground dark:bg-white/10" : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5",
            )}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <h3 className="shrink-0 px-3 pt-3 text-sm font-semibold text-gray-900 dark:text-white">Comments</h3>

      <div className="fade-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {composing && (
          <div className="rounded-md border border-gold-primary/40 p-2">
            <div className="mb-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">On this note</div>
            <CommentComposer autoFocus placeholder="Comment on the whole note…" onSubmit={createNoteLevel} onCancel={() => setComposing(false)} />
          </div>
        )}

        {error && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-600 dark:text-red-400">{error}</div>}

        {!loaded && !error && <div className="text-xs text-muted-foreground">Loading…</div>}

        {loaded && total === 0 && !composing && (
          <div className="rounded-md border border-dashed border-black/10 p-3 text-xs text-muted-foreground dark:border-white/10">
            No comments yet. Select some text and press <kbd className="rounded border border-black/10 px-1 dark:border-white/10">⌘⌥M</kbd>, or use the Comment button in the selection toolbar.
          </div>
        )}

        {loaded && total > 0 && shown === 0 && (
          <div className="text-xs text-muted-foreground">
            {filter === "open" ? "Everything is resolved." : filter === "resolved" ? "Nothing resolved yet." : "No comments."}
          </div>
        )}

        {groups.noteLevel.map((t) => (
          <ThreadCard key={t.id} threadId={t.id} contentId={contentId} mode="list" onThreadRemoved={dropMark} />
        ))}
        {groups.anchored.map((t) => (
          <ThreadCard key={t.id} threadId={t.id} contentId={contentId} mode="list" onJump={() => jump(t.id)} onThreadRemoved={dropMark} />
        ))}
        {groups.orphaned.length > 0 && (
          <div className="pt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Original text removed</div>
        )}
        {groups.orphaned.map((t) => (
          <ThreadCard key={t.id} threadId={t.id} contentId={contentId} mode="list" orphan onReanchor={() => reanchor(t.id)} onThreadRemoved={dropMark} />
        ))}
      </div>
    </div>
  );
}
