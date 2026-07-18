/**
 * AI authoring reference (AI v3 core S6) — rendered from NODE_TYPE_METADATA
 * so the AI's view of the palette can never drift from the builder's forms
 * or the server's config enforcement: all three consume the same field
 * specs. CLIENT-SAFE like the metadata it renders (no Prisma, no executors).
 */

import { NODE_TYPE_METADATA } from "./metadata";
import type { NodeConfigField, NodeTypeMetadata } from "./metadata";
import { TRIGGER_TYPE_METADATA } from "./triggers";
import {
  WORKFLOW_GRAPH_VERSION,
  WDK_INTERPRETER_ENGINE,
} from "../graph/schema";
import { jobApplicationGraph } from "../graph/fixtures/job-application";

function renderField(field: NodeConfigField): string {
  const flags: string[] = [field.kind];
  if (field.required) flags.push("required");
  if (field.interpolated) flags.push("accepts {{templates}}");
  if (field.options?.length) {
    flags.push(`one of: ${field.options.map((o) => o.value).join(" | ")}`);
  }
  const help = field.help ? ` — ${field.help}` : "";
  return `  - \`${field.key}\` (${flags.join(", ")})${help}`;
}

/**
 * Compact markdown reference the AI reads before authoring a graph:
 * envelope rules + interpolation syntax + every node type with its exact
 * config keys and outputs.
 */
export function renderNodeCatalogForAI(): string {
  const sections: string[] = [
    `# Trellis workflow authoring reference

## Graph envelope (exact shape required)
- \`version\`: must be the number ${WORKFLOW_GRAPH_VERSION}
- \`engine\`: must be the string "${WDK_INTERPRETER_ENGINE}"
- \`entryNodeId\`: the id of the single trigger node (every graph has exactly ONE trigger, and it must be the entry)
- \`nodes\`: array (max 100) of { id, type, label?, config } — ids are alphanumeric with - or _, max 64 chars
- \`edges\`: array (max 200) of { id, from, to, branch? } — from/to reference node ids; \`branch\` ("true" | "false") is ONLY set on the two edges leaving a \`branch\` node
- Linear flows are a simple chain: trigger → step → step, one edge between each pair

## Interpolation
Fields marked "accepts {{templates}}" can reference earlier nodes' outputs
as \`{{nodeId.outputKey}}\` (e.g. \`{{research.text}}\`, \`{{match.json.score}}\`)
and the run's input as \`{{input.path}}\`. Number fields never interpolate.

## Trigger types (a graph needs EXACTLY ONE, as its entry node)`,
  ];

  const renderNode = (node: NodeTypeMetadata, extra?: string): string => {
    const lines = [
      `### \`${node.id}\` — ${node.label} (${node.execution})${extra ?? ""}`,
      node.description,
    ];
    if (node.fields.length) {
      lines.push("- Config fields:");
      lines.push(...node.fields.map(renderField));
    } else {
      lines.push("- Config: none (use `{}`)");
    }
    if (node.outputs.length) {
      lines.push(
        `- Outputs: ${node.outputs
          .map((o) => `\`${o.key}\` (${o.description})`)
          .join(", ")}`,
      );
    }
    return lines.join("\n");
  };

  for (const trigger of TRIGGER_TYPE_METADATA) {
    sections.push(
      renderNode(
        trigger,
        trigger.firing === "stubbed"
          ? " — automatic firing NOT wired yet; runs start manually"
          : "",
      ),
    );
  }

  sections.push(`## Step & control node types`);
  for (const node of NODE_TYPE_METADATA) {
    sections.push(renderNode(node));
  }

  // Worked example: the real job-application fixture (ships with the app,
  // validated in production dispatch) — an exemplar can't drift from the
  // schema because it IS typed against it.
  sections.push(
    `## Worked example (a complete, valid graph)\n` +
      `This graph ships with the app and passes validation as-is — model yours on its structure:\n` +
      "```json\n" +
      JSON.stringify(jobApplicationGraph, null, 1) +
      "\n```",
  );

  return sections.join("\n\n");
}
