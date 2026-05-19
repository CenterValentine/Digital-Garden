/**
 * Static theme-coverage audit for block CSS.
 *
 * Walks app/globals.css and flags rules that use "extreme" colors
 * (white-ish or dark-ish) on a `.block-*` element without a matching
 * `.dark` companion for the same SURFACE. Surface is inferred from the
 * selector prefix:
 *
 *   - publisher: `.public-prose .block-*`
 *   - editor:    `.ProseMirror .block-*`
 *   - both:      `:is(.ProseMirror, .public-prose) .block-*` (the
 *                unified prefix used by layout blocks — counts for both
 *                surfaces independently)
 *
 * The bug classes this catches:
 *
 *   - Dark-mode-first: `color: #fff` / `rgba(255,255,255,…)` with no
 *     light-mode override → block invisible on light surface
 *     (8 publishing blocks fixed in 61cb06c + 4410c2d)
 *
 *   - Light-mode-first: `color: #111827` / `rgba(0,0,0,…)` with no
 *     dark-mode override → block invisible on dark surface
 *     (2 publishing blocks fixed in 2896d91; tab-bar fixed in 7210424)
 *
 * The script reports CANDIDATES, not certain bugs. Some "extreme color
 * without theme companion" cases are intentional (e.g. text inside a
 * theme-stable surface like the cta-banner variants, where the surface
 * fixes the text color and theme doesn't matter). Human triage finalizes.
 *
 * Run via `pnpm publishing:audit:themes`. Optional flag:
 *   --surface=publisher|editor|both  (default: both)
 *
 * No CI gate yet — the script's false-positive rate needs settling
 * before it can be required.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

type Surface = "publisher" | "editor";

const SURFACES: readonly Surface[] = ["publisher", "editor"] as const;

const REPO_ROOT = process.cwd();
const CSS_PATH = join(REPO_ROOT, "app/globals.css");

// Surface detection — each tuple is [pattern, surfaces this prefix covers].
// Order matters: the unified prefix must be checked before the bare ones.
const PREFIX_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  surfaces: readonly Surface[];
}> = [
  // Unified: `:is(.ProseMirror, .public-prose) .block-foo` (either order)
  {
    pattern: /:is\([^)]*\.ProseMirror[^)]*\.public-prose[^)]*\)|:is\([^)]*\.public-prose[^)]*\.ProseMirror[^)]*\)/,
    surfaces: ["publisher", "editor"],
  },
  // Publisher-only: `.public-prose .block-foo`
  { pattern: /\.public-prose(?!\s*,)/, surfaces: ["publisher"] },
  // Editor-only: `.ProseMirror .block-foo`
  { pattern: /\.ProseMirror(?!\s*,)/, surfaces: ["editor"] },
];

// A light-default rule opener targeting some `.block-foo`. The selector
// must start with one of the prefix forms above. We capture the block
// name (group 1) and the full selector text (group 0 trimmed).
const LIGHT_OPENER =
  /^\s*((?:\.public-prose|\.ProseMirror|:is\([^)]*\))\s+[^{]*?\.(block-[a-z][\w-]*)[^{]*)\{/;
// Dark scope: same patterns but with `.dark ` prefix.
const DARK_OPENER =
  /^\s*\.dark\s+((?:\.public-prose|\.ProseMirror|:is\([^)]*\))\s+[^{]*?\.(block-[a-z][\w-]*)[^{]*)\{?/;

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
  surfaces: readonly Surface[];
}

function surfacesForSelector(selector: string): readonly Surface[] {
  for (const { pattern, surfaces } of PREFIX_PATTERNS) {
    if (pattern.test(selector)) return surfaces;
  }
  return [];
}

function parseSurfaceFlag(): readonly Surface[] {
  const arg = process.argv.find((a) => a.startsWith("--surface="));
  if (!arg) return SURFACES;
  const value = arg.slice("--surface=".length);
  if (value === "publisher" || value === "editor") return [value];
  if (value === "both") return SURFACES;
  console.error(`Unknown surface "${value}". Use publisher|editor|both.`);
  process.exit(2);
}

function main(): void {
  const requested = parseSurfaceFlag();
  const lines = readFileSync(CSS_PATH, "utf8").split("\n");

  // Per-surface dark coverage: blockName -> set of surfaces with .dark rules.
  const darkBlockCoverage = new Map<string, Set<Surface>>();
  const candidates: Candidate[] = [];

  let currentBlock = "";
  let currentSelector = "";
  let currentSurfaces: readonly Surface[] = [];
  let inDarkScope = false;
  let inBlockRule = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.match(/^\s*\}/) && !line.includes("{")) {
      currentBlock = "";
      currentSelector = "";
      currentSurfaces = [];
      inDarkScope = false;
      inBlockRule = false;
      continue;
    }

    const darkMatch = line.match(DARK_OPENER);
    if (darkMatch) {
      const block = darkMatch[2]!;
      const sel = darkMatch[1]!.trim();
      const surfaces = surfacesForSelector(sel);
      const set = darkBlockCoverage.get(block) ?? new Set<Surface>();
      for (const s of surfaces) set.add(s);
      darkBlockCoverage.set(block, set);
      currentBlock = block;
      currentSelector = sel;
      currentSurfaces = surfaces;
      inDarkScope = true;
      inBlockRule = true;
      continue;
    }

    const lightMatch = line.match(LIGHT_OPENER);
    if (lightMatch) {
      currentBlock = lightMatch[2]!;
      currentSelector = lightMatch[1]!.trim();
      currentSurfaces = surfacesForSelector(currentSelector);
      inDarkScope = false;
      inBlockRule = true;
      continue;
    }

    if (!inBlockRule || !currentBlock || currentSurfaces.length === 0) continue;
    if (inDarkScope) continue;

    const extremeMatch =
      line.match(EXTREME_LIGHT_COLOR) || line.match(EXTREME_DARK_COLOR);
    if (extremeMatch) {
      // Suppress: if the same rule body sets a background color (i.e.
      // it's a button or chip with its own surface), the extreme text
      // color is intended contrast against that local background, not
      // the page background. Scan forward to the closing brace.
      let ruleHasBackground = false;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]!;
        if (next.match(/^\s*\}/) && !next.includes("{")) break;
        if (/^\s*background(?:-color)?\s*:/.test(next)) {
          ruleHasBackground = true;
          break;
        }
      }
      // Also check earlier in the current rule body.
      if (!ruleHasBackground) {
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j]!;
          if (/\{\s*$/.test(prev)) break;
          if (/^\s*\}/.test(prev)) break;
          if (/^\s*background(?:-color)?\s*:/.test(prev)) {
            ruleHasBackground = true;
            break;
          }
        }
      }
      if (!ruleHasBackground) {
        candidates.push({
          blockName: currentBlock,
          selector: currentSelector,
          line: i + 1,
          color: extremeMatch[0],
          surfaces: currentSurfaces,
        });
      }
    }
  }

  // A candidate is reported when AT LEAST ONE of its surfaces has no
  // .dark coverage. We track which surface(s) lack coverage per issue.
  const issues = candidates
    .map((c) => {
      const covered = darkBlockCoverage.get(c.blockName) ?? new Set<Surface>();
      const missing = c.surfaces.filter(
        (s) => requested.includes(s) && !covered.has(s),
      );
      return { ...c, missing };
    })
    .filter((c) => c.missing.length > 0);

  if (issues.length === 0) {
    const total = Array.from(darkBlockCoverage.values()).reduce(
      (acc, set) => acc + set.size,
      0,
    );
    console.log(
      `\nNo theme-coverage candidates flagged (surface=${requested.join("+")}). ${total} (block × surface) dark override(s) found.\n`,
    );
    return;
  }

  console.log(
    `\nTheme-coverage candidates: ${issues.length} extreme-color rule(s) on ${new Set(issues.map((c) => c.blockName)).size} block(s) missing a .dark companion (surface=${requested.join("+")}).\n`,
  );

  // Group by block name for readability.
  const grouped = new Map<string, typeof issues>();
  for (const issue of issues) {
    const list = grouped.get(issue.blockName) ?? [];
    list.push(issue);
    grouped.set(issue.blockName, list);
  }

  const sortedBlocks = Array.from(grouped.keys()).sort();
  for (const blockName of sortedBlocks) {
    console.log(`  ${blockName}`);
    for (const issue of grouped.get(blockName)!) {
      const surfaceTag = `[${issue.missing.join("+")}]`;
      console.log(
        `    L${issue.line} ${surfaceTag}: ${issue.color.replace(/\s+/g, " ")}  in  ${issue.selector}`,
      );
    }
    console.log("");
  }

  console.log(
    "Each candidate is a `.block-*` rule using an extreme color\n" +
      "(white-ish or dark-ish) on the indicated surface(s) with no\n" +
      "matching `.dark` companion. Some are intentional (theme-stable\n" +
      "publishing surfaces, editor-only chrome that already inherits a\n" +
      "themed parent color, etc.). Triage per block.\n",
  );
}

main();
