"use client";

/**
 * ContentToolbar
 *
 * Renders tools assigned to the "toolbar" surface in the content header area.
 * Returns null when no toolbar tools are available (current default).
 */

import { useToolSurface } from "@/lib/domain/tools";

export function ContentToolbar() {
  const toolSurface = useToolSurface();

  const tools = toolSurface?.getToolsForSurface("toolbar") ?? [];

  // No toolbar tools registered yet — render nothing
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 border-b border-white/10 px-3 py-1">
      {tools.map((tool) => (
        <button
          key={tool.definition.id}
          onClick={tool.execute}
          disabled={tool.isDisabled}
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-gray-200"
          title={tool.definition.label}
          type="button"
        >
          <span className="text-xs">{tool.definition.label}</span>
        </button>
      ))}
    </div>
  );
}
