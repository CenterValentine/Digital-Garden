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

function parseModeFlag(): "theme-coverage" | "unification-candidates" {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  if (!arg) return "theme-coverage";
  const value = arg.slice("--mode=".length);
  if (value === "theme-coverage" || value === "unification-candidates") return value;
  console.error(`Unknown mode "${value}". Use theme-coverage|unification-candidates.`);
  process.exit(2);
}

/**
 * Mode: unification-candidates
 *
 * After R5 Step 1, the editor's outer block class is kebab-case and
 * matches the publisher's. CSS rules using the unified prefix
 * `:is(.ProseMirror, .public-prose) .block-X` apply to both surfaces.
 * But many existing rules still use `.public-prose .block-X` (publisher-
 * only) for blocks that ARE rendered in the editor too. Those are
 * migration candidates: switching to the unified prefix would close
 * the editor/publisher visual gap for that styling.
 *
 * A candidate is a publisher-only rule on a block that has at least
 * one editor-side rule (either `.ProseMirror .block-X` or the unified
 * prefix). The rule's properties are NOT inspected — caller triages.
 *
 * Reduces the noise vs. flagging every publisher-only rule: blocks
 * that ONLY appear in publisher contexts (no editor-side coverage at
 * all) are correctly excluded.
 */
function runUnificationAudit(lines: string[]): void {
  type BlockSurfaceTrack = {
    publisherOnly: Array<{ line: number; selector: string }>;
    editorOnly: number; // count
    unified: number; // count
  };
  const tracking = new Map<string, BlockSurfaceTrack>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lightMatch = line.match(LIGHT_OPENER);
    if (!lightMatch) continue;
    const selector = lightMatch[1]!.trim();
    const block = lightMatch[2]!;
    const surfaces = surfacesForSelector(selector);
    const entry =
      tracking.get(block) ??
      ({ publisherOnly: [], editorOnly: 0, unified: 0 } as BlockSurfaceTrack);
    if (surfaces.length === 2) {
      entry.unified += 1;
    } else if (surfaces[0] === "publisher") {
      entry.publisherOnly.push({ line: i + 1, selector });
    } else if (surfaces[0] === "editor") {
      entry.editorOnly += 1;
    }
    tracking.set(block, entry);
  }

  const candidates: Array<{ block: string; line: number; selector: string }> = [];
  for (const [block, entry] of tracking) {
    const hasEditorCoverage = entry.editorOnly > 0 || entry.unified > 0;
    if (!hasEditorCoverage) continue;
    for (const rule of entry.publisherOnly) {
      candidates.push({ block, ...rule });
    }
  }

  if (candidates.length === 0) {
    console.log(
      "\nNo unification candidates found. Every publisher-only rule on a block with editor coverage has been migrated.\n",
    );
    return;
  }

  console.log(
    `\nUnification candidates: ${candidates.length} publisher-only rule(s) on ${new Set(candidates.map((c) => c.block)).size} block(s) that also have editor-side coverage. Switching the prefix to \`:is(.ProseMirror, .public-prose)\` would close the editor/publisher visual gap.\n`,
  );

  const grouped = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = grouped.get(c.block) ?? [];
    list.push(c);
    grouped.set(c.block, list);
  }

  for (const block of Array.from(grouped.keys()).sort()) {
    console.log(`  ${block}`);
    for (const c of grouped.get(block)!) {
      console.log(`    L${c.line}: ${c.selector}`);
    }
    console.log("");
  }

  console.log(
    "Each candidate is a `.public-prose .block-X` rule whose block ALSO\n" +
      "has at least one editor-side rule (`.ProseMirror .block-X` or the\n" +
      "unified `:is(...)` prefix). Some publisher-only rules are\n" +
      "intentional (reveal animations, publisher-specific hover, etc.).\n" +
      "Triage per rule — if it's pure visual styling that should look the\n" +
      "same in the editor, switch the prefix to the unified form.\n",
  );
}

function main(): void {
  const mode = parseModeFlag();
  const lines = readFileSync(CSS_PATH, "utf8").split("\n");

  if (mode === "unification-candidates") {
    runUnificationAudit(lines);
    return;
  }

  const requested = parseSurfaceFlag();

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
