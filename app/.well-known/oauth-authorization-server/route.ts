/**
 * RFC 8414 authorization-server metadata. The garden is its own issuer for
 * MCP clients (MCP-DATABASE-REACH-PLAN §8.1); the protected-resource
 * metadata lists this origin in `authorization_servers`.
 * Pinned by `pnpm mcp:oauth:check`.
 */

export { authorizationServerMetadataGet as GET, metadataOptions as OPTIONS } from "@/lib/domain/mcp/oauth/metadata-routes";

export const dynamic = "force-dynamic";
