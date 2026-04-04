/**
 * BlockBuilder
 *
 * Full-width modal drawer for composing blocks from parts.
 * Three-panel layout: Palette | Canvas | Properties
 *
 * Listens for "open-block-builder" CustomEvent (fired by /block slash command).
 * Uses @dnd-kit DndContext to coordinate drag from palette → canvas.
 *
 * Epoch 11 Sprint 44b
 */

"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useBlockBuilderStore } from "@/state/block-builder-store";
import { isValidChild, canAcceptChildren } from "@/lib/domain/blocks/builder-tree";
import { builderNodesToTipTap } from "@/lib/domain/blocks/builder-to-tiptap";
import { tiptapToBuilderNodes } from "@/lib/domain/blocks/tiptap-to-builder";
import { getBlockDefinition } from "@/lib/domain/blocks/registry";
import { BlockBuilderPalette } from "./BlockBuilderPalette";
import { BlockBuilderCanvas } from "./BlockBuilderCanvas";
import { BlockBuilderProperties } from "./BlockBuilderProperties";
import { X } from "lucide-react";

interface BlockBuilderProps {
  /** Editor instance for inserting the built block */
  onInsert?: (tiptapNodes: unknown[]) => void;
}

export function BlockBuilder({ onInsert }: BlockBuilderProps) {
  const [open, setOpen] = useState(false);
  const [draggedType, setDraggedType] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const nodes = useBlockBuilderStore((s) => s.nodes);
  const mode = useBlockBuilderStore((s) => s.mode);
  const addBlockPart = useBlockBuilderStore((s) => s.addBlockPart);
  const moveNodeAction = useBlockBuilderStore((s) => s.moveNode);
  const reset = useBlockBuilderStore((s) => s.reset);
  const loadNodes = useBlockBuilderStore((s) => s.loadNodes);

  // Listen for open events
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;

      if (detail?.tiptapJson) {
        // Edit mode: load existing block
        const builderNodes = tiptapToBuilderNodes(detail.tiptapJson);
        loadNodes(builderNodes, "edit", detail.blockId);
      } else {
        // Create mode: fresh canvas
        reset();
      }

      setOpen(true);
    };

    window.addEventListener("open-block-builder", handleOpen);
    return () => window.removeEventListener("open-block-builder", handleOpen);
  }, [reset, loadNodes]);

  const handleClose = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.blockType) {
      setDraggedType(data.blockType);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggedType(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;

      if (activeData?.source === "palette") {
        // Dropping from palette → canvas: create new node
        const blockType = activeData.blockType as string;

        // Determine drop target
        let parentId: string | null = null;
        let index: number | undefined;

        if (over.id === "canvas-root") {
          parentId = null;
        } else if (overData?.node) {
          // Dropped on a canvas item — check if it's a valid container
          const overNode = overData.node;
          if (
            canAcceptChildren(overNode.blockType) &&
            isValidChild(overNode.blockType, blockType)
          ) {
            parentId = overNode.id;
          } else {
            // Drop at root level after this item
            parentId = null;
          }
        }

        addBlockPart(blockType, parentId, index);
      } else if (activeData?.source === "canvas") {
        // Reordering within canvas
        if (over.id === "canvas-root" || !overData?.node) {
          // Move to root
          moveNodeAction(active.id as string, null, nodes.length);
        } else {
          const overNode = overData.node;
          if (
            canAcceptChildren(overNode.blockType) &&
            isValidChild(overNode.blockType, activeData.blockType)
          ) {
            moveNodeAction(active.id as string, overNode.id, 0);
          }
        }
      }
    },
    [addBlockPart, moveNodeAction, nodes.length]
  );

  const handleInsert = useCallback(() => {
    if (nodes.length === 0) return;
    const tiptapNodes = builderNodesToTipTap(nodes);
    onInsert?.(tiptapNodes);
    handleClose();
  }, [nodes, onInsert, handleClose]);

  if (!open) return null;

  const draggedDef = draggedType
    ? getBlockDefinition(draggedType)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl mx-4 mb-4 rounded-xl overflow-hidden border border-white/20 bg-gray-900/95 backdrop-blur-md shadow-2xl flex flex-col" style={{ height: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              {mode === "edit" ? "Edit Block" : "Block Builder"}
            </h2>
            <p className="text-[10px] text-gray-400 mt-0.5">
              Drag parts from the left to compose your block
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Three-panel layout */}
        <DndContext
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0">
            {/* Palette */}
            <div className="w-52 border-r border-white/15 shrink-0 bg-white/[0.02]">
              <div className="px-3 py-2 border-b border-white/10">
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                  Parts
                </h3>
              </div>
              <BlockBuilderPalette />
            </div>

            {/* Canvas */}
            <div className="flex-1 min-w-0 border-r border-white/15">
              <div className="px-3 py-2 border-b border-white/10">
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                  Canvas
                </h3>
              </div>
              <BlockBuilderCanvas />
            </div>

            {/* Properties */}
            <div className="w-56 shrink-0 bg-white/[0.02]">
              <div className="px-3 py-2 border-b border-white/10">
                <h3 className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                  Properties
                </h3>
              </div>
              <BlockBuilderProperties />
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedDef && (
              <div
                ref={overlayRef}
                className="px-3 py-2 rounded-md bg-blue-500/25 border border-blue-400/50 text-xs font-medium text-blue-100 shadow-lg backdrop-blur-sm"
              >
                {draggedDef.label}
              </div>
            )}
          </DragOverlay>
        </DndContext>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/15">
          <div className="text-[10px] text-gray-500">
            {nodes.length} part{nodes.length !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={nodes.length === 0}
              className="px-4 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Insert Block
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
