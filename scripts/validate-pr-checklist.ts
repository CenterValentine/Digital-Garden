/**
 * pr-checklist:check — pins the dev PR-checklist widget's parser/toggler
 * (lib/features/dev-banner/pr-checklist.ts). The contract: a toggle flips
 * exactly the addressed line and leaves every other byte of the PR
 * description alone, because the widget writes the whole description back
 * to GitHub.
 */
import { parseChecklist, setChecked } from "../lib/features/dev-banner/pr-checklist";

let failures = 0;
function check(ok: boolean, label: string): void {
  if (!ok) {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

const BODY = [
  "## Sprint 56",
  "",
  "Intro with a fake box in prose: - [ ] not at line start",
  "",
  "## Preflight",
  "",
  "- [x] **Gates:** `pnpm typecheck` green",
  "- [ ] **Smoke #83:** copy a checklist inside a column → only the checklist pastes",
  "  * [ ] nested step",
  "1. [X] numbered item",
  "- [ ] duplicate",
  "- [ ] duplicate",
  "",
  "```md",
  "- [ ] inside a fence is not an item",
  "```",
  "",
  "### Post-merge",
  "- [ ] **Post-merge:** no migration",
].join("\r\n"); // GitHub stores descriptions with CRLF when edited in the browser

const items = parseChecklist(BODY);
check(items.length === 7, `finds 7 items (got ${items.length})`);
check(items[0]?.checked === true && items[0]?.heading === "Preflight", "first item checked, under Preflight");
check(items[1]?.isSmoke === true && items[0]?.isSmoke === false, "smoke marker detected only on smoke lines");
check(items[2]?.text === "nested step", "nested `*` items parse");
check(items[3]?.checked === true, "numbered + capital X parses as checked");
check(items[4]?.occurrence === 0 && items[5]?.occurrence === 1, "duplicate texts get distinct occurrences");
check(items[6]?.heading === "Post-merge", "heading tracks the nearest heading");
check(!items.some((i) => i.text.includes("inside a fence")), "fenced code is skipped");

// Toggle the smoke line on: exactly one line changes, CRLF preserved.
const ticked = setChecked(BODY, { text: items[1].text, occurrence: 0 }, true);
check(ticked !== null, "toggle finds the smoke line");
if (ticked) {
  const before = BODY.split("\r\n");
  const after = ticked.split("\r\n");
  const changed = before.filter((l, i) => l !== after[i]);
  check(before.length === after.length, "line count unchanged (CRLF preserved)");
  check(changed.length === 1 && changed[0].includes("Smoke #83"), "exactly the smoke line changed");
  check(after[7] === "- [x] **Smoke #83:** copy a checklist inside a column → only the checklist pastes", "box set to [x], text untouched");
  check(setChecked(ticked, { text: items[1].text, occurrence: 0 }, false) === BODY, "untick round-trips byte-for-byte");
}

// The second duplicate, not the first.
const dup = setChecked(BODY, { text: "duplicate", occurrence: 1 }, true);
check(dup?.split("\r\n")[10] === "- [ ] duplicate" && dup?.split("\r\n")[11] === "- [x] duplicate", "occurrence addresses the right duplicate");

// Gone from the body → null (caller refreshes instead of guessing).
check(setChecked(BODY, { text: "no such line", occurrence: 0 }, true) === null, "missing item returns null");
check(setChecked(BODY, { text: "duplicate", occurrence: 2 }, true) === null, "out-of-range occurrence returns null");
check(setChecked(BODY, { text: "inside a fence is not an item", occurrence: 0 }, true) === null, "fenced lines are never toggled");

if (failures > 0) {
  console.error(`\npr-checklist:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("pr-checklist:check — OK (parse, headings, smoke marker, fences, duplicates, single-line toggle, CRLF round-trip)");
