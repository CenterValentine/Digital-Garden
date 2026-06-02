/**
 * Per-user tenancy permissions.
 *
 * Right now there's only one: who can claim custom hostnames (e.g.
 * mysite.com). Without a gate, any signed-up user could POST to the hosts
 * endpoint and squat on unclaimed domains by routing them through Vercel.
 *
 * Two paths to "yes":
 *   1. UserRole.owner and UserRole.admin are implicitly granted — both
 *      are platform-trust roles. A custom-host claim grafts a domain
 *      onto the platform's Vercel project, which carries operational
 *      responsibility; admin and owner are the "trusted enough" tiers.
 *   2. UserRole.member and below need an explicit `canClaimCustomHosts`
 *      flag flipped to true. Owner controls who gets this — for now via
 *      Prisma Studio, eventually via an admin UI.
 *
 * The narrower flag stays useful: it lets the owner grant individual
 * members the capability without promoting them to admin (which carries
 * broader user-management and audit-log responsibilities).
 */

export type PermissionUser = {
  role: string;
  canClaimCustomHosts: boolean;
};

export function canClaimCustomHosts(user: PermissionUser): boolean {
  if (user.role === "owner" || user.role === "admin") return true;
  return user.canClaimCustomHosts === true;
}

/**
 * User-facing explanation of why an action was denied. Returned by the
 * API so the UI can render the same copy without duplicating policy.
 */
export const CUSTOM_HOST_DENIED_MESSAGE =
  "Custom domains aren't enabled for your account. Your site is reachable at its subdomain and subpath URLs. Ask the platform owner to enable custom domains for your account.";
