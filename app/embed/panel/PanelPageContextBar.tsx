"use client";

/**
 * Page-context bar for the side-panel chat (BROWSER-REACH B2).
 *
 * Three scope buttons capture what the user is viewing; the captured context
 * then rides every chat turn until detached. The bar shows what's attached
 * (scope + quality + title) so it's never a mystery what the model can see.
 */

import type {
  PageContextScope,
  PanelPageContext,
} from "@/lib/domain/browser-extension/page-context";

const SCOPES: Array<{ id: PageContextScope; label: string; hint: string }> = [
  { id: "selection", label: "Selection", hint: "Your highlighted text" },
  { id: "viewport", label: "Screen", hint: "What's visible now" },
  { id: "full", label: "Page", hint: "The whole article" },
];

export function PanelPageContextBar({
  scope,
  busy,
  error,
  attached,
  attachedContext,
  onCapture,
  onDetach,
}: {
  scope: PageContextScope;
  busy: boolean;
  error: string | null;
  attached: boolean;
  attachedContext: PanelPageContext | null;
  onCapture: (scope: PageContextScope) => void;
  onDetach: () => void;
}) {
  const charCount = attachedContext?.content?.length ?? 0;
  const kb = charCount > 0 ? Math.max(1, Math.round(charCount / 1000)) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "6px 8px",
        borderBottom: "1px solid var(--border-primary, #2a2a2a)",
        flexShrink: 0,
        fontSize: 11.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--text-secondary, #9a9a9a)" }}>
          Add page:
        </span>
        {SCOPES.map((s) => {
          const active = attached && attachedContext?.scope === s.id;
          return (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              disabled={busy}
              aria-pressed={active}
              onClick={() => onCapture(s.id)}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 11,
                cursor: busy ? "default" : "pointer",
                border: "1px solid var(--border-primary, #2a2a2a)",
                background: active
                  ? "var(--gold-primary, #c9a86c)"
                  : "transparent",
                color: active
                  ? "#1a1a1a"
                  : "var(--text-secondary, #9a9a9a)",
                opacity: busy && !active ? 0.5 : 1,
              }}
            >
              {busy && scope === s.id ? "…" : s.label}
            </button>
          );
        })}
        {attached && (
          <button
            type="button"
            onClick={onDetach}
            title="Stop sending this page to the chat"
            style={{
              marginLeft: "auto",
              border: 0,
              background: "transparent",
              color: "var(--text-secondary, #9a9a9a)",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {error ? (
        <div style={{ color: "#e0736d" }}>{error}</div>
      ) : attached && attachedContext ? (
        <div
          style={{
            color: "var(--text-secondary, #9a9a9a)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={attachedContext.title ?? attachedContext.url}
        >
          Attached · {attachedContext.scope}
          {attachedContext.quality === "readable" ? " · article" : ""} · ~{kb}k
          chars{attachedContext.title ? ` · ${attachedContext.title}` : ""}
        </div>
      ) : null}
    </div>
  );
}
