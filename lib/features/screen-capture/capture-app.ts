/**
 * Screenshot the app itself — view_screen's in-app executor.
 * AI-VIEW-SCREEN-PLAN.md D4/D5.
 *
 * Rasterizes the DOM with `modern-screenshot` (MIT, lazy-imported on the first
 * capture so it costs nothing at page load). A maintained library, not a
 * bespoke renderer: DOM → SVG foreignObject → canvas is a deep well of font,
 * pseudo-element and scrollbar edge cases.
 *
 * PRIVATE CONTENT (D5) — the pixel seam of the private-content contract:
 * every `[data-private]` element (commented-out text and blocks) is left out
 * of the clone entirely, children included. Excluding is certain; repainting
 * a cloned node depends on hook ordering. `pnpm private:content:check` pins
 * this filter.
 *
 * Limits, reported to the model in `notes` so it never reads an absence as
 * empty content: cross-origin iframes (OnlyOffice, diagrams.net, embeds)
 * render blank.
 */
import { useContentStore } from "@/state/content-store";

/** The largest edge sent to a model (Anthropic's recommended maximum). */
export const MAX_EDGE_PX = 1568;

export type AppCaptureArea = "content" | "window";

export interface AppCapture {
  canvas: HTMLCanvasElement;
  /** What was actually captured — "window" when no pane was found. */
  area: AppCaptureArea;
  title?: string;
  notes: string[];
}

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

/** The focused pane's element, or null when the workspace isn't mounted. */
function activePaneElement(): HTMLElement | null {
  const paneId = useContentStore.getState().activePaneId;
  return document.querySelector<HTMLElement>(`[data-workspace-pane="${CSS.escape(paneId)}"]`);
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

export async function captureApp(area: AppCaptureArea): Promise<AppCapture> {
  const pane = area === "content" ? activePaneElement() : null;
  const target = pane ?? document.body;
  const notes: string[] = [];
  if (area === "content" && !pane) notes.push("No open pane was found, so the whole window was captured.");
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

  const { domToCanvas } = await import("modern-screenshot");
  const canvas = await domToCanvas(target, {
    scale,
    filter: isCapturable,
    backgroundColor: background && background !== "rgba(0, 0, 0, 0)" ? background : "#ffffff",
    timeout: 15_000,
  });

  const title = pane?.querySelector("[data-active-tab]")?.textContent?.trim() || undefined;
  return { canvas, area: pane ? "content" : "window", title, notes };
}
