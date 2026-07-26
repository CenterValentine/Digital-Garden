/**
 * PlaybookDescriptionDialog
 *
 * "Mark as Playbook" / "Edit Playbook Description" — a centered modal for the
 * one-line description shown in the /playbook picker. Opened from the file-tree
 * context menu (v3.6 moved this off the editor menu). A modal, not an inline
 * menu input: an inline input grows the context menu past the viewport and
 * forces a page scroll. The playbook NAME is always the file title (read-only
 * here); marking just flags NotePayload.metadata via POST /playbooks/mark
 * (idempotent upsert, so the same route saves an edited description).
 *
 * Store-driven + <Body>-mounts-while-open, mirroring ImportSkillDialog so each
 * open starts fresh with no reset effect.
 */

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";
import { BookMarked, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePlaybookDialogStore } from "@/state/playbook-dialog-store";

export function PlaybookDescriptionDialog() {
  const open = usePlaybookDialogStore((s) => s.open);
  const contentId = usePlaybookDialogStore((s) => s.contentId);
  const title = usePlaybookDialogStore((s) => s.title);
  const description = usePlaybookDialogStore((s) => s.description);
  const editing = usePlaybookDialogStore((s) => s.editing);
  const close = usePlaybookDialogStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        {open && contentId && (
          <Body
            contentId={contentId}
            title={title}
            initialDescription={description}
            editing={editing}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  contentId,
  title,
  initialDescription,
  editing,
  onClose,
}: {
  contentId: string;
  title: string;
  initialDescription: string;
  editing: boolean;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/content/playbooks/mark", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId, description: description.trim() }),
      });
      if (!res.ok) {
        setBusy(false);
        setNotice("Couldn't save — please try again.");
        return;
      }
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      toast.success(
        editing
          ? "Playbook description updated"
          : "Marked as playbook — attach it from any chat with /playbook",
      );
      onClose();
    } catch {
      setBusy(false);
      setNotice("Network error — please try again.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-indigo-400" />
          {editing ? "Edit Playbook Description" : "Mark as Playbook"}
        </DialogTitle>
      </DialogHeader>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">
            Playbook
          </span>
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {title || "Untitled"}
          </p>
          <p className="text-xs text-gray-400">
            The playbook name is the file name. Its{" "}
            <code className="text-[11px]">##</code> sections are its phases.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="playbook-description"
            className="text-[11px] uppercase tracking-wide text-gray-400"
          >
            Description
          </label>
          <textarea
            id="playbook-description"
            value={description}
            autoFocus
            onChange={(e) => {
              setDescription(e.target.value);
              if (notice) setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSave();
              }
            }}
            placeholder="One-line summary shown in the /playbook picker…"
            spellCheck
            rows={3}
            className="w-full resize-y rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-indigo-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"
          />
        </div>

        {notice && (
          <p className="text-xs text-amber-600 dark:text-amber-400">{notice}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={busy}
            className="gap-1.5"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : editing ? (
              "Save"
            ) : (
              "Mark as Playbook"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
