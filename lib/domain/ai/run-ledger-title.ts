/**
 * Stable, searchable Run Ledger titles.
 *
 * A semantic label makes search useful; a deterministic word pair prevents
 * otherwise-identical runs from collapsing into a wall of "Run Ledger" rows.
 * The pair is derived from the run key so every phase keeps the same title.
 */

const ADJECTIVES = [
  "Amber",
  "Brisk",
  "Cedar",
  "Clear",
  "Copper",
  "Coral",
  "Dawn",
  "Ember",
  "Golden",
  "Indigo",
  "Juniper",
  "Lunar",
  "Maple",
  "Misty",
  "Olive",
  "Quiet",
  "River",
  "Silver",
  "Solar",
  "Swift",
  "Velvet",
  "Verdant",
  "Violet",
  "Willow",
] as const;

const NOUNS = [
  "Badger",
  "Beacon",
  "Brook",
  "Canyon",
  "Comet",
  "Crane",
  "Falcon",
  "Fern",
  "Finch",
  "Fox",
  "Grove",
  "Harbor",
  "Heron",
  "Lark",
  "Meadow",
  "Orchid",
  "Otter",
  "Pine",
  "Raven",
  "Reef",
  "Sparrow",
  "Summit",
  "Thicket",
  "Vale",
] as const;

export interface RunLedgerTitleInput {
  phase: string;
  summary: string;
  artifacts?: string[];
  /** Stable short title for the entire run, supplied by the model when known. */
  runTitle?: string;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cleanLabel(value: string): string {
  return value
    .replace(/[`*_#[\]]/g, "")
    .replace(/\s+/g, " ")
    .replace(
      /^(?:completed|compiled|created|finished|produced|researched|reviewed|analyzed|identified|investigated|documented)\s+/i,
      "",
    )
    .trim();
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary >= 24 ? boundary : maxLength).trim()}…`;
}

function summaryLabel(input: RunLedgerTitleInput): string {
  const explicit = input.runTitle ? cleanLabel(input.runTitle) : "";
  if (explicit) return truncateAtWord(explicit, 68);

  const firstSummarySentence = input.summary
    .split(/(?:[.!?](?:\s|$)|\n)/, 1)[0] ?? "";
  const summary = cleanLabel(firstSummarySentence);
  if (summary.length >= 12) return truncateAtWord(summary, 68);

  const artifacts = cleanLabel((input.artifacts ?? []).slice(0, 3).join(" + "));
  if (artifacts) return truncateAtWord(artifacts, 68);

  const phase = cleanLabel(input.phase.replace(/^phase\s+[^:—-]+[:—-]\s*/i, ""));
  return truncateAtWord(phase || "Untitled run", 68);
}

export function buildRunLedgerTitle(
  input: RunLedgerTitleInput,
  runKey: string,
): string {
  const hash = stableHash(runKey);
  const adjective = ADJECTIVES[hash % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(hash / ADJECTIVES.length) % NOUNS.length];
  return `Run Ledger — ${summaryLabel(input)} · ${adjective} ${noun}`;
}
