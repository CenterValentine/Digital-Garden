/**
 * RFC 9728 protected-resource metadata for the MCP endpoint — the URL the
 * /api/mcp 401 challenge advertises. Without this file the path fell through
 * to the public `/[...path]` catch-all and 307'd to `/`.
 * Pinned by `pnpm mcp:oauth:check`.
 */

export { protectedResourceMetadataGet as GET, metadataOptions as OPTIONS } from "@/lib/domain/mcp/oauth/metadata-routes";

export const dynamic = "force-dynamic";
