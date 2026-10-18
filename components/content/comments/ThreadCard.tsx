"use client";

/**
 * One thread, three hosts — the same card rendered as:
 *   - `collapsed`  the hover hint over a passage: who · when · the latest
 *                  comment (two lines) · reply count · Resolve
 *   - `expanded`   the pinned popover: every comment, a reply composer,
 *                  Resolve / Reopen, Open in sidebar, Delete
 *   - `list`       a row in the Comments tab: the quoted passage first
 *                  (click → jump to it), then the collapsed summary, which
 *                  expands in place
 *
 * One place to style, one place to fix. Chrome follows the link-view
 * chooser (it sits ON the page, so it reads as part of it, not as a tool).
 * The card reads its thread from the comments store, so a reply arriving
 * while it is open shows without the host re-rendering it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquare, PanelRight, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import type { CommentDto, CommentThreadDto } from "@/lib/domain/comments/types";
import { useCommentsStore } from "@/state/comments-store";
import { removeCommentMarkEverywhere } from "@/lib/domain/editor/extensions/comment-plugin";
import { useCurrentUser } from "@/components/common/use-current-user";
import { CommentComposer, MENTION_TOKEN_RE } from "./CommentComposer";

export type ThreadCardMode = "collapsed" | "expanded" | "list";

/** A body with its `@username`s set in the accent color. */
function renderBody(body: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    const index = (match.index ?? 0) + match[1].length;
    if (index > last) out.push(body.slice(last, index));
    out.push(
      <span key={key++} className="font-medium text-gold-primary">
        @{match[2]}
      </span>,
    );
    last = index + match[2].length + 1;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export interface ThreadCardProps {
  threadId: string;
  contentId: string;
  mode: ThreadCardMode;
  /** list mode: the thread's mark is gone from the document. */
  orphan?: boolean;
  onClose?: () => void;
  /** collapsed → expanded (the hover card pins itself). */
  onExpand?: () => void;
  onOpenSidebar?: () => void;
  /** list mode: scroll the editor to the passage. */
  onJump?: () => void;
  /** list mode, orphan: anchor the thread to the current selection. */
  onReanchor?: () => void;
  /** A composer inside the card has focus — the host should stay open. */
  onHoldChange?: (held: boolean) => void;
  /** When the thread was deleted or emptied, so the host can drop the mark. */
  onThreadRemoved?: (threadId: string) => void;
  className?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-gold-primary/50 bg-gold-primary/20 font-semibold uppercase text-gold-primary",
        small ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]",
      )}
    >
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

function latestLive(thread: CommentThreadDto): CommentDto | null {
  for (let i = thread.comments.length - 1; i >= 0; i -= 1) {
    if (!thread.comments[i].deletedAt) return thread.comments[i];
  }
  return thread.comments[thread.comments.length - 1] ?? null;
}

const CARD_CHROME =
  "rounded-lg border border-black/10 bg-white text-[13px] text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#1a1a1a] dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]";

const ICON_BUTTON =
  "rounded p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 disabled:opacity-40";

export function ThreadCard(props: ThreadCardProps) {
  const { threadId, contentId, mode, orphan, onClose, onExpand, onOpenSidebar, onJump, onReanchor, onHoldChange, onThreadRemoved, className } = props;
  const thread = useCommentsStore((s) => (s.threadsByContentId[contentId] ?? []).find((t) => t.id === threadId) ?? null);
  const isActive = useCommentsStore((s) => s.activeThreadId === threadId);
  const me = useCurrentUser();
  const [listExpanded, setListExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The sidebar scrolls the active thread's row into view.
  useEffect(() => {
    if (mode === "list" && isActive) {
      rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      setListExpanded(true);
    }
  }, [isActive, mode]);

  const run = useCallback(
    async (work: () => Promise<unknown>, failure: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await work();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : failure);
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  if (!thread) return null;

  const resolved = Boolean(thread.resolvedAt);
  const first = thread.comments[0] ?? null;
  const latest = latestLive(thread);
  const replies = Math.max(0, thread.comments.filter((c) => !c.deletedAt).length - 1);
  const mine = Boolean(me && thread.createdBy.id === me.id);
  const store = useCommentsStore.getState();

  const toggleResolved = () =>
    run(() => store.setResolved(contentId, threadId, !resolved), resolved ? "Couldn't reopen" : "Couldn't resolve");

  // The anchor goes with the thread, from every open editor (the owner's
  // first smoke deleted from the pinned card and the gold passage stayed —
  // only the tab's delete had removed the mark).
  const deleteThread = () =>
    run(async () => {
      await store.removeThread(contentId, threadId);
      removeCommentMarkEverywhere(threadId);
      onThreadRemoved?.(threadId);
      onClose?.();
    }, "Couldn't delete the thread");

  const reply = async (body: string, mentions: string[]) => {
    try {
      await store.reply(contentId, threadId, body, mentions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't post the reply");
      throw error;
    }
  };

  const editComment = async (commentId: string, body: string) => {
    try {
      await store.editComment(contentId, commentId, body);
      setEditingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the edit");
      throw error;
    }
  };

  const deleteComment = (commentId: string) =>
    run(async () => {
      const result = await store.deleteComment(contentId, threadId, commentId);
      if (result.threadDeleted) {
        removeCommentMarkEverywhere(threadId);
        onThreadRemoved?.(threadId);
        onClose?.();
      }
    }, "Couldn't delete the comment");

  // ── Pieces ─────────────────────────────────────────────────────────────

  const header = (author: string, at: string, extra?: React.ReactNode) => (
    <div className="flex items-center gap-2">
      <Avatar name={author} />
      <span className="min-w-0 flex-1 truncate font-medium">{author}</span>
      <span className="shrink-0 text-xs text-muted-foreground" title={new Date(at).toLocaleString()}>
        {relativeTime(at)}
      </span>
      {extra}
    </div>
  );

  const resolveButton = (
    <button
      type="button"
      onClick={toggleResolved}
      disabled={busy}
      title={resolved ? "Reopen" : "Resolve"}
      aria-label={resolved ? "Reopen thread" : "Resolve thread"}
      className={cn(ICON_BUTTON, resolved && "text-gold-primary")}
    >
      {resolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
    </button>
  );

  const summary = (
    <>
      {header(first?.author.username ?? "?", thread.createdAt, resolveButton)}
      {latest && (
        <p className={cn("mt-1 line-clamp-2 whitespace-pre-wrap break-words pl-8 text-foreground/90", latest.deletedAt && "italic text-muted-foreground")}>
          {latest.deletedAt ? "Comment deleted" : renderBody(latest.body)}
        </p>
      )}
      <div className="mt-1 flex items-center gap-3 pl-8 text-xs text-muted-foreground">
        {replies > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {replies} {replies === 1 ? "reply" : "replies"}
          </span>
        )}
        {resolved && <span className="text-gold-primary">Resolved</span>}
      </div>
    </>
  );

  const commentRow = (comment: CommentDto, index: number) => {
    const own = Boolean(me && comment.author.id === me.id);
    const deleted = Boolean(comment.deletedAt);
    return (
      <div key={comment.id} className={cn("group/comment", index > 0 && "mt-3 border-t border-black/5 pt-3 dark:border-white/5")}>
        {header(
          comment.author.username,
          comment.createdAt,
          own && !deleted ? (
            <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/comment:opacity-100 focus-within:opacity-100">
              <button type="button" onClick={() => setEditingId(comment.id)} title="Edit" aria-label="Edit comment" className={ICON_BUTTON}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => deleteComment(comment.id)} disabled={busy} title="Delete" aria-label="Delete comment" className={ICON_BUTTON}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null,
        )}
        {editingId === comment.id ? (
          <CommentComposer
            className="mt-1 pl-8"
            initialValue={comment.body}
            submitLabel="Save"
            autoFocus
            contentId={contentId}
            onSubmit={(body) => editComment(comment.id, body)}
            onCancel={() => setEditingId(null)}
            onFocusChange={onHoldChange}
          />
        ) : (
          <p className={cn("mt-1 whitespace-pre-wrap break-words pl-8 text-foreground/90", deleted && "italic text-muted-foreground")}>
            {deleted ? "Comment deleted" : renderBody(comment.body)}
            {comment.editedAt && !deleted && <span className="ml-1 text-xs text-muted-foreground">(edited)</span>}
          </p>
        )}
      </div>
    );
  };

  const expandedBody = (
    <>
      {resolved && (
        <div className="mb-2 flex items-center justify-between rounded bg-gold-primary/10 px-2 py-1 text-xs text-gold-primary">
          <span>Resolved</span>
          <button type="button" onClick={toggleResolved} disabled={busy} className="font-medium underline-offset-2 hover:underline">
            Reopen
          </button>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto pr-1">{thread.comments.map(commentRow)}</div>
      <CommentComposer
        className="mt-3"
        placeholder="Reply…"
        submitLabel="Reply"
        autoFocus={mode === "expanded"}
        contentId={contentId}
        onSubmit={reply}
        onFocusChange={onHoldChange}
      />
      <div className="mt-2 flex items-center justify-between border-t border-black/5 pt-2 dark:border-white/5">
        <div className="flex items-center gap-1">
          {!resolved && (
            <button type="button" onClick={toggleResolved} disabled={busy} aria-label="Resolve thread" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10">
              <Check className="h-3.5 w-3.5" /> Resolve
            </button>
          )}
          {onOpenSidebar && (
            <button type="button" onClick={onOpenSidebar} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10">
              <PanelRight className="h-3.5 w-3.5" /> Open in sidebar
            </button>
          )}
        </div>
        {mine && (
          <button type="button" onClick={deleteThread} disabled={busy} title="Delete thread" aria-label="Delete thread" className={ICON_BUTTON}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );

  // ── Modes ──────────────────────────────────────────────────────────────

  if (mode === "collapsed") {
    return (
      <div
        ref={rootRef}
        role="button"
        tabIndex={0}
        onClick={onExpand}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onExpand?.();
          }
        }}
        className={cn(CARD_CHROME, "w-72 cursor-pointer p-2.5", className)}
      >
        {summary}
      </div>
    );
  }

  if (mode === "expanded") {
    return (
      <div ref={rootRef} className={cn(CARD_CHROME, "w-80 p-3", className)}>
        {expandedBody}
      </div>
    );
  }

  // list
  return (
    <div
      ref={rootRef}
      className={cn(
        "group rounded-md border p-2 text-[13px] transition-colors",
        isActive ? "border-gold-primary/60 bg-gold-primary/5" : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20",
        resolved && !isActive && "opacity-70",
        className,
      )}
    >
      {thread.anchor ? (
        <button
          type="button"
          onClick={orphan ? undefined : onJump}
          disabled={orphan}
          title={orphan ? "The commented text is no longer in the note" : "Go to the passage"}
          className={cn(
            "mb-2 block w-full border-l-2 pl-2 text-left text-xs italic leading-snug text-muted-foreground",
            orphan ? "border-black/15 line-through dark:border-white/15" : "border-gold-primary hover:text-foreground",
          )}
        >
          <span className="line-clamp-2">“{thread.anchor.quote}”</span>
        </button>
      ) : (
        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">On this note</div>
      )}
      {orphan && (
        <div className="mb-2 flex items-center justify-between rounded bg-black/[0.04] px-2 py-1 text-xs text-muted-foreground dark:bg-white/5">
          <span>Original text removed</span>
          {onReanchor && !resolved && (
            <button type="button" onClick={onReanchor} className="font-medium text-gold-primary underline-offset-2 hover:underline">
              Re-anchor to selection
            </button>
          )}
        </div>
      )}
      {listExpanded ? (
        <>
          {expandedBody}
          <button type="button" onClick={() => setListExpanded(false)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
            Collapse
          </button>
        </>
      ) : (
        <div role="button" tabIndex={0} onClick={() => setListExpanded(true)} onKeyDown={(e) => { if (e.key === "Enter") setListExpanded(true); }} className="cursor-pointer">
          {summary}
        </div>
      )}
    </div>
  );
}
