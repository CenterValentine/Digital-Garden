/**
 * Admin Content Detail Page
 *
 * View individual content item details (read-only).
 */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSurfaceStyles } from "@/lib/design/system";
import type { AdminContentDetail } from "@/lib/domain/admin/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";

export default function ContentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [content, setContent] = useState<AdminContentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const glass0 = getSurfaceStyles("glass-0");

  useEffect(() => {
    fetch(`/api/admin/content/${params.id}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setContent(result.data);
        } else {
          toast.error("Failed to load content");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch content:", err);
        toast.error("Failed to load content");
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return <ContentDetailSkeleton />;
  }

  if (!content) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Content not found</p>
        <Button
          variant="outline"
          onClick={() => router.push("/admin/content")}
          className="mt-4"
        >
          Back to Content List
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/content")}
          className="mb-4"
        >
          ← Back to Content List
        </Button>
        <h1 className="text-3xl font-bold">{content.title}</h1>
        <p className="text-muted-foreground mt-2">
          Content detail (read-only view)
        </p>
      </div>

      {/* Metadata */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Metadata</h3>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Owner</dt>
            <dd className="font-medium">{content.ownerUsername}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Type</dt>
            <dd className="font-medium capitalize">{content.contentType}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Slug</dt>
            <dd className="font-mono text-sm">{content.slug}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Status</dt>
            <dd>
              {content.isPublished ? (
                <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-300">
                  Published
                </span>
              ) : (
                <span className="inline-flex px-2 py-1 rounded text-xs font-medium bg-gray-500/20 text-gray-300">
                  Draft
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Created</dt>
            <dd className="text-sm">{formatDate(content.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Updated</dt>
            <dd className="text-sm">{formatDate(content.updatedAt)}</dd>
          </div>
          {content.parentPath && (
            <div className="col-span-2">
              <dt className="text-sm text-muted-foreground">Parent Path</dt>
              <dd className="font-mono text-sm">{content.parentPath}</dd>
            </div>
          )}
          {content.deletedAt && (
            <div className="col-span-2">
              <dt className="text-sm text-muted-foreground text-red-400">
                Deleted At
              </dt>
              <dd className="text-sm text-red-400">
                {formatDate(content.deletedAt)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Payload Preview */}
      {content.payloadPreview && (
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <h3 className="text-lg font-semibold mb-4">Content Preview</h3>
          <div className="bg-black/20 rounded p-4 font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
            {content.payloadPreview.preview}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Showing first 500 characters for security. Full content is not
            accessible via admin panel.
          </p>
        </div>
      )}

      {/* Read-Only Notice */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
        <p className="text-sm text-blue-300">
          <strong>Read-Only Access:</strong> Admin panel does not allow editing
          or deleting user content. This is a view-only interface for monitoring
          purposes.
        </p>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ContentDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-48" />
      <Skeleton className="h-96" />
    </div>
  );
}
