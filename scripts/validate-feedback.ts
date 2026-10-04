/**
 * feedback:check — the in-app feedback form files issues that look like the
 * repo's own templates, and the server applies only safe labels.
 *
 * Pins:
 *  1. Template drift: every `.github/ISSUE_TEMPLATE/<file>` bold heading has a
 *     matching field in its FEEDBACK_KINDS entry, in order (the in-app form
 *     may omit a template's "Screenshots"/"References" sections — attachments
 *     happen on GitHub after filing), and the template's `labels:` equals the
 *     kind's githubLabel. Editing a template without the form fails here.
 *  2. Label allowlist: composeIssue drops labels outside FEEDBACK_AREAS
 *     (no `hard-bug`, `wontfix`, …), caps areas, and adds the severe label
 *     only to bugs.
 *  3. Opt-ins: no Diagnostics block without diagnostics; the reporter row
 *     appears only when the server passes one.
 *  4. Starter scaffolds and empty list items don't count as content (and are
 *     dropped from the body), and required fields block.
 *  5. The GitHub fallback URL stays under its length cap with a huge body.
 *  6. Type flags: each flag IS a kind's githubLabel; flags add labels only
 *     on a Small change; unknown flags are dropped.
 *  7. "More labels": extras apply only from the permitted set and are
 *     capped; members never get triage-only labels (owners/admins do); the
 *     candidates exclude what the form already shows.
 *  8. Screenshots: clipboard "image.png" gets a distinct timestamped name,
 *     extensions follow the bytes sent, alt text can't break the markdown,
 *     placeholders are unique, insertion lands on its own line, and local
 *     origins are flagged (GitHub can't fetch them).
 *
 * Run: pnpm feedback:check
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEEDBACK_AREAS,
  FEEDBACK_KINDS,
  FEEDBACK_KIND_ORDER,
  FEEDBACK_LIMITS,
  FEEDBACK_SEVERE_LABEL,
  FEEDBACK_TRIAGE_ONLY_LABELS,
  FEEDBACK_TYPE_FLAGS,
  buildGitHubNewIssueUrl,
  composeIssue,
  extraLabelCandidates,
  missingRequired,
  permittedRepoLabels,
  type FeedbackInput,
  type RepoLabel,
} from "../lib/domain/feedback/issue-templates";
import {
  imageMarkdown,
  insertAtSelection,
  isLocalOrigin,
  screenshotFileName,
  uploadPlaceholder,
} from "../lib/domain/feedback/attachments";

let failures = 0;
function check(cond: boolean, message: string) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

// Sections the in-app form deliberately leaves to GitHub (attachments).
const ATTACHMENT_HEADINGS = new Set(["Screenshots", "References"]);

// 1. Template drift
for (const kind of FEEDBACK_KIND_ORDER) {
  const def = FEEDBACK_KINDS[kind];
  const raw = readFileSync(join(process.cwd(), ".github/ISSUE_TEMPLATE", def.templateFile), "utf8");
  const frontLabels = raw.match(/^labels:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  check(frontLabels === def.githubLabel, `${def.templateFile}: labels "${frontLabels}" ≠ githubLabel "${def.githubLabel}"`);
  const frontTitle = raw.match(/^title:\s*(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
  check(frontTitle === def.titlePrefix, `${def.templateFile}: title "${frontTitle}" ≠ titlePrefix "${def.titlePrefix}"`);

  const templateHeadings = [...raw.matchAll(/^\*\*(.+?)\*\*\s*$/gm)]
    .map((m) => m[1].trim())
    .filter((h) => !ATTACHMENT_HEADINGS.has(h));
  const formHeadings = def.fields.map((f) => f.heading);
  check(
    JSON.stringify(templateHeadings) === JSON.stringify(formHeadings),
    `${def.templateFile}: headings drifted\n      template: ${JSON.stringify(templateHeadings)}\n      form:     ${JSON.stringify(formHeadings)}`,
  );
}

const base = (over: Partial<FeedbackInput> = {}): FeedbackInput => ({
  kind: "bug",
  title: "Tabs jump",
  fields: { description: "It jumps." },
  areas: [],
  diagnostics: null,
  ...over,
});

// 2. Label allowlist
{
  const issue = composeIssue(base({ areas: ["hard-bug", "wontfix", "Filetree"] }));
  check(JSON.stringify(issue.labels) === JSON.stringify(["bug", "Filetree"]), `allowlist: got ${JSON.stringify(issue.labels)}`);

  const many = composeIssue(base({ areas: FEEDBACK_AREAS.map((a) => a.label) }));
  check(many.labels.length === 1 + FEEDBACK_LIMITS.areas, `area cap: got ${many.labels.length} labels`);

  check(composeIssue(base({ severe: true })).labels.includes(FEEDBACK_SEVERE_LABEL), "severe bug carries the severe label");
  const severeFeature = composeIssue({ ...base({ severe: true }), kind: "feature", fields: { problem: "x" } });
  check(!severeFeature.labels.includes(FEEDBACK_SEVERE_LABEL), "severe never applies to a non-bug");

  const mod = composeIssue({ ...base(), kind: "modification", title: "Wider tabs", fields: { existing: "Tabs", change: "Wider" } });
  check(mod.title === "[Modification]: Wider tabs", `modification title prefix: got "${mod.title}"`);
  const modTwice = composeIssue({ ...base(), kind: "modification", title: "[Modification]: Wider tabs", fields: { existing: "a", change: "b" } });
  check(modTwice.title === "[Modification]: Wider tabs", "title prefix is not doubled");
}

// 3. Opt-ins
{
  const plain = composeIssue(base());
  check(!plain.body.includes("Diagnostics"), "no Diagnostics block without diagnostics or reporter");
  const withDiag = composeIssue(base({ diagnostics: { page: "/content", browser: "UA | pipe" } }));
  check(withDiag.body.includes("| Page | /content |"), "diagnostics rows render");
  check(withDiag.body.includes("UA \\| pipe"), "pipes in diagnostics are escaped");
  check(!withDiag.body.includes("Reporter"), "no reporter row unless the server adds one");
  const withReporter = composeIssue(base(), { reporter: "dv (owner)" });
  check(withReporter.body.includes("| Reporter | dv (owner) |"), "server reporter row renders");
}

// 4. Starters and required fields
{
  const starterOnly = composeIssue(base({ fields: { description: "x", reproduce: "1. \n2. \n3. " } }));
  check(!starterOnly.body.includes("To Reproduce"), "an untouched starter scaffold is not emitted");
  const partial = composeIssue(base({ fields: { description: "x", reproduce: "1. this\n2. \n3. " } }));
  check(partial.body.includes("**To Reproduce**\n1. this\n\n"), `empty starter items dropped: got ${JSON.stringify(partial.body.slice(0, 120))}`);
  const blankBoxes = composeIssue({ ...base(), kind: "modification", fields: { existing: "a", change: "b", acceptance: "- [ ] \n- [ ] " } });
  check(!blankBoxes.body.includes("Acceptance criteria"), "a field of empty checkboxes is not emitted");
  check(missingRequired({ kind: "bug", title: "t", fields: { description: "1. \n2. " } }).join(",") === "What happened",
    "a required field holding only empty list items is still missing");
  check(missingRequired({ kind: "bug", title: "", fields: {} }).join(",") === "Title,What happened", "required: title + description");
  check(missingRequired({ kind: "modification", title: "t", fields: { existing: "a" } }).join(",") === "The change", "required: modification change");
}

// 5. Fallback URL length
{
  const huge = composeIssue(base({ fields: { description: "word ".repeat(5_000) } }));
  const url = buildGitHubNewIssueUrl(huge);
  check(url.length <= 7_500, `fallback URL capped: ${url.length} chars`);
  check(url.startsWith("https://github.com/") && url.includes("labels=bug"), "fallback URL targets the repo with labels");
}

// 6. Type flags
{
  for (const flag of FEEDBACK_TYPE_FLAGS) {
    check(FEEDBACK_KINDS[flag.kind].githubLabel === flag.label, `flag ${flag.label} ≠ ${flag.kind}'s githubLabel`);
  }
  const bugWithFlags = composeIssue(base({ flags: ["enhancement"] }));
  check(JSON.stringify(bugWithFlags.labels) === JSON.stringify(["bug"]), `flags ignored outside Small change: got ${JSON.stringify(bugWithFlags.labels)}`);
  const modFlags = composeIssue({ ...base(), kind: "modification", fields: { existing: "a", change: "b" }, flags: ["bug", "wontfix"] });
  check(modFlags.labels[0] === "bug" && modFlags.labels.includes("minor-modification") && !modFlags.labels.includes("wontfix"),
    `Small change flags lead and are allowlisted: got ${JSON.stringify(modFlags.labels)}`);
}

// 7. More labels
{
  const repo: RepoLabel[] = [
    { name: "bug", color: "e99695", description: "Something isn't working" },
    { name: "Filetree", color: "aaaaaa", description: null },
    { name: "Fatal", color: "b60205", description: null },
    { name: "question", color: "d876e3", description: "Further information is requested" },
    { name: "documentation", color: "0075ca", description: null },
    { name: "hard-bug", color: "dd6005", description: "Owner handles personally" },
    { name: "wontfix", color: "ffffff", description: null },
  ];
  const member = permittedRepoLabels(repo, "member").map((l) => l.name);
  check(!member.some((n) => FEEDBACK_TRIAGE_ONLY_LABELS.has(n)), `member sees no triage labels: got ${JSON.stringify(member)}`);
  const owner = permittedRepoLabels(repo, "owner").map((l) => l.name);
  check(owner.includes("hard-bug") && owner.includes("wontfix"), "owner sees triage labels");
  const candidates = extraLabelCandidates(permittedRepoLabels(repo, "owner")).map((l) => l.name);
  check(JSON.stringify(candidates) === JSON.stringify(["documentation", "hard-bug", "question", "wontfix"]),
    `candidates exclude flags/areas/severe and sort: got ${JSON.stringify(candidates)}`);

  const noSet = composeIssue(base({ extraLabels: ["question"] }));
  check(!noSet.labels.includes("question"), "extras need a permitted set");
  const memberSet = new Set(extraLabelCandidates(permittedRepoLabels(repo, "member")).map((l) => l.name));
  const asMember = composeIssue(base({ extraLabels: ["question", "hard-bug", "not-a-label"] }), undefined, { permittedExtras: memberSet });
  check(asMember.labels.includes("question") && !asMember.labels.includes("hard-bug") && !asMember.labels.includes("not-a-label"),
    `member extras filtered: got ${JSON.stringify(asMember.labels)}`);
  const lots = new Set(["a", "b", "c", "d", "e", "f"]);
  const capped = composeIssue(base({ extraLabels: [...lots] }), undefined, { permittedExtras: lots });
  check(capped.labels.length === 1 + FEEDBACK_LIMITS.extras, `extras capped: got ${capped.labels.length}`);
}

// 8. Screenshots
{
  const at = new Date(2026, 9, 4, 9, 5, 7);
  check(screenshotFileName("image.png", "image/png", at) === "screenshot-20261004-090507.png",
    `clipboard name: got ${screenshotFileName("image.png", "image/png", at)}`);
  check(screenshotFileName("Bug repro.png", "image/webp", at) === "Bug repro.webp", "real name kept, extension follows bytes");
  check(screenshotFileName("a/b:c.png", "image/jpeg", at) === "a-b-c.jpg", "unsafe filename characters replaced");
  check(imageMarkdown("x](evil)[y", "https://h/f/t") === "![x (evil) y](https://h/f/t)", "alt text can't close the link early");
  check(imageMarkdown("", "u") === "![screenshot](u)", "empty alt falls back");
  check(uploadPlaceholder(1, "image.png") !== uploadPlaceholder(2, "image.png"), "placeholders are unique per upload");

  const mid = insertAtSelection("before after", 7, 7, "IMG");
  check(mid.value === "before \nIMG\nafter" && mid.cursor === "before \nIMG".length, `mid-line insert: got ${JSON.stringify(mid)}`);
  const empty = insertAtSelection("", 0, 0, "IMG");
  check(empty.value === "IMG" && empty.cursor === 3, "insert into empty field adds no blank lines");
  const replaced = insertAtSelection("keep THIS keep", 5, 9, "IMG");
  check(replaced.value === "keep \nIMG\n keep", `insert replaces the selection: got ${JSON.stringify(replaced.value)}`);

  check(isLocalOrigin("http://localhost:3015") && isLocalOrigin("http://192.168.0.96:3015") && isLocalOrigin("http://127.0.0.1"),
    "local origins flagged");
  check(!isLocalOrigin("https://davidvalentine.org") && !isLocalOrigin("https://172.32.0.1"), "public origins not flagged");
}

if (failures > 0) {
  console.error(`\nfeedback:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("feedback:check — OK (templates in sync, label allowlist, opt-ins, starters, fallback URL, type flags, more labels, screenshots)");
