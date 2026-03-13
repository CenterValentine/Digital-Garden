/**
 * BYOK Key Types
 *
 * Types for encrypted API key storage and management.
 */

import type { AIProviderId } from "../types";

/** Shape returned by GET /api/ai/keys (key value masked) */
export interface MaskedKeyResponse {
  id: string;
  providerId: AIProviderId;
  maskedKey: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Shape for POST /api/ai/keys request body */
export interface CreateKeyRequest {
  providerId: AIProviderId;
  apiKey: string;
  label?: string;
}

/** Shape for POST /api/ai/keys/verify request body */
export interface VerifyKeyRequest {
  providerId: AIProviderId;
  apiKey: string;
}

/** Shape for PATCH /api/ai/keys/[id] request body */
export interface UpdateKeyRequest {
  label?: string;
  isActive?: boolean;
}
