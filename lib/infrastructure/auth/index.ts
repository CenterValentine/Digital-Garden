/**
 * Authentication Module
 *
 * Centralized authentication with OAuth, sessions, password hashing, and middleware.
 */

// Types and validation
export type {
  UserRole,
  User,
  Session,
  Account,
  SessionData,
  SignUpInput,
  SignInInput,
  AuthError,
  ApiError,
  ApiResponse,
  OAuthProvider,
} from "./types";

export {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  isUserRole,
  extractUsername,
  hasRole,
} from "./types";

// Session management
export {
  createSession,
  validateSession,
  deleteSession,
  getSession,
} from "./session";

// OAuth providers
export {
  verifyGoogleToken,
  exchangeCodeForTokens,
  findOrCreateOAuthUser,
  linkOAuthAccount,
} from "./oauth";

// Password utilities
export {
  hashPassword,
  verifyPassword,
} from "./password";

// Middleware and guards
export {
  getCurrentSession,
  getCurrentUser,
  requireAuth,
  requireRole,
} from "./middleware";
