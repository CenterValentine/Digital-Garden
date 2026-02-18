/**
 * Open Graph Metadata Fetcher
 *
 * Fetches and parses Open Graph metadata from external URLs.
 * Phase 2: ExternalPayload support
 */

export interface OpenGraphData {
  title?: string;
  description?: string;
  siteName?: string;
  imageUrl?: string;
  type?: string;
  url?: string;
}

export interface FetchOptions {
  timeout?: number; // Request timeout in milliseconds (default: 3000ms)
  maxSize?: number; // Maximum response size in bytes (default: 128KB)
  followRedirects?: boolean; // Follow redirects (default: true)
  allowCrossDomain?: boolean; // Allow cross-domain redirects (default: false)
}

const DEFAULT_OPTIONS: Required<FetchOptions> = {
  timeout: 3000,
  maxSize: 128 * 1024, // 128KB
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
    // Set up abort controller for timeout
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

      // Check if redirect crossed domains
      if (!opts.allowCrossDomain) {
        const originalHost = new URL(url).hostname;
        const finalHost = new URL(response.url).hostname;

        // Allow common redirects like example.com → www.example.com
        const isSameDomain =
          originalHost === finalHost ||
          originalHost === `www.${finalHost}` ||
          finalHost === `www.${originalHost}` ||
          originalHost.replace(/^www\./, '') === finalHost.replace(/^www\./, '');

        if (!isSameDomain) {
          console.warn(
            `[OpenGraph] Cross-domain redirect blocked: ${originalHost} → ${finalHost}`
          );
          return null;
        }
      }

      if (!response.ok) {
        console.warn(
          `[OpenGraph] HTTP ${response.status} when fetching ${url}`
        );
        return null;
      }

      // Check content type
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        console.warn(
          `[OpenGraph] Non-HTML content type: ${contentType} for ${url}`
        );
        return null;
      }

      // Read response with size limit
      const reader = response.body?.getReader();
      if (!reader) {
        console.warn(`[OpenGraph] No response body for ${url}`);
        return null;
      }

      let html = "";
      let bytesRead = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesRead += value.length;
        if (bytesRead > opts.maxSize) {
          console.warn(
            `[OpenGraph] Response too large (>${opts.maxSize} bytes) for ${url}`
          );
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

      // Parse Open Graph tags
      return parseOpenGraphTags(html);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[OpenGraph] Request timeout for ${url}`);
    } else if (err instanceof Error && 'cause' in err) {
      const cause = (err as any).cause;
      if (cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || cause?.code === 'CERT_HAS_EXPIRED') {
        console.error(`[OpenGraph] SSL certificate error for ${url}:`, cause.code);
        console.error(`[OpenGraph] To bypass SSL verification in development, set NODE_TLS_REJECT_UNAUTHORIZED=0`);
        console.error(`[OpenGraph] WARNING: Never use NODE_TLS_REJECT_UNAUTHORIZED=0 in production!`);
      } else {
        console.error(`[OpenGraph] Fetch error for ${url}:`, err);
      }
    } else {
      console.error(`[OpenGraph] Fetch error for ${url}:`, err);
    }
    return null;
  }
}

/**
 * Parses Open Graph meta tags from HTML
 *
 * @param html - HTML content to parse
 * @returns Parsed Open Graph data
 */
function parseOpenGraphTags(html: string): OpenGraphData {
  const data: OpenGraphData = {};

  // Extract Open Graph meta tags using regex
  // Matches: <meta property="og:title" content="..." />
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
      // Fallback to <title> tag
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
 *
 * @param text - Text with HTML entities
 * @returns Decoded text
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
