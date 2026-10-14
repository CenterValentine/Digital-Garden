/**
 * docx:templates:check — the document-template path, pinned.
 *
 * What a template fill must never do: ship a tag, ship a typo'd field,
 * ship an invented fact, write a second copy when asked to update, call
 * the renderer with a credential it should not have, or treat a renderer
 * refusal as success. Each is a check here, by the rule's own module:
 *
 *   judge.ts          — the three refusals and the positive report
 *   record.ts         — tolerant reads of the two metadata records
 *   renderer-client   — auth headers and the flattening of renderer
 *                       refusals (fetch is stubbed; no service needed)
 *   source scans      — the fill tool judges BEFORE it stores, verifies
 *                       provenance BEFORE it renders, overwrites by id,
 *                       rides charter turns; the renderer has no code
 *                       execution and no DB/AI credential; Cloud Run is
 *                       IAM-gated; the recipe names the tool
 *
 * Run: pnpm docx:templates:check (in `build`; no network, no Python).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main(): Promise<void> {
  const { judgeRender, requiredGaps, nearestDeclared, uncitedItems, overLengthFields } = await import(
    "@/lib/domain/ai/docx-templates/judge"
  );
  const { readTemplateRecord, readFillRecord, recordFromContract, describeTemplateForModel } = await import(
    "@/lib/domain/ai/docx-templates/record"
  );

  // ── Fixture contract: your resume's shape, as loops ───────────────────
  const record = recordFromContract(
    {
      ok: true,
      checksum: "c".repeat(64),
      fields: [
        { path: "header.name", required: true, rich: false },
        { path: "header.website", required: true, rich: true },
        { path: "summary", required: true, rich: false },
      ],
      sections: [
        { path: "capabilities", item: "c", itemIsValue: true, fields: [], sections: [] },
        {
          path: "experience",
          item: "job",
          itemIsValue: false,
          fields: [
            { path: "title", required: true, rich: false },
            { path: "location", required: false, rich: false },
          ],
          sections: [{ path: "bullets", item: "b", itemIsValue: true, fields: [], sections: [] }],
        },
      ],
      errors: [],
      warnings: [],
    },
    { version: 1, markedAt: "2026-10-12T00:00:00Z", checksum: "old", fields: [], sections: [], warnings: [], notes: { summary: { maxLength: 40 } } },
  );
  assert.equal(record.notes?.summary?.maxLength, 40, "re-inspecting keeps the user's field notes");
  assert.equal(record.markedAt, "2026-10-12T00:00:00Z", "re-inspecting keeps the original markedAt");

  const diag = (over: Partial<{ unresolved: string[]; missing: string[]; unused: string[] }> = {}) => ({
    durationMs: 20,
    bytes: 30_000,
    textChars: 400,
    unresolved: [],
    missing: [],
    unused: [],
    ...over,
  });
  const values = {
    header: { name: "Ada", website: { text: "ada.example", url: "https://ada.example" } },
    summary: "Short.",
    capabilities: ["A", "B"],
    experience: [
      { title: "Analyst", location: null, bullets: ["Did X", "Did Y"] },
      { title: "", bullets: ["Did Z"] },
    ],
  };

  // ── Judge: refusals ───────────────────────────────────────────────────
  const tag = judgeRender(record, values, diag({ unresolved: ["{{ header.name }}"] }));
  assert.equal(tag.accept, false, "a tag left in the output is refused");
  assert.match(tag.refusal ?? "", /template tags/);

  const typo = judgeRender(record, { ...values, sumary: "x" }, diag({ unused: ["sumary"] }));
  assert.equal(typo.accept, false, "a key the template never reads is refused");
  assert.match(typo.refusal ?? "", /sumary \(did you mean summary\?\)/, "the refusal names the nearest field");
  assert.equal(nearestDeclared("EXPERIENCE_BULLET1", ["EXPERIENCE_BULLET_1", "TOOL_1"]), "EXPERIENCE_BULLET_1");
  assert.equal(nearestDeclared("zzzz", ["summary"]), null, "no near field → no suggestion");

  const empty = judgeRender(record, values, diag());
  assert.equal(empty.accept, false, "an empty required slot is refused");
  assert.match(empty.refusal ?? "", /experience\[1\]\.title/, "…and named down to the item");
  assert.match(empty.refusal ?? "", /ASK the user/, "…with the instruction to ask, not invent");
  assert.deepEqual(requiredGaps(record, values), ["experience[1].title"]);
  assert.ok(!requiredGaps(record, values).includes("experience[0].location"), "a {% if %}-guarded field is never a gap");

  const notSupplied = judgeRender(record, values, diag({ missing: ["education"] }));
  assert.equal(notSupplied.accept, false, "a root the template reads but values omit is refused");

  // Priority: a tag beats a typo beats an empty slot — the model fixes the worst first.
  const all = judgeRender(record, { ...values, sumary: "x" }, diag({ unresolved: ["{{"], unused: ["sumary"] }));
  assert.match(all.refusal ?? "", /template tags/, "unresolved outranks unused");

  // ── Judge: acceptance + report ────────────────────────────────────────
  const complete = { ...values, experience: [{ ...values.experience[0] }, { title: "Lead", bullets: ["Did Z"] }] };
  const ok = judgeRender(record, complete, diag(), {
    links: 1,
    provenance: { "experience[0].bullets[0]": ["row-1"], capabilities: ["row-9"] },
  });
  assert.equal(ok.accept, true, "a complete fill is accepted");
  assert.equal(ok.gaps.length, 0);
  assert.deepEqual(ok.report?.sectionCounts, { capabilities: 2, experience: 2, "experience.bullets": 3 });
  assert.deepEqual(ok.report?.uncited, ["experience[0].bullets[1]", "experience[1].bullets[0]"], "uncited bullets are reported, not refused");
  assert.deepEqual(uncitedItems(record, complete, undefined), [], "no provenance map → nothing to report");
  assert.deepEqual(overLengthFields({ ...record, notes: { summary: { maxLength: 3 } } }, complete), ["summary: 6 chars (max 3)"]);
  assert.equal(ok.report?.links, 1);

  // ── Records: tolerant reads ───────────────────────────────────────────
  assert.equal(readTemplateRecord(null), null);
  assert.equal(readTemplateRecord({ custom: { docxTemplate: { version: 2, checksum: "x" } } }), null, "unknown record version is not a template");
  assert.equal(readTemplateRecord({ custom: { docxTemplate: { version: 1 } } }), null, "a record without a checksum is not a template");
  assert.equal(readTemplateRecord({ custom: { docxTemplate: { version: 1, checksum: "abc" } } })?.checksum, "abc");
  assert.equal(readFillRecord({ custom: { docxFill: { version: 1, templateId: "t", values: {} } } })?.templateId, "t");
  assert.equal(readFillRecord({ custom: { docxFill: { version: 1, templateId: "t" } } }), null, "a fill without values cannot re-render");
  const described = describeTemplateForModel(record);
  assert.match(described, /header\.website \(link: \{text,url\}\)/);
  assert.match(described, /summary — ≤40 chars/);
  assert.match(described, /experience\[\] — list of objects\n  title\n  location \(optional\)\n  bullets\[\] — list of strings/);

  // ── Renderer client: auth headers + refusal flattening (fetch stubbed) ─
  const calls: Array<{ url: string; headers: Record<string, string>; status: number }> = [];
  const originalFetch = globalThis.fetch;
  const stub = (status: number, body: unknown) => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
      calls.push({ url: String(input), headers, status });
      // A string body is sent RAW (an HTML error page from a gateway); an
      // object is sent as JSON.
      return typeof body === "string"
        ? new Response(body, { status, headers: { "content-type": "text/html" } })
        : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  };
  const env = process.env;
  try {
    env.DOCX_RENDERER_URL = "http://localhost:8081";
    delete env.DOCX_RENDERER_SHARED_TOKEN;
    delete env.DOCX_RENDERER_ID_TOKEN;
    const { renderDocxTemplate, inspectDocxTemplate, isDocxRendererConfigured } = await import(
      "@/lib/domain/ai/docx-templates/renderer-client"
    );
    assert.equal(isDocxRendererConfigured(), true);

    stub(401, { detail: { code: "unauthorized" } });
    const denied = await renderDocxTemplate(Buffer.from("PK"), { a: 1 });
    assert.equal(denied.ok, false);
    assert.equal(denied.error?.code, "unauthorized", "a renderer 401 surfaces as a typed refusal, never as success");
    assert.equal(calls[0].headers.Authorization, undefined, "a localhost renderer gets no ID token");
    assert.equal(calls[0].headers["X-Renderer-Token"], undefined);

    env.DOCX_RENDERER_SHARED_TOKEN = "shared-secret";
    env.DOCX_RENDERER_ID_TOKEN = "id-token-override";
    stub(422, { ok: false, error: { code: "template_checksum_mismatch", message: "changed" }, checksum: "n" });
    const stale = await renderDocxTemplate(Buffer.from("PK"), {}, { expectedChecksum: "o" });
    assert.equal(stale.error?.code, "template_checksum_mismatch", "a judged refusal keeps the renderer's code");
    assert.equal(stale.checksum, "n");
    assert.equal(calls[1].headers["X-Renderer-Token"], "shared-secret", "the shared token rides as a header");
    assert.equal(calls[1].headers.Authorization, "Bearer id-token-override", "an ID token override is sent as Bearer");

    stub(500, "<html>gateway</html>");
    const broken = await renderDocxTemplate(Buffer.from("PK"), {});
    assert.equal(broken.ok, false);
    assert.equal(broken.error?.code, "renderer_bad_response", "a non-JSON renderer failure is typed, not thrown");

    stub(200, {
      ok: true,
      docxBase64: Buffer.from("PK\u0003\u0004docx").toString("base64"),
      text: "Ada",
      checksum: "c",
      diagnostics: diag(),
    });
    const good = await renderDocxTemplate(Buffer.from("PK"), {});
    assert.equal(good.ok, true);
    assert.equal(good.docx?.subarray(0, 2).toString("latin1"), "PK", "docx bytes are decoded from base64");
    assert.equal(good.text, "Ada");

    stub(422, { ok: false, checksum: "c", fields: [], sections: [], errors: [{ code: "template_syntax", message: "x", part: "body", paragraph: 7, near: "{{ summary" }], warnings: [] });
    const bad = await inspectDocxTemplate(Buffer.from("PK"));
    assert.equal(bad.ok, false);
    assert.equal(bad.errors[0]?.paragraph, 7, "an invalid template's preflight error keeps its paragraph");

    delete env.DOCX_RENDERER_URL;
    assert.equal(isDocxRendererConfigured(), false);
    await assert.rejects(() => renderDocxTemplate(Buffer.from("PK"), {}), /not configured/, "an unconfigured renderer fails loudly, not silently");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ── Source scans ──────────────────────────────────────────────────────
  const registry = read("lib/domain/ai/tools/registry.ts");
  const fillStart = registry.indexOf("fill_docx_template: tool({");
  assert.ok(fillStart > 0, "fill_docx_template is a registered tool");
  const fillSrc = registry.slice(fillStart, registry.indexOf("// The GARDEN-WIDE finder", fillStart));
  const idx = (needle: string) => {
    const i = fillSrc.indexOf(needle);
    assert.ok(i >= 0, `fill_docx_template: expected to find ${JSON.stringify(needle)}`);
    return i;
  };
  assert.ok(idx("verifyProvenance(") < idx("renderDocxTemplate("), "provenance is verified BEFORE rendering");
  assert.ok(idx("judgeRender(") < idx("storeDocxDocument("), "the render is judged BEFORE anything is stored");
  assert.ok(idx("if (!verdict.accept)") < idx("storeDocxDocument("), "a refused verdict returns before storage");
  assert.match(fillSrc, /storeDocxDocument\(ctx\.userId, \{ \.\.\.stored, overwriteContentId \}\)/, "an update overwrites by id — never a second copy");
  assert.match(fillSrc, /writeFillRecord\(/, "the output remembers its values (rerender without a model turn)");
  assert.match(fillSrc, /resolveCharterOutputLocation\(ctx\.charterOutputDirectives/, "charter output routing applies");
  assert.match(fillSrc, /resolveToolOutputPlacement\(/, "output-target placement applies");
  assert.doesNotMatch(fillSrc, /docxBase64|rendered\.text\b(?!\s*\?\?)/, "the tool result never carries the document or its text");
  assert.match(fillSrc, /toolAutoApproves\(ctx\.autoApprovedTools, \{\s*tool: "create_docx"/, "shares create_docx's approval setting");

  const proposal = read("lib/domain/ai/tools/iteration-proposal.ts");
  assert.match(proposal, /CHARTER_TAIL_EXTRA = \["phase_checkpoint", "fill_docx_template"\]/, "the fill is allowed in a charter turn's reserved tail");
  assert.match(proposal, /"read_docx_template",\s*"fill_docx_template",/, "both template tools ride every charter turn");
  assert.match(proposal, /template: "fill_docx_template"/, "`deliverables: [\"template\"]` resolves");

  const prompt = read("lib/domain/ai/system-prompt.ts");
  assert.match(prompt, /names one of their document templates[^"]*fill_docx_template, not create_docx/, "the prompt routes a named template to the fill tool");

  const recipe = read("docs/notes-feature/guides/ai/STAGE2-CHARTER-RECIPE.md");
  assert.match(recipe, /fill_docx_template/, "the Stage 2 recipe names the template path");
  assert.match(recipe, /overwriteContentId/, "the recipe keeps the Materials cell's id on revision");

  const receipts = read("lib/domain/ai/content-write-receipts.ts");
  assert.match(receipts, /overwrittenFileContentIds/, "overwritten files are a refresh target");
  const engine = read("lib/domain/ai/use-conversation-engine.ts");
  assert.match(engine, /overwrittenFileContentIds[\s\S]*content-updated/, "the engine refreshes an overwritten file's open viewer");

  const client = read("lib/domain/ai/docx-templates/renderer-client.ts");
  assert.doesNotMatch(client, /DATABASE_URL|ANTHROPIC|OPENAI|STORAGE_ENCRYPTION_KEY/, "the renderer client holds no DB or AI credential");

  const pyRender = read("server/docx-renderer/render.py");
  const pyContract = read("server/docx-renderer/contract.py");
  const pyApp = read("server/docx-renderer/app.py");
  assert.match(pyContract, /SandboxedEnvironment\(/, "templates render under Jinja's sandbox");
  for (const [name, src] of [["render.py", pyRender], ["contract.py", pyContract], ["app.py", pyApp]] as const) {
    assert.doesNotMatch(src, /\bsubprocess\b|os\.system|\beval\(|\bexec\(/, `${name}: no code execution`);
    assert.doesNotMatch(src, /psycopg|sqlalchemy|prisma|anthropic|openai/i, `${name}: no database or AI client`);
  }
  assert.match(pyApp, /MAX_TEMPLATE_BYTES/, "the renderer enforces an input limit");
  assert.match(pyRender, /_UNRESOLVED|unresolved/, "the renderer reports unresolved tags");
  const cloudbuild = read("cloudbuild.docx-renderer.yaml");
  assert.match(cloudbuild, /--no-allow-unauthenticated/, "Cloud Run is IAM-gated");
  assert.match(cloudbuild, /_REGION: us-west1/, "one region, the app's");
  assert.doesNotMatch(cloudbuild, /DATABASE_URL/, "the renderer deploy carries no database secret");

  console.log(
    "✓ docx:templates:check — the judge refuses tags, typo'd keys and empty required slots and reports the rest; records read tolerantly; the client sends the right auth and flattens every renderer refusal; the fill verifies provenance before rendering, judges before storing, overwrites by id, rides charter turns; the renderer has no code execution, no credentials, and an IAM-gated deploy",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
