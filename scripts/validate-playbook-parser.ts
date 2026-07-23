import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";

import { parsePlaybook } from "@/lib/domain/ai/playbooks/parse";
import { renderPlaybookSection } from "@/lib/domain/ai/playbooks/render";
import {
  bindPlaybookToLatestUserMessage,
  createPlaybookMessageAttachmentPart,
  parsePlaybookMessageAttachment,
} from "@/lib/domain/ai/playbooks/message-binding";
import { normalizePersistedToolParts } from "@/lib/domain/ai/tool-state-persistence";

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

const attachmentPart = createPlaybookMessageAttachmentPart({
  id: "playbook-id",
  title: "Test",
  phaseIndex: 0,
  phaseCount: 2,
});
assert.deepEqual(parsePlaybookMessageAttachment(attachmentPart), {
  id: "playbook-id",
  title: "Test",
  phaseIndex: 0,
  phaseCount: 2,
});

const boundMessages = bindPlaybookToLatestUserMessage(
  [
    { role: "user", content: "Earlier request" },
    { role: "assistant", content: "Earlier reply" },
    { role: "user", content: [{ type: "text", text: "Run this playbook." }] },
  ],
  "Test",
);
assert.equal(boundMessages[0]?.content, "Earlier request");
assert.deepEqual(boundMessages[2]?.content, [
  {
    type: "text",
    text:
      '[Attached playbook selected by the user: "Test". ' +
      "This is the procedure to execute for the request below. Its validated current-phase instructions are in the Active Playbook system section. " +
      "Do not read rooted content to identify or discover the playbook; use rooted content only when the request or active phase actually requires it.]",
  },
  { type: "text", text: "Run this playbook." },
]);

const restoredCheckpoint = normalizePersistedToolParts([
  {
    type: "tool-phase_checkpoint",
    toolCallId: "checkpoint-call",
    state: "input-streaming",
    input: {
      phase: "Phase A",
      summary: "All required research is complete.",
    },
  },
]);
assert.deepEqual(restoredCheckpoint, [
  {
    type: "tool-phase_checkpoint",
    toolCallId: "checkpoint-call",
    state: "approval-requested",
    input: {
      phase: "Phase A",
      summary: "All required research is complete.",
    },
    approval: { id: "aitxt-restored-checkpoint-call" },
  },
]);
assert.deepEqual(
  normalizePersistedToolParts([
    {
      type: "tool-phase_checkpoint",
      toolCallId: "incomplete-call",
      state: "input-streaming",
      input: { phase: "Phase A" },
    },
  ]),
  [
    {
      type: "tool-phase_checkpoint",
      toolCallId: "incomplete-call",
      state: "input-streaming",
      input: { phase: "Phase A" },
    },
  ],
  "an incomplete streamed checkpoint must not become actionable",
);

console.log("Playbook parser checks passed.");
