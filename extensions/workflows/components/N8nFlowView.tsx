"use client";

import { useCallback, useState } from "react";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { toast } from "sonner";

/**
 * Content viewer for a native "n8n Flow" — authored in n8n's own editor
 * (hybrid model). DG owns the run history + inbox gates; authoring is n8n's
 * editor embedded in an iframe (served same-site at n8n.notetrellis.com so
 * framing + cookies work — see N8N-EMBED-RUNBOOK.md). A "pop out" link opens
 * the same editor in a full tab as a fallback.
 */
export function N8nFlowView({
  contentId,
  title,
  editorUrl,
}: {
  contentId: string;
  title: string;
  editorUrl: string;
}) {
  const [running, setRunning] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/workflows/content/${contentId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to start run");
      }
      toast.success("Run started — watch it in the Workflows panel");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start run");
    } finally {
      setRunning(false);
    }
  }, [contentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-white/90 px-4 py-2 backdrop-blur dark:border-white/10 dark:bg-gray-950/90">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#ea4b71]/10 text-[#ea4b71]">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <circle cx="6" cy="12" r="2.4" />
              <circle cx="18" cy="6" r="2.4" />
              <circle cx="18" cy="18" r="2.4" />
              <path d="M8 12 L16 6 M8 12 L16 18" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </span>
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="shrink-0 rounded-full bg-[#ea4b71]/10 px-2 py-0.5 text-xs text-[#ea4b71]">
            n8n
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </button>
          <a
            href={editorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
            title="Open the n8n editor in a full tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Pop out
          </a>
        </div>
      </div>

      <iframe
        src={editorUrl}
        title={`n8n editor — ${title}`}
        className="h-full w-full flex-1 border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
