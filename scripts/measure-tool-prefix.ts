/**
 * Measure the AI tool prefix — what the model is handed on every step.
 *
 *   pnpm dev                     # in one terminal
 *   pnpm tools:prefix:measure    # in another
 *   pnpm tools:prefix:measure --json > prefix.json
 *
 * Reads `GET /api/dev/tool-prefix`, which does the serializing inside Next
 * because plain Node cannot load the tool graph (see that route's header for
 * why, and why stubbing was rejected).
 *
 * WHAT IT IS FOR. Tool descriptions are re-sent on every step of every turn,
 * so the prefix is a per-step tax on the context window — it was 31,149 tokens
 * (24% of 128k) before the summoner. Nothing in the repo would tell you if it
 * grew back: `insert_block` alone is 5,221 tokens and arrived without comment.
 * This is the instrument you point at the codebase to find out.
 *
 * It is a REPORT, not a gate. Nothing fails because a number moved; the point
 * is to make the number visible when someone wants it.
 */
const DEFAULT_URL = "http://localhost:3015/api/dev/tool-prefix";

interface Row {
  name: string;
  chars: number;
  tokens: number;
  family: string | null;
  core: boolean;
  modes: string[];
  schemaFailed: boolean;
}

interface Scenario {
  label: string;
  advertisedCount: number;
  advertisedTokens: number;
  menuTokens: number;
  menuListed: number;
  summonTokens: number;
  totalTokens: number;
}

interface Report {
  measuredAt: string;
  estimator: string;
  toolCount: number;
  fullPrefixTokens: number;
  fullPrefixChars: number;
  schemaFailures: string[];
  missingMenuEntries: string[];
  scenarios: Scenario[];
  rows: Row[];
}

const n = (v: number) => v.toLocaleString("en-US");

async function main() {
  const json = process.argv.includes("--json");
  const urlArg = process.argv.find((a) => a.startsWith("--url="));
  const url = urlArg ? urlArg.slice("--url=".length) : DEFAULT_URL;

  let report: Report;
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      console.error(
        `The measurement route returned 404. It is development-only — is that server running with NODE_ENV=development?\n  ${url}`,
      );
      process.exit(1);
    }
    if (!res.ok) {
      console.error(`${url} responded ${res.status}`);
      process.exit(1);
    }
    report = (await res.json()) as Report;
  } catch {
    console.error(
      `Could not reach ${url}\n\n` +
        "Start the dev server first — this measures the real module graph, so it needs Next:\n" +
        "  pnpm dev\n\n" +
        "Then re-run. Use --url=<origin>/api/dev/tool-prefix for a server on another port.",
    );
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    `\nTool prefix — ${report.toolCount} tools, ${n(report.fullPrefixTokens)} tokens ` +
      `(${n(report.fullPrefixChars)} chars, ${report.estimator})\n`,
  );

  console.log("rank  tokens  tier    family        tool");
  report.rows.forEach((r, i) => {
    const tier = r.core ? "core" : r.modes.length > 0 ? r.modes.join("+") : "summon";
    console.log(
      `${String(i + 1).padStart(4)}  ${String(r.tokens).padStart(6)}  ${tier.padEnd(7)} ` +
        `${(r.family ?? "—").padEnd(13)} ${r.name}${r.schemaFailed ? "  [schema did not convert]" : ""}`,
    );
  });

  console.log("\nAdvertised per step, by scenario:\n");
  console.log("scenario                  tools   advertised    menu  summon     total   of 128k");
  for (const s of report.scenarios) {
    const pct = ((s.totalTokens / 128_000) * 100).toFixed(1);
    console.log(
      `${s.label.padEnd(24)} ${String(s.advertisedCount).padStart(6)}  ` +
        `${String(n(s.advertisedTokens)).padStart(10)}  ${String(n(s.menuTokens)).padStart(6)}  ` +
        `${String(s.summonTokens).padStart(6)}  ${String(n(s.totalTokens)).padStart(8)}  ${pct.padStart(6)}%`,
    );
  }
  console.log(
    `\n(menu lists the tools NOT advertised in that scenario — ` +
      `${report.scenarios[0]?.menuListed ?? 0} of them in plain chat)`,
  );

  // Both of these are drift-gate failures too; surfaced here so a number that
  // looks wrong explains itself rather than just reading low.
  if (report.missingMenuEntries.length > 0) {
    console.log(
      `\n⚠ No TOOL_MENU entry (undiscoverable when unadvertised): ${report.missingMenuEntries.join(", ")}`,
    );
  }
  if (report.schemaFailures.length > 0) {
    console.log(
      `\n⚠ Schema would not convert, so these measure LOW: ${report.schemaFailures.join(", ")}`,
    );
  }
  console.log();
}

void main();
