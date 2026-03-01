// @ts-nocheck — WIP: v2 registry-driven toolbelt (depends on unfinished type system in registry-v2.tsx)
/**
 * Editor Toolbelt
 *
 * Floating toolbar for text formatting that appears on selection.
 * Uses TipTap's BubbleMenu component with tools from the registry.
 *
 * Replaces hardcoded BubbleMenu with registry-driven approach for:
 * - Deterministic tool ordering
 * - Context-aware tool visibility
 * - Consistent behavior across surfaces
 */

"use client";

import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
// TODO: useToolContext is not yet implemented — this file is part of the v2 registry-driven toolbelt (WIP)
// import { useToolContext, resolveToolsForSurface } from "@/lib/domain/tools";
import { resolveToolsForSurface } from "@/lib/domain/tools/registry-v2";
type ToolContextValue = Parameters<typeof resolveToolsForSurface>[1];
const useToolContext = (): ToolContextValue => { throw new Error("useToolContext not yet implemented"); };

// Create unique plugin key for this bubble menu
const textFormattingBubbleMenuKey = new PluginKey("textFormattingBubbleMenu");

// ============================================================
// PROPS
// ============================================================

export interface EditorToolbeltProps {
  /**
   * TipTap editor instance
   */
  editor: Editor | null;

  /**
   * Handler for link tool click
   * Opens link dialog instead of executing command directly
   */
  onLinkClick?: () => void;
}

// ============================================================
// COMPONENT
// ============================================================

/**
 * Editor toolbelt component
 *
 * Renders tools from the 'toolbelt' surface in a floating menu.
 * Tools are automatically filtered by:
 * - Surface: Only 'toolbelt' tools
 * - Content type: Only tools that support current content type (note)
 * - Availability: Only tools where availableWhen() returns true (edit mode + text selection)
 *
 * Tools are sorted by order field for deterministic placement.
 *
 * @example
 * ```tsx
 * <EditorToolbelt
 *   editor={editor}
 *   onLinkClick={() => setShowLinkDialog(true)}
 * />
 * ```
 */
export function EditorToolbelt({ editor, onLinkClick }: EditorToolbeltProps) {
  const ctx = useToolContext();
  const tools = resolveToolsForSurface("toolbelt", ctx);

  // Don't render if no editor
  if (!editor) {
    return null;
  }

  // Handle tool click
  const handleToolClick = (toolId: string) => {
    // Special handling for link tool (opens dialog)
    if (toolId === "link") {
      if (editor.isActive("link")) {
        // Unlink
        editor.chain().focus().unsetLink().run();
      } else {
        // Open link dialog
        onLinkClick?.();
      }
      return;
    }

    // Execute tool's onClick handler
    const tool = tools.find((t) => t.id === toolId);
    if (tool?.onClick) {
      tool.onClick(ctx);
    }
  };

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={textFormattingBubbleMenuKey}
      updateDelay={100}
      shouldShow={({ state, editor }) => {
        // Only show when there's a non-empty text selection outside of tables
        const { selection } = state;
        const { empty } = selection;

        // Don't show if selection is empty
        if (empty) return false;

        // Don't show if we're inside a table
        if (editor.isActive("table")) return false;

        return true;
      }}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      {tools.map((tool, index) => {
        // Check if tool is enabled
        const enabled = tool.enabledWhen ? tool.enabledWhen(ctx) : true;

        // Check if tool is active (for toggle-style tools)
        const isActive =
          tool.tiptap?.extension &&
          (tool.tiptap.extension === "Heading"
            ? editor.isActive("heading", {
                level: parseInt(tool.id.replace("heading", "")),
              })
            : editor.isActive(tool.tiptap.extension.toLowerCase()));

        // Add divider before link tool and before heading tools
        const showDividerBefore =
          index > 0 && (tool.id === "link" || tool.id === "heading1");

        return (
          <div key={tool.id} className="flex items-center">
            {showDividerBefore && (
              <div className="mx-1 h-6 w-px bg-white/10" />
            )}
            <button
              onClick={() => handleToolClick(tool.id)}
              className={`rounded p-1.5 transition-colors hover:bg-white/10 ${
                isActive ? "bg-white/20 text-white" : "text-gray-400"
              } ${!enabled ? "opacity-50 cursor-not-allowed" : ""}`}
              title={
                tool.metadata?.shortcut
                  ? `${tool.label} (${tool.metadata.shortcut})`
                  : tool.label
              }
              type="button"
              disabled={!enabled}
            >
              {tool.icon}
            </button>
          </div>
        );
      })}
    </TipTapBubbleMenu>
  );
}
