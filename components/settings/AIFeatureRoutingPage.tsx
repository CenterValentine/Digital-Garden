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

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, AlertCircle, Check, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";
import { ProviderIcon } from "@/components/content/ai/ProviderIcon";
import { FEATURE_REGISTRY, type FeatureSpec, type CapabilityFlag } from "@/lib/domain/ai/features/registry";
import { effectiveCapabilities } from "@/lib/domain/ai/features/router";
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [connsRes, routesRes] = await Promise.all([
        fetch("/api/ai/connections", { credentials: "include" }),
        fetch("/api/ai/feature-routes", { credentials: "include" }),
      ]);
      const connsBody = await connsRes.json();
      const routesBody = await routesRes.json();
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

  return (
    <div className={embedded ? "space-y-6" : "max-w-4xl mx-auto p-6 space-y-6"}>
      <header>
        {embedded ? (
          <h2 className="text-lg font-semibold text-white">Feature Routing</h2>
        ) : (
          <h1 className="text-2xl font-semibold text-white">Feature Routing</h1>
        )}
        <p className="mt-1 text-sm text-gray-400">
          Pick which connection + model serves each AI-powered feature. Add backups so the call falls through if the primary rate-limits or errors.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : connections.length === 0 ? (
        <div
          className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300"
          style={{ background: glass0.background }}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Add at least one connection before configuring routes.
          </div>
          <Link href="/settings/ai/connections" className="mt-2 inline-block text-amber-200 underline">
            Go to Connections →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {FEATURE_REGISTRY.map((feature) => {
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
              />
            );
          })}
        </ul>
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
}: {
  feature: FeatureSpec;
  connections: ConnectionView[];
  entries: RouteEntry[];
  onSave: (entries: RouteEntry[]) => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
}) {
  const [local, setLocal] = useState<RouteEntry[]>(entries);
  const entriesKey = useMemo(() => JSON.stringify(entries), [entries]);
  const localKey = useMemo(() => JSON.stringify(local), [local]);
  // Parent remounts this row when `entries` changes (key prop above),
  // so we never need to resync local from props — useState's lazy init
  // captures the latest entries on each mount.
  const dirty = localKey !== entriesKey;

  // Connection+model pairs that satisfy the required capabilities.
  // Uses `effectiveCapabilities` (explicit + inferred from id pattern)
  // so older entries saved without the explicit `image-generation`
  // flag — e.g. dall-e-3 added before catalog augmentation existed —
  // still surface as compatible pairs.
  const compatibleOptions = useMemo(() => {
    const opts: Array<{ connectionId: string; modelId: string; label: string }> = [];
    for (const c of connections) {
      for (const m of c.models) {
        const have = effectiveCapabilities(m);
        const ok = feature.requiredCapabilities.every((cap) => have.has(cap));
        if (ok) opts.push({ connectionId: c.id, modelId: m.id, label: `${c.label} • ${m.name}` });
      }
    }
    return opts;
  }, [connections, feature.requiredCapabilities]);

  const update = useCallback((next: RouteEntry[]) => setLocal(next), []);

  return (
    <li className="rounded-xl border border-white/10 p-4 space-y-3" style={{ background: glass0.background }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-white">{feature.label}</h3>
            <code className="text-[10px] text-gray-500 font-mono">{feature.id}</code>
            {feature.requiredCapabilities.map((cap) => (
              <CapabilityChip key={cap} cap={cap} />
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{feature.description}</p>
        </div>
        {dirty && (
          <Button size="sm" onClick={() => onSave(local)}>
            <Check className="h-3.5 w-3.5 mr-1" />
            Save
          </Button>
        )}
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
              <li key={`${entry.connectionId}-${entry.modelId}-${i}`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 w-14 shrink-0">
                  {i === 0 ? "Primary" : `Backup ${i}`}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {conn && <ProviderIcon providerId={conn.presetId} className="h-3.5 w-3.5 text-gray-400" />}
                  <span className="text-xs text-white truncate">{label}</span>
                </div>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...local];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    update(next);
                  }}
                  className="text-gray-500 hover:text-white disabled:opacity-30"
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
                  className="text-gray-500 hover:text-white disabled:opacity-30"
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
        className="flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
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
    text: "bg-gray-500/15 text-gray-300 border-gray-500/30",
    streaming: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    tools: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    vision: "bg-pink-500/15 text-pink-300 border-pink-500/30",
    image: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    reasoning: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    "low-cost": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    embedding: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${map[cap]}`}>
      {cap}
    </span>
  );
}
