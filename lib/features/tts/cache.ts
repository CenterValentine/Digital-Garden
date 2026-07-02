/**
 * Session-scoped LRU cache of synthesized speech (Audio subsystem).
 *
 * Prevents paying the cloud provider twice for the same read — re-listening to a
 * note, or Listen → Stop → Listen, reuses the cached audio Blob instead of
 * re-synthesizing. Lives only in memory (cleared on reload); the Web Speech
 * fallback produces no audio bytes and is never cached.
 *
 * The key deliberately excludes speaking rate: the controller synthesizes at a
 * neutral rate and applies speed via the audio element's `playbackRate`, so one
 * cached clip serves every speed.
 */

/** Max cached clips. Bounds memory (a whole-note clip can be a few hundred KB). */
const MAX_ENTRIES = 8;

const cache = new Map<string, Blob>();

/**
 * Cache key for a read. The client only controls `voice` and `text`; the
 * provider/model is resolved server-side from the user's connection, so two
 * identical client requests map to the same audio while that route is stable.
 */
export function speechCacheKey(text: string, voice?: string): string {
  return `${voice ?? "default"}:${hashText(text)}`;
}

export function getCachedSpeech(key: string): Blob | undefined {
  const blob = cache.get(key);
  if (blob) {
    // Touch → move to most-recently-used.
    cache.delete(key);
    cache.set(key, blob);
  }
  return blob;
}

export function putCachedSpeech(key: string, blob: Blob): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, blob);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** cyrb53 — fast non-cryptographic hash, stable within a session. */
function hashText(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
