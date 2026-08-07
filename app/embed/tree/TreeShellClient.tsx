"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { ContextMenu } from "@/components/content/context-menu/ContextMenu";
import { fileTreeActionProvider } from "@/components/content/context-menu/file-tree-actions";
import { editorActionProvider } from "@/components/content/context-menu/editor-actions";
import { useSettingsStore } from "@/state/settings-store";
import { useWorkspaceStore } from "@/extensions/workplaces/state/workspace-store";
import { useContentStore } from "@/state/content-store";

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(COLOR_SCHEME_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemPrefersDark() {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

/**
 * Tree-only shell for the right-side ON-PAGE OVERLAY (PANEL-OVERLAY-PLAN Phase 1).
 *
 * This is a SEPARATE partitioned iframe from the side panel — it renders ONLY the
 * file tree (LeftSidebar). It shares nothing with the panel's stores by JS
 * context; the "open a file → show it in the sidebar" wire is a cross-iframe hop
 * through the extension background broker (Phase 1b), not a shared store.
 *
 * Theme seeding mirrors PanelShellClient: the partitioned iframe's
 * localStorage["notes:settings"] is empty, so the pre-hydration `.dark` script
 * never fires — we resolve the server preference (page.tsx) and seed both the
 * `.dark` class (Tailwind variants) and the settings store (JS-computed styles).
 */
export function TreeShellClient({
  themePreference = "system",
}: {
  themePreference?: "light" | "dark" | "system";
}) {
  const systemPrefersDark = useSyncExternalStore(
    subscribeToColorScheme,
    getSystemPrefersDark,
    () => false,
  );
  const isDark =
    themePreference === "system"
      ? systemPrefersDark
      : themePreference === "dark";

  useEffect(() => {
    useSettingsStore.setState((state) => ({
      ui: { ...state.ui, theme: isDark ? "dark" : "light" },
    }));
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Announce readiness to the overlay host (extension), matching the panel's
  // versioned envelope so the host can gate on origin + version.
  useEffect(() => {
    window.parent.postMessage(
      { v: 1, source: "dg-tree-embed", type: "ready" },
      "*",
    );
  }, []);

  // Hydrate the workspace store. LeftSidebarContent gates its FIRST tree fetch on
  // `workspaceStore.hasLoadedOnce` — in the full app / panel the workplaces shell
  // controller fires this, but the bare tree shell mounts no shell controllers,
  // so without this the tree sits on skeletons forever.
  useEffect(() => {
    void useWorkspaceStore.getState().loadWorkspaces();
  }, []);

  // ── open-content wire (PANEL-OVERLAY-PLAN Phase 1b) ──
  // A file-click sets content-store's selection. Since this tree lives in its own
  // partitioned iframe (no workspace to render into), relay the selection to the
  // overlay host → background → side panel, where it opens by default. The local
  // store update is harmless (nothing here consumes it).
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const selectedContentType = useContentStore((s) => s.selectedContentType);
  const lastOpenedRef = useRef<string | null>(null);
  const openWatchReadyRef = useRef(false);
  useEffect(() => {
    // Skip the hydrated initial value so a persisted selection doesn't auto-open
    // on load — only user clicks after mount should open in the panel.
    if (!openWatchReadyRef.current) {
      openWatchReadyRef.current = true;
      lastOpenedRef.current = selectedContentId;
      return;
    }
    if (!selectedContentId || selectedContentId === lastOpenedRef.current) return;
    lastOpenedRef.current = selectedContentId;
    window.parent.postMessage(
      {
        v: 1,
        source: "dg-tree-embed",
        type: "open-content",
        payload: { contentId: selectedContentId, contentType: selectedContentType },
      },
      "*",
    );
  }, [selectedContentId, selectedContentType]);

  // ── workspace sync (sidebar → tree overlay) ──
  // The workspace selector lives ONLY in the sidebar now (owner). The tree here
  // is workspace-scoped (LeftSidebarContent fetches by activeWorkspaceId), so a
  // sidebar switch must filter this tree — including view-workspaces. They're
  // separate partitioned iframes, so the switch carries through the background;
  // we apply it via the SAME activateWorkspace() (scope + view filtering). The
  // broadcast side stays harmless (no local selector to fire it) so re-adding a
  // selector later would still mirror; the guard prevents an applied change from
  // echoing back.
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const applyingRemoteWsRef = useRef(false);
  const lastWsRef = useRef<string | null>(null);
  useEffect(() => {
    if (applyingRemoteWsRef.current) {
      applyingRemoteWsRef.current = false;
      lastWsRef.current = activeWorkspaceId;
      return;
    }
    if (!activeWorkspaceId || activeWorkspaceId === lastWsRef.current) return;
    lastWsRef.current = activeWorkspaceId;
    window.parent.postMessage(
      {
        v: 1,
        source: "dg-tree-embed",
        type: "workspace-changed",
        payload: { workspaceId: activeWorkspaceId },
      },
      "*",
    );
  }, [activeWorkspaceId]);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.v !== 1 || data.source !== "dg-tree-host") return;
      if (data.type === "workspace-changed" && data.payload?.workspaceId) {
        const id = String(data.payload.workspaceId);
        if (useWorkspaceStore.getState().activeWorkspaceId === id) return;
        applyingRemoteWsRef.current = true;
        void useWorkspaceStore.getState().activateWorkspace(id);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      className={isDark ? "dark" : undefined}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <DndWrapper>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* LeftSidebar's root is h-full; it needs a DEFINITE height to resolve
              against, so fill an absolutely-positioned box (same treatment the
              panel gives the tree). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <LeftSidebar />
          </div>
        </div>
      </DndWrapper>

      {/* The app mounts the global context menu in ResizablePanels, which this
          overlay doesn't use; without it right-click falls through to the
          browser's native menu. Portals to document.body, positions against the
          iframe viewport. */}
      <ContextMenu
        actionProviders={{
          "file-tree": fileTreeActionProvider,
          "main-editor": editorActionProvider,
        }}
      />
    </div>
  );
}
