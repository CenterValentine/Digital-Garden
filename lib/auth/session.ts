import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import type { SessionData, User } from "./types";

import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE_NAME = "session_token";
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
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
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
    return null;
  }

  // Check if session is expired
  if (new Date() > session.expiresAt) {
    // Delete expired session
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return {
    user: session.user as Omit<User, "passwordHash">,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

/**
 * Delete a session
 * @param token - Session token (optional, will read from cookie if not provided)
 */
export async function deleteSession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
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
