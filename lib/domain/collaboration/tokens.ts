import crypto from "node:crypto";

import type { CollaborationAccessLevel } from "./access";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 5 * 60;

export interface CollaborationTokenPayload {
  v: number;
  contentId: string;
  documentName: string;
  userId: string;
  ownerId: string;
  accessLevel: Exclude<CollaborationAccessLevel, "none">;
  readOnly: boolean;
  exp: number;
}

export function getCollaborationDocumentName(contentId: string): string {
  return `content:${contentId}`;
}

export function createCollaborationToken(
  input: Omit<CollaborationTokenPayload, "v" | "exp"> & { ttlSeconds?: number }
): string {
  const payload: CollaborationTokenPayload = {
    v: TOKEN_VERSION,
    contentId: input.contentId,
    documentName: input.documentName,
    userId: input.userId,
    ownerId: input.ownerId,
    accessLevel: input.accessLevel,
    readOnly: input.readOnly,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };

  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyCollaborationToken(token: string): CollaborationTokenPayload {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid collaboration token");
  }

  const expected = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid collaboration token signature");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CollaborationTokenPayload;
  if (payload.v !== TOKEN_VERSION) {
    throw new Error("Unsupported collaboration token version");
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Collaboration token expired");
  }
  if (payload.documentName !== getCollaborationDocumentName(payload.contentId)) {
    throw new Error("Collaboration token document mismatch");
  }
  if (!["owner", "edit", "view"].includes(payload.accessLevel)) {
    throw new Error("Invalid collaboration token access level");
  }

  return payload;
}

function sign(encodedPayload: string): string {
  return crypto
    .createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function getTokenSecret(): string {
  const secret =
    process.env.COLLABORATION_TOKEN_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.DATABASE_URL;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("COLLABORATION_TOKEN_SECRET is required in production");
  }

  return secret || "development-collaboration-token-secret";
}
