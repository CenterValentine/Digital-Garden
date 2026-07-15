import type { NextRequest } from "next/server";

import { WORKFLOWS_CALLBACK_SCOPE } from "../shared";
import { validateServiceToken } from "./service-token";

/**
 * Bearer-token guard for the workflow callback surface. This module is the
 * ONLY intended importer of validateServiceToken from a request context —
 * mounting it exclusively on /api/workflows/callback/* is what contains the
 * "wide" token's blast radius (it can't reach content APIs because no content
 * route calls this). Mirrors lib/domain/browser-bookmarks/http.ts.
 */

export interface ServiceTokenAuth {
  userId: string;
}

function extractBearer(request: NextRequest): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
}

/** Returns the authenticated caller, or null if the token is absent/invalid. */
export async function getOptionalServiceTokenAuth(
  request: NextRequest,
  requiredScope: string = WORKFLOWS_CALLBACK_SCOPE
): Promise<ServiceTokenAuth | null> {
  const token = extractBearer(request);
  if (!token) return null;

  const result = await validateServiceToken(token, requiredScope);
  if (!result) return null;

  return { userId: result.userId };
}

/** Like the optional variant but throws when the token is missing/invalid. */
export async function requireServiceTokenAuth(
  request: NextRequest,
  requiredScope: string = WORKFLOWS_CALLBACK_SCOPE
): Promise<ServiceTokenAuth> {
  const auth = await getOptionalServiceTokenAuth(request, requiredScope);
  if (!auth) {
    throw new Error("Missing or invalid workflow service token");
  }
  return auth;
}
