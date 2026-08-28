import { OAuth2Client } from "google-auth-library";
import type { User, Account, OAuthProvider } from "./types";

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { createPersonalTenantForUser } from "@/lib/domain/tenancy";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Machine-readable Google auth failure classification.
 * - "not_linked"      — user has never connected Google; fix is "Connect".
 * - "reauth_required" — the stored refresh token is dead (revoked/expired);
 *                       the ONLY fix is sending the user back through the
 *                       consent screen (`/api/auth/google?reauth=1`).
 * - "transient"       — network blip / Google 5xx; fix is "try again".
 *                       Must NOT trigger a re-consent prompt.
 *
 * Client components must not import this module (it pulls Prisma); the
 * client-side companion is ./google-reauth-client.ts, which matches these
 * codes by string.
 */
export type GoogleAuthErrorCode = "not_linked" | "reauth_required" | "transient";

export class GoogleAuthError extends Error {
  readonly code: GoogleAuthErrorCode;

  constructor(code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

/**
 * Strict classifier (owner decision, 2026-08): only Google's explicit
 * `invalid_grant` response means the refresh token is dead. Everything else
 * (DNS failure, Google 500, unexpected error shape) is transient — telling a
 * user to re-consent over a network blip trains them to distrust the message.
 * google-auth-library surfaces the OAuth error body as a GaxiosError at
 * `error.response.data.error`.
 */
function isInvalidGrant(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const data = (error as { response?: { data?: { error?: unknown } } })
    .response?.data;
  if (typeof data !== "object" || data === null) return false;
  return (data as { error?: unknown }).error === "invalid_grant";
}

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  // Module-load-time warning — emits with trace_id="no-trace" by design.
  logger.warn({
    layer: "auth",
    event: "oauth_config:missing",
    summary: "Google OAuth credentials not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)",
  });
}

/**
 * Verify Google ID token and return user information
 * @param idToken - Google ID token
 * @returns Google user information
 */
export async function verifyGoogleToken(idToken: string): Promise<{
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}> {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google OAuth not configured");
  }

  const client = new OAuth2Client(GOOGLE_CLIENT_ID);

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("Invalid token payload");
    }

    return {
      sub: payload.sub,
      email: payload.email || "",
      email_verified: payload.email_verified || false,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    throw new Error(`Failed to verify Google token: ${error}`);
  }
}

/**
 * Exchange authorization code for tokens
 * @param code - Authorization code from Google
 * @param redirectUri - Redirect URI used in OAuth flow
 * @returns Access token and ID token
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken: string; refreshToken?: string; expiresIn?: number; scope?: string }> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }

  const client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token || !tokens.access_token) {
      throw new Error("Failed to get tokens from Google");
    }

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token || undefined,
      expiresIn: tokens.expiry_date
        ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
        : 3600, // Default to 1 hour
      scope: tokens.scope || undefined,
    };
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }
}

/**
 * Find or create user from OAuth provider
 * @param provider - OAuth provider
 * @param providerAccountId - Provider account ID
 * @param email - User email
 * @param username - Username (extracted from email)
 * @param accessToken - OAuth access token
 * @param refreshToken - OAuth refresh token
 * @param expiresIn - Token expiration time in seconds
 * @returns User and Account
 */
export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  providerAccountId: string,
  email: string,
  username: string,
  accessToken?: string,
  refreshToken?: string,
  expiresIn?: number,
  scope?: string
): Promise<{ user: User; account: Account }> {
  // Check if account already exists
  const existingAccount = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingAccount) {
    // Update existing account with new tokens
    if (accessToken) {
      const updatedAccount = await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          accessToken,
          refreshToken: refreshToken || existingAccount.refreshToken,
          scope: scope || existingAccount.scope,
          expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        },
        include: {
          user: true,
        },
      });
      return {
        user: updatedAccount.user as User,
        account: updatedAccount as unknown as Account,
      };
    }
    return {
      user: existingAccount.user as User,
      account: existingAccount as unknown as Account,
    };
  }

  // Check if user exists with this email
  let user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // Create new user
    user = await prisma.user.create({
      data: {
        email,
        username,
        role: "guest",
        passwordHash: null, // OAuth users don't have passwords
      },
    });

    // Auto-provision personal tenant so publishing works on first use.
    // Non-fatal — admin can re-run scripts/backfill-tenants.ts to repair
    // orphans. Only runs for new users (not on re-login or token refresh).
    try {
      await createPersonalTenantForUser(user.id, user.username);
    } catch (err) {
      logger.error({
        layer: "auth",
        event: "tenancy:personal_tenant:provision_failed",
        summary: "could not auto-create tenant on OAuth signup (non-fatal)",
        attrs: { user_id: user.id, provider },
        error: err,
      });
    }
  }

  // Create account link with tokens
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      scope,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    },
  });

  return {
    user: user as User,
    account: account as Account,
  };
}

/**
 * Refresh Google access token using refresh token
 * @param refreshToken - Google refresh token
 * @returns New access token, refresh token (if rotated), and expiration time
 */
export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth not configured");
  }

  const client = new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  // Set the refresh token
  client.setCredentials({
    refresh_token: refreshToken,
  });

  try {
    // Request new access token
    const { credentials } = await client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Failed to refresh access token");
    }

    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || undefined, // Google may rotate refresh token
      expiresIn: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600, // Default to 1 hour
    };
  } catch (error) {
    if (isInvalidGrant(error)) {
      throw new GoogleAuthError(
        "reauth_required",
        "Google access has expired. Reconnect Google to continue."
      );
    }
    throw new GoogleAuthError(
      "transient",
      "Couldn't reach Google. Please try again."
    );
  }
}

/**
 * Get valid Google access token, refreshing if expired
 * @param userId - User ID
 * @returns Valid access token
 * @throws Error if no Google account linked or refresh fails
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (!account || !account.accessToken) {
    throw new GoogleAuthError("not_linked", "No Google account linked");
  }

  // Check if token is still valid (with 5-minute buffer)
  const now = new Date();
  const expiresAt = account.expiresAt ? new Date(Number(account.expiresAt)) : null;

  if (expiresAt && expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
    // Token is still valid
    return account.accessToken;
  }

  // Token is expired or about to expire, refresh it
  if (!account.refreshToken) {
    throw new GoogleAuthError(
      "reauth_required",
      "Google connection needs to be renewed. Reconnect Google to continue."
    );
  }

  try {
    const { accessToken, refreshToken, expiresIn } = await refreshGoogleAccessToken(
      account.refreshToken
    );

    // Update account with new tokens
    await prisma.account.update({
      where: { id: account.id },
      data: {
        accessToken,
        refreshToken: refreshToken || account.refreshToken, // Keep old refresh token if not rotated
        expiresAt: new Date(Date.now() + expiresIn * 1000),
      },
    });

    return accessToken;
  } catch (error) {
    // refreshGoogleAccessToken already classified dead-key vs transient;
    // pass its verdict through. Anything else (e.g. the Prisma update
    // failing) is transient — the key itself may be fine.
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError(
      "transient",
      "Couldn't reach Google. Please try again."
    );
  }
}

/**
 * Link OAuth account to existing user
 * @param userId - User ID
 * @param provider - OAuth provider
 * @param providerAccountId - Provider account ID
 * @param accessToken - Access token
 * @param refreshToken - Refresh token (optional)
 * @param expiresAt - Token expiration date (optional)
 * @returns Account
 */
export async function linkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  providerAccountId: string,
  accessToken?: string,
  refreshToken?: string,
  expiresAt?: Date
): Promise<Account> {
  const account = await prisma.account.create({
    data: {
      userId,
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      expiresAt,
    },
  });

  return account as Account;
}

/**
 * Get Google OAuth account for a user
 */
export async function getGoogleAccount(userId: string) {
  return prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
}

/**
 * Check if a scope string contains a target scope
 */
export function hasGoogleScope(scope: string | null | undefined, targetScope: string): boolean {
  if (!scope) return false;
  return scope.split(" ").includes(targetScope);
}
