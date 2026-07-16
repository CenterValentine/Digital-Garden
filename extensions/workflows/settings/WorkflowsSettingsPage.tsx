"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/client/ui/button";
import { Input } from "@/components/client/ui/input";
import { SettingSection } from "@/components/settings/ui";
import type { ServiceTokenDto } from "@/extensions/workflows/shared";
import { WorkflowErrorHandlingSection } from "./WorkflowErrorHandlingSection";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Workflow service-token (PAT) management. Registered as the workflows
 * extension `settingsDialog`, so it renders both in the Extensions dialog and
 * at /settings/extensions/workflows. The parent shell provides the page frame;
 * this component renders section cards only.
 */
export default function WorkflowsSettingsPage() {
  const [tokens, setTokens] = useState<ServiceTokenDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  // The plaintext token is held only transiently, right after creation.
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows/tokens");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to load tokens");
      }
      setTokens(json.data.tokens as ServiceTokenDto[]);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load tokens");
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/workflows/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to create token");
      }
      setFreshToken(json.data.token as string);
      setCopied(false);
      setName("");
      setTokens((prev) => [json.data.record as ServiceTokenDto, ...(prev ?? [])]);
      toast.success("Service token created — copy it now");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }, [name]);

  const handleCopy = useCallback(async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
      toast.success("Token copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }, [freshToken]);

  const handleRevoke = useCallback(
    async (id: string) => {
      if (!window.confirm("Revoke this token? Any engine using it will stop authenticating immediately.")) {
        return;
      }
      setRevokingId(id);
      try {
        const res = await fetch(`/api/workflows/tokens/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || "Failed to revoke token");
        }
        setTokens((prev) =>
          (prev ?? []).map((t) => (t.id === id ? (json.data.record as ServiceTokenDto) : t))
        );
        toast.success("Token revoked");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to revoke token");
      } finally {
        setRevokingId(null);
      }
    },
    []
  );

  const handleDelete = useCallback(async (id: string) => {
    setPurgingId(id);
    try {
      const res = await fetch(`/api/workflows/tokens/${id}?purge=true`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || "Failed to remove token");
      }
      setTokens((prev) => (prev ?? []).filter((t) => t.id !== id));
      toast.success("Token removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove token");
    } finally {
      setPurgingId(null);
    }
  }, []);

  const activeTokens = (tokens ?? []).filter((t) => !t.revokedAt);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Workflow engine tokens"
        description="Personal access tokens let an external execution engine (like a self-hosted n8n) post run events, gates, and artifacts back to Digital Garden. Present the token as a Bearer credential to the workflow callback API. Usually one token is all you need."
      >
        {/* Freshly-created token — shown exactly once. */}
        {freshToken && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">
                  Copy this token now — it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-black/5 px-3 py-2 font-mono text-xs dark:bg-white/10">
                    {freshToken}
                  </code>
                  <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setFreshToken(null)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Done — dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create form */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="wf-token-name" className="text-sm font-medium">
              Token name
            </label>
            <Input
              id="wf-token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. n8n on home server"
              maxLength={120}
              disabled={creating}
            />
          </div>
          <Button type="button" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            <span className="ml-1.5">Generate token</span>
          </Button>
        </div>

        {/* Token list */}
        <div className="space-y-2">
          {tokens === null ? (
            <p className="text-sm text-muted-foreground">Loading tokens…</p>
          ) : loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tokens yet. Generate one to connect an execution engine.
            </p>
          ) : (
            tokens.map((token) => {
              const revoked = Boolean(token.revokedAt);
              return (
                <div
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3 dark:border-white/10"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={revoked ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>
                        {token.name}
                      </span>
                      <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs text-muted-foreground dark:bg-white/10">
                        {token.tokenPrefix}…
                      </code>
                      {revoked && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
                          Revoked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {formatDate(token.createdAt)} · Last used {formatDate(token.lastUsedAt)}
                    </p>
                  </div>
                  {revoked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleDelete(token.id)}
                      disabled={purgingId === token.id}
                      title="Remove this revoked token from the list"
                    >
                      {purgingId === token.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Remove</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 dark:text-red-400"
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                    >
                      {revokingId === token.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">Revoke</span>
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {activeTokens.length > 1 && (
          <p className="text-xs text-muted-foreground">
            You have {activeTokens.length} active tokens. Revoke any you no longer use — each one is a valid credential to the callback surface.
          </p>
        )}
      </SettingSection>

      <WorkflowErrorHandlingSection />
    </div>
  );
}
