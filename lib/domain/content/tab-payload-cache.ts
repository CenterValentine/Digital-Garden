// Client-side bounded MRU cache of content payloads — the "warm switching"
// half of CONTENT-LOAD-CASCADE §3.9 ("Bounded preload"), listed as a known gap
// in §6 and scheduled into Phase C in §7, which never shipped.
//
// NOT THE SAME THING AS `content-cache.ts`. That module is the SERVER-side,
// per-process payload cache that spares the Neon roundtrip. This one lives in
// the browser and spares the *unmount*. They are complements, and the second is
// what actually preserves the reader's place.
//
// WHAT PROBLEM THIS SOLVES
// Switching tabs re-runs the gated cascade (§3.6): `MainPanelContent` raises
// `isLoading`, and its early return `if (isLoading) return <EditorSkeleton />`
// unmounts the entire editor subtree — ProseMirror instance, collaboration
// provider, scroll container — then rebuilds it. The server cache and hover
// prefetch (`prefetch.ts`) make the round trip fast, but the skeleton, the
// unmount and the re-parse all still happen, and the scroll position dies with
// the container.
//
// WHY NOT JUST KEEP EVERY TAB MOUNTED (display:none)
// The collaboration provider is created by a React hook
// (`useCollaborationRuntime` in MainPanelContent), gated on data — whether a
// contentId resolves — never on visibility. A hidden-but-mounted tab mounts,
// runs its effects, and opens a Hocuspocus WebSocket exactly like a visible
// one. N hidden tabs = N providers + N presence broadcasts, against a Cloud
// Run service whose sleep behavior is a deliberate cost feature, and directly
// against §4: "Background tabs get no provider until selected. You collaborate
// on what's on screen, not on tabs you can't see."
//
// Caching the payload buys the same instant switch with one editor and one
// provider.
//
// BOUNDS (§3.9): bounded by MEMORY, not by a tab count (owner, 2026-10-03):
// a handful of large notes and a hundred small ones should not get the same
// five slots. Least-recently-viewed entries drop off the bottom until the
// budget fits.

/** Total budget for cached payloads, in (estimated) bytes. */
export const TAB_PAYLOAD_CACHE_BUDGET_BYTES = 16 * 1024 * 1024;

/**
 * How long a cached payload may be painted before it is considered too cold to
 * show without a skeleton. Beyond this we fall back to the normal loading path
 * rather than flash content that may be badly out of date.
 *
 * Deliberately equal to the collaboration runtime's IDLE_EVICTION_MS: a
 * provider nobody has looked at for five minutes is evicted so the Cloud Run
 * socket can close (a cost measure). A revisit after that is a cold load
 * regardless, so a payload that outlived the provider would only paint
 * something the Y.Doc is about to replace. Do not raise this on its own.
 */
export const TAB_PAYLOAD_MAX_AGE_MS = 5 * 60_000;
const MAX_AGE_MS = TAB_PAYLOAD_MAX_AGE_MS;

/**
 * Bytes a payload will occupy, estimated from its JSON length. JS strings are
 * UTF-16, so two bytes a character; the real object graph is larger than its
 * serialization, but the estimate is proportional, which is all a budget needs.
 */
function estimateBytes(data: unknown): number {
  try {
    return JSON.stringify(data).length * 2;
  } catch {
    return Number.POSITIVE_INFINITY; // uncacheable (cyclic) — never admitted
  }
}

type CacheEntry = {
  /** The `data` object from a successful content GET. */
  data: unknown;
  /** Optimistic-concurrency baseline at the time of caching, if any. */
  bodyHash: string | null;
  /** Server-reported last-modified stamp at the time of caching, if any. */
  updatedAt: string | null;
  /** Epoch ms this entry was written — MRU key and staleness input. */
  at: number;
  /** Estimated size, for the budget. */
  bytes: number;
};

const entries = new Map<string, CacheEntry>();
let totalBytes = 0;

function remove(contentId: string): void {
  const entry = entries.get(contentId);
  if (!entry) return;
  entries.delete(contentId);
  totalBytes -= entry.bytes;
}

function touch(contentId: string): void {
  // Map preserves insertion order, so delete+set moves an entry to the back.
  const entry = entries.get(contentId);
  if (!entry) return;
  entries.delete(contentId);
  entries.set(contentId, entry);
}

function evictIfNeeded(): void {
  while (totalBytes > TAB_PAYLOAD_CACHE_BUDGET_BYTES) {
    const oldest = entries.keys().next();
    if (oldest.done) return;
    remove(oldest.value);
  }
}

/** What the cache holds right now — for the harness and for a debug readout. */
export function tabPayloadCacheStats(): { entries: number; bytes: number; ids: string[] } {
  return { entries: entries.size, bytes: totalBytes, ids: [...entries.keys()] };
}

export function cacheTabPayload(
  contentId: string | null | undefined,
  data: unknown,
  meta: { bodyHash?: string | null; updatedAt?: string | null } = {}
): void {
  if (!contentId || contentId.startsWith("temp-")) return;
  const bytes = estimateBytes(data);
  remove(contentId);
  // A single payload past the whole budget is never admitted — it would
  // evict everything else to sit alone, and still be too big to keep.
  if (bytes > TAB_PAYLOAD_CACHE_BUDGET_BYTES) return;
  entries.set(contentId, {
    data,
    bodyHash: meta.bodyHash ?? null,
    updatedAt: meta.updatedAt ?? null,
    at: Date.now(),
    bytes,
  });
  totalBytes += bytes;
  evictIfNeeded();
}

export type CachedTabPayload<T> = {
  data: T;
  bodyHash: string | null;
  updatedAt: string | null;
  ageMs: number;
};

/**
 * A cached payload fresh enough to paint immediately, or `undefined`.
 *
 * The cast is the one type boundary in this module: the cache is deliberately
 * payload-agnostic (the response shape is declared locally in
 * `MainPanelContent`), so the single caller owns the type.
 */
export function readTabPayload<T>(
  contentId: string | null | undefined
): CachedTabPayload<T> | undefined {
  if (!contentId) return undefined;
  const entry = entries.get(contentId);
  if (!entry) return undefined;

  const ageMs = Date.now() - entry.at;
  if (ageMs > MAX_AGE_MS) {
    remove(contentId);
    return undefined;
  }

  touch(contentId);
  return {
    data: entry.data as T,
    bodyHash: entry.bodyHash,
    updatedAt: entry.updatedAt,
    ageMs,
  };
}

/**
 * Drop a cached payload. Call after any mutation that makes it wrong — a save,
 * a rename, a delete, a move, a forced refresh.
 */
export function invalidateTabPayload(
  contentId: string | null | undefined
): void {
  if (!contentId) return;
  remove(contentId);
}

/** Drop everything — for sign-out and workspace switch. */
export function clearTabPayloadCache(): void {
  entries.clear();
  totalBytes = 0;
}

/**
 * Decide whether a background revalidation may overwrite what is currently on
 * screen.
 *
 * THE SITUATION
 * We painted a tab instantly from `readTabPayload` — no skeleton, no unmount,
 * the reader is already looking at the document. A revalidating fetch then
 * lands, typically 50-300ms later. Sometimes it carries exactly what we
 * painted; sometimes a collaborator changed the note while this tab sat in the
 * background; and sometimes the reader has already started typing into the copy
 * we painted.
 *
 * WHY THIS IS THE DANGEROUS SEAM
 * Applying a revalidation calls `setNoteContent`, which flows into the editor's
 * external-update effect and `editor.commands.setContent(...)` — replacing the
 * document wholesale, resetting the caret, and discarding anything typed since
 * the paint. This codebase has been bitten repeatedly in exactly this area: the
 * anti-blank binding guard (CONTENT-LOAD-CASCADE §4), the stale-draft trap that
 * re-raised a conflict on every load, and the save-echo guard that exists
 * solely to stop an autosave round trip from resetting the cursor.
 *
 * Being too eager loses the reader's keystrokes. Being too conservative leaves
 * them editing a stale copy whose save will then 409 against a server change
 * they never saw.
 *
 * HOW THE THREE INPUTS ACTUALLY RANK (traced 2026-09-17, not assumed)
 *
 * `editorIsDirty` is the only one doing real work. The window between paint
 * and revalidation is 50-300ms immediately after ARRIVING at a tab, so the
 * reader has almost always typed nothing — but when they have, those
 * keystrokes exist nowhere else yet, and `setContent` would silently discard
 * them. Hand that case to the conflict resolver, which is built for it.
 *
 * `isCollaborative` is belt-and-braces rather than load-bearing: for a
 * Y.Doc-bound note the external-update effect in `MarkdownEditor` already
 * returns early on `collaborationState`, and `seedInitialContent` is latched by
 * `entry.hasSeededInitialContent`, so a late `noteContent` change is inert on
 * both paths. It stays in the predicate anyway — the invariant belongs here,
 * stated locally, not as a silent dependency on a guard two files away that a
 * future refactor could remove without anyone connecting the two.
 *
 * The hash comparison is the cheap filter: equal means nothing changed, which
 * is the overwhelmingly common case, and applying it would reset the caret for
 * no reason at all.
 */
export function shouldApplyRevalidation(input: {
  cachedBodyHash: string | null;
  freshBodyHash: string | null;
  cachedUpdatedAt: string | null;
  freshUpdatedAt: string | null;
  /** The reader has typed into the painted copy since it appeared. */
  editorIsDirty: boolean;
  /** This content is bound to a live Y.Doc (canonical or localFallback). */
  isCollaborative: boolean;
}): boolean {
  // Never pull the document out from under someone mid-keystroke.
  if (input.editorIsDirty) return false;

  // The Y.Doc is the live document (§9.1); REST is only its bootstrap.
  if (input.isCollaborative) return false;

  // Prefer the hash — it is the same baseline the save path's If-Match uses,
  // so "changed" here means exactly what "changed" means to a 409.
  if (input.cachedBodyHash && input.freshBodyHash) {
    return input.cachedBodyHash !== input.freshBodyHash;
  }

  // No hash on one side (non-note content, or an SSR-synthesized payload that
  // never carried one). Fall back to the server's own modification stamp.
  if (input.cachedUpdatedAt && input.freshUpdatedAt) {
    return input.cachedUpdatedAt !== input.freshUpdatedAt;
  }

  // Nothing comparable. We cannot show a difference we cannot detect, and a
  // blind re-apply is all cost and no information — leave the screen alone.
  return false;
}
