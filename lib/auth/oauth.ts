import { OAuth2Client } from "google-auth-library";
import type { User, Account, OAuthProvider } from "./types";

import { prisma } from "@/lib/db/prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn(
    "Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
  );
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
): Promise<{ accessToken: string; idToken: string; refreshToken?: string; expiresIn?: number }> {
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
  expiresIn?: number
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
          refreshToken,
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
  }

  // Create account link with tokens
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    },
  });

  return {
    user: user as User,
    account: account as Account,
  };
}

/**
 * Link OAuth account to existing user
 * @param userId - User ID
 * @param provider - OAuth provider
 * @param providerAccountId - Provider account ID
 * @param accessToken - Access token
 * @param refreshToken - Refresh token (optional)
 * @param expiresAt - Token expiration timestamp (optional)
 * @returns Account
 */
export async function linkOAuthAccount(
  userId: string,
  provider: OAuthProvider,
  providerAccountId: string,
  accessToken?: string,
  refreshToken?: string,
  expiresAt?: bigint
): Promise<Account> {
  const account = await prisma.account.create({
    data: {
      userId,
      provider,
      providerAccountId,
      accessToken,
      refreshToken,
      expiresAt: expiresAt as any,
    },
  });

  return account as Account;
}
