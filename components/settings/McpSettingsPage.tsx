"use client";

/**
 * Settings → MCP (MCP-DATABASE-REACH-PLAN §6.7): the garden as an MCP
 * server. Mint and revoke access tokens with their capabilities and
 * reach, and copy the client snippets. Mirrors the workflow token page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/client/ui/button";
import { Input } from "@/components/client/ui/input";
import { SettingSection, SettingsPage } from "@/components/settings/ui";
import { MCP_CAPABILITIES, type McpCapability } from "@/lib/domain/mcp/capabilities";

interface TokenDto {
  id: string;
  name: string;
  tokenPrefix: string;
  capabilities: McpCapability[];
  rootIds: string[];
  allChats: boolean;
  readTokenCap: number | null;
  dailyCallCap: number | null;
  issuedVia: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface TreeNode {
  id: string;
  title: string;
  contentType: string;
  children?: TreeNode[];
}

const CAP_LABELS: Record<McpCapability, { label: string; hint: string }> = {
  "garden:read": { label: "Read", hint: "Search, the tree, notes, files, database schemas and rows. Always on." },
  "garden:read-chats": { label: "Read chats", hint: "Find and read past assistant chats about reachable content." },
  "garden:write-rows": { label: "Write rows", hint: "Insert and update database rows (compare-and-set on updates)." },
  "garden:delete-rows": { label: "Delete rows", hint: "Soft-delete rows, under each database's own AI deletion policy." },
  "garden:write-files": { label: "Write files", hint: "Create and append to notes, write code files, upload files, create folders, insert blocks, update AI context." },
  "garden:report-issues": { label: "File issues", hint: "Report bugs and feature requests to the public repository." },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function flatten(nodes: TreeNode[], depth = 0, out: Array<{ id: string; title: string; type: string; depth: number }> = []) {
  for (const n of nodes) {
    if (n.contentType === "folder" || n.contentType === "data") {
      out.push({ id: n.id, title: n.title, type: n.contentType, depth });
      if (n.children && depth < 3) flatten(n.children, depth + 1, out);
    }
  }
  return out;
}

export default function McpSettingsPage() {
  const [tokens, setTokens] = useState<TokenDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [caps, setCaps] = useState<Set<McpCapability>>(new Set(["garden:read"]));
  const [roots, setRoots] = useState<Set<string>>(new Set());
  const [allChats, setAllChats] = useState(false);
  const [expiresDays, setExpiresDays] = useState<string>("");
  const [picker, setPicker] = useState<Array<{ id: string; title: string; type: string; depth: number }>>([]);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const loadTokens = useCallback(async () => {
    try {
      const res = await fetch("/api/mcp/tokens", { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to load tokens");
      setTokens(json.data.tokens as TokenDto[]);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load tokens");
      setTokens([]);
    }
  }, []);

  const loadPicker = useCallback(async () => {
    try {
      const res = await fetch("/api/content/content/tree", { credentials: "include" });
      const json = await res.json();
      if (res.ok && json.success) setPicker(flatten((json.data?.tree ?? []) as TreeNode[]));
    } catch {
      // the picker is a convenience; the form still works with no roots (whole garden)
    }
  }, []);

  useEffect(() => {
    void loadTokens();
    void loadPicker();
  }, [loadTokens, loadPicker]);

  const toggleCap = (cap: McpCapability) => {
    if (cap === "garden:read") return;
    setCaps((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });
  };

  const toggleRoot = (id: string) => {
    setRoots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const days = Number(expiresDays);
      const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
      const res = await fetch("/api/mcp/tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, capabilities: [...caps], rootIds: [...roots], allChats, expiresAt }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to create token");
      setFreshToken(json.data.token as string);
      setCopied(null);
      setName("");
      setTokens((prev) => [json.data.record as TokenDto, ...(prev ?? [])]);
      toast.success("MCP token created — copy it now");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  }, [name, caps, roots, allChats, expiresDays]);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }, []);

  const handleRevoke = useCallback(async (id: string) => {
    if (!window.confirm("Revoke this token? Any client using it stops authenticating immediately.")) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/mcp/tokens/${id}`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to revoke token");
      setTokens((prev) => (prev ?? []).map((t) => (t.id === id ? (json.data.record as TokenDto) : t)));
      toast.success("Token revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke token");
    } finally {
      setRevokingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setPurgingId(id);
    try {
      const res = await fetch(`/api/mcp/tokens/${id}?purge=true`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Failed to remove token");
      setTokens((prev) => (prev ?? []).filter((t) => t.id !== id));
      toast.success("Token removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove token");
    } finally {
      setPurgingId(null);
    }
  }, []);

  const serverUrl = `${origin || "https://<your-garden>"}/api/mcp`;
  const tokenPlaceholder = freshToken ?? "dgmcp_…";
  const snippets = useMemo(
    () => [
      { key: "claude-code", label: "Claude Code", text: `claude mcp add --transport http garden ${serverUrl} --header "Authorization: Bearer ${tokenPlaceholder}"` },
      { key: "codex", label: "Codex CLI (~/.codex/config.toml)", text: `[mcp_servers.garden]\nurl = "${serverUrl}"\nbearer_token_env_var = "GARDEN_MCP_TOKEN"` },
      { key: "gemini", label: "Gemini CLI (~/.gemini/settings.json)", text: `{ "mcpServers": { "garden": { "httpUrl": "${serverUrl}", "headers": { "Authorization": "Bearer ${tokenPlaceholder}" } } } }` },
      { key: "stdio", label: "stdio-only clients (mcp-remote)", text: `npx -y mcp-remote ${serverUrl} --header "Authorization: Bearer ${tokenPlaceholder}"` },
    ],
    [serverUrl, tokenPlaceholder]
  );

  const titleOf = (id: string) => picker.find((p) => p.id === id)?.title ?? id.slice(0, 8);

  return (
    <SettingsPage title="MCP" description="Let Claude Code, Codex, Gemini and other agents work in this garden through the Model Context Protocol.">
      <SettingSection title="Server" description="Streamable HTTP, bearer-token authenticated. Hosted apps that only speak OAuth (claude.ai, ChatGPT) are a later milestone.">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-black/5 px-3 py-2 font-mono text-xs dark:bg-white/10">{serverUrl}</code>
          <Button type="button" size="sm" variant="outline" onClick={() => copy("url", serverUrl)}>
            {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="ml-1.5">Copy</span>
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {snippets.map((s) => (
            <div key={s.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{s.label}</span>
                <button type="button" onClick={() => copy(s.key, s.text)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {copied === s.key ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-md bg-black/5 px-3 py-2 font-mono text-[11px] leading-snug dark:bg-white/10">{s.text}</pre>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Snippets use the token you just created while it is shown; afterwards paste your own.</p>
        </div>
      </SettingSection>

      <SettingSection title="Access tokens" description="A token says what an agent may do and where it may reach. Reach is a set of folders and databases; databases linked to those by relation are reachable too. No roots means the whole garden.">
        {freshToken && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">Copy this token now — it won&apos;t be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-black/5 px-3 py-2 font-mono text-xs dark:bg-white/10">{freshToken}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => copy("token", freshToken)}>
                    {copied === "token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">{copied === "token" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <button type="button" onClick={() => setFreshToken(null)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Done — dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mcp-token-name" className="text-sm font-medium">Token name</label>
            <Input id="mcp-token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Code on my laptop" maxLength={120} disabled={creating} />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Capabilities</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {MCP_CAPABILITIES.map((cap) => (
                <label key={cap} className="flex items-start gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                  <input type="checkbox" className="mt-0.5" checked={caps.has(cap)} disabled={cap === "garden:read" || creating} onChange={() => toggleCap(cap)} />
                  <span>
                    <span className="font-medium">{CAP_LABELS[cap].label}</span>
                    <span className="block text-xs text-muted-foreground">{CAP_LABELS[cap].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Reach</span>
            <p className="text-xs text-muted-foreground">{roots.size === 0 ? "Whole garden. Tick folders or databases to narrow it." : `${roots.size} root${roots.size === 1 ? "" : "s"}: ${[...roots].map(titleOf).join(", ")}`}</p>
            <div className="max-h-56 overflow-y-auto rounded-md border border-black/10 p-2 dark:border-white/10">
              {picker.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No folders or databases to list.</p>
              ) : (
                picker.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-1 py-0.5 text-xs" style={{ paddingLeft: `${4 + p.depth * 14}px` }}>
                    <input type="checkbox" checked={roots.has(p.id)} disabled={creating} onChange={() => toggleRoot(p.id)} />
                    <span>{p.type === "folder" ? "📁" : "▦"} {p.title}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allChats} disabled={creating} onChange={(e) => setAllChats(e.target.checked)} />
              <span>Reach every chat, not only chats about reachable content</span>
            </label>
            <div className="space-y-1.5">
              <label htmlFor="mcp-expires" className="text-sm font-medium">Expires in (days, blank = never)</label>
              <Input id="mcp-expires" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="90" className="w-28" inputMode="numeric" disabled={creating} />
            </div>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span className="ml-1.5">Generate token</span>
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {tokens === null ? (
            <p className="text-sm text-muted-foreground">Loading tokens…</p>
          ) : loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tokens yet.</p>
          ) : (
            tokens.map((token) => {
              const revoked = Boolean(token.revokedAt);
              return (
                <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 px-4 py-3 dark:border-white/10">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={revoked ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>{token.name}</span>
                      <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs text-muted-foreground dark:bg-white/10">{token.tokenPrefix}…</code>
                      {revoked && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">Revoked</span>}
                      {token.issuedVia !== "pat" && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">{token.issuedVia}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {token.capabilities.map((c) => CAP_LABELS[c]?.label ?? c).join(", ")} · reach: {token.rootIds.length === 0 ? "whole garden" : token.rootIds.map(titleOf).join(", ")}{token.allChats ? " · all chats" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">Created {formatDate(token.createdAt)} · Last used {formatDate(token.lastUsedAt)}{token.expiresAt ? ` · Expires ${formatDate(token.expiresAt)}` : ""}</p>
                  </div>
                  {revoked ? (
                    <Button type="button" size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => handleDelete(token.id)} disabled={purgingId === token.id} title="Remove this revoked token from the list">
                      {purgingId === token.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Remove</span>
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:text-red-700 dark:text-red-400" onClick={() => handleRevoke(token.id)} disabled={revokingId === token.id}>
                      {revokingId === token.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      <span className="ml-1.5">Revoke</span>
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </SettingSection>
    </SettingsPage>
  );
}
