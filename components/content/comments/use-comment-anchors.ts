"use client";

/**
 * Where each thread is in the live document: threadId → merged ranges, from
 * the editor's `comment` marks, refreshed (debounced) on every document
 * change. The Comments tab orders its list by this; a thread with no range
 * is an orphan ("Original text removed").
 *
 * The editor is an external store: `useSyncExternalStore` subscribes to its
 * transactions and snapshots the document node (a new identity per change),
 * so the ranges are recomputed only when the document actually changed —
 * and never from inside an effect (the React Compiler's cascading-render rule).
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { collectCommentRanges, type CommentRange } from "@/lib/domain/editor/extensions/comment-mark";

const EMPTY: Map<string, CommentRange[]> = new Map();
const DEBOUNCE_MS = 150;

export function useCommentAnchors(editor: Editor | null): Map<string, CommentRange[]> {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!editor || editor.isDestroyed) return () => {};
      let timer: number | null = null;
      const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
        if (!transaction.docChanged || timer !== null) return;
        timer = window.setTimeout(() => {
          timer = null;
          onChange();
        }, DEBOUNCE_MS);
      };
      editor.on("transaction", onTransaction);
      return () => {
        editor.off("transaction", onTransaction);
        if (timer !== null) window.clearTimeout(timer);
      };
    },
    [editor],
  );

  const getSnapshot = useCallback((): PMNode | null => (editor && !editor.isDestroyed ? editor.state.doc : null), [editor]);
  const doc = useSyncExternalStore(subscribe, getSnapshot, () => null);

  return useMemo(() => (doc ? collectCommentRanges(doc) : EMPTY), [doc]);
}
