"use client";

import type { PublicPathNode } from "../../state/publish-tree-store";
import { PublishingTreeNode } from "./PublishingTreeNode";

interface PublishingTreeProps {
  paths: PublicPathNode[];
  onRefresh: () => void;
}

export function PublishingTree({ paths, onRefresh }: PublishingTreeProps) {
  const roots = paths.filter((p) => p.parentId === null);

  // Data-driven multi-tenancy detection: if root paths span >1 distinct
  // tenant, show the tenant-slug prefix on each root. Single-tenant users
  // (the overwhelming common case today) see no visual change.
  const distinctTenants = new Set(
    paths.map((p) => p.tenantId).filter((id): id is string => Boolean(id)),
  );
  const showTenantPrefix = distinctTenants.size > 1;

  return (
    <div className="py-1">
      {roots.map((node) => (
        <PublishingTreeNode
          key={node.id}
          node={node}
          depth={0}
          onRefresh={onRefresh}
          showTenantPrefix={showTenantPrefix}
        />
      ))}
    </div>
  );
}
