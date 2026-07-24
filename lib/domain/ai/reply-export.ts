/**
 * Infer a note title only when the reply already contains title-like
 * structure. Ordinary opening prose deliberately returns an empty string so
 * the export dialog never invents a misleading name.
 */
export function inferReplyExportTitle(markdown: string): string {
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) return cleanTitle(heading[1]);

    const next = lines[index + 1]?.trim() ?? "";
    if (line.length <= 160 && /^={3,}$/.test(next)) {
      return cleanTitle(line);
    }

    const standaloneBold = line.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/);
    if (
      standaloneBold &&
      standaloneBold[1].length <= 160 &&
      !standaloneBold[1].trim().endsWith(":")
    ) {
      return cleanTitle(standaloneBold[1]);
    }
  }

  return "";
}

function cleanTitle(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}
