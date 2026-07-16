"use client";

/**
 * Toolbar privacy toggle: whether AI context may read this content.
 *
 * Eye = readable, EyeOff (amber) = opted out — the eye pair moved here from
 * the publishing pill (which now uses Globe/GlobeLock), keeping "eye =
 * visibility to a reader" semantics: here the reader is the AI.
 *
 * State comes from the metadata GET with ?probe=1 — a pure read that never
 * schedules an auto-refresh, so mounting the toolbar doesn't count as
 * "accessing context".
 */

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function AiContextToggleButton({ contentId }: { contentId: string }) {
  // Keyed by the content it was probed for; render state is derived so the
  // fetch effect never sets state synchronously (React Compiler rule).
  const [result, setResult] = useState<{
    forId: string;
    optedOut: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/metadata/${contentId}?probe=1`)
      .then(async (res) => {
        const body = await res.json();
        if (!cancelled && res.ok && body.success) {
          setResult({ forId: contentId, optedOut: !!body.data.optedOut });
        }
      })
      .catch(() => {
        /* toolbar affordance only — stay hidden on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const current = result?.forId === contentId ? result : null;

  const toggle = useCallback(() => {
    if (!current || busy) return;
    const next = !current.optedOut;
    setBusy(true);
    fetch(`/api/studio/metadata/${contentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextOptOut: next }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        setResult({ forId: contentId, optedOut: !!body.data.optedOut });
        toast.success(
          next
            ? "AI context will no longer read this content"
            : "AI context can read this content again"
        );
      })
      .catch(() => toast.error("Could not update AI-context privacy"))
      .finally(() => setBusy(false));
  }, [busy, contentId, current]);

  // Render nothing until probed — never flash the wrong privacy state.
  if (!current) return null;

  const label = current.optedOut
    ? "AI context is blocked for this content — click to allow"
    : "AI context may read this content — click to block";

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
        current.optedOut
          ? "text-amber-500 hover:text-amber-600"
          : "text-muted-foreground hover:text-foreground"
      }`}
      title={label}
      aria-label={label}
      aria-pressed={current.optedOut}
      type="button"
    >
      {current.optedOut ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
    </button>
  );
}
