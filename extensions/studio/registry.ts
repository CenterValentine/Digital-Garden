/**
 * Studio tool registry.
 *
 * The studio grid renders entirely from this registry, so adding a tool — or a
 * whole shelf — is data, never a layout change. Built-ins register themselves
 * through the same `registerStudioTool()` path that other extensions use, so
 * there is exactly one way a tile gets onto the grid.
 *
 * Pure data + string ids only (no React) → safe to import from client or
 * server. Handlers are wired separately at the call site, matching the Tool
 * Surfaces pattern where `ToolDefinition` is inert and `ToolInstance` carries
 * the live handler.
 */

import { STUDIO_BUILTIN_TOOLS } from "./builtin-tools";
import type {
  StudioShelf,
  StudioToolDefinition,
  StudioToolVariant,
} from "./types";
import { STUDIO_SHELVES } from "./types";

const REGISTRY = new Map<string, StudioToolDefinition>();

/**
 * Register (or replace) a studio tool. Idempotent by id — safe under dev HMR
 * and safe for an extension to call at module-load time. Last write wins.
 */
export function registerStudioTool(definition: StudioToolDefinition): void {
  REGISTRY.set(definition.id, definition);
}

/** Remove a tool by id. Returns whether it was present. */
export function unregisterStudioTool(id: string): boolean {
  return REGISTRY.delete(id);
}

function byShelfThenOrder(
  a: StudioToolDefinition,
  b: StudioToolDefinition
): number {
  const shelfDelta = STUDIO_SHELVES.indexOf(a.shelf) - STUDIO_SHELVES.indexOf(b.shelf);
  if (shelfDelta !== 0) return shelfDelta;
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
}

/** All registered tools, ordered by shelf then intra-shelf order. */
export function getStudioTools(): StudioToolDefinition[] {
  return [...REGISTRY.values()].sort(byShelfThenOrder);
}

/** Tools on one shelf, ordered. */
export function getStudioToolsByShelf(shelf: StudioShelf): StudioToolDefinition[] {
  return getStudioTools().filter((t) => t.shelf === shelf);
}

/** Tools grouped by shelf, in shelf order — the shape the grid consumes. */
export function getStudioToolsGroupedByShelf(): {
  shelf: StudioShelf;
  tools: StudioToolDefinition[];
}[] {
  return STUDIO_SHELVES.map((shelf) => ({
    shelf,
    tools: getStudioToolsByShelf(shelf),
  }));
}

/** One tool by id, or undefined. */
export function getStudioToolById(id: string): StudioToolDefinition | undefined {
  return REGISTRY.get(id);
}

/**
 * Resolve a tool's variants, whether declared statically or as a runtime
 * resolver (e.g. custom reports from ChatContext presets). Returns [] when the
 * tool has none.
 */
export async function resolveStudioToolVariants(
  tool: StudioToolDefinition
): Promise<StudioToolVariant[]> {
  const { variants } = tool;
  if (!variants) return [];
  return typeof variants === "function" ? variants() : variants;
}

// Seed built-ins through the public registration path. Runs once at import.
for (const tool of STUDIO_BUILTIN_TOOLS) {
  registerStudioTool(tool);
}
