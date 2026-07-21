"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/client/ui/button";
import { SettingSection } from "@/components/settings/ui";

/**
 * Per-user "Workflow error handling" settings. n8n Flows route crashes to a
 * shared DG Error Handler workflow (which marks the run failed) — set up /
 * editable here. Trellis flows fail their run automatically (built-in), shown
 * for symmetry.
 */
export function WorkflowErrorHandlingSection() {
  const [loading, setLoading] = useState(true);
  const [handler, setHandler] = useState<{ configured: boolean; editorUrl?: string }>({
    configured: false,
  });
  const [setting, setSetting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows/n8n/error-handler");
      const json = await res.json();
      if (res.ok && json.success) setHandler(json.data);
    } catch {
      // leave as not-configured; the Set-up button still works
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSetup = useCallback(async () => {
    setSetting(true);
    try {
      const res = await fetch("/api/workflows/n8n/error-handler", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to set up error handler");
      }
      setHandler({ configured: true, editorUrl: json.data.editorUrl });
      toast.success(json.data.created ? "Error handler created" : "Error handler ready");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to set up error handler"
      );
    } finally {
      setSetting(false);
    }
  }, []);

  return (
    <SettingSection
      title="Workflow error handling"
      description="What happens when a workflow run fails."
    >
      {/* n8n Flows */}
      <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <span className="inline-block rounded-full bg-[#ea4b71]/10 px-2 py-0.5 text-xs font-medium text-[#ea4b71]">
          n8n Flows
        </span>
        <p className="text-sm text-muted-foreground">
          A shared <strong>DG Error Handler</strong> catches any n8n Flow crash and
          marks its run <strong>failed</strong> in your inbox. Customize it in
          n8n if you want to add alerts of your own.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : handler.configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <ShieldCheck className="h-3.5 w-3.5" /> Active
            </span>
            {handler.editorUrl && (
              <a
                href={handler.editorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-black/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Edit in n8n
              </a>
            )}
          </div>
        ) : (
          <Button type="button" size="sm" onClick={handleSetup} disabled={setting}>
            {setting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            <span className="ml-1.5">Set up error handler</span>
          </Button>
        )}
      </div>

      {/* Trellis Flows */}
      <div className="space-y-1.5 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
          Trellis Flows
        </span>
        <p className="text-sm text-muted-foreground">
          Trellis (the built-in engine) marks a run <strong>failed</strong>{" "}
          automatically when a step errors — no setup needed. The failure shows in
          your inbox with the error message.
        </p>
      </div>
    </SettingSection>
  );
}
