/**
 * Client-mediated URL acquisition (BROWSER-REACH B5).
 *
 * The Acquisition Service runs server-side, but P2/P3 execute in the user's
 * browser — the server can't reach the extension. So the escalation ladder is
 * orchestrated here, on the client:
 *
 *   P1 server-fetch  → POST /api/ai/acquisition { url }
 *   P2 sw-fetch       → extension credentialed fetch → POST finalize { url, remote }
 *   P3 session-tab    → extension session render     → POST finalize { url, remote }
 *
 * Each rung escalates when the previous one FAILS or comes back too thin to be
 * useful (a bot-hostile page often 200s with a challenge/JS-required stub). The
 * extension steps are skipped entirely when it isn't installed. The server
 * always builds the trusted envelope — the extension only supplies raw material.
 */

import {
  isExtensionInstalled,
  requestExtensionAcquire,
  type ExtensionAcquireMode,
} from "./page-bridge-client";
import { isPanelEmbedSurface, requestPanelAcquire } from "./panel-bridge";
import type { AcquiredContent } from "@/lib/domain/ai/acquisition/types";

/** Below this, an extraction is treated as a failed rung and escalates. */
const THIN_CONTENT_CHARS = 200;

export type AcquireVia = "server-fetch" | "sw-fetch" | "session-tab";

export interface AcquireOutcome {
  ok: boolean;
  content?: AcquiredContent;
  reason?: string;
  /** Which rung produced the returned content (or failed last). */
  via?: AcquireVia;
  /** True when an extension rung was attempted (P2/P3). */
  usedExtension: boolean;
}

interface AcquireApiResponse {
  success: boolean;
  data?: AcquiredContent;
  error?: { code?: string; message?: string };
}

function isThin(content: string | undefined): boolean {
  return !content || content.trim().length < THIN_CONTENT_CHARS;
}

async function callAcquireApi(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; content?: AcquiredContent; reason?: string }> {
  try {
    const res = await fetch("/api/ai/acquisition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as AcquireApiResponse;
    if (json.success && json.data) return { ok: true, content: json.data };
    return { ok: false, reason: json.error?.message ?? "acquisition failed" };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "acquisition request failed",
    };
  }
}

/**
 * True when the extension is reachable — via the page-bridge (a tab's top
 * frame) OR the panel-host channel (the side-panel iframe, where the page-bridge
 * content script can't run). Exported so UIs can hide extension-only fetch
 * options (P2/P3) when there's no extension.
 */
export function isExtensionAcquireAvailable(): boolean {
  return isPanelEmbedSurface() || isExtensionInstalled();
}

/**
 * One extension rung: ask the extension for material, then finalize server-side.
 * In the panel embed the page-bridge isn't present, so route through the panel
 * host instead — same background provider, different channel.
 */
async function extensionRung(
  url: string,
  mode: ExtensionAcquireMode,
): Promise<{ ok: boolean; content?: AcquiredContent; reason?: string }> {
  const material = isPanelEmbedSurface()
    ? await requestPanelAcquire(url, mode)
    : await requestExtensionAcquire(url, { mode });
  if (!material.ok) {
    return { ok: false, reason: material.reason ?? "extension could not fetch this page" };
  }
  return callAcquireApi({ url, remote: material });
}

/**
 * Acquire `url`, escalating P1 → P2 → P3 as needed. Returns the trusted envelope
 * and which rung produced it, or a reason if every available rung failed.
 */
export async function acquireUrlWithFallback(url: string): Promise<AcquireOutcome> {
  // Rung 1 — server-fetch.
  const p1 = await callAcquireApi({ url });
  if (p1.ok && !isThin(p1.content?.content)) {
    return { ok: true, content: p1.content, via: "server-fetch", usedExtension: false };
  }
  const p1Reason = p1.ok ? "the site returned little readable content" : p1.reason;

  // No extension reachable → return the best P1 had (content if any, else reason).
  if (!isExtensionAcquireAvailable()) {
    return {
      ok: Boolean(p1.content),
      content: p1.content,
      reason: p1.content ? undefined : p1Reason,
      via: "server-fetch",
      usedExtension: false,
    };
  }

  // Rung 2 — sw-fetch (credentialed static). Cheap; may clear a cookie wall.
  const p2 = await extensionRung(url, "sw-fetch");
  if (p2.ok && !isThin(p2.content?.content)) {
    return { ok: true, content: p2.content, via: "sw-fetch", usedExtension: true };
  }

  // Rung 3 — session-tab (full JS render in the user's session).
  const p3 = await extensionRung(url, "session-tab");
  if (p3.ok) {
    return { ok: true, content: p3.content, via: "session-tab", usedExtension: true };
  }

  // Everything failed — surface the most informative reason we saw, newest first.
  return {
    ok: false,
    reason: p3.reason ?? p2.reason ?? p1Reason ?? "couldn't acquire this page",
    via: "session-tab",
    usedExtension: true,
  };
}

/**
 * Run ONE specific provider, no escalation — powers the "Read full content"
 * press-and-hold quick-pick so the user can force server-fetch / sw-fetch /
 * session-tab directly. `server-fetch` never needs the extension; the other two
 * short-circuit with a clear reason when it isn't reachable.
 */
export async function acquireUrlVia(
  url: string,
  via: AcquireVia
): Promise<AcquireOutcome> {
  if (via === "server-fetch") {
    const p1 = await callAcquireApi({ url });
    return {
      ok: p1.ok,
      content: p1.content,
      reason: p1.ok ? undefined : p1.reason,
      via: "server-fetch",
      usedExtension: false,
    };
  }
  if (!isExtensionAcquireAvailable()) {
    return {
      ok: false,
      reason: "the browser extension isn't available on this surface",
      via,
      usedExtension: false,
    };
  }
  const rung = await extensionRung(url, via === "sw-fetch" ? "sw-fetch" : "session-tab");
  return {
    ok: rung.ok,
    content: rung.content,
    reason: rung.ok ? undefined : rung.reason,
    via,
    usedExtension: true,
  };
}
