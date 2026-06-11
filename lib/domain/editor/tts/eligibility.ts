/**
 * TTS block eligibility — "read aloud" text extraction (Audio subsystem)
 *
 * Single source of truth for "should the narrator skip this node type?".
 * Consulted only by `extract-readable-text.ts`. Two sources, one predicate:
 *
 *   1. Registered blocks declare `ttsSkip` on their `BlockDefinition`
 *      (co-located per `registerBlock(...)` call — developer-declared, never a
 *      user setting). Looked up via the block registry.
 *   2. A small static set covers CORE / lowlight nodes that are not registered
 *      blocks (e.g. `codeBlock`, images, rules) — there is no `BlockDefinition`
 *      to hang a flag on, so they live here.
 *
 * Client-safe: the block registry is populated at editor import time, and this
 * predicate only ever runs in the browser (extraction happens client-side; the
 * synth endpoint receives already-extracted plain text).
 */

import { getBlockDefinition } from "@/lib/domain/blocks/registry";

/**
 * Core / non-registry node types that are never narratable prose.
 *
 * ── This is the editorial-judgment knob. ──
 * These are TipTap core or lowlight nodes that don't go through the block
 * registry, so they can't carry a `ttsSkip` flag. Registered blocks (Mermaid,
 * Excalidraw, habit tracker, form inputs, audio/flashcard embeds, …) are
 * skipped via their own `BlockDefinition.ttsSkip` instead — do NOT duplicate
 * them here. Add a type here only when it has no `BlockDefinition`.
 */
export const STATIC_TTS_SKIP_NODE_TYPES: ReadonlySet<string> = new Set([
  // codeBlock is NOT skipped — it's read, but its text is run through
  // sanitizeCodeForSpeech() in the extractor to drop pure-symbol format noise.
  "horizontalRule", // purely visual divider, no text
  "image", // alt text is metadata, not narration (revisit if you want alt read)
  "imageBlock",
]);

/**
 * Whether the narrator should skip a node type ENTIRELY (no own text, no
 * descendant recursion). Checks the static core set first, then the block
 * registry's developer-declared `ttsSkip`.
 */
export function isTtsSkippedType(nodeType: string | undefined | null): boolean {
  if (!nodeType) return false;
  if (STATIC_TTS_SKIP_NODE_TYPES.has(nodeType)) return true;
  const def = getBlockDefinition(nodeType);
  if (!def) return false;
  // Explicit per-block flag (developer-declared on the BlockDefinition) wins —
  // including `false`, which opts a publishing block back into narration.
  if (def.ttsSkip === true) return true;
  if (def.ttsSkip === false) return false;
  // Publishing-surface composition widgets are page chrome, not document prose.
  // Skipped as a group so each block needn't repeat the flag.
  if (def.group === "publishing") return true;
  return false;
}
