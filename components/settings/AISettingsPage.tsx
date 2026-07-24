/**
 * AI Settings Page — unified surface.
 *
 * Sections, top to bottom:
 *   1. Connections (embedded `<AIConnectionsPage>`) — provider/gateway config
 *   2. Feature Routing (embedded `<AIFeatureRoutingPage>`) — per-feature
 *      primary + backup routes for app-initiated AI calls
 *   3. Generation (temperature, max tokens, typing animation, reasoning,
 *      follow-ups)
 *   4. Features (master switch, AI content highlights, folder assistant)
 *   5. AI Tools — per-tool enable/disable for the chat's tool-belt; tools
 *      that themselves call AI (currently just `generate_image`) get an
 *      optional Connection→Model override
 *
 * Persistence: reads from the unified settings store (hydrated by
 * SettingsInitializer) and writes through `setAISettings`, which auto-saves
 * to PATCH /api/user/settings. Controls apply instantly; the section
 * header's SavedIndicator reflects save state.
 *
 * Removed from UI (fields kept in schema for last-resort fallback):
 *   - Global provider/model picker — superseded by Connections + Feature
 *     Routing. The chat route's `resolveSource` priority is explicit →
 *     preset-match → feature-route → legacy, so the flat settings only
 *     fire when nothing else resolves.
 *   - Decorative toggles (streaming flag, conversation history, autoSuggest,
 *     privacy mode, monthly quota) — schema fields stay so a future wire-up
 *     can re-render them without losing user data.
 */

"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

import AIConnectionsPage from "@/components/settings/AIConnectionsPage";
import { SearchConnectionsCard } from "@/components/settings/SearchConnectionsCard";
import AIFeatureRoutingPage from "@/components/settings/AIFeatureRoutingPage";
import { Checkbox } from "@/components/client/ui/checkbox";
import { Input } from "@/components/client/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";
import { Slider } from "@/components/client/ui/slider";
import { Switch } from "@/components/client/ui/switch";
import {
  SavedIndicator,
  SettingRow,
  SettingSection,
  SettingsPage,
  useSaveTracker,
} from "@/components/settings/ui";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import {
  ALL_TOOL_IDS,
  ALL_TOOL_METADATA,
  BASE_TOOL_METADATA,
} from "@/lib/domain/ai/tools/metadata";
import { useSettingsStore } from "@/state/settings-store";

const MAX_TOKENS_MIN = 1;
const MAX_TOKENS_MAX = 200_000;

interface ToolConfigEntry {
  enabled?: boolean;
  routeOverride?: { presetId: string; modelId: string };
}

export default function AISettingsPage() {
  const ai = useSettingsStore((state) => state.ai);
  const setAISettings = useSettingsStore((state) => state.setAISettings);
  const isSyncing = useSettingsStore((state) => state.isSyncing);
  const lastSyncedAt = useSettingsStore((state) => state.lastSyncedAt);

  const generation = useSaveTracker();
  const features = useSaveTracker();
  const tools = useSaveTracker();

  // Effective values with the same fallbacks the old page used.
  const enabled = ai?.enabled ?? true;
  const temperature = ai?.temperature ?? 0.7;
  const maxTokens = ai?.maxTokens ?? 4096;
  const typingEffect = ai?.typingEffect ?? true;
  const showAiHighlight = ai?.showAiHighlight ?? true;
  const showReasoning = ai?.showReasoning ?? true;
  const showFollowUps = ai?.showFollowUps ?? true;
  const resumableStreams = ai?.resumableStreams ?? true;
  const folderAssistantEnabled = ai?.folderAssistant?.enabled ?? true;
  const toolConfig: Record<string, ToolConfigEntry> = ai?.toolConfig ?? {};

  // Drafts for controls that commit on release/blur rather than keystroke.
  const [temperatureDraft, setTemperatureDraft] = useState<number | null>(null);
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null);

  // Connections for the tool override picker (cheap; ~1 row per configured
  // provider). Failure is non-fatal — empty list = no override options.
  const [connections, setConnections] = useState<
    Array<{ id: string; name: string; presetId: string | null }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/connections", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body?.data?.items) return;
        setConnections(
          (
            body.data.items as Array<{
              id: string;
              name: string;
              presetId: string | null;
            }>
          ).map((connection) => ({
            id: connection.id,
            name: connection.name,
            presetId: connection.presetId,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const commitMaxTokens = () => {
    if (maxTokensDraft === null) return;
    const parsed = parseInt(maxTokensDraft, 10);
    setMaxTokensDraft(null);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(Math.max(parsed, MAX_TOKENS_MIN), MAX_TOKENS_MAX);
    if (clamped !== maxTokens) {
      void generation.track(setAISettings({ maxTokens: clamped }));
    }
  };

  const handleToolConfigChange = (toolId: string, next: ToolConfigEntry) => {
    // Strip the entry when it returns to all-defaults so the JSON doesn't
    // accumulate noise.
    const isDefault =
      next.enabled === undefined && next.routeOverride === undefined;
    const out: Record<string, ToolConfigEntry> = { ...toolConfig };
    if (isDefault) delete out[toolId];
    else out[toolId] = next;
    void tools.track(setAISettings({ toolConfig: out }));
  };

  // Avoid flashing defaults on a first-ever visit while the initial
  // backend hydration is in flight (localStorage cache covers revisits).
  if (isSyncing && lastSyncedAt === null) {
    return (
      <SettingsPage title="AI" description="Connections, routing, generation, and tools.">
        <SettingSection title="Loading">
          <p className="text-sm text-muted-foreground">Loading AI settings…</p>
        </SettingSection>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage
      title="AI"
      description="Connections, routing, generation, and tools."
    >
      {/* Connections + Feature Routing render their own card-per-entry
          chrome; an outer glass card would double-nest them. */}
      <section className="space-y-1">
        <AIConnectionsPage embedded />
      </section>

      <section className="space-y-1">
        <AIFeatureRoutingPage embedded />
      </section>

      <section className="space-y-1">
        <SearchConnectionsCard />
      </section>

      <SettingSection
        title="Generation"
        description="How responses are produced and rendered."
        action={<SavedIndicator status={generation.status} error={generation.error} />}
      >
        <SettingRow
          label={`Temperature (${(temperatureDraft ?? temperature).toFixed(2)})`}
          description="Lower values produce more focused output; higher values increase creativity."
          layout="stack"
        >
          <div className="flex items-center gap-4">
            <span className="w-6 text-xs text-muted-foreground">0.0</span>
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[temperatureDraft ?? temperature]}
              onValueChange={(values) => setTemperatureDraft(values[0] ?? null)}
              onValueCommit={(values) => {
                const next = values[0];
                setTemperatureDraft(null);
                if (next !== undefined && next !== temperature) {
                  void generation.track(setAISettings({ temperature: next }));
                }
              }}
              aria-label="Temperature"
              className="flex-1"
            />
            <span className="w-6 text-xs text-muted-foreground">2.0</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-xs text-muted-foreground">Precise</span>
            <span className="text-xs text-muted-foreground">Creative</span>
          </div>
        </SettingRow>

        <SettingRow
          label="Max tokens"
          description="Maximum number of tokens the model can generate per response."
          htmlFor="ai-max-tokens"
        >
          <Input
            id="ai-max-tokens"
            type="number"
            min={MAX_TOKENS_MIN}
            max={MAX_TOKENS_MAX}
            className="w-32"
            value={maxTokensDraft ?? String(maxTokens)}
            onChange={(event) => setMaxTokensDraft(event.target.value)}
            onBlur={commitMaxTokens}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitMaxTokens();
              }
            }}
          />
        </SettingRow>

        <SettingRow
          label="Typing animation"
          description="Reveal AI responses word by word as they stream."
          htmlFor="ai-typing-animation"
        >
          <Switch
            id="ai-typing-animation"
            checked={typingEffect}
            onCheckedChange={(checked) =>
              void generation.track(setAISettings({ typingEffect: checked }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Show reasoning when available"
          description="Display the model's thinking trace above the answer. Only renders what the model emits — doesn't enable the capability itself."
          htmlFor="ai-show-reasoning"
        >
          <Switch
            id="ai-show-reasoning"
            checked={showReasoning}
            onCheckedChange={(checked) =>
              void generation.track(setAISettings({ showReasoning: checked }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Show suggested follow-ups"
          description="After each reply, render 2–3 chip suggestions for the next prompt. The model used is set in Feature Routing under Suggested Follow-ups."
          htmlFor="ai-show-follow-ups"
        >
          <Switch
            id="ai-show-follow-ups"
            checked={showFollowUps}
            onCheckedChange={(checked) =>
              void generation.track(setAISettings({ showFollowUps: checked }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Resume streams after reload"
          description="Keep an in-progress reply streaming live across page reloads and second tabs. Uses Redis while a reply streams; turn off to avoid that usage — finished replies still appear after reload."
          htmlFor="ai-resumable-streams"
        >
          <Switch
            id="ai-resumable-streams"
            checked={resumableStreams}
            onCheckedChange={(checked) =>
              void generation.track(
                setAISettings({ resumableStreams: checked }),
              )
            }
          />
        </SettingRow>
      </SettingSection>

      <SettingSection
        title="Features"
        description="Where AI shows up across the app."
        action={<SavedIndicator status={features.status} error={features.error} />}
      >
        <SettingRow
          label="Enable AI features"
          description="Chat, tools, and AI assistance across the application. Turning this off disables all of them."
          htmlFor="ai-enabled"
        >
          <Switch
            id="ai-enabled"
            checked={enabled}
            onCheckedChange={(checked) =>
              void features.track(setAISettings({ enabled: checked }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Show AI content highlights"
          description="Subtly highlight text that was inserted or edited by AI with an indigo tint."
          htmlFor="ai-show-highlights"
        >
          <Switch
            id="ai-show-highlights"
            checked={showAiHighlight}
            onCheckedChange={(checked) =>
              void features.track(setAISettings({ showAiHighlight: checked }))
            }
          />
        </SettingRow>

        <SettingRow
          label="Enable folder assistant"
          description="Adds a ✨ Folder assistant option to the file tree's right-click Move menu — describe where files should go and it places them, with confirm-when-unsure and undo. Not a chat tool."
          htmlFor="ai-folder-assistant"
        >
          <Switch
            id="ai-folder-assistant"
            checked={folderAssistantEnabled}
            onCheckedChange={(checked) =>
              void features.track(
                setAISettings({
                  folderAssistant: { ...ai?.folderAssistant, enabled: checked },
                })
              )
            }
          />
        </SettingRow>
      </SettingSection>

      <SettingSection
        title="AI Tools"
        description="Tools the chat AI can invoke during a turn. Disable a tool to remove it from the assistant's tool-belt. Tools that call a remote AI provider can be pinned to a specific Connection."
        action={
          <span className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden />
            <SavedIndicator status={tools.status} error={tools.error} />
          </span>
        }
      >
        <div className="space-y-2">
          {ALL_TOOL_IDS.map((toolId) => (
            <ToolConfigRow
              key={toolId}
              toolId={toolId}
              meta={ALL_TOOL_METADATA[toolId]}
              callsAi={
                BASE_TOOL_METADATA[toolId as keyof typeof BASE_TOOL_METADATA]
                  ?.callsAi
              }
              config={toolConfig[toolId] ?? {}}
              connections={connections}
              onChange={(next) => handleToolConfigChange(toolId, next)}
            />
          ))}
        </div>
      </SettingSection>
    </SettingsPage>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Tool row — enable/disable plus a Connection→Model cascade for tools that
// themselves call a remote AI provider (`callsAi`). For generate_image the
// model dropdown is sourced from IMAGE_PROVIDER_CATALOG keyed by the chosen
// Connection's presetId.
// ─────────────────────────────────────────────────────────────────────────

const NO_OVERRIDE = "none";

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

  const imagePresetIds: ReadonlySet<string> = new Set(
    IMAGE_PROVIDER_CATALOG.map((provider) => provider.id as string)
  );
  const compatibleConnections = connections.filter(
    (connection) =>
      connection.presetId !== null && imagePresetIds.has(connection.presetId)
  );

  const modelsForPreset = (presetId: string | null) => {
    if (!presetId) return [];
    return (
      IMAGE_PROVIDER_CATALOG.find((provider) => provider.id === presetId)
        ?.models ?? []
    );
  };

  const overrideConnectionId = override
    ? connections.find(
        (connection) => connection.presetId === override.presetId
      )?.id ?? NO_OVERRIDE
    : NO_OVERRIDE;

  const checkboxId = `ai-tool-${toolId}`;

  return (
    <div
      className={
        enabled
          ? "rounded-lg border border-black/10 bg-black/[0.02] p-3 transition-colors dark:border-white/10 dark:bg-white/[0.02]"
          : "rounded-lg border border-black/5 bg-black/[0.04] p-3 transition-colors dark:border-white/5 dark:bg-black/10"
      }
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange({
              ...config,
              // Default-on, so only persist when off.
              enabled: checked === true ? undefined : false,
            })
          }
          className="mt-1"
        />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium">{meta.name}</span>
            <code className="rounded bg-black/10 px-1 py-px text-[10px] text-muted-foreground dark:bg-black/20">
              {toolId}
            </code>
            {callsAi && (
              <span className="rounded bg-amber-500/20 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Calls AI
              </span>
            )}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {meta.description}
          </p>
        </label>
      </div>

      {callsAi && enabled && (
        <div className="ml-1.5 mt-3 space-y-2 border-l border-black/10 pl-7 dark:border-white/10">
          <div className="text-xs text-muted-foreground">
            Override: always route this tool through a specific Connection.
          </div>
          {compatibleConnections.length === 0 ? (
            <div className="text-xs italic text-muted-foreground">
              No Connections support image generation yet. Add an OpenAI or
              Google Connection above to enable an override.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={overrideConnectionId}
                onValueChange={(value) => {
                  if (value === NO_OVERRIDE) {
                    onChange({ ...config, routeOverride: undefined });
                    return;
                  }
                  const connection = connections.find(
                    (candidate) => candidate.id === value
                  );
                  if (!connection?.presetId) {
                    onChange({ ...config, routeOverride: undefined });
                    return;
                  }
                  const firstModel = modelsForPreset(connection.presetId)[0];
                  if (!firstModel) {
                    onChange({ ...config, routeOverride: undefined });
                    return;
                  }
                  onChange({
                    ...config,
                    routeOverride: {
                      presetId: connection.presetId,
                      modelId: firstModel.id,
                    },
                  });
                }}
              >
                <SelectTrigger className="h-8 w-auto min-w-56 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OVERRIDE}>
                    Use feature routing / env vars
                  </SelectItem>
                  {compatibleConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} ({connection.presetId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {override && (
                <Select
                  value={override.modelId}
                  onValueChange={(value) =>
                    onChange({
                      ...config,
                      routeOverride: {
                        presetId: override.presetId,
                        modelId: value,
                      },
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-auto min-w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsForPreset(override.presetId).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
