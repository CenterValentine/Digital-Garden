/**
 * Wrap / Size — shared attr definitions and DOM helpers for block nodes.
 *
 * Add to any block's addAttributes() via spread:
 *   addAttributes() { return { ...existingAttrs, ...makeWrapAttrs() }; }
 *
 * Enable the chrome controls in createBlockNodeView() via:
 *   createBlockNodeView({ ..., supportWrap: true })
 *
 * Size/wrap interaction rule:
 *   L size forces inline (no float) — S and M may float left or right.
 */

export type WrapMode = "inline" | "left" | "right";
export type SizePreset = "s" | "m" | "l";

/** TipTap attr definitions to spread into addAttributes(). */
export function makeWrapAttrs() {
  return {
    wrap: {
      default: "inline" as WrapMode,
      parseHTML: (el: Element) =>
        (el.getAttribute("data-wrap") as WrapMode) || "inline",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.wrap && attrs.wrap !== "inline"
          ? { "data-wrap": attrs.wrap }
          : {},
    },
    size: {
      default: null as SizePreset | null,
      parseHTML: (el: Element) =>
        (el.getAttribute("data-size") as SizePreset) || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.size ? { "data-size": attrs.size } : {},
    },
  };
}

/**
 * Apply wrap/size as data attributes on a DOM element.
 * CSS in globals.css handles float, width, and margin from these attrs.
 * L size removes the float data-attr regardless of wrap setting.
 */
export function applyWrapAttrs(
  el: HTMLElement,
  wrap: string | null | undefined,
  size: string | null | undefined
) {
  const effectiveWrap = size === "l" ? "inline" : (wrap || "inline");

  if (effectiveWrap !== "inline") {
    el.setAttribute("data-wrap", effectiveWrap);
  } else {
    el.removeAttribute("data-wrap");
  }

  if (size) {
    el.setAttribute("data-size", size);
  } else {
    el.removeAttribute("data-size");
  }
}
