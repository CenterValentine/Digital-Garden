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
import {
  RESUME_SHAPE_GUIDE,
  resumeConfigJsonSchema,
  validateResumeConfig,
} from "@/lib/domain/page-layout/resume";
import type { PageKind } from "./defaults";

/**
 * The résumé's editing contract, on the page an editor works in: the prose
 * guide for people, and the config's JSON Schema in a machine-readable
 * <script> for an AI agent reading the DOM. One source (lib/domain/page-layout/resume.ts).
 */
export function ResumeShapeHelp({ embedSchema = false }: { embedSchema?: boolean }) {
  // `<` escaped so the schema can never close its own <script> tag.
  const schemaJson = embedSchema ? JSON.stringify(resumeConfigJsonSchema()).replace(/</g, "\\u003c") : "";
  return (
    <details className="mb-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2" data-resume-shape>
      <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-white/55">
        JSON shape — for people and AI editors
      </summary>
      <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-white/70">
        {RESUME_SHAPE_GUIDE}
      </pre>
      <p className="mt-1 text-[11px] text-white/40">
        Machine-readable JSON Schema for this config: <code>script#resume-config-schema</code> on the composer page,
        and <code>shape.configJsonSchema</code> in <code>GET /api/site-pages/resume</code>.
      </p>
      {/* One copy per page (the composer's), so the id stays unique while the JSON editor is open. */}
      {embedSchema && (
        <script
          type="application/schema+json"
          id="resume-config-schema"
          dangerouslySetInnerHTML={{ __html: schemaJson }}
        />
      )}
    </details>
  );
}

export function JsonHatch({
  config,
  pageKind,
  onApply,
  onClose,
}: {
  config: SitePageConfig;
  /** A résumé also has to hold its fixed shape (validateResumeConfig). */
  pageKind?: PageKind;
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
    if (pageKind === "resume") {
      const issues = validateResumeConfig(parsed.data);
      if (issues.length > 0) {
        const more = issues.length > 1 ? ` (+${issues.length - 1} more)` : "";
        return {
          ok: false as const,
          message: `${issues[0].path.join(".")}: ${issues[0].message}${more}`,
        };
      }
    }
    return { ok: true as const, config: parsed.data, sections: parsed.data.sections.length };
  }, [text, pageKind]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[56px] z-40 flex items-center justify-center bg-black/60 p-6"
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
        {pageKind === "resume" && <ResumeShapeHelp />}
        <textarea
          aria-label="Page config JSON"
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
