/**
 * AI Settings Page — Sprint 33
 *
 * Four sections for Sprint 33:
 *   1. Provider & Model selection (uses PROVIDER_CATALOG)
 *   2. Generation Parameters (temperature, maxTokens, streaming)
 *   3. AI Feature Toggles (enabled, conversation history, auto-suggest, privacy)
 *   4. Usage (read-only token quota display)
 *
 * Future sprints add: Tool Choice (34), BYOK + Speech (35), RAG (36).
 * All settings persist via PATCH /api/user/settings → User.settings.ai JSONB.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { PROVIDER_CATALOG, getModelMeta } from "@/lib/domain/ai";
import type { AIProviderId } from "@/lib/domain/ai";
import { Button } from "@/components/ui/glass/button";
import { Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/** Shape of ai settings as stored in User.settings.ai */
interface AISettings {
  enabled?: boolean;
  providerId?: AIProviderId;
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  streamingEnabled?: boolean;
  conversationHistory?: boolean;
  autoSuggest?: boolean;
  privacyMode?: "full" | "minimal" | "none";
  monthlyTokenQuota?: number;
  tokensUsedThisMonth?: number;
}

const DEFAULTS: Required<AISettings> = {
  enabled: true,
  providerId: "anthropic",
  modelId: "claude-sonnet-3-5",
  temperature: 0.7,
  maxTokens: 4096,
  streamingEnabled: true,
  conversationHistory: true,
  autoSuggest: true,
  privacyMode: "full",
  monthlyTokenQuota: 100_000,
  tokensUsedThisMonth: 0,
};

export default function AISettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  // Form state
  const [enabled, setEnabled] = useState(DEFAULTS.enabled);
  const [providerId, setProviderId] = useState<AIProviderId>(DEFAULTS.providerId);
  const [modelId, setModelId] = useState(DEFAULTS.modelId);
  const [temperature, setTemperature] = useState(DEFAULTS.temperature);
  const [maxTokens, setMaxTokens] = useState(DEFAULTS.maxTokens);
  const [streamingEnabled, setStreamingEnabled] = useState(DEFAULTS.streamingEnabled);
  const [conversationHistory, setConversationHistory] = useState(DEFAULTS.conversationHistory);
  const [autoSuggest, setAutoSuggest] = useState(DEFAULTS.autoSuggest);
  const [privacyMode, setPrivacyMode] = useState<"full" | "minimal" | "none">(DEFAULTS.privacyMode);
  const [monthlyTokenQuota, setMonthlyTokenQuota] = useState(DEFAULTS.monthlyTokenQuota);
  const [tokensUsedThisMonth, setTokensUsedThisMonth] = useState(DEFAULTS.tokensUsedThisMonth);

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
          if (ai.providerId) setProviderId(ai.providerId);
          if (ai.modelId) setModelId(ai.modelId);
          if (ai.temperature !== undefined) setTemperature(ai.temperature);
          if (ai.maxTokens !== undefined) setMaxTokens(ai.maxTokens);
          if (ai.streamingEnabled !== undefined) setStreamingEnabled(ai.streamingEnabled);
          if (ai.conversationHistory !== undefined) setConversationHistory(ai.conversationHistory);
          if (ai.autoSuggest !== undefined) setAutoSuggest(ai.autoSuggest);
          if (ai.privacyMode) setPrivacyMode(ai.privacyMode);
          if (ai.monthlyTokenQuota !== undefined) setMonthlyTokenQuota(ai.monthlyTokenQuota);
          if (ai.tokensUsedThisMonth !== undefined) setTokensUsedThisMonth(ai.tokensUsedThisMonth);
        }
      } catch (err) {
        console.error("Failed to load AI settings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, []);

  // When provider changes, pick first model of that provider
  const handleProviderChange = useCallback(
    (newProviderId: AIProviderId) => {
      setProviderId(newProviderId);
      const provider = PROVIDER_CATALOG.find((p) => p.id === newProviderId);
      if (provider && provider.models.length > 0) {
        setModelId(provider.models[0].id);
      }
    },
    []
  );

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
            providerId,
            modelId,
            temperature,
            maxTokens,
            streamingEnabled,
            conversationHistory,
            autoSuggest,
            privacyMode,
            monthlyTokenQuota,
            tokensUsedThisMonth,
          },
        }),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      toast.success("AI settings saved", {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      console.error("Failed to save AI settings:", err);
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Derived data
  const selectedProvider = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const selectedModelMeta = getModelMeta(modelId);
  const usagePercent =
    monthlyTokenQuota > 0
      ? Math.round((tokensUsedThisMonth / monthlyTokenQuota) * 100)
      : 0;

  const usageColor =
    usagePercent >= 90
      ? "bg-red-500"
      : usagePercent >= 70
        ? "bg-yellow-500"
        : "bg-green-500";

  const usageDotColor =
    usagePercent >= 90
      ? "text-red-400"
      : usagePercent >= 70
        ? "text-yellow-400"
        : "text-green-400";

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

      {/* ─── Section 1: Provider & Model ─── */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h3 className="text-lg font-semibold mb-4">Provider & Model</h3>

        {/* Provider Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Provider</label>
          <div className="space-y-2">
            {PROVIDER_CATALOG.map((provider) => (
              <label
                key={provider.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  providerId === provider.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-white/10 hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="providerId"
                  value={provider.id}
                  checked={providerId === provider.id}
                  onChange={() => handleProviderChange(provider.id as AIProviderId)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{provider.name}</div>
                  <div className="text-sm text-gray-400">
                    {provider.models.length} model{provider.models.length !== 1 ? "s" : ""} available
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">Model</label>
          {selectedProvider && (
            <div className="space-y-2">
              {selectedProvider.models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    modelId === model.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="modelId"
                    value={model.id}
                    checked={modelId === model.id}
                    onChange={() => setModelId(model.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {model.name}
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded ${
                          model.costTier === "low"
                            ? "bg-green-500/20 text-green-400"
                            : model.costTier === "medium"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-purple-500/20 text-purple-400"
                        }`}
                      >
                        {model.costTier}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {(model.contextWindow / 1000).toFixed(0)}K context
                      {" · "}
                      {(model.maxOutput / 1000).toFixed(0)}K max output
                      {model.capabilities.includes("vision") && " · Vision"}
                      {model.capabilities.includes("tools") && " · Tools"}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Model Info */}
        {selectedModelMeta && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-xs text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
              Using <span className="text-gray-300">{selectedModelMeta.model.name}</span> via{" "}
              <span className="text-gray-300">{selectedModelMeta.provider.name}</span>
            </div>
          </div>
        )}
      </div>

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
            {selectedModelMeta && maxTokens > selectedModelMeta.model.maxOutput && (
              <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Exceeds {selectedModelMeta.model.name}&apos;s max output of{" "}
                {selectedModelMeta.model.maxOutput.toLocaleString()} tokens. The model will cap
                output at its own limit.
              </p>
            )}
          </div>

          {/* Streaming Toggle */}
          <div>
            <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={streamingEnabled}
                onChange={(e) => setStreamingEnabled(e.target.checked)}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Enable Streaming</div>
                <div className="text-sm text-gray-400">
                  See responses appear token-by-token instead of waiting for the full response.
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

          {/* Conversation History */}
          <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={conversationHistory}
              onChange={(e) => setConversationHistory(e.target.checked)}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">Conversation History</div>
              <div className="text-sm text-gray-400">
                Include previous messages as context for follow-up questions.
              </div>
            </div>
          </label>

          {/* Auto-Suggest */}
          <label className="flex items-center gap-3 p-2.5 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={autoSuggest}
              onChange={(e) => setAutoSuggest(e.target.checked)}
            />
            <div className="flex-1">
              <div className="font-medium text-sm">Auto-Suggest</div>
              <div className="text-sm text-gray-400">
                Show AI-powered suggestions while editing notes.
              </div>
            </div>
          </label>

          {/* Privacy Mode */}
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-300 mb-3">Privacy Mode</label>
            <p className="text-xs text-gray-500 mb-3">
              Controls how much note content is sent to the AI provider.
            </p>
            <div className="space-y-2">
              {[
                {
                  value: "full" as const,
                  label: "Full Context",
                  description: "Send complete note content for the best AI responses.",
                },
                {
                  value: "minimal" as const,
                  label: "Minimal Context",
                  description: "Send only the selected text or current paragraph.",
                },
                {
                  value: "none" as const,
                  label: "No Context",
                  description: "Never send note content. Chat-only mode with no document awareness.",
                },
              ].map((mode) => (
                <label
                  key={mode.value}
                  className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    privacyMode === mode.value
                      ? "border-primary/40 bg-primary/5"
                      : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="privacyMode"
                    value={mode.value}
                    checked={privacyMode === mode.value}
                    onChange={() => setPrivacyMode(mode.value)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{mode.label}</div>
                    <div className="text-sm text-gray-400">{mode.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 4: Usage (read-only) ─── */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        <h3 className="text-lg font-semibold mb-4">Usage</h3>

        <div className="space-y-4">
          {/* Token Quota Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-300">
                {tokensUsedThisMonth.toLocaleString()} / {monthlyTokenQuota.toLocaleString()} tokens
              </span>
              <span className={usageDotColor}>{usagePercent}% used</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full ${usageColor} rounded-full transition-all duration-300`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Status */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-gray-400">
              <span className={`inline-block w-2 h-2 rounded-full ${usageColor} mr-2`} />
              {usagePercent >= 90
                ? "Approaching quota limit. Consider increasing your monthly quota."
                : usagePercent >= 70
                  ? "Usage is moderate. Plenty of tokens remaining."
                  : "Usage is healthy. Token budget is on track."}
            </div>
          </div>

          {/* Monthly Quota Setting */}
          <div className="pt-4 border-t border-white/10">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Monthly Token Quota
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Set a soft limit for monthly token usage.
            </p>
            <input
              type="number"
              min={1000}
              step={10000}
              value={monthlyTokenQuota}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1000) setMonthlyTokenQuota(val);
              }}
              className="w-full px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
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
