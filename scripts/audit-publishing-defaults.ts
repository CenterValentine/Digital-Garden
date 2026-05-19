/**
 * Static drift audit for publishing-block defaults.
 *
 * For each block file under extensions/publishing/blocks/, this script
 * extracts:
 *
 *   - The Zod schema defaults (from `z.string().default("...")` and friends
 *     in the createBlockSchema(...) call)
 *   - The renderHTML inline fallbacks (from
 *     `(HTMLAttributes["data-<key>"] as string) || "<fallback>"` patterns
 *     in the Server<Name>.renderHTML body)
 *
 * It then reports per-block drift where the Zod default and the renderHTML
 * fallback disagree for the same attr.
 *
 * Drift IS NOT NECESSARILY A BUG — empty-fallback in renderHTML can be
 * intentional. This script surfaces the candidates; humans decide.
 *
 * Run via `pnpm publishing:audit:defaults`. No DB access; no CI gate.
 *
 * Output is grouped by block file with a per-attr verdict line per drift.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, basename, relative } from "node:path";

const REPO_ROOT = process.cwd();
const BLOCKS_DIR = join(REPO_ROOT, "extensions/publishing/blocks");

// Matches `someKey: z.string().default("value")` and similar.
// Captures: key, default value.
const ZOD_DEFAULT_RE =
  /\b([a-z][A-Za-z0-9]*)\s*:\s*z\.[a-zA-Z]+(?:\([^)]*\))?\.default\(\s*(?:"([^"]*)"|'([^']*)'|([0-9.+-]+)|(true|false))\s*\)/g;

// Matches the various fallback patterns blocks use:
//   (HTMLAttributes["data-x"] as string) || "fallback"
//   (HTMLAttributes["data-x"] ?? "fallback") as string
//   parseSomething(HTMLAttributes["data-x"] ?? "fallback")
//   HTMLAttributes["data-x"] ?? "fallback"
//
// We capture the kebab data-attr key and the first string literal that
// appears within the same statement (up to `;` or `,` or `)` at top level).
// Numeric/boolean fallbacks (e.g. `?? 40`) are intentionally NOT captured —
// the audit can extend to those if drift is suspected.
const RENDER_FALLBACK_RE =
  /HTMLAttributes\[\s*"data-([a-z0-9-]+)"\s*\][^;]*?(?:\|\||\?\?)\s*"([^"]*)"/g;

interface Drift {
  attr: string;
  zodDefault: string;
  renderFallback: string;
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function extractZodDefaults(source: string): Map<string, string> {
  const defaults = new Map<string, string>();
  for (const match of source.matchAll(ZOD_DEFAULT_RE)) {
    const key = match[1]!;
    const value =
      match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    defaults.set(key, value);
  }
  return defaults;
}

function extractRenderFallbacks(source: string): Map<string, string> {
  const fallbacks = new Map<string, string>();
  for (const match of source.matchAll(RENDER_FALLBACK_RE)) {
    const kebabKey = match[1]!;
    const value = match[2] ?? "";
    fallbacks.set(kebabKey, value);
  }
  return fallbacks;
}

function findDrift(source: string): Drift[] {
  const zodDefaults = extractZodDefaults(source);
  const renderFallbacks = extractRenderFallbacks(source);
  const drift: Drift[] = [];

  for (const [camelKey, zodValue] of zodDefaults) {
    const kebabKey = camelToKebab(camelKey);
    const renderValue = renderFallbacks.get(kebabKey);
    if (renderValue === undefined) continue; // attr not used in renderHTML
    if (renderValue !== zodValue) {
      drift.push({
        attr: camelKey,
        zodDefault: zodValue,
        renderFallback: renderValue,
      });
    }
  }

  return drift;
}

function main(): void {
  const blocks = readdirSync(BLOCKS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  let totalDriftCount = 0;
  const blocksWithDrift: Array<{ file: string; drift: Drift[] }> = [];

  for (const file of blocks) {
    const source = readFileSync(join(BLOCKS_DIR, file), "utf8");
    const drift = findDrift(source);
    if (drift.length > 0) {
      blocksWithDrift.push({ file, drift });
      totalDriftCount += drift.length;
    }
  }

  if (blocksWithDrift.length === 0) {
    console.log(
      `\nNo defaults drift detected across ${blocks.length} publishing blocks.\n`,
    );
    return;
  }

  console.log(
    `\nDefaults drift detected: ${totalDriftCount} attr(s) across ${blocksWithDrift.length} block(s).\n`,
  );
  console.log(
    'Each line: <attr>  Zod="<defaults>"  renderHTML="<fallback>"\n',
  );

  for (const { file, drift } of blocksWithDrift) {
    console.log(`${relative(REPO_ROOT, join(BLOCKS_DIR, file))}`);
    const attrWidth = Math.max(...drift.map((d) => d.attr.length));
    for (const d of drift) {
      console.log(
        `  ${d.attr.padEnd(attrWidth)}  Zod=${JSON.stringify(d.zodDefault)}  renderHTML=${JSON.stringify(d.renderFallback)}`,
      );
    }
    console.log("");
  }

  console.log(
    "These are candidates for R1 (single source of defaults). Drift may be\n" +
      "intentional — empty renderHTML fallback can mean 'don't render this\n" +
      "field if not set' even when the schema has a default. Decide per-attr.\n",
  );
}

main();
