/**
 * TrashSettings — Settings → Trash & Data.
 *
 * Lists the user's soft-deleted chats + orphaned documents, each with the
 * days left before the daily cron auto-purges it (30-day retention).
 * Supports restore and immediate permanent delete.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, FileText, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TrashItem {
  kind: "chat" | "content";
  id: string;
  title: string | null;
  contentType: string | null;
  deletedAt: string;
  daysLeft: number;
}

export function TrashSettings() {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [retentionDays, setRetentionDays] = useState(30);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trash", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load trash");
      const body = await res.json();
      setItems(body?.data?.items ?? []);
      if (body?.data?.retentionDays) setRetentionDays(body.data.retentionDays);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load trash");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = useCallback(
    async (item: TrashItem) => {
      setBusyId(item.id);
      try {
        const res = await fetch("/api/trash/restore", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: item.kind, id: item.id }),
        });
        if (!res.ok) throw new Error("Restore failed");
        toast.success("Restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const purge = useCallback(
    async (item: TrashItem) => {
      setBusyId(item.id);
      try {
        const res = await fetch("/api/trash/purge", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: item.kind, id: item.id }),
        });
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Permanently deleted");
        setConfirmPurgeId(null);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Trash &amp; Data</h1>
        <p className="text-muted-foreground mt-2">
          Deleted chats and documents are kept for {retentionDays} days, then
          permanently removed (along with their attachments). Restore anything
          before then, or delete it now.
        </p>
      </div>

      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-8 text-center text-sm text-gray-500">
          Trash is empty.
        </div>
      ) : (
        <div className="divide-y divide-black/5 dark:divide-white/5 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
          {items.map((item) => (
            <div
              key={`${item.kind}:${item.id}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              {item.kind === "chat" ? (
                <MessageSquare className="h-4 w-4 shrink-0 text-gray-500" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-gray-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {item.title || (item.kind === "chat" ? "Untitled chat" : "Untitled")}
                </div>
                <div className="text-xs text-gray-500">
                  {item.kind === "chat" ? "Chat" : item.contentType ?? "Document"}
                  {" · "}
                  {item.daysLeft === 0
                    ? "purges soon"
                    : `${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"} left`}
                </div>
              </div>

              <button
                onClick={() => void restore(item)}
                disabled={busyId === item.id}
                title="Restore"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/10 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </button>

              {confirmPurgeId === item.id ? (
                <button
                  onClick={() => void purge(item)}
                  disabled={busyId === item.id}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm
                </button>
              ) : (
                <button
                  onClick={() => setConfirmPurgeId(item.id)}
                  title="Delete permanently now"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:text-red-400 hover:bg-black/[0.04] dark:hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete now
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
