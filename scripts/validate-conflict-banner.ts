/**
 * Save-conflict escape-hatch gate.
 *
 * Invariant: **anything that can pause saving must be able to show its way out.**
 *
 * `MainPanelContent.handleSave` refuses every save while a conflict is open for
 * the document. The only exit is `SaveConflictBanner`'s Keep mine / Take theirs.
 * For months that banner was mounted INSIDE the note editor's title header —
 * a branch the folder/charter, database and other non-note layouts never
 * render. A conflict raised on one of those bodies therefore had no exit at
 * all: the stashed draft replaced the view on every load, and every save was
 * paused, silently and permanently. It cost the owner a day of charter edits
 * ("Career Hunt II", 2026-09-15) and was invisible because the paused branch
 * logged nothing.
 *
 * The fix was to hoist the banner above every layout branch. This gate keeps it
 * there: exactly one mount, at brace depth 2 (the component's outermost JSX
 * div), never nested inside a conditional layout branch.
 *
 * Run: pnpm conflict-banner:check
 */
import { readFileSync } from "node:fs";

const FILE = "components/content/content/MainPanelContent.tsx";
const BANNER = "<SaveConflictBanner";
const GUARD = "getConflict(selectedContentId)";

const src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const errors: string[] = [];

// The guard this banner is the exit for. If it is ever removed, the gate has
// no reason to exist and should be deleted deliberately, not left passing.
if (!src.includes(GUARD)) {
  errors.push(
    `The save-pause guard \`${GUARD}\` is gone from ${FILE}.\n` +
      `    If conflicts no longer pause saving, delete this gate on purpose.`,
  );
}

const mounts = lines
  .map((line, i) => ({ line, n: i + 1 }))
  .filter(({ line }) => line.includes(BANNER));

if (mounts.length === 0) {
  errors.push(
    `No ${BANNER} mount in ${FILE}.\n` +
      `    A conflict can pause every save for a document with no way to resolve it.`,
  );
} else if (mounts.length > 1) {
  errors.push(
    `${mounts.length} ${BANNER} mounts in ${FILE} (lines ${mounts.map((m) => m.n).join(", ")}).\n` +
      `    Per-layout copies are how this broke: one branch gets the banner, the\n` +
      `    next one added does not. Mount it ONCE above every branch.`,
  );
}

// Depth check. Indentation is the honest proxy here: a real JSX-aware parse
// would need the TS AST, and the file is Prettier-formatted, so the outermost
// content div's children sit at exactly 8 spaces. A mount nested inside a
// conditional layout branch is indented further.
const OUTERMOST_CHILD_INDENT = 8;
for (const { line, n } of mounts) {
  const indent = line.length - line.trimStart().length;
  if (indent > OUTERMOST_CHILD_INDENT) {
    errors.push(
      `${BANNER} at ${FILE}:${n} is indented ${indent} spaces.\n` +
        `    That puts it inside a layout branch, so content types rendered by a\n` +
        `    DIFFERENT branch lose their only escape from a paused save.\n` +
        `    Mount it beside <ContentToolbar>, above the isNonNoteContent split.`,
    );
  }
}

if (errors.length > 0) {
  console.error(`\n✖ conflict-banner:check failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ${e}\n`);
  process.exit(1);
}
console.log(
  `✓ conflict-banner:check — one banner mount at depth ${
    mounts[0].line.length - mounts[0].line.trimStart().length
  }, above every layout branch`,
);
