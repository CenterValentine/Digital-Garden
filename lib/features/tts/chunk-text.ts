/**
 * Speech chunking — split a long read into provider-sized requests.
 *
 * WHY THIS EXISTS: every cloud TTS provider caps a single request's input.
 * OpenAI's speech endpoint rejects anything over 4096 characters, so a
 * whole-note read used to fail outright and silently degrade to the browser's
 * Web Speech voice (GitHub #65). The controller now splits the text here and
 * plays the pieces back-to-back as one continuous read.
 *
 * ── Determinism is load-bearing ───────────────────────────────────────────
 * Chunks are cached per-chunk by `hash(text) + voice` (see `cache.ts`), and
 * splitting is a pure left-to-right scan. So editing one paragraph leaves every
 * chunk before it byte-identical, and a replay re-synthesizes (re-pays for)
 * only the chunks that actually changed. Never make the split depend on global
 * state like "balance all chunks evenly" — that would invalidate a whole note's
 * cache on any edit.
 */

/**
 * Hard ceiling per request. OpenAI's speech endpoint rejects >4096 characters;
 * ElevenLabs and Google allow more, but one shared, conservative bound keeps
 * the cache interchangeable across providers (the client doesn't know which
 * provider the server will resolve to).
 */
export const MAX_CHUNK_CHARS = 4000;

/**
 * Preferred chunk size. Below the hard cap so the splitter has room to reach
 * backwards for a clean boundary instead of cutting mid-word.
 *
 * Tuning trade-off: larger chunks mean fewer seams and fewer HTTP round-trips,
 * but a longer wait before the *first* word is spoken (chunk 0 must synthesize
 * before playback starts). ~3500 keeps time-to-first-audio near the latency of
 * a short selection read.
 */
export const TARGET_CHUNK_CHARS = 3500;

/**
 * Find where to end a chunk within `text`, searching the window
 * [minEnd, maxEnd) for the most natural break.
 *
 * Returns an absolute index into `text` — the position the chunk should end at
 * (exclusive) — or `-1` to signal "no good boundary found", in which case the
 * caller hard-slices at `maxEnd`.
 *
 * ┌─ YOUR CALL ────────────────────────────────────────────────────────────┐
 * │ This function decides what the seams between audio clips SOUND like.    │
 * │ There is a real hierarchy of break quality here:                        │
 * │                                                                          │
 * │   paragraph break ("\n\n")  — inaudible; the pause was going to be      │
 * │                               there anyway. Best possible seam.          │
 * │   sentence end (". " "? ")  — natural; a listener won't notice.         │
 * │   clause break ("; " ", ")  — slightly odd but acceptable.              │
 * │   any whitespace            — audible hiccup, but never cuts a word.    │
 * │                                                                          │
 * │ The trade-off: preferring a *better* break class means searching        │
 * │ further back, which makes chunks shorter and more numerous (more        │
 * │ requests, more seams overall). Preferring a *closer* break means fewer, │
 * │ fuller chunks but occasionally an awkward mid-sentence cut.             │
 * │                                                                          │
 * │ Strategy A — strict hierarchy: take the best break class that appears   │
 * │   anywhere in the window, however far back. Cleanest seams, most chunks.│
 * │ Strategy B — latest acceptable: scan backwards from maxEnd and take the │
 * │   first break of ANY acceptable class. Fullest chunks, mixed seams.     │
 * │ Strategy C — weighted: score each candidate by (break quality) vs       │
 * │   (how much chunk capacity it wastes) and take the best score.          │
 * │                                                                          │
 * │ Remember this text came from `extractReadableText`, which already emits │
 * │ "\n\n" between every block — so paragraph breaks are plentiful in real  │
 * │ notes, and rarer in a single long wall-of-text paragraph.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param text    The full remaining text being chunked.
 * @param minEnd  Don't return an index below this — chunks shorter than this
 *                waste requests. (Caller passes ~60% of target.)
 * @param maxEnd  Don't return an index at or above this — the hard cap.
 * @returns Absolute index to end the chunk at, or -1 for "no boundary found".
 */
export function findSplitPoint(
  text: string,
  minEnd: number,
  maxEnd: number,
): number {
  // TODO(you): implement the boundary search described above.
  //
  // Useful starting points:
  //   text.lastIndexOf("\n\n", maxEnd)  → nearest paragraph break at or before maxEnd
  //   /[.!?]["')\]]?\s/g                → sentence terminator, allowing a closing quote
  //   text.lastIndexOf(" ", maxEnd)     → last-resort whitespace
  //
  // Return the index AFTER the break characters (so the break is consumed by
  // the chunk that precedes it, not orphaned onto the next one), and only
  // return a value in [minEnd, maxEnd). Return -1 if nothing qualifies.
  void text;
  void minEnd;
  void maxEnd;
  return -1;
}

/**
 * Split `text` into provider-sized chunks, preserving reading order.
 *
 * Short text returns a single-element array, so the caller has one code path
 * for both a highlighted phrase and a whole document.
 */
export function chunkForSpeech(
  text: string,
  targetChars: number = TARGET_CHUNK_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    const remaining = trimmed.length - cursor;
    if (remaining <= MAX_CHUNK_CHARS) {
      chunks.push(trimmed.slice(cursor).trim());
      break;
    }

    const maxEnd = cursor + Math.min(targetChars, MAX_CHUNK_CHARS);
    const minEnd = cursor + Math.floor(targetChars * 0.6);
    const split = findSplitPoint(trimmed, minEnd, maxEnd);

    // -1 (or an out-of-window answer) → hard-slice at the cap. Crude, but it
    // always terminates and never exceeds the provider limit.
    const end = split > cursor && split <= maxEnd ? split : maxEnd;

    const piece = trimmed.slice(cursor, end).trim();
    if (piece) chunks.push(piece);
    cursor = end;
  }

  return chunks.filter(Boolean);
}
