"use client";

import { useEffect, useState, useCallback } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";

interface CollabDocItem {
  id: string;
  contentId: string;
  documentName: string;
  schemaVersion: number;
  enabledAt: string;
  updatedAt: string;
  hasYdocState: boolean;
  ydocStateBytes: number;
  contentTitle: string;
  contentType: string;
  ownerUsername: string;
  hasUnsupportedBlocks: boolean;
}

export default function CollabDocPage() {
  const [items, setItems] = useState<CollabDocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyUnsupported, setOnlyUnsupported] = useState(true);
  const [flushingId, setFlushingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const glass0 = getSurfaceStyles("glass-0");
  const glass1 = getSurfaceStyles("glass-1");

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (onlyUnsupported) params.set("onlyUnsupported", "true");
      const res = await fetch(`/api/admin/collab-doc?${params}`);
      const result = await res.json();
      if (result.success) {
        setItems(result.data.items);
      } else {
        toast.error("Failed to load collaboration documents");
      }
    } catch {
      toast.error("Failed to load collaboration documents");
    } finally {
      setLoading(false);
    }
  }, [search, onlyUnsupported]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function flushDoc(item: CollabDocItem) {
    setFlushingId(item.contentId);
    setConfirmId(null);
    try {
      const res = await fetch("/api/admin/collab-doc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: item.contentId }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`Flushed Y.js state for "${item.contentTitle}". It will re-bootstrap on next open.`);
        setItems((prev) => prev.filter((d) => d.contentId !== item.contentId));
      } else {
        toast.error(result.error ?? "Flush failed");
      }
    } catch {
      toast.error("Flush request failed");
    } finally {
      setFlushingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Collaboration Doc Maintenance</h1>
        <p className="text-muted-foreground mt-2">
          Flush Y.js document state so notes re-bootstrap from canonical TipTap
          JSON on next open. Use this to revive blocks that were saved as
          unsupported placeholders before their Server extensions were registered.
        </p>
      </div>

      {/* Callout */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-sm text-amber-300">
          <strong>What flush does:</strong> Deletes the CollaborationDocument row
          (Y.js binary state only). The note&apos;s content in NotePayload is
          untouched. Hocuspocus re-bootstraps from TipTap JSON on the next
          connection, automatically reviving any{" "}
          <code className="bg-black/30 px-1 rounded">unsupportedBlock</code>{" "}
          placeholders that have an{" "}
          <code className="bg-black/30 px-1 rounded">originalJson</code>{" "}
          attribute.
        </p>
      </div>

      {/* Filters */}
      <div
        className="border border-black/10 dark:border-white/10 rounded-lg p-4 flex flex-wrap gap-4 items-end"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-muted-foreground mb-1">
            Search by title
          </label>
          <input
            type="text"
            className="w-full bg-black/30 border border-black/10 dark:border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-gray-500 dark:text-gray-400 focus:outline-none focus:ring-1 focus:ring-white/20"
            placeholder="Note title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchDocs()}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-primary"
            checked={onlyUnsupported}
            onChange={(e) => setOnlyUnsupported(e.target.checked)}
          />
          Only notes with unsupported blocks
        </label>
        <Button variant="outline" size="sm" onClick={fetchDocs} disabled={loading}>
          {loading ? "Loading…" : "Search"}
        </Button>
      </div>

      {/* Results */}
      <div
        className="border border-black/10 dark:border-white/10 rounded-lg overflow-hidden"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">
            {loading ? "Loading…" : `${items.length} document${items.length !== 1 ? "s" : ""}`}
          </h3>
        </div>

        {items.length === 0 && !loading ? (
          <div className="px-6 py-12 text-center text-muted-foreground text-sm">
            {onlyUnsupported
              ? "No notes with unsupported blocks found."
              : "No collaboration documents found."}
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((item) => (
              <div key={item.contentId} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{item.contentTitle}</span>
                    {item.hasUnsupportedBlocks && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-300 flex-shrink-0">
                        unsupported blocks
                      </span>
                    )}
                    {!item.hasYdocState && (
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-600 dark:text-gray-400 flex-shrink-0">
                        no ydoc state
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="capitalize">{item.contentType}</span>
                    <span>by {item.ownerUsername}</span>
                    <span>schema v{item.schemaVersion}</span>
                    {item.hasYdocState && (
                      <span>{formatBytes(item.ydocStateBytes)} Y.js state</span>
                    )}
                    <span>updated {formatDate(item.updatedAt)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground font-mono opacity-50 truncate">
                    {item.contentId}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {confirmId === item.contentId ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-300">Are you sure?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={flushingId === item.contentId}
                        onClick={() => flushDoc(item)}
                      >
                        {flushingId === item.contentId ? "Flushing…" : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                      onClick={() => setConfirmId(item.contentId)}
                    >
                      Flush Y.js state
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
