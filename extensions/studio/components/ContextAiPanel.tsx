/**
 * AI sub-tab of the Context hub — per-node agentic metadata (Phase 2).
 *
 * Renders the Context doc from /api/studio/metadata/:nodeId with the
 * ownership contract visible: AI sections regenerate freely, Role & Strategy
 * arrives as a proposal to accept/dismiss, Directives are yours alone and
 * autosave (2s debounce, REST last-write-wins — deliberately not
 * collaborative). Staleness badges appear when sources changed since the
 * last generation.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import {
  AiContextUnconfiguredBanner,
  shouldShowAiContextBannerOnce,
} from "./AiContextBanner";
import type { MetadataSectionKind, MetadataSectionOwner } from "../types";

// Mirrors MetadataView from extensions/studio/server/metadata.ts (kept as a
// local DTO — the server module imports Prisma and must stay unimported here).
interface SectionMetaDto {
  owner: MetadataSectionOwner;
  generatedAt?: string;
  model?: string;
  proposal?: string;
  proposedAt?: string;
}
interface MetadataViewDto {
  exists: boolean;
  sections: Record<MetadataSectionKind, string>;
  sectionsMeta: Partial<Record<MetadataSectionKind, SectionMetaDto>>;
  generatedAt: string | null;
  model: string | null;
  stale: boolean;
  optedOut: boolean;
}

const SECTION_ORDER: MetadataSectionKind[] = [
  "summary",
  "structure",
  "role-strategy",
  "directives",
];

const SECTION_LABELS: Record<MetadataSectionKind, string> = {
  summary: "Summary",
  structure: "Structure",
  "role-strategy": "Role & Strategy",
  directives: "Directives",
};

const SECTION_EMPTY_HINTS: Record<MetadataSectionKind, string> = {
  summary: "What this content is about, in the AI's words.",
  structure: "How the content is organized — headings, parts, flow.",
  "role-strategy":
    "The operation this content serves and how it relates to its siblings.",
  directives: "Your standing instructions — the AI reads these every time.",
};

const OWNER_BADGES: Record<
  MetadataSectionOwner,
  { label: string; className: string }
> = {
  ai: { label: "AI", className: "border-gold-primary/30 text-gold-primary/90" },
  "ai-proposed": {
    label: "AI proposes",
    className: "border-blue-400/30 text-blue-500 dark:text-blue-400",
  },
  human: {
    label: "Yours",
    className:
      "border-black/15 text-gray-500 dark:border-white/20 dark:text-gray-400",
  },
};

type SaveState = "idle" | "dirty" | "saving" | "saved";

export function ContextAiPanel() {
  const selectedContentId = useContentStore((s) => s.selectedContentId);
  const selectedContentTitle = useContentStore((s) =>
    s.selectedContentId
      ? (s.tabs[`tab:${s.selectedContentId}`]?.title ?? null)
      : null
  );

  // Result keyed by the node it was fetched for; loading is derived, so the
  // fetch effect never sets state synchronously (React Compiler rule).
  const [result, setResult] = useState<{
    forNodeId: string;
    data: MetadataViewDto | null;
    error: string | null;
    showAiBanner?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<"generate" | "proposal" | null>(null);
  const [draft, setDraft] = useState<{ forNodeId: string; text: string } | null>(
    null
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchView = useCallback((nodeId: string) => {
    fetch(`/api/studio/metadata/${nodeId}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        // Once-per-session banner: the GET is the auto-context pattern
        // "trying to execute" — surface the unconfigured state exactly when
        // an attempt actually happened, and only the first time.
        const showAiBanner =
          body.aiContextStatus === "unconfigured" &&
          shouldShowAiContextBannerOnce();
        setResult({ forNodeId: nodeId, data: body.data, error: null, showAiBanner });
      })
      .catch((err: unknown) => {
        setResult({
          forNodeId: nodeId,
          data: null,
          error: err instanceof Error ? err.message : "Failed to load context",
        });
      });
  }, []);

  useEffect(() => {
    if (!selectedContentId) return;
    fetchView(selectedContentId);
  }, [selectedContentId, fetchView]);

  // Clear any pending directive save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const current =
    selectedContentId && result?.forNodeId === selectedContentId
      ? result
      : null;
  const view = current?.data ?? null;

  const saveDirectives = useCallback(
    (nodeId: string, text: string) => {
      setSaveState("saving");
      fetch(`/api/studio/metadata/${nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directives: text }),
      })
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok || !body.success) throw new Error(body.error);
          setResult({ forNodeId: nodeId, data: body.data, error: null });
          setSaveState("saved");
        })
        .catch(() => setSaveState("dirty"));
    },
    []
  );

  const handleDirectivesChange = (text: string) => {
    if (!selectedContentId) return;
    setDraft({ forNodeId: selectedContentId, text });
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const nodeId = selectedContentId;
    saveTimer.current = setTimeout(() => saveDirectives(nodeId, text), 2000);
  };

  const handleGenerate = () => {
    if (!selectedContentId || busy) return;
    const nodeId = selectedContentId;
    setBusy("generate");
    fetch(`/api/studio/metadata/${nodeId}/generate`, { method: "POST" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.error ?? "Generation failed");
        }
        setResult({ forNodeId: nodeId, data: body.data, error: null });
      })
      .catch((err: unknown) => {
        setResult({
          forNodeId: nodeId,
          data: view,
          error: err instanceof Error ? err.message : "Generation failed",
        });
      })
      .finally(() => setBusy(null));
  };

  const handleProposal = (action: "accept" | "dismiss") => {
    if (!selectedContentId || busy) return;
    const nodeId = selectedContentId;
    setBusy("proposal");
    fetch(`/api/studio/metadata/${nodeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleStrategyAction: action }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error);
        setResult({ forNodeId: nodeId, data: body.data, error: null });
      })
      .catch(() => undefined)
      .finally(() => setBusy(null));
  };

  if (!selectedContentId) {
    return (
      <div className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">
        Select content to see its context document.
      </div>
    );
  }

  const loading = current === null;
  const directivesText =
    draft?.forNodeId === selectedContentId
      ? draft.text
      : (view?.sections.directives ?? "");
  const proposal = view?.sectionsMeta["role-strategy"]?.proposal;

  return (
    <div className="scrollbar-hide h-full overflow-y-auto px-3 py-3">
      <div className="flex items-start justify-between gap-2 px-1">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Context for{" "}
          <span className="text-gray-600 dark:text-gray-300">
            {selectedContentTitle ?? "this content"}
          </span>
        </p>
        {view?.stale && (
          <span className="shrink-0 rounded-full border border-amber-500/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Sources changed
          </span>
        )}
      </div>

      {current?.error && (
        <p className="mt-2 px-1 text-xs text-red-500/90">{current.error}</p>
      )}

      {current?.showAiBanner && (
        <AiContextUnconfiguredBanner
          onDismiss={() =>
            setResult((prev) =>
              prev ? { ...prev, showAiBanner: false } : prev
            )
          }
        />
      )}

      {/* Privacy toggle — same flag as the toolbar eye. Opted-out content is
          never read by generation, roll-ups, or folder-chat sources. */}
      {view && (
        <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
          <input
            type="checkbox"
            checked={!view.optedOut}
            disabled={busy !== null}
            onChange={() => {
              if (!selectedContentId) return;
              fetch(`/api/studio/metadata/${selectedContentId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contextOptOut: !view.optedOut }),
              })
                .then(() => fetchView(selectedContentId))
                .catch(() => fetchView(selectedContentId));
            }}
            className="mt-0.5 h-3.5 w-3.5 accent-current"
          />
          <span className="min-w-0">
            <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              AI may read this content
            </span>
            {view.optedOut && (
              <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                Opted out — no auto-updates, no Generate, excluded from folder
                roll-ups and chat sources.
              </span>
            )}
          </span>
        </label>
      )}

      <div className="mt-3 space-y-2.5">
        {SECTION_ORDER.map((kind) => {
          const owner = view?.sectionsMeta[kind]?.owner ?? OWNER_DEFAULTS[kind];
          const badge = OWNER_BADGES[owner];
          const text = view?.sections[kind] ?? "";
          const isDirectives = kind === "directives";
          const showStale =
            view?.stale && (owner === "ai" || owner === "ai-proposed") && text;

          return (
            <section
              key={kind}
              className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm text-gray-700 dark:text-gray-200">
                  {SECTION_LABELS[kind]}
                </h3>
                <span className="flex items-center gap-1.5">
                  {showStale && (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-amber-500"
                      title="Sources changed since this was generated"
                    />
                  )}
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </span>
              </div>

              {isDirectives ? (
                <>
                  <textarea
                    value={directivesText}
                    onChange={(e) => handleDirectivesChange(e.target.value)}
                    placeholder={SECTION_EMPTY_HINTS.directives}
                    rows={3}
                    className="mt-1.5 w-full resize-y rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-xs leading-relaxed text-gray-700 placeholder:italic placeholder:text-gray-400 focus:border-gold-primary/50 focus:outline-none dark:border-white/10 dark:text-gray-200 dark:placeholder:text-gray-500"
                  />
                  <p className="mt-0.5 text-right text-[10px] text-gray-400 dark:text-gray-500">
                    {saveState === "saving"
                      ? "Saving…"
                      : saveState === "saved"
                        ? "Saved"
                        : saveState === "dirty"
                          ? "Unsaved changes"
                          : " "}
                  </p>
                </>
              ) : text ? (
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                  {text}
                </p>
              ) : (
                <p className="mt-1.5 text-xs italic leading-relaxed text-gray-400 dark:text-gray-500">
                  {loading ? "Loading…" : SECTION_EMPTY_HINTS[kind]}
                </p>
              )}

              {kind === "role-strategy" && proposal && (
                <div className="mt-2 rounded-md border border-blue-400/30 bg-blue-500/[0.04] px-2.5 py-2 dark:bg-blue-400/[0.06]">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-blue-500 dark:text-blue-400">
                    Proposed update
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                    {proposal}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleProposal("accept")}
                      disabled={busy !== null}
                      className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-md border border-blue-400/40 text-xs text-blue-600 hover:bg-blue-500/10 disabled:opacity-50 dark:text-blue-400"
                    >
                      <Check className="h-3 w-3" /> Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProposal("dismiss")}
                      disabled={busy !== null}
                      className="flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-md border border-black/15 text-xs text-gray-500 hover:bg-black/[0.04] disabled:opacity-50 dark:border-white/15 dark:text-gray-400 dark:hover:bg-white/[0.06]"
                    >
                      <X className="h-3 w-3" /> Dismiss
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy !== null || loading || view?.optedOut}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-gold-primary/40 text-xs text-gold-primary transition-colors hover:bg-gold-primary/10 disabled:cursor-default disabled:opacity-50"
      >
        {busy === "generate" ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            {view?.exists ? "Regenerate context" : "Generate context"}
          </>
        )}
      </button>
    </div>
  );
}

const OWNER_DEFAULTS: Record<MetadataSectionKind, MetadataSectionOwner> = {
  summary: "ai",
  structure: "ai",
  "role-strategy": "ai-proposed",
  directives: "human",
};
