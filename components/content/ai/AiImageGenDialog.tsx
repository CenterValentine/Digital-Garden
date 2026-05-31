/**
 * AiImageGenDialog — modal launched from `+ AI → Image Generation`
 * and from the editor's /ai-image slash command.
 *
 * Collects a prompt + provider/model + size, POSTs to `/api/ai/image`
 * with `role: "primary"` so the generated image lands as a first-class
 * file ContentNode in the current folder. On success: closes + selects
 * the new node (the parent passes a callback). On failure: inline
 * error banner with the upstream's message.
 *
 * Model list is the **union of** IMAGE_PROVIDER_CATALOG (well-known
 * defaults: DALL·E 3, GPT Image 1, Imagen 3, FLUX, etc.) and any
 * image-capable model the user has saved on a Connection (detected
 * via the same capability inference the feature router uses). So
 * gateway-only models like `openai/gpt-image-1` and Nano Banana
 * (`google/gemini-2.5-flash-image`) surface in the picker alongside
 * the catalog defaults.
 *
 * Connection-key resolution happens server-side via the route's
 * `resolveImageProviderRouting` helper — the dialog doesn't pick a
 * Connection, just sends (providerId, modelId).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import type { ImageSize } from "@/lib/domain/ai/image/types";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";

/** Provider id (catalog or user-added) shown in the dialog. */
type ProviderId = string;
/** Model id (catalog or user-added) shown in the dialog. */
type ModelId = string;

interface PickerProvider {
  id: ProviderId;
  name: string;
  models: PickerModel[];
}

interface PickerModel {
  id: ModelId;
  /** Display name — falls back to id when user added without naming. */
  name: string;
  supportedSizes: ImageSize[];
  defaultSize: ImageSize;
  /** Where this model came from — purely informational for the UI. */
  source: "catalog" | "connection";
  /** Connection that surfaced this entry (for the Connection-source case). */
  via?: string;
}

interface AiImageGenDialogProps {
  /** Folder to create the file under; null = root. */
  parentId: string | null;
  /** Dismiss the modal (Escape, X, Cancel, or success). */
  onClose: () => void;
  /** Fired with the new ContentNode id after a successful save. */
  onCreated?: (contentId: string) => void;
  /**
   * Fired with the full result (id + URL + alt) so the caller can do
   * an inline insertion in addition to (or instead of) the standalone
   * file. Used by the in-doc slash command path so the image lands
   * inline in the open document.
   */
  onCreatedFull?: (result: { contentId: string; url: string; prompt: string }) => void;
}

export function AiImageGenDialog({
  parentId,
  onClose,
  onCreated,
  onCreatedFull,
}: AiImageGenDialogProps) {
  const glass0 = getSurfaceStyles("glass-0");

  // Form state — provider/model are plain strings now since the picker
  // can include user-added models that aren't in the static ImageModelId
  // union (e.g. Nano Banana, gpt-image-1.5, flux-2-max).
  const [providerId, setProviderId] = useState<ProviderId>("openai");
  const [modelId, setModelId] = useState<ModelId>("dall-e-3");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<ImageSize>("1024x1024");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User's Connections — loaded on mount so we can surface their
  // image-capable models alongside the static catalog.
  interface ConnSummary {
    id: string;
    label: string;
    presetId: string | null;
    adapterKind: string;
    models: Array<{ id: string; name?: string; capabilities?: string[] }>;
  }
  const [connections, setConnections] = useState<ConnSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/connections", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const items = (body?.data?.items ?? []) as ConnSummary[];
        setConnections(items);
      })
      .catch(() => {
        // Silent — fall back to catalog-only picker.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Unified provider/model list: catalog defaults + every image-capable
  // model surfaced by any Connection. Dedup by id, with catalog metadata
  // (supported sizes, etc.) winning when overlapping.
  const allProviders = useMemo<PickerProvider[]>(() => {
    // Step 1: seed from the catalog.
    const byProvider = new Map<string, PickerProvider>();
    for (const p of IMAGE_PROVIDER_CATALOG) {
      byProvider.set(p.id, {
        id: p.id,
        name: p.name,
        models: p.models.map((m) => ({
          id: m.id,
          name: m.name,
          supportedSizes: m.supportedSizes,
          defaultSize: m.defaultSize,
          source: "catalog" as const,
        })),
      });
    }

    // Step 2: merge in Connection-surfaced image models. The picker
    // shows everything image-capable the user owns even when our
    // catalog doesn't know about it — Nano Banana, gpt-image-1.5,
    // FLUX 2, etc.
    for (const c of connections) {
      for (const m of c.models) {
        if (!effectiveCapabilities(m).has("image-generation")) continue;

        // Decide which "provider" group this model goes under.
        const slash = m.id.indexOf("/");
        const provId =
          slash > 0
            ? m.id.slice(0, slash)
            : c.presetId ?? c.adapterKind ?? "custom";
        const modelDisplayId = slash > 0 ? m.id.slice(slash + 1) : m.id;
        const provNameDefault =
          IMAGE_PROVIDER_CATALOG.find((p) => p.id === provId)?.name ??
          provId.charAt(0).toUpperCase() + provId.slice(1);

        let group = byProvider.get(provId);
        if (!group) {
          group = { id: provId, name: provNameDefault, models: [] };
          byProvider.set(provId, group);
        }

        // Skip if already in the group by display id (catalog wins).
        if (group.models.some((existing) => existing.id === modelDisplayId)) {
          continue;
        }
        group.models.push({
          id: modelDisplayId,
          name: m.name && m.name.length > 0 ? m.name : modelDisplayId,
          // Connection-added models lack size metadata — default to a
          // single common size. Most providers accept 1024x1024.
          supportedSizes: ["1024x1024"],
          defaultSize: "1024x1024",
          source: "connection",
          via: c.label,
        });
      }
    }

    return Array.from(byProvider.values())
      .filter((p) => p.models.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [connections]);

  // Currently-selected provider + model resolved against the unified
  // list. Falls back to first available if state points at something
  // that's gone (e.g. Connection deleted).
  const activeProvider =
    allProviders.find((p) => p.id === providerId) ?? allProviders[0];
  const activeModel =
    activeProvider?.models.find((m) => m.id === modelId) ??
    activeProvider?.models[0];

  // When provider changes, snap modelId + size to the new provider's
  // first valid option. Avoids invalid combinations.
  const handleProviderChange = useCallback(
    (nextId: ProviderId) => {
      const next = allProviders.find((p) => p.id === nextId);
      if (!next || next.models.length === 0) return;
      setProviderId(nextId);
      setModelId(next.models[0].id);
      setSize(next.models[0].defaultSize);
    },
    [allProviders],
  );

  const handleModelChange = useCallback(
    (nextId: ModelId) => {
      const next = activeProvider?.models.find((m) => m.id === nextId);
      if (!next) return;
      setModelId(nextId);
      if (!next.supportedSizes.includes(size)) setSize(next.defaultSize);
    },
    [activeProvider, size],
  );

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          providerId,
          modelId,
          size,
          role: "primary",
          parentId,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error?.message ?? "Image generation failed.");
        return;
      }
      const contentId = body.data?.contentId as string | undefined;
      const url = body.data?.url as string | undefined;
      if (contentId && onCreated) onCreated(contentId);
      if (contentId && url && onCreatedFull) {
        onCreatedFull({ contentId, url, prompt: prompt.trim() });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }, [prompt, submitting, providerId, modelId, size, parentId, onCreated, onCreatedFull, onClose]);

  // Escape to dismiss; Cmd/Ctrl+Enter to submit.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitting) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, handleSubmit, submitting]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generate AI image"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-white/10 shadow-2xl"
        style={{ background: glass0.background, backdropFilter: glass0.backdropFilter }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-300" />
            <h2 className="text-base font-semibold text-white">Generate AI image</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-200 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Provider + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">
                Provider
              </label>
              <select
                value={activeProvider?.id ?? ""}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={submitting || allProviders.length === 0}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
              >
                {allProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">
                Model
              </label>
              <select
                value={activeModel?.id ?? ""}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={submitting || !activeProvider}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
              >
                {activeProvider?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.source === "connection" && m.via ? ` — via ${m.via}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label
              htmlFor="ai-image-prompt"
              className="block text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5"
            >
              Prompt
            </label>
            <textarea
              id="ai-image-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={submitting}
              autoFocus
              rows={4}
              placeholder="Describe the image you want — subject, style, composition, mood…"
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 disabled:opacity-50 resize-y"
            />
          </div>

          {/* Size */}
          {activeModel && (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1.5">
                Size
              </label>
              <div className="flex flex-wrap gap-1.5">
                {activeModel.supportedSizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    disabled={submitting}
                    className={`text-xs rounded-md border px-2 py-1 transition-colors ${
                      size === s
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200"
                    } disabled:opacity-50`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 break-words">{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <span className="mr-auto text-[10px] text-gray-500">
            ⌘ + ⏎ to submit
          </span>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!prompt.trim() || submitting}
          >
            {submitting ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </span>
            ) : (
              "Generate"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
