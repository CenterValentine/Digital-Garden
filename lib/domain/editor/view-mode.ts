"use client";

import { createContext, useContext } from "react";

export type BlockViewMode = "edit" | "viewer" | "public";

export const BlockViewModeContext = createContext<BlockViewMode>("edit");

export function useBlockViewMode(): BlockViewMode {
  return useContext(BlockViewModeContext);
}

export function useIsEditing(): boolean {
  return useContext(BlockViewModeContext) === "edit";
}
