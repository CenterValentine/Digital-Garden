"use client";

/**
 * Context ledger — "What the model sees" (CONTEXT-WINDOW-EDITOR-PLAN §7).
 *
 * One component, two mounts: the right-sidebar tab for a chat open in the
 * main pane (ModelContextTab) and a section inside the sidebar chat's
 * control panel. It reads the same fold maps the chat route applies, so a
 * row's state here is exactly the chip the transcript shows.
 */

import { useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { ArrowDownToLine, ChevronRight, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  buildContextLedger,
  CONTEXT_STATE_COPY,
  type ContextLedgerPart,
  type ContextPartState,
} from "@/lib/domain/ai/context-ledger";
import type { ContextMarkActions } from "@/state/model-context-store";

const fmt = (n: number) => n.toLocaleString();
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

const STATE_CHIP: Record<ContextPartState, string> = {
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  locked: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  stripped: "bg-black/[0.04] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400",
  removed: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "behind-line": "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "dropped-duplicate-call": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "identical-output": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "folded-distilled": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "folded-turn": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "write-folded": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  "bulk-folded": "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  kept: "",
};

const SHORT_LABEL: Partial<Record<ContextPartState, string>> = {
  "dropped-duplicate-call": "duplicate",
  "identical-output": "identical",
  "folded-distilled": "folded at checkpoint",
  "folded-turn": "folded",
  "write-folded": "input folded",
  "bulk-folded": "folded",
  "behind-line": "behind the line",
  removed: "removed by you",
};

function Chip({ state }: { state: ContextPartState }) {
  if (state === "kept") return null;
  return (
    <span
      className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px]", STATE_CHIP[state])}
      title={CONTEXT_STATE_COPY[state].title}
    >
      {SHORT_LABEL[state] ?? CONTEXT_STATE_COPY[state].label}
    </span>
  );
}

function Section({
  title,
  detail,
  tokens,
  defaultOpen = false,
  children,
}: {
  title: string;
  detail?: string;
  tokens: number | null;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-black/[0.06] dark:border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-gray-400 transition-transform", open && "rotate-90")} />
        <span className="whitespace-nowrap text-[12px] font-semibold text-gray-800 dark:text-gray-100">{title}</span>
        {detail && <span className="min-w-0 truncate text-[11px] text-gray-500 dark:text-gray-400">{detail}</span>}
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-gray-600 dark:text-gray-300">
          {tokens == null ? "—" : k(tokens)}
        </span>
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Row({
  part,
  prefix,
  onToggle,
}: {
  part: ContextLedgerPart;
  prefix?: string;
  onToggle?: (removed: boolean) => void;
}) {
  const off = part.state === "removed" || part.state === "behind-line";
  const canToggle = onToggle && part.markable && part.state !== "behind-line";
  const id = `ctx-${part.messageIdx}-${part.partIdx}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "grid w-full min-w-0 grid-cols-[14px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px]",
        canToggle ? "cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" : "cursor-default",
        off && "text-gray-400 dark:text-gray-500",
      )}
      title={CONTEXT_STATE_COPY[part.state].title}
    >
      <input
        id={id}
        type="checkbox"
        className="h-3 w-3 accent-teal-600"
        checked={!off}
        disabled={!canToggle}
        onChange={(e) => onToggle?.(!e.target.checked)}
      />
      <span className={cn("min-w-0 truncate", off && "line-through decoration-amber-500/60")}>
        {prefix && <span className="text-gray-400">{prefix} </span>}
        {part.tool ? <span className="font-mono text-[11px]">{part.tool}</span> : null}
        {part.tool && part.label ? " " : ""}
        {part.label}
      </span>
      <Chip state={part.state} />
      <span className="font-mono text-[10.5px] tabular-nums text-gray-500 dark:text-gray-400">
        {k(part.tokens)}
        {part.tokens !== part.fullTokens && (
          <span className="text-gray-400 dark:text-gray-500"> / {k(part.fullTokens)}</span>
        )}
      </span>
    </label>
  );
}

export function ContextLedger({
  messages,
  vendor,
  actions,
  compact = false,
}: {
  messages: UIMessage[];
  vendor: string;
  actions: ContextMarkActions | null;
  /** Control-panel mount: tighter header, history collapsed by default. */
  compact?: boolean;
}) {
  const ledger = useMemo(() => buildContextLedger(messages, vendor), [messages, vendor]);
  const { fixed } = ledger;
  const total = ledger.estimatedNextTokens;
  const pct = (n: number) => (total > 0 ? `${(100 * n) / total}%` : "0%");
  const earlyMark = ledger.turns.some(
    (t) => t.parts.some((p) => p.state === "removed") && t.userIdx < Math.max(0, ledger.liveFrom - 4),
  );

  const toggle = (part: ContextLedgerPart) => {
    if (!actions) return undefined;
    const messageId = messages[part.messageIdx]?.id;
    if (!messageId) return undefined;
    return (removed: boolean) => actions.togglePart(messageId, part.key, removed);
  };

  if (messages.length === 0) {
    return (
      <div className="px-3 py-4 text-[12px] text-gray-500 dark:text-gray-400">
        Nothing to show yet. Once the chat has a reply, this lists what the next request carries.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col text-gray-800 dark:text-gray-100">
      {/* Summary */}
      <div className={cn("border-b border-black/[0.06] px-3 dark:border-white/[0.06]", compact ? "py-2" : "py-3")}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[20px] font-semibold tabular-nums leading-none">{fmt(total)}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            tokens in the next request{fixed.measured ? "" : " (history only — fixed cost appears after the first reply)"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-500 dark:text-gray-400">
          {ledger.removedByUserTokens > 0 && (
            <span className="text-amber-700 dark:text-amber-300">− {fmt(ledger.removedByUserTokens)} removed by you</span>
          )}
          {ledger.foldedByRuleTokens > 0 && <span>− {fmt(ledger.foldedByRuleTokens)} folded by rule</span>}
          {ledger.lastMeasuredInputTokens != null && (
            <span title="What the provider billed for the last request (per-step meter)">
              last request read {fmt(ledger.lastMeasuredInputTokens)}
              {ledger.lastMeasuredCachedTokens ? ` (${fmt(ledger.lastMeasuredCachedTokens)} cached)` : ""}
            </span>
          )}
        </div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded bg-black/[0.05] dark:bg-white/[0.08]" aria-hidden>
          <span className="bg-gray-700 dark:bg-gray-200" style={{ width: pct(fixed.promptTokens ?? 0) }} title="System prompt" />
          <span className="bg-gray-500 dark:bg-gray-400" style={{ width: pct(fixed.toolTokens ?? 0) }} title="Tool definitions" />
          <span className="bg-teal-500" style={{ width: pct(fixed.charterTokens + fixed.mentionsTokens + fixed.rootedTokens) }} title="Attachments" />
          <span className="bg-gray-400/60 dark:bg-gray-500/60" style={{ width: pct(ledger.historyTokens) }} title="History" />
        </div>
        {earlyMark && (
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            You changed something early in the transcript, so the cached prefix moves and is re-billed once.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section
          title="System prompt"
          detail={fixed.measured ? "measured on the last request" : "measured after the first reply"}
          tokens={fixed.promptTokens}
        >
          <div className="flex min-w-0 flex-col gap-1 text-[11.5px] text-gray-600 dark:text-gray-300">
            {fixed.charterTokens > 0 && (
              <div className="flex justify-between"><span>Active charter (standing rules + current phase)</span><span className="font-mono tabular-nums">{k(fixed.charterTokens)}</span></div>
            )}
            {fixed.mentionsTokens > 0 && (
              <div className="flex justify-between"><span>Mentions and bound content</span><span className="font-mono tabular-nums">{k(fixed.mentionsTokens)}</span></div>
            )}
            {fixed.rootedTokens > 0 && (
              <div className="flex justify-between"><span>Rooted content</span><span className="font-mono tabular-nums">{k(fixed.rootedTokens)}</span></div>
            )}
            {fixed.pageTokens > 0 && (
              <div className="flex justify-between"><span>Page context</span><span className="font-mono tabular-nums">{k(fixed.pageTokens)}</span></div>
            )}
            {fixed.promptTokens != null && (
              <div className="flex justify-between"><span>Instructions (follow the tool set)</span><span className="font-mono tabular-nums">{k(Math.max(0, fixed.promptTokens - fixed.charterTokens - fixed.mentionsTokens - fixed.rootedTokens - fixed.pageTokens))}</span></div>
            )}
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Turning tools off in Settings → AI → Tools removes the sections that describe them. Detach the charter in the composer to drop its section.
            </p>
          </div>
        </Section>
        <Section
          title="Tool definitions"
          detail={fixed.toolCount != null ? `${fixed.toolCount} tools offered` : undefined}
          tokens={fixed.toolTokens}
        >
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Every tool&apos;s name, description and input schema rides in each request. Browser tools appear only while the extension is reachable.
          </p>
        </Section>
        <Section
          title="History"
          detail={`${ledger.turns.length} turns · rule folds, then your marks`}
          tokens={ledger.historyTokens}
          defaultOpen={!compact}
        >
          {actions && ledger.largestKept.length > 0 && (
            <div className="mb-2">
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-gray-400">Largest results the model still carries</div>
              <div className="flex flex-wrap gap-1.5">
                {ledger.largestKept.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => toggle(p)?.(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-gray-600 hover:border-amber-500 hover:text-amber-700 dark:border-white/10 dark:text-gray-300 dark:hover:text-amber-300"
                    title="Stop carrying this result"
                  >
                    <EyeOff className="h-3 w-3" /> {p.tool} · {k(p.fullTokens)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-2">
            {ledger.turns.map((t) => {
              const lineHere = ledger.lineIdx === t.userIdx;
              const userMessageId = t.userMessageId;
              return (
                <div key={t.userMessageId} className="min-w-0">
                  {lineHere && (
                    <div className="mb-1 flex items-center gap-2 text-[10.5px] text-amber-700 dark:text-amber-300">
                      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
                      the model reads from here
                      {actions && (
                        <button type="button" onClick={() => actions.setLine(null)} className="rounded border border-amber-500/40 px-1.5 text-[10px] hover:bg-amber-500/10">
                          clear
                        </button>
                      )}
                      <span className="h-px flex-1 border-t border-dashed border-amber-500/60" />
                    </div>
                  )}
                  <div className="flex min-w-0 items-center gap-2 px-1 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="shrink-0 whitespace-nowrap font-semibold text-gray-700 dark:text-gray-200">Turn {t.n}</span>
                    <span className="min-w-0 truncate">{t.preview}</span>
                    {t.live && <Chip state="live" />}
                    <span className="ml-auto shrink-0 font-mono tabular-nums" title="read = billed for this turn's requests · now = carried on the next request">
                      {t.measuredInputTokens != null ? `read ${k(t.measuredInputTokens)} · ` : ""}now {k(t.carriedTokens)}
                    </span>
                    {actions && !t.live && !lineHere && t.n > 1 && (
                      <button
                        type="button"
                        onClick={() => actions.setLine(userMessageId)}
                        className="shrink-0 rounded p-0.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-300"
                        title="The model reads from here — stop carrying everything above this turn"
                      >
                        <ArrowDownToLine className="h-3 w-3" />
                      </button>
                    )}
                    {actions && !t.live && t.assistantMessageId && (
                      <button
                        type="button"
                        onClick={() => {
                          const allOff = t.parts.filter((p) => p.markable).every((p) => p.state === "removed" || p.state === "behind-line");
                          actions.dropExchange(t.assistantMessageId as string, !allOff);
                        }}
                        className="shrink-0 rounded p-0.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-300"
                        title="Drop or restore this whole exchange"
                      >
                        {t.parts.filter((p) => p.markable).every((p) => p.state === "removed" || p.state === "behind-line") ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-col">
                    {t.parts.map((p) => (
                      <Row
                        key={`${p.messageIdx}:${p.partIdx}`}
                        part={p}
                        prefix={p.role === "user" ? "You:" : undefined}
                        onToggle={toggle(p)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
        <div className="px-3 py-2 text-[10.5px] leading-relaxed text-gray-400 dark:text-gray-500">
          Estimates use chars ÷ 4; the per-step meter on each reply is the billed truth. Removing a part stubs it for the model; the transcript keeps every byte.
        </div>
      </div>
    </div>
  );
}
