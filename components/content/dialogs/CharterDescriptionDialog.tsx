/**
 * CharterDescriptionDialog
 *
 * "Mark as Playbook" / "Edit Playbook Description" — a centered modal for the
 * one-line description shown in the /playbook picker. Opened from the file-tree
 * context menu (v3.6 moved this off the editor menu). A modal, not an inline
 * menu input: an inline input grows the context menu past the viewport and
 * forces a page scroll. The playbook NAME is always the file title (read-only
 * here); marking just flags NotePayload.metadata via POST /charters/mark
 * (idempotent upsert, so the same route saves an edited description).
 *
 * Store-driven + <Body>-mounts-while-open, mirroring ImportSkillDialog so each
 * open starts fresh with no reset effect.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";
import { Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { useCharterDialogStore } from "@/state/charter-dialog-store";

export function CharterDescriptionDialog() {
  const open = useCharterDialogStore((s) => s.open);
  const contentId = useCharterDialogStore((s) => s.contentId);
  const title = useCharterDialogStore((s) => s.title);
  const description = useCharterDialogStore((s) => s.description);
  const editing = useCharterDialogStore((s) => s.editing);
  const close = useCharterDialogStore((s) => s.close);

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
  // Preflight (D5): does this charter already have a body? The starter
  // template is offered ONLY when it does not — on anything already written,
  // the option would be proposing to overwrite the user's own work.
  // `null` = not known yet, so the option stays hidden rather than flickering
  // in and out while the request is in flight.
  const [hasBody, setHasBody] = useState<boolean | null>(null);
  const [useStarter, setUseStarter] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/content/charters/mark?contentId=${encodeURIComponent(contentId)}`,
      { credentials: "include" },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        // Unknown degrades to "has a body" — the conservative read, since it
        // hides the option rather than offering a write we cannot justify.
        setHasBody(json?.data?.hasBody !== false);
      })
      .catch(() => {
        if (!cancelled) setHasBody(true);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const offerStarter = hasBody === false && !editing;

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/content/charters/mark", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          description: description.trim(),
          // The route re-checks emptiness itself; this only carries intent.
          scaffold: offerStarter && useStarter,
        }),
      });
      if (!res.ok) {
        setBusy(false);
        setNotice("Couldn't save — please try again.");
        return;
      }
      // The route reports whether this charter has a BODY (D5). A charter is
      // a written commissioning document; the marker alone is a label on a
      // blank page. Marking a folder with no NotePayload row makes the route
      // CREATE an empty document — so the promotion itself mints the empty
      // charter, and the old toast then promised it was ready to attach.
      // It is not: attaching a bodyless charter reports "contains no
      // instructions" and the run goes nowhere. Say which one they have.
      const marked = (await res.json().catch(() => null)) as {
        hasBody?: boolean;
        phaseCount?: number;
        scaffolded?: boolean;
        /** Starter headings still reading "[name the … phase]". */
        templatePhases?: number;
        /** The master ledger minted (or found) at mark — referenced content. */
        masterLedgerId?: string | null;
        masterLedgerCreated?: boolean;
      } | null;
      const markedHasBody = marked?.hasBody !== false;
      const templatePhases = marked?.templatePhases ?? 0;
      const ledgerNote = marked?.masterLedgerId
        ? " Its master ledger is under its reference chip."
        : "";
      window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
      if (editing) {
        // Re-marking an older charter is the backfill path for the ledger.
        toast.success(
          marked?.masterLedgerCreated
            ? "Charter details updated — master ledger created under its reference chip"
            : "Charter details updated",
        );
      } else if (marked?.scaffolded) {
        toast.success("Marked as charter — added a starter outline", {
          description:
            "Open it and fill in the bracketed parts. Text before the first heading is its standing rules; each ## heading is a phase." +
            ledgerNote,
          duration: 8000,
        });
      } else if (markedHasBody && templatePhases > 0) {
        // Real sections pasted under an untouched scaffold: a run would start
        // on "[name the first phase]".
        toast.warning(
          `Marked as charter — ${templatePhases} phase heading${templatePhases === 1 ? " is" : "s are"} still a starter placeholder`,
          {
            description:
              'Rename or delete the "[name the … phase]" headings before running; a run starts with the first phase it finds.' +
              ledgerNote,
            duration: 8000,
          },
        );
      } else if (markedHasBody) {
        const phases = marked?.phaseCount ?? 0;
        toast.success(
          phases > 0
            ? `Marked as charter (${phases} phase${phases === 1 ? "" : "s"}) — open a chat on it, or attach it anywhere with /charter.${ledgerNote}`
            : `Marked as charter — open a chat on it, or attach it anywhere with /charter.${ledgerNote}`,
        );
      } else {
        toast.warning("Marked as charter — but it's empty", {
          description:
            "Open it and write what it should do. Text before the first heading is its standing rules; each ## heading is a phase. Until then, running it does nothing.",
          duration: 8000,
        });
      }
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
          <ScrollText className="h-4 w-4 text-indigo-400" />
          {editing ? "Edit Charter Details" : "Mark as Charter"}
        </DialogTitle>
      </DialogHeader>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">
            Charter
          </span>
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {title || "Untitled"}
          </p>
          <p className="text-xs text-gray-400">
            The charter name is the file name. Text before the first heading is
            its standing rules; each{" "}
            <code className="text-[11px]">##</code> section is a phase. A
            charter with nothing written in it does nothing when run.
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
            placeholder="One-line summary shown in the /charter picker…"
            spellCheck
            rows={3}
            className="w-full resize-y rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none focus:border-indigo-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100"
          />
        </div>

        {offerStarter && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-indigo-400/25 bg-indigo-500/[0.05] px-2.5 py-2">
            <input
              type="checkbox"
              checked={useStarter}
              onChange={(e) => setUseStarter(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-current"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-gray-900 dark:text-gray-100">
                Start from a template
              </span>
              <span className="block text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                This one is empty. Adds a starter outline — standing rules, a
                Context section, and two phases with{" "}
                <code className="text-[10px]">Done when:</code> conditions — for
                you to fill in.
              </span>
            </span>
          </label>
        )}

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
              "Mark as Charter"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
