"use client";

import { useEffect } from "react";
import { clientLogger } from "@/lib/core/logger/client";

// Emits the Core Web Vitals (CWV) into the logger as `page:vitals` events.
// One emit per metric per page load. web-vitals v5 fires each metric exactly
// once at the right moment (LCP on first-paint settle, INP after first
// interaction, CLS at page-hide, etc.) — we don't need to poll.
//
// Rating buckets come from web-vitals itself and follow Chrome's published
// thresholds (good / needs-improvement / poor). They're informational; the
// raw value is the load-bearing number for the rework.

type VitalsMetric = {
  name: "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  id: string;
  navigationType: string;
};

export type WebVitalsReporterProps = {
  route: string;
};

export function WebVitalsReporter({ route }: WebVitalsReporterProps) {
  useEffect(() => {
    let cancelled = false;

    const emit = (m: VitalsMetric) => {
      if (cancelled) return;
      clientLogger.info({
        layer: "page",
        event: "page:vitals",
        summary: `${m.name} ${Math.round(m.value)} (${m.rating})`,
        attrs: {
          route,
          metric: m.name,
          value: Math.round(m.value * 1000) / 1000,
          rating: m.rating,
          nav_type: m.navigationType,
        },
      });
    };

    // Dynamic import keeps web-vitals out of the initial bundle — it's small
    // (~3KB gzip) but we don't need it on the critical render path.
    import("web-vitals")
      .then(({ onLCP, onINP, onCLS, onFCP, onTTFB }) => {
        if (cancelled) return;
        onLCP(emit);
        onINP(emit);
        onCLS(emit);
        onFCP(emit);
        onTTFB(emit);
      })
      .catch((err) => {
        clientLogger.warn({
          layer: "page",
          event: "page:vitals_load_failed",
          summary: "failed to load web-vitals module",
          attrs: { route },
          error: err,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [route]);

  return null;
}
