"use client";

/**
 * Tool Surface Context Provider
 *
 * Provides filtered tool instances to descendant components
 * based on the current content type and surface.
 */

import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { ContentType, ToolInstance, ToolSurface } from "./types";
import { queryTools } from "./registry";

interface ToolSurfaceContextValue {
  /** Current content type (null = no content selected) */
  contentType: ContentType | null;
  /** Get tool instances for a specific surface */
  getToolsForSurface: (surface: ToolSurface) => ToolInstance[];
  /** Register a click handler for a tool ID */
  registerHandler: (toolId: string, handler: () => void) => void;
}

const ToolSurfaceContext = createContext<ToolSurfaceContextValue | null>(null);

interface ToolSurfaceProviderProps {
  contentType: ContentType | null;
  children: ReactNode;
}

export function ToolSurfaceProvider({
  contentType,
  children,
}: ToolSurfaceProviderProps) {
  // Handlers stored in ref to avoid re-renders when they register/unregister
  const handlersRef = useRef<Map<string, () => void>>(new Map());

  const value = useMemo<ToolSurfaceContextValue>(
    () => ({
      contentType,

      getToolsForSurface: (surface: ToolSurface): ToolInstance[] => {
        const definitions = queryTools({
          surface,
          contentType: contentType ?? undefined,
        });

        return definitions.map((def) => ({
          definition: def,
          execute: () => {
            const handler = handlersRef.current.get(def.id);
            if (handler) handler();
          },
          isActive: false,
          isDisabled: false,
        }));
      },

      registerHandler: (toolId: string, handler: () => void) => {
        handlersRef.current.set(toolId, handler);
      },
    }),
    [contentType]
  );

  return (
    <ToolSurfaceContext.Provider value={value}>
      {children}
    </ToolSurfaceContext.Provider>
  );
}

/**
 * Hook to access tool surface context.
 * Returns null if used outside provider (safe for gradual adoption).
 */
export function useToolSurface(): ToolSurfaceContextValue | null {
  return useContext(ToolSurfaceContext);
}

/**
 * Hook for components to register handlers for specific tools.
 * Automatically cleans up on unmount or when handler changes.
 */
export function useRegisterToolHandler(
  toolId: string,
  handler: (() => void) | undefined
) {
  const ctx = useToolSurface();
  useEffect(() => {
    if (ctx && handler) {
      ctx.registerHandler(toolId, handler);
    }
    return () => {
      if (ctx) {
        ctx.registerHandler(toolId, () => {});
      }
    };
  }, [ctx, toolId, handler]);
}
