"use client";

/**
 * Spring-loaded tabs during an editor drag: DOM drag events in, tab switches
 * out (rules: lib/features/content/spring-tabs.ts). Mounted once, by the
 * main panel workspace.
 *
 * Listens on the document in the capture phase and never prevents or stops
 * an event. Only drags that started in a note's editor spring tabs (the file
 * tree's drags onto the tab strip already open content there).
 *
 * The end of a drag is caught three ways, since the editor it started in can
 * be gone by then (its pane switched tabs, so its `dragend` never reaches the
 * document): the drop, a `dragend` that does arrive, or the first pointer
 * event after the drag — browsers send none while one is in progress.
 */
import { useEffect } from "react";
import { useContentStore, type WorkspacePaneId } from "@/state/content-store";
import { useEditorDragStore } from "@/state/editor-drag-store";
import {
  SPRING_TAB_DELAY_MS,
  restoreAfterSpring,
  springsTab,
  startSpringTabSession,
  type SpringTabSession,
} from "@/lib/features/content/spring-tabs";

export function useSpringTabs(): void {
  useEffect(() => {
    let session: SpringTabSession | null = null;
    let waitingOn: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // A drag doesn't trigger :hover, so the tab being waited on is given the
    // hover look through a data attribute — the cue to hold still until it
    // opens (owner, 2026-10-06). MainPanelHeader mirrors each hover style.
    let cued: HTMLElement | null = null;
    const cue = (tab: HTMLElement | null) => {
      if (cued === tab) return;
      if (cued) delete cued.dataset.springHover;
      cued = tab;
      if (tab) tab.dataset.springHover = "on";
    };

    const stopWaiting = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      waitingOn = null;
      cue(null);
    };

    const finish = () => {
      stopWaiting();
      if (!session) return;
      const ended = session;
      session = null;
      const store = useContentStore.getState();
      const restore = restoreAfterSpring(ended, store);
      if (!restore) return;
      store.activateContentTab(restore.tabId);
      if (restore.focusPaneId) {
        useContentStore.getState().focusPane(restore.focusPaneId as WorkspacePaneId);
      }
    };

    const onOver = (event: DragEvent) => {
      const drag = useEditorDragStore.getState().drag;
      if (!drag && !session) return;
      if (!session) session = startSpringTabSession(useContentStore.getState(), drag?.noteId ?? null);
      const tab =
        event.target instanceof Element
          ? (event.target.closest("[data-tab-id]") as HTMLElement | null)
          : null;
      const tabId = tab?.dataset.tabId ?? null;
      const paneId = tab?.dataset.paneId ?? null;
      const target = springsTab(useContentStore.getState(), tabId, paneId) ? tabId : null;
      if (target === waitingOn) return;
      stopWaiting();
      if (!target) return;
      waitingOn = target;
      cue(tab);
      timer = setTimeout(() => {
        timer = null;
        waitingOn = null;
        cue(null);
        useContentStore.getState().activateContentTab(target);
      }, SPRING_TAB_DELAY_MS);
    };

    // After the drop's own handlers (the editor that takes it reads the drag).
    const onDrop = () => {
      if (session) setTimeout(finish, 0);
    };
    const onEnd = () => {
      if (session) setTimeout(finish, 0);
    };

    document.addEventListener("dragover", onOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", onEnd, true);
    document.addEventListener("pointermove", onEnd, true);
    document.addEventListener("pointerdown", onEnd, true);
    return () => {
      document.removeEventListener("dragover", onOver, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("dragend", onEnd, true);
      document.removeEventListener("pointermove", onEnd, true);
      document.removeEventListener("pointerdown", onEnd, true);
      stopWaiting();
    };
  }, []);
}
