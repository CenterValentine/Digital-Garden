/**
 * External URL Validation Utilities
 *
 * Validates external URLs for security and allowlist compliance.
 * Phase 2: ExternalPayload support
 */

import { isIP } from "node:net";

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const INTERNAL_HOST_ERROR =
  "Internal, private, or reserved hosts are not allowed";

/**
 * Normalize an IPv4 hostname to dotted-decimal form. Returns null if the
 * input isn't an IPv4 representation. Accepts:
 *   - Dotted decimal:  "127.0.0.1"        → "127.0.0.1"
 *   - Single decimal:  "2130706433"       → "127.0.0.1"
 *   - Single hex:      "0x7f000001"       → "127.0.0.1"
 *   - Single octal:    "017700000001"     → "127.0.0.1"
 *
 * Attackers historically use the alternate forms to slip past prefix-based
 * blocklists (e.g. `http://2130706433/` reaches 127.0.0.1 even though the
 * hostname string doesn't start with "127.").
 */
function normalizeIpv4(host: string): string | null {
  if (isIP(host) === 4) return host;

  const isHex = host.startsWith("0x") || host.startsWith("0X");
  const isOctal =
    !isHex &&
    host.length > 1 &&
    host.startsWith("0") &&
    /^0[0-7]+$/.test(host);
  const isDec = !isHex && !isOctal && /^\d+$/.test(host);

  if (!isHex && !isOctal && !isDec) return null;

  const radix = isHex ? 16 : isOctal ? 8 : 10;
  const payload = isHex ? host.slice(2) : host;
  const num = parseInt(payload, radix);
  if (!Number.isInteger(num) || num < 0 || num > 0xffffffff) return null;

  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ].join(".");
}

/**
 * True if the given dotted-decimal IPv4 falls in a range we never want to
 * reach via the external-link fetcher:
 *   - 0.0.0.0/8        unspecified / "this network"
 *   - 10.0.0.0/8       private
 *   - 100.64.0.0/10    CGNAT
 *   - 127.0.0.0/8      loopback
 *   - 169.254.0.0/16   link-local (includes AWS/GCP/Azure metadata IPs)
 *   - 172.16.0.0/12    private
 *   - 192.168.0.0/16   private
 *   - 224.0.0.0/4      multicast / reserved
 */
function isInternalIpv4(dottedHost: string): boolean {
  const parts = dottedHost.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/**
 * True if the given hostname is an IPv6 address we don't want to reach.
 *   - ::1, ::            loopback + unspecified
 *   - fe80::/10          link-local
 *   - fc00::/7           unique-local
 *   - ff00::/8           multicast
 *   - ::ffff:x.x.x.x     IPv4-mapped — re-checked through IPv4 rules
 */
function isInternalIpv6(host: string): boolean {
  if (isIP(host) !== 6) return false;
  const lower = host.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (/^f[cd]/.test(lower)) return true;
  if (lower.startsWith("ff")) return true;

  // ::ffff:x.x.x.x (dotted form)
  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) {
    const normalized = normalizeIpv4(mappedDotted[1]!);
    if (normalized && isInternalIpv4(normalized)) return true;
  }
  // ::ffff:HHHH:HHHH (hex form — Node's URL parser normalizes to this)
  const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1]!, 16);
    const low = parseInt(mappedHex[2]!, 16);
    const dotted = [
      (high >>> 8) & 0xff,
      high & 0xff,
      (low >>> 8) & 0xff,
      low & 0xff,
    ].join(".");
    if (isInternalIpv4(dotted)) return true;
  }
  return false;
}

/**
 * True if the hostname looks like a localhost name. Catches "localhost"
 * (RFC 6761) and any subdomain thereof.
 */
function isLocalhostName(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost");
}

/**
 * Validates an external URL for basic security requirements.
 *
 * Closes the obvious SSRF vectors at the validation layer: cloud metadata
 * IPs (169.254.169.254), localhost/loopback in IPv4 and IPv6 forms, all
 * RFC1918 private ranges, CGNAT, link-local, ULA, multicast, plus the
 * alternate integer/hex/octal IPv4 representations that slip past
 * prefix-based blocklists.
 *
 * What this DOES NOT close (tracked as follow-up):
 *   - DNS-rebinding: hostname resolves to a public IP here, then to a
 *     private IP at fetch time. Defending requires resolving the hostname
 *     to a pinned IP and using a custom undici dispatcher for the fetch.
 *   - Redirect-to-internal: the fetcher follows redirects by default; a
 *     malicious public server can 302 to http://169.254.169.254. The
 *     redirect target needs to be re-validated through this same logic.
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns Validation result with error message if invalid
 */
export function validateExternalUrl(
  url: string,
  options: {
    allowHttp?: boolean;
  } = {}
): UrlValidationResult {
  try {
    const parsed = new URL(url);

    if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
      return { valid: false, error: "URL must use HTTP or HTTPS protocol" };
    }
    if (parsed.protocol === "http:" && !options.allowHttp) {
      return {
        valid: false,
        error: "URL must use HTTPS. HTTP is disabled for security.",
      };
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return { valid: false, error: "URL must have a valid hostname" };
    }

    const rawHostname = parsed.hostname.toLowerCase();
    // Node's WHATWG URL parser keeps the brackets around IPv6 hostnames
    // ("[::1]" rather than "::1"). Strip them before pattern-matching.
    const hostname =
      rawHostname.startsWith("[") && rawHostname.endsWith("]")
        ? rawHostname.slice(1, -1)
        : rawHostname;

    if (isLocalhostName(hostname)) {
      return { valid: false, error: INTERNAL_HOST_ERROR };
    }

    const normalizedIpv4 = normalizeIpv4(hostname);
    if (normalizedIpv4 && isInternalIpv4(normalizedIpv4)) {
      return { valid: false, error: INTERNAL_HOST_ERROR };
    }

    if (isInternalIpv6(hostname)) {
      return { valid: false, error: INTERNAL_HOST_ERROR };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Invalid URL format",
    };
  }
}

/**
 * Checks if a URL's hostname is allowed by the allowlist
 *
 * Supports exact matches and wildcard subdomains (*.example.com)
 *
 * @param url - The URL to check
 * @param allowlist - Array of allowed hostnames (supports wildcards)
 * @returns true if hostname is allowed
 */
export function isHostnameAllowed(
  url: string,
  allowlist: string[]
): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Empty allowlist = reject all
    if (!allowlist || allowlist.length === 0) {
      return false;
    }

    return allowlist.some((allowed) => {
      const allowedLower = allowed.toLowerCase();

      // Wildcard subdomain match: *.example.com
      if (allowedLower.startsWith("*.")) {
        const domain = allowedLower.slice(2); // Remove "*."
        return hostname === domain || hostname.endsWith(`.${domain}`);
      }

      // Exact match
      return hostname === allowedLower;
    });
  } catch (err) {
    return false;
  }
}

/**
 * Normalizes a URL for consistent storage and comparison
 *
 * @param url - The URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove trailing slashes from pathname
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Sort query parameters alphabetically
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    );
    parsed.search = sortedParams.toString();

    // Remove fragment by default (can be configurable)
    parsed.hash = "";

    return parsed.toString();
  } catch (err) {
    // If normalization fails, return original
    return url;
  }
}
