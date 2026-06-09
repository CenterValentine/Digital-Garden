/**
 * MakeAndModelPicker — provider + model selector under the chat input.
 *
 * Layout:
 *   [Anthropic] [OpenAI] [Google] [More ▾]   [Sonnet 4 ▾]   [Mixed ⓘ]
 *
 * - "Make" chips for the big three providers (Anthropic / OpenAI /
 *   Google). The active chip is tinted in that provider's brand color.
 * - "More" overflow opens a dropdown listing non-big-three providers
 *   plus their models.
 * - Right-hand "Model" pill shows the active model and opens a list
 *   of that provider's available models.
 * - Optional "Mixed" chip surfaces when the conversation contains
 *   assistant messages from more than one provider. Hover shows the
 *   contributors.
 *
 * Selecting a different make resets to that provider's first model.
 * Selecting a model within the active make changes only the model.
 */

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronUp, ChevronDown, MoreHorizontal, Sparkles, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { PROVIDER_CATALOG } from "@/lib/domain/ai/providers/catalog";
import {
  BIG_THREE_PROVIDER_IDS,
  getProviderTheme,
} from "@/lib/design/system/ai-providers";
import type { AIProviderId } from "@/lib/domain/ai/types";
import { MixedProviderChip } from "./MixedProviderChip";
import { ProviderIcon } from "./ProviderIcon";

/** Subset of the Connection summary we need for availability checks. */
interface ConnSummary {
  id: string;
  name: string;
  presetId: string | null;
  adapterKind: string;
  // model.name is needed to display user-added models in the picker
  // dropdown alongside catalog entries — the catalog provides display
  // names for its models; Connection-added ones bring their own.
  models: Array<{ id: string; name?: string }>;
}

/**
 * A model is "available" iff some user Connection can satisfy it:
 *   - Direct match: a Connection whose `presetId === providerId` exists
 *     and (defensively) has at least one model. We don't require an
 *     exact modelId match here because direct provider Connections
 *     usually carry only the upstream-format IDs (dated for Anthropic,
 *     etc.) which don't align with our canonical IDs.
 *   - Gateway match: any Connection whose models include the namespaced
 *     `providerId/modelId` string (matches Vercel AI Gateway,
 *     OpenRouter, and most OpenAI-compatible gateways).
 *
 * False positives here are fine: the error banner now parses the
 * server's BYOK_REQUIRED and shows the right CTA, so a borderline
 * "available" model that actually fails on send won't be a dead end.
 */
function isModelAvailable(
  providerId: string,
  modelId: string,
  conns: ConnSummary[],
): boolean {
  if (conns.length === 0) return false;
  const namespaced = `${providerId}/${modelId}`;
  return conns.some((c) => {
    if (c.presetId === providerId && c.models.length > 0) return true;
    if (c.models.some((m) => m.id === namespaced)) return true;
    return false;
  });
}


/**
 * Mirror of the server resolver's lookup order. Returns the Connection
 * that would actually serve a (providerId, modelId) selection if the
 * user sent a turn right now — or null if nothing matches.
 *
 * Used by the picker to label the active model with the *transport* in
 * use (e.g. "via Vercel Gateway"). Direct-provider matches return their
 * Connection but get no badge — that's the expected default state.
 */
function resolveRoutingConnection(
  providerId: string,
  modelId: string,
  conns: ConnSummary[],
): { conn: ConnSummary; via: "direct" | "gateway" } | null {
  const direct = conns.find(
    (c) => c.presetId === providerId && c.models.length > 0,
  );
  if (direct) return { conn: direct, via: "direct" };
  const namespaced = `${providerId}/${modelId}`;
  const gateway = conns.find((c) =>
    c.models.some((m) => m.id === namespaced),
  );
  return gateway ? { conn: gateway, via: "gateway" } : null;
}

export interface MakeAndModelPickerProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
  /** When non-empty, the picker shows a "Mixed" chip with contributor info. */
  contributors?: AIProviderId[];
  /**
   * Narrow-container layout (e.g. the chat side panel). Hides the big-three
   * provider quick-icons and the "via" badge, and folds ALL providers into the
   * "More" (⋯) menu so the strip fits without clipping. The full-page chat
   * leaves this false and shows the full quick-switch row.
   */
  compact?: boolean;
}

export function MakeAndModelPicker({
  providerId,
  modelId,
  onChange,
  disabled = false,
  contributors = [],
  compact = false,
}: MakeAndModelPickerProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Connections feed the picker's availability gating. Empty list means
  // we can't verify anything — the gate falls back to "everything
  // disabled" rather than show all models as enabled and surface the
  // raw BYOK error on send. Cheap fetch; one round trip on mount.
  const [connections, setConnections] = useState<ConnSummary[]>([]);
  // Per-model notice: when the user clicks a disabled model option we
  // render an inline CTA strip at the bottom of the dropdown explaining
  // why and linking to /settings/ai.
  const [notice, setNotice] = useState<{
    providerName: string;
    providerId: string;
    modelName: string;
  } | null>(null);

  // Initial fetch + refresh on window focus so a Connection added in a
  // sibling tab is picked up when the user comes back. Cheap fetch; the
  // browser de-dupes if the tab is already in front.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/ai/connections", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => {
          if (cancelled || !body?.data?.items) return;
          setConnections(body.data.items as ConnSummary[]);
        })
        .catch(() => {});
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);


  /**
   * Dynamic providers — derived from Connection models whose IDs are
   * namespaced (`prefix/model`) and whose prefix isn't already a static
   * catalog entry. This is how providers like Perplexity, DeepSeek,
   * Qwen, etc. surface in the picker after the user adds them to a
   * gateway Connection: no catalog edit required. The server resolver's
   * namespaced-model match already routes these calls — we just needed
   * the UI to surface them.
   */
  const dynamicProviders = useMemo(() => {
    const known = new Set<string>(PROVIDER_CATALOG.map((p) => p.id));
    // prefix → unique bare model ids
    const byPrefix = new Map<string, Set<string>>();
    for (const c of connections) {
      for (const m of c.models) {
        const slash = m.id.indexOf("/");
        if (slash <= 0) continue;
        const prefix = m.id.slice(0, slash);
        const bare = m.id.slice(slash + 1);
        if (!prefix || !bare) continue;
        if (known.has(prefix)) continue;
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, new Set());
        byPrefix.get(prefix)!.add(bare);
      }
    }
    return Array.from(byPrefix.entries())
      .map(([prefix, bareIds]) => ({
        id: prefix,
        name: prefix
          .split(/[-_]/)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" "),
        // Synthesized model entries — capabilities/cost/context are
        // unknown for dynamic providers, but the picker only reads
        // name/id/costTier so coarse defaults are fine.
        models: Array.from(bareIds)
          .sort((a, b) => a.localeCompare(b))
          .map((id) => ({
            id,
            name: id,
            costTier: "medium" as const,
          })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [connections]);

  // Unified provider list — static catalog first (rich metadata),
  // augmented with user-added Connection models the catalog doesn't
  // know about (e.g. fresh OpenAI releases, snapshot versions, models
  // accessed via a gateway). Then any fully-dynamic providers (those
  // whose prefix isn't a catalog entry at all, like Perplexity).
  type PickerProvider = {
    id: string;
    name: string;
    models: Array<{
      id: string;
      name: string;
      costTier: "low" | "medium" | "high";
    }>;
  };
  const allProviders = useMemo<PickerProvider[]>(() => {
    // Index user-added Connection models by provider id. Two storage
    // shapes both contribute:
    //   1. Gateway-namespaced: `openai/gpt-5.2` — prefix becomes the
    //      provider id, bare suffix becomes the displayed model id.
    //   2. Direct provider: Connection.presetId === provider id and
    //      Connection.models[] holds bare ids (e.g. `gpt-4o-2024-08-06`
    //      from a direct OpenAI Connection).
    const userModelsByProvider = new Map<
      string,
      Map<string, { id: string; name: string }>
    >();
    const remember = (prov: string, id: string, name: string) => {
      if (!userModelsByProvider.has(prov)) {
        userModelsByProvider.set(prov, new Map());
      }
      const map = userModelsByProvider.get(prov)!;
      if (!map.has(id)) map.set(id, { id, name });
    };
    for (const c of connections) {
      for (const m of c.models) {
        const slash = m.id.indexOf("/");
        if (slash > 0) {
          // Gateway namespaced form.
          const prefix = m.id.slice(0, slash);
          const bare = m.id.slice(slash + 1);
          if (prefix && bare) remember(prefix, bare, m.name || bare);
        } else if (c.presetId) {
          // Direct form — provider id comes from the Connection preset.
          remember(c.presetId, m.id, m.name || m.id);
        }
      }
    }

    const fromCatalog: PickerProvider[] = PROVIDER_CATALOG.map((p) => {
      // Widen to plain string Set so user-added model ids (plain strings)
      // can dedupe against catalog ids (branded `AIModelId`).
      const catalogIds = new Set<string>(p.models.map((m) => m.id));
      const userAdds = userModelsByProvider.get(p.id);
      const userModelEntries = userAdds
        ? Array.from(userAdds.values())
            .filter((m) => !catalogIds.has(m.id))
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((m) => ({
              id: m.id,
              name: m.name,
              // User-added models lack rich metadata; "medium" is the
              // safest default — better than guessing low (would hide
              // the budget signal) or high (would scare users off).
              costTier: "medium" as const,
            }))
        : [];
      return {
        id: p.id,
        name: p.name,
        models: [
          ...p.models.map((m) => ({
            id: m.id,
            name: m.name,
            costTier: m.costTier,
          })),
          ...userModelEntries,
        ],
      };
    });
    return [...fromCatalog, ...dynamicProviders];
  }, [connections, dynamicProviders]);

  const activeProvider = allProviders.find((p) => p.id === providerId);
  const activeRouting = useMemo(
    () => resolveRoutingConnection(providerId, modelId, connections),
    [providerId, modelId, connections],
  );
  const activeModel = activeProvider?.models.find((m) => m.id === modelId);
  const activeModelName = activeModel?.name ?? modelId;
  const isMixed = contributors.length > 1;

  const bigThreeProviders = useMemo(
    () =>
      BIG_THREE_PROVIDER_IDS.map((id) =>
        PROVIDER_CATALOG.find((p) => p.id === id),
      ).filter((p): p is (typeof PROVIDER_CATALOG)[number] => Boolean(p)),
    [],
  );

  // Overflow = everything not in the big three. Includes dynamic
  // providers so newly-added gateway namespaces show up automatically.
  // In compact mode the big-three quick-icons are hidden, so the "More" menu
  // becomes the full provider switcher (all providers, big-three included).
  const overflowProviders = useMemo(
    () =>
      compact
        ? allProviders
        : allProviders.filter(
            (p) => !BIG_THREE_PROVIDER_IDS.includes(p.id as AIProviderId),
          ),
    [allProviders, compact],
  );

  // Close popovers on outside click + escape
  useEffect(() => {
    if (!moreOpen && !modelOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreOpen && moreRef.current && !moreRef.current.contains(target)) {
        setMoreOpen(false);
      }
      if (modelOpen && modelRef.current && !modelRef.current.contains(target)) {
        setModelOpen(false);
        setNotice(null);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setModelOpen(false);
        setNotice(null);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [moreOpen, modelOpen]);

  const handleMakeClick = useCallback(
    (newProviderId: string) => {
      if (disabled) return;
      if (newProviderId === providerId) return;
      const provider = allProviders.find((p) => p.id === newProviderId);
      if (!provider || provider.models.length === 0) return;
      onChange(newProviderId, provider.models[0].id);
      setMoreOpen(false);
    },
    [disabled, providerId, onChange, allProviders],
  );

  const handleModelClick = useCallback(
    (newModelId: string) => {
      if (disabled) return;
      onChange(providerId, newModelId);
      setModelOpen(false);
    },
    [disabled, providerId, onChange],
  );

  return (
    <div className="flex items-center gap-1 text-[11px]">
      {/* Big-three make chips — hidden in compact (folded into "More"). */}
      {!compact &&
        bigThreeProviders.map((p) => (
          <MakeChip
            key={p.id}
            name={p.name}
            providerId={p.id as AIProviderId}
            isActive={p.id === providerId}
            disabled={disabled}
            onClick={() => handleMakeClick(p.id)}
          />
        ))}

      {/* "More" overflow. Compact: all providers; otherwise non-big-three. */}
      <div ref={moreRef} className="relative">
        <MoreChip
          isOpen={moreOpen}
          disabled={disabled}
          activeOverflowProviderId={
            compact ||
            !BIG_THREE_PROVIDER_IDS.includes(providerId as AIProviderId)
              ? (providerId as AIProviderId)
              : null
          }
          onClick={() => !disabled && setMoreOpen(!moreOpen)}
        />

        {moreOpen && (
          <div className="absolute bottom-full left-0 mb-1 min-w-[220px] rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
            {overflowProviders.map((p) => {
              const isActive = p.id === providerId;
              // Count this provider's models that a Connection can
              // actually serve. Zero → soft-disable the row visually
              // (still clickable, but the dimmed/icon hint nudges users
              // toward Settings → AI). Mirrors the same gating as the
              // model dropdown.
              const availableCount = p.models.reduce(
                (n, m) =>
                  isModelAvailable(p.id, m.id, connections) ? n + 1 : n,
                0,
              );
              const noneAvailable = availableCount === 0;
              return (
                <button
                  key={p.id}
                  onClick={() => handleMakeClick(p.id)}
                  title={
                    noneAvailable
                      ? `No Connection serves ${p.name} models yet — add one in Settings → AI`
                      : undefined
                  }
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : noneAvailable
                        ? "text-gray-500/70 hover:bg-amber-500/[0.05]"
                        : "text-gray-600 dark:text-gray-400 hover:bg-white/5 hover:text-gray-200",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {noneAvailable && (
                      <AlertCircle className="h-3 w-3 shrink-0 text-amber-400/60" />
                    )}
                    <ProviderIcon
                      providerId={p.id}
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        noneAvailable && "opacity-50",
                      )}
                      color={getProviderTheme(p.id).brandColor}
                    />
                    <span>{p.name}</span>
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {noneAvailable
                      ? `${p.models.length} models · none active`
                      : `${availableCount}/${p.models.length} active`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Vertical divider */}
      <div className="h-3 w-px bg-white/10 mx-0.5" />

      {/* Model picker for the active make */}
      <div ref={modelRef} className="relative">
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setNotice(null);
            setModelOpen(!modelOpen);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={modelOpen}
          aria-label={`Active model: ${activeModelName}. Click to change.`}
          className={cn(
            "flex h-7 items-center gap-1 rounded-full px-2 border border-white/10 text-gray-300 hover:text-white hover:border-white/20 transition-colors",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <Sparkles className="h-3 w-3 shrink-0" />
          <span className="max-w-[120px] truncate">{activeModelName}</span>
          {!compact && activeRouting?.via === "gateway" && (
            <span
              className="hidden sm:inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/30 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-300/90"
              title={`Routed through ${activeRouting.conn.name}`}
            >
              via {activeRouting.conn.name}
            </span>
          )}
          <ChevronUp
            className={cn(
              "h-3 w-3 transition-transform",
              !modelOpen && "rotate-180",
            )}
          />
        </button>

        {modelOpen && activeProvider && (
          <div
            role="listbox"
            aria-label={`${activeProvider.name} models`}
            className="absolute bottom-full left-0 mb-1 min-w-[260px] rounded-lg border border-white/10 bg-[#1a1a1a] shadow-xl z-50 overflow-hidden"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium border-b border-white/5">
              {activeProvider.name}
            </div>
            {activeProvider.models.map((m) => {
              const isSelected = m.id === modelId;
              const available = isModelAvailable(
                activeProvider.id,
                m.id,
                connections,
              );
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={!available}
                  onClick={() => {
                    if (!available) {
                      setNotice({
                        providerName: activeProvider.name,
                        providerId: activeProvider.id,
                        modelName: m.name,
                      });
                      return;
                    }
                    setNotice(null);
                    handleModelClick(m.id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
                    !available && "opacity-40 cursor-help",
                    isSelected
                      ? "bg-white/10 text-white"
                      : available
                        ? "text-gray-600 dark:text-gray-400 hover:bg-white/5 hover:text-gray-200"
                        : "text-gray-500 hover:bg-amber-500/[0.04]",
                  )}
                  title={
                    available
                      ? undefined
                      : `${m.name} isn't set up — add a Connection in Settings → AI`
                  }
                >
                  <span className="truncate flex items-center gap-1.5">
                    {!available && (
                      <AlertCircle className="h-3 w-3 shrink-0 text-amber-400/60" />
                    )}
                    {m.name}
                  </span>
                  <span className="ml-2 shrink-0 text-[10px] text-gray-600">
                    {m.costTier === "low"
                      ? "$"
                      : m.costTier === "medium"
                        ? "$$"
                        : "$$$"}
                  </span>
                </button>
              );
            })}
            {notice && (
              <div className="border-t border-white/5 bg-amber-500/[0.06] px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] text-amber-200 leading-snug">
                  <span className="font-medium">{notice.modelName}</span>{" "}
                  isn&apos;t set up. Add a {notice.providerName} Connection (or
                  a gateway Connection that routes to it) in Settings &rarr; AI.
                </p>
                <Link
                  href="/settings/ai"
                  onClick={() => {
                    setNotice(null);
                    setModelOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 hover:border-amber-500/60 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open AI Settings
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mixed-provider chip — only when conversation has used 2+ providers */}
      {isMixed && (
        <>
          <div className="h-3 w-px bg-white/10 mx-0.5" />
          <MixedProviderChip contributors={contributors} />
        </>
      )}
    </div>
  );
}

/**
 * Overflow "More" chip. When an overflow provider (xAI / Mistral /
 * Groq / ...) is the active make, the chip lights up with that
 * provider's icon + name so the user can see at a glance which
 * overflow choice is currently in use. Otherwise renders the generic
 * "More" affordance.
 */
function MoreChip({
  isOpen,
  disabled,
  activeOverflowProviderId,
  onClick,
}: {
  isOpen: boolean;
  disabled: boolean;
  activeOverflowProviderId: AIProviderId | null;
  onClick: () => void;
}) {
  const isActive = activeOverflowProviderId !== null;
  const theme = isActive
    ? getProviderTheme(activeOverflowProviderId)
    : null;
  const providerName = isActive
    ? PROVIDER_CATALOG.find((p) => p.id === activeOverflowProviderId)?.name
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={isActive ? `${providerName} (more providers)` : "More providers"}
      aria-label={isActive ? `${providerName} — more providers` : "More providers"}
      aria-pressed={isActive}
      className={cn(
        "flex h-7 items-center gap-0.5 rounded-full px-1.5 border transition-colors",
        !isActive &&
          "border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-300 hover:border-white/20",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={
        isActive && theme
          ? {
              background: theme.bubbleTint,
              borderColor: theme.brandColor + "55",
              color: theme.brandColor,
            }
          : undefined
      }
    >
      {isActive && theme ? (
        <ProviderIcon
          providerId={activeOverflowProviderId}
          className="h-3.5 w-3.5"
        />
      ) : (
        <MoreHorizontal className="h-3 w-3" />
      )}
      <ChevronDown
        className={cn(
          "h-3 w-3 transition-transform",
          isOpen && "rotate-180",
        )}
      />
    </button>
  );
}

/**
 * Individual make chip — renders the provider's brand icon. Active state
 * tints both background and icon to the provider's brand color; inactive
 * shows a muted outline. `aria-label` + `title` carry the provider name
 * for accessibility and hover tooltip.
 */
function MakeChip({
  name,
  providerId,
  isActive,
  disabled,
  onClick,
}: {
  name: string;
  providerId: AIProviderId;
  isActive: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const theme = getProviderTheme(providerId);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={name}
      aria-pressed={isActive}
      title={name}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
        !isActive &&
          "border-white/10 text-gray-500 dark:text-gray-400 hover:border-white/25 hover:text-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={
        isActive
          ? {
              background: theme.bubbleTint,
              borderColor: theme.brandColor + "55",
              color: theme.brandColor,
            }
          : undefined
      }
    >
      <ProviderIcon providerId={providerId} className="h-3.5 w-3.5" />
    </button>
  );
}
