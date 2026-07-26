/**
 * External Link Viewer
 *
 * Displays external link with optional Open Graph preview.
 * Phase 2: ExternalPayload support
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExternalLink, RefreshCw, BookOpen, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import { clientLogger } from "@/lib/core/logger/client";
import {
  acquireUrlWithFallback,
  acquireUrlVia,
  isExtensionAcquireAvailable,
  type AcquireVia,
} from "@/lib/domain/browser-extension/acquire-url";

// Press-and-hold quick-pick options. `needsExtension` ones (P2/P3) are disabled
// when no extension is reachable — a server fetch is always available.
const FETCH_OPTIONS: ReadonlyArray<{
  key: "auto" | AcquireVia;
  label: string;
  hint: string;
  needsExtension: boolean;
}> = [
  { key: "auto", label: "Auto", hint: "Fastest that works", needsExtension: false },
  { key: "server-fetch", label: "Server fetch", hint: "No cookies · fastest", needsExtension: false },
  { key: "sw-fetch", label: "Browser session", hint: "Your cookies", needsExtension: true },
  { key: "session-tab", label: "Background tab", hint: "Full JS render", needsExtension: true },
];

const ACQUIRE_HOLD_MS = 450;
import type { AcquiredContent } from "@/lib/domain/ai/acquisition/types";

const ACQUIRE_VIA_LABEL: Record<AcquireVia, string> = {
  "server-fetch": "server fetch",
  "sw-fetch": "your browser session",
  "session-tab": "a background tab in your session",
};

interface ExternalLinkViewerProps {
  contentId: string;
  url: string;
  subtype: string;
  readingStatus?: "inbox" | "queue" | "reading" | "read" | "archived";
  description?: string | null;
  resourceType?: string | null;
  resourceRelationship?: string | null;
  userIntent?: string | null;
  sourceDomain?: string | null;
  sourceHostname?: string | null;
  faviconUrl?: string | null;
  preserveHtml?: boolean;
  preservedHtmlCapturedAt?: string | null;
  captureMetadata?: Record<string, unknown>;
  preview?: {
    mode?: "none" | "open_graph";
    cached?: {
      title?: string;
      description?: string;
      siteName?: string;
      imageUrl?: string;
      fetchedAt?: string;
    };
  };
}

export function ExternalLinkViewer({
  contentId,
  url,
  subtype,
  readingStatus,
  description,
  resourceType,
  resourceRelationship,
  userIntent,
  sourceDomain,
  sourceHostname,
  faviconUrl,
  preserveHtml,
  preservedHtmlCapturedAt,
  captureMetadata,
  preview = {},
}: ExternalLinkViewerProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [previewData, setPreviewData] = useState(preview.cached || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // B5: full-content acquisition (P1 server-fetch → P2/P3 via the extension).
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [acquired, setAcquired] = useState<{
    content: AcquiredContent;
    via: AcquireVia;
    usedExtension: boolean;
  } | null>(null);
  const [acquireError, setAcquireError] = useState<string | null>(null);
  // Press-and-hold quick-pick for "Read full content".
  const [fetchMenuOpen, setFetchMenuOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const fetchMenuRef = useRef<HTMLDivElement | null>(null);
  const extensionAvailable = isExtensionAcquireAvailable();
  const screenshotDataUrl =
    typeof captureMetadata?.screenshotDataUrl === "string"
      ? captureMetadata.screenshotDataUrl
      : null;
  const displayImageUrl = previewData?.imageUrl || screenshotDataUrl || null;
  const savedFromSource =
    typeof captureMetadata?.source === "string" ? captureMetadata.source : null;
  const savedAt =
    typeof captureMetadata?.dateAdded === "number"
      ? new Date(captureMetadata.dateAdded).toISOString()
      : typeof captureMetadata?.capturedAt === "string"
        ? captureMetadata.capturedAt
        : null;

  // Reset preview when URL changes (e.g., after editing)
  useEffect(() => {
    setPreviewData(preview.cached || null);
    setPreviewError(null);
    setAcquired(null);
    setAcquireError(null);
  }, [url, preview.cached]);

  const handleRefreshPreview = useCallback(
    async (options: { silent?: boolean } = {}) => {
      try {
        setIsRefreshing(true);
        setPreviewError(null);

        const response = await fetch("/api/content/external/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          const errorCode = result.error?.code || "UNKNOWN_ERROR";
          const errorMessage = result.error?.message || "Failed to fetch preview";
          const fullError = `${errorMessage} (${errorCode})`;

          clientLogger.error({
            layer: "ui",
            event: "external_preview_fetch:failed",
            summary: "external preview api rejected",
            attrs: {
              content_id: contentId,
              status: response.status,
              error_code: errorCode,
              silent: options.silent ?? false,
            },
          });

          setPreviewError(fullError);
          if (!options.silent) toast.error(fullError);
          return;
        }

        setPreviewData(result.data.metadata);
        if (!options.silent) toast.success("Preview refreshed");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch preview";
        clientLogger.error({
          layer: "ui",
          event: "external_preview_fetch:caught",
          summary: "external preview handler caught",
          attrs: { content_id: contentId, silent: options.silent ?? false },
          error: err,
        });
        setPreviewError(errorMessage);
        if (!options.silent) toast.error(errorMessage);
      } finally {
        setIsRefreshing(false);
      }
    },
    [url, contentId],
  );

  // Auto-fetch preview once per URL when there's no cached data. The ref
  // guard ensures we don't re-fire if isRefreshing flips or React re-runs
  // the effect for an unrelated reason. Silent mode skips toasts so the
  // automatic path doesn't pop a green "refreshed" toast on every view —
  // the inline card/error state is enough signal.
  const autoFetchedUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (url && autoFetchedUrlRef.current !== url && !preview.cached) {
      autoFetchedUrlRef.current = url;
      void handleRefreshPreview({ silent: true });
    }
  }, [url, preview.cached, handleRefreshPreview]);

  const handleOpenLink = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // B5: read the full page. A short click runs the auto ladder (server fetch →
  // credentialed fetch → background session tab, escalating past bot-hostile
  // pages); press-and-hold (or the caret) opens a quick-pick to force one
  // provider. Works without the extension too — server fetch only.
  const runAcquire = useCallback(
    async (choice: "auto" | AcquireVia) => {
      setFetchMenuOpen(false);
      setIsAcquiring(true);
      setAcquireError(null);
      try {
        const outcome =
          choice === "auto"
            ? await acquireUrlWithFallback(url)
            : await acquireUrlVia(url, choice);
        if (outcome.ok && outcome.content) {
          const via = outcome.via ?? "server-fetch";
          setAcquired({ content: outcome.content, via, usedExtension: outcome.usedExtension });
          toast.success(`Read via ${ACQUIRE_VIA_LABEL[via]}`);
        } else {
          setAcquired(null);
          const message = outcome.reason ?? "Couldn't read this page";
          setAcquireError(message);
          toast.error(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't read this page";
        setAcquireError(message);
        toast.error(message);
      } finally {
        setIsAcquiring(false);
      }
    },
    [url],
  );

  // Distinguish a tap (→ auto) from a hold (→ quick-pick menu).
  const handleAcquirePointerDown = useCallback(() => {
    longPressFiredRef.current = false;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setFetchMenuOpen(true);
    }, ACQUIRE_HOLD_MS);
  }, []);

  const handleAcquirePointerUp = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    // Released before the hold threshold → treat as a tap.
    if (!longPressFiredRef.current && !isAcquiring) void runAcquire("auto");
  }, [runAcquire, isAcquiring]);

  const handleAcquirePointerCancel = useCallback(() => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Close the quick-pick on an outside click.
  useEffect(() => {
    if (!fetchMenuOpen) return;
    const onDocPointerDown = (event: MouseEvent) => {
      if (!fetchMenuRef.current?.contains(event.target as Node)) setFetchMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [fetchMenuOpen]);

  // Check if we have any metadata at all
  const hasAnyMetadata = Boolean(
    screenshotDataUrl ||
      (previewData &&
        (previewData.title ||
          previewData.description ||
          previewData.siteName ||
          previewData.imageUrl))
  );

  // Check which fields are missing
  const missingFields = previewData ? {
    image: !previewData.imageUrl,
    title: !previewData.title,
    description: !previewData.description,
  } : null;

  return (
    <div className="space-y-4 p-6">
      {/* Preview Card */}
      {(hasAnyMetadata || (!previewError && previewData !== null)) && (
        <div
          className="border border-white/10 rounded-lg overflow-hidden"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {displayImageUrl ? (
            <div className="aspect-video w-full overflow-hidden bg-black/20">
              {/* OG preview comes from any URL the user pastes — remote pattern config impractical */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayImageUrl}
                alt={previewData.title || "Preview"}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video w-full overflow-hidden bg-gradient-to-br from-gray-100 via-gray-50 to-white relative">
              {/* Decorative pattern overlay */}
              <div className="absolute inset-0 opacity-30" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }} />

              {/* Centered icon and text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center px-4">
                  <ExternalLink className="h-16 w-16 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">
                    No preview image available
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    This site doesn&apos;t provide Open Graph metadata
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="p-4 space-y-2">
            {previewData?.title && (
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {previewData.title}
              </h3>
            )}
            {previewData?.description && (
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                {previewData.description}
              </p>
            )}
            {previewData?.siteName && (
              <p className="text-xs text-gray-600 dark:text-gray-400">{previewData.siteName}</p>
            )}

            {/* Show info about missing fields if any */}
            {missingFields && (missingFields.title || missingFields.description) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic pt-2 border-t border-gray-900/10 dark:border-white/10">
                This site provides limited preview metadata
                {missingFields.title && missingFields.description && " (no title or description)"}
                {missingFields.title && !missingFields.description && " (no title)"}
                {!missingFields.title && missingFields.description && " (no description)"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {previewError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{previewError}</p>
        </div>
      )}

      {/* URL Card */}
      <div
        className="border border-white/10 rounded-lg p-4"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
        >
          <div className="flex items-start gap-3">
          {faviconUrl ? (
            // Arbitrary external favicon — see comment on first <img> above.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={faviconUrl}
              alt=""
              className="h-5 w-5 rounded-sm mt-0.5 flex-shrink-0"
            />
          ) : (
            <ExternalLink className="h-5 w-5 text-gray-600 mt-0.5 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
              External Link
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300 break-all">{url}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {readingStatus && (
                <span className="inline-block px-2 py-0.5 bg-amber-500/15 text-amber-600 text-xs rounded-full">
                  {readingStatus}
                </span>
              )}
              {resourceType && (
                <span className="inline-block px-2 py-0.5 bg-sky-500/15 text-sky-600 text-xs rounded-full">
                  {resourceType}
                </span>
              )}
              {resourceRelationship && (
                <span className="inline-block px-2 py-0.5 bg-rose-500/15 text-rose-600 text-xs rounded-full">
                  {resourceRelationship}
                </span>
              )}
              {userIntent && (
                <span className="inline-block px-2 py-0.5 bg-emerald-500/15 text-emerald-600 text-xs rounded-full">
                  {userIntent}
                </span>
              )}
              {subtype && subtype !== "website" && (
                <span className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                  {subtype}
                </span>
              )}
              {preserveHtml && (
                <span className="inline-block px-2 py-0.5 bg-violet-500/15 text-violet-600 text-xs rounded-full">
                  preserve HTML
                </span>
              )}
              {savedFromSource && (
                <span className="inline-block px-2 py-0.5 bg-emerald-500/15 text-emerald-600 text-xs rounded-full">
                  {savedFromSource}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
              {sourceDomain && <div>Domain: {sourceDomain}</div>}
              {!sourceDomain && sourceHostname && <div>Host: {sourceHostname}</div>}
              {savedAt && (
                <div>
                  Saved: {new Date(savedAt).toLocaleString()}
                </div>
              )}
              {preservedHtmlCapturedAt && (
                <div>
                  HTML captured: {new Date(preservedHtmlCapturedAt).toLocaleString()}
                </div>
              )}
              {screenshotDataUrl && (
                <div>Visual snapshot captured when saved.</div>
              )}
              {previewData?.fetchedAt && (
                <div>
                  Preview fetched: {new Date(previewData.fetchedAt).toLocaleString()}
                </div>
              )}
            </div>
            {description && (
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {description}
              </p>
            )}
            {previewData?.description &&
              previewData.description !== description && (
              <p className="mt-3 text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                {previewData.description}
              </p>
              )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleOpenLink}
          className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Open Link
        </button>
        <button
          onClick={() => handleRefreshPreview()}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900/10 hover:bg-gray-900/20 dark:bg-white/10 dark:hover:bg-white/15 border border-gray-900/20 dark:border-white/15 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing..." : "Refresh Preview"}
        </button>
        <div ref={fetchMenuRef} className="relative inline-flex">
          <button
            type="button"
            onPointerDown={handleAcquirePointerDown}
            onPointerUp={handleAcquirePointerUp}
            onPointerLeave={handleAcquirePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isAcquiring) {
                e.preventDefault();
                void runAcquire("auto");
              }
            }}
            disabled={isAcquiring}
            className="flex select-none items-center gap-2 rounded-l-lg border border-gray-900/20 dark:border-white/15 bg-gray-900/10 hover:bg-gray-900/20 dark:bg-white/10 dark:hover:bg-white/15 px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title="Read the full page — click for auto (server → your session), press and hold for options"
          >
            <BookOpen className={`h-4 w-4 ${isAcquiring ? "animate-pulse" : ""}`} />
            {isAcquiring ? "Reading..." : "Read full content"}
          </button>
          <button
            type="button"
            onClick={() => setFetchMenuOpen((open) => !open)}
            disabled={isAcquiring}
            aria-label="Fetch options"
            aria-haspopup="menu"
            aria-expanded={fetchMenuOpen}
            className="flex items-center rounded-r-lg border border-l-0 border-gray-900/20 dark:border-white/15 bg-gray-900/10 hover:bg-gray-900/20 dark:bg-white/10 dark:hover:bg-white/15 px-2 py-2 text-gray-900 dark:text-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {fetchMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-[60] mt-1 w-60 overflow-hidden rounded-lg border border-white/10 shadow-xl"
              style={{
                background: glass0.background,
                backdropFilter: glass0.backdropFilter,
              }}
            >
              {FETCH_OPTIONS.map((option) => {
                const disabled = option.needsExtension && !extensionAvailable;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => void runAcquire(option.key)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/10"
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {disabled ? "needs extension" : option.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Acquire error (B5) */}
      {acquireError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{acquireError}</p>
        </div>
      )}

      {/* Acquired full content (B5) */}
      {acquired && (
        <div
          className="border border-white/10 rounded-lg p-4"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
              {acquired.content.title || "Extracted content"}
            </h3>
            <span className="inline-block shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-500">
              via {ACQUIRE_VIA_LABEL[acquired.via]}
            </span>
          </div>
          <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Web content — informational only. ~{acquired.content.tokenEstimate} tokens
            {acquired.content.truncated ? " · truncated" : ""}
          </div>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {acquired.content.content}
          </div>
        </div>
      )}
    </div>
  );
}
