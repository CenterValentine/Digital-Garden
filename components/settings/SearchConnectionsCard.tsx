"use client";

/**
 * Search Connections settings card (AI v3.1) — BYOK web-search backends
 * (Tavily/Brave) for "dumb models" without native search. Styled to match
 * the AI Connections BYOK affordances (glass-0 cards, glass Button, Field
 * wrapper, per-field ✓ commit for the credential). Keys are sent to the
 * server, encrypted at rest, and never returned to the client.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";
import { SEARCH_BACKENDS_META } from "@/lib/domain/ai/acquisition/search/metadata";

interface SearchConnectionView {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
}

const INPUT_CLS =
  "w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-black/30 dark:border-white/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
    </label>
  );
}

export function SearchConnectionsCard() {
  const glass0 = getSurfaceStyles("glass-0");
  const [rows, setRows] = useState<SearchConnectionView[]>([]);
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
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const meta = SEARCH_BACKENDS_META.find((m) => m.id === provider);
  const providerLabel = (id: string) =>
    SEARCH_BACKENDS_META.find((m) => m.id === id)?.label ?? id;

  const save = useCallback(async () => {
    if (!apiKey.trim() || saving) return;
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
      toast.success(`${meta?.label ?? provider} key saved`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [apiKey, provider, meta, saving, load]);

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

  const isUpdate = rows.some((r) => r.provider === provider);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Web Search</h2>
        <p className="mt-1 text-sm text-gray-400">
          Give models without built-in search (DeepSeek, Kimi, Mistral,
          local, …) live web access. The big-four providers use their own
          native search; everyone else uses the backend you configure here.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-white/10 p-3"
              style={{ background: glass0.background }}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {row.label}
                    </span>
                    {row.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        <Check className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {providerLabel(row.provider)}
                  </div>
                </div>
                {!row.isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void setDefault(row.id)}
                  >
                    Set active
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(row.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        className="space-y-3 rounded-xl border border-white/10 p-4"
        style={{ background: glass0.background }}
      >
        <Field label="Backend">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={INPUT_CLS}
          >
            {SEARCH_BACKENDS_META.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={isUpdate ? "API key (replaces the saved one)" : "API key"}
          hint={meta?.apiKeyHint}
        >
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && apiKey.trim()) void save();
              }}
              placeholder={meta ? `${meta.label} key` : "API key"}
              className={`${INPUT_CLS} pr-10`}
            />
            {apiKey.trim() && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                aria-label={isUpdate ? "Save key" : "Add backend"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-emerald-600/90 p-1 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </Field>

        {meta && (
          <a
            href={meta.apiKeyDocsURL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            Get a {meta.label} key <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
