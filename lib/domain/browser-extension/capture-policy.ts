/**
 * Capture policy (BROWSER-REACH B3-B) — the safety gate shared by every
 * automatic capture path: settle-then-associate (Phase B) and the
 * browser-history page-view log (Phase C).
 *
 * Pure and dependency-free on purpose, so the *exact same* decision runs in the
 * extension service worker, in the panel embed, and again server-side before
 * anything is persisted. Client-side gating is a courtesy (fewer requests); the
 * server call is the authority — never trust a client that says "safe."
 *
 * Design intent (owner, 2026-07-23):
 *  - Auto-capture is conservative by default; this module is what makes it so.
 *  - We must NEVER capture Digital Garden's own pages as "external" content.
 *  - Blatantly sensitive surfaces (mailboxes, auth/login, password managers)
 *    are blocked outright, on top of a user-editable denylist.
 */

/** Why a page was rejected. `undefined` reason ⇒ the page is allowed. */
export type CaptureRejectionReason =
  | "invalid-url"
  | "non-web-scheme"
  | "browser-internal"
  | "digital-garden"
  | "sensitive"
  | "denylisted";

export interface CaptureDecision {
  capture: boolean;
  reason?: CaptureRejectionReason;
}

export interface CapturePolicyOptions {
  /**
   * Origins (or bare hostnames) that ARE Digital Garden itself. A page on any
   * of these is our own content and must never be captured as external.
   * Pass the app base URL(s) — dev (`http://localhost:3017`) and prod
   * (`https://davidvalentine.org`) — plus any custom tenant hosts.
   */
  appOrigins?: string[];
  /**
   * User-authored denylist. Each entry matches if it appears as a substring of
   * the page's hostname OR of the full lowercased URL. Empty/whitespace entries
   * are ignored so a stray blank line can't blackhole every page.
   */
  userDenylist?: string[];
}

/**
 * Hosts we always treat as sensitive mailboxes. Matched as a hostname suffix so
 * `mail.google.com` also covers regional variants that end the same way.
 */
const WEBMAIL_HOST_SUFFIXES: readonly string[] = [
  "mail.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
  "mail.yahoo.com",
  "mail.proton.me",
  "mail.aol.com",
  "mail.fastmail.com",
  "mail.zoho.com",
  "mail.tutanota.com",
];

/** Dedicated identity / auth / password-manager hosts. Suffix-matched. */
const SENSITIVE_HOST_SUFFIXES: readonly string[] = [
  "accounts.google.com",
  "login.microsoftonline.com",
  "login.live.com",
  "appleid.apple.com",
  "id.apple.com",
  "signin.aws.amazon.com",
  "1password.com",
  "bitwarden.com",
  "lastpass.com",
  "dashlane.com",
];

/**
 * Hostname *prefixes* that reliably indicate an auth surface. Kept deliberately
 * narrow (leading label only) so we don't nuke pages like `author.example.com`.
 */
const SENSITIVE_HOST_PREFIXES: readonly string[] = [
  "accounts.",
  "login.",
  "signin.",
  "sso.",
  "auth.",
  "id.",
  "oauth.",
];

/**
 * First path segment values that indicate an auth flow. Matched on the leading
 * segment only (e.g. `/login`, `/oauth2/...`) to avoid false hits on content
 * like `/blog/how-i-login`.
 */
const SENSITIVE_FIRST_PATH_SEGMENTS: readonly string[] = [
  "login",
  "signin",
  "sign-in",
  "oauth",
  "oauth2",
  "sso",
  "logout",
  "session",
];

/** Chrome Web Store etc. — http(s) pages that are still "browser chrome." */
const BROWSER_INTERNAL_HOST_SUFFIXES: readonly string[] = [
  "chromewebstore.google.com",
  "chrome.google.com", // /webstore
  "addons.mozilla.org",
  "microsoftedge.microsoft.com", // /addons
];

function safeParseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

/** Normalize an origin/host input into a comparable lowercase hostname. */
function toHostname(originOrHost: string): string | null {
  const trimmed = originOrHost.trim().toLowerCase();
  if (!trimmed) return null;
  // Already a bare host (no scheme, no slash)?
  if (!trimmed.includes("://") && !trimmed.includes("/")) return trimmed;
  const parsed = safeParseUrl(trimmed);
  return parsed?.hostname ?? null;
}

function hostMatchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith("." + suffix);
}

/** True for anything that isn't a normal fetchable web page. */
export function isNonWebScheme(url: URL): boolean {
  return url.protocol !== "http:" && url.protocol !== "https:";
}

/** Chrome Web Store / add-on gallery pages — real http, but off-limits. */
export function isBrowserInternalUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (
    host === "chrome.google.com" &&
    !url.pathname.toLowerCase().startsWith("/webstore")
  ) {
    // Google Sites etc. also live on chrome.google.com — only the store is out.
    return false;
  }
  return BROWSER_INTERNAL_HOST_SUFFIXES.some((s) => hostMatchesSuffix(host, s));
}

/** Mailboxes, auth/login surfaces, password managers. */
export function isSensitiveUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();

  if (WEBMAIL_HOST_SUFFIXES.some((s) => hostMatchesSuffix(host, s))) return true;
  if (SENSITIVE_HOST_SUFFIXES.some((s) => hostMatchesSuffix(host, s)))
    return true;
  if (SENSITIVE_HOST_PREFIXES.some((p) => host.startsWith(p))) return true;

  const firstSegment = url.pathname.toLowerCase().split("/").filter(Boolean)[0];
  if (firstSegment && SENSITIVE_FIRST_PATH_SEGMENTS.includes(firstSegment))
    return true;

  return false;
}

/** True when the page belongs to Digital Garden itself. */
export function isDigitalGardenUrl(url: URL, appOrigins: string[]): boolean {
  const host = url.hostname.toLowerCase();
  for (const origin of appOrigins) {
    const appHost = toHostname(origin);
    if (appHost && (host === appHost || hostMatchesSuffix(host, appHost))) {
      return true;
    }
  }
  return false;
}

/** Substring match of a user denylist entry against hostname or full URL. */
export function matchesUserDenylist(url: URL, userDenylist: string[]): boolean {
  const host = url.hostname.toLowerCase();
  const href = url.href.toLowerCase();
  for (const raw of userDenylist) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue; // ignore blanks — never let one blackhole everything
    if (host.includes(entry) || href.includes(entry)) return true;
  }
  return false;
}

/**
 * The single decision every automatic capture path must call. Order matters:
 * structural rejections (bad/non-web/browser-internal) first, then the
 * "our own content" guard, then sensitivity, then the user's denylist.
 */
export function shouldCapturePage(
  rawUrl: string,
  options: CapturePolicyOptions = {}
): CaptureDecision {
  const url = safeParseUrl(rawUrl);
  if (!url) return { capture: false, reason: "invalid-url" };
  if (isNonWebScheme(url)) return { capture: false, reason: "non-web-scheme" };
  if (isBrowserInternalUrl(url))
    return { capture: false, reason: "browser-internal" };
  if (isDigitalGardenUrl(url, options.appOrigins ?? []))
    return { capture: false, reason: "digital-garden" };
  if (isSensitiveUrl(url)) return { capture: false, reason: "sensitive" };
  if (matchesUserDenylist(url, options.userDenylist ?? []))
    return { capture: false, reason: "denylisted" };
  return { capture: true };
}
