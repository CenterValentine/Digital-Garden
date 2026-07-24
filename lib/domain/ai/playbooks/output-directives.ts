import type { ParsedPlaybook, PlaybookSection } from "./parse";
import { renderPlaybookSection } from "./render";

export type RelativeOutputLocation =
  | "under_chat"
  | "under_content"
  | "beside_content";

export interface PlaybookOutputDirective {
  location: RelativeOutputLocation;
  /** Literal title prefix before a placeholder such as [COMPANY NAME]. */
  titlePrefix: string;
  phaseTitle?: string;
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function inferRelativeLocation(text: string): RelativeOutputLocation | null {
  if (
    /\b(?:beside|next\s+to|alongside)\s+(?:(?:this|the|current|rooted)\s+)?(?:content|file|note)\b/i.test(
      text,
    )
  ) {
    return "beside_content";
  }
  if (
    /\b(?:under|inside|within|nested\s+under)\s+(?:(?:this|the)\s+)?chat\b/i.test(
      text,
    )
  ) {
    return "under_chat";
  }
  if (
    /\b(?:under|inside|within|nested\s+under)\s+(?:(?:this|the|current|rooted)\s+)?(?:content|file|note)\b/i.test(
      text,
    )
  ) {
    return "under_content";
  }
  return null;
}

function titlePrefixFromDirective(text: string): string | null {
  const titleCue = text.match(/\b(?:with\s+the\s+title|starting\s+with)\s+["“]?/i);
  if (!titleCue || titleCue.index === undefined) return null;

  const remainder = text.slice(titleCue.index + titleCue[0].length);
  const beforeLocation = remainder.split(
    /\s+\b(?:under|inside|within|nested\s+under|beside|next\s+to|alongside)\b/i,
    1,
  )[0];
  const template = beforeLocation
    .replace(/["”]\s*$/, "")
    .replace(/\*+\s*$/, "")
    .trim();
  if (!template) return null;

  const placeholderIndex = template.search(/\[[^\]]+\]/);
  const prefix = (placeholderIndex >= 0
    ? template.slice(0, placeholderIndex)
    : template
  )
    .replace(/["”*]+\s*$/, "")
    .trim();
  return prefix || null;
}

export function extractOutputDirectivesFromText(
  text: string,
  phaseTitle?: string,
): PlaybookOutputDirective[] {
  const directives: PlaybookOutputDirective[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!/\boutput\b/i.test(line)) continue;
    const location = inferRelativeLocation(line);
    const titlePrefix = titlePrefixFromDirective(line);
    if (!location || !titlePrefix) continue;
    directives.push({
      location,
      titlePrefix,
      ...(phaseTitle ? { phaseTitle } : {}),
    });
  }
  return directives;
}

function extractFromSection(section: PlaybookSection): PlaybookOutputDirective[] {
  return extractOutputDirectivesFromText(
    renderPlaybookSection(section.content),
    section.title || undefined,
  );
}

export function extractPlaybookOutputDirectives(
  playbook: ParsedPlaybook,
  phaseIndexes?: number[],
): PlaybookOutputDirective[] {
  const selectedPhases = phaseIndexes
    ? phaseIndexes.flatMap((index) => playbook.phases[index] ?? [])
    : playbook.phases;
  return [
    ...extractFromSection(playbook.standingRules),
    ...selectedPhases.flatMap(extractFromSection),
  ];
}

export function resolvePlaybookOutputLocation(
  directives: PlaybookOutputDirective[] | undefined,
  artifactTitle: string,
): RelativeOutputLocation | undefined {
  if (!directives?.length) return undefined;
  const normalizedTitle = normalizeTitle(artifactTitle);
  return directives
    .filter((directive) =>
      normalizedTitle.startsWith(normalizeTitle(directive.titlePrefix)),
    )
    .sort((left, right) => right.titlePrefix.length - left.titlePrefix.length)[0]
    ?.location;
}
