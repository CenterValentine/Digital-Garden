import { cookies, headers } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import type { SessionData, User } from "./types";

import { prisma } from "@/lib/database/client";
import {
  getCachedSession,
  invalidateCachedSession,
  setCachedSession,
} from "./session-cache";
import { logger } from "@/lib/core/logger";

// Renew when less than this much time remains on the session
const SESSION_RENEW_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// Renew when less than this much time remains on the session
const SESSION_RENEW_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

const SESSION_COOKIE_NAME = "session_token";
const EMBED_SESSION_HEADER = "x-embed-session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Create a new session for a user
 * @param userId - User ID
 * @returns Session data
 */
export async function createSession(userId: string): Promise<SessionData> {
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
        },
      },
    },
  });

  // Set HTTP-only cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return {
    user: session.user as Omit<User, "passwordHash">,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

/**
 * Validate a session token and return session data
 * @param token - Session token (optional, will read from cookie if not provided)
 * @returns Session data or null if invalid/expired
 */
export async function validateSession(
  token?: string
): Promise<SessionData | null> {
  let sessionToken = token;

  if (!sessionToken) {
    const cookieStore = await cookies();
    sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  }

  // Fallback: X-Embed-Session header. Used by the browser-extension iframe
  // when it runs in a cross-site context where the session_token cookie is
  // blocked by the browser (e.g. Vivaldi strict tracking protection).
  // The embed layout's inline script wraps window.fetch to inject this header.
  if (!sessionToken) {
    const headerStore = await headers();
    sessionToken = headerStore.get(EMBED_SESSION_HEADER) ?? undefined;
  }

  if (!sessionToken) {
    logger.warn({
      layer: "auth",
      event: "session_validate:no_token",
      summary: "validateSession: no session token in cookie or embed header — returning null",
    });
    return null;
  }

  // Per-process cache absorbs the dominant cost in the auth:session_lookup
  // span. Hits are <1ms; misses fall through to the DB query below and
  // populate the cache for next time. TTL + session.expiresAt re-checks
  // are handled inside getCachedSession.
  const cached = getCachedSession(sessionToken);
  if (cached !== undefined) {
    return cached;
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (!session) {
    // Negative-cache the bad token so spammed invalid tokens don't each
    // cost a DB hit. The TTL bounds correctness if the token is ever
    // legitimately created later.
    setCachedSession(sessionToken, null);
    logger.warn({
      layer: "auth",
      event: "session_validate:not_in_db",
      summary: "validateSession: token not found in DB — negative-cached and returning null",
      attrs: { tokenPrefix: sessionToken.slice(0, 8) },
    });
    return null;
  }

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    logger.warn({
      layer: "auth",
      event: "session_validate:expired",
      summary: "validateSession: session found but expired — deleting and returning null",
      attrs: {
        sessionId: session.id,
        expiresAt: session.expiresAt.toISOString(),
        now: new Date().toISOString(),
      },
    });
    // Delete expired session
    await prisma.session.delete({ where: { id: session.id } });
    invalidateCachedSession(sessionToken);
    return null;
  }

  const result: SessionData = {
    user: session.user as Omit<User, "passwordHash">,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };

  // Rolling renewal: extend the session if it's approaching expiry.
  // This ensures active users never get signed out due to a stale session.
  // We only touch the DB when renewal is needed (bounded by the threshold).
  if (session.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    try {
      const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: newExpiry },
      });
      result.expiresAt = newExpiry;

      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        expires: newExpiry,
        path: "/",
      });
    } catch {
      // Renewal is best-effort — don't break auth if the update fails.
    }
  }

  setCachedSession(sessionToken, result);
  return result;
}

/**
 * Delete a session
 * @param token - Session token (optional, will read from cookie if not provided)
 */
export async function deleteSession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    // Drop the local cache entry first so an in-flight request on this
    // instance can't read the just-revoked session from cache after the
    // DB delete. Other instances catch up via TTL expiry.
    invalidateCachedSession(sessionToken);
    await prisma.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  // Clear cookie
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Get session from cookie
 * @returns Session data or null
 */
export async function getSession(): Promise<SessionData | null> {
  return validateSession();
}
