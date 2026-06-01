/**
 * HostManagement — custom hostname claiming UI for a single tenant.
 *
 * Renders inside the Sites settings page when the user expands a site
 * row. Three states per host:
 *   - Pending verification: shows DNS records to configure + "Verify" button
 *   - Verified: shows green badge + "Remove" button
 *   - Auto-managed (from backfill, like davidvalentine.org): shows lock icon
 *
 * Vercel Domains API is the source of truth for verification status. We
 * mirror it in the TenantHost table; the proxy filters to verified rows.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

type DnsInstruction = {
  recordType: "CNAME" | "A";
  recordName: string;
  recordValue: string;
  rationale: string;
};

type VercelConfigData = {
  verification?: { type: string; domain: string; value: string; reason: string }[];
  dnsInstructions?: DnsInstruction[];
};

export type HostRow = {
  host: string;
  isPrimary: boolean;
  createdAt: string;
  verifiedAt: string | null;
  vercelConfigData: VercelConfigData | null;
};

type HostsResponse = {
  hosts: HostRow[];
  // Phase 12 fields. Always present after the backend ships; defaulted
  // for forward-compat if the response is somehow truncated.
  canClaimCustomHosts?: boolean;
  tenantSlug?: string;
  platformDomain?: string | null;
};

interface HostManagementProps {
  tenantId: string;
  tenantSlug: string;
}

export function HostManagement({ tenantId, tenantSlug }: HostManagementProps) {
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newHost, setNewHost] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false);
  const [verifyingHost, setVerifyingHost] = useState<string | null>(null);
  // Phase 12 permission state. Default to false so the form stays hidden
  // until the server confirms permission — fails-closed during loading.
  const [canClaim, setCanClaim] = useState(false);
  const [platformDomain, setPlatformDomain] = useState<string | null>(null);

  const loadHosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/user/tenants/${tenantId}/hosts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as HostsResponse;
      setHosts(data.hosts);
      setCanClaim(data.canClaimCustomHosts === true);
      setPlatformDomain(data.platformDomain ?? null);
    } catch (err) {
      toast.error("Failed to load hosts", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadHosts();
  }, [loadHosts]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingRef.current) return;
    const trimmed = newHost.trim().toLowerCase();
    if (!trimmed) return;
    isAddingRef.current = true;
    setIsAdding(true);
    try {
      const res = await fetch(`/api/user/tenants/${tenantId}/hosts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setNewHost("");
      await loadHosts();
      toast.success("Hostname added", {
        description: "Configure the DNS records shown to complete verification.",
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      toast.error("Failed to add hostname", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  };

  const handleVerify = async (host: string) => {
    setVerifyingHost(host);
    try {
      const res = await fetch(
        `/api/user/tenants/${tenantId}/hosts/${encodeURIComponent(host)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "verify" }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as HostRow;
      await loadHosts();
      if (updated.verifiedAt) {
        toast.success(`${host} verified`, { icon: <Check className="h-4 w-4" /> });
      } else {
        toast.info(`${host} still pending`, {
          description:
            "DNS records may take a few minutes to propagate. Try again shortly.",
        });
      }
    } catch (err) {
      toast.error("Verification check failed", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setVerifyingHost(null);
    }
  };

  const handleRemove = async (host: string) => {
    if (!window.confirm(`Remove ${host}?\n\nIt will stop routing to this site.`)) {
      return;
    }
    try {
      const res = await fetch(
        `/api/user/tenants/${tenantId}/hosts/${encodeURIComponent(host)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      await loadHosts();
      toast.success(`Removed ${host}`, { icon: <Check className="h-4 w-4" /> });
    } catch (err) {
      toast.error("Failed to remove hostname", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  const copyToClipboard = (value: string, label: string) => {
    void navigator.clipboard.writeText(value).then(
      () => toast.success(`Copied ${label}`),
      () => toast.error("Failed to copy"),
    );
  };

  return (
    <div className="mt-4 pl-6 border-l border-white/5 space-y-3">
      {/* Always-shown info card: where this site is reachable for free. */}
      <div className="rounded-md border border-white/8 bg-white/3 p-3 space-y-1.5">
        <div className="text-[11px] uppercase tracking-wider text-white/40">
          Your site is reachable at
        </div>
        {platformDomain && (
          <div className="flex items-center gap-2 text-xs">
            <Globe className="h-3 w-3 text-white/30 shrink-0" />
            <code className="font-mono text-white/80">
              {tenantSlug}.{platformDomain}
            </code>
            <span className="text-white/30">— subdomain (free, no setup)</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Globe className="h-3 w-3 text-white/30 shrink-0" />
          <code className="font-mono text-white/80">
            {platformDomain ?? "this site"}/u/{tenantSlug}
          </code>
          <span className="text-white/30">— subpath (free, no setup)</span>
        </div>
      </div>

      {/* Existing hosts list */}
      {isLoading ? (
        <p className="text-xs text-white/30">Loading hosts…</p>
      ) : hosts.length === 0 ? (
        <p className="text-xs text-white/30">No custom hostnames yet.</p>
      ) : (
        <ul className="space-y-2">
          {hosts.map((h) => (
            <li
              key={h.host}
              className="rounded-md border border-white/8 bg-white/3 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="h-3 w-3 text-white/30 shrink-0" />
                  <span className="font-mono text-sm truncate">{h.host}</span>
                  {h.verifiedAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs px-2 py-0.5 shrink-0">
                      <Check className="h-3 w-3" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-300 text-xs px-2 py-0.5 shrink-0">
                      Pending
                    </span>
                  )}
                  {h.isPrimary && (
                    <span className="inline-flex items-center rounded-full bg-white/5 text-white/40 text-xs px-2 py-0.5 shrink-0">
                      Primary host
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!h.verifiedAt && (
                    <button
                      type="button"
                      onClick={() => void handleVerify(h.host)}
                      disabled={verifyingHost === h.host}
                      className="text-xs text-sky-300 hover:text-sky-200 px-2 py-1 rounded hover:bg-sky-500/10 disabled:opacity-40 flex items-center gap-1"
                    >
                      {verifyingHost === h.host ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Re-check
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRemove(h.host)}
                    className="text-white/40 hover:text-rose-400 p-1 rounded"
                    aria-label="Remove hostname"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!h.verifiedAt && h.vercelConfigData?.dnsInstructions && (
                <div className="text-xs space-y-2 pt-2 border-t border-white/5">
                  <div className="text-white/50">
                    Add these DNS records at your registrar:
                  </div>
                  {h.vercelConfigData.dnsInstructions.map((dns, i) => (
                    <div key={i} className="space-y-1">
                      <div className="grid grid-cols-[max-content_1fr_max-content] gap-2 items-center">
                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-white/70">
                          {dns.recordType}
                        </span>
                        <span className="font-mono text-white/60">
                          name: {dns.recordName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 text-[11px]">value:</span>
                        <code className="flex-1 font-mono bg-white/5 px-2 py-1 rounded text-[11px] text-white/80">
                          {dns.recordValue}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(dns.recordValue, dns.recordType)
                          }
                          className="text-white/40 hover:text-white/70 p-1"
                          aria-label="Copy value"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-[11px] text-white/40">{dns.rationale}</p>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Custom domain section — gated by canClaimCustomHosts. */}
      <div className="pt-2 space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-white/40">
          Custom domain
        </div>
        {canClaim ? (
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              placeholder="mysite.com"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              className="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-mono placeholder:text-white/20"
            />
            <button
              type="submit"
              disabled={isAdding || !newHost.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 disabled:opacity-40"
            >
              {isAdding ? "Adding…" : "Add hostname"}
            </button>
          </form>
        ) : (
          <p className="text-xs text-white/40 leading-relaxed">
            Custom domains aren&apos;t enabled for your account. Your site
            works fine at the subdomain and subpath URLs above — those are
            permanent and don&apos;t require any DNS setup. Ask the platform
            owner to enable custom domains for your account if you want to
            connect a domain you already own.
          </p>
        )}
      </div>
    </div>
  );
}
