"use client";

import { usePathname } from "next/navigation";
import type { WorkspaceLayoutMode } from "@/state/content-store";
import { useIsPhone, useIsLandscape } from "./useViewport";

/**
 * useProjectedLayout — layout-intent spec §4/§8-P3.
 *
 * The store's `layoutMode` is INTENT (Class I, synced). What a surface
 * actually renders is this pure projection of it — never written back:
 *
 * - Extension single-content surfaces (/embed/content overlay,
 *   /extension-overlay): project to `single` — they are one-document viewers.
 * - Extension side panel (/embed/panel, a full mini-DG shell per
 *   BROWSER-REACH B1): only the R7 rule applies — quad is banned in
 *   extensions, so quad projects to dual-vertical; other modes render as-is.
 * - Focus route (/content/focus/*): projects to `single`. This replaces the
 *   old restoreWorkspace({layoutMode:"single"}) ghost-write (spec §6.2).
 * - Phones: the one 2-pane split follows device orientation — side-by-side
 *   (dual-vertical) renders stacked in portrait; stacked renders side-by-side
 *   in landscape. Replaces the deleted setLayoutMode coercion effect
 *   (spec §6.1). Quad passes through per owner decision D2 ("we're going for
 *   it") — if quad is ever chopped on phones, THIS is the single flag point:
 *   add `if (intent === "quad") return orientation dual` here.
 * - Everything else (desktop, tablets any orientation): identity.
 */
export function useProjectedLayout(
  intent: WorkspaceLayoutMode,
): WorkspaceLayoutMode {
  const pathname = usePathname();
  const isPhone = useIsPhone();
  const isLandscape = useIsLandscape();

  const isSingleContentEmbed =
    pathname?.startsWith("/embed/content") ||
    pathname?.startsWith("/extension-overlay");
  if (isSingleContentEmbed) return "single";

  const isPanelEmbed = pathname?.startsWith("/embed/");
  if (isPanelEmbed) {
    return intent === "quad" ? "dual-vertical" : intent;
  }

  if (pathname?.includes("/content/focus/")) return "single";

  if (isPhone) {
    if (intent === "dual-vertical" && !isLandscape) return "dual-horizontal";
    if (intent === "dual-horizontal" && isLandscape) return "dual-vertical";
  }

  return intent;
}
