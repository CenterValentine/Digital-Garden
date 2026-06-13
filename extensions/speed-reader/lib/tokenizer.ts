/**
 * Chunk = one RSVP slide. Carries metadata timing.ts needs to decide dwell time.
 */
export interface Chunk {
  text: string;
  /** Trailing punctuation that should add a pause: ".", "!", "?", ",", ";", ":", "—", "…" */
  trailingPunctuation: string;
  /** Word length in characters, excluding trailing punctuation */
  length: number;
  /** True if this chunk ends a sentence */
  endsSentence: boolean;
  /** True if this chunk ends a paragraph (double newline upstream) */
  endsParagraph: boolean;
}

const SENTENCE_END = /[.!?…]+$/;
const CLAUSE_END = /[,;:—]+$/;
const TRAILING_PUNCTUATION = /[.!?…,;:—]+$/;
const MAX_CHUNK_CHARS = 13;

/**
 * Split very long words into readable chunks. At 600+ WPM, a 16-character word
 * is unreadable in a single slide. We break on syllable-ish boundaries (vowel
 * groups) and join short tails back.
 */
function splitLongWord(word: string): string[] {
  if (word.length <= MAX_CHUNK_CHARS) return [word];
  const parts: string[] = [];
  let remaining = word;
  while (remaining.length > MAX_CHUNK_CHARS) {
    let breakIdx = MAX_CHUNK_CHARS;
    // Prefer breaking after a vowel cluster
    const vowelMatch = remaining
      .slice(0, MAX_CHUNK_CHARS)
      .match(/[aeiouy]+[^aeiouy]/i);
    if (vowelMatch && vowelMatch.index !== undefined) {
      const end = vowelMatch.index + vowelMatch[0].length;
      if (end >= 4) breakIdx = end;
    }
    parts.push(remaining.slice(0, breakIdx) + "-");
    remaining = remaining.slice(breakIdx);
  }
  if (remaining.length > 0) {
    if (remaining.length < 3 && parts.length > 0) {
      parts[parts.length - 1] = parts[parts.length - 1].replace(/-$/, "") + remaining;
    } else {
      parts.push(remaining);
    }
  }
  return parts;
}

export function tokenize(text: string): Chunk[] {
  if (!text || !text.trim()) return [];
  const chunks: Chunk[] = [];
  const paragraphs = text.split(/\n\s*\n/);

  for (let p = 0; p < paragraphs.length; p++) {
    const words = paragraphs[p]
      .split(/\s+/)
      .filter(Boolean)
      // Drop tokens that are only hyphens or dashes — extracted text artifacts
      // that have no reading value and break the visual rhythm.
      .filter((w) => !/^[-–—]+$/.test(w));
    for (let w = 0; w < words.length; w++) {
      const raw = words[w];
      const trailingMatch = raw.match(TRAILING_PUNCTUATION);
      const trailing = trailingMatch ? trailingMatch[0] : "";
      const base = trailing ? raw.slice(0, -trailing.length) : raw;
      const endsSentence = SENTENCE_END.test(trailing);
      const endsClause = !endsSentence && CLAUSE_END.test(trailing);
      const isLastWordInParagraph = w === words.length - 1;
      const endsParagraph =
        isLastWordInParagraph && p < paragraphs.length - 1;

      const splits = splitLongWord(base);
      for (let s = 0; s < splits.length; s++) {
        const isFinalSplit = s === splits.length - 1;
        chunks.push({
          text: splits[s] + (isFinalSplit ? trailing : ""),
          trailingPunctuation: isFinalSplit ? trailing : "",
          length: splits[s].length,
          endsSentence: isFinalSplit && endsSentence,
          endsParagraph: isFinalSplit && endsParagraph,
        });
        // Suppress the unused-var lint for endsClause if not surfaced.
        void endsClause;
      }
    }
  }
  return chunks;
}

/**
 * The Optimal Recognition Point (ORP) — the letter the eye should fixate on
 * for fastest recognition. Roughly 30-35% into the word, biased earlier for
 * short words. Returns a 0-based index into chunk.text.
 *
 * Based on Spritz research; small chunks (1-2 chars) fixate on index 0.
 */
export function getOrpIndex(chunk: Chunk): number {
  const n = chunk.length;
  if (n <= 1) return 0;
  if (n <= 3) return 1;
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  if (n <= 13) return 3;
  return 4;
}

/**
 * Bionic Reading-style fixation cue: bolds the first ~45% of letters.
 * (We avoid the "Bionic Reading" trademark by treating it as a generic
 * fixation-cue affordance.)
 */
export function getBionicSplit(chunk: Chunk): { bold: string; rest: string } {
  const n = chunk.length;
  if (n <= 1) return { bold: chunk.text, rest: "" };
  const boldCount = Math.max(1, Math.ceil(n * 0.45));
  return {
    bold: chunk.text.slice(0, boldCount),
    rest: chunk.text.slice(boldCount),
  };
}
