/**
 * AI Feature Routing settings — Session 3.6.
 *
 * Lists every registered feature. For each, the user can configure an
 * ordered list of (connection, model) pairs. Position 0 = primary; 1+
 * are backups. The router and fallback wrapper consume these at runtime.
 *
 * Capability filtering: only connection+model pairs that satisfy the
 * feature's required capabilities show in the model dropdown.
 */

"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Trash2, AlertCircle, Check, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";
import { ProviderIcon } from "@/components/content/ai/ProviderIcon";
import { FEATURE_REGISTRY, type FeatureSpec, type CapabilityFlag } from "@/lib/domain/ai/features/registry";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";
import type { ConnectionView } from "@/lib/features/ai-connections/types";

interface RouteEntry {
  connectionId: string;
  modelId: string;
}

interface AIFeatureRoutingPageProps {
  /** See AIConnectionsPage for the embedded-vs-standalone contract. */
  embedded?: boolean;
}

export default function AIFeatureRoutingPage({ embedded }: AIFeatureRoutingPageProps = {}) {
  const glass0 = getSurfaceStyles("glass-0");
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [routes, setRoutes] = useState<Record<string, RouteEntry[]>>({});
  const [loading, setLoading] = useState(true);
  // Free-form steering for the follow-up generator. Persisted as
  // `settings.ai.followUpsPrompt`; appended to the generator's default
  // prompt server-side. Kept here (not inside FeatureRow) because the
  // value lives in user settings, not in feature-route entries.
  const [followUpsPrompt, setFollowUpsPrompt] = useState("");
  const [savedFollowUpsPrompt, setSavedFollowUpsPrompt] = useState("");
  const [savingFollowUpsPrompt, setSavingFollowUpsPrompt] = useState(false);
  const followUpsPromptDirty = followUpsPrompt !== savedFollowUpsPrompt;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [connsRes, routesRes, settingsRes] = await Promise.all([
        fetch("/api/ai/connections", { credentials: "include" }),
        fetch("/api/ai/feature-routes", { credentials: "include" }),
        fetch("/api/user/settings", { credentials: "include" }),
      ]);
      const connsBody = await connsRes.json();
      const routesBody = await routesRes.json();
      const settingsBody = await settingsRes.json().catch(() => null);
      const raw =
        (settingsBody?.data?.settings?.ai as
          | { followUpsPrompt?: string }
          | undefined)?.followUpsPrompt ?? "";
      setFollowUpsPrompt(raw);
      setSavedFollowUpsPrompt(raw);
      setConnections(connsBody?.data?.items ?? []);
      const byFeature = routesBody?.data?.byFeature ?? {};
      const normalized: Record<string, RouteEntry[]> = {};
      for (const [featureId, entries] of Object.entries(byFeature)) {
        normalized[featureId] = (entries as Array<{ connectionId: string; modelId: string }>).map((e) => ({
          connectionId: e.connectionId,
          modelId: e.modelId,
        }));
      }
      setRoutes(normalized);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSetRoutes = useCallback(
    async (featureId: string, entries: RouteEntry[]) => {
      try {
        const res = await fetch("/api/ai/feature-routes", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ featureId, entries }),
        });
        if (!res.ok) throw new Error("Failed to save routes");
        setRoutes((prev) => ({ ...prev, [featureId]: entries }));
        toast.success("Routes saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    },
    [],
  );

  const saveFollowUpsPrompt = useCallback(async () => {
    setSavingFollowUpsPrompt(true);
    try {
      const next = followUpsPrompt.trim().slice(0, 600);
      const res = await fetch("/api/user/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: { followUpsPrompt: next } }),
      });
      if (!res.ok) throw new Error("Failed to save follow-up prompt");
      setSavedFollowUpsPrompt(next);
      setFollowUpsPrompt(next);
      toast.success("Follow-up steering saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingFollowUpsPrompt(false);
    }
  }, [followUpsPrompt]);

  return (
    <div className={embedded ? "space-y-6" : "max-w-4xl mx-auto p-6 space-y-6"}>
      <header>
        {embedded ? (
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feature Routing</h2>
        ) : (
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Feature Routing</h1>
        )}
        <p className="mt-1 text-sm text-gray-400">
          Pick which connection + model serves each AI-powered feature. Add backups so the call falls through if the primary rate-limits or errors.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : connections.length === 0 ? (
        <div
          className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300"
          style={{ background: glass0.background }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Add at least one connection before configuring routes.
          </div>
          <Link href="/settings/ai/connections" className="mt-2 inline-block text-amber-700 dark:text-amber-200 underline">
            Go to Connections →
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {FEATURE_REGISTRY.filter((f) => !f.id.startsWith("role-")).map(
              (feature) => {
                const entries = routes[feature.id] ?? [];
                // Remount on entries-change rather than useEffect-syncing
                // local state — avoids the React Compiler's setState-in-
                // effect cascade rule.
                const remountKey = `${feature.id}::${JSON.stringify(entries)}`;
                return (
                  <FeatureRow
                    key={remountKey}
                    feature={feature}
                    connections={connections}
                    entries={entries}
                    onSave={(next) => void handleSetRoutes(feature.id, next)}
                    glass0={glass0}
                    footer={
                      feature.id === "follow-ups" ? (
                        /* Steering lives INSIDE the Suggested Follow-ups
                           card as a true fieldset (owner call 2026-08-06) —
                           the model route and its prompt are one config. */
                        <fieldset className="rounded-lg border border-black/10 px-3 pb-2.5 pt-1 dark:border-white/10">
                          <legend className="px-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Follow-up steering
                          </legend>
                          <p className="text-[11px] leading-snug text-gray-500">
                            Free-form guidance appended to the generator&apos;s
                            prompt. Example: &ldquo;Focus on next experiments
                            and pitfalls to watch for.&rdquo;
                          </p>
                          <textarea
                            value={followUpsPrompt}
                            onChange={(e) =>
                              setFollowUpsPrompt(e.target.value.slice(0, 600))
                            }
                            rows={2}
                            maxLength={600}
                            placeholder="What should the follow-up suggestions focus on?"
                            className="mt-1.5 w-full resize-y rounded-md border border-black/10 bg-black/[0.04] px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400/40 focus:outline-none dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-gray-500"
                          />
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-gray-500">
                              {followUpsPrompt.length}/600 characters
                            </span>
                            {followUpsPromptDirty && (
                              <Button
                                size="sm"
                                onClick={() => void saveFollowUpsPrompt()}
                                disabled={savingFollowUpsPrompt}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                {savingFollowUpsPrompt ? "Saving…" : "Save"}
                              </Button>
                            )}
                          </div>
                        </fieldset>
                      ) : undefined
                    }
                  />
                );
              },
            )}
            <PlaybookRolesGroup
              features={FEATURE_REGISTRY.filter((f) => f.id.startsWith("role-"))}
              routes={routes}
              connections={connections}
              onSave={handleSetRoutes}
              glass0={glass0}
            />
          </ul>
        </>
      )}
    </div>
  );
}

function FeatureRow({
  feature,
  connections,
  entries,
  onSave,
  glass0,
  compact = false,
  footer,
}: {
  feature: FeatureSpec;
  connections: ConnectionView[];
  entries: RouteEntry[];
  onSave: (entries: RouteEntry[]) => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
  /** Dense variant for grouped rows: no description/chips, tighter padding. */
  compact?: boolean;
  /** Extra content at the card's bottom (e.g. the follow-ups steering fieldset). */
  footer?: ReactNode;
}) {
  const [local, setLocal] = useState<RouteEntry[]>(entries);
  // Parent remounts this row when `entries` changes (key prop above),
  // so we never need to resync local from props — useState's lazy init
  // captures the latest entries on each mount.

  // Connection+model pairs that satisfy the required capabilities.
  // Uses `effectiveCapabilities` (explicit + inferred from id pattern)
  // so older entries saved without the explicit `image-generation`
  // flag — e.g. dall-e-3 added before catalog augmentation existed —
  // still surface as compatible pairs.
  const compatibleOptions = useMemo(() => {
    const opts: Array<{ connectionId: string; modelId: string; label: string }> = [];
    for (const c of connections) {
      for (const m of c.models) {
        // Don't offer provider-retired models as route targets — routing to
        // one hard-errors (catalog-drift reconciliation flags them).
        if (m.unsupported) continue;
        const have = effectiveCapabilities(m);
        const ok = feature.requiredCapabilities.every((cap) => have.has(cap));
        if (ok) opts.push({ connectionId: c.id, modelId: m.id, label: `${c.label} • ${m.name}` });
      }
    }
    return opts;
  }, [connections, feature.requiredCapabilities]);

  // Auto-persist on every edit. Routes used to require a separate per-row
  // "Save" button that was easy to miss (and the page's bottom "Save AI
  // Settings" button doesn't touch routes), so changes silently appeared to
  // not stick. The backend replaces the full ordered list per write, so
  // saving each change is safe.
  const update = useCallback(
    (next: RouteEntry[]) => {
      setLocal(next);
      onSave(next);
    },
    [onSave],
  );

  return (
    <li
      className={
        compact
          ? "rounded-lg border border-black/10 dark:border-white/10 p-3 space-y-2"
          : "rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3"
      }
      style={compact ? undefined : { background: glass0.background }}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{feature.label}</h3>
            <code className="text-[10px] text-gray-500 font-mono">{feature.id}</code>
            {!compact &&
              feature.requiredCapabilities.map((cap) => (
                <CapabilityChip key={cap} cap={cap} />
              ))}
          </div>
          {!compact && (
            <p className="mt-1 text-xs text-gray-500">{feature.description}</p>
          )}
          {!compact && feature.settingsHref && (
            <Link
              href={feature.settingsHref.href}
              className="mt-1 inline-block text-xs text-gold-primary underline underline-offset-2 hover:text-gold-primary/80"
            >
              {feature.settingsHref.label} →
            </Link>
          )}
        </div>
      </div>

      {local.length === 0 ? (
        <div className="text-xs text-gray-500 italic">
          Not configured — falls back to{" "}
          {feature.defaultSuggestion
            ? `${feature.defaultSuggestion.presetId} / ${feature.defaultSuggestion.modelId}`
            : "no default"}
          .
        </div>
      ) : (
        <ol className="space-y-1.5">
          {local.map((entry, i) => {
            const conn = connections.find((c) => c.id === entry.connectionId);
            const model = conn?.models.find((m) => m.id === entry.modelId);
            const label = conn && model ? `${conn.label} • ${model.name}` : "(connection or model missing)";
            return (
              <li key={`${entry.connectionId}-${entry.modelId}-${i}`} className="flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.04] px-2.5 py-1.5 dark:border-white/10 dark:bg-black/20">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 w-14 shrink-0">
                  {i === 0 ? "Primary" : `Backup ${i}`}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {conn && <ProviderIcon providerId={conn.presetId} className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="text-xs text-gray-900 dark:text-white truncate">{label}</span>
                </div>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...local];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    update(next);
                  }}
                  className="text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === local.length - 1}
                  onClick={() => {
                    const next = [...local];
                    [next[i + 1], next[i]] = [next[i], next[i + 1]];
                    update(next);
                  }}
                  className="text-gray-500 hover:text-gray-900 dark:hover:text-white disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => update(local.filter((_, j) => j !== i))}
                  className="text-gray-500 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <AddRouteRow
        options={compatibleOptions}
        onAdd={(entry) => update([...local, entry])}
      />
      {footer}
    </li>
  );
}

/**
 * The six playbook model roles (AI 3.4) grouped into ONE quiet card,
 * collapsed by default — owner UX call 2026-08-06: six full-size cards were
 * too conspicuous for config most users touch once.
 */
function PlaybookRolesGroup({
  features,
  routes,
  connections,
  onSave,
  glass0,
}: {
  features: FeatureSpec[];
  routes: Record<string, RouteEntry[]>;
  connections: ConnectionView[];
  onSave: (featureId: string, entries: RouteEntry[]) => Promise<void> | void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  const [open, setOpen] = useState(false);
  const configured = features.filter(
    (f) => (routes[f.id] ?? []).length > 0,
  ).length;
  return (
    <li
      className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3"
      style={{ background: glass0.background }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Charter model roles
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Per-phase model routing for charters (scout, analyst, writer,
            coder, reviewer, archivist). {configured}/{features.length}{" "}
            configured.
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="space-y-2">
          {features.map((feature) => {
            const entries = routes[feature.id] ?? [];
            const remountKey = `${feature.id}::${JSON.stringify(entries)}`;
            return (
              <FeatureRow
                key={remountKey}
                feature={feature}
                connections={connections}
                entries={entries}
                onSave={(next) => void onSave(feature.id, next)}
                glass0={glass0}
                compact
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}

function AddRouteRow({
  options,
  onAdd,
}: {
  options: Array<{ connectionId: string; modelId: string; label: string }>;
  onAdd: (entry: RouteEntry) => void;
}) {
  const [selected, setSelected] = useState("");

  if (options.length === 0) {
    return (
      <div className="text-[11px] text-gray-500 italic">
        No compatible connection+model pairs. Add a connection with a model that satisfies the required capabilities.
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 rounded-lg border border-black/10 bg-black/[0.04] px-2 py-1.5 text-xs text-gray-900 focus:border-black/30 focus:outline-none dark:border-white/10 dark:bg-black/30 dark:text-white dark:focus:border-white/30"
      >
        <option value="">Add a route…</option>
        {options.map((o) => (
          <option key={`${o.connectionId}::${o.modelId}`} value={`${o.connectionId}::${o.modelId}`}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="ghost"
        disabled={!selected}
        onClick={() => {
          const [connectionId, modelId] = selected.split("::");
          if (connectionId && modelId) {
            onAdd({ connectionId, modelId });
            setSelected("");
          }
        }}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function CapabilityChip({ cap }: { cap: CapabilityFlag }) {
  const map: Record<CapabilityFlag, string> = {
    text: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30",
    streaming: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    tools: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    vision: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
    image: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    speech: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
    "audio-input": "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    transcription: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    reasoning: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    "low-cost": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    embedding: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${map[cap]}`}>
      {cap}
    </span>
  );
}
