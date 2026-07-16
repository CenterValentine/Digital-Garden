import type { ExtensionServerRuntime } from "@/lib/extensions/types";
import { STUDIO_EXTENSION_ID } from "./manifest";

/**
 * Studio server runtime.
 *
 * Phase 0: no server-side editor extensions. Studio's server work lives in
 * `server/` (the source resolver; later the metadata + generation routes) and
 * is invoked from API routes, not contributed as TipTap extensions — so this
 * stays minimal. Present for symmetry and to reserve the wiring point.
 */
export const studioExtensionServerRuntime: ExtensionServerRuntime = {
  id: STUDIO_EXTENSION_ID,
};
