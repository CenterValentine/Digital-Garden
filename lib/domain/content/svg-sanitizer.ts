/**
 * SVG sanitizer for server-rendered visualization payloads.
 *
 * VisualizationPayload.data.cachedSvg is written by the Excalidraw flush path
 * and rendered on public pages via `el.innerHTML = cachedSvg`. SVG is fully
 * scriptable (<script>, on* event handlers, javascript: URIs, foreignObject
 * containing HTML), so unsanitized SVG from the database is a stored-XSS
 * sink. This module sanitizes with the DOMPurify SVG profile before the
 * caller injects the result.
 *
 * The DOMPurify instance is bound to a module-scope jsdom window. The window
 * is constructed once per server boot, not per request.
 */

import createDOMPurify, { type WindowLike } from "dompurify";
import { JSDOM } from "jsdom";

const purifierWindow = new JSDOM("").window as unknown as WindowLike;
const purifier = createDOMPurify(purifierWindow);

/**
 * Sanitize an SVG string for safe insertion via innerHTML.
 *
 * Preserves the SVG vocabulary (shapes, paths, text, gradients, filters, and
 * foreignObject with its contents recursively cleaned — Excalidraw uses
 * foreignObject for some text rendering paths). Strips <script>, event
 * handler attributes, and dangerous URI schemes in href/src.
 *
 * Returns the empty string if input is not a string.
 */
export function sanitizeSvg(svg: unknown): string {
  if (typeof svg !== "string") return "";
  return purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}
