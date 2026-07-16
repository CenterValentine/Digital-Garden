/**
 * Context sidebar tab — the per-node context HUB (restructured 2026-07-16).
 *
 * One tab, three sub-tabs on an iconized subrail (UI parity with the left
 * sidebar's file-tree subrail): Links (backlinks), Tags, and AI (the agentic
 * metadata doc). The old standalone Links/Tags right-sidebar tabs merged in
 * here; the AI sub-tab follows studio extension enablement while links/tags
 * are core and always available for their content types.
 */

"use client";

import { useState } from "react";
import { Link as LinkIcon, Sparkles, Tag as TagIcon } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import { useIsExtensionEnabled } from "@/lib/extensions/client-registry";
import { BacklinksPanel } from "@/components/content/BacklinksPanel";
import { TagsPanel } from "@/components/content/TagsPanel";
import { STUDIO_EXTENSION_ID } from "../manifest";
import { ContextAiPanel } from "./ContextAiPanel";

type ContextSubTab = "links" | "tags" | "ai";

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

// Subrail class parity with LeftSidebarHeader's sub-affordance row.
const SUB_ACTIVE = "bg-white dark:bg-white/20 text-gold-primary";
const SUB_INACTIVE =
  "text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/10 hover:text-gold-primary";

export function ContextTab() {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const selectedContentType = useContentStore((s) => s.selectedContentType);
  const studioEnabled = useIsExtensionEnabled(STUDIO_EXTENSION_ID);

  const available: ContextSubTab[] = [];
  if (selectedContentType && LINKS_CONTENT_TYPES.has(selectedContentType)) {
    available.push("links");
  }
  available.push("tags");
  if (
    studioEnabled &&
    selectedContentType &&
    AI_CONTENT_TYPES.has(selectedContentType)
  ) {
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
      {/* Sub-affordance rail — mirrors the left sidebar's file-tree subrail */}
      <div className="h-0.5 shrink-0 bg-gray-100 dark:bg-gray-800" />
      <div className="flex h-6 shrink-0 items-center gap-0.5 border-b border-gray-200 bg-gray-100 px-1.5 dark:border-white/10 dark:bg-gray-800">
        {available.includes("links") && (
          <button
            type="button"
            onClick={() => setChosen("links")}
            className={`rounded p-0.5 transition-colors ${
              activeSubTab === "links" ? SUB_ACTIVE : SUB_INACTIVE
            }`}
            title="Links — what references this"
          >
            <LinkIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setChosen("tags")}
          className={`rounded p-0.5 transition-colors ${
            activeSubTab === "tags" ? SUB_ACTIVE : SUB_INACTIVE
          }`}
          title="Tags"
        >
          <TagIcon className="h-4 w-4" />
        </button>
        {available.includes("ai") && (
          <button
            type="button"
            onClick={() => setChosen("ai")}
            className={`rounded p-0.5 transition-colors ${
              activeSubTab === "ai" ? SUB_ACTIVE : SUB_INACTIVE
            }`}
            title="AI context — the model's working knowledge of this content"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}
      </div>

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
