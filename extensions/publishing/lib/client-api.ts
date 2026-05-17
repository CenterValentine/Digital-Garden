"use client";

import type { PublishItemSummary } from "../state/publish-store";

// Typed wrappers around the publishing API routes.
// All routes under /api/publishing/ (created in R0).

export async function fetchLinkedPublicItems(
  contentNodeId: string
): Promise<PublishItemSummary[]> {
  const res = await fetch(
    `/api/publishing/items?contentNodeId=${encodeURIComponent(contentNodeId)}`
  );
  if (!res.ok) throw new Error(`Failed to load public items: ${res.status}`);
  return res.json();
}

export async function publishItem(
  publicItemId: string,
  opts?: { note?: string }
): Promise<void> {
  const res = await fetch(`/api/publishing/items/${publicItemId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) throw new Error(`Publish failed: ${res.status}`);
}

export async function unpublishItem(publicItemId: string): Promise<void> {
  const res = await fetch(`/api/publishing/items/${publicItemId}/unpublish`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Unpublish failed: ${res.status}`);
}

export async function scheduleItem(
  publicItemId: string,
  scheduledFor: string
): Promise<void> {
  const res = await fetch(`/api/publishing/items/${publicItemId}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduledFor }),
  });
  if (!res.ok) throw new Error(`Schedule failed: ${res.status}`);
}

export async function archiveItem(publicItemId: string): Promise<void> {
  const res = await fetch(`/api/publishing/items/${publicItemId}/archive`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Archive failed: ${res.status}`);
}

export async function validateItem(
  publicItemId: string
): Promise<{ status: string; issues: unknown[] }> {
  const res = await fetch(`/api/publishing/items/${publicItemId}/validate`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Validation failed: ${res.status}`);
  return res.json();
}

export interface PublicPathSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  parentId: string | null;
  children?: PublicPathSummary[];
}

function flattenPaths(nodes: PublicPathSummary[], prefix = ""): PublicPathSummary[] {
  const result: PublicPathSummary[] = [];
  for (const node of nodes) {
    const displayTitle = prefix ? `${prefix} / ${node.title}` : node.title;
    result.push({ ...node, title: displayTitle, children: undefined });
    if (node.children?.length) {
      result.push(...flattenPaths(node.children, displayTitle));
    }
  }
  return result;
}

export async function fetchPublicPaths(): Promise<PublicPathSummary[]> {
  const res = await fetch("/api/publishing/paths");
  if (!res.ok) throw new Error(`Failed to load paths: ${res.status}`);
  const roots: PublicPathSummary[] = await res.json();
  return flattenPaths(roots);
}

export async function updatePublicPath(
  id: string,
  body: { title?: string; slug?: string; description?: string | null; icon?: string | null }
): Promise<void> {
  const res = await fetch(`/api/publishing/paths/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Update failed: ${res.status}`);
  }
}

export async function deletePublicPath(id: string): Promise<void> {
  const res = await fetch(`/api/publishing/paths/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Delete failed: ${res.status}`);
  }
}

export async function createPublicItem(body: {
  contentNodeId: string;
  pathId: string;
  payloadType: string;
  slug: string;
  publicTitle?: string;
}): Promise<PublishItemSummary> {
  const res = await fetch("/api/publishing/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Create failed: ${res.status}`);
  }
  return res.json();
}
