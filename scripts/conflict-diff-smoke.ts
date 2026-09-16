/**
 * Smoke test for the save-conflict version comparison.
 *
 * This logic is only reachable mid-conflict — a state a person hits rarely and
 * a test suite never hits by accident — which makes it exactly the kind that
 * rots unnoticed. It is also the last thing standing between a user and the
 * wrong choice about which version of their work survives.
 *
 * Run: pnpm conflict-diff:smoke
 */

export {};

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${
      ok ? "" : `\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(expected)}`
    }`,
  );
}

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

async function main() {
  const { compareVersions, toComparableLines } = await import(
    "@/lib/domain/content/conflict-diff"
  );

  console.log("\nprojection");

  check(
    "headings keep their level, so structure survives into the diff",
    toComparableLines(doc(heading(2, "Screening"), para("Body"))),
    ["## Screening", "Body"],
  );
  check(
    "list items render as markers, not as a wall of text",
    toComparableLines(
      doc({
        type: "bulletList",
        content: [
          { type: "listItem", content: [para("first")] },
          { type: "listItem", content: [para("second")] },
        ],
      }),
    ),
    ["- first", "- second"],
  );
  // A removed image or divider is a real difference; dropping textless blocks
  // would make the diff claim two documents match when they do not.
  check(
    "a textless block still emits a line",
    toComparableLines(doc({ type: "horizontalRule" }, { type: "image", attrs: { src: "x" } })),
    ["---", "[image]"],
  );

  console.log("\nidentical documents");

  const same = compareVersions(doc(heading(1, "Job Hunting"), para("Body")), doc(heading(1, "Job Hunting"), para("Body")));
  check("no additions", same.added, 0);
  check("no removals", same.removed, 0);
  check("reported identical", same.identical, true);
  check("no sections flagged", same.changedSections, []);

  console.log("\na real edit");

  const theirs = doc(
    heading(1, "Job Hunting"),
    heading(2, "Required record"),
    para("major uncertainty or possible disqualifier;"),
    heading(2, "Cadence"),
    para("Daily review."),
  );
  const mine = doc(
    heading(1, "Job Hunting"),
    heading(2, "Required record"),
    para("major and minor gaps;"),
    heading(2, "Cadence"),
    para("Daily review."),
  );
  const edit = compareVersions(mine, theirs);

  check("not identical", edit.identical, false);
  check("one line added", edit.added, 1);
  check("one line removed", edit.removed, 1);
  // The orienting fact. In a 70-block charter, naming the section beats every
  // word count on the header.
  check("the changed section is named", edit.changedSections, ["Required record"]);
  check("untouched sections are not named", edit.changedSections.includes("Cadence"), false);

  // A rewrite must not read as "whole paragraph gone, whole paragraph new".
  const rewritten = edit.rows.find((r) => r.kind === "added" && r.words);
  check("a rewritten line carries word-level spans", Boolean(rewritten), true);
  check(
    "unchanged words inside it are not highlighted",
    rewritten?.words?.some((w) => !w.changed),
    true,
  );
  check(
    "changed words inside it are highlighted",
    rewritten?.words?.some((w) => w.changed),
    true,
  );

  console.log("\ndirection (which button keeps what)");

  // `added` must mean "present in MINE", or the header's counts invert and the
  // user reads the diff backwards while choosing.
  const grew = compareVersions(doc(para("one"), para("two")), doc(para("one")));
  check("a line only I have counts as added", grew.added, 1);
  check("and nothing counts as removed", grew.removed, 0);

  const shrank = compareVersions(doc(para("one")), doc(para("one"), para("two")));
  check("a line only THEY have counts as removed", shrank.removed, 1);
  check("and nothing counts as added", shrank.added, 0);

  console.log("\nword counts");
  check("mine counted from my lines", grew.mine.words, 2);
  check("theirs counted from theirs", grew.theirs.words, 1);

  console.log("\nempty and missing documents");
  check("both empty is identical", compareVersions(null, null).identical, true);
  const fromNothing = compareVersions(doc(para("new")), null);
  check("everything is an addition against nothing", fromNothing.added, 1);

  console.log(
    failures === 0
      ? "\n✓ conflict diff smoke passed\n"
      : `\n✖ ${failures} assertion(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
