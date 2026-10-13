/**
 * Accept or refuse a rendered document.
 *
 * The renderer REPORTS (render.py: `missing`, `unresolved`, `unused`); it
 * never decides. This is where the product decides, once, for every
 * caller — the AI tool, a future rerender button, a future MCP action.
 * "Schemas describe shape; execute judges."
 *
 * Policy (owner, 2026-10-13): **a bad write is refused, never shipped.**
 *   1. A tag left in the OUTPUT (`{{ … }}` a recruiter would read) → refuse.
 *   2. A key the template never reads (`EXPERIENCE_BULLET1`) → refuse and
 *      name the nearest declared field — a typo means a real slot went blank.
 *   3. A required slot left empty → refuse and list the paths. The model
 *      supplies the fact from the notes or asks the user; it never invents
 *      (Product Principle 2). In a fixed-slot resume an empty slot is an
 *      empty bullet, not a useful placeholder.
 * On acceptance the verdict carries a positive REPORT: what was filled,
 * per-section counts, and fields over the length the user's notes set.
 */

import type { DocxTemplateRecord, FillProvenance } from "./record";
import type { RenderDiagnostics, TemplateValue } from "./renderer-client";

export interface RenderReport {
  /** "17 of 17 fields" at the top level, counting sections as one each. */
  filled: { fields: number; declared: number };
  /** Items per section, keyed by path (`experience`, `experience.bullets`). */
  sectionCounts: Record<string, number>;
  /** Fields longer than the `maxLength` note the user set — advisory. */
  overLength: string[];
  /** Items of list-of-strings sections (bullets) with no cited source — advisory. */
  uncited: string[];
  links: number;
  textChars: number;
  renderMs: number;
  bytes: number;
}

export interface RenderVerdict {
  /** Store the file and hand it to the user. */
  accept: boolean;
  /** Human-readable problems — on refusal, what was wrong; on acceptance, empty. */
  gaps: string[];
  /** When refused: what the model must change before calling again. */
  refusal?: string;
  /** When accepted: the positive report for the card and the tool result. */
  report?: RenderReport;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const at = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object" || Array.isArray(acc)) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);

/** Field paths (`header.name`, `experience[1].title`) the template REQUIRES
 * — not `{% if %}`-guarded — that the supplied values leave empty. Walks
 * list items so a missing `title` on the second job is reported as such. */
export function requiredGaps(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
): string[] {
  const gaps: string[] = [];
  for (const f of record.fields) {
    if (f.required && isEmpty(at(values, f.path))) gaps.push(f.path);
  }
  const walk = (sections: DocxTemplateRecord["sections"], scope: unknown, prefix: string): void => {
    for (const s of sections) {
      const list = at(scope, s.path);
      if (!Array.isArray(list)) continue;
      list.forEach((item, index) => {
        const label = `${prefix}${s.path}[${index}]`;
        if (s.itemIsValue) {
          if (isEmpty(item)) gaps.push(label);
          return;
        }
        for (const f of s.fields) {
          if (f.required && isEmpty(at(item, f.path))) gaps.push(`${label}.${f.path}`);
        }
        walk(s.sections, item, `${label}.`);
      });
    }
  };
  walk(record.sections, values, "");
  return gaps;
}

/** Every top-level name the template reads — roots of dotted fields and
 * section paths — which is what `values`' own keys are judged against. */
export function declaredRoots(record: DocxTemplateRecord): string[] {
  const roots = new Set<string>();
  for (const f of record.fields) roots.add(f.path.split(".")[0]);
  for (const s of record.sections) roots.add(s.path.split(".")[0]);
  return [...roots];
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** The declared name an unused key most likely meant, if any is close. */
export function nearestDeclared(key: string, declared: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact = declared.find((d) => norm(d) === norm(key));
  if (exact) return exact;
  let best: { name: string; d: number } | null = null;
  for (const name of declared) {
    const d = editDistance(norm(key), norm(name));
    if (d <= Math.max(2, Math.floor(name.length / 4)) && (!best || d < best.d)) best = { name, d };
  }
  return best?.name ?? null;
}

/** Strings longer than the `maxLength` note on their field (or on a
 * list-of-strings section, applied per item). Advisory, not a refusal. */
export function overLengthFields(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
): string[] {
  const notes = record.notes ?? {};
  const out: string[] = [];
  const checkString = (label: string, v: unknown, max: number) => {
    if (typeof v === "string" && v.length > max) out.push(`${label}: ${v.length} chars (max ${max})`);
  };
  for (const f of record.fields) {
    const max = notes[f.path]?.maxLength;
    if (max) checkString(f.path, at(values, f.path), max);
  }
  const walk = (sections: DocxTemplateRecord["sections"], scope: unknown, notePrefix: string, labelPrefix: string) => {
    for (const s of sections) {
      const list = at(scope, s.path);
      if (!Array.isArray(list)) continue;
      const sectionMax = notes[notePrefix + s.path]?.maxLength;
      list.forEach((item, index) => {
        const label = `${labelPrefix}${s.path}[${index}]`;
        if (s.itemIsValue) {
          if (sectionMax) checkString(label, item, sectionMax);
          return;
        }
        for (const f of s.fields) {
          const max = notes[`${notePrefix}${s.path}.${f.path}`]?.maxLength;
          if (max) checkString(`${label}.${f.path}`, at(item, f.path), max);
        }
        walk(s.sections, item, `${notePrefix}${s.path}.`, `${label}.`);
      });
    }
  };
  walk(record.sections, values, "", "");
  return out;
}

function sectionCounts(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (sections: DocxTemplateRecord["sections"], scope: unknown, prefix: string) => {
    for (const s of sections) {
      const list = at(scope, s.path);
      const key = prefix + s.path;
      if (!Array.isArray(list)) {
        counts[key] = 0;
        continue;
      }
      counts[key] = (counts[key] ?? 0) + list.length;
      for (const item of list) walk(s.sections, item, `${key}.`);
    }
  };
  walk(record.sections, values, "");
  return counts;
}

/** Bullet-like items (list-of-strings sections) the provenance map does
 * not cover — neither the item (`experience_bullets[2]`) nor the whole
 * section (`experience_bullets`) is cited. The factual lines of a resume
 * are its bullets; this is where an uncited claim would hide. */
export function uncitedItems(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
  provenance: FillProvenance | undefined,
): string[] {
  if (!provenance) return [];
  const cited = (key: string) => Array.isArray(provenance[key]) && provenance[key].length > 0;
  const out: string[] = [];
  const walk = (sections: DocxTemplateRecord["sections"], scope: unknown, prefix: string) => {
    for (const s of sections) {
      const list = at(scope, s.path);
      if (!Array.isArray(list)) continue;
      const key = prefix + s.path;
      list.forEach((item, index) => {
        const label = `${key}[${index}]`;
        if (s.itemIsValue) {
          if (!isEmpty(item) && !cited(label) && !cited(key)) out.push(label);
          return;
        }
        walk(s.sections, item, `${label}.`);
      });
    }
  };
  walk(record.sections, values, "");
  return out;
}

export function judgeRender(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
  diagnostics: RenderDiagnostics,
  extra: { links?: number; provenance?: FillProvenance } = {},
): RenderVerdict {
  // 1. Tags left in the output.
  if (diagnostics.unresolved.length > 0) {
    return {
      accept: false,
      gaps: diagnostics.unresolved.map((s) => `unresolved tag near: ${s}`),
      refusal:
        `Refused: the rendered document still contains template tags (${diagnostics.unresolved.slice(0, 3).join(" | ")}). ` +
        "Values must not contain '{{' or '{%'. If none do, the template itself needs repair — tell the user which paragraph, and do not retry with the same template.",
    };
  }

  // 2. Keys the template never reads — a typo leaves a real slot blank.
  const declared = declaredRoots(record);
  if (diagnostics.unused.length > 0) {
    const lines = diagnostics.unused.map((k) => {
      const near = nearestDeclared(k, declared);
      return near ? `${k} (did you mean ${near}?)` : `${k} (no such field)`;
    });
    return {
      accept: false,
      gaps: lines.map((l) => `unused key: ${l}`),
      refusal:
        `Refused: these keys are not fields of this template — ${lines.join("; ")}. ` +
        `Use only the names in the contract (${declared.join(", ")}) and call fill_docx_template again.`,
    };
  }

  // 3. Required slots left empty. Supply from the notes, or ask the user.
  const empties = [...diagnostics.missing.map((k) => `${k} (not supplied)`), ...requiredGaps(record, values)];
  if (empties.length > 0) {
    return {
      accept: false,
      gaps: empties.map((p) => `empty required field: ${p}`),
      refusal:
        `Refused: required fields are empty — ${empties.join(", ")}. ` +
        "Fill each from the user's notes or evidence; if the notes do not support a value, ASK the user for it rather than inventing one or leaving it blank. Optional fields may stay empty.",
    };
  }

  const declaredCount = declared.length;
  return {
    accept: true,
    gaps: [],
    report: {
      filled: { fields: declaredCount, declared: declaredCount },
      sectionCounts: sectionCounts(record, values),
      overLength: overLengthFields(record, values),
      uncited: uncitedItems(record, values, extra.provenance),
      links: extra.links ?? 0,
      textChars: diagnostics.textChars,
      renderMs: diagnostics.durationMs,
      bytes: diagnostics.bytes,
    },
  };
}
