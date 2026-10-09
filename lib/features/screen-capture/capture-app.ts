/**
 * Screenshot the app itself — view_screen's in-app executor.
 * AI-VIEW-SCREEN-PLAN.md D4/D5/D12/D13.
 *
 * Rasterizes the DOM with `modern-screenshot` (MIT, lazy-imported on the first
 * capture so it costs nothing at page load). A maintained library, not a
 * bespoke renderer: DOM → SVG foreignObject → canvas is a deep well of font,
 * pseudo-element and scrollbar edge cases.
 *
 * AREAS (D12): the focused pane by default, or every pane, the left sidebar
 * (file tree + rail), the right sidebar, or the window. A capture NEVER widens
 * past what was asked: asking for the file tree only is often a privacy
 * choice, so a region that isn't on screen is refused rather than swapped for
 * the window.
 *
 * PRIVATE CONTENT (D5) — the pixel seam of the private-content contract:
 * every `[data-private]` element (commented-out text and blocks) is left out
 * of the clone entirely, children included. Excluding is certain; repainting
 * a cloned node depends on hook ordering. `pnpm private:content:check` pins
 * this filter.
 *
 * IMAGES (D13): uploads render from presigned storage URLs on another origin,
 * and the bucket sends no CORS headers for the app — the rasterizer's own
 * fetch fails and the image comes out blank (owner smoke 2026-10-09: a book
 * cover captured as an empty viewer). An image that names its content
 * (`data-content-id`, set by the editor's image node and the image viewer) is
 * fetched through the app's same-origin download route instead. Anything
 * still unreadable is counted in `notes`, never left as a silent blank.
 */
import type { ViewScreenArea } from "@/lib/domain/ai/tools/view-screen";
import { useContentStore } from "@/state/content-store";

/** The largest edge sent to a model (Anthropic's recommended maximum). */
export const MAX_EDGE_PX = 1568;

export interface AppCapture {
  canvas: HTMLCanvasElement;
  area: ViewScreenArea;
  title?: string;
  notes: string[];
}

/** Why a capture was refused — the model relays it. */
export class AppCaptureRefused extends Error {}

/** Never in the image: commented-out text and blocks. */
export const PRIVATE_SELECTOR = "[data-private]";

/**
 * The markdown source view shows commented-out text as raw `%%…%%` (it must —
 * the author edits it there), so its text is left out while it holds any.
 */
export const SOURCE_VIEW_SELECTOR = "textarea[data-markdown-source]";
const holdsPrivateSource = (el: Element) =>
  el.matches(SOURCE_VIEW_SELECTOR) && (el as HTMLTextAreaElement).value.includes("%%");

export function isCapturable(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  return !node.matches(PRIVATE_SELECTOR) && !holdsPrivateSource(node);
}

/** Where each area lives in the DOM. `pane` follows the focused pane. */
const REGION_SELECTOR: Record<Exclude<ViewScreenArea, "pane" | "window">, string> = {
  "all-panes": '[data-capture-region="panes"]',
  "left-sidebar": '[data-capture-region="left-sidebar"]',
  "right-sidebar": '[data-capture-region="right-sidebar"]',
};

const MISSING_REGION: Record<Exclude<ViewScreenArea, "window">, string> = {
  pane: "no content pane is open",
  "all-panes": "no content panes are open",
  "left-sidebar": "the left sidebar (file tree) is collapsed or hidden",
  "right-sidebar": "the right sidebar is collapsed or hidden",
};

/** A region counts only when it is actually on screen. */
function visible(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 ? el : null;
}

function regionFor(area: ViewScreenArea): HTMLElement | null {
  if (area === "window") return document.body;
  if (area === "pane") {
    const paneId = useContentStore.getState().activePaneId;
    return visible(document.querySelector<HTMLElement>(`[data-workspace-pane="${CSS.escape(paneId)}"]`));
  }
  return visible(document.querySelector<HTMLElement>(REGION_SELECTOR[area]));
}

function crossOriginFrames(root: Element): number {
  let count = 0;
  for (const frame of root.querySelectorAll("iframe")) {
    try {
      if (new URL(frame.src, location.href).origin !== location.origin) count += 1;
    } catch {
      count += 1;
    }
  }
  return count;
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const absolute = (url: string) => {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
};

/**
 * Image bytes for the rasterizer (D13). Same-origin and data URLs take the
 * library's own path (`false`). A cross-origin image that names its content
 * is read through `/api/content/content/<id>/download?stream=true` — the
 * user's own file, on the app's origin, so no CORS. Others are recorded as
 * unreadable and left to the library (usually blank).
 */
function imageFetcher(root: HTMLElement, unreadable: Set<string>) {
  return async (url: string): Promise<string | false> => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return false;
    const href = absolute(url);
    if (href.startsWith(location.origin + "/")) return false;
    const img = [...root.querySelectorAll<HTMLImageElement>("img[data-content-id]")].find(
      (el) => absolute(el.currentSrc || el.src) === href || absolute(el.getAttribute("src") ?? "") === href,
    );
    const contentId = img?.getAttribute("data-content-id");
    if (!contentId) {
      unreadable.add(href);
      return false;
    }
    try {
      const res = await fetch(`/api/content/content/${encodeURIComponent(contentId)}/download?stream=true`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      return await blobToDataUrl(await res.blob());
    } catch {
      unreadable.add(href);
      return false;
    }
  };
}

/** Images big enough to matter (not avatars and favicons). */
function significantImages(root: HTMLElement): Set<string> {
  const urls = new Set<string>();
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    const rect = img.getBoundingClientRect();
    if (rect.width >= 48 && rect.height >= 48) urls.add(absolute(img.currentSrc || img.src));
  }
  return urls;
}

export async function captureApp(area: ViewScreenArea): Promise<AppCapture> {
  const target = regionFor(area);
  if (!target) {
    // Never widen: the user may have asked for less precisely to show less.
    throw new AppCaptureRefused(
      `${MISSING_REGION[area as Exclude<ViewScreenArea, "window">]}, so nothing was captured — ask the user to open it, or offer a different area`,
    );
  }
  const notes: string[] = [];
  if (target.querySelector(PRIVATE_SELECTOR)) {
    notes.push("Commented-out (private) text was left out of the image on purpose.");
  }
  if ([...target.querySelectorAll(SOURCE_VIEW_SELECTOR)].some(holdsPrivateSource)) {
    notes.push("The note is in markdown source view and holds commented-out text, so its text was left out; it shows in rich-text view.");
  }
  const frames = crossOriginFrames(target);
  if (frames > 0) {
    notes.push(`${frames} embedded frame${frames > 1 ? "s" : ""} (e.g. an office document or diagram editor) cannot be captured and appear blank.`);
  }

  const rect = target.getBoundingClientRect();
  const longest = Math.max(rect.width, rect.height, 1);
  // Device pixels up to the model's limit — sharp text without oversampling.
  const scale = Math.min(window.devicePixelRatio || 1, MAX_EDGE_PX / longest);
  const background = getComputedStyle(document.body).backgroundColor;
  const unreadable = new Set<string>();

  const { domToCanvas } = await import("modern-screenshot");
  const canvas = await domToCanvas(target, {
    scale,
    filter: isCapturable,
    fetchFn: imageFetcher(target, unreadable),
    backgroundColor: background && background !== "rgba(0, 0, 0, 0)" ? background : "#ffffff",
    timeout: 15_000,
  });

  const significant = significantImages(target);
  const blank = [...unreadable].filter((href) => significant.has(href)).length;
  if (blank > 0) {
    notes.push(
      `${blank} image${blank > 1 ? "s" : ""} could not be loaded into the screenshot and ${blank > 1 ? "appear" : "appears"} blank — do not describe ${blank > 1 ? "them" : "it"} as empty; read_image_text can still read an image's text by its content id.`,
    );
  }

  const title = area === "pane" ? target.querySelector("[data-active-tab]")?.textContent?.trim() || undefined : undefined;
  return { canvas, area, title, notes };
}
