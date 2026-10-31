/**
 * Run every validation gate the `build` chain runs — derived, not listed.
 *
 * WHY THIS EXISTS: `pnpm build` chains ~24 `*:check` / `*:smoke` gates, but no
 * workflow ran `pnpm build` and `quality.yml` enumerated its gates BY NAME. So
 * adding a gate needed two registrations — the build chain and a workflow step —
 * and nothing failed if you skipped the second. 11 of the 24 had drifted that
 * way by 2026-10-15 (`handles:check`, `private:content:check`,
 * `blockid:hygiene:check`, `extensions:check`, …), each guarding a silent-failure
 * class that nothing else catches.
 *
 * A hand-maintained second list would just drift again. This reads the `build`
 * script itself, so a gate added to `build` is enforced in CI by existing rather
 * than by someone remembering.
 *
 * Deliberately NOT part of `build` (it would recurse). CI-only: `pnpm ci:gates`.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * pnpm sub-scripts in `build` that this runner must NOT run.
 *
 * Not gates, or already covered by a dedicated job with its own setup — running
 * them here would duplicate minutes for no extra signal. Everything else in the
 * chain runs, including any gate added later.
 */
const SKIP = new Set([
  "build:tokens", // asset generation, not a gate
  "lint", // its own job, with the --max-warnings ratchet
]);

interface GateResult {
  name: string;
  ok: boolean;
  seconds: number;
}

function buildChainGates(): string[] {
  const pkgPath = resolve(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const build = pkg.scripts?.build;
  if (!build) {
    console.error("run-build-gates: package.json has no `build` script.");
    process.exit(1);
  }

  // Every `pnpm <name>` the chain invokes, in order, de-duplicated.
  const names: string[] = [];
  for (const segment of build.split("&&")) {
    const match = /^\s*pnpm\s+([A-Za-z0-9:_-]+)\s*$/.exec(segment);
    if (!match) continue; // `tsc --noEmit`, `prisma generate`, `next build …`
    const name = match[1];
    if (SKIP.has(name)) continue;
    if (!names.includes(name)) names.push(name);
  }

  if (names.length === 0) {
    console.error(
      "run-build-gates: parsed 0 gates out of the `build` script. The chain's shape probably changed — fix the parser rather than letting CI pass vacuously."
    );
    process.exit(1);
  }
  return names;
}

const gates = buildChainGates();
console.log(`Running ${gates.length} gates derived from the \`build\` chain:\n`);

const results: GateResult[] = [];
for (const name of gates) {
  const started = Date.now();
  const run = spawnSync("pnpm", [name], { stdio: "inherit", shell: false });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  // A signal (null status) is a failure, not a pass.
  const ok = run.status === 0;
  results.push({ name, ok, seconds });
  if (!ok) {
    console.error(
      `\n✗ ${name} FAILED (exit ${run.status ?? `signal ${run.signal}`}) — stopping, as \`build\` would.\n`
    );
    break;
  }
}

console.log("\n─── summary ───");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(26)} ${r.seconds}s`);
}

const failed = results.filter((r) => !r.ok);
const notRun = gates.length - results.length;
if (failed.length > 0) {
  console.error(
    `\n${failed.length} gate(s) failed${notRun > 0 ? `, ${notRun} not run` : ""}: ${failed
      .map((r) => r.name)
      .join(", ")}`
  );
  process.exit(1);
}
console.log(`\nAll ${results.length} build-chain gates passed.`);
