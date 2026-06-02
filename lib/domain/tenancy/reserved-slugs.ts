/**
 * Reserved tenant slugs.
 *
 * Phase 14: subdomain slugs that should not be claimable by users.
 *
 * Slug uniqueness is global (Tenant.slug is @unique), and subdomains on
 * PLATFORM_DOMAIN auto-resolve from slugs. So a user creating a tenant
 * with slug "admin" would immediately own admin.<PLATFORM_DOMAIN> — bad
 * for several reasons (impersonation, conflicting with future admin
 * surfaces, brand confusion).
 *
 * This list is intentionally conservative — easier to add words later
 * than to free up ones already taken. Grouped by category for
 * grep-ability when extending.
 *
 * NOT enforced retroactively. Existing tenants with reserved slugs (if
 * any survived the initial seed) keep them. The check fires only on
 * NEW tenant creation and slug-rename attempts.
 */

const RESERVED_SLUGS_RAW = [
  // System surfaces & route prefixes
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "settings",
  "account",
  "dashboard",
  "home",
  "me",
  "u", // /u/<slug> subpath prefix — can't have tenant slug "u" or links break
  "user",
  "users",

  // Web infrastructure subdomains
  "www",
  "mail",
  "email",
  "ftp",
  "cdn",
  "assets",
  "static",
  "media",

  // Operational / status
  "status",
  "health",
  "monitor",
  "metrics",

  // Brand (own these so nobody else can)
  "notetrellis",
  "note-trellis",
  "davidvalentine",
  "david-valentine",

  // Legal / policy pages
  "terms",
  "tos",
  "privacy",
  "legal",
  "policy",
  "cookies",
  "gdpr",

  // Content surfaces a platform typically wants
  "blog",
  "docs",
  "documentation",
  "wiki",
  "help",
  "support",
  "contact",
  "about",
  "pricing",
  "billing",

  // Common reserved words for "this won't be a tenant"
  "test",
  "demo",
  "example",
  "staging",
  "dev",
  "prod",
  "production",
];

const RESERVED_SLUGS = new Set(
  RESERVED_SLUGS_RAW.map((s) => s.toLowerCase()),
);

/**
 * Check whether a slug is on the reserved list.
 * Case-insensitive — slug pattern is already lowercase but defensive lower
 * doesn't hurt.
 */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

/**
 * Snapshot of reserved words (for UI display, e.g. "these slugs aren't
 * available" hints). Returns a sorted copy so callers don't accidentally
 * mutate the set.
 */
export function listReservedSlugs(): string[] {
  return [...RESERVED_SLUGS].sort();
}

/**
 * Human-readable rejection message returned by the API + shown by the UI.
 */
export const RESERVED_SLUG_MESSAGE =
  "That slug is reserved for system use. Try a different one.";
