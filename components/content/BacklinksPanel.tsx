/**
 * Links Panel
 *
 * Broadens the legacy backlinks surface into a links/associations view
 * while preserving the existing sidebar tab slot.
 */

"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useContentStore } from "@/state/content-store";

interface BacklinkItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  linkText: string;
  updatedAt: string;
}

interface AssociatedWebResource {
  id: string;
  title: string | null;
  normalizedUrl: string;
  canonicalUrl: string | null;
  faviconUrl: string | null;
  sourceDomain: string | null;
  sourceHostname: string | null;
}

interface AssociatedContentItem {
  id: string;
  metadata: Record<string, unknown>;
  content: {
    id: string;
    title: string;
    slug: string;
    contentType: string;
    customIcon: string | null;
    iconColor: string | null;
  };
}

interface LinksResponse {
  content: {
    id: string;
    title: string;
    contentType: string;
  };
  backlinks: BacklinkItem[];
  associatedWebResources: AssociatedWebResource[];
  associatedContent: AssociatedContentItem[];
}

interface BacklinksPanelProps {
  contentId?: string | null;
}

function isOfflineLikeError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    message.includes("Can't reach database server") ||
    message.includes("Failed to fetch")
  );
}

export function BacklinksPanel({ contentId }: BacklinksPanelProps) {
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const clearSelection = useContentStore((state) => state.clearSelection);
  const [data, setData] = useState<LinksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contentId) {
      setData(null);
      return;
    }

    if (contentId.startsWith("temp-")) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setError("Links are unavailable while offline.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/content/links/${contentId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          if (response.status === 404) {
            toast.error("Content not found. It may have been deleted.");
            clearSelection();
            return;
          }

          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error?.message || "Failed to fetch links");
        }

        setData(result.data);
      } catch (err) {
        if (isOfflineLikeError(err)) {
          setError("Links are unavailable while offline.");
        } else {
          console.error("[LinksPanel] Failed to fetch links:", err);
          setError(err instanceof Error ? err.message : "Failed to load links");
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [clearSelection, contentId]);

  const handleContentClick = (item: AssociatedContentItem["content"] | BacklinkItem, contentType?: string) => {
    setSelectedContentId(item.id, {
      title: item.title,
      contentType: (contentType || ("contentType" in item ? item.contentType : "note")) as any,
    });
  };

  if (!contentId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="text-sm text-gray-400">Select content to see links</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-sm text-gray-400">Loading links...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center">
        <div className="text-sm text-red-400">Failed to load links</div>
      </div>
    );
  }

  const hasBacklinks = Boolean(data?.backlinks.length);
  const hasResources = Boolean(data?.associatedWebResources.length);
  const hasAssociatedContent = Boolean(data?.associatedContent.length);

  if (data && !hasBacklinks && !hasResources && !hasAssociatedContent) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <div className="mb-2 text-sm font-medium text-gray-300">No links yet</div>
        <div className="text-xs text-gray-500">
          No note backlinks or associated webpage content were found for “{data.content.title}”
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-gray-300">Links</div>
        <div className="text-xs text-gray-500">
          Backlinks and webpage associations for “{data?.content.title}”
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {hasBacklinks && (
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Note backlinks
            </div>
            {data?.backlinks.map((backlink) => (
              <button
                key={backlink.id}
                onClick={() => handleContentClick(backlink, "note")}
                className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <div className="truncate text-sm font-medium text-gray-200">
                    {backlink.title}
                  </div>
                </div>
                {backlink.linkText && (
                  <div className="mb-1 text-xs text-primary">
                    “{backlink.linkText}”
                  </div>
                )}
                <div className="line-clamp-2 text-xs text-gray-400">
                  {backlink.excerpt}
                </div>
              </button>
            ))}
          </section>
        )}

        {hasResources && (
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Associated webpages
            </div>
            {data?.associatedWebResources.map((resource) => (
              <a
                key={resource.id}
                href={resource.canonicalUrl || resource.normalizedUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  {resource.faviconUrl ? (
                    <img src={resource.faviconUrl} alt="" className="h-4 w-4 rounded-sm" />
                  ) : (
                    <ExternalLink className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <div className="truncate text-sm font-medium text-gray-200">
                    {resource.title || resource.sourceHostname || resource.normalizedUrl}
                  </div>
                </div>
                <div className="break-all text-xs text-gray-400">{resource.normalizedUrl}</div>
              </a>
            ))}
          </section>
        )}

        {hasAssociatedContent && (
          <section className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Associated content
            </div>
            {data?.associatedContent.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleContentClick(entry.content)}
                className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 hover:shadow-sm"
              >
                <Link2 className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-200">
                    {entry.content.title}
                  </div>
                  <div className="text-xs text-gray-500">
                    {entry.content.contentType}
                  </div>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
