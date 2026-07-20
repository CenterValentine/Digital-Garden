"use client";

/**
 * JsonHatch — the "Edit as JSON" escape hatch over the composer's config.
 *
 * A modal textarea validated live against the same `sitePageConfig` Zod schema
 * the site renders with. Apply hands the parsed config back to the composer's
 * state (which autosaves it as a draft); Cancel discards. This preserves the
 * power-user path from the original JSON admin.
 */

import { useMemo, useState } from "react";
import { sitePageConfig, type SitePageConfig } from "@/lib/domain/page-layout/schema";

export function JsonHatch({
  config,
  onApply,
  onClose,
}: {
  config: SitePageConfig;
  onApply: (next: SitePageConfig) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));

  const validation = useMemo(() => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false as const, message: `Invalid JSON: ${(e as Error).message}` };
    }
    const parsed = sitePageConfig.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false as const,
        message: `${first.path.join(".") || "(root)"}: ${first.message}`,
      };
    }
    return { ok: true as const, config: parsed.data, sections: parsed.data.sections.length };
  }, [text]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Edit config as JSON"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[var(--background,#101418)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Edit as JSON</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/70 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <textarea
          className="h-[420px] w-full rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs leading-relaxed"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs">
            {validation.ok ? (
              <span className="text-emerald-400">✓ Valid · {validation.sections} section(s)</span>
            ) : (
              <span className="text-rose-400">✗ {validation.message}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!validation.ok}
              onClick={() => {
                if (validation.ok) {
                  onApply(validation.config);
                  onClose();
                }
              }}
              className="rounded-md bg-amber-500/90 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply to draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
