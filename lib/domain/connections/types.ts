/**
 * Connections domain — DTOs and errors.
 *
 * Enumeration safety shapes these types: the sent-invite DTO never exposes
 * whether the identifier resolved to a real account, and declined invites
 * render as "pending" to the sender until they expire.
 */

export interface SentInviteDTO {
  id: string;
  /** The email/username exactly as the inviter typed it (lowercased). */
  identifier: string;
  message: string | null;
  /** Always "pending" until expiry — declines are never revealed. */
  displayStatus: "pending";
  createdAt: string;
  expiresAt: string;
}

export interface ReceivedInviteDTO {
  id: string;
  inviterUserId: string;
  inviterUsername: string;
  message: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface InviteListResult {
  sent: SentInviteDTO[];
  received: ReceivedInviteDTO[];
}

export interface ConnectionDTO {
  id: string;
  /** The other user in the pair. */
  userId: string;
  username: string;
  connectedAt: string;
}

export interface BlockDTO {
  id: string;
  userId: string;
  username: string;
  createdAt: string;
}

export class ConnectionInviteNotFoundError extends Error {
  constructor() {
    super("Invite not found");
    this.name = "ConnectionInviteNotFoundError";
  }
}

export class ConnectionNotFoundError extends Error {
  constructor() {
    super("Connection not found");
    this.name = "ConnectionNotFoundError";
  }
}

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class InvalidConnectionActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionActionError";
  }
}
