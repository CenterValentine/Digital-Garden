/**
 * Speed-reader OCR — a thin adapter over the shared local engine
 * (lib/features/ocr). The engine owns the worker lifecycle: lazy spawn on
 * first use, one worker shared with the editor, termination after it idles.
 * There is deliberately no terminate here: the worker is shared, and only the
 * engine knows whether another caller's job is still running.
 */
import { getOcrEngine } from "@/lib/features/ocr";

/**
 * A table comes back from the engine as markdown (lib/features/ocr/table.ts).
 * A word-at-a-time reader should see its words, not its pipes: drop the
 * separator row and read each row's cells as a comma-separated phrase.
 */
function flattenMarkdownTables(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\|(\s*-{3,}\s*\|)+$/.test(line.trim()))
    .map((line) => {
      const t = line.trim();
      if (!(t.startsWith("|") && t.endsWith("|"))) return line;
      return t
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replace(/\\\|/g, "|"))
        .filter(Boolean)
        .join(", ");
    })
    .join("\n");
}

export async function ocrBlobToReaderText(blob: Blob): Promise<string> {
  const result = await getOcrEngine().recognize(blob);
  return flattenMarkdownTables(result.text).replace(/\n{3,}/g, "\n\n").trim();
}
