import type { ExtensionRuntime } from "@/lib/extensions/types";
import { STUDIO_EXTENSION_ID } from "./manifest";

/**
 * Studio client runtime.
 *
 * Phase 0: intentionally empty — no panels or dialogs mount yet. The registry
 * and contracts exist; the visible surfaces (sidebar Studio tab, Context tab)
 * land in Phase 1. Registering the runtime now keeps the extension wired into
 * `installed.ts` so nothing else has to change when those surfaces arrive.
 */
export const studioExtensionRuntime: ExtensionRuntime = {
  id: STUDIO_EXTENSION_ID,
};
