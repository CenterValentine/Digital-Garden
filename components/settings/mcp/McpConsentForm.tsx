"use client";

/**
 * The OAuth consent screen's form (/oauth/authorize). The grant controls are
 * the Settings → MCP token form itself (`McpGrantFields`); approving mints
 * the same kind of token, delivered to the app instead of shown once.
 *
 * Least privilege by default: only Read is ticked. What the app asked for is
 * marked "requested" so the owner can tick it deliberately.
 */

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/client/ui/button";
import type { McpCapability } from "@/lib/domain/mcp/capabilities";
import { McpGrantFields, useMcpGrantState, useMcpRootOptions } from "./McpGrantFields";

export interface McpConsentFormProps {
  params: Record<string, string>;
  clientName: string;
  redirectTarget: string;
  requested: McpCapability[];
  signedInAs: string;
  defaultExpiresDays: number;
}

export function McpConsentForm({ params, clientName, redirectTarget, requested, signedInAs, defaultExpiresDays }: McpConsentFormProps) {
  const grantForm = useMcpGrantState({ expiresDays: String(defaultExpiresDays) });
  const rootOptions = useMcpRootOptions();
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: "allow" | "deny") => {
    setBusy(decision);
    setError(null);
    try {
      const { caps, roots, allChats, expiresDays } = grantForm.state;
      const res = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params,
          decision,
          grant: { capabilities: [...caps], rootIds: [...roots], allChats, expiresInDays: expiresDays.trim() || null },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Could not complete the request");
      window.location.assign(json.data.redirectUrl as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the request");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Connect {clientName} to your garden?</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {signedInAs}. Approving gives {clientName} an MCP access token with exactly what you tick
            below, and returns you to <span className="font-mono">{redirectTarget}</span>. You can revoke it any time on
            Settings → MCP.
          </p>
        </div>
      </div>

      <McpGrantFields
        state={grantForm.state}
        rootOptions={rootOptions}
        disabled={busy !== null}
        requested={new Set(requested)}
        onToggleCap={grantForm.toggleCap}
        onToggleRoot={grantForm.toggleRoot}
        onAllChats={grantForm.setAllChats}
        onExpiresDays={grantForm.setExpiresDays}
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => decide("deny")} disabled={busy !== null}>
          {busy === "deny" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Deny
        </Button>
        <Button type="button" onClick={() => decide("allow")} disabled={busy !== null}>
          {busy === "allow" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Approve
        </Button>
      </div>
    </div>
  );
}
