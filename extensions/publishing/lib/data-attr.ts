/**
 * Shared TipTap attribute spec builder for publishing blocks.
 *
 * Encapsulates the (default + parseHTML + renderHTML) triple that every
 * publishing block declares for each of its string-typed attrs. Pre-R2,
 * each block reinvented this inline — hero-image had a local `str()`
 * helper, others repeated the boilerplate per-attr.
 *
 * Critically, this version fixes a key-naming bug present in hero-image's
 * local helper: TipTap attrs are camelCase (e.g. `ctaText`), but the data
 * attribute is kebab (e.g. `data-cta-text`). The old helper accessed
 * `attrs[kebabKey]` which silently returned `undefined` for multi-word
 * attrs — the data attribute never got emitted, so server-side renderHTML
 * found nothing in HTMLAttributes and dropped the CTA. (Single-word attrs
 * like `headline` coincidentally worked because camel == kebab.)
 *
 * Usage:
 *   addAttributes: () => ({
 *     blockId: { default: null },
 *     blockType: { default: "heroImage" },
 *     ctaText: dataAttr("ctaText"),
 *     ctaUrl: dataAttr("ctaUrl"),
 *     headline: dataAttr("headline"),
 *     overlay: dataAttr("overlay", { default: 40, parseAs: "number" }),
 *   })
 */

interface DataAttrOptions<T> {
  /** Initial value for the TipTap attr. Defaults to "". */
  default?: T;
  /** Optional parser for non-string fallback values. */
  parseAs?: "string" | "number" | "boolean";
}

interface TipTapAttrSpec<T> {
  default: T;
  parseHTML: (el: Element) => T;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, unknown>;
}

function camelToKebab(camelKey: string): string {
  return camelKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function coerceValue<T>(raw: string | null, fallback: T, parseAs: "string" | "number" | "boolean"): T {
  if (raw === null) return fallback;
  if (parseAs === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as T;
  }
  if (parseAs === "boolean") {
    return (raw === "true") as T;
  }
  return raw as T;
}

/**
 * Build a TipTap attribute spec that round-trips through a kebab-case
 * data attribute. The `camelKey` is the JS-side attr name (what TipTap
 * stores it as in `attrs`); the data attribute is derived as
 * `data-${camelToKebab(camelKey)}`.
 *
 * For string attrs (the default), the renderHTML emits the data attribute
 * only when the value is truthy — so empty strings don't pollute the
 * serialized HTML. Override behavior by passing a non-string `parseAs`.
 */
export function dataAttr<T = string>(
  camelKey: string,
  options: DataAttrOptions<T> = {},
): TipTapAttrSpec<T> {
  const kebabKey = camelToKebab(camelKey);
  const dataKey = `data-${kebabKey}`;
  const fallback = (options.default ?? ("" as unknown as T)) as T;
  const parseAs = options.parseAs ?? "string";

  return {
    default: fallback,
    parseHTML: (el: Element) => coerceValue(el.getAttribute(dataKey), fallback, parseAs),
    renderHTML: (attrs: Record<string, unknown>) => {
      const value = attrs[camelKey];
      // Skip undefined/null/empty-string, but DO emit `0` and `false` —
      // those are valid explicit values (e.g. overlay=0 means no overlay).
      if (value === undefined || value === null) return {};
      if (typeof value === "string" && value === "") return {};
      return { [dataKey]: value };
    },
  };
}
