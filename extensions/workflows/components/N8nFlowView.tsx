"use client";

import { useCallback, useState } from "react";
import { ExternalLink, Loader2, Play, Workflow } from "lucide-react";
import { toast } from "sonner";

import { getSurfaceStyles } from "@/lib/design/system";

/**
 * Content viewer for a native "n8n Flow" — authored in n8n's own editor
 * (hybrid model). DG owns the run history + inbox; authoring is a deep-link out
 * to n8n (an embedded iframe replaces this button once n8n is served
 * same-origin — reverse-proxy follow-up). Runs trigger the seeded webhook.
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
  const glass0 = getSurfaceStyles("glass-0");
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
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ea4b71]/10 text-[#ea4b71]">
        <Workflow className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          This is an <strong>n8n Flow</strong> — you build it in n8n&apos;s own
          editor (all ~1000 integrations), and Digital Garden owns the run
          history and inbox gates. Runs appear in the Workflows panel.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={editorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-[#ea4b71] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#d43d63]"
        >
          <ExternalLink className="h-4 w-4" />
          Open in n8n editor
        </a>
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
          style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run
        </button>
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        The flow is seeded with a Webhook trigger and a &ldquo;DG: Finish
        run&rdquo; node so runs complete in your timeline. Drop in DG helper
        nodes for supervision gates. (An in-app embed replaces this deep-link
        once n8n is served under the app domain.)
      </p>
    </div>
  );
}
