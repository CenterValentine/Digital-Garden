/**
 * BlockBuilderCanvas
 *
 * Center panel of the block builder modal.
 * Drop zone for palette items + sortable tree of canvas nodes.
 * Uses @dnd-kit for all drag-and-drop interactions.
 *
 * Epoch 11 Sprint 44b
 */

"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useBlockBuilderStore } from "@/state/block-builder-store";
import { BlockBuilderItem } from "./BlockBuilderItem";
import { Layers } from "lucide-react";

export function BlockBuilderCanvas() {
  const nodes = useBlockBuilderStore((s) => s.nodes);
  const selectNode = useBlockBuilderStore((s) => s.selectNode);

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-root",
    data: { parentId: null, source: "canvas" },
  });

  const sortableIds = nodes.map((n) => n.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col h-full overflow-y-auto p-3 transition-colors
        ${isOver ? "bg-blue-500/5" : ""}`}
      onClick={() => selectNode(null)}
    >
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <Layers className="h-10 w-10 mb-3 text-gray-600" />
          <p className="text-sm font-medium text-gray-400">Drag parts here</p>
          <p className="text-xs mt-1 text-gray-500">
            Build your block by dragging parts from the left
          </p>
        </div>
      ) : (
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
            {nodes.map((node) => (
              <BlockBuilderItem key={node.id} node={node} />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
