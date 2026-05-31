/**
 * AiImageGenDialog — modal launched from `+ AI → Image Generation`.
 *
 * Collects a prompt + provider/model + size, POSTs to `/api/ai/image`
 * with `role: "primary"` so the generated image lands as a first-class
 * file ContentNode in the current folder. On success: closes + selects
 * the new node (the parent passes a callback). On failure: inline
 * error banner with the upstream's message.
 *
 * Provider/model source is `IMAGE_PROVIDER_CATALOG` — the image-gen
 * catalog distinct from chat. Connection-key resolution happens
 * server-side via the existing `resolveImageGenRoute` helper.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, X, AlertCircle } from "lucide-react";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import type {
  ImageProviderId,
  ImageModelId,
  ImageSize,
} from "@/lib/domain/ai/image/types";
import { Button } from "@/components/ui/glass/button";
import { getSurfaceStyles } from "@/lib/design/system";

interface AiImageGenDialogProps {
  /** Folder to create the file under; null = root. */
  parentId: string | null;
  /** Dismiss the modal (Escape, X, Cancel, or success). */
  onClose: () => void;
  /** Fired with the new ContentNode id after a successful save. */
  onCreated?: (contentId: string) => void;
}

export function AiImageGenDialog({
  parentId,
  onClose,
  onCreated,
}: AiImageGenDialogProps) {
  const glass0 = getSurfaceStyles("glass-0");

  // Form state
  const [providerId, setProviderId] = useState<ImageProviderId>("openai");
  const [modelId, setModelId] = useState<ImageModelId>("dall-e-3");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<ImageSize>("1024x1024");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive currently-available models from the selected provider.
  const activeProvider = IMAGE_PROVIDER_CATALOG.find((p) => p.id === providerId);
  const activeModel = activeProvider?.models.find((m) => m.id === modelId);

  // When provider changes, snap modelId + size to that provider's first
  // valid option. Avoids invalid combinations (e.g., DALL-E size on Imagen).
  const handleProviderChange = useCallback((nextId: ImageProviderId) => {
    const next = IMAGE_PROVIDER_CATALOG.find((p) => p.id === nextId);
    if (!next || next.models.length === 0) return;
    setProviderId(nextId);
    setModelId(next.models[0].id);
    setSize(next.models[0].defaultSize);
  }, []);

  const handleModelChange = useCallback(
    (nextId: ImageModelId) => {
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
      if (contentId && onCreated) onCreated(contentId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }, [prompt, submitting, providerId, modelId, size, parentId, onCreated, onClose]);

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
                value={providerId}
                onChange={(e) =>
                  handleProviderChange(e.target.value as ImageProviderId)
                }
                disabled={submitting}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
              >
                {IMAGE_PROVIDER_CATALOG.map((p) => (
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
                value={modelId}
                onChange={(e) => handleModelChange(e.target.value as ImageModelId)}
                disabled={submitting || !activeProvider}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50"
              >
                {activeProvider?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
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
