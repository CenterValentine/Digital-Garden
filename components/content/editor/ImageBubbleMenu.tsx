/**
 * ImageBubbleMenu — Sprint 37
 *
 * Floating menu that appears when an image node is selected.
 * Follows the same pattern as TableBubbleMenu:
 * - Own PluginKey to avoid shared-meta cross-contamination
 * - Module-level shouldShow for stable references
 * - preventFocusLoss on all buttons (no .focus() in chains)
 */

"use client";

import { BubbleMenu as TipTapBubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";

const imageBubbleMenuKey = new PluginKey("imageBubbleMenu");

/** Prevent browser from stealing focus from ProseMirror on button click. */
const preventFocusLoss = (e: React.MouseEvent) => {
  e.preventDefault();
};

/**
 * Stable shouldShow — module-level to avoid re-render churn.
 * Only shows when an image node is selected (NodeSelection on atom node).
 */
const imageShouldShow = ({
  editor,
}: {
  editor: Editor;
  [key: string]: any;
}): boolean => {
  return editor.isActive("image");
};

/** Size preset: label + width value (null = full/auto) */
const SIZE_PRESETS = [
  { label: "S", title: "Small (25%)", width: "25%" },
  { label: "M", title: "Medium (50%)", width: "50%" },
  { label: "L", title: "Large (100%)", width: null },
] as const;

export interface ImageBubbleMenuProps {
  editor: Editor | null;
}

export function ImageBubbleMenu({ editor }: ImageBubbleMenuProps) {
  if (!editor) return null;

  const imageAttrs = editor.getAttributes("image");
  const currentWidth = imageAttrs.width;
  const isAiGenerated = imageAttrs.source === "ai-generated";

  return (
    <TipTapBubbleMenu
      editor={editor}
      pluginKey={imageBubbleMenuKey}
      updateDelay={100}
      shouldShow={imageShouldShow}
      className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/80 p-1 shadow-lg backdrop-blur-md"
    >
      {/* AI badge — shown for AI-generated images */}
      {isAiGenerated && (
        <>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
            title="AI-generated image"
          >
            AI
          </span>
          <div className="mx-0.5 h-4 w-px bg-white/10" />
        </>
      )}

      {/* Size presets */}
      {SIZE_PRESETS.map((preset) => {
        const isActive =
          preset.width === null
            ? !currentWidth
            : currentWidth === preset.width;
        return (
          <button
            key={preset.label}
            onMouseDown={preventFocusLoss}
            onClick={() =>
              editor.chain().updateAttributes("image", { width: preset.width }).run()
            }
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-white/20 text-white"
                : "text-gray-300 hover:bg-white/10"
            }`}
            title={preset.title}
            type="button"
          >
            {preset.label}
          </button>
        );
      })}

      <div className="mx-0.5 h-4 w-px bg-white/10" />

      {/* Alt text */}
      <button
        onMouseDown={preventFocusLoss}
        onClick={() => {
          const current = editor.getAttributes("image").alt || "";
          const alt = window.prompt("Alt text:", current);
          if (alt !== null) {
            editor.chain().updateAttributes("image", { alt }).run();
          }
        }}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-white/10 text-gray-300"
        title="Edit alt text"
        type="button"
      >
        Alt
      </button>

      <div className="mx-0.5 h-4 w-px bg-white/10" />

      {/* Delete */}
      <button
        onMouseDown={preventFocusLoss}
        onClick={() => editor.chain().deleteSelection().run()}
        className="rounded px-2 py-1 text-xs transition-colors hover:bg-red-500/20 text-red-400"
        title="Delete image"
        type="button"
      >
        Delete
      </button>
    </TipTapBubbleMenu>
  );
}
