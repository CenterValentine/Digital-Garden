/**
 * Dark-mode contrast gate for the content views.
 *
 * Invariant: **text on a themed surface declares a colour for both themes.**
 *
 * Tailwind's `text-gray-900` is near-black in BOTH themes — the class does not
 * adapt. On the glass and slate surfaces the folder views use, an unpaired dark
 * shade renders black-on-dark: the folder title, the Kanban column headers and
 * every card title were unreadable in dark mode for exactly this reason
 * (owner report, 2026-09-16). It is invisible to typecheck, to lint, and to
 * anyone developing in light mode.
 *
 * Scope is the content VIEWS, where surfaces are themed. Dialogs that are
 * deliberately light in both themes are out of scope — they are internally
 * consistent, a different question from contrast.
 *
 * Escape hatch: a surface that is intentionally light in both themes (a drag
 * preview lifted over any background) marks itself with the comment below,
 * which exempts the following few lines.
 *
 * Run: pnpm contrast:check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const SCAN = [
  "components/content/folder-views",
  "components/content/viewer",
];
/** Shades dark enough to disappear on a dark surface. */
const DARK_TEXT = /\btext-(?:gray|neutral|slate|zinc|stone)-(?:500|600|700|800|900)\b/;
const HAS_DARK_VARIANT = /\bdark:text-/;
/** Opt out for a surface that is light in both themes. */
const EXEMPT_MARKER = "Deliberately light in BOTH themes";
const EXEMPT_LINES = 12;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const errors: string[] = [];
for (const root of SCAN) {
  let files: string[];
  try {
    files = walk(join(REPO_ROOT, root));
  } catch {
    continue;
  }
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    const exempt = new Set<number>();
    lines.forEach((line, i) => {
      if (line.includes(EXEMPT_MARKER)) {
        for (let k = i; k < i + EXEMPT_LINES; k += 1) exempt.add(k);
      }
    });
    lines.forEach((line, i) => {
      if (exempt.has(i)) return;
      if (!DARK_TEXT.test(line) || HAS_DARK_VARIANT.test(line)) return;
      errors.push(
        `${relative(REPO_ROOT, file)}:${i + 1}\n` +
          `    ${line.trim().slice(0, 100)}\n` +
          `    Dark text with no dark: companion. Tailwind grays do NOT adapt,\n` +
          `    so this renders black-on-dark. Pair it (text-gray-900 dark:text-gray-100),\n` +
          `    or mark the surface "${EXEMPT_MARKER}" if it is light in both.`,
      );
    });
  }
}

if (errors.length > 0) {
  console.error(`\n✖ contrast:check failed — ${errors.length} unpaired dark text site(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(`✓ contrast:check — every dark text site in the content views declares both themes`);
