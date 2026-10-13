/**
 * Accept or refuse a rendered document.
 *
 * The renderer REPORTS (render.py: `missing`, `unresolved`, `unused`); it
 * never decides. This is where the product decides, once, for every
 * caller — the AI tool, the settings "re-render" button, a future MCP
 * action. "Schemas describe shape; execute judges."
 *
 * The decision interacts with Product Principle 2 ("gaps are data"): a
 * fact the notes do not support must stay a VISIBLE gap in the output, not
 * invented text — but which gaps may ship, and how they are shown, is the
 * owner's call.
 */

import type { DocxTemplateRecord } from "./templates";
import type { RenderDiagnostics, TemplateValue } from "./renderer-client";

export interface RenderVerdict {
  /** Store the file and hand it to the user. */
  accept: boolean;
  /** Human-readable gaps to show on the review card even when accepted. */
  gaps: string[];
  /** When refused: what the model must change before calling again. */
  refusal?: string;
}

/** Field paths (`header.name`, `experience.title`) the template REQUIRES
 * — not `{% if %}`-guarded — that the supplied values leave empty. Walks
 * list items so a missing `title` on the third job is reported as such. */
export function requiredGaps(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
): string[] {
  const gaps: string[] = [];
  const isEmpty = (v: unknown): boolean =>
    v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  const at = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== "object" || Array.isArray(acc)) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, obj);

  for (const f of record.fields) {
    if (f.required && isEmpty(at(values, f.path))) gaps.push(f.path);
  }
  const walkSections = (sections: DocxTemplateRecord["sections"], scope: unknown, prefix: string): void => {
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
        walkSections(s.sections, item, `${label}.`);
      });
    }
  };
  walkSections(record.sections, values, "");
  return gaps;
}

/**
 * TODO(owner): decide the acceptance policy.
 *
 * Inputs available:
 *   - `diagnostics.unresolved` — tag-shaped text left in the OUTPUT (a
 *     template defect docxtpl could not repair, or braces in a value).
 *   - `diagnostics.missing` — top-level keys the template reads that the
 *     values never supplied at all (e.g. no `education` key).
 *   - `diagnostics.unused` — keys supplied that the template never reads
 *     (typically a misspelled key: `sumary`).
 *   - `requiredGaps(record, values)` — required fields present but empty,
 *     down to the list item.
 *
 * Questions this function answers:
 *   1. Does an unresolved tag ever ship? (It reads as `{{ header.name }}`
 *      in the document a recruiter opens.)
 *   2. May a required field ship empty — i.e. is an empty required field a
 *      deliberate gap the user fills by hand, or a refusal that sends the
 *      model back for the fact / an explicit placeholder?
 *   3. Is an unused key a refusal (the model probably misspelled a field
 *      and the real one went empty) or a warning?
 *
 * Return `accept:false` with a `refusal` the MODEL can act on (name the
 * paths), or `accept:true` with `gaps` the USER sees on the review card.
 */
export function judgeRender(
  record: DocxTemplateRecord,
  values: Record<string, TemplateValue>,
  diagnostics: RenderDiagnostics,
): RenderVerdict {
  const gaps = requiredGaps(record, values);
  // Placeholder until the policy above is written: refuse only what is
  // unambiguously broken (tags left in the output); surface the rest.
  if (diagnostics.unresolved.length > 0) {
    return {
      accept: false,
      gaps,
      refusal:
        `The rendered document still contains template tags: ${diagnostics.unresolved.slice(0, 3).join(" | ")}. ` +
        "Values must not contain '{{' or '{%'; if they do not, the template itself needs repair — tell the user which paragraph.",
    };
  }
  return {
    accept: true,
    gaps: [
      ...gaps.map((p) => `empty required field: ${p}`),
      ...diagnostics.missing.map((k) => `not supplied: ${k}`),
      ...diagnostics.unused.map((k) => `ignored key: ${k}`),
    ],
  };
}
