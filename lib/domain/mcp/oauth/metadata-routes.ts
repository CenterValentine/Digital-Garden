/**
 * Route handlers for the two discovery documents. Anonymous, read-only,
 * database-free: a client that has not authenticated yet must be able to
 * read them, so they never touch the session, the token table or the tenant.
 *
 * The origin comes from mcp-handler's `getPublicOrigin` — the exact function
 * `withMcpAuth` uses to build the 401 challenge — so the challenge URL, the
 * `resource` value and the issuer always name the same host.
 */

import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  METADATA_CORS_HEADERS,
} from "./discovery";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...METADATA_CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export function protectedResourceMetadataGet(req: Request): Response {
  return json(buildProtectedResourceMetadata(getPublicOrigin(req)));
}

export function authorizationServerMetadataGet(req: Request): Response {
  return json(buildAuthorizationServerMetadata(getPublicOrigin(req)));
}

export const metadataOptions = metadataCorsOptionsRequestHandler();
