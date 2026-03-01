// @ts-nocheck — WIP: v2 registry-driven toolbar (depends on unfinished type system in registry-v2.tsx)
/**
 * Content Toolbar
 *
 * Toolbar component that displays tools from the 'toolbar' surface.
 * Tools are filtered and sorted based on current context (content type, permissions, capabilities).
 *
 * Provides deterministic ordering - download/export always appears in the same position
 * across all content types for UX consistency.
 */

"use client";

// TODO: useToolContext is not yet implemented — this file is part of the v2 registry-driven toolbar (WIP)
// import { useToolContext, resolveToolsForSurface } from "@/lib/domain/tools";
import { resolveToolsForSurface } from "@/lib/domain/tools/registry-v2";
type ToolContextValue = Parameters<typeof resolveToolsForSurface>[1];
const useToolContext = (): ToolContextValue => { throw new Error("useToolContext not yet implemented"); };

// ============================================================
// PROPS
// ============================================================

export interface ContentToolbarProps {
  /**
   * Handler for download action
   * Called when download tool is clicked
   */
  onDownload?: () => void;

  /**
   * Handler for share action
   * Called when share tool is clicked
   */
  onShare?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * Content toolbar component
 *
 * Renders tools from the 'toolbar' surface in the content header.
 * Tools are automatically filtered by:
 * - Surface: Only 'toolbar' tools
 * - Content type: Only tools that support current content type
 * - Availability: Only tools where availableWhen() returns true
 *
 * Tools are sorted by order field for deterministic placement.
 *
 * @example
 * ```tsx
 * <ContentToolbar
 *   onDownload={() => handleDownload()}
 *   onShare={() => handleShare()}
 * />
 * ```
 */
export default function ContentToolbar({
  onDownload,
  onShare,
  className = "",
}: ContentToolbarProps) {
  const ctx = useToolContext();
  const tools = resolveToolsForSurface("toolbar", ctx);

  // Handle tool clicks
  const handleClick = (id: string) => {
    if (id === "download") onDownload?.();
    if (id === "share") onShare?.();
    // Additional tool handlers can be added here
  };

  // Don't render if no tools available
  if (tools.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 border-b border-white/10 ${className}`}
      role="toolbar"
      aria-label="Content toolbar"
    >
      {tools.map((tool) => {
        // Check if tool is enabled
        const enabled = tool.enabledWhen ? tool.enabledWhen(ctx) : true;
        const disabledReason = tool.disabledReason?.(ctx);

        return (
          <button
            key={tool.id}
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
              transition-colors duration-200
              hover:bg-white/10
              focus:outline-none focus:ring-2 focus:ring-white/20
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            title={disabledReason || tool.label}
            aria-label={tool.label}
            onClick={() => (enabled ? handleClick(tool.id) : undefined)}
            disabled={!enabled}
          >
            {tool.icon}
            <span>{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}
