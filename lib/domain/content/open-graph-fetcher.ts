/**
 * Open Graph Metadata Fetcher
 *
 * Fetches and parses Open Graph metadata from external URLs.
 * Phase 2: ExternalPayload support
 *
 * This is a utility module called from route handlers. It uses the logger
 * directly (with layer "external") and assumes the caller has established
 * a trace context via withRouteTrace.
 */

import { logger } from "@/lib/core/logger";

export interface OpenGraphData {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  type?: string;
  url?: string;
}

export interface FetchOptions {
  timeout?: number;
  maxSize?: number;
  followRedirects?: boolean;
  allowCrossDomain?: boolean;
}

const DEFAULT_OPTIONS: Required<FetchOptions> = {
  timeout: 3000,
  maxSize: 128 * 1024,
  followRedirects: true,
  allowCrossDomain: false,
};

/**
 * Fetches Open Graph metadata from a URL
 *
 * @param url - The URL to fetch metadata from
 * @param options - Fetch options
 * @returns Open Graph data or null if fetch fails
 */
export async function fetchOpenGraphData(
  url: string,
  options: FetchOptions = {}
): Promise<OpenGraphData | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Digital-Garden/1.0 (OpenGraph Fetcher)",
          Accept: "text/html",
        },
        redirect: opts.followRedirects ? "follow" : "manual",
      });

      clearTimeout(timeoutId);

      if (!opts.allowCrossDomain) {
        const originalHost = new URL(url).hostname;
        const finalHost = new URL(response.url).hostname;

        const isSameDomain =
          originalHost === finalHost ||
          originalHost === `www.${finalHost}` ||
          finalHost === `www.${originalHost}` ||
          originalHost.replace(/^www\./, '') === finalHost.replace(/^www\./, '');

        if (!isSameDomain) {
          logger.warn({
            layer: "external",
            event: "og_fetch:cross_domain_blocked",
            summary: `${originalHost} → ${finalHost}`,
            attrs: { from: originalHost, to: finalHost },
          });
          return null;
        }
      }

      if (!response.ok) {
        logger.warn({
          layer: "external",
          event: "og_fetch:http_error",
          summary: `HTTP ${response.status}`,
          attrs: { status: response.status },
        });
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        logger.warn({
          layer: "external",
          event: "og_fetch:wrong_content_type",
          summary: `not text/html`,
          attrs: { content_type: contentType },
        });
        return null;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        logger.warn({
          layer: "external",
          event: "og_fetch:no_body",
          summary: "empty response body",
        });
        return null;
      }

      let html = "";
      let bytesRead = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesRead += value.length;
        if (bytesRead > opts.maxSize) {
          logger.warn({
            layer: "external",
            event: "og_fetch:too_large",
            summary: `exceeded ${opts.maxSize} bytes`,
            attrs: { limit: opts.maxSize, read: bytesRead },
          });
          reader.cancel();
          return null;
        }

        html += new TextDecoder().decode(value);

        // Stop early if we've read past </head> tag (OG tags are in <head>)
        if (html.includes("</head>")) {
          reader.cancel();
          break;
        }
      }

      return parseOpenGraphTags(html);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn({
        layer: "external",
        event: "og_fetch:timeout",
        summary: `${opts.timeout}ms timeout`,
        attrs: { timeout_ms: opts.timeout },
      });
    } else if (err instanceof Error && 'cause' in err) {
      const cause = (err as Error & { cause?: { code?: string } }).cause;
      if (cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || cause?.code === 'CERT_HAS_EXPIRED') {
        logger.warn({
          layer: "external",
          event: "og_fetch:ssl_error",
          summary: cause.code,
          attrs: { code: cause.code },
        });
      } else {
        logger.warn({
          layer: "external",
          event: "og_fetch:caught",
          summary: "fetch error",
          error: err,
        });
      }
    } else {
      logger.warn({
        layer: "external",
        event: "og_fetch:caught",
        summary: "fetch error",
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
    return null;
  }
}

/**
 * Parses Open Graph meta tags from HTML
 */
function parseOpenGraphTags(html: string): OpenGraphData {
  const data: OpenGraphData = {};

  const ogTagRegex =
    /<meta\s+property=["']og:([^"']+)["']\s+content=["']([^"']+)["']\s*\/?>/gi;

  let match;
  while ((match = ogTagRegex.exec(html)) !== null) {
    const [, property, content] = match;

    switch (property) {
      case "title":
        data.title = decodeHtmlEntities(content);
        break;
      case "description":
        data.description = decodeHtmlEntities(content);
        break;
      case "site_name":
        data.siteName = decodeHtmlEntities(content);
        break;
      case "image":
        data.imageUrl = content;
        break;
      case "type":
        data.type = content;
        break;
      case "url":
        data.url = content;
        break;
    }
  }

  // Fallback to standard meta tags if OG tags not found
  if (!data.title) {
    const titleMatch = html.match(
      /<meta\s+name=["']title["']\s+content=["']([^"']+)["']\s*\/?>/i
    );
    if (titleMatch) {
      data.title = decodeHtmlEntities(titleMatch[1]);
    } else {
      const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleTagMatch) {
        data.title = decodeHtmlEntities(titleTagMatch[1]);
      }
    }
  }

  if (!data.description) {
    const descMatch = html.match(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']\s*\/?>/i
    );
    if (descMatch) {
      data.description = decodeHtmlEntities(descMatch[1]);
    }
  }

  return data;
}

/**
 * Decodes common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  return text.replace(/&[a-z]+;|&#\d+;/gi, (match) => {
    return entities[match] || match;
  });
}
