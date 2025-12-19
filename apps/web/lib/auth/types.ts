// Type definitions for authentication system
// Re-export Prisma types once they're generated
// For now, we'll define them manually until Prisma generates them

export type UserRole = "owner" | "admin" | "member" | "guest";

// These will be replaced with Prisma-generated types after migration
export type User = {
  id: string;
  username: string;
  passwordHash: string | null;
  email: string;
  role: UserRole;
};

export type Session = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

export type Account = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: bigint | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionData = {
  user: Omit<User, "passwordHash">;
  sessionId: string;
  expiresAt: Date;
};

export type SignUpInput = {
  email: string;
  password: string;
  passwordConfirm: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type AuthError = {
  code:
    | "INVALID_CREDENTIALS"
    | "USER_EXISTS"
    | "WEAK_PASSWORD"
    | "INVALID_EMAIL"
    | "OAUTH_ERROR"
    | "SESSION_EXPIRED"
    | "UNAUTHORIZED";
  message: string;
};

export type ApiError = {
  code:
    | "INVALID_CREDENTIALS"
    | "USER_EXISTS"
    | "WEAK_PASSWORD"
    | "INVALID_EMAIL"
    | "OAUTH_ERROR"
    | "SESSION_EXPIRED"
    | "UNAUTHORIZED"
    | "INVALID_REQUEST"
    | "NOT_FOUND"
    | "INTERNAL_ERROR";
  message: string;
};

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export type OAuthProvider = "google";

// Type guards
export function isValidEmail(email: unknown): email is string {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    email.length <= 255
  );
}

export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8;
}

export function isValidUsername(username: unknown): username is string {
  return (
    typeof username === "string" &&
    username.length >= 3 &&
    username.length <= 50 &&
    /^[a-zA-Z0-9_-]+$/.test(username)
  );
}

export function isUserRole(role: unknown): role is UserRole {
  return (
    typeof role === "string" &&
    (role === "owner" ||
      role === "admin" ||
      role === "member" ||
      role === "guest")
  );
}

// Helper function to extract username from email
export function extractUsername(email: string): string {
  const username = email.split("@")[0];
  // Sanitize: remove special characters, keep only alphanumeric, underscore, hyphen
  const sanitized = username.replace(/[^a-zA-Z0-9_-]/g, "");
  // Ensure length limits
  if (sanitized.length > 50) {
    return sanitized.substring(0, 50);
  }
  if (sanitized.length < 3) {
    // If too short, pad with numbers
    return sanitized + "123";
  }
  return sanitized;
}

// Role checking functions
export function hasRole(user: User, role: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    guest: 0,
    member: 1,
    admin: 2,
    owner: 3,
  };
  return roleHierarchy[user.role] >= roleHierarchy[role];
}

export function requireRole(
  user: User | null,
  role: UserRole
): asserts user is User {
  if (!user || !hasRole(user, role)) {
    throw new Error(`User must have role ${role} or higher`);
  }
}
