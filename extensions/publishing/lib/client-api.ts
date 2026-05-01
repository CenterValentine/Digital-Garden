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
