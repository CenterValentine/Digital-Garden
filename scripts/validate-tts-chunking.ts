/**
 * TTS chunking gate — `pnpm tts:chunking:check`
 *
 * Pins the contract that whole-note read-aloud depends on. Long notes exceed
 * every cloud provider's per-request cap (OpenAI rejects >4096 characters), so
 * the text is split by `chunkForSpeech` and played back-to-back as one read.
 *
 * Two properties have to hold, and neither is visible by listening to a short
 * clip — they fail as silent drift partway through a long document:
 *
 *   1. NO CHUNK EXCEEDS THE CAP. One over and the provider 413s mid-read, and
 *      the controller degrades to the browser voice — the exact failure this
 *      whole feature exists to remove (GitHub #65).
 *
 *   2. THE CHUNKS ARE AN EXACT PARTITION. The controller derives each chunk's
 *      absolute start offset by accumulating chunk lengths, but measures
 *      progress against the full text's length. If a single character is lost
 *      at a seam, those coordinate systems disagree: progress stops short of
 *      100% and every seek lands further off than the last.
 *
 * Run: pnpm tts:chunking:check
 */

import {
  MAX_CHUNK_CHARS,
  TARGET_CHUNK_CHARS,
  chunkForSpeech,
  findSplitPoint,
} from "../lib/features/tts/chunk-text";

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Fixtures ──────────────────────────────────────────────────
const sentence =
  "The purpose of the Job Hunting Charter is to record what a search is for. ";
const paragraphs = Array.from(
  { length: 120 },
  (_, i) => `Section ${i}. ${sentence.repeat(4)}`,
).join("\n\n");
const wallOfText = sentence.repeat(400);
const noBreaks = "x".repeat(20_000);
const clausesOnly = "alpha, beta; gamma, delta; ".repeat(900);

const CASES: Array<[string, string]> = [
  ["empty", ""],
  ["whitespace only", "   \n\n  "],
  ["short selection", "Read this bit aloud."],
  ["exactly at cap", "a".repeat(MAX_CHUNK_CHARS)],
  ["one over cap", "a".repeat(MAX_CHUNK_CHARS + 1)],
  ["paragraph-rich note", paragraphs],
  ["single long paragraph", wallOfText],
  ["no whitespace at all", noBreaks],
  ["clauses but no sentences", clausesOnly],
];

console.log("tts:chunking:check");

// ── Property 1 + 2 across every fixture ───────────────────────
for (const [name, text] of CASES) {
  const chunks = chunkForSpeech(text);
  const expected = text.trim();

  const overCap = chunks.filter((c) => c.length > MAX_CHUNK_CHARS);
  check(
    `${name}: every chunk within ${MAX_CHUNK_CHARS}`,
    overCap.length === 0,
    overCap.length ? `${overCap.length} chunk(s) over, max ${Math.max(...overCap.map((c) => c.length))}` : "",
  );

  const rejoined = chunks.join("");
  check(
    `${name}: exact partition`,
    rejoined === expected,
    rejoined === expected
      ? ""
      : `rejoined ${rejoined.length} chars vs ${expected.length} expected`,
  );

  check(
    `${name}: no empty chunk`,
    chunks.every((c) => c.length > 0),
  );
}

// ── Seam quality: the point of findSplitPoint ─────────────────
// A paragraph-rich document should break on paragraph boundaries, never
// mid-word. This is what separates a natural seam from an audible cut.
{
  const chunks = chunkForSpeech(paragraphs);
  const midWordSeams = chunks
    .slice(0, -1)
    .filter((c) => !/\s$/.test(c)).length;
  check(
    "paragraph-rich note: no chunk ends mid-word",
    midWordSeams === 0,
    `${midWordSeams} of ${chunks.length - 1} seams cut mid-word`,
  );
}

// A single long paragraph has no "\n\n", so it must fall through to sentence
// breaks — still inaudible, just a rung down the hierarchy.
{
  const chunks = chunkForSpeech(wallOfText);
  const nonSentenceSeams = chunks
    .slice(0, -1)
    .filter((c) => !/[.!?]["'’”)\]]?\s*$/.test(c)).length;
  check(
    "single long paragraph: seams land on sentence ends",
    nonSentenceSeams === 0,
    `${nonSentenceSeams} of ${chunks.length - 1} seams mid-sentence`,
  );
}

// Text with no break of any kind can only hard-slice. Assert it still obeys
// the cap rather than pretending it found a boundary.
{
  const chunks = chunkForSpeech(noBreaks);
  check(
    "no whitespace at all: hard-slices within cap",
    chunks.length > 1 && chunks.every((c) => c.length <= MAX_CHUNK_CHARS),
  );
}

// ── findSplitPoint's own contract ─────────────────────────────
{
  const text = "one two three four five six seven eight nine ten";
  const split = findSplitPoint(text, 10, 30);
  check(
    "findSplitPoint stays inside [minEnd, maxEnd]",
    split === -1 || (split >= 10 && split <= 30),
    `returned ${split}`,
  );
  check(
    "findSplitPoint returns a position after whitespace",
    split === -1 || /\s/.test(text[split - 1]),
    `char before split is ${JSON.stringify(text[split - 1])}`,
  );
}

{
  // No candidate in the window at all → -1, so the caller hard-slices.
  const solid = "y".repeat(100);
  check("findSplitPoint reports -1 when no break exists", findSplitPoint(solid, 10, 30) === -1);
}

{
  // A closing quote after the period must not demote a sentence end.
  const quoted = `He said "it works." Then the next sentence begins here too.`;
  const split = findSplitPoint(quoted, 12, 22);
  check(
    "findSplitPoint sees through a closing quote to the period",
    split > 0 && quoted.slice(0, split).trimEnd().endsWith('."'),
    `split at ${split}: ${JSON.stringify(quoted.slice(Math.max(0, split - 8), split))}`,
  );
}

// ── Determinism: the cache depends on it ──────────────────────
// Chunks are cached per-chunk by hash(text)+voice. A deterministic left-to-
// right split means editing late in a note leaves earlier chunks byte-identical,
// so a replay re-pays only for what changed.
{
  const a = chunkForSpeech(paragraphs);
  const b = chunkForSpeech(paragraphs);
  check("chunking is deterministic", JSON.stringify(a) === JSON.stringify(b));

  const edited = `${paragraphs}\n\nAn appended closing paragraph.`;
  const afterEdit = chunkForSpeech(edited);
  const sharedPrefix = a.findIndex((c, i) => afterEdit[i] !== c);
  check(
    "appending text leaves earlier chunks byte-identical",
    sharedPrefix === -1 || sharedPrefix >= a.length - 1,
    `first differing chunk at index ${sharedPrefix} of ${a.length}`,
  );
}

check(
  "target leaves headroom under the cap",
  TARGET_CHUNK_CHARS < MAX_CHUNK_CHARS,
);

console.log("");
if (failures > 0) {
  console.error(`tts:chunking:check FAILED — ${failures} problem(s)`);
  process.exit(1);
}
console.log("tts:chunking:check passed");
