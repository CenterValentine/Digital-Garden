/**
 * Admin AI Run Inspector — conversation detail.
 *
 * Step-level timeline of every turn with derived findings, inferred request
 * segments, usage, and raw parts JSON. Read-only view over
 * /api/admin/ai-runs/[conversationId].
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSurfaceStyles } from "@/lib/design/system";
import type { AiRunDetailData } from "@/lib/domain/ai/run-inspector/api-types";
import { Skeleton } from "@/components/client/ui/skeleton";
import { Button } from "@/components/client/ui/button";
import { toast } from "sonner";
import { TurnCard } from "@/components/admin/ai-runs/TurnCard";

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export default function AiRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<AiRunDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  const glass0 = getSurfaceStyles("glass-0");

  useEffect(() => {
    fetch(`/api/admin/ai-runs/${params.conversationId}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setData(result.data);
        } else {
          toast.error(result.error ?? "Failed to load run");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch run:", err);
        toast.error("Failed to load run");
        setLoading(false);
      });
  }, [params.conversationId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Run not found.
        </p>
        <Button variant="outline" onClick={() => router.push("/admin/ai-runs")}>
          Back to AI runs
        </Button>
      </div>
    );
  }

  const { conversation, diagnostics, messages } = data;
  const rawById = new Map(messages.map((m) => [m.id, m]));
  const { totals } = diagnostics;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className="rounded-lg border border-black/10 p-4 dark:border-white/10"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">
              {conversation.title ?? "Untitled conversation"}
            </h1>
            <p className="mt-0.5 font-mono text-[11px] text-gray-500 dark:text-gray-400">
              {conversation.id}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/admin/ai-runs")}
          >
            Back
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-600 dark:text-gray-300">
          {conversation.ownerEmail ? <span>{conversation.ownerEmail}</span> : null}
          <span>
            updated {new Date(conversation.updatedAt).toLocaleString()}
          </span>
          <span>{totals.assistantTurns} assistant turns</span>
          <span>{formatInt(totals.requestCount)} requests</span>
          <span>
            {formatInt(totals.inputTokens)} in / {formatInt(totals.outputTokens)}{" "}
            out tokens
          </span>
          {totals.reasoningTokens > 0 ? (
            <span>{formatInt(totals.reasoningTokens)} reasoning tokens</span>
          ) : null}
          {diagnostics.modelsUsed.map((model) => (
            <span key={model} className="font-mono">
              {model}
            </span>
          ))}
          <span
            className={
              totals.findingsBySeverity.error > 0
                ? "text-red-600 dark:text-red-400"
                : totals.findingsBySeverity.warning > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
            }
          >
            {totals.findingsBySeverity.error} errors ·{" "}
            {totals.findingsBySeverity.warning} warnings
          </span>
        </div>
        {conversation.associations.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-gray-500 dark:text-gray-400">linked:</span>
            {conversation.associations.map((assoc) => (
              <Link
                key={assoc.contentNodeId}
                href={`/content?content=${assoc.contentNodeId}`}
                className="font-mono text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                {assoc.contentNodeId.slice(0, 8)}… ({assoc.source})
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* Turns */}
      {diagnostics.turns.map((turn) => (
        <TurnCard
          key={turn.messageId}
          turn={turn}
          raw={rawById.get(turn.messageId)}
        />
      ))}
      {diagnostics.turns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No messages in this conversation.
        </p>
      ) : null}
    </div>
  );
}
