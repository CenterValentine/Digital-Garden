/**
 * BlockBuilderItem
 *
 * Single node in the builder canvas tree.
 * Sortable via @dnd-kit, shows block type info and nesting.
 * Click to select for properties editing.
 *
 * Epoch 11 Sprint 44b
 */

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBlockBuilderStore } from "@/state/block-builder-store";
import { getBlockDefinition } from "@/lib/domain/blocks/registry";
import { canAcceptChildren } from "@/lib/domain/blocks/builder-tree";
import type { BuilderNode } from "@/lib/domain/blocks/builder-types";
import {
  Heading,
  PanelTop,
  Minus,
  ChevronDown,
  Columns3,
  LayoutList,
  GripVertical,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const BLOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
  {
    sectionHeader: Heading,
    cardPanel: PanelTop,
    blockDivider: Minus,
    accordion: ChevronDown,
    columns: Columns3,
    tabs: LayoutList,
  };

/** Summary of key attrs for a given block type */
function attrSummary(node: BuilderNode): string {
  const { blockType, attrs } = node;
  switch (blockType) {
    case "sectionHeader":
      return `Level ${attrs.level ?? 1}${attrs.showDivider ? ", divider" : ""}`;
    case "cardPanel":
      return `${attrs.variant ?? "default"}${attrs.collapsible ? ", collapsible" : ""}`;
    case "blockDivider":
      return `${attrs.dividerStyle ?? "solid"}, ${attrs.spacing ?? "medium"}`;
    case "accordion":
      return `"${attrs.headerText || "Untitled"}"`;
    case "columns":
      return `${attrs.columnCount ?? 2} cols, ${attrs.gapSize ?? "medium"} gap`;
    case "tabs":
      return `${attrs.tabStyle ?? "underline"} style`;
    case "column":
      return "Column";
    case "tabPanel":
      return `"${attrs.label || "Tab"}"`;
    default:
      return "";
  }
}

export function BlockBuilderItem({
  node,
  depth = 0,
}: {
  node: BuilderNode;
  depth?: number;
}) {
  const selectedNodeId = useBlockBuilderStore((s) => s.selectedNodeId);
  const selectNode = useBlockBuilderStore((s) => s.selectNode);
  const removeNodeAction = useBlockBuilderStore((s) => s.removeNode);
  const isSelected = selectedNodeId === node.id;
  const [expanded, setExpanded] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    data: { blockType: node.blockType, source: "canvas", node },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = getBlockDefinition(node.blockType);
  const Icon = BLOCK_ICONS[node.blockType];
  const hasChildren = node.children.length > 0;
  const isContainer = canAcceptChildren(node.blockType);
  const summary = attrSummary(node);

  // Child-only types (column, tabPanel) get a subtler style
  const isChildType =
    node.blockType === "column" || node.blockType === "tabPanel";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? "opacity-30" : ""}`}
    >
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer
          transition-colors
          ${isSelected ? "bg-blue-500/15 border border-blue-400/40" : "border border-transparent hover:bg-white/8 hover:border-white/15"}
          ${isChildType ? "ml-2 border-l border-l-white/15 rounded-l-none" : ""}`}
        style={{ marginLeft: isChildType ? undefined : depth * 16 }}
        onClick={(e) => {
          e.stopPropagation();
          selectNode(node.id);
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-grab shrink-0 text-gray-500"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>

        {/* Expand/collapse for containers */}
        {isContainer && hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="shrink-0 text-gray-500 hover:text-gray-300"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <div className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400 shrink-0" />}

        {/* Label + summary */}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-gray-200">
            {def?.label ?? node.blockType}
          </span>
          {summary && (
            <span className="text-[10px] text-gray-500 ml-1.5">{summary}</span>
          )}
        </div>

        {/* Children count badge */}
        {isContainer && hasChildren && (
          <span className="text-[9px] text-gray-500 px-1.5 py-0.5 bg-white/8 rounded">
            {node.children.length}
          </span>
        )}

        {/* Delete button */}
        {!isChildType && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              removeNodeAction(node.id);
            }}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-gray-500 hover:text-red-400 shrink-0"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Children (nested items) */}
      {expanded && hasChildren && (
        <div className="mt-0.5">
          {node.children.map((child) => (
            <BlockBuilderItem
              key={child.id}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Empty container drop hint */}
      {expanded && isContainer && !hasChildren && (
        <div
          className="mx-4 my-1 py-2 text-center text-[10px] text-gray-600 border border-dashed border-white/15 rounded"
          style={{ marginLeft: (depth + 1) * 16 + 16 }}
        >
          Drop parts here
        </div>
      )}
    </div>
  );
}
