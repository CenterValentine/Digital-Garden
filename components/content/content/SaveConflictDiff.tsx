/**
 * SaveConflictDiff — the resolver for a blocked save.
 *
 * Replaces the earlier read-only "their version" preview, which showed one
 * side at a time and left the user to hold the other in their head. In a long
 * document that is not a real choice: you cannot tell whether "theirs" is a
 * small correction or a rewrite without reading both end to end.
 *
 * The header answers that before any scrolling — what changed, where, and how
 * big the gap is — and the two resolution buttons sit beside the evidence
 * rather than behind a close-and-go-back step.
 */

"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { compareVersions } from "@/lib/domain/content/conflict-diff";

interface SaveConflictDiffProps {
  open: boolean;
  /** The local edits — what "Keep mine" would publish. */
  mine: JSONContent | null;
  /** The server's current copy — what "Take theirs" would load. */
  theirs: JSONContent | null;
  /** When the server copy was last written, if known. */
  theirsUpdatedAt: string | null;
  loading: boolean;
  error: string | null;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  onClose: () => void;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** One summary number with its label. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: "add" | "remove" }) {
  const toneClass =
    tone === "add"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "remove"
        ? "text-red-600 dark:text-red-400"
        : "text-neutral-800 dark:text-neutral-100";
  return (
    <div className="min-w-0">
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
    </div>
  );
}

export function SaveConflictDiff({
  open,
  mine,
  theirs,
  theirsUpdatedAt,
  loading,
  error,
  onKeepMine,
  onTakeTheirs,
  onClose,
}: SaveConflictDiffProps) {
  // Diffing a long document is not free, and this re-renders on every parent
  // state change while the dialog is open.
  const comparison = useMemo(
    () => (open && mine && theirs ? compareVersions(mine, theirs) : null),
    [open, mine, theirs],
  );

  if (!open) return null;

  const theirsWhen = relativeTime(theirsUpdatedAt);
  const wordDelta = comparison ? comparison.mine.words - comparison.theirs.words : 0;

  // PORTALED to document.body, and at the app's z-[200] modal level.
  //
  // z-index alone was not enough. This renders inside a pane whose glass
  // surface sets `backdrop-filter`, which creates a stacking context — so
  // `position: fixed` was contained by that pane and the side panels painted
  // straight over the dialog (owner report, 2026-09-16). A portal escapes the
  // containing block entirely; the z-index then only has to agree with the
  // app's other modals. Same pattern the context menu already uses.
  const dialog = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Compare your version with the server version"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-black/5 px-5 py-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Saving is paused
              </p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                Compare the two versions
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800 dark:hover:bg-white/10 dark:hover:text-neutral-100"
              aria-label="Close comparison"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {comparison && (
            <>
              <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3">
                <Fact label="lines you added" value={`+${comparison.added}`} tone="add" />
                <Fact label="lines they have" value={`−${comparison.removed}`} tone="remove" />
                <Fact
                  label="your word count"
                  value={`${comparison.mine.words.toLocaleString()}${
                    wordDelta === 0 ? "" : wordDelta > 0 ? ` (+${wordDelta})` : ` (${wordDelta})`
                  }`}
                />
                <Fact label="their word count" value={comparison.theirs.words.toLocaleString()} />
                {theirsWhen && <Fact label="they saved" value={theirsWhen} />}
              </div>

              {comparison.changedSections.length > 0 && (
                <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">
                  <span className="font-medium">Differences in:</span>{" "}
                  {comparison.changedSections.slice(0, 6).join(" · ")}
                  {comparison.changedSections.length > 6 &&
                    ` · +${comparison.changedSections.length - 6} more`}
                </p>
              )}

              {comparison.identical && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  The two versions are identical. Either button resolves this safely.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Diff ───────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-50 px-5 py-4 dark:bg-neutral-950/40">
          {loading && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading the server version…
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Couldn&apos;t load the server version: {error}
            </p>
          )}
          {comparison && (
            <div className="font-mono text-[12.5px] leading-relaxed">
              {comparison.rows.map((row, i) => {
                if (row.kind === "same") {
                  return (
                    <div
                      key={i}
                      className="whitespace-pre-wrap px-2 text-neutral-500 dark:text-neutral-500"
                    >
                      <span className="select-none pr-2 opacity-40"> </span>
                      {row.text || " "}
                    </div>
                  );
                }
                const isAdd = row.kind === "added";
                return (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap rounded px-2 ${
                      isAdd
                        ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200"
                    }`}
                  >
                    <span className="select-none pr-2 opacity-60">{isAdd ? "+" : "−"}</span>
                    {row.words
                      ? row.words.map((w, j) => (
                          <span
                            key={j}
                            className={
                              w.changed
                                ? isAdd
                                  ? "rounded bg-emerald-200/70 dark:bg-emerald-400/25"
                                  : "rounded bg-red-200/70 dark:bg-red-400/25"
                                : ""
                            }
                          >
                            {w.text}
                          </span>
                        ))
                      : row.text || " "}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Resolve ────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/5 px-5 py-3 dark:border-white/10">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            <span className="text-emerald-600 dark:text-emerald-400">Green</span> is yours ·{" "}
            <span className="text-red-600 dark:text-red-400">red</span> is theirs
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onTakeTheirs}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              Take theirs
            </button>
            <button
              type="button"
              onClick={onKeepMine}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
            >
              Keep mine
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
