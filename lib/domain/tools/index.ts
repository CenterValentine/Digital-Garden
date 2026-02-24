/**
 * Tool Surfaces System
 *
 * Declarative registry of tools mapped to UI surfaces.
 */

export type {
  ContentType,
  ToolSurface,
  ToolDefinition,
  ToolInstance,
  ToolQuery,
} from "./types";

export { queryTools, getToolById, getToolGroups } from "./registry";
