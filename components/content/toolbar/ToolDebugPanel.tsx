/**
 * ToolDebugPanel (Development Only)
 *
 * Fixed-position overlay showing Tool Surfaces registry state.
 * Toggle with Cmd+Shift+T. Shows tools per surface filtered
 * by the current content type.
 */

"use client";

import { useState, useEffect } from "react";
import { useToolSurface } from "@/lib/domain/tools";
import type { ToolSurface } from "@/lib/domain/tools";

const SURFACES: ToolSurface[] = ["toolbar", "toolbelt", "sidebar-tab"];

export function ToolDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const toolSurface = useToolSurface();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-96 overflow-y-auto rounded-lg border border-white/20 bg-black/90 p-4 text-xs font-mono shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-yellow-400 font-bold text-sm">Tool Surfaces Debug</span>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-500 hover:text-white"
          type="button"
        >
          ✕
        </button>
      </div>

      <div className="mb-2 text-gray-400">
        Content type: <span className="text-green-400">{toolSurface?.contentType ?? "null"}</span>
      </div>

      {SURFACES.map((surface) => {
        const tools = toolSurface?.getToolsForSurface(surface) ?? [];
        return (
          <div key={surface} className="mb-3">
            <div className="text-blue-400 font-bold mb-1">
              {surface} ({tools.length})
            </div>
            {tools.length === 0 ? (
              <div className="text-gray-600 pl-2">No tools</div>
            ) : (
              <div className="pl-2 space-y-0.5">
                {tools.map((tool) => (
                  <div key={tool.definition.id} className="text-gray-300">
                    <span className="text-white">{tool.definition.id}</span>
                    {tool.definition.group && (
                      <span className="text-gray-500 ml-1">[{tool.definition.group}]</span>
                    )}
                    {tool.definition.shortcut && (
                      <span className="text-yellow-600 ml-1">{tool.definition.shortcut}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
