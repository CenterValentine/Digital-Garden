/**
 * Canvas REST API client (server-only).
 *
 * The base URL is user-supplied, so every request goes through the reader's
 * SSRF-checked `readerFetch` (public hosts only, redirects re-validated, size
 * and time capped). The one exception is local development against a mock
 * Canvas (`CANVAS_ALLOW_LOCAL=1`, never in production), which is how the
 * importer is exercised without a real school's token.
 *
 * Requests run one after another: Canvas throttles per token and is gentle on
 * serial calls. A throttled answer (403 "Rate Limit Exceeded" or 429 — Canvas
 * has used both) backs off and retries.
 */

import "server-only";
import { readerFetch, ReaderFetchError, type ReaderFetchResult } from "@/lib/domain/reader/server/http";

export class CanvasError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ATTEMPTS = 5;

/** "school.instructure.com/" → "https://school.instructure.com". Throws on junk. */
export function normalizeCanvasBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new CanvasError("Enter your Canvas address, e.g. https://school.instructure.com", 400);
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CanvasError("That doesn't look like a web address", 400);
  }
  if (url.protocol !== "https:" && !allowLocal(url)) {
    throw new CanvasError("Canvas addresses must use https://", 400);
  }
  return url.origin;
}

function allowLocal(url: URL): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.CANVAS_ALLOW_LOCAL === "1" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RawResult {
  status: number;
  body: Buffer;
  headers: Headers;
  contentType: string;
}

async function fetchOnce(url: string, headers: Record<string, string>, maxBytes: number): Promise<RawResult> {
  const parsed = new URL(url);
  if (allowLocal(parsed)) {
    const response = await fetch(url, { headers, redirect: "follow" });
    const body = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      throw new ReaderFetchError(
        `${parsed.hostname} answered ${response.status}: ${body.toString("utf8").slice(0, 200)}`,
        response.status === 401 || response.status === 403 ? 401 : 502,
        response.status
      );
    }
    return { status: response.status, body, headers: response.headers, contentType: response.headers.get("content-type") ?? "" };
  }
  const result: ReaderFetchResult = await readerFetch(url, { headers, maxBytes, timeoutMs: 60_000 });
  return { status: result.status, body: result.body, headers: result.headers, contentType: result.contentType };
}

function isThrottle(error: ReaderFetchError): boolean {
  return error.upstreamStatus === 429 || (error.upstreamStatus === 403 && /rate limit/i.test(error.message));
}

function toCanvasError(error: unknown, what: string): CanvasError {
  if (error instanceof CanvasError) return error;
  if (error instanceof ReaderFetchError) {
    const upstream = error.upstreamStatus;
    if (upstream === 401) return new CanvasError("Canvas rejected the access token. It may have expired: create a new one and reconnect.", 401);
    if (upstream === 403) return new CanvasError(`Canvas doesn't let your account read ${what}.`, 403);
    if (upstream === 404) return new CanvasError(`Canvas couldn't find ${what}.`, 404);
    return new CanvasError(error.message, error.status);
  }
  return new CanvasError(error instanceof Error ? error.message : `Couldn't reach Canvas for ${what}`);
}

type QueryValue = string | number | boolean | Array<string | number>;

function buildQuery(params: Record<string, QueryValue | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const values = Array.isArray(value) ? value : [value];
    for (const one of values) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(one))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** `<https://…?page=2>; rel="next"` → the next page's URL. */
function nextLink(headers: Headers): string | null {
  const link = headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/i.exec(part);
    if (match) return match[1];
  }
  return null;
}

export interface CanvasApi {
  readonly baseUrl: string;
  get<T>(path: string, params?: Record<string, QueryValue | undefined>, what?: string): Promise<T>;
  getAll<T>(path: string, params?: Record<string, QueryValue | undefined>, what?: string): Promise<T[]>;
  /** Fetch a file's bytes from the (pre-signed, off-Canvas) URL Canvas hands out. Never sends the token. */
  download(url: string, maxBytes: number): Promise<{ body: Buffer; contentType: string }>;
  /** Bytes from this Canvas itself (equation images, inline media), with the token. Same origin only. */
  fetchSameOrigin(url: string, maxBytes: number): Promise<{ body: Buffer; contentType: string }>;
}

export function createCanvasApi(baseUrl: string, token: string): CanvasApi {
  const origin = normalizeCanvasBaseUrl(baseUrl);
  const authHeaders = { Authorization: `Bearer ${token}`, Accept: "application/json" };

  async function request(url: string, what: string): Promise<RawResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchOnce(url, authHeaders, MAX_JSON_BYTES);
      } catch (error) {
        if (error instanceof ReaderFetchError && isThrottle(error) && attempt < MAX_ATTEMPTS) {
          await sleep(1000 * 2 ** (attempt - 1));
          continue;
        }
        throw toCanvasError(error, what);
      }
    }
  }

  function parse<T>(result: RawResult, what: string): T {
    try {
      return JSON.parse(result.body.toString("utf8")) as T;
    } catch {
      throw new CanvasError(`Canvas returned something unreadable for ${what}. Check the Canvas address.`);
    }
  }

  return {
    baseUrl: origin,
    async get<T>(path: string, params: Record<string, QueryValue | undefined> = {}, what = "that") {
      const result = await request(`${origin}${path}${buildQuery(params)}`, what);
      return parse<T>(result, what);
    },
    async getAll<T>(path: string, params: Record<string, QueryValue | undefined> = {}, what = "that") {
      const all: T[] = [];
      let url: string | null = `${origin}${path}${buildQuery({ per_page: 100, ...params })}`;
      for (let page = 0; url && page < 200; page++) {
        const result = await request(url, what);
        const batch = parse<T[] | unknown>(result, what);
        if (!Array.isArray(batch)) throw new CanvasError(`Canvas returned an unexpected answer for ${what}.`);
        all.push(...(batch as T[]));
        const next = nextLink(result.headers);
        // Only follow pagination back to the same Canvas instance.
        url = next && next.startsWith(origin) ? next : null;
      }
      return all;
    },
    async download(url: string, maxBytes: number) {
      try {
        const result = await fetchOnce(url, {}, maxBytes);
        return { body: result.body, contentType: result.contentType };
      } catch (error) {
        throw toCanvasError(error, "a file");
      }
    },
    async fetchSameOrigin(url: string, maxBytes: number) {
      const absolute = url.startsWith("/") ? `${origin}${url}` : url;
      if (new URL(absolute).origin !== origin) throw new CanvasError("Not a Canvas address", 400);
      try {
        const result = await fetchOnce(absolute, { Authorization: `Bearer ${token}` }, maxBytes);
        return { body: result.body, contentType: result.contentType };
      } catch (error) {
        throw toCanvasError(error, "an embedded file");
      }
    },
  };
}
