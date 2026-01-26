"use client";

import { useEffect } from "react";

type LogoAnimationOptions = {
  speed?: number;
  drawDurationMs?: number;
  nodeDurationMs?: number;
  gapMs?: number;
  drawJitterMs?: number; // random delay per path
  /**
   * 0 = no overlap; 0.5 = start next group's draws when current draws are ~50% complete
   */
  drawOverlap?: number;
  runOnce?: boolean;

  debug?: boolean; // logs what is animating
  debugHighlight?: boolean; // adds a CSS class to currently animating elements

  /** Called when the entire SVG sequence is finished */
  onComplete?: () => void;
};

const DEFAULTS: Required<LogoAnimationOptions> = {
  speed: 1,
  drawDurationMs: 260,
  nodeDurationMs: 180,
  gapMs: 0,
  drawOverlap: 0,
  runOnce: true,
  debug: false,
  debugHighlight: false,
  drawJitterMs: 0,
  onComplete: () => {},
};
// Small cancellable delay helper
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number) {
  return ms > 0 ? Math.random() * ms : 0;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
  );
}

// Extracts the order information from the id of an SVG element
function extractOrderInfo(id: string) {
  // Examples: _shoot12_, _root12_-2, _node11_-4, _start0_
  const kindMatch = id.match(/(node|shoot|root|start)/i);
  const kind = (kindMatch?.[1] ?? "").toLowerCase();

  // First number determines ordering
  const numMatch = id.match(/(\d+)/);
  const num = numMatch ? Number(numMatch[1]) : Number.POSITIVE_INFINITY;

  // node* plays before others with same number
  const priority = kind === "node" ? 0 : 1;

  return { kind, num, priority };
}

function isDrawable(el: Element): el is SVGGeometryElement {
  return typeof (el as any)?.getTotalLength === "function";
}

async function animateDraw(
  el: SVGGeometryElement,
  durationMs: number,
  direction: "forward" | "reverse" = "forward"
) {
  let length = 0;
  try {
    length = el.getTotalLength();
  } catch {
    length = 0;
  }

  const style = (el as any).style as CSSStyleDeclaration;
  style.opacity = "1";

  if (!length || !Number.isFinite(length)) return;

  style.strokeDasharray = `${length}`;

  const from = direction === "reverse" ? -length : length;
  style.strokeDashoffset = `${from}`;

  const anim = (el as any).animate(
    [{ strokeDashoffset: `${from}` }, { strokeDashoffset: "0" }],
    { duration: durationMs, easing: "ease-out", fill: "forwards" }
  );

  await new Promise<void>((resolve) => {
    anim.addEventListener?.("finish", () => resolve());
    setTimeout(resolve, durationMs + 20);
  });
}

async function animateNode(el: Element, durationMs: number) {
  const style = (el as any).style as CSSStyleDeclaration;

  // Ensure transforms are computed relative to the element’s own box,
  // so scaling doesn't look like it "moves".
  // (transformBox isn't in TS lib typings for CSSStyleDeclaration in some setups)
  (style as any).transformBox = "fill-box";
  style.transformOrigin = "center";

  style.opacity = "1";

  // "Sprout / pop" in place: scale from 0 -> overshoot -> settle.
  const anim = (el as any).animate(
    [
      { transform: "scale(0)", opacity: 0 },
      { transform: "scale(1.12)", opacity: 1, offset: 0.65 },
      { transform: "scale(0.96)", opacity: 1, offset: 0.85 },
      { transform: "scale(1)", opacity: 1 },
    ],
    {
      duration: durationMs,
      easing: "cubic-bezier(0.2, 0.9, 0.2, 1)",
      fill: "forwards",
    }
  );

  await new Promise<void>((resolve) => {
    anim.addEventListener?.("finish", () => resolve());
    setTimeout(resolve, durationMs + 20);
  });
}

function collectCandidates(svg: SVGSVGElement) {
  return Array.from(svg.querySelectorAll<SVGElement>("[id]")).filter((el) => {
    const id = el.getAttribute("id") ?? "";
    return /(node|shoot|root|start)\d+/i.test(id);
  });
}

function resetForAnimation(svg: SVGSVGElement) {
  const els = collectCandidates(svg);

  for (const el of els) {
    const id = el.getAttribute("id") ?? "";
    const { kind } = extractOrderInfo(id);
    const style = (el as any).style as CSSStyleDeclaration;

    style.opacity = "0";
    style.strokeDasharray = "";
    style.strokeDashoffset = "";

    if (kind === "node") {
      (style as any).transformBox = "fill-box";
      style.transformOrigin = "center";
      style.transform = "scale(0)";
    } else {
      style.transform = "";
    }
  }

  return els;
}

function groupByNumber<T extends { num: number }>(items: T[]) {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const arr = map.get(item.num);
    if (arr) arr.push(item);
    else map.set(item.num, [item]);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([num, group]) => ({ num, group }));
}

function setDebugActive(el: Element, active: boolean) {
  if (!(el as any)?.classList) return;
  (el as any).classList.toggle("logo-debug-active", active);
}

/**
 * Sequenced SVG logo animation:
 * - order by first number in ID
 * - node* comes first for the same number
 */

export function useLogoAnimation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  options?: LogoAnimationOptions
) {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const opts = { ...DEFAULTS, ...options };

    delete svg.dataset.logoAnimating;
    if (opts.runOnce && svg.dataset.logoAnimated === "true") return;

    if (prefersReducedMotion()) {
      const els = resetForAnimation(svg);
      for (const el of els) {
        (el as any).style.opacity = "1";
        (el as any).style.transform = "";
        (el as any).style.strokeDasharray = "";
        (el as any).style.strokeDashoffset = "";
      }
      svg.dataset.logoAnimated = "true";
      return;
    }

    const els = resetForAnimation(svg);

    const ordered = els
      .map((el) => {
        const id = el.getAttribute("id") ?? "";
        const reverse = /reverse/i.test(id);
        return { el, id, reverse, ...extractOrderInfo(id) };
      })
      .filter((x) => Number.isFinite(x.num))
      .sort((a, b) => {
        if (a.num !== b.num) return a.num - b.num;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id.localeCompare(b.id);
      });

    const groups = groupByNumber(ordered);

    let cancelled = false;

    (async () => {
      const speed = Math.max(0.05, opts.speed);
      const drawMs = Math.round(opts.drawDurationMs / speed);
      const nodeMs = Math.round(opts.nodeDurationMs / speed);
      const gapMs = Math.round(opts.gapMs / speed);
      const drawOverlap = Math.min(0.95, Math.max(0, opts.drawOverlap ?? 0));

      let activeDraws: Promise<void>[] = [];

      for (let i = 0; i < groups.length; i++) {
        const { num, group } = groups[i];
        const next = groups[i + 1];
        const nextHasNodes = !!next?.group?.some((g) => g.kind === "node");

        if (cancelled) return;

        const nodes = group.filter((g) => g.kind === "node");
        const others = group.filter((g) => g.kind !== "node");

        if (opts.debug) {
          console.log(
            `[logo-anim] group ${num}:`,
            group.map((g) => g.id)
          );
        }

        // Nodes must never appear while prior line segments are still drawing.
        // If we allowed overlap, wait for any in-flight draw animations to finish.
        if (nodes.length && activeDraws.length) {
          await Promise.all(activeDraws);
          activeDraws = [];
        }

        // 1) Nodes first (parallel)
        if (nodes.length) {
          if (opts.debugHighlight)
            nodes.forEach((n) => setDebugActive(n.el, true));
          svg.dataset.logoAnimating = `node:${num}`;

          await Promise.all(
            nodes.map(async (n) => {
              if (cancelled) return;
              if (opts.debug) console.log(`[logo-anim] node -> ${n.id}`);
              await animateNode(n.el, nodeMs);
            })
          );

          if (opts.debugHighlight)
            nodes.forEach((n) => setDebugActive(n.el, false));
        }

        if (cancelled) return;

        // 2) Non-nodes next (parallel)
        if (others.length) {
          if (opts.debugHighlight)
            others.forEach((o) => setDebugActive(o.el, true));
          svg.dataset.logoAnimating = `draw:${num}`;

          // Kick off draws, but (optionally) don't wait for them to fully finish
          // before moving to the next group’s draws.
          const drawPromises = others.map(async (o) => {
            if (cancelled) return;

            const delay = jitter(opts.drawJitterMs ?? 0);
            if (delay > 0) await sleep(delay);

            if (opts.debug)
              console.log(
                `[logo-anim] draw -> ${o.id} (+${Math.round(delay)}ms)`
              );

            if (isDrawable(o.el)) {
              await animateDraw(
                o.el,
                drawMs,
                o.reverse ? "reverse" : "forward"
              );
            } else {
              (o.el as any).style.opacity = "1";
            }
          });

          const allDrawsDone = Promise.all(drawPromises).then(() => {
            if (opts.debugHighlight)
              others.forEach((o) => setDebugActive(o.el, false));
          });

          // Track in-flight draws so nodes in a later group can wait for them.
          activeDraws.push(allDrawsDone);

          // If the next group begins with nodes, we must finish these draws first anyway,
          // so overlap doesn't help.
          if (!nextHasNodes && drawOverlap > 0) {
            const continueAfter = Math.max(
              0,
              Math.round(drawMs * (1 - drawOverlap))
            );
            if (continueAfter > 0) await sleep(continueAfter);
          } else {
            // Default (no overlap) behavior: wait for this group's draws to complete.
            await allDrawsDone;
            // Since we awaited, clear any completed draws from the tracker.
            activeDraws = activeDraws.filter((p) => p !== allDrawsDone);
          }
        }

        if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
      }

      // After all groups, ensure any remaining in-flight draws finish.
      if (activeDraws.length) {
        await Promise.all(activeDraws);
        activeDraws = [];
      }

      // Mark completion + notify listeners
      delete svg.dataset.logoAnimating;
      svg.dataset.logoAnimated = "true";

      try {
        svg.dispatchEvent(new CustomEvent("logoAnimationComplete"));
      } catch {
        // ignore
      }

      opts.onComplete?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    svgRef,
    options?.speed,
    options?.drawDurationMs,
    options?.nodeDurationMs,
    options?.gapMs,
    options?.drawOverlap,
    options?.runOnce,
    options?.debug,
    options?.debugHighlight,
    options?.onComplete,
  ]);
}
