/**
 * DataToFlashcardsDialog
 *
 * "Create Flashcard Deck…" on a database node — pick a front column and
 * a back column, name the deck, and POST /api/flashcards/from-data turns
 * one row into one card. Re-running the same conversion is a sync, not a
 * duplicate import (cards match rows by id server-side), so the summary
 * toast reports created/updated/unchanged rather than a bare count.
 *
 * Store-driven + <Body>-mounts-while-open, mirroring
 * CharterDescriptionDialog so each open starts fresh with no reset
 * effect. Columns are fetched on open — the dialog can be launched from
 * the file tree, where no table state is loaded yet.
 */

"use client";

import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/glass/dialog";
import { Button } from "@/components/ui/glass/button";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDataFlashcardsDialogStore } from "@/state/data-flashcards-dialog-store";
import {
  findTableLink,
  useDataFlashcardsLinksStore,
} from "@/state/data-flashcards-links-store";
import { useExistingDeckPaths } from "@/components/content/ai/use-existing-deck-paths";
import { FLASHCARD_CHANGED_EVENT } from "@/extensions/flashcards/events";

interface ColumnOption {
  id: string;
  name: string;
  type: string;
  isPrimary: boolean;
}

interface ConvertResult {
  deckId: string;
  deckPath: string;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

const selectClass =
  "w-full rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-100";

export function DataToFlashcardsDialog() {
  const open = useDataFlashcardsDialogStore((s) => s.open);
  const contentId = useDataFlashcardsDialogStore((s) => s.contentId);
  const title = useDataFlashcardsDialogStore((s) => s.title);
  const close = useDataFlashcardsDialogStore((s) => s.close);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        {open && contentId && (
          <Body contentId={contentId} title={title} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  contentId,
  title,
  onClose,
}: {
  contentId: string;
  title: string;
  onClose: () => void;
}) {
  const [columns, setColumns] = useState<ColumnOption[] | null>(null);
  const [frontColumnId, setFrontColumnId] = useState("");
  const [backColumnId, setBackColumnId] = useState("");
  const [deckPath, setDeckPath] = useState(title || "Untitled");
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const deckListId = useId();
  const existingDecks = useExistingDeckPaths();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Load the link cache first so an already-converted table opens
        // prefilled with its saved mapping — the dialog then reads as
        // "Sync" rather than "Create".
        const linksStore = useDataFlashcardsLinksStore.getState();
        if (!linksStore.loaded) await linksStore.refresh();
        const link = findTableLink(
          useDataFlashcardsLinksStore.getState().links,
          contentId,
        );

        const res = await fetch(
          `/api/content/data/${encodeURIComponent(contentId)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error("load failed");
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            table?: {
              columns?: Array<ColumnOption & { deletedAt?: string | null }>;
            };
          };
        };
        const loaded = (json.data?.table?.columns ?? []).filter(
          (c) => !c.deletedAt,
        );
        if (!mounted) return;
        setColumns(loaded);
        // Saved link wins (its columns may have been deleted — fall
        // through to defaults then). Otherwise: primary column on the
        // front, first other column on the back — the "term → definition"
        // shape a two-column table implies.
        const front =
          (link && loaded.find((c) => c.id === link.frontColumnId)) ??
          loaded.find((c) => c.isPrimary) ??
          loaded[0];
        const back =
          (link &&
            loaded.find(
              (c) => c.id === link.backColumnId && c.id !== front?.id,
            )) ??
          loaded.find((c) => c.id !== front?.id);
        if (front) setFrontColumnId(front.id);
        if (back) setBackColumnId(back.id);
        if (link) {
          setLinked(true);
          if (link.deckPath) setDeckPath(link.deckPath);
        }
      } catch {
        if (mounted) {
          setColumns([]);
          setNotice("Couldn't load this database's columns.");
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [contentId]);

  const loading = columns === null;
  const tooFewColumns = !loading && columns.length < 2;
  const ready =
    !loading &&
    !tooFewColumns &&
    frontColumnId &&
    backColumnId &&
    frontColumnId !== backColumnId &&
    deckPath.trim().length > 0;

  async function handleConvert() {
    // `ready` also guards the Enter-key path, which bypasses the
    // disabled submit button.
    if (busy || !ready) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/flashcards/from-data", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          frontColumnId,
          backColumnId,
          deckPath: deckPath.trim(),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: ConvertResult;
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setBusy(false);
        setNotice(json.error?.message ?? "Couldn't create the deck — please try again.");
        return;
      }
      const r = json.data;
      const parts = [`${r.created} created`];
      if (r.updated > 0) parts.push(`${r.updated} updated`);
      if (r.unchanged > 0) parts.push(`${r.unchanged} unchanged`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped (blank)`);
      toast.success(`Deck "${r.deckPath}" — ${parts.join(", ")}`);
      // The link set changed server-side — refresh the cache that drives
      // the Create/Sync labels and the deck-row sync button.
      void useDataFlashcardsLinksStore.getState().refresh();
      window.dispatchEvent(new CustomEvent(FLASHCARD_CHANGED_EVENT));
      // Keeps the deck-path autocomplete cache warm (see use-existing-deck-paths).
      window.dispatchEvent(
        new CustomEvent("flashcard-deck-created", {
          detail: { deckPath: r.deckPath, deckId: r.deckId },
        }),
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
          <Layers className="h-4 w-4 text-indigo-400" />
          {linked ? "Sync Flashcard Deck" : "Create Flashcard Deck"}
        </DialogTitle>
      </DialogHeader>

      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-gray-400">
            Database
          </span>
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {title || "Untitled"}
          </p>
          <p className="text-xs text-gray-400">
            One card per row. The deck stays linked: opening it (or this
            database) syncs new and edited rows in without resetting review
            progress.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading columns…
          </div>
        ) : tooFewColumns ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            This database needs at least two columns to make cards.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="data-flashcards-front"
                  className="text-[11px] uppercase tracking-wide text-gray-400"
                >
                  Front (question)
                </label>
                <select
                  id="data-flashcards-front"
                  value={frontColumnId}
                  onChange={(e) => setFrontColumnId(e.target.value)}
                  className={selectClass}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="data-flashcards-back"
                  className="text-[11px] uppercase tracking-wide text-gray-400"
                >
                  Back (answer)
                </label>
                <select
                  id="data-flashcards-back"
                  value={backColumnId}
                  onChange={(e) => setBackColumnId(e.target.value)}
                  className={selectClass}
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {frontColumnId === backColumnId && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Front and back must be different columns.
              </p>
            )}

            <div className="space-y-1">
              <label
                htmlFor="data-flashcards-deck"
                className="text-[11px] uppercase tracking-wide text-gray-400"
              >
                Deck
              </label>
              <input
                id="data-flashcards-deck"
                type="text"
                value={deckPath}
                list={deckListId}
                onChange={(e) => {
                  setDeckPath(e.target.value);
                  if (notice) setNotice(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleConvert();
                  }
                }}
                placeholder="Deck name, or nested/path/like-this"
                className={selectClass}
              />
              <datalist id={deckListId}>
                {existingDecks.map((d) => (
                  <option key={d.id} value={d.path} />
                ))}
              </datalist>
              <p className="text-xs text-gray-400">
                Pick an existing deck or type a new one — missing decks are
                created, and <code className="text-[11px]">/</code> nests.
              </p>
            </div>
          </>
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
            onClick={handleConvert}
            disabled={busy || !ready}
            className="gap-1.5"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {linked ? "Syncing…" : "Creating…"}
              </>
            ) : linked ? (
              "Sync Deck"
            ) : (
              "Create Deck"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
