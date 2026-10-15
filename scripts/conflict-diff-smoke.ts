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
  const {
    compareVersions,
    toComparableLines,
    sameProjectedText,
    sameCanonicalJson,
  } = await import("@/lib/domain/content/conflict-diff");

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
  check("reported text-identical", same.textIdentical, true);
  check("reported structurally identical", same.structurallyIdentical, true);
  check("no sections flagged", same.changedSections, []);

  console.log("\nsame words, different structure");

  // THE CASE THIS RESOLVER EXISTS TO EXPLAIN. A save is refused on a hash over
  // the whole node tree; this diff compares a TEXT projection. When a doc
  // round-trips through the server sanitizer or comes back as a Y.doc snapshot
  // from the collaboration schema, attributes materialize differently for prose
  // that is word-for-word the same. Collapsing both facts into one `identical`
  // flag made the dialog announce "the two versions are identical" over a live
  // block — the app contradicting itself (owner report, 2026-09-17).
  const structural = compareVersions(
    doc({ ...heading(1, "Job Hunting"), attrs: { level: 1, textAlign: null } }, para("Body")),
    doc(heading(1, "Job Hunting"), para("Body")),
  );
  check("the words match", structural.textIdentical, true);
  check("the JSON does not", structural.structurallyIdentical, false);
  check("so the diff shows nothing added", structural.added, 0);
  check("and nothing removed", structural.removed, 0);

  console.log("\nthe two questions, asked directly");

  // `sameProjectedText` is what decides whether a stashed conflict draft is
  // worth re-raising on load. Answering that with canonical JSON is what left a
  // permanent, per-document save-pause: the stash is raw editor JSON and the
  // server copy is sanitized, so they never matched (PR #237's check).
  const rawDraft = doc(para("Body"));
  const sanitizedServerCopy = doc({ ...para("Body"), attrs: { textAlign: null } });
  check("a sanitized round-trip still READS the same", sameProjectedText(rawDraft, sanitizedServerCopy), true);
  check("but is not the same JSON", sameCanonicalJson(rawDraft, sanitizedServerCopy), false);
  check("key order alone is not a difference", sameCanonicalJson(
    { type: "doc", content: [para("Body")] },
    { content: [para("Body")], type: "doc" },
  ), true);
  check("a real edit is not the same text", sameProjectedText(doc(para("one")), doc(para("two"))), false);

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

  check("not text-identical", edit.textIdentical, false);
  check("and not structurally identical either", edit.structurallyIdentical, false);
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
  check("both empty is text-identical", compareVersions(null, null).textIdentical, true);
  check("both empty is structurally identical", compareVersions(null, null).structurallyIdentical, true);
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
