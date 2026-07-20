/**
 * TrashSettings — Settings → Trash.
 *
 * Lists the user's soft-deleted chats + orphaned documents, each with the
 * days left before the daily cron auto-purges it (30-day retention).
 * Supports restore and immediate permanent delete.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Loader2,
  MessageSquare,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/client/ui/button";
import { SettingsEmptyState, SettingsPage } from "@/components/settings/ui";

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
    <SettingsPage
      title="Trash"
      description={`Deleted chats and documents are kept for ${retentionDays} days, then permanently removed along with their attachments. Restore anything before then, or delete it now.`}
    >
      {items === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <SettingsEmptyState
          icon={<Trash2 />}
          title="Trash is empty"
          description="Deleted chats and documents will appear here."
        />
      ) : (
        <div className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10 dark:divide-white/5 dark:border-white/10">
          {items.map((item) => (
            <div
              key={`${item.kind}:${item.id}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              {item.kind === "chat" ? (
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {item.title ||
                    (item.kind === "chat" ? "Untitled chat" : "Untitled")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.kind === "chat" ? "Chat" : item.contentType ?? "Document"}
                  {" · "}
                  {item.daysLeft === 0
                    ? "purges soon"
                    : `${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"} left`}
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void restore(item)}
                disabled={busyId === item.id}
                title="Restore"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </Button>

              {confirmPurgeId === item.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => void purge(item)}
                  disabled={busyId === item.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Confirm
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-600 dark:hover:text-destructive"
                  onClick={() => setConfirmPurgeId(item.id)}
                  title="Delete permanently now"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete now
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsPage>
  );
}
