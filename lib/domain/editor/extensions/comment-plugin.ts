"use client";

/**
 * Comment decorations — what the editor draws OVER the `comment` marks.
 *
 * The mark carries only a thread id; everything the reader sees about a
 * thread's state comes from the comments store and is applied here as
 * ProseMirror decorations, so resolving, hovering or selecting a thread
 * never touches the shared document:
 *
 *   - `comment-mark--active`    the thread being viewed in a pinned card (ring)
 *   - `comment-mark--resolved`  resolved (quiet unless "Show resolved"), or
 *                               a mark whose thread the server does not know
 *                               (an orphan: deleted elsewhere, pasted in —
 *                               invisible, never an error)
 *   - `comment-mark--pending`   the composer is open on this selection and
 *                               nothing has been written yet; the range maps
 *                               across collaborators' edits while typing
 *
 * A mark whose id the server does not know while the note IS loaded is the
 * "new thread arrived through Y.js" signal: the plugin asks the store to
 * reload the note quietly (throttled), so collaborators see a thread without
 * polling. Plan: COMMENTS-ANNOTATIONS-PLAN.md §7.
 */

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useCommentsStore, knownThreadIds } from "@/state/comments-store";
import { useContentAnchorStore } from "@/state/content-anchor-store";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { COMMENT_ANCHOR_KIND } from "@/lib/domain/content/comment-link-anchors";
import { collectCommentRanges, type CommentRange } from "./comment-mark";

export interface CommentPluginState {
  pending: CommentRange | null;
  decorations: DecorationSet;
}

type CommentPluginMeta = { pending: CommentRange | null } | { refresh: true };

export const commentPluginKey = new PluginKey<CommentPluginState>("commentThreads");

const FETCH_THROTTLE_MS = 5_000;
const lastFetch = new Map<string, number>();

/** Ask the store for this note's threads, at most once per throttle window. */
export function requestThreadsQuietly(contentId: string): void {
  const last = lastFetch.get(contentId) ?? 0;
  if (Date.now() - last < FETCH_THROTTLE_MS) return;
  lastFetch.set(contentId, Date.now());
  void useCommentsStore.getState().load(contentId, { quiet: true });
}

/**
 * The note an editor instance renders: the instance registry first, else the
 * `data-content-id` MarkdownEditor puts on the editor's wrapper (the registry
 * keys one editor per content id, so the same note open in two panes has one
 * unregistered editor).
 */
export function contentIdOfEditor(editor: Editor): string | null {
  const entry = Object.entries(useEditorInstanceStore.getState().editorsByContentId).find(([, e]) => e === editor);
  if (entry) return entry[0];
  if (editor.isDestroyed) return null;
  return editor.view.dom.closest<HTMLElement>("[data-content-id]")?.getAttribute("data-content-id") ?? null;
}

/**
 * Orphan cleanup. A mark whose thread the server does not have (deleted
 * while this editor was closed, pasted from another note, a restored old
 * version) renders quiet, but it still lives in the document and the source
 * view. It is removed — conservatively — once ALL of these hold:
 *   - it has been unknown for ORPHAN_GRACE_MS (a thread created by someone
 *     else a moment ago is not an orphan; its reload lands long before);
 *   - a FRESH fetch, made at removal time, still does not list it;
 *   - this editor is editable (a view-only connection cannot write).
 * A fetch failure removes nothing: unknown-after-failure is not unknown.
 */
const ORPHAN_GRACE_MS = 60_000;
const orphanFirstSeen = new Map<string, number>();
const orphanTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleOrphanRemoval(editor: Editor, contentId: string, threadId: string): void {
  const key = `${contentId}:${threadId}`;
  const now = Date.now();
  if (!orphanFirstSeen.has(key)) orphanFirstSeen.set(key, now);
  if (orphanTimers.has(key)) return;
  const wait = Math.max(0, orphanFirstSeen.get(key)! + ORPHAN_GRACE_MS - now);
  orphanTimers.set(
    key,
    setTimeout(() => {
      orphanTimers.delete(key);
      if (editor.isDestroyed || !editor.isEditable) return;
      const store = useCommentsStore.getState();
      const before = store.loadedAt[contentId] ?? 0;
      void store
        .load(contentId, { quiet: true })
        .then(() => {
          const state = useCommentsStore.getState();
          const loadedAfter = (state.loadedAt[contentId] ?? 0) > before || (state.loadedAt[contentId] ?? 0) >= Date.now() - 5_000;
          if (!loadedAfter || editor.isDestroyed || !editor.isEditable) return;
          const stillUnknown = !(state.threadsByContentId[contentId] ?? []).some((t) => t.id === threadId);
          if (stillUnknown) editor.commands.unsetComment(threadId);
          orphanFirstSeen.delete(key);
        })
        .catch(() => {
          /* unknown-after-failure is not unknown */
        });
    }, wait),
  );
}

/** The thread exists again (reload caught up): forget any orphan bookkeeping. */
function clearOrphan(contentId: string, threadId: string): void {
  const key = `${contentId}:${threadId}`;
  orphanFirstSeen.delete(key);
  const timer = orphanTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    orphanTimers.delete(key);
  }
}

/**
 * A thread is gone: take its anchor out of every editable editor that holds
 * it. Called by the card that deleted the thread (pinned or in the tab) —
 * Y.js carries the removal to every other pane and collaborator. Editors a
 * registry miss leaves out are covered by the registered one sharing the
 * same Y.Doc.
 */
export function removeCommentMarkEverywhere(threadId: string): void {
  for (const editor of Object.values(useEditorInstanceStore.getState().editorsByContentId)) {
    if (!editor || editor.isDestroyed || !editor.isEditable) continue;
    editor.commands.unsetComment(threadId);
  }
}

export function setPendingCommentRange(editor: Editor, range: CommentRange | null): void {
  if (editor.isDestroyed) return;
  const meta: CommentPluginMeta = { pending: range };
  editor.view.dispatch(editor.state.tr.setMeta(commentPluginKey, meta));
}

export function pendingCommentRange(editor: Editor): CommentRange | null {
  return commentPluginKey.getState(editor.state)?.pending ?? null;
}

function buildDecorations(doc: PMNode, pending: CommentRange | null, contentId: string | null, editor: Editor | null): DecorationSet {
  const store = useCommentsStore.getState();
  const known = knownThreadIds(store, contentId);
  const threads = contentId ? store.threadsByContentId[contentId] ?? [] : [];
  const byId = new Map(threads.map((t) => [t.id, t]));
  const decorations: Decoration[] = [];
  let sawUnknown = false;
  const anchored = collectCommentRanges(doc);

  // A document that carries comment marks needs its threads: the hover card,
  // the rail badge and orphan detection all read the store, and nothing else
  // fetches until the Comments tab is opened. (Found on the owner's first
  // smoke: a fresh page load, a hover, no card.)
  if (anchored.size > 0 && !known && contentId) requestThreadsQuietly(contentId);

  for (const [threadId, ranges] of anchored) {
    const thread = byId.get(threadId);
    const classes: string[] = [];
    if (known && !thread) {
      sawUnknown = true;
      classes.push("comment-mark--resolved");
      if (contentId && editor) scheduleOrphanRemoval(editor, contentId, threadId);
    } else if (known && thread && contentId) {
      clearOrphan(contentId, threadId);
    }
    if (thread?.resolvedAt && !store.showResolved && !classes.length) {
      classes.push("comment-mark--resolved");
    }
    // Hover is CSS (`:hover`), never a decoration: redrawing the span under
    // the pointer detaches the node the browser is tracking, which fires a
    // mouseout that hid the card and made the second hover look dead.
    if (store.activeThreadId === threadId) classes.push("comment-mark--active");
    if (classes.length === 0) continue;
    const className = classes.join(" ");
    for (const range of ranges) decorations.push(Decoration.inline(range.from, range.to, { class: className }));
  }

  if (pending && pending.from < pending.to) {
    decorations.push(Decoration.inline(pending.from, pending.to, { class: "comment-mark--pending" }));
  }

  // A mark whose thread the store does not know, on a note it HAS loaded, is
  // a thread that arrived through Y.js from another collaborator.
  if (sawUnknown && contentId) requestThreadsQuietly(contentId);

  return DecorationSet.create(doc, decorations);
}

export function createCommentDecorationPlugin(editor: Editor): Plugin<CommentPluginState> {
  const contentIdFor = () => contentIdOfEditor(editor);

  return new Plugin<CommentPluginState>({
    key: commentPluginKey,
    state: {
      init: (_config, state: EditorState) => ({
        pending: null,
        decorations: buildDecorations(state.doc, null, contentIdFor(), editor),
      }),
      apply: (tr: Transaction, prev: CommentPluginState) => {
        const meta = tr.getMeta(commentPluginKey) as CommentPluginMeta | undefined;
        let pending = prev.pending;
        if (meta && "pending" in meta) {
          pending = meta.pending;
        } else if (pending && tr.docChanged) {
          const from = tr.mapping.map(pending.from, 1);
          const to = tr.mapping.map(pending.to, -1);
          pending = from < to ? { from, to } : null;
        }
        if (!tr.docChanged && !meta && pending === prev.pending) return prev;
        return { pending, decorations: buildDecorations(tr.doc, pending, contentIdFor(), editor) };
      },
    },
    props: {
      decorations(state) {
        return commentPluginKey.getState(state)?.decorations ?? null;
      },
    },
    view(view) {
      // A pending `comment:<threadId>` link anchor for this note (a wiki-link
      // click, a notification, a deep link): once the document holds that
      // mark, take the anchor and ask the hover plugin to open the thread
      // in place. Checked after each update because the mark may arrive
      // with the document, after the editor was created.
      const tryAnchor = () => {
        const contentId = contentIdFor();
        if (!contentId) return;
        const pending = useContentAnchorStore.getState().pending[contentId];
        if (!pending || pending.kind !== COMMENT_ANCHOR_KIND) return;
        const threadId = pending.id.toLowerCase();
        if (!view.dom.querySelector(`[data-comment="${threadId}"]`)) return;
        useContentAnchorStore.getState().take(contentId);
        useCommentsStore.getState().requestOpen(threadId);
      };
      tryAnchor();
      const unsubscribeAnchor = useContentAnchorStore.subscribe(() => tryAnchor());

      // Store changes (a reply arrived, a thread was resolved, the hover
      // moved) redraw without a document change.
      let prevSlice: unknown[] = [];
      const unsubscribe = useCommentsStore.subscribe((state) => {
        const contentId = contentIdFor();
        const slice = [
          state.activeThreadId,
          state.showResolved,
          contentId ? state.threadsByContentId[contentId] : null,
          contentId ? state.loadedAt[contentId] : null,
        ];
        if (slice.every((v, i) => v === prevSlice[i])) return;
        prevSlice = slice;
        if (editor.isDestroyed) return;
        const meta: CommentPluginMeta = { refresh: true };
        view.dispatch(view.state.tr.setMeta(commentPluginKey, meta));
      });
      return {
        update: (_view, prevState) => {
          if (view.state.doc !== prevState.doc) tryAnchor();
        },
        destroy: () => {
          unsubscribe();
          unsubscribeAnchor();
        },
      };
    },
  });
}
