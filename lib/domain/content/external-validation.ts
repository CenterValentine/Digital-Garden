/**
 * External URL Validation Utilities
 *
 * Validates external URLs for security and allowlist compliance.
 * Phase 2: ExternalPayload support
 */

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an external URL for basic security requirements
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

    // Protocol validation: HTTPS-only by default
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return {
        valid: false,
        error: "URL must use HTTP or HTTPS protocol",
      };
    }

    if (parsed.protocol === "http:" && !options.allowHttp) {
      return {
        valid: false,
        error: "URL must use HTTPS. HTTP is disabled for security.",
      };
    }

    // Hostname validation: must have a valid hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return {
        valid: false,
        error: "URL must have a valid hostname",
      };
    }

    // Block localhost and internal IPs (basic check)
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
    ) {
      return {
        valid: false,
        error: "Internal/localhost URLs are not allowed",
      };
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
