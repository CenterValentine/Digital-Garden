/**
 * Folder Studio — client-safe barrel.
 *
 * Exports the contracts, tool registry, and token helpers that both client and
 * server may use. The Prisma-backed source resolver is deliberately NOT
 * re-exported here — import it directly from `./server/source-resolver` in
 * server-only code so a "use client" module can never pull Prisma in through
 * this barrel.
 */

export * from "./types";
export * from "@/lib/domain/ai-context/tokens";
export {
  registerStudioTool,
  unregisterStudioTool,
  getStudioTools,
  getStudioToolsByShelf,
  getStudioToolsGroupedByShelf,
  getStudioToolById,
  resolveStudioToolVariants,
} from "./registry";
export * from "./invocable";
export {
  STUDIO_EXTENSION_ID,
  STUDIO_TAB_KEY,
  STUDIO_CONTEXT_TAB_KEY,
} from "./manifest";
