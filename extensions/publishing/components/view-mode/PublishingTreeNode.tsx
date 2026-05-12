"use client";

import { useState } from "react";
import { ChevronRight, Folder, Globe } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { usePublishTreeStore, type PublicPathNode } from "../../state/publish-tree-store";
import { PublishingTreeNodeBadge } from "./PublishingTreeNodeBadge";
import { PublishingPathContextMenu } from "./PublishingPathContextMenu";

interface PublishingTreeNodeProps {
  node: PublicPathNode;
  depth: number;
  onRefresh: () => void;
}

export function PublishingTreeNode({ node, depth, onRefresh }: PublishingTreeNodeProps) {
  const { expandedPathIds, togglePathExpanded, selectedPathId, setSelectedPathId } =
    usePublishTreeStore();

  const isExpanded = expandedPathIds.has(node.id);
  const isSelected = selectedPathId === node.id;
  const hasChildren = node.children.length > 0;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const Icon = depth === 0 ? Globe : Folder;

  // React Compiler memoizes this automatically; no need for useCallback
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded-sm mx-1 text-sm",
          "transition-colors select-none",
          isSelected
            ? "bg-gray-100 text-gray-800"
            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
        )}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        onClick={() => {
          setSelectedPathId(isSelected ? null : node.id);
          if (hasChildren) togglePathExpanded(node.id);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Expand chevron */}
        <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
          {hasChildren ? (
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          ) : null}
        </span>

        {/* Folder/globe icon */}
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />

        {/* Path title */}
        <span className="flex-1 truncate text-xs">{node.title}</span>

        {/* Item count badge */}
        {node.itemCount > 0 && (
          <PublishingTreeNodeBadge count={node.itemCount} />
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <PublishingTreeNode key={child.id} node={child} depth={depth + 1} onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <PublishingPathContextMenu
          node={node}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
