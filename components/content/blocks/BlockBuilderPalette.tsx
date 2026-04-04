/**
 * BlockBuilderPalette
 *
 * Left panel of the block builder modal.
 * Shows available block parts grouped by family (Content, Layout).
 * Each item is draggable via @dnd-kit.
 *
 * Epoch 11 Sprint 44b
 */

"use client";

import { useDraggable } from "@dnd-kit/core";
import { getBlocksByFamily, type BlockDefinition } from "@/lib/domain/blocks";
import {
  Heading,
  PanelTop,
  Minus,
  ChevronDown,
  Columns3,
  LayoutList,
} from "lucide-react";

/** Map block type to a Lucide icon component */
const BLOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
  {
    sectionHeader: Heading,
    cardPanel: PanelTop,
    blockDivider: Minus,
    accordion: ChevronDown,
    columns: Columns3,
    tabs: LayoutList,
  };

function PaletteItem({ definition }: { definition: BlockDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${definition.type}`,
    data: { blockType: definition.type, source: "palette" },
  });

  const Icon = BLOCK_ICONS[definition.type];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-md cursor-grab
        border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20
        transition-colors select-none
        ${isDragging ? "opacity-40" : ""}`}
    >
      {Icon && <Icon className="h-4 w-4 text-gray-400 shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-200 truncate">{definition.label}</div>
        <div className="text-[10px] text-gray-500 truncate">
          {definition.description}
        </div>
      </div>
    </div>
  );
}

export function BlockBuilderPalette() {
  const contentBlocks = getBlocksByFamily("content");
  const layoutBlocks = getBlocksByFamily("layout");

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {contentBlocks.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 px-1">
            Content
          </h4>
          <div className="space-y-1.5">
            {contentBlocks.map((def) => (
              <PaletteItem key={def.type} definition={def} />
            ))}
          </div>
        </div>
      )}

      {layoutBlocks.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 px-1">
            Layout
          </h4>
          <div className="space-y-1.5">
            {layoutBlocks.map((def) => (
              <PaletteItem key={def.type} definition={def} />
            ))}
          </div>
        </div>
      )}

      {contentBlocks.length === 0 && layoutBlocks.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-500 text-xs">
          No block parts available
        </div>
      )}
    </div>
  );
}
