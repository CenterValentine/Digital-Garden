/**
 * AI Settings Page — unified surface.
 *
 * Sections, top to bottom:
 *   1. Connections (embedded `<AIConnectionsPage>`) — provider/gateway config
 *   2. Feature Routing (embedded `<AIFeatureRoutingPage>`) — per-feature
 *      primary + backup routes for app-initiated AI calls
 *   3. Generation Parameters (temperature, maxTokens, typing effect, reasoning)
 *   4. Features (master switch, AI content highlight)
 *   5. AI Tools — per-tool enable/disable for the chat's tool-belt; tools
 *      that themselves call AI (currently just `generate_image`) get an
 *      optional Connection→Model override
 *
 * Removed from UI (fields kept in schema for last-resort fallback):
 *   - Global provider/model picker — superseded by Connections + Feature
 *     Routing. The chat route's `resolveSource` priority is explicit →
 *     preset-match → feature-route → legacy, so the flat settings only
 *     fire when nothing else resolves.
 *   - Legacy provider-key manager (AIKeyManager) — pre-Connections BYOK
 *     surface. Connections superseded it; the storage, routes, and Prisma
 *     model have all been removed.
 *   - Decorative toggles (streaming flag, conversation history, autoSuggest,
 *     privacy mode, monthly quota, per-tool enable list) — schema fields
 *     stay so a future wire-up can re-render them without losing user data.
 *
 * Standalone routes `/settings/ai/connections` and `/settings/ai/feature-routing`
 * are now 308-redirects to this page. All flat AI settings persist via
 * PATCH /api/user/settings → User.settings.ai JSONB.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Button } from "@/components/ui/glass/button";
import { Check, Wrench } from "lucide-react";
import { toast } from "sonner";
import AIConnectionsPage from "@/components/settings/AIConnectionsPage";
import AIFeatureRoutingPage from "@/components/settings/AIFeatureRoutingPage";
import {
  ALL_TOOL_IDS,
  ALL_TOOL_METADATA,
  BASE_TOOL_METADATA,
} from "@/lib/domain/ai/tools/metadata";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import { clientLogger } from "@/lib/core/logger/client";

/** Shape of ai settings as stored in User.settings.ai */
interface AISettings {
  enabled?: boolean;
  temperature?: number;
  maxTokens?: number;
  typingEffect?: boolean;
  toolConfig?: Record<
    string,
    {
      enabled?: boolean;
      routeOverride?: { presetId: string; modelId: string };
    }
  >;
  showAiHighlight?: boolean;
  showReasoning?: boolean;
  showFollowUps?: boolean;
}

const DEFAULTS: Required<AISettings> = {
  enabled: true,
  temperature: 0.7,
  maxTokens: 4096,
  typingEffect: true,
  toolConfig: {},
  showAiHighlight: true,
  showReasoning: true,
  showFollowUps: true,
};

export default function AISettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  // Form state
  const [enabled, setEnabled] = useState(DEFAULTS.enabled);
  const [temperature, setTemperature] = useState(DEFAULTS.temperature);
  const [maxTokens, setMaxTokens] = useState(DEFAULTS.maxTokens);
  const [typingEffect, setTypingEffect] = useState(DEFAULTS.typingEffect);
  const [toolConfig, setToolConfig] = useState<NonNullable<AISettings["toolConfig"]>>(
    DEFAULTS.toolConfig,
  );
  const [connections, setConnections] = useState<
    Array<{ id: string; name: string; presetId: string | null }>
  >([]);
  const [showAiHighlight, setShowAiHighlight] = useState(DEFAULTS.showAiHighlight);
  const [showReasoning, setShowReasoning] = useState(DEFAULTS.showReasoning);
  const [showFollowUps, setShowFollowUps] = useState(DEFAULTS.showFollowUps);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch("/api/user/settings");
        const data = await response.json();

        if (data.success && data.data?.ai) {
          const ai: AISettings = data.data.ai;
          if (ai.enabled !== undefined) setEnabled(ai.enabled);
          if (ai.temperature !== undefined) setTemperature(ai.temperature);
          if (ai.maxTokens !== undefined) setMaxTokens(ai.maxTokens);
          if (ai.typingEffect !== undefined) setTypingEffect(ai.typingEffect);
          if (ai.toolConfig) setToolConfig(ai.toolConfig);
          if (ai.showAiHighlight !== undefined) setShowAiHighlight(ai.showAiHighlight);
          if (ai.showReasoning !== undefined) setShowReasoning(ai.showReasoning);
          if (ai.showFollowUps !== undefined) setShowFollowUps(ai.showFollowUps);
        }
      } catch (err) {
        clientLogger.error({
          layer: "ui",
          event: "ai_settings_load:caught",
          summary: "load ai settings failed",
          error: err,
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // Load connections for the tool override picker (cheap; ~1 row per
  // configured provider). Failure is non-fatal — empty list = override
  // simply has no compatible options to show.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/connections", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.data?.items) return;
        setConnections(
          (body.data.items as Array<{
            id: string;
            name: string;
            presetId: string | null;
          }>).map((c) => ({
            id: c.id,
            name: c.name,
            presetId: c.presetId,
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Save settings
  const saveSettings = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai: {
            enabled,
            temperature,
            maxTokens,
            typingEffect,
            toolConfig,
            showAiHighlight,
            showReasoning,
            showFollowUps,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      toast.success("AI settings saved", {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      clientLogger.error({
        layer: "ui",
        event: "ai_settings_save:caught",
        summary: "save ai settings failed",
        error: err,
      });
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };


  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI</h1>
          <p className="text-muted-foreground mt-2">Provider, model, and generation settings</p>
        </div>
        <div
          className="border border-white/10 rounded-lg p-6"
          style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
        >
          <div className="text-sm text-gray-400">Loading AI settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI</h1>
        <p className="text-muted-foreground mt-2">Provider, model, and generation settings</p>
      </div>

      {/* ─── Connections + Feature Routing ───
          These two embedded sub-pages already render their own card-
          per-entry chrome. An outer glass card would just double-nest
          everything (the original symptom that motivated this polish
          pass). We give each an `<section>` wrapper for semantics +
          spacing and let the embedded page handle its own visuals. */}
      <section className="space-y-1">
        <AIConnectionsPage embedded />
      </section>

      <section className="space-y-1">
        <AIFeatureRoutingPage embedded />
      </section>

      {/* ─── Section 2: Generation Parameters ─── */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h3 className="text-lg font-semibold mb-4">Generation Parameters</h3>

        <div className="space-y-6">
          {/* Temperature */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Temperature
              <span className="ml-2 text-xs text-gray-500 font-normal">
                ({temperature.toFixed(2)})
              </span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Lower values produce more focused output; higher values increase creativity.
            </p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-500 w-6">0.0</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-gray-500 w-6">2.0</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-gray-500">Precise</span>
              <span className="text-xs text-gray-500">Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Tokens
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Maximum number of tokens the model can generate per response.
            </p>
            <input
              type="number"
              min={1}
              max={200_000}
              value={maxTokens}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setMaxTokens(val);
              }}
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Typing Effect Toggle */}
          <div>
            <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={typingEffect}
                onChange={(e) => setTypingEffect(e.target.checked)}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Typing Effect</div>
                <div className="text-sm text-gray-400">
                  Reveal streaming responses with a subtle typewriter
                  animation instead of appearing all at once.
                </div>
              </div>
            </label>
          </div>

          {/* Reasoning Toggle (Session 6) */}
          <div>
            <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={showReasoning}
                onChange={(e) => setShowReasoning(e.target.checked)}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Show reasoning when available</div>
                <div className="text-sm text-gray-400">
                  Display the model&apos;s &ldquo;thinking&rdquo; trace
                  (Anthropic extended thinking, OpenAI o-series, Google
                  thinking-*) above the answer. Doesn&apos;t enable the
                  capability itself &mdash; only renders what the model emits.
                </div>
              </div>
            </label>
          </div>

          {/* Follow-ups Toggle (Session 7) */}
          <div>
            <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={showFollowUps}
                onChange={(e) => setShowFollowUps(e.target.checked)}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Show suggested follow-ups</div>
                <div className="text-sm text-gray-400">
                  After each assistant reply, render 2&ndash;3 chip
                  suggestions for the next prompt. Click a chip to load it
                  into the composer. The model used lives in{" "}
                  <span className="text-gray-300">Feature Routing</span> under
                  &ldquo;Suggested Follow-ups.&rdquo;
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* ─── Section 3: AI Feature Toggles ─── */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h3 className="text-lg font-semibold mb-4">Features</h3>

        <div className="space-y-4">
          {/* Master Switch */}
          <label
            className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
              enabled
                ? "border-green-500/30 bg-green-500/5 hover:bg-green-500/10"
                : "border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
            }`}
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">
                AI {enabled ? "Enabled" : "Disabled"}
              </div>
              <div className="text-sm text-gray-400">
                {enabled
                  ? "AI features are active across the application."
                  : "All AI features are turned off. Chat and AI tools will be unavailable."}
              </div>
            </div>
          </label>

          {/* AI Content Highlighting */}
          <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={showAiHighlight}
              onChange={(e) => setShowAiHighlight(e.target.checked)}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">Show AI Content Highlights</div>
              <div className="text-sm text-gray-400">
                Subtly highlight text that was inserted or edited by AI with an indigo tint.
              </div>
            </div>
          </label>

        </div>
      </div>

      {/* ─── AI Tools — per-tool enable + override ─── */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-gray-400" />
          AI Tools
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Tools the chat AI can invoke during a turn. Disable any tool to
          remove it from the assistant&apos;s tool-belt. Tools that themselves
          call a remote AI provider (currently just{" "}
          <span className="text-gray-300">Generate Image</span>) can be pinned
          to a specific Connection so they always route through your key for
          that provider.
        </p>

        <div className="space-y-2">
          {ALL_TOOL_IDS.map((toolId) => (
            <ToolConfigRow
              key={toolId}
              toolId={toolId}
              meta={ALL_TOOL_METADATA[toolId]}
              callsAi={BASE_TOOL_METADATA[toolId as keyof typeof BASE_TOOL_METADATA]?.callsAi}
              config={toolConfig[toolId] ?? {}}
              connections={connections}
              onChange={(next) =>
                setToolConfig((prev) => {
                  // Strip the entry when it returns to all-defaults so the
                  // JSON doesn't accumulate noise.
                  const isDefault =
                    next.enabled === undefined && next.routeOverride === undefined;
                  const out = { ...prev };
                  if (isDefault) delete out[toolId];
                  else out[toolId] = next;
                  return out;
                })
              }
            />
          ))}
        </div>
      </div>

      {/* ─── Save Button ─── */}
      <div className="pt-2">
        <Button onClick={saveSettings} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save AI Settings"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tool row — handles enable/disable, plus a Connection→Model cascade for
// tools that themselves call a remote AI provider (`callsAi`).
//
// For generate_image, the model dropdown is sourced from
// `IMAGE_PROVIDER_CATALOG` (the image-gen-specific model list) keyed by
// the chosen Connection’\s `presetId`. Other future `callsAi` tools would
// need their own resolver; for now this row only encodes the one case.
// ─────────────────────────────────────────────────────────────────────────

interface ToolConfigEntry {
  enabled?: boolean;
  routeOverride?: { presetId: string; modelId: string };
}

interface ToolConfigRowProps {
  toolId: string;
  meta: { name: string; description: string };
  callsAi?: boolean;
  config: ToolConfigEntry;
  connections: Array<{ id: string; name: string; presetId: string | null }>;
  onChange: (next: ToolConfigEntry) => void;
}

function ToolConfigRow({
  toolId,
  meta,
  callsAi,
  config,
  connections,
  onChange,
}: ToolConfigRowProps) {
  const enabled = config.enabled ?? true;
  const override = config.routeOverride;

  // Compatible connections = those whose presetId appears in the image
  // provider catalog (only relevant when callsAi). Empty = no override
  // available, so the picker shows a disabled hint.
  const imagePresetIds: ReadonlySet<string> = new Set(
    IMAGE_PROVIDER_CATALOG.map((p) => p.id as string),
  );
  const compatibleConnections = connections.filter(
    (c) => c.presetId !== null && imagePresetIds.has(c.presetId),
  );

  const modelsForPreset = (presetId: string | null) => {
    if (!presetId) return [];
    return IMAGE_PROVIDER_CATALOG.find((p) => p.id === presetId)?.models ?? [];
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        enabled ? "border-white/10 bg-white/[0.02]" : "border-white/5 bg-black/10"
      }`}
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            // Default-on, so only persist when off OR when an override
            // is set; otherwise clear back to defaults.
            const nextEnabled = e.target.checked;
            onChange({
              ...config,
              enabled: nextEnabled ? undefined : false,
            });
          }}
          className="mt-1"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200">{meta.name}</span>
            <code className="text-[10px] text-gray-500 bg-black/20 px-1 py-px rounded">
              {toolId}
            </code>
            {callsAi && (
              <span className="text-[10px] px-1.5 py-px rounded bg-amber-500/20 text-amber-300 font-medium uppercase tracking-wide">
                Calls AI
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
        </div>
      </label>

      {callsAi && enabled && (
        <div className="mt-3 pl-7 border-l border-white/10 ml-1.5 space-y-2">
          <div className="text-xs text-gray-400">
            Override: always route this tool through a specific Connection.
          </div>
          {compatibleConnections.length === 0 ? (
            <div className="text-xs text-gray-500 italic">
              No Connections support image generation yet. Add an OpenAI or
              Google Connection above to enable an override.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={
                  override
                    ? connections.find(
                        (c) => c.presetId === override.presetId,
                      )?.id ?? ""
                    : ""
                }
                onChange={(e) => {
                  const conn = connections.find((c) => c.id === e.target.value);
                  if (!conn || !conn.presetId) {
                    onChange({ ...config, routeOverride: undefined });
                    return;
                  }
                  const firstModel = modelsForPreset(conn.presetId)[0];
                  if (!firstModel) {
                    onChange({ ...config, routeOverride: undefined });
                    return;
                  }
                  onChange({
                    ...config,
                    routeOverride: { presetId: conn.presetId, modelId: firstModel.id },
                  });
                }}
                className="bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
              >
                <option value="">Use feature routing / env vars</option>
                {compatibleConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.presetId})
                  </option>
                ))}
              </select>
              {override && (
                <select
                  value={override.modelId}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      routeOverride: {
                        presetId: override.presetId,
                        modelId: e.target.value,
                      },
                    })
                  }
                  className="bg-black/20 border border-white/10 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {modelsForPreset(override.presetId).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
