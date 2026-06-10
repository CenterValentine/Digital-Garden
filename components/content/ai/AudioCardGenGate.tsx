"use client";

/**
 * AudioCardGenGate — the pre-generation provider/voice window for pronunciation
 * flashcards (Mode A). propose_pronunciation_cards returns drafts (no audio);
 * this gate gives the user a short window to confirm or change the speech
 * provider + voice for the batch, then synthesizes the TTS (client-triggered)
 * and hands the results back to the proposal list.
 *
 * Audio twin of ImageCardGenGate. Flow: loading → (no-providers | countdown(3s,
 * skipped when only one model) | picker) → generating → done(onComplete). The
 * "default" route is the saved generate_speech override if it's a configured
 * speech provider, otherwise the first compatible connection — so generation
 * works whenever the user has ANY speech-capable connection (e.g. an OpenAI
 * connection with tts-1), no separate setup required.
 *
 * Unlike the image gate, the picker also offers a VOICE select: speech models
 * carry named voices (Alloy/Echo/… for OpenAI), and the chosen voice rides to
 * the endpoint. Voices come from the static SPEECH_PROVIDER_CATALOG keyed by
 * model id; models not in the catalog (custom ids) fall back to the provider's
 * server-side default voice (no picker shown).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import {
  SPEECH_PROVIDER_CATALOG,
  getSpeechModelMeta,
  getDefaultVoice,
} from "@/lib/domain/ai/speech/catalog";
import { effectiveCapabilities } from "@/lib/domain/ai/features/capabilities";

export interface AudioGenResult {
  term?: string;
  audioUrl?: string;
  audioContentId?: string | null;
  error?: string;
}

interface DraftCard {
  term: string;
  language?: string;
}

/** A configured connection that has ≥1 speech-capable model. */
interface ProviderOption {
  connectionId: string;
  connectionName: string;
  presetId: string | null;
  providerName: string;
  /** This connection's speech-capable models. */
  models: Array<{ id: string; name: string }>;
}

interface Route {
  connectionId: string;
  presetId: string | null;
  modelId: string;
  voice?: string;
}

const COUNTDOWN_SECONDS = 3;

/**
 * Speech capability is intrinsic to the MODEL, not the provider — any model
 * whose declared/inferred capabilities include speech (TTS) output qualifies
 * (e.g. a manually-added `tts-1`, inferred via the `/\btts\b/` rule). The
 * capability token is normalized to `"speech"`.
 */
function isSpeechModel(model: { id: string; capabilities?: string[] }): boolean {
  return effectiveCapabilities(model).has("speech");
}

function providerNameFor(presetId: string | null): string {
  if (!presetId) return "Custom";
  return SPEECH_PROVIDER_CATALOG.find((p) => p.id === presetId)?.name ?? presetId;
}

/** Catalog voices for a model id (empty when the model isn't catalogued). */
function voicesFor(modelId: string): Array<{ id: string; name: string }> {
  return (
    getSpeechModelMeta(modelId)?.model.voices.map((v) => ({
      id: v.id,
      name: v.name,
    })) ?? []
  );
}

type Phase =
  | "loading"
  | "no-providers"
  | "countdown"
  | "picker"
  | "generating"
  | "done";

export function AudioCardGenGate({
  cards,
  onComplete,
}: {
  cards: DraftCard[];
  onComplete: (results: AudioGenResult[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [defaultRoute, setDefaultRoute] = useState<Route | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [pickConnectionId, setPickConnectionId] = useState<string>("");
  const [pickModel, setPickModel] = useState<string>("");
  const [pickVoice, setPickVoice] = useState<string>("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards the expensive generation POST so it fires exactly once even when
  // an effect double-invokes (StrictMode) or multiple triggers race. Reset on
  // failure so the user can retry from the picker.
  const genStartedRef = useRef(false);
  // True when there are no configured speech connections — generation then
  // relies on the server-side default (env key for ElevenLabs/Google). On
  // failure with no connections there's no picker to fall back to, so we show
  // the setup prompt.
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
          // Best-effort: write the persistent generate_speech override. Needs a
          // presetId (custom connections without one can't be saved as a route
          // override).
          await persistSpeechDefault({
            presetId: route.presetId,
            modelId: route.modelId,
          });
        }
        const res = await fetch("/api/flashcards/generate-card-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            cards: cards.map((c) => ({ term: c.term, language: c.language })),
            connectionId: route?.connectionId,
            modelId: route?.modelId,
            voice: route?.voice,
          }),
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { results?: AudioGenResult[] };
        } | null;
        if (!res.ok || !json?.success || !json.data?.results) {
          throw new Error("Audio generation request failed");
        }
        setPhase("done");
        onComplete(json.data.results);
      } catch (e) {
        // Allow a retry. With no connections there's no picker — show the
        // setup prompt (the env-backed default also failed). Otherwise the
        // picker lets the user choose a different connection/voice and retry.
        genStartedRef.current = false;
        setError(e instanceof Error ? e.message : "Audio generation failed");
        setPhase(noConnectionsRef.current ? "no-providers" : "picker");
      }
    },
    [cards, onComplete],
  );

  // Load configured speech providers + the saved default. The cancelled flag
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

        // Capability-based discovery: any connection whose SAVED models include
        // a speech-capable one qualifies (e.g. an OpenAI connection with a
        // manually-added tts-1).
        const compatible: ProviderOption[] = (connBody?.data?.items ?? [])
          .map((c) => {
            const speechModels = (c.models ?? [])
              .filter(isSpeechModel)
              .map((m) => ({ id: m.id, name: m.name ?? m.id }));
            return {
              connectionId: c.id,
              connectionName: c.name,
              presetId: c.presetId,
              providerName: providerNameFor(c.presetId),
              models: speechModels,
            };
          })
          .filter((p) => p.models.length > 0);

        if (compatible.length === 0) {
          // No connection with a speech model — but TTS may still work via a
          // server-side env key (ElevenLabs/Google). Try the default route;
          // runGeneration's catch shows the setup prompt only if that ALSO
          // fails.
          noConnectionsRef.current = true;
          setProviders([]);
          setDefaultRoute(null);
          void runGeneration(null, false);
          return;
        }

        // Default route: the saved generate_speech override if it maps to a
        // compatible connection+model, else the first compatible pair.
        const saved =
          settingsBody?.data?.ai?.toolConfig?.generate_speech?.routeOverride;
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
              voice: getDefaultVoice(saved!.modelId),
            }
          : {
              connectionId: compatible[0].connectionId,
              presetId: compatible[0].presetId,
              modelId: compatible[0].models[0].id,
              voice: getDefaultVoice(compatible[0].models[0].id),
            };

        setProviders(compatible);
        setDefaultRoute(route);
        setPickConnectionId(route.connectionId);
        setPickModel(route.modelId);
        setPickVoice(route.voice ?? "");

        // Skip the window only when there's genuinely nothing to choose — a
        // single speech model across all connections AND that model has no
        // voice choice (≤1 voice). Otherwise show the countdown so the user
        // can change voice/model.
        const totalModelChoices = compatible.reduce(
          (n, p) => n + p.models.length,
          0,
        );
        const voiceChoices = voicesFor(route.modelId).length;
        if (totalModelChoices <= 1 && voiceChoices <= 1) {
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
              ? `Generating ${cards.length} pronunciation${cards.length === 1 ? "" : "s"}…`
              : "Preparing audio generation…"}
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
            <p className="font-medium">No speech provider connected</p>
            <p className="text-amber-800/80 dark:text-amber-200/70">
              Connect a speech-capable provider (e.g. an OpenAI connection with{" "}
              <span className="font-mono">tts-1</span>) to generate these
              pronunciations.{" "}
              <a
                href="/settings/ai/connections"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Open AI connections →
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
            Choose a different voice
          </button>
        </div>
      </div>
    );
  }

  // phase === "picker"
  const pickedConn = providers.find((p) => p.connectionId === pickConnectionId);
  const modelsForPick = pickedConn?.models ?? [];
  const voicesForPick = voicesFor(pickModel);
  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="font-medium">Choose a voice for this batch</span>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide opacity-70">Provider</span>
          <select
            value={pickConnectionId}
            onChange={(e) => {
              setPickConnectionId(e.target.value);
              const conn = providers.find((p) => p.connectionId === e.target.value);
              const nextModel = conn?.models[0]?.id ?? "";
              setPickModel(nextModel);
              setPickVoice(getDefaultVoice(nextModel) ?? "");
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
            onChange={(e) => {
              setPickModel(e.target.value);
              setPickVoice(getDefaultVoice(e.target.value) ?? "");
            }}
            className="rounded-md border border-amber-400/30 bg-white/40 px-2 py-1 text-[12px] dark:bg-black/30"
          >
            {modelsForPick.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {voicesForPick.length > 0 && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide opacity-70">Voice</span>
            <select
              value={pickVoice}
              onChange={(e) => setPickVoice(e.target.value)}
              className="rounded-md border border-amber-400/30 bg-white/40 px-2 py-1 text-[12px] dark:bg-black/30"
            >
              {voicesForPick.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={!pickConnectionId || !pickModel}
          onClick={() =>
            void runGeneration(
              {
                connectionId: pickConnectionId,
                presetId: pickedConn?.presetId ?? null,
                modelId: pickModel,
                voice: pickVoice || undefined,
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
        <span>Make this my default speech model</span>
      </label>
      <p className="mt-1 text-[11px] opacity-70">
        Add or change providers in{" "}
        <a
          href="/settings/ai/connections"
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
 * Persist the chosen route as the generate_speech default. GET current ai
 * settings, merge the override, PATCH the whole ai object (the settings route
 * expects the full ai blob). Best-effort — failure doesn't block generation.
 */
async function persistSpeechDefault(route: {
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
      generate_speech: {
        ...(((ai.toolConfig as Record<string, { [k: string]: unknown }>) ?? {})
          .generate_speech ?? {}),
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
