"use client";

/**
 * Search Connections settings card (AI v3.1) — BYOK web-search backends
 * (Tavily/Brave) for "dumb models" without native search. Keys are sent to
 * the server, encrypted at rest, and never returned to the client.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, Star, ExternalLink } from "lucide-react";
import { SettingSection } from "@/components/settings/ui";
import { SEARCH_BACKENDS_META } from "@/lib/domain/ai/acquisition/search/metadata";

interface SearchConnectionView {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
}

export function SearchConnectionsCard() {
  const [rows, setRows] = useState<SearchConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState(SEARCH_BACKENDS_META[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/search-connections", {
        credentials: "include",
      });
      const body = (await res.json()) as { data?: SearchConnectionView[] };
      setRows(body.data ?? []);
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = SEARCH_BACKENDS_META.find((m) => m.id === provider);

  const save = useCallback(async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/search-connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider, apiKey }),
      });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? "Save failed");
      setApiKey("");
      toast.success(`${meta?.label ?? provider} search key saved`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [apiKey, provider, meta, load]);

  const setDefault = useCallback(
    async (id: string) => {
      await fetch(`/api/ai/search-connections/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ makeDefault: true }),
      });
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/ai/search-connections/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      toast.success("Search backend removed");
      await load();
    },
    [load],
  );

  return (
    <SettingSection
      title="Web Search"
      description="Give models without built-in search (DeepSeek, Kimi, Mistral, local, …) live web access. The big-four providers use their own native search; everyone else uses the backend you configure here."
    >
      {!loading && rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
            >
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {row.label}
              </span>
              {row.isDefault ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                  <Check className="h-3 w-3" /> Active
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void setDefault(row.id)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-gray-500 hover:bg-black/[0.05] dark:hover:bg-white/10"
                  title="Make this the active backend"
                >
                  <Star className="h-3 w-3" /> Set active
                </button>
              )}
              <button
                type="button"
                onClick={() => void remove(row.id)}
                className="ml-auto rounded p-1 text-gray-400 hover:bg-red-500/10 hover:text-red-500"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
          >
            {SEARCH_BACKENDS_META.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {meta && (
            <a
              href={meta.apiKeyDocsURL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
            >
              Get a key <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder={meta?.apiKeyHint ?? "API key"}
          className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !apiKey.trim()}
          className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-black/5 disabled:opacity-40 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/10"
        >
          {rows.some((r) => r.provider === provider) ? "Update key" : "Add backend"}
        </button>
      </div>
    </SettingSection>
  );
}
