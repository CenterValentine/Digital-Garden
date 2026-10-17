"use client";

/**
 * Comment hover + click — the in-place thread card over a commented passage.
 *
 * Hover (mouse, 350 ms): the collapsed ThreadCard — who, when, the latest
 * comment, a Resolve button. Click: the same card pinned and expanded, with
 * the whole thread and a reply composer; Esc or a click elsewhere closes it.
 * On a coarse pointer there is no hover and a tap opens the Comments tab
 * instead (a popover under a software keyboard is unusable).
 *
 * A consumer of the shared hover card (lib/domain/editor/hover-card.ts). The
 * toolbelt's "View comment" and a sidebar jump ask for a pinned card through
 * the store's `openRequest`; this plugin answers for the editor that holds
 * the mark. Plan: COMMENTS-ANNOTATIONS-PLAN.md §5.3.
 */

import type { Editor } from "@tiptap/core";
import { PluginKey, type Plugin } from "@tiptap/pm/state";
import { createElement } from "react";
import { ThreadCard } from "@/components/content/comments/ThreadCard";
import { revealCommentThread } from "@/components/content/comments/reveal";
import { findThread, useCommentsStore } from "@/state/comments-store";
import { createHoverCardPlugin, type HoverCardController } from "../hover-card";
import { contentIdOfEditor } from "./comment-plugin";

export const commentHoverPluginKey = new PluginKey("commentHover");

const IS_COARSE_POINTER =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

export function createCommentHoverPlugin(editor: Editor): Plugin | null {
  let controller: HoverCardController | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastRequestNonce = 0;

  const threadIdOf = (el: HTMLElement) => el.getAttribute("data-comment")?.toLowerCase() ?? null;

  const plugin = createHoverCardPlugin(editor, {
    key: commentHoverPluginKey,
    selector: "[data-comment]",
    showDelayMs: 350,
    hideDelayMs: 220,
    editableOnly: false,
    placement: "top-start",
    offset: [0, 6],
    theme: "comment-thread",
    render(el, ctl, pinned) {
      const threadId = threadIdOf(el);
      const found = findThread(useCommentsStore.getState(), threadId);
      if (!threadId || !found) return null;
      return createElement(ThreadCard, {
        threadId,
        contentId: found.contentId,
        mode: pinned ? "expanded" : "collapsed",
        onClose: () => ctl.hide(),
        onExpand: () => ctl.pin(el),
        onOpenSidebar: () => {
          ctl.hide();
          revealCommentThread(found.contentId, threadId);
        },
        onHoldChange: (held) => ctl.hold(held),
      });
    },
    onShow(el, pinned) {
      const threadId = threadIdOf(el);
      if (!threadId) return;
      if (pinned) useCommentsStore.getState().setActiveThread(threadId);
      else useCommentsStore.getState().setHoverThread(threadId);
    },
    onHide(wasPinned) {
      const store = useCommentsStore.getState();
      store.setHoverThread(null);
      if (wasPinned) store.setActiveThread(null);
    },
    onClick(el) {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return "ignore";
      const threadId = threadIdOf(el);
      if (!threadId) return "ignore";
      if (IS_COARSE_POINTER) {
        const contentId = contentIdOfEditor(editor);
        if (contentId) revealCommentThread(contentId, threadId);
        return "ignore";
      }
      return "pin";
    },
    onReady(ctl) {
      controller = ctl;
      lastRequestNonce = useCommentsStore.getState().openRequest?.nonce ?? 0;
      unsubscribe = useCommentsStore.subscribe((state) => {
        const request = state.openRequest;
        if (!request || request.nonce === lastRequestNonce) return;
        const el = editor.view.dom.querySelector<HTMLElement>(`[data-comment="${request.threadId}"]`);
        if (!el) return; // another editor holds this thread
        lastRequestNonce = request.nonce;
        if (IS_COARSE_POINTER) {
          const contentId = contentIdOfEditor(editor);
          if (contentId) revealCommentThread(contentId, request.threadId);
          return;
        }
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        controller?.pin(el);
      });
    },
  });

  if (!plugin) return null;

  // Wrap the plugin's view so the store subscription is released with it.
  const originalView = plugin.spec.view;
  plugin.spec.view = (view) => {
    const pluginView = originalView?.(view);
    return {
      ...pluginView,
      destroy() {
        unsubscribe?.();
        unsubscribe = null;
        pluginView?.destroy?.();
      },
    };
  };
  return plugin;
}
