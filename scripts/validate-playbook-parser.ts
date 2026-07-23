import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";

import { parsePlaybook } from "@/lib/domain/ai/playbooks/parse";
import { renderPlaybookSection } from "@/lib/domain/ai/playbooks/render";

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

function heading(level: number, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

const structured = parsePlaybook({
  type: "doc",
  content: [
    paragraph("Use current sources."),
    heading(2, "Surface facts"),
    paragraph("Find the product and funding."),
    heading(2, "Read between the lines"),
    paragraph("Infer priorities from [[Hiring Guide|the hiring guide]]."),
  ],
});
assert.equal(structured.phaseLevel, 2);
assert.deepEqual(
  structured.phases.map((phase) => phase.title),
  ["Surface facts", "Read between the lines"],
);
assert.equal(
  renderPlaybookSection(structured.standingRules.content),
  "Use current sources.",
);
assert.deepEqual(structured.phases[1].references, [
  { targetTitle: "Hiring Guide", displayText: "the hiring guide" },
]);

// Regression: a pasted SKILL.md can be stored as literal markdown in ordinary
// TipTap paragraphs. Marking it as a playbook must not produce "0 phases" and
// silently remove the explicit attachment from model context.
const pastedSkill = parsePlaybook({
  type: "doc",
  content: [
    paragraph(`---
name: Company Research Directive
description: Research a company before writing about it.
---
## Phase A: Surface facts
Find the product and funding.
Done when: both are answered.
## Phase B: Read between the lines
Use [[Hiring Guide]] to infer culture.`),
  ],
});
assert.equal(pastedSkill.phaseLevel, 2);
assert.deepEqual(
  pastedSkill.phases.map((phase) => phase.title),
  ["Phase A: Surface facts", "Phase B: Read between the lines"],
);
assert.equal(renderPlaybookSection(pastedSkill.standingRules.content), "");
assert.equal(
  renderPlaybookSection(pastedSkill.phases[0].content),
  "Find the product and funding.\nDone when: both are answered.",
);
assert.deepEqual(pastedSkill.phases[1].references, [
  { targetTitle: "Hiring Guide" },
]);

const unsectioned = parsePlaybook({
  type: "doc",
  content: [paragraph("Research the subject, then summarize the evidence.")],
});
assert.equal(unsectioned.phaseLevel, null);
assert.equal(unsectioned.phases.length, 1);
assert.equal(unsectioned.phases[0].title, "Instructions");
assert.equal(
  renderPlaybookSection(unsectioned.phases[0].content),
  "Research the subject, then summarize the evidence.",
);

const empty = parsePlaybook({ type: "doc", content: [] });
assert.equal(empty.phases.length, 0);

console.log("Playbook parser checks passed.");
