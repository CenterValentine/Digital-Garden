/**
 * Static theme-coverage audit for publishing-block CSS.
 *
 * Walks app/globals.css and flags `.public-prose .block-*` rules that
 * use "extreme" colors (white-ish or dark-ish) without a `.dark`
 * companion rule for the same block. This is the structural pattern
 * behind both bug classes the publishing audit has surfaced:
 *
 *   - Dark-mode-first: `color: #fff` / `rgba(255,255,255,…)` with no
 *     light-mode override → block invisible on light pages
 *     (8 blocks fixed in commits 61cb06c + 4410c2d)
 *
 *   - Light-mode-first: `color: #111827` / `rgba(0,0,0,…)` with no
 *     dark-mode override → block invisible on dark pages
 *     (2 blocks fixed in commit 2896d91)
 *
 * The script reports CANDIDATES, not certain bugs. Some "extreme color
 * without theme companion" cases are intentional (e.g. text inside a
 * theme-stable surface like the cta-banner variants, where the surface
 * fixes the text color and theme doesn't matter). Human triage finalizes.
 *
 * Run via `pnpm publishing:audit:themes`. No CI gate yet — the script's
 * false-positive rate needs settling before it can be required.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CSS_PATH = join(REPO_ROOT, "app/globals.css");

// A rule opener like `.public-prose .block-foo--variant > .child {` — we
// extract the block name (block-foo). Also matches the unified form
// `:is(.ProseMirror, .public-prose) .block-foo` used by layout blocks
// (columns, tabs, accordion, card-panel, section-header, block-columns)
// so this audit catches editor-shared block CSS too.
const PROSE_PREFIX = String.raw`(?:\.public-prose|:is\([^)]*\.public-prose[^)]*\))`;
const LIGHT_OPENER = new RegExp(
  String.raw`^\s*(${PROSE_PREFIX}\s+\.(block-[a-z][\w-]*)[^{]*)\{`,
);
// `.dark .public-prose .block-foo { ... }` — marks that this block has
// at least one dark-mode override. Also accepts the unified prefix.
const DARK_OPENER = new RegExp(
  String.raw`^\s*\.dark\s+${PROSE_PREFIX}\s+\.(block-[a-z][\w-]*)`,
);

// "Extreme light" color tokens — likely to be invisible on a light page.
const EXTREME_LIGHT_COLOR =
  /color:\s*(#fff(?:fff)?\b|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[5-9]\d*)/i;
// "Extreme dark" color tokens — likely to be invisible on a dark page.
const EXTREME_DARK_COLOR =
  /color:\s*(#000(?:000)?\b|#0[0-9a-f]{5}\b|#1[0-9a-f]{5}\b|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[5-9]\d*)/i;

interface Candidate {
  blockName: string;
  selector: string;
  line: number;
  color: string;
  side: "light-default" | "dark-only";
}

function main(): void {
  const lines = readFileSync(CSS_PATH, "utf8").split("\n");

  const darkBlockCoverage = new Set<string>();
  const candidates: Candidate[] = [];

  // State machine: track the most recent rule opener so each `color:` line
  // knows its block context.
  let currentBlock = "";
  let currentSelector = "";
  let inDarkScope = false;
  let inBlockRule = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Closing brace ends the current rule.
    if (line.match(/^\s*\}/) && !line.includes("{")) {
      currentBlock = "";
      currentSelector = "";
      inDarkScope = false;
      inBlockRule = false;
      continue;
    }

    const darkMatch = line.match(DARK_OPENER);
    if (darkMatch) {
      darkBlockCoverage.add(darkMatch[1]!);
      currentBlock = darkMatch[1]!;
      currentSelector = line.trim();
      inDarkScope = true;
      inBlockRule = true;
      continue;
    }

    const lightMatch = line.match(LIGHT_OPENER);
    if (lightMatch) {
      currentBlock = lightMatch[2]!;
      currentSelector = lightMatch[1]!.trim();
      inDarkScope = false;
      inBlockRule = true;
      continue;
    }

    if (!inBlockRule || !currentBlock) continue;

    if (EXTREME_LIGHT_COLOR.test(line)) {
      const match = line.match(EXTREME_LIGHT_COLOR);
      if (!inDarkScope) {
        // Light-default rule using white-ish color: candidate for being
        // invisible on light pages unless a .dark override flips it dark.
        candidates.push({
          blockName: currentBlock,
          selector: currentSelector,
          line: i + 1,
          color: match![0],
          side: "light-default",
        });
      }
    }

    if (EXTREME_DARK_COLOR.test(line)) {
      const match = line.match(EXTREME_DARK_COLOR);
      if (!inDarkScope) {
        // Light-default rule using black-ish color: candidate for being
        // invisible on dark pages unless a .dark override flips it light.
        candidates.push({
          blockName: currentBlock,
          selector: currentSelector,
          line: i + 1,
          color: match![0],
          side: "light-default",
        });
      }
    }
  }

  // Filter: only candidates whose block lacks any .dark coverage.
  const issues = candidates.filter((c) => !darkBlockCoverage.has(c.blockName));

  if (issues.length === 0) {
    console.log(
      `\nNo theme-coverage candidates flagged. ${darkBlockCoverage.size} block(s) have .dark overrides.\n`,
    );
    return;
  }

  console.log(
    `\nTheme-coverage candidates: ${issues.length} extreme-color rule(s) on ${new Set(issues.map((c) => c.blockName)).size} block(s) without a .dark companion.\n`,
  );

  // Group by block name for readability.
  const grouped = new Map<string, Candidate[]>();
  for (const issue of issues) {
    const list = grouped.get(issue.blockName) ?? [];
    list.push(issue);
    grouped.set(issue.blockName, list);
  }

  const sortedBlocks = Array.from(grouped.keys()).sort();
  for (const blockName of sortedBlocks) {
    console.log(`  ${blockName}`);
    for (const issue of grouped.get(blockName)!) {
      console.log(
        `    L${issue.line}: ${issue.color.replace(/\s+/g, " ")}  in  ${issue.selector}`,
      );
    }
    console.log("");
  }

  console.log(
    "Each candidate is a `.public-prose .block-*` rule using an extreme\n" +
      "color (white-ish or dark-ish) with no `.dark .public-prose .block-X`\n" +
      "companion anywhere in the CSS. Some are intentional (e.g. text on\n" +
      "theme-stable variant surfaces). Triage per block.\n",
  );
}

main();
