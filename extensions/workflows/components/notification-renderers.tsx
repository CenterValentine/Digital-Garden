"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";
import type { NotificationDTO } from "@/lib/domain/notifications/types";
import type { NotificationKindRenderer } from "@/lib/features/notifications/kind-renderer-types";

function payloadString(
  notification: NotificationDTO,
  key: string
): string | null {
  const value = (notification.payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function GateBody({ notification }: { notification: NotificationDTO }) {
  const title = payloadString(notification, "title") ?? "Workflow awaiting review";
  const workflowName = payloadString(notification, "workflowName");
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-gray-900 dark:text-gray-100">
        {title}
      </p>
      {workflowName ? (
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {workflowName}
        </p>
      ) : null}
    </div>
  );
}

function GateActions({ notification }: { notification: NotificationDTO }) {
  const [busy, setBusy] = useState(false);
  const runId = payloadString(notification, "runId");
  const gateToken = payloadString(notification, "gateToken");

  const approve = useCallback(async () => {
    if (!runId || !gateToken) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workflows/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: gateToken, payload: { approved: true } }),
      });
      if (!response.ok) {
        // Only an already-resumed gate (409 GATE_MISMATCH) is informative;
        // anything else is a real failure and must surface as one.
        if (response.status === 409) {
          toast.info("This gate is no longer waiting.");
          return;
        }
        let message = "Failed to approve.";
        try {
          const json: unknown = await response.json();
          if (json && typeof json === "object" && "error" in json) {
            const err = (json as { error?: { message?: unknown } }).error;
            if (err && typeof err.message === "string" && err.message) {
              message = err.message;
            }
          }
        } catch {
          // keep the generic message
        }
        toast.error(message);
        return;
      }
      toast.success("Approved — workflow resuming");
    } catch {
      toast.error("Failed to approve.");
    } finally {
      setBusy(false);
    }
  }, [runId, gateToken]);

  if (!runId || !gateToken) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void approve()}
      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Approve
    </button>
  );
}

function FinishedBody({ notification }: { notification: NotificationDTO }) {
  const title = payloadString(notification, "title") ?? "Workflow finished";
  const status = payloadString(notification, "status");
  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-gray-900 dark:text-gray-100">
        {title}
      </p>
      {status ? (
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {status}
        </p>
      ) : null}
    </div>
  );
}

export const workflowNotificationKindRenderers: Record<
  string,
  NotificationKindRenderer
> = {
  "workflow.gate": {
    icon: Workflow,
    Body: GateBody,
    Actions: GateActions,
  },
  "workflow.finished": {
    icon: CheckCircle2,
    Body: FinishedBody,
  },
};
