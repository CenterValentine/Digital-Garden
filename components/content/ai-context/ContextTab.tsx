/**
 * Context sidebar tab — the per-node context HUB (restructured 2026-07-16).
 *
 * One tab, three sub-tabs: Links (backlinks), Tags, and AI (the agentic
 * metadata doc). Layout mirrors the inbox left-panel navigator — a row of
 * rounded icon buttons inside a bordered header (no section title above it),
 * with the active sub-tab's label BENEATH the divider line. All three
 * sub-tabs are CORE surfaces — the AI context layer graduated out of the
 * studio extension (FOLDER-CONTEXT-CAPSULE-PLAN Phase 0/3), so none of them
 * follow extension enablement.
 */

"use client";

import { useState } from "react";
import { BrainCircuit, Link as LinkIcon, Tag as TagIcon } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { useContentStore } from "@/state/content-store";
import { BacklinksPanel } from "@/components/content/BacklinksPanel";
import { TagsPanel } from "@/components/content/TagsPanel";
import { ContextAiPanel } from "./ContextAiPanel";

type ContextSubTab = "links" | "tags" | "ai";

// AI Context leads (user direction 2026-07-16). BrainCircuit, not sparkles:
// sparkles is reserved for generate ACTIONS, never surface identity.
// BrainCircuit renders a size up — its detail muddies at 16px; the shared
// 32px button container is what keeps the rail's framing consistent.
const SUB_TABS: Array<{
  id: ContextSubTab;
  label: string;
  icon: typeof LinkIcon;
  iconClassName: string;
}> = [
  { id: "ai", label: "AI Context", icon: BrainCircuit, iconClassName: "h-5 w-5" },
  { id: "links", label: "Links", icon: LinkIcon, iconClassName: "h-4 w-4" },
  { id: "tags", label: "Tags", icon: TagIcon, iconClassName: "h-4 w-4" },
];

/** Content types whose backlinks panel is meaningful (old Links tab scope). */
const LINKS_CONTENT_TYPES = new Set(["note", "external"]);
/** Content types with an agentic metadata doc (Phase 2 scope). */
const AI_CONTENT_TYPES = new Set([
  "folder",
  "note",
  "file",
  "html",
  "code",
  "external",
]);

export function ContextTab() {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const selectedContentType = useContentStore((s) => s.selectedContentType);

  const available: ContextSubTab[] = [];
  if (selectedContentType && LINKS_CONTENT_TYPES.has(selectedContentType)) {
    available.push("links");
  }
  available.push("tags");
  // AI context is CORE infrastructure post-graduation (plan Phase 0/D11):
  // it no longer follows studio enablement — governance is contextMode.
  if (selectedContentType && AI_CONTENT_TYPES.has(selectedContentType)) {
    available.push("ai");
  }

  // Default: the AI doc when it exists for this content, else the first
  // available. User choice sticks for the mount; falls back live if the
  // content type stops supporting it.
  const [chosen, setChosen] = useState<ContextSubTab | null>(null);
  const activeSubTab: ContextSubTab =
    chosen && available.includes(chosen)
      ? chosen
      : available.includes("ai")
        ? "ai"
        : available[0];

  if (!selectedContentId) {
    return (
      <div className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">
        Select content to see its context.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Icon row — inbox-navigator styling, no section title above it */}
      <div className="shrink-0 border-b border-black/10 px-3 py-3 dark:border-white/10">
        <div className="flex items-center gap-1">
          {SUB_TABS.filter(({ id }) => available.includes(id)).map(
            ({ id, label, icon: Icon, iconClassName }) => {
              const isActive = activeSubTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChosen(id)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  title={label}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-black/[0.06] text-foreground dark:bg-white/10"
                      : "text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                  )}
                >
                  <Icon className={iconClassName} />
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Active sub-tab label — beneath the divider line, per inbox parity */}
      <h3 className="shrink-0 px-3 pt-3 text-sm font-semibold text-gray-900 dark:text-white">
        {SUB_TABS.find((entry) => entry.id === activeSubTab)?.label ?? "Context"}
      </h3>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeSubTab === "links" && (
          <BacklinksPanel contentId={selectedContentId} />
        )}
        {activeSubTab === "tags" && <TagsPanel contentId={selectedContentId} />}
        {activeSubTab === "ai" && <ContextAiPanel />}
      </div>
    </div>
  );
}
