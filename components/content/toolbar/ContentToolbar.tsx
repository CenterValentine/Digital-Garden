"use client";

/**
 * ContentToolbar
 *
 * Renders tools assigned to the "toolbar" surface in the content header area.
 * Returns null when no toolbar tools are available.
 */

import { BookmarkPlus, Download, Link2, Share2, Upload } from "lucide-react";
import { useToolSurface } from "@/lib/domain/tools";
import type { ComponentType } from "react";

/** Map iconName strings to lucide-react components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  BookmarkPlus,
  Download,
  Link2,
  Share2,
  Upload,
};

export function ContentToolbar() {
  const toolSurface = useToolSurface();

  const tools = toolSurface?.getToolsForSurface("toolbar") ?? [];

  if (tools.length === 0) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-20 flex min-h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-3 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur"
      role="toolbar"
      aria-label="Content actions"
    >
      {tools.map((tool) => {
        const Icon = ICON_MAP[tool.definition.iconName];
        return (
          <button
            key={tool.definition.id}
            onClick={tool.execute}
            disabled={tool.isDisabled}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            title={tool.definition.label}
            type="button"
          >
            {Icon && <Icon className="h-4 w-4" />}
            <span className="whitespace-nowrap">{tool.definition.label}</span>
          </button>
        );
      })}
    </div>
  );
}
