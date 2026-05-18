"use client";

import type { PublicPathNode } from "../../state/publish-tree-store";
import { PublishingTreeNode } from "./PublishingTreeNode";

interface PublishingTreeProps {
  paths: PublicPathNode[];
  onRefresh: () => void;
}

export function PublishingTree({ paths, onRefresh }: PublishingTreeProps) {
  const roots = paths.filter((p) => p.parentId === null);

  return (
    <div className="py-1">
      {roots.map((node) => (
        <PublishingTreeNode key={node.id} node={node} depth={0} onRefresh={onRefresh} />
      ))}
    </div>
  );
}
