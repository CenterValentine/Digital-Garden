import type { Chunk } from "./tokenizer";
import type { SpeedReaderPolishToggles } from "../state/speed-reader-store";

/**
 * Per-chunk dwell time in milliseconds, given WPM and which polish features
 * are enabled. Returns the time the chunk should remain on screen before
 * advancing to the next.
 *
 *   base = 60000 / wpm                       // ms per word at target WPM
 *
 * Polish multipliers are *additive* on top of base. They compound, but each
 * is bounded so a worst-case slow word stays under ~3x base — avoids the
 * reader feeling "stuck" on hard passages.
 *
 * ── Tunable constants ─────────────────────────────────────────────
 * Adjust these to taste; reasonable defaults from Spritz/RSVP research.
 */
const SENTENCE_END_PAUSE = 1.5;      // period, exclamation, question, ellipsis
const CLAUSE_PAUSE = 1.2;            // comma, semicolon, colon, em-dash
const PARAGRAPH_PAUSE = 2.0;         // double-newline boundary
const LONG_WORD_THRESHOLD = 8;       // chars beyond this trigger extra time
const LONG_WORD_PER_CHAR_BOOST = 0.05; // +5% per char beyond threshold
const LONG_WORD_MAX_BOOST = 0.6;     // cap at +60%

/** Fixed extra hold after a sentence-ending word when pauseAtSentenceEnd is on.
 *  Intentionally an absolute ms value (not a multiplier) so the pause feels
 *  the same regardless of current WPM. */
const SENTENCE_HARD_PAUSE_MS = 900;

export function getChunkDelay(
  chunk: Chunk,
  wpm: number,
  polish: SpeedReaderPolishToggles
): number {
  const base = 60000 / wpm;
  let multiplier = 1;

  if (polish.lengthBasedTiming && chunk.length > LONG_WORD_THRESHOLD) {
    const extraChars = chunk.length - LONG_WORD_THRESHOLD;
    const boost = Math.min(
      LONG_WORD_MAX_BOOST,
      extraChars * LONG_WORD_PER_CHAR_BOOST
    );
    multiplier += boost;
  }

  if (polish.punctuationPauses) {
    if (chunk.endsParagraph) {
      multiplier *= PARAGRAPH_PAUSE;
    } else if (chunk.endsSentence) {
      multiplier *= SENTENCE_END_PAUSE;
    } else if (/[,;:—]/.test(chunk.trailingPunctuation)) {
      multiplier *= CLAUSE_PAUSE;
    }
  }

  const base_delay = Math.round(base * multiplier);

  // pauseAtSentenceEnd: fixed absolute hold on top of the normal delay. Gives
  // the reader a genuine beat to absorb the sentence before the next one begins.
  if (polish.pauseAtSentenceEnd && (chunk.endsSentence || chunk.endsParagraph)) {
    return base_delay + SENTENCE_HARD_PAUSE_MS;
  }

  return base_delay;
}
