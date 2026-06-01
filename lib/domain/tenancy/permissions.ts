/**
 * Per-user tenancy permissions.
 *
 * Right now there's only one: who can claim custom hostnames (e.g.
 * mysite.com). Without a gate, any signed-up user could POST to the hosts
 * endpoint and squat on unclaimed domains by routing them through Vercel.
 *
 * Two paths to "yes":
 *   1. UserRole.owner is implicitly granted (the platform operator can
 *      always do this — no DB flag needed, baked into the helper).
 *   2. UserRole.admin and below need an explicit `canClaimCustomHosts`
 *      flag flipped to true. Owner controls who gets this — for now via
 *      Prisma Studio, eventually via an admin UI.
 *
 * Why NOT auto-grant admin: admin is a broad capability (user management,
 * audit log access). Custom-host claiming is a narrower trust signal —
 * users should be able to be one without being the other.
 */

export type PermissionUser = {
  role: string;
  canClaimCustomHosts: boolean;
};

export function canClaimCustomHosts(user: PermissionUser): boolean {
  if (user.role === "owner") return true;
  return user.canClaimCustomHosts === true;
}

/**
 * User-facing explanation of why an action was denied. Returned by the
 * API so the UI can render the same copy without duplicating policy.
 */
export const CUSTOM_HOST_DENIED_MESSAGE =
  "Custom domains aren't enabled for your account. Your site is reachable at its subdomain and subpath URLs. Ask the platform owner to enable custom domains for your account.";
