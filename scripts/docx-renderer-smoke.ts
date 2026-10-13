/**
 * docx:renderer:smoke — the Node client ↔ Python renderer round trip.
 *
 * Proves what server/docx-renderer/scripts/smoke.py cannot: that the
 * TypeScript client (multipart upload, base64 decode, flat outcomes) and
 * the judge agree with the service over real HTTP. No database, no
 * storage — the fixture template is read from disk.
 *
 * Needs the renderer running (default http://localhost:8081):
 *   cd server/docx-renderer && .venv/bin/uvicorn app:app --port 8081
 *   pnpm docx:renderer:smoke
 *
 * Not in the build chain: it needs Python. Run it when touching
 * renderer-client.ts, judge.ts, or the renderer's response shape.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

process.env.DOCX_RENDERER_URL ??= "http://localhost:8081";

const FIXTURE = path.join(process.cwd(), "server/docx-renderer/fixtures/resume-template.docx");

const failures: string[] = [];
function check(condition: boolean, label: string, detail?: unknown): void {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!condition) failures.push(label);
}

const VALUES = {
  header: {
    name: "Ada Lovelace",
    title: "Analytical Engine Programmer",
    email: "ada@example.org",
    phone: "+44 20 7946 0000",
    website: { text: "ada.example.org", url: "https://ada.example.org/?ref=cv&v=2" },
  },
  summary: "Wrote the first published algorithm for a machine — 1843.",
  skills: ["Mathematics", "Bernoulli numbers"],
  experience: [
    { title: "Collaborator", company: "Charles Babbage", location: "London", start: "1842", end: "1843", bullets: ["Note G."] },
    { title: "", company: "Self-directed", location: null, start: "1833", end: "1842", bullets: ["Studied under De Morgan."] },
  ],
  education: [{ degree: "Private tuition", institution: "Augustus De Morgan", year: "1840–1842" }],
};

async function main(): Promise<number> {
  const { inspectDocxTemplate, renderDocxTemplate } = await import("@/lib/domain/ai/docx-templates/renderer-client");
  const { judgeRender, requiredGaps } = await import("@/lib/domain/ai/docx-templates/judge");
  const { describeTemplateForModel, recordFromContract } = await import("@/lib/domain/ai/docx-templates/record");

  const template = readFileSync(FIXTURE);

  console.log("inspect");
  const contract = await inspectDocxTemplate(template, "resume-template.docx");
  check(contract.ok, "contract ok", contract.errors);
  check(contract.fields.some((f) => f.path === "header.website" && f.rich), "rich field marked");
  check(contract.sections.some((s) => s.path === "experience" && s.sections.some((n) => n.path === "bullets")), "nested section derived");
  const record = recordFromContract(contract, null);
  const described = describeTemplateForModel({ ...record, notes: { summary: { description: "Two sentences, first person", maxLength: 320 } } });
  check(described.includes("experience[] — list of objects") && described.includes("≤320 chars"), "model-facing description", described);
  console.log(described.split("\n").map((l) => `      ${l}`).join("\n"));

  console.log("render");
  const rendered = await renderDocxTemplate(template, VALUES, { expectedChecksum: contract.checksum, fileName: "resume-template.docx" });
  check(rendered.ok === true && !!rendered.docx && rendered.docx.length > 10_000, "docx bytes returned", rendered.error);
  check(rendered.docx?.subarray(0, 2).toString("latin1") === "PK", "bytes are a zip (docx)");
  check((rendered.text ?? "").includes("Ada Lovelace") && (rendered.text ?? "").includes("references on request"), "text read back incl. footer");
  check(rendered.diagnostics?.unresolved.length === 0, "no unresolved tags", rendered.diagnostics?.unresolved);
  check(rendered.diagnostics?.missing.length === 0 && rendered.diagnostics?.unused.length === 0, "no missing/unused keys", rendered.diagnostics);

  console.log("judge");
  const gaps = requiredGaps(record, VALUES);
  check(gaps.length === 1 && gaps[0] === "experience[1].title", "empty required field found down to the item", gaps);
  check(!gaps.includes("experience[1].location"), "optional (guarded) field not a gap");
  const verdict = judgeRender(record, VALUES, rendered.diagnostics!);
  check(typeof verdict.accept === "boolean" && Array.isArray(verdict.gaps), "verdict shape");
  console.log(`      verdict: accept=${verdict.accept} gaps=${JSON.stringify(verdict.gaps)}`);

  console.log("refusals");
  const stale = await renderDocxTemplate(template, VALUES, { expectedChecksum: "0".repeat(64) });
  check(!stale.ok && stale.error?.code === "template_checksum_mismatch", "stale checksum refused", stale.error);
  const notDocx = await renderDocxTemplate(Buffer.from("not a zip"), VALUES);
  check(!notDocx.ok && notDocx.error?.code === "template_invalid", "non-docx refused", notDocx.error);
  const braces = await renderDocxTemplate(template, { ...VALUES, summary: "oops {{ header.name }}" });
  check(braces.ok === true && (braces.diagnostics?.unresolved.length ?? 0) > 0, "braces in a value surface as unresolved");
  const bracesVerdict = judgeRender(record, { ...VALUES, summary: "oops {{ header.name }}" }, braces.diagnostics!);
  check(bracesVerdict.accept === false && !!bracesVerdict.refusal, "judge refuses unresolved tags");

  console.log();
  if (failures.length) {
    console.log(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log("docx:renderer:smoke — all checks passed");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
