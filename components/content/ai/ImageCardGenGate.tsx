"use client";

/**
 * ImageCardGenGate — the pre-generation provider window for identification
 * image flashcards. propose_image_cards returns drafts (no images); this gate
 * gives the user a short window to confirm or change the image provider for the
 * batch, then generates the images (client-triggered) and hands the results
 * back to the proposal list.
 *
 * Flow: loading → (no-providers | countdown(3s, skipped when only one
 * provider) | picker) → generating → done(onComplete). The "default" route is
 * the saved generate_image override if it's a configured image provider,
 * otherwise the first compatible connection — so generation works whenever the
 * user has ANY image-capable connection, no separate setup required.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";

export interface ImageGenResult {
  frontImageUrl?: string;
  frontImageContentId?: string | null;
  frontContent?: JSONContent;
  error?: string;
}

interface DraftCard {
  imagePrompt: string;
  identifyLabel: string;
}

interface ProviderOption {
  /** Connection id. */
  id: string;
  /** Connection display name. */
  name: string;
  /** Image provider preset id (in IMAGE_PROVIDER_CATALOG). */
  presetId: string;
  /** Provider display name from the catalog. */
  providerName: string;
  models: Array<{ id: string; name: string }>;
}

interface Route {
  presetId: string;
  modelId: string;
}

const COUNTDOWN_SECONDS = 3;

const IMAGE_PRESET_IDS = new Set<string>(
  IMAGE_PROVIDER_CATALOG.map((p) => p.id as string),
);

function modelsFor(presetId: string): Array<{ id: string; name: string }> {
  return (
    IMAGE_PROVIDER_CATALOG.find((p) => p.id === presetId)?.models.map((m) => ({
      id: m.id as string,
      name: m.name,
    })) ?? []
  );
}

function providerNameFor(presetId: string): string {
  return IMAGE_PROVIDER_CATALOG.find((p) => p.id === presetId)?.name ?? presetId;
}

type Phase =
  | "loading"
  | "no-providers"
  | "countdown"
  | "picker"
  | "generating"
  | "done";

export function ImageCardGenGate({
  cards,
  onComplete,
}: {
  cards: DraftCard[];
  onComplete: (results: ImageGenResult[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [defaultRoute, setDefaultRoute] = useState<Route | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [pickPreset, setPickPreset] = useState<string>("");
  const [pickModel, setPickModel] = useState<string>("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards the expensive generation POST so it fires exactly once even when
  // an effect double-invokes (StrictMode) or multiple triggers race. Reset on
  // failure so the user can retry from the picker.
  const genStartedRef = useRef(false);
  // True when there are no configured image connections — generation then
  // relies on the server-side default (env key). On failure with no
  // connections there's no picker to fall back to, so we show the setup prompt.
  const noConnectionsRef = useRef(false);

  // Generate with a route (or the default when route is null → server resolves).
  const runGeneration = useCallback(
    async (route: Route | null, persistDefault: boolean) => {
      if (genStartedRef.current) return;
      genStartedRef.current = true;
      setPhase("generating");
      setError(null);
      try {
        if (persistDefault && route) {
          // Best-effort: write the persistent generate_image override.
          await persistImageDefault(route);
        }
        const res = await fetch("/api/flashcards/generate-card-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cards,
            providerId: route?.presetId,
            modelId: route?.modelId,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { results?: ImageGenResult[] };
        } | null;
        if (!res.ok || !json?.success || !json.data?.results) {
          throw new Error("Image generation request failed");
        }
        setPhase("done");
        onComplete(json.data.results);
      } catch (e) {
        // Allow a retry. With no connections there's no picker — show the
        // setup prompt (the env-backed default also failed). Otherwise the
        // picker lets the user choose a different connection/model and retry.
        genStartedRef.current = false;
        setError(e instanceof Error ? e.message : "Image generation failed");
        setPhase(noConnectionsRef.current ? "no-providers" : "picker");
      }
    },
    [cards, onComplete],
  );

  // Load configured image providers + the saved default. The cancelled flag
  // (not a run-once ref) guards stale state writes — so a StrictMode
  // double-invoke can't deadlock the phase. Generation is separately guarded
  // by genStartedRef, so a double-invoke won't double-generate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [connRes, settingsRes] = await Promise.all([
          fetch("/api/ai/connections", { credentials: "include" }),
          fetch("/api/user/settings", { credentials: "include" }),
        ]);
        const connBody = (await connRes.json().catch(() => null)) as {
          data?: { items?: Array<{ id: string; name: string; presetId: string | null }> };
        } | null;
        const settingsBody = (await settingsRes.json().catch(() => null)) as {
          data?: { ai?: { toolConfig?: Record<string, { routeOverride?: Route }> } };
        } | null;
        if (cancelled) return;

        const compatible: ProviderOption[] = (connBody?.data?.items ?? [])
          .filter((c) => c.presetId && IMAGE_PRESET_IDS.has(c.presetId))
          .map((c) => ({
            id: c.id,
            name: c.name,
            presetId: c.presetId as string,
            providerName: providerNameFor(c.presetId as string),
            models: modelsFor(c.presetId as string),
          }))
          .filter((p) => p.models.length > 0);

        if (compatible.length === 0) {
          // No configured connection — but image gen may still work via a
          // server-side env key. Try the default route; runGeneration's catch
          // shows the setup prompt only if that ALSO fails.
          noConnectionsRef.current = true;
          setProviders([]);
          setDefaultRoute(null);
          void runGeneration(null, false);
          return;
        }

        // Default route: saved override if it's a compatible provider, else
        // the first compatible connection's first model.
        const saved =
          settingsBody?.data?.ai?.toolConfig?.generate_image?.routeOverride;
        const savedCompatible =
          saved && compatible.some((p) => p.presetId === saved.presetId)
            ? saved
            : null;
        const fallback: Route = {
          presetId: compatible[0].presetId,
          modelId: compatible[0].models[0].id,
        };
        const route = savedCompatible ?? fallback;

        setProviders(compatible);
        setDefaultRoute(route);
        setPickPreset(route.presetId);
        setPickModel(route.modelId);

        // One provider → no real choice → generate immediately. Multiple →
        // give the user a countdown window to intervene.
        if (compatible.length === 1) {
          void runGeneration(route, false);
        } else {
          setPhase("countdown");
        }
      } catch {
        if (!cancelled) setPhase("no-providers");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runGeneration]);

  // Countdown tick → auto-generate with the default when it hits zero.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      void runGeneration(defaultRoute, false);
      return;
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, defaultRoute, runGeneration]);

  if (phase === "done") return null;

  const wrap =
    "mx-1 mb-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2.5 text-[12px] text-amber-900 dark:text-amber-200";

  if (phase === "loading" || phase === "generating") {
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {phase === "generating"
              ? `Generating ${cards.length} image${cards.length === 1 ? "" : "s"}…`
              : "Preparing image generation…"}
          </span>
        </div>
      </div>
    );
  }

  if (phase === "no-providers") {
    return (
      <div className={wrap}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">No image provider connected</p>
            <p className="text-amber-800/80 dark:text-amber-200/70">
              Connect an image-capable provider to generate these cards.{" "}
              <a
                href="/help/image-generation"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                How to enable image generation →
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "countdown") {
    const name = defaultRoute ? providerNameFor(defaultRoute.presetId) : "default";
    return (
      <div className={wrap}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>
              Generating with <span className="font-medium">{name}</span> in{" "}
              <span className="font-mono">{countdown}</span>…
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPhase("picker")}
            className="rounded-md border border-amber-400/40 px-2.5 py-1 font-medium transition-colors hover:bg-amber-500/15"
          >
            Choose a different model
          </button>
        </div>
      </div>
    );
  }

  // phase === "picker"
  const modelsForPick = modelsFor(pickPreset);
  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="font-medium">Choose an image model for this batch</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide opacity-70">Provider</span>
          <select
            value={pickPreset}
            onChange={(e) => {
              setPickPreset(e.target.value);
              setPickModel(modelsFor(e.target.value)[0]?.id ?? "");
            }}
            className="rounded-md border border-amber-400/30 bg-white/40 px-2 py-1 text-[12px] dark:bg-black/30"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.presetId}>
                {p.providerName} ({p.name})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide opacity-70">Model</span>
          <select
            value={pickModel}
            onChange={(e) => setPickModel(e.target.value)}
            className="rounded-md border border-amber-400/30 bg-white/40 px-2 py-1 text-[12px] dark:bg-black/30"
          >
            {modelsForPick.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!pickPreset || !pickModel}
          onClick={() =>
            void runGeneration(
              { presetId: pickPreset, modelId: pickModel },
              makeDefault,
            )
          }
          className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
        >
          Generate
        </button>
      </div>
      <label className="mt-2 flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={makeDefault}
          onChange={(e) => setMakeDefault(e.target.checked)}
          className="h-3.5 w-3.5 accent-amber-500"
        />
        <span>Make this my default image model</span>
      </label>
      <p className="mt-1 text-[11px] opacity-70">
        Add or change providers in{" "}
        <a
          href="/help/image-generation"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Settings → AI
        </a>
        .
      </p>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

/**
 * Persist the chosen route as the generate_image default. GET current ai
 * settings, merge the override, PATCH the whole ai object (the settings route
 * expects the full ai blob). Best-effort — failure doesn't block generation.
 */
async function persistImageDefault(route: Route): Promise<void> {
  try {
    const res = await fetch("/api/user/settings", { credentials: "include" });
    const body = (await res.json().catch(() => null)) as {
      data?: { ai?: Record<string, unknown> };
    } | null;
    const ai = (body?.data?.ai ?? {}) as Record<string, unknown>;
    const toolConfig = {
      ...((ai.toolConfig as Record<string, unknown>) ?? {}),
      generate_image: {
        ...(((ai.toolConfig as Record<string, { [k: string]: unknown }>) ?? {})
          .generate_image ?? {}),
        routeOverride: route,
      },
    };
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ai: { ...ai, toolConfig } }),
    });
  } catch {
    // non-fatal
  }
}
