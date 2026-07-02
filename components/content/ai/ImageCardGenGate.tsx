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
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";

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

/** A configured connection that has ≥1 image-capable model. */
interface ProviderOption {
  connectionId: string;
  connectionName: string;
  presetId: string | null;
  providerName: string;
  /** This connection's image-capable models. */
  models: Array<{ id: string; name: string }>;
}

interface Route {
  connectionId: string;
  presetId: string | null;
  modelId: string;
}

const COUNTDOWN_SECONDS = 3;

/**
 * Image capability is intrinsic to the MODEL, not the provider — so any model
 * whose declared/inferred capabilities include image output qualifies,
 * including gateway models. (Normalizes the "image" / "image-generation"
 * naming split.)
 */
function isImageModel(model: { id: string; capabilities?: string[] }): boolean {
  const caps = effectiveCapabilities(model);
  return caps.has("image-generation") || caps.has("image");
}

function providerNameFor(presetId: string | null): string {
  if (!presetId) return "Custom";
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
  const [pickConnectionId, setPickConnectionId] = useState<string>("");
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
        if (persistDefault && route?.presetId) {
          // Best-effort: write the persistent generate_image override. Needs a
          // presetId (custom connections without one can't be saved as a route
          // override).
          await persistImageDefault({
            presetId: route.presetId,
            modelId: route.modelId,
          });
        }
        const res = await fetch("/api/flashcards/generate-card-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cards,
            connectionId: route?.connectionId,
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
          data?: {
            items?: Array<{
              id: string;
              name: string;
              presetId: string | null;
              models?: Array<{ id: string; name?: string; capabilities?: string[] }>;
            }>;
          };
        } | null;
        const settingsBody = (await settingsRes.json().catch(() => null)) as {
          data?: { ai?: { toolConfig?: Record<string, { routeOverride?: { presetId: string; modelId: string } }> } };
        } | null;
        if (cancelled) return;

        // Capability-based discovery: any connection (direct OR gateway) whose
        // SAVED models include an image-capable one qualifies — not just the
        // hardcoded direct-provider catalog.
        const compatible: ProviderOption[] = (connBody?.data?.items ?? [])
          .map((c) => {
            const imageModels = (c.models ?? [])
              .filter(isImageModel)
              .map((m) => ({ id: m.id, name: m.name ?? m.id }));
            return {
              connectionId: c.id,
              connectionName: c.name,
              presetId: c.presetId,
              providerName: providerNameFor(c.presetId),
              models: imageModels,
            };
          })
          .filter((p) => p.models.length > 0);

        if (compatible.length === 0) {
          // No connection with an image model — but image gen may still work
          // via a server-side env key. Try the default route; runGeneration's
          // catch shows the setup prompt only if that ALSO fails.
          noConnectionsRef.current = true;
          setProviders([]);
          setDefaultRoute(null);
          void runGeneration(null, false);
          return;
        }

        // Default route: the saved generate_image override if it maps to a
        // compatible connection+model, else the first compatible pair.
        const saved =
          settingsBody?.data?.ai?.toolConfig?.generate_image?.routeOverride;
        const savedConn =
          saved &&
          compatible.find(
            (p) =>
              p.presetId === saved.presetId &&
              p.models.some((m) => m.id === saved.modelId),
          );
        const route: Route = savedConn
          ? {
              connectionId: savedConn.connectionId,
              presetId: savedConn.presetId,
              modelId: saved!.modelId,
            }
          : {
              connectionId: compatible[0].connectionId,
              presetId: compatible[0].presetId,
              modelId: compatible[0].models[0].id,
            };

        setProviders(compatible);
        setDefaultRoute(route);
        setPickConnectionId(route.connectionId);
        setPickModel(route.modelId);

        // Skip the window only when there's genuinely nothing to choose —
        // i.e. a single image model across all connections. Counting
        // connections (not models) was wrong: one gateway connection holding
        // several image models would skip the picker, so the user could never
        // change model. Count total model choices instead.
        const totalChoices = compatible.reduce(
          (n, p) => n + p.models.length,
          0,
        );
        if (totalChoices <= 1) {
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
  const pickedConn = providers.find((p) => p.connectionId === pickConnectionId);
  const modelsForPick = pickedConn?.models ?? [];
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
            value={pickConnectionId}
            onChange={(e) => {
              setPickConnectionId(e.target.value);
              const conn = providers.find((p) => p.connectionId === e.target.value);
              setPickModel(conn?.models[0]?.id ?? "");
            }}
            className="rounded-md border border-amber-400/30 bg-white/40 px-2 py-1 text-[12px] dark:bg-black/30"
          >
            {providers.map((p) => (
              <option key={p.connectionId} value={p.connectionId}>
                {p.providerName} ({p.connectionName})
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
          disabled={!pickConnectionId || !pickModel}
          onClick={() =>
            void runGeneration(
              {
                connectionId: pickConnectionId,
                presetId: pickedConn?.presetId ?? null,
                modelId: pickModel,
              },
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
async function persistImageDefault(route: {
  presetId: string;
  modelId: string;
}): Promise<void> {
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
