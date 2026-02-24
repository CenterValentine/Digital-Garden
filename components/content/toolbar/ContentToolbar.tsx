"use client";

/**
 * ContentToolbar
 *
 * Renders tools assigned to the "toolbar" surface in the content header area.
 * Returns null when no toolbar tools are available.
 */

import { Download, Link2 } from "lucide-react";
import { useToolSurface } from "@/lib/domain/tools";
import type { ComponentType } from "react";

/** Map iconName strings to lucide-react components */
const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  Download,
  Link2,
};

export function ContentToolbar() {
  const toolSurface = useToolSurface();

  const tools = toolSurface?.getToolsForSurface("toolbar") ?? [];

  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 border-b border-white/10 px-3 py-1.5">
      {tools.map((tool) => {
        const Icon = ICON_MAP[tool.definition.iconName];
        return (
          <button
            key={tool.definition.id}
            onClick={tool.execute}
            disabled={tool.isDisabled}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
            title={tool.definition.label}
            type="button"
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{tool.definition.label}</span>
          </button>
        );
      })}
    </div>
  );
}
