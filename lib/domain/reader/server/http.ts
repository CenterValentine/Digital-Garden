/**
 * Outbound HTTP for the reader's book sources (server-only).
 *
 * Catalog URLs are user-supplied (custom OPDS feeds), so every hop is
 * SSRF-checked: `validateExternalUrl` on the URL, a DNS lookup whose every
 * resolved address must also pass, and manual redirect following that
 * re-validates each Location (closes the redirect-to-internal gap noted in
 * external-validation.ts). Responses are size-capped and time-limited.
 */

import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { validateExternalUrl } from "@/lib/domain/content/external-validation";

export class ReaderFetchError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

const USER_AGENT =
  "DigitalGardenReader/1.0 (+https://github.com/CenterValentine/Digital-Garden)";
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 20_000;
/** Feeds / JSON. */
export const MAX_FEED_BYTES = 8 * 1024 * 1024;
/** Book files — matches the 100 MB upload cap. */
export const MAX_BOOK_BYTES = 100 * 1024 * 1024;

async function assertPublicHost(url: URL): Promise<void> {
  const verdict = validateExternalUrl(url.toString(), { allowHttp: true });
  if (!verdict.valid) {
    throw new ReaderFetchError(verdict.error ?? "URL not allowed", 400);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // literal IPs were checked above
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new ReaderFetchError(`Could not resolve ${host}`, 502);
  }
  for (const { address, family } of addresses) {
    const literal = family === 6 ? `http://[${address}]/` : `http://${address}/`;
    if (!validateExternalUrl(literal, { allowHttp: true }).valid) {
      throw new ReaderFetchError(
        `${host} resolves to a private or reserved address`,
        400
      );
    }
  }
}

export interface ReaderFetchOptions {
  accept?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface ReaderFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    throw new ReaderFetchError(
      `Response too large (${Math.round(declared / 1024 / 1024)} MB)`,
      413
    );
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ReaderFetchError("Response too large", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readerFetch(
  input: string,
  options: ReaderFetchOptions = {}
): Promise<ReaderFetchResult> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ReaderFetchError("Invalid URL", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);
      const response = await fetch(url, {
        method: options.method ?? "GET",
        body: options.body,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...(options.accept ? { Accept: options.accept } : {}),
          ...options.headers,
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new ReaderFetchError("Redirect without location");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) {
        throw new ReaderFetchError(
          `${url.hostname} answered ${response.status}`,
          response.status === 401 || response.status === 403 ? 401 : 502
        );
      }
      const body = await readCapped(response, options.maxBytes ?? MAX_FEED_BYTES);
      return {
        url: url.toString(),
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body,
      };
    }
    throw new ReaderFetchError("Too many redirects");
  } catch (error) {
    if (error instanceof ReaderFetchError) throw error;
    if ((error as { name?: string }).name === "AbortError") {
      throw new ReaderFetchError(`${url.hostname} timed out`, 504);
    }
    throw new ReaderFetchError(
      error instanceof Error ? error.message : "Fetch failed"
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function readerFetchJson<T>(
  url: string,
  options: ReaderFetchOptions = {}
): Promise<T> {
  const result = await readerFetch(url, {
    accept: "application/json",
    ...options,
  });
  try {
    return JSON.parse(result.body.toString("utf8")) as T;
  } catch {
    throw new ReaderFetchError(`${new URL(result.url).hostname} returned invalid JSON`);
  }
}
