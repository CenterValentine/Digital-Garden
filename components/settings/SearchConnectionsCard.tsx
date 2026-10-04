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
  keySource?: "own" | "ai-connection";
  model?: string;
}

/** AI connections whose key a search backend can reuse, by search provider id. */
type ReusableKeys = Record<string, { connectionId: string; label: string } | null>;

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
  const [reusable, setReusable] = useState<ReusableKeys>({});
  const [provider, setProvider] = useState(SEARCH_BACKENDS_META[0]?.id ?? "");
  // Set once the user picks a backend, so a load never overrides the pick.
  const [providerPicked, setProviderPicked] = useState(false);
  // Reuse a saved AI connection's key when one exists (owner, 2026-09-30):
  // an OpenAI key saved for chat need not be pasted again for search.
  const [useSavedKey, setUseSavedKey] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/search-connections", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        data?: SearchConnectionView[];
        reusable?: ReusableKeys;
      };
      setRows(body.data ?? []);
      setReusable(body.reusable ?? {});
    } catch {
      /* leave empty */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A saved OpenAI key detected and no OpenAI search yet: open the picker on
  // it, so adding GPT search is one click (owner, 2026-09-30).
  const suggestedProvider = Object.keys(reusable).find(
    (id) => reusable[id] && !rows.some((r) => r.provider === id),
  );
  const effectiveProvider = providerPicked ? provider : (suggestedProvider ?? provider);
  const savedKey = reusable[effectiveProvider] ?? null;
  const reusing = Boolean(savedKey && useSavedKey);

  const meta = SEARCH_BACKENDS_META.find((m) => m.id === effectiveProvider);
  const providerLabel = (id: string) =>
    SEARCH_BACKENDS_META.find((m) => m.id === id)?.label ?? id;

  const save = useCallback(async () => {
    if ((!reusing && !apiKey.trim()) || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/search-connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          reusing
            ? { provider: effectiveProvider, reuseAiConnection: true }
            : { provider: effectiveProvider, apiKey },
        ),
      });
      const body = (await res.json()) as { success?: boolean; error?: string };
      if (!body.success) throw new Error(body.error ?? "Save failed");
      setApiKey("");
      toast.success(
        reusing
          ? `${meta?.label ?? effectiveProvider} search added — using your saved key`
          : `${meta?.label ?? effectiveProvider} key saved`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [apiKey, effectiveProvider, meta, reusing, saving, load]);

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

  const isUpdate = rows.some((r) => r.provider === effectiveProvider);
  const backendName = (m: { label: string; model?: string }) =>
    m.model ? `${m.label} — ${m.model}` : m.label;

  return (
    <div
      className="rounded-xl border border-black/10 p-4 space-y-4 dark:border-white/10"
      style={{ background: glass0.background }}
    >
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Web Search</h2>
        <p className="mt-1 text-sm text-gray-400">
          Give models without built-in search (DeepSeek, Kimi, Mistral,
          local, …) live web access. Models with their own search (OpenAI,
          Claude, Google, Grok) use it by default; switch a chat to the
          backend configured here in its Chat controls.
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
                    {[
                      providerLabel(row.provider),
                      row.model,
                      row.keySource === "ai-connection" ? "key from your AI connection" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
            value={effectiveProvider}
            onChange={(e) => {
              setProvider(e.target.value);
              setProviderPicked(true);
            }}
            className={INPUT_CLS}
          >
            {SEARCH_BACKENDS_META.map((m) => (
              <option key={m.id} value={m.id}>
                {backendName(m)}
              </option>
            ))}
          </select>
        </Field>

        {savedKey && (
          <div className="space-y-1.5" role="radiogroup" aria-label="Key">
            <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Key</div>
            <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                checked={useSavedKey}
                onChange={() => setUseSavedKey(true)}
              />
              Use your saved {meta?.label ?? effectiveProvider} key
              <span className="text-xs text-gray-500">({savedKey.label})</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
              <input
                type="radio"
                checked={!useSavedKey}
                onChange={() => setUseSavedKey(false)}
              />
              Use a different key
            </label>
          </div>
        )}

        {reusing ? (
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {isUpdate ? "Switch to the saved key" : `Add ${meta?.label ?? "this"} search`}
          </Button>
        ) : (

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
        )}

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
