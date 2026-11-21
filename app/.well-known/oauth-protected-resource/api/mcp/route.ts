/**
 * The RFC 9728 §3.1 path-suffixed form of the protected-resource metadata
 * (resource `/api/mcp` → `/.well-known/oauth-protected-resource/api/mcp`).
 * Spec-following clients try this before the bare form. Same document.
 */

export { protectedResourceMetadataGet as GET, metadataOptions as OPTIONS } from "@/lib/domain/mcp/oauth/metadata-routes";

export const dynamic = "force-dynamic";
