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
import { ToneChip, type Tone } from "@/components/client/ui/tone-chip";
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
          <h2 className="text-lg font-semibold text-foreground">Feature Routing</h2>
        ) : (
          <h1 className="text-2xl font-semibold text-foreground">Feature Routing</h1>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          Pick which connection + model serves each AI-powered feature. Add backups so the call falls through if the primary rate-limits or errors.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : connections.length === 0 ? (
        <div
          className="tone-surface rounded-xl border p-4 text-sm"
          data-tone="warning"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Add at least one connection before configuring routes.
          </div>
          <Link href="/settings/ai/connections" className="mt-2 inline-block underline">
            Go to Connections →
          </Link>
        </div>
      ) : (
        <>
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

          {/* Follow-ups steering — free-form prompt appended to the
              generator's system instructions. Sits alongside the
              follow-ups feature row above because the model lives there
              but the prompt's value belongs in user settings. */}
          <section
            className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3"
            style={{ background: glass0.background }}
          >
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Follow-up steering
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Optional free-form guidance appended to the follow-up
                generator&apos;s prompt. Example: &ldquo;Focus on next
                experiments and pitfalls to watch for. Skip rephrasings of
                the last assistant turn.&rdquo;
              </p>
            </div>
            <textarea
              value={followUpsPrompt}
              onChange={(e) =>
                setFollowUpsPrompt(e.target.value.slice(0, 600))
              }
              rows={3}
              maxLength={600}
              placeholder="What should the follow-up suggestions focus on?"
              className="w-full resize-y rounded-md border border-black/10 dark:border-white/10 bg-surface-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">
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
          </section>
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
}: {
  feature: FeatureSpec;
  connections: ConnectionView[];
  entries: RouteEntry[];
  onSave: (entries: RouteEntry[]) => void;
  glass0: ReturnType<typeof getSurfaceStyles>;
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
    <li className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-3" style={{ background: glass0.background }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-foreground">{feature.label}</h3>
            <code className="text-[10px] text-muted-foreground font-mono">{feature.id}</code>
            {feature.requiredCapabilities.map((cap) => (
              <CapabilityChip key={cap} cap={cap} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>
          {feature.settingsHref && (
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
        <div className="text-xs text-muted-foreground italic">
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
              <li key={`${entry.connectionId}-${entry.modelId}-${i}`} className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/10 bg-surface-secondary px-2.5 py-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-14 shrink-0">
                  {i === 0 ? "Primary" : `Backup ${i}`}
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {conn && <ProviderIcon providerId={conn.presetId} className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-xs text-foreground truncate">{label}</span>
                </div>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const next = [...local];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    update(next);
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
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
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => update(local.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
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
      <div className="text-[11px] text-muted-foreground italic">
        No compatible connection+model pairs. Add a connection with a model that satisfies the required capabilities.
      </div>
    );
  }

  return (
    <div className="flex gap-1.5">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 rounded-lg border border-black/10 dark:border-white/10 bg-surface-input px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
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

/** Hue per capability. Categorical — these only need to be told apart. */
const CAPABILITY_TONE: Record<CapabilityFlag, Tone> = {
  text: "neutral",
  streaming: "info",
  tools: "purple",
  vision: "pink",
  image: "warning",
  speech: "teal",
  "audio-input": "orange",
  transcription: "sky",
  reasoning: "indigo",
  "low-cost": "success",
  embedding: "cyan",
};

/**
 * Which capabilities *classify* a feature versus merely *qualify* it.
 *
 * Modality (what the model produces) is what you scan a feature list for,
 * so those stay filled. The rest — streaming, tools, cost, reasoning — are
 * qualifiers; rendering them at equal weight gave every row a wall of
 * competing pills that drowned out the feature label itself.
 */
const CAPABILITY_EMPHASIS: Record<CapabilityFlag, "loud" | "quiet"> = {
  text: "quiet",
  streaming: "quiet",
  tools: "quiet",
  vision: "loud",
  image: "loud",
  speech: "loud",
  "audio-input": "loud",
  transcription: "loud",
  reasoning: "quiet",
  "low-cost": "quiet",
  embedding: "loud",
};

function CapabilityChip({ cap }: { cap: CapabilityFlag }) {
  return (
    <ToneChip
      tone={CAPABILITY_TONE[cap]}
      emphasis={CAPABILITY_EMPHASIS[cap]}
      className="text-[9px]"
    >
      {cap}
    </ToneChip>
  );
}
