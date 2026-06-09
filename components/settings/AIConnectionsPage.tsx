/**
 * AI Connections settings page — Session 3.5.
 *
 * Three modes:
 *   - "list"    : view all connections + "+ Add Connection" CTA
 *   - "picker"  : grid of templates (built-in directs + gateways + custom)
 *   - "form"    : add/edit a connection (universal form per the locked decision)
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Edit3, AlertCircle, Check, X, KeyRound, ExternalLink, HelpCircle, Sparkles, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";
import { ProviderIcon } from "@/components/content/ai/ProviderIcon";
import { getProviderTheme } from "@/lib/design/system/ai-providers";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";
import { ConnectionUsageCard } from "./ConnectionUsageCard";
import {
  CONNECTION_TEMPLATES,
  type ConnectionTemplate,
} from "@/lib/features/ai-connections/templates";
import type {
  ConnectionView,
  ConnectionKind,
  ConnectionModel,
  AdapterKind,
} from "@/lib/features/ai-connections/types";

type ViewMode =
  | { kind: "list" }
  | { kind: "picker" }
  | { kind: "form"; template: ConnectionTemplate | null; editingId?: string };

interface AIConnectionsPageProps {
  /**
   * When mounted as a section inside the main AI Settings page, set
   * embedded=true: the outer max-w/p wrapper is dropped and the h1
   * becomes an h2 so it sits inside the parent page hierarchy. When
   * routed standalone, leave it undefined for the original page chrome.
   */
  embedded?: boolean;
}

export default function AIConnectionsPage({ embedded }: AIConnectionsPageProps = {}) {
  const glass0 = getSurfaceStyles("glass-0");
  const [mode, setMode] = useState<ViewMode>({ kind: "list" });
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/connections", { credentials: "include" });
      const body = await res.json();
      setConnections(body?.data?.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (conn: ConnectionView) => {
      if (!confirm(`Delete "${conn.label}"? Feature routes using it will also be removed.`)) {
        return;
      }
      try {
        const res = await fetch(`/api/ai/connections/${conn.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Delete failed");
        toast.success("Connection deleted");
        void refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [refresh],
  );

  return (
    <div className={embedded ? "space-y-6" : "max-w-4xl mx-auto p-6 space-y-6"}>
      <header className="flex items-center justify-between">
        <div>
          {embedded ? (
            <h2 className="text-lg font-semibold text-white">AI Connections</h2>
          ) : (
            <h1 className="text-2xl font-semibold text-white">AI Connections</h1>
          )}
          <p className="mt-1 text-sm text-gray-400">
            Each connection is a key + endpoint. Add one per provider you use; pick which routes through it in chat or feature settings.
          </p>
        </div>
        {mode.kind === "list" && (
          <Button onClick={() => setMode({ kind: "picker" })}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Connection
          </Button>
        )}
        {mode.kind !== "list" && (
          <Button variant="ghost" onClick={() => setMode({ kind: "list" })}>
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
        )}
      </header>

      {mode.kind === "list" && (
        <ConnectionList
          connections={connections}
          loading={loading}
          onEdit={(c) => {
            const template = CONNECTION_TEMPLATES.find((t) => t.id === c.presetId) ?? null;
            setMode({ kind: "form", template, editingId: c.id });
          }}
          onDelete={handleDelete}
          glass0={glass0}
        />
      )}

      {mode.kind === "picker" && (
        <TemplatePicker
          onPick={(template) => setMode({ kind: "form", template })}
          onCustom={() => setMode({ kind: "form", template: null })}
          glass0={glass0}
        />
      )}

      {mode.kind === "form" && (
        <ConnectionForm
          template={mode.template}
          editingId={mode.editingId}
          existing={connections.find((c) => c.id === mode.editingId) ?? null}
          onDone={() => {
            setMode({ kind: "list" });
            void refresh();
          }}
          glass0={glass0}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionList({
  connections,
  loading,
  onEdit,
  onDelete,
  glass0,
}: {
  connections: ConnectionView[];
  loading: boolean;
  onEdit: (c: ConnectionView) => void;
  onDelete: (c: ConnectionView) => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  if (loading) {
    return <div className="text-sm text-gray-500">Loading connections…</div>;
  }
  if (connections.length === 0) {
    return (
      <div
        className="rounded-xl border border-white/10 p-8 text-center"
        style={{ background: glass0.background }}
      >
        <KeyRound className="h-8 w-8 mx-auto text-gray-500 mb-3" />
        <p className="text-sm text-gray-300 font-medium">No connections yet</p>
        <p className="mt-1 text-xs text-gray-500 max-w-md mx-auto">
          Add an API key for a built-in provider, a gateway like Vercel AI Gateway or Fireworks, or a custom endpoint to start chatting.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {connections.map((c) => (
        <li
          key={c.id}
          className="rounded-xl border border-white/10 px-4 py-3"
          style={{ background: glass0.background }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: getProviderTheme(c.presetId).bubbleTint,
                color: getProviderTheme(c.presetId).brandColor,
                border: `1px solid ${getProviderTheme(c.presetId).brandColor}55`,
              }}
            >
              <ProviderIcon providerId={c.presetId} className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{c.label}</span>
                <KindBadge kind={c.kind} />
                {c.isPinned && (
                  <span className="text-[10px] uppercase tracking-wider text-amber-400">Pinned</span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {c.models.length} model{c.models.length !== 1 ? "s" : ""}
                {c.baseURL ? ` • ${truncate(c.baseURL, 40)}` : ""}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onEdit(c)}>
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(c)}>
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </Button>
          </div>

          {/* Usage meter — lazy-loads on expand, refresh button inside. */}
          <ConnectionUsageCard connectionId={c.id} />
        </li>
      ))}
    </ul>
  );
}

function KindBadge({ kind }: { kind: ConnectionKind }) {
  const map: Record<ConnectionKind, { label: string; cls: string }> = {
    direct: { label: "Direct", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
    gateway: { label: "Gateway", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
    custom: { label: "Custom", cls: "bg-gray-500/15 text-gray-300 border-gray-500/30" },
  };
  const { label, cls } = map[kind];
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Template picker
// ─────────────────────────────────────────────────────────────────────────────

function TemplatePicker({
  onPick,
  onCustom,
  glass0,
}: {
  onPick: (t: ConnectionTemplate) => void;
  onCustom: () => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  const directs = CONNECTION_TEMPLATES.filter((t) => t.kind === "direct");
  const gateways = CONNECTION_TEMPLATES.filter((t) => t.kind === "gateway");

  return (
    <div className="space-y-6">
      <Section title="Direct providers" subtitle="Use the lab's own API directly. One key per provider.">
        <Grid>
          {directs.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => onPick(t)} glass0={glass0} />
          ))}
        </Grid>
      </Section>

      <Section title="Gateways" subtitle="Brokers that route to many models with one key.">
        <Grid>
          {gateways.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => onPick(t)} glass0={glass0} />
          ))}
        </Grid>
      </Section>

      <Section title="Custom" subtitle="Any AI-SDK-compatible endpoint — Ollama, LM Studio, self-hosted Llama, anything.">
        <button
          type="button"
          onClick={onCustom}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 p-4 hover:border-white/30 transition-colors"
          style={{ background: glass0.background }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15">
            <Plus className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-white">Custom endpoint</div>
            <div className="text-xs text-gray-500">You fill in baseURL, adapter, and model list.</div>
          </div>
        </button>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <p className="mt-0.5 mb-3 text-xs text-gray-500">{subtitle}</p>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{children}</div>;
}

function TemplateCard({
  template,
  onClick,
  glass0,
}: {
  template: ConnectionTemplate;
  onClick: () => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  const theme = getProviderTheme(template.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-white/10 p-3 hover:border-white/25 transition-colors text-left"
      style={{ background: glass0.background }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{
          background: theme.bubbleTint,
          color: theme.brandColor,
          border: `1px solid ${theme.brandColor}55`,
        }}
      >
        <ProviderIcon providerId={template.id} className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">{template.name}</div>
        <div className="text-xs text-gray-500">
          {template.defaultModels.length} default model{template.defaultModels.length !== 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Form
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionForm({
  template,
  editingId,
  existing,
  onDone,
  glass0,
}: {
  template: ConnectionTemplate | null;
  editingId?: string;
  existing: ConnectionView | null;
  onDone: () => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  const isEdit = Boolean(editingId);
  const [label, setLabel] = useState(existing?.label ?? template?.name ?? "");
  const [baseURL, setBaseURL] = useState(
    existing?.baseURL ?? template?.defaultBaseURL ?? "",
  );
  const [apiKey, setApiKey] = useState("");
  const [adapterKind, setAdapterKind] = useState<AdapterKind>(
    (existing?.adapterKind as AdapterKind) ?? template?.adapterKind ?? "openai-compat",
  );
  const [models, setModels] = useState<ConnectionModel[]>(
    existing?.models ?? template?.defaultModels ?? [],
  );
  const [saving, setSaving] = useState(false);

  const baseURLLocked = useMemo(
    () => Boolean(template?.baseURLLocked && !isEdit && template?.kind === "direct"),
    [template, isEdit],
  );

  const handleSave = useCallback(async () => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!isEdit && !apiKey.trim()) {
      toast.error("API key is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        kind: template?.kind ?? "custom",
        presetId: template?.id ?? null,
        label: label.trim(),
        baseURL: baseURL.trim() || null,
        adapterKind,
        models,
        ...(apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
      };

      const res = await fetch(
        isEdit ? `/api/ai/connections/${editingId}` : "/api/ai/connections",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `${isEdit ? "Update" : "Create"} failed`);
      }
      toast.success(isEdit ? "Connection updated" : "Connection added");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [label, apiKey, baseURL, adapterKind, models, template, editingId, isEdit, onDone]);

  return (
    <div
      className="rounded-xl border border-white/10 p-6 space-y-4"
      style={{ background: glass0.background }}
    >
      <div className="flex items-center gap-3">
        {template && (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: getProviderTheme(template.id).bubbleTint,
              color: getProviderTheme(template.id).brandColor,
              border: `1px solid ${getProviderTheme(template.id).brandColor}55`,
            }}
          >
            <ProviderIcon providerId={template.id} className="h-4 w-4" />
          </div>
        )}
        <div>
          <h2 className="text-lg font-medium text-white">
            {isEdit ? "Edit connection" : template ? `Add ${template.name}` : "Add custom connection"}
          </h2>
          {template?.apiKeyDocsURL && (
            <a
              href={template.apiKeyDocsURL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-0.5 text-xs text-blue-400 hover:text-blue-300"
            >
              Get an API key
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <Field label="Label">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
        />
      </Field>

      <Field label={isEdit ? "API key (leave blank to keep current)" : "API key"} hint={template?.apiKeyHint}>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isEdit ? "•••• keep current ••••" : "Paste key here"}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-white/30"
        />
      </Field>

      {!baseURLLocked && (
        <Field label="Base URL" hint="OpenAI-compatible endpoint URL. Leave blank for built-in providers.">
          <input
            type="text"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-white/30"
          />
        </Field>
      )}

      {!template && (
        <Field label="Adapter" hint="Which AI SDK adapter handles this endpoint.">
          <select
            value={adapterKind}
            onChange={(e) => setAdapterKind(e.target.value as AdapterKind)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
          >
            <option value="openai-compat">OpenAI-compatible (most third-party endpoints)</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI (direct)</option>
            <option value="google">Google (Gemini)</option>
            <option value="xai">xAI</option>
            <option value="mistral">Mistral</option>
            <option value="groq">Groq</option>
            <option value="vercel-gateway">Vercel AI Gateway</option>
          </select>
        </Field>
      )}

      <ModelEditor
        models={models}
        setModels={setModels}
        adapterKind={adapterKind}
        connectionId={editingId ?? null}
        supportsFetch={Boolean(template?.supportsModelFetch)}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : (
            <>
              <Check className="h-4 w-4 mr-1.5" />
              {isEdit ? "Save" : "Add connection"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-gray-300 mb-1">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
    </label>
  );
}

// Capability display + normalization for the fetched-model picker. The
// fetcher/inferrer emit "image-generation" while the feature flag is "image";
// normalizing them means a single "Image" badge/filter covers both.
const CAP_LABELS: Record<string, string> = {
  "image-generation": "Image",
  image: "Image",
  vision: "Vision",
  text: "Text",
  streaming: "Stream",
  reasoning: "Reasoning",
  audio: "Audio",
  embedding: "Embed",
};
function normalizeCap(cap: string): string {
  return cap === "image-generation" ? "image" : cap;
}
function prettyCap(cap: string): string {
  return CAP_LABELS[cap] ?? cap;
}
/** Normalized capability set for a fetched model (declared + id-inferred). */
function modelCapabilities(model: {
  id: string;
  capabilities?: string[];
}): string[] {
  const set = new Set<string>();
  for (const c of effectiveCapabilities(model)) set.add(normalizeCap(c));
  return [...set];
}

function ModelEditor({
  models,
  setModels,
  adapterKind,
  connectionId,
  supportsFetch,
}: {
  models: ConnectionModel[];
  setModels: (m: ConnectionModel[]) => void;
  adapterKind: AdapterKind;
  /** Existing connection id when editing; null while creating. */
  connectionId: string | null;
  /** Template flag — does this upstream expose a list-models endpoint? */
  supportsFetch: boolean;
}) {
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const suggestions = useMemo(
    () => POPULAR_MODEL_IDS_BY_ADAPTER[adapterKind] ?? [],
    [adapterKind],
  );

  // Upstream-fetch state (A6 — gateway model auto-fetch).
  const canFetchModels = supportsFetch && connectionId !== null;
  const [fetching, setFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<
    Array<{ id: string; name: string; capabilities?: string[] }> | null
  >(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Track which fetched-model ids the user has checked for bulk add.
  // Default-empty: gateways with hundreds of models shouldn't pre-pick
  // anything (last session's "auto-select missing" produced 273 ✓ out of
  // 277 — too much). The user explicitly opts in to what they want.
  const [selectedFetched, setSelectedFetched] = useState<Set<string>>(
    () => new Set(),
  );
  // Filter + sort for the fetched list panel. Filter is plain substring
  // match against id + display name; sort cycles asc/desc on id.
  const [fetchedFilter, setFetchedFilter] = useState("");
  const [fetchedSort, setFetchedSort] = useState<"asc" | "desc">("asc");
  // Capability type filter (null = all). Lets the user narrow a gateway's huge
  // model list to just image-capable (or vision, reasoning, …) models so they
  // can tell at a glance which to add for image generation.
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(null);

  // Distinct capabilities present across the fetched models, ordered by a
  // stable display preference, for the filter chips. Built dynamically so any
  // capability a gateway declares (or we infer) gets a chip.
  const availableCapabilities = useMemo(() => {
    if (!fetchedModels) return [] as string[];
    const seen = new Set<string>();
    for (const m of fetchedModels) {
      for (const c of modelCapabilities(m)) seen.add(c);
    }
    const order = ["image", "vision", "reasoning", "audio", "text", "streaming", "embedding"];
    return [...seen].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [fetchedModels]);

  const visibleFetched = useMemo(() => {
    if (!fetchedModels) return [];
    const q = fetchedFilter.trim().toLowerCase();
    const filtered = fetchedModels.filter((m) => {
      if (q && !m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) {
        return false;
      }
      if (capabilityFilter && !modelCapabilities(m).includes(capabilityFilter)) {
        return false;
      }
      return true;
    });
    filtered.sort((a, b) =>
      fetchedSort === "asc"
        ? a.id.localeCompare(b.id)
        : b.id.localeCompare(a.id),
    );
    return filtered;
  }, [fetchedModels, fetchedFilter, fetchedSort, capabilityFilter]);

  /** Count of currently-visible rows that are already selected. */
  const visibleSelectedCount = useMemo(() => {
    let n = 0;
    for (const m of visibleFetched) if (selectedFetched.has(m.id)) n++;
    return n;
  }, [visibleFetched, selectedFetched]);

  const allVisibleSelected =
    visibleFetched.length > 0 &&
    visibleSelectedCount === visibleFetched.length;

  const toggleAllVisible = useCallback(() => {
    setSelectedFetched((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const m of visibleFetched) next.delete(m.id);
      } else {
        for (const m of visibleFetched) next.add(m.id);
      }
      return next;
    });
  }, [allVisibleSelected, visibleFetched]);

  const closeFetchedPanel = useCallback(() => {
    setFetchedModels(null);
    setSelectedFetched(new Set());
    setFetchedFilter("");
    setCapabilityFilter(null);
    setFetchedSort("asc");
  }, []);

  const addModel = useCallback(() => {
    if (!newId.trim()) return;
    setModels([
      ...models,
      {
        id: newId.trim(),
        name: newName.trim() || newId.trim(),
        capabilities: ["text", "streaming"],
      },
    ]);
    setNewId("");
    setNewName("");
  }, [models, newId, newName, setModels]);

  /** Click a suggestion → fill both inputs. */
  const pickSuggestion = useCallback(
    (s: { id: string; name: string }) => {
      setNewId(s.id);
      setNewName(s.name);
      setPickerOpen(false);
    },
    [],
  );

  const removeModel = useCallback(
    (id: string) => {
      setModels(models.filter((m) => m.id !== id));
    },
    [models, setModels],
  );

  /**
   * Fire `/api/ai/connections/[id]/fetch-models`. Default-select every
   * fetched id that the user hasn't already added (so the bulk-add
   * affordance is "add the missing ones" out of the box).
   */
  const fetchModels = useCallback(async () => {
    if (!canFetchModels || !connectionId) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/ai/connections/${encodeURIComponent(connectionId)}/fetch-models`,
        { method: "POST", credentials: "include" },
      );
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setFetchError(body?.error?.message ?? "Failed to fetch models");
        setFetchedModels(null);
        return;
      }
      const items = (body.data?.items ?? []) as Array<{
        id: string;
        name: string;
        capabilities?: string[];
      }>;
      setFetchedModels(items);
      // Default to empty selection per user direction — pre-picking
      // doesn't scale when a gateway returns 277 models.
      setSelectedFetched(new Set());
      setFetchedFilter("");
      setCapabilityFilter(null);
      setFetchedSort("asc");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Network error");
      setFetchedModels(null);
    } finally {
      setFetching(false);
    }
  }, [canFetchModels, connectionId]);

  /** Add every checked fetched-model entry not already present. */
  const addSelectedFetched = useCallback(() => {
    if (!fetchedModels) return;
    const existing = new Set(models.map((m) => m.id));
    const additions: ConnectionModel[] = [];
    for (const item of fetchedModels) {
      if (!selectedFetched.has(item.id) || existing.has(item.id)) continue;
      additions.push({
        id: item.id,
        name: item.name,
        // Catalog-augmented entries (image models) ship with their own
        // capability hints; everything else falls back to the generic
        // text/streaming default.
        capabilities: item.capabilities ?? ["text", "streaming"],
      });
    }
    if (additions.length > 0) setModels([...models, ...additions]);
    setFetchedModels(null);
    setSelectedFetched(new Set());
  }, [fetchedModels, models, selectedFetched, setModels]);

  /** Replace the entire model list with the checked fetched-model set. */
  const replaceWithSelected = useCallback(() => {
    if (!fetchedModels) return;
    const replacement: ConnectionModel[] = [];
    for (const item of fetchedModels) {
      if (!selectedFetched.has(item.id)) continue;
      replacement.push({
        id: item.id,
        name: item.name,
        capabilities: item.capabilities ?? ["text", "streaming"],
      });
    }
    setModels(replacement);
    setFetchedModels(null);
    setSelectedFetched(new Set());
  }, [fetchedModels, selectedFetched, setModels]);

  const toggleFetchedSelection = useCallback((id: string) => {
    setSelectedFetched((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <Field
      label="Models"
      hint={
        canFetchModels
          ? "Models accessible through this connection. Use Fetch from API to pull the live list — typos become impossible."
          : supportsFetch
            ? "Save this connection once, then Fetch from API to pull the live model list from the upstream."
            : "Models accessible through this connection. Free-text entry — no upstream validation for this adapter."
      }
    >
      <div className="space-y-1.5">
        {/* ─── Fetch-from-API affordance ─── */}
        {supportsFetch && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-amber-300/80" />
                Fetch live model list
              </div>
              <div className="text-[10px] text-gray-500 truncate">
                {canFetchModels
                  ? "Calls the upstream's /v1/models endpoint with this Connection's key."
                  : "Save the Connection first — fetch needs the encrypted key on the server."}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchModels()}
              disabled={!canFetchModels || fetching}
            >
              {fetching ? "Fetching…" : "Fetch from API"}
            </Button>
          </div>
        )}

        {/* Fetch error banner */}
        {fetchError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">Fetch failed</div>
              <div className="opacity-80 break-words">{fetchError}</div>
            </div>
            <button
              type="button"
              onClick={() => setFetchError(null)}
              className="text-red-400/70 hover:text-red-300 shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Fetched-model selection panel — first-class browser for the
            upstream's live model list. Filter + sort + select-all on
            current view. Selection defaults to empty; user opts in. */}
        {fetchedModels !== null && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04]">
            {/* Header row: counts + close */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-amber-500/10">
              <div className="text-[11px] font-medium text-amber-200 uppercase tracking-wide">
                {fetchedModels.length} models from upstream ·{" "}
                {selectedFetched.size} selected
                {fetchedFilter && (
                  <span className="ml-1.5 text-amber-300/70 normal-case">
                    · {visibleFetched.length} match
                    {visibleFetched.length === 1 ? "" : "es"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeFetchedPanel}
                aria-label="Close fetch panel"
                className="text-amber-400/70 hover:text-amber-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Toolbar: filter + sort toggle + select-all-on-view */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/10">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-400/60 pointer-events-none" />
                <input
                  type="text"
                  value={fetchedFilter}
                  onChange={(e) => setFetchedFilter(e.target.value)}
                  placeholder="Filter by id or name…"
                  aria-label="Filter fetched models"
                  className="w-full rounded-md border border-amber-500/20 bg-black/30 pl-6 pr-2 py-1 text-xs text-amber-100 placeholder:text-amber-300/40 focus:outline-none focus:border-amber-500/40"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setFetchedSort((s) => (s === "asc" ? "desc" : "asc"))
                }
                aria-label={`Sort ${fetchedSort === "asc" ? "ascending" : "descending"}`}
                title={`Sorted ${fetchedSort === "asc" ? "A → Z" : "Z → A"} (click to flip)`}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-200/80 hover:bg-amber-500/10 hover:border-amber-500/40 transition-colors"
              >
                <ArrowUpDown className="h-3 w-3" />
                {fetchedSort === "asc" ? "A→Z" : "Z→A"}
              </button>
              <button
                type="button"
                onClick={toggleAllVisible}
                disabled={visibleFetched.length === 0}
                className="rounded-md border border-amber-500/20 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-wide text-amber-200/80 hover:bg-amber-500/10 hover:border-amber-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allVisibleSelected ? "Deselect view" : "Select view"}
              </button>
            </div>

            {/* Capability type filter — narrows the list to image/vision/etc. */}
            {availableCapabilities.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-amber-500/10">
                <button
                  type="button"
                  onClick={() => setCapabilityFilter(null)}
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                    capabilityFilter === null
                      ? "bg-amber-500/25 text-amber-100 border border-amber-400/40"
                      : "border border-amber-500/15 text-amber-200/70 hover:bg-amber-500/10"
                  }`}
                >
                  All
                </button>
                {availableCapabilities.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() =>
                      setCapabilityFilter((cur) => (cur === cap ? null : cap))
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
                      capabilityFilter === cap
                        ? "bg-amber-500/25 text-amber-100 border border-amber-400/40"
                        : "border border-amber-500/15 text-amber-200/70 hover:bg-amber-500/10"
                    }`}
                  >
                    {prettyCap(cap)}
                  </button>
                ))}
              </div>
            )}

            {/* List body */}
            <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
              {visibleFetched.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-amber-300/60">
                  No models match &quot;{fetchedFilter}&quot;.
                </div>
              ) : (
                visibleFetched.map((item) => {
                  const exists = models.some((m) => m.id === item.id);
                  const checked = selectedFetched.has(item.id);
                  const caps = modelCapabilities(item);
                  return (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-amber-500/[0.06] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFetchedSelection(item.id)}
                        aria-label={`Select ${item.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-amber-200 truncate">
                          {item.id}
                        </div>
                        {item.name !== item.id && (
                          <div className="text-[10px] text-gray-400 truncate">
                            {item.name}
                          </div>
                        )}
                      </div>
                      {/* Capability badges — Image highlighted so image-gen
                          models stand out in a long gateway list. */}
                      {caps.length > 0 && (
                        <span className="flex shrink-0 flex-wrap items-center gap-1">
                          {caps.map((cap) => (
                            <span
                              key={cap}
                              className={`rounded px-1 py-px text-[9px] uppercase tracking-wide ${
                                cap === "image"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                                  : "bg-white/5 text-gray-400"
                              }`}
                            >
                              {prettyCap(cap)}
                            </span>
                          ))}
                        </span>
                      )}
                      {exists && (
                        <span className="text-[9px] uppercase tracking-wide text-gray-500 shrink-0">
                          added
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>

            {/* Action footer */}
            <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-amber-500/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={replaceWithSelected}
                disabled={selectedFetched.size === 0}
              >
                Replace all with selected
              </Button>
              <Button
                size="sm"
                onClick={addSelectedFetched}
                disabled={selectedFetched.size === 0}
              >
                Add selected ({selectedFetched.size})
              </Button>
            </div>
          </div>
        )}

        {models.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            No models yet. Add at least one to use this connection.
          </div>
        )}
        {models.map((m) => (
          <div key={m.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{m.name}</div>
              <div className="text-[10px] text-gray-500 font-mono truncate">{m.id}</div>
            </div>
            <button
              type="button"
              onClick={() => removeModel(m.id)}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="relative flex gap-1.5 pt-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Model ID (e.g. claude-sonnet-4)"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 pr-7 text-xs text-white font-mono focus:outline-none focus:border-white/30"
            />
            {suggestions.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                aria-label="Show popular model IDs"
                title="Popular model IDs"
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded transition-colors ${
                  pickerOpen
                    ? "text-amber-300 bg-amber-500/10"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
          />
          <Button variant="ghost" size="sm" onClick={addModel}>
            <Plus className="h-3.5 w-3.5" />
          </Button>

          {pickerOpen && suggestions.length > 0 && (
            <ModelSuggestionPicker
              suggestions={suggestions}
              onPick={pickSuggestion}
              onClose={() => setPickerOpen(false)}
              adapterKind={adapterKind}
            />
          )}
        </div>
      </div>
    </Field>
  );
}

/**
 * Floating popover anchored to the Model ID input. Lists curated recent
 * popular model IDs for the active `adapterKind`. The IDs shown are
 * universal *within their scope* — namespaced `provider/model` strings
 * for gateway adapters (work across Vercel Gateway, OpenRouter, and any
 * OpenAI-compat gateway), or the provider's native ID format for
 * direct adapters. Click any row → fills both inputs in the parent.
 */
function ModelSuggestionPicker({
  suggestions,
  onPick,
  onClose,
  adapterKind,
}: {
  suggestions: ReadonlyArray<{ id: string; name: string; tag?: string }>;
  onPick: (s: { id: string; name: string }) => void;
  onClose: () => void;
  adapterKind: AdapterKind;
}) {
  // Close on outside click. The popover lives in the same flow as the
  // form so a ref + document mousedown listener is enough — no portal
  // gymnastics required.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      if (e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Popular model IDs"
      className="absolute bottom-full left-0 right-0 mb-1.5 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a1a] shadow-2xl z-50"
    >
      <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-white/5 bg-[#1a1a1a]/95 backdrop-blur-sm px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400">
          <Sparkles className="h-3 w-3 text-amber-300/70" />
          <span>Popular IDs · {ADAPTER_SCOPE_LABEL[adapterKind]}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close suggestions"
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="py-1">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-white/5 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <code className="text-xs font-mono text-amber-200 truncate">
                  {s.id}
                </code>
                {s.tag && (
                  <span className="text-[9px] uppercase tracking-wide text-amber-400/80 bg-amber-500/10 px-1 py-px rounded">
                    {s.tag}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-gray-400 truncate">{s.name}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Curated "recent popular" model IDs per adapter kind. Used by the
 * Connection edit form's suggestion popover.
 *
 * Each entry's `id` is the literal string the user pastes into their
 * Connection. The format is universal *within the adapter's scope*:
 *
 *   - `vercel-gateway` / `openai-compat`: namespaced `provider/model`
 *     format — works across Vercel AI Gateway, OpenRouter, and most
 *     OpenAI-compatible gateways.
 *   - Direct provider adapters: native ID format for that provider.
 *
 * Update this list as new flagship / popular models ship. Keep it short
 * (~6–10 per adapter) — this is a discovery aid, not the full catalog.
 */
const POPULAR_MODEL_IDS_BY_ADAPTER: Record<
  AdapterKind,
  ReadonlyArray<{ id: string; name: string; tag?: string }>
> = {
  "vercel-gateway": [
    // ── Big 3 ──
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (via Gateway)" },
    { id: "anthropic/claude-opus-4", name: "Claude Opus 4 (via Gateway)" },
    { id: "anthropic/claude-haiku-3-5", name: "Claude Haiku 3.5 (via Gateway)" },
    { id: "openai/gpt-4o", name: "GPT-4o (via Gateway)" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (via Gateway)" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro (via Gateway)", tag: "Reasoning" },
    { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (via Gateway)" },
    // ── Reasoning ──
    { id: "openai/o3-mini", name: "o3-mini (via Gateway)", tag: "Reasoning" },
    { id: "openai/o1-mini", name: "o1-mini (via Gateway)", tag: "Reasoning" },
    // ── xAI ──
    { id: "xai/grok-3", name: "Grok 3 (via Gateway)" },
    { id: "xai/grok-3-mini", name: "Grok 3 Mini (via Gateway)" },
    // ── Mistral ──
    { id: "mistral/mistral-large-latest", name: "Mistral Large (via Gateway)" },
    { id: "mistral/codestral-latest", name: "Codestral (via Gateway)" },
    // ── Open-weight (popular hosted variants) ──
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct (via Gateway)", tag: "Open weight" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (via Gateway)", tag: "Open weight" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct (via Gateway)", tag: "Open weight" },
  ],
  "openai-compat": [
    // OpenRouter and most OpenAI-compat gateways accept the same
    // namespaced format. Direct OpenAI-compatible self-hosts (vLLM,
    // Ollama, LM Studio) usually expect just the bare model id —
    // tag those separately if needed.

    // ── Big 3 ──
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", tag: "Reasoning" },
    // ── Reasoning ──
    { id: "openai/o3-mini", name: "o3-mini", tag: "Reasoning" },
    // ── xAI (OpenRouter prefix is `x-ai`, others use `xai`) ──
    { id: "x-ai/grok-3", name: "Grok 3 (OpenRouter format)" },
    { id: "xai/grok-3", name: "Grok 3 (most gateways)" },
    // ── Mistral (OpenRouter prefix is `mistralai`, others `mistral`) ──
    { id: "mistralai/mistral-large", name: "Mistral Large (OpenRouter format)" },
    { id: "mistral/mistral-large-latest", name: "Mistral Large (most gateways)" },
    // ── Open-weight ──
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", tag: "Open weight" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", tag: "Open weight" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", tag: "Open weight" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-5-20250414", name: "Claude Opus 4" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    { id: "o3-mini", name: "o3-mini", tag: "Reasoning" },
    { id: "o1-mini", name: "o1-mini", tag: "Reasoning" },
    { id: "o3", name: "o3", tag: "Reasoning" },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tag: "Reasoning" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  ],
  xai: [
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large" },
    { id: "codestral-latest", name: "Codestral" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B (32k)" },
  ],
};

/** Short label describing the scope of universality for each adapter. */
const ADAPTER_SCOPE_LABEL: Record<AdapterKind, string> = {
  "vercel-gateway": "universal across most gateways",
  "openai-compat": "universal across OpenAI-compat gateways",
  anthropic: "Anthropic direct",
  openai: "OpenAI direct",
  google: "Google direct",
  xai: "xAI direct",
  mistral: "Mistral direct",
  groq: "Groq direct",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
