import { getSession } from "./session";
import type { SessionData, User } from "./types";

/**
 * Get current session (server-side)
 * @returns Session data or null
 */
export async function getCurrentSession(): Promise<SessionData | null> {
  return getSession();
}

/**
 * Get current user (server-side)
 * @returns User data or null
 */
export async function getCurrentUser(): Promise<Omit<
  User,
  "passwordHash"
> | null> {
  const session = await getCurrentSession();
  return session?.user || null;
}

/**
 * Require authentication - throws if not authenticated
 * @returns Session data
 * @throws Error if not authenticated
 */
export async function requireAuth(): Promise<SessionData> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Authentication required");
  }
  return session;
}

/**
 * Require specific role - throws if user doesn't have required role
 * @param role - Required role
 * @returns Session data with user having required role
 * @throws Error if not authenticated or insufficient permissions
 */
export async function requireRole(
  role: "owner" | "admin" | "member" | "guest"
): Promise<SessionData> {
  const session = await requireAuth();

  const roleHierarchy: Record<string, number> = {
    guest: 0,
    member: 1,
    admin: 2,
    owner: 3,
  };

  const userRoleLevel = roleHierarchy[session.user.role] || 0;
  const requiredRoleLevel = roleHierarchy[role] || 0;

  if (userRoleLevel < requiredRoleLevel) {
    throw new Error(`Insufficient permissions. Required role: ${role}`);
  }

  return session;
}
