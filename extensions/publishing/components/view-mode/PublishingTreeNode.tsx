"use client";

import { useState } from "react";
import { ChevronRight, Globe } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { usePublishTreeStore, type PublicPathNode } from "../../state/publish-tree-store";
import { PublishingTreeNodeBadge } from "./PublishingTreeNodeBadge";
import { PublishingPathContextMenu } from "./PublishingPathContextMenu";

interface PublishingTreeNodeProps {
  node: PublicPathNode;
  depth: number;
  onRefresh: () => void;
  /** When true (set by the parent tree when paths span multiple tenants),
   *  root nodes render a tenant-slug prefix to disambiguate. */
  showTenantPrefix?: boolean;
}

export function PublishingTreeNode({
  node,
  depth,
  onRefresh,
  showTenantPrefix = false,
}: PublishingTreeNodeProps) {
  const { expandedPathIds, togglePathExpanded, selectedPathId, setSelectedPathId } =
    usePublishTreeStore();

  const isExpanded = expandedPathIds.has(node.id);
  const isSelected = selectedPathId === node.id;
  const hasChildren = node.children.length > 0;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Top-level paths get a Globe (this site's root); nested paths render
  // a slash glyph instead of a folder icon. Paths are URL path segments,
  // not filesystem folders — "/" reinforces the right mental model.
  const isRoot = depth === 0;

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

        {/* Globe for top-level, "/" glyph for nested paths */}
        {isRoot ? (
          <Globe className="w-3.5 h-3.5 shrink-0 opacity-60" />
        ) : (
          <span
            className="w-3.5 h-3.5 shrink-0 flex items-center justify-center font-mono text-sm opacity-40 leading-none"
            aria-hidden="true"
          >
            /
          </span>
        )}

        {/* Tenant prefix on root nodes when user owns multiple tenants */}
        {depth === 0 && showTenantPrefix && node.tenantSlug && (
          <span className="shrink-0 text-[10px] font-mono px-1 py-0 rounded bg-white/5 text-white/40">
            {node.tenantSlug}
          </span>
        )}

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
            <PublishingTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onRefresh={onRefresh}
              showTenantPrefix={showTenantPrefix}
            />
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
