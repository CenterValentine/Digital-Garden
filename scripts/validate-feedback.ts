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
 *  4. Starter scaffolds don't count as content, and required fields block.
 *  5. The GitHub fallback URL stays under its length cap with a huge body.
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
  buildGitHubNewIssueUrl,
  composeIssue,
  missingRequired,
  type FeedbackInput,
} from "../lib/domain/feedback/issue-templates";

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

if (failures > 0) {
  console.error(`\nfeedback:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("feedback:check — OK (templates in sync, label allowlist, opt-ins, starters, fallback URL)");
