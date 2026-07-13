/**
 * Workflows graph gate — parses fixtures through the Zod schema, runs
 * structural validation, exercises interpolation, and round-trips JSON.
 * Grows into a CI check as graphs multiply.
 *
 * Run: npx tsx scripts/workflows-graph-check.ts
 */
// NOTE: only client-safe modules here — the server registry imports
// `server-only` transitively (AI features barrel) and cannot load in a
// standalone script. Executor coverage is asserted at interpreter boot.
import { jobApplicationGraph } from "@/extensions/workflows/graph/fixtures/job-application";
import {
  interpolateConfig,
  type InterpolationScope,
} from "@/extensions/workflows/graph/interpolate";
import { workflowGraphSchema } from "@/extensions/workflows/graph/schema";
import { validateGraph } from "@/extensions/workflows/graph/validate";
import { getNodeTypeMetadata } from "@/extensions/workflows/nodes/metadata";

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// 1. Schema parse + JSON round-trip.
const parsed = workflowGraphSchema.safeParse(
  JSON.parse(JSON.stringify(jobApplicationGraph))
);
check(
  "job-application fixture parses the graph schema",
  parsed.success,
  parsed.success ? undefined : parsed.error.issues[0]?.message
);

if (parsed.success) {
  // 2. Structural validation.
  const result = validateGraph(parsed.data);
  check(
    "structural validation passes",
    result.valid,
    result.issues.map((issue) => issue.message).join("; ") || undefined
  );

  // 3. Every fixture node type exists in the palette with an execution kind.
  for (const node of parsed.data.nodes) {
    const metadata = getNodeTypeMetadata(node.type);
    check(
      `node "${node.id}" type "${node.type}" is in the palette (${metadata?.execution ?? "?"})`,
      metadata !== null
    );
  }

  // 4. Interpolation resolves the fixture's templates against a mock ctx.
  const scope: InterpolationScope = {
    input: {
      pageUrl: "https://example.com/job",
      captureNodeId: "00000000-0000-0000-0000-000000000000",
    },
    nodes: {
      listing: { text: "listing text" },
      research: {
        json: {
          companyName: "Acme",
          summary: "A summary",
          highlights: ["a", "b"],
        },
      },
      match: { json: { score: 82, strengths: [], concerns: [] } },
      review: { approved: true },
    },
  };
  const missing: string[] = [];
  for (const node of parsed.data.nodes) {
    interpolateConfig(node.config, scope, (path) => missing.push(`${node.id}:${path}`));
  }
  check(
    "all fixture templates resolve against a populated ctx",
    missing.length === 0,
    missing.join(", ") || undefined
  );

  // 5. Negative case — validation catches a broken graph.
  const broken = {
    ...parsed.data,
    edges: [...parsed.data.edges, { id: "loop", from: "done", to: "listing" }],
  };
  const brokenResult = validateGraph(broken);
  check(
    "cycle detection rejects a looped graph",
    !brokenResult.valid &&
      brokenResult.issues.some((issue) => issue.message.includes("cycle"))
  );
}

if (failures > 0) {
  console.error(`\nGRAPH CHECK FAIL (${failures})`);
  process.exit(1);
}
console.log("\nGRAPH CHECK PASS");
