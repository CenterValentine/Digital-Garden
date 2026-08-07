"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DndWrapper } from "@/components/content/DndWrapper";
import { LeftSidebar } from "@/components/content/LeftSidebar";
import { ContextMenu } from "@/components/content/context-menu/ContextMenu";
import { fileTreeActionProvider } from "@/components/content/context-menu/file-tree-actions";
import { editorActionProvider } from "@/components/content/context-menu/editor-actions";
import { useSettingsStore } from "@/state/settings-store";

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
