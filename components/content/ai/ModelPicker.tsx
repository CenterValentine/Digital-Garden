/**
 * Compact Model Picker
 *
 * Unobtrusive provider/model selector for chat surfaces.
 * Shows current model as a chip; opens a dropdown to switch.
 *
 * Reads user's stored AI settings as initial defaults.
 * Selection is per-session — doesn't persist to settings
 * (that's what /settings/ai is for).
 */

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import { useSettingsStore } from "@/state/settings-store";
import { useAIChatStore } from "@/state/ai-chat-store";

interface ModelPickerProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
}

export function ModelPicker({
  providerId,
  modelId,
  onChange,
  disabled = false,
}: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find current model display name
  const currentProvider = PROVIDER_CATALOG.find((p) => p.id === providerId);
  const currentModel = currentProvider?.models.find((m) => m.id === modelId);
  const displayName = currentModel?.name ?? modelId;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleSelect = useCallback(
    (newProviderId: string, newModelId: string) => {
      onChange(newProviderId, newModelId);
      setIsOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={containerRef} className="relative">
      {/* Dropdown menu (opens upward) */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
          {PROVIDER_CATALOG.map((provider) => (
            <div key={provider.id}>
              {/* Provider label */}
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium border-b border-white/5">
                {provider.name}
              </div>
              {/* Model options */}
              {provider.models.map((model) => {
                const isSelected =
                  provider.id === providerId && model.id === modelId;
                return (
                  <button
                    key={model.id}
                    onClick={() => handleSelect(provider.id, model.id)}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-white/10 text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-black/[0.04] hover:text-gray-800 dark:hover:bg-white/5 dark:hover:text-gray-200"
                    )}
                  >
                    <span className="truncate">{model.name}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-gray-600">
                      {model.costTier === "low"
                        ? "$"
                        : model.costTier === "medium"
                          ? "$$"
                          : "$$$"}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Trigger chip */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px]",
          "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-600 dark:text-gray-400 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <Sparkles className="h-3 w-3 shrink-0" />
        <span className="truncate">{displayName}</span>
        <ChevronUp
          className={cn(
            "ml-auto h-3 w-3 shrink-0 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
    </div>
  );
}

/**
 * Hook to initialize model selection from user settings.
 *
 * Reads/writes a session-scoped Zustand slice in `useAIChatStore` so
 * the active selection is shared between the make/model picker and
 * the sidebar tab strip (which needs the active provider to tint the
 * active tab in real time). Falls back to the user's stored default
 * from `useSettingsStore` on first use.
 */
export function useModelSelection() {
  const storedProviderId = useSettingsStore((s) => s.ai?.providerId);
  const storedModelId = useSettingsStore((s) => s.ai?.modelId);
  const sessionProviderId = useAIChatStore((s) => s.activeProviderId);
  const sessionModelId = useAIChatStore((s) => s.activeModelId);
  const setActive = useAIChatStore((s) => s.setActiveModelSelection);

  const providerId =
    sessionProviderId ?? storedProviderId ?? "anthropic";
  const modelId = sessionModelId ?? storedModelId ?? "claude-sonnet-3-5";

  // Hydrate the session store from settings on first render if empty
  // — `useState` lazy init would also work but using an effect keeps
  // the hook safely callable across many surfaces.
  useEffect(() => {
    if (sessionProviderId === null || sessionModelId === null) {
      setActive(providerId, modelId);
    }
    // We intentionally depend only on the storedX inputs; rerunning on
    // every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedProviderId, storedModelId]);

  const handleChange = useCallback(
    (newProviderId: string, newModelId: string) => {
      setActive(newProviderId, newModelId);
    },
    [setActive],
  );

  return { providerId, modelId, handleChange };
}
