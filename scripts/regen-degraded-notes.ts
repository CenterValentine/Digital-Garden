/**
 * regen-degraded-notes.ts — AI v3.1 R6 regen sweep.
 *
 * Notes generated BEFORE the server-safe markdown↔TipTap fix (4247ca9)
 * hold literal markdown (`## Heading`, `**bold**`, `- item`) as plain
 * paragraph text: `markdownToTiptap` threw in Node (no `window`) and the
 * fallback wrapped the raw markdown in paragraph nodes. Nothing was lost
 * — the degraded text IS the source markdown — so regeneration through
 * the now-fixed pipeline is lossless.
 *
 * Usage:
 *   pnpm notes:regen                 # DRY RUN — report only, writes nothing
 *   pnpm notes:regen --apply         # rewrite the reported notes
 *   pnpm notes:regen --limit 20      # cap the scan
 *   pnpm notes:regen --id <uuid>     # inspect/fix a single note
 *   pnpm notes:regen --verbose       # show a before/after preview per note
 *
 * Safety:
 *   - Dry run is the default; `--apply` is the only way to write.
 *   - Notes with live collaboration state (CollaborationDocument.ydocState)
 *     are SKIPPED and reported: for those the Y.js doc — not NotePayload —
 *     is what the editor renders, so a payload rewrite is invisible at
 *     best, and at worst diverges the two (the failure mode behind the
 *     daily-notes template-overlay bug). Re-saving does NOT fix them
 *     either: nothing in the save path re-parses markdown. They need
 *     manual reformatting, or a payload+ydocState reset performed while
 *     the note is closed everywhere.
 *   - Detection is conservative: the doc must be paragraph-only AND its
 *     text must carry a LINE-START markdown structure marker. Run Ledger
 *     notes take a fast path — their `metadata.ledgerMarkdown` is the
 *     verbatim source, so they regenerate exactly.
 */

import "./_load-env";

// Explicit /server subpath: the bare "@tiptap/html" specifier resolves to
// the SERVER build in Next (its exports map has an `import.node` condition),
// but tsx resolves the package's browser `src/`, whose generateJSON throws
// "can only be used in a browser environment". The app's own import is
// correct — this is a script-runner resolution difference, not a bug.
import { generateJSON } from "@tiptap/html/server";
import { marked } from "marked";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
// Direct module path, NOT the "@/lib/domain/content" barrel: the barrel
// re-exports markdown.ts, which statically imports `extensions-server`.
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";

/**
 * Local twin of `markdownToTiptap` (marked → HTML → generateJSON), using
 * the COLLABORATION extension set instead of `getServerExtensions()`.
 *
 * Why not call the app's function directly: `extensions-server.ts` imports
 * `@tiptap/extension-code-block-lowlight`, whose own source default-imports
 * `@tiptap/extension-code-block` — that resolves to `undefined` under tsx's
 * CJS transform, so any script touching that module graph crashes before
 * `main()` runs. The collaboration set loads cleanly in tsx (proven by
 * `pnpm collab:schema:check`) and the CI gate guarantees it covers every
 * Node/Mark in the app, so markdown-derived JSON is schema-identical —
 * CodeBlockLowlight only adds render-time highlighting over StarterKit's
 * `codeBlock` node, not a different node type.
 */
function markdownToTiptapForScript(markdown: string): Doc {
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  return generateJSON(html, getCollaborationServerExtensions()) as Doc;
}

type Doc = {
  type?: string;
  content?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

/** Line-start structural markers — the conservative signal. */
const STRUCTURE_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/^#{1,6}\s+\S/m, "heading"],
  [/^[-*+]\s+\S/m, "bullet"],
  [/^\d+\.\s+\S/m, "ordered"],
  [/^>\s+\S/m, "blockquote"],
  [/^```/m, "code-fence"],
  [/^\|.+\|$/m, "table"],
];

/**
 * Reconstruct the source markdown from a degraded doc. Both degraded
 * shapes reduce to the same operation: the original bug produced ONE
 * paragraph holding the whole markdown string; the later
 * `paragraphSplitFallback` produced one paragraph per blank-line-separated
 * block. Joining top-level paragraph texts with a blank line restores
 * either faithfully (single-newline structure survives inside text nodes).
 */
function reconstructMarkdown(doc: Doc): string {
  const blocks: string[] = [];
  for (const node of doc.content ?? []) {
    const text = (node.content ?? [])
      .map((child) => child.text ?? "")
      .join("");
    blocks.push(text);
  }
  return blocks.join("\n\n").trim();
}

function isParagraphOnly(doc: Doc): boolean {
  const nodes = doc.content ?? [];
  if (nodes.length === 0) return false;
  return nodes.every((node) => node.type === "paragraph");
}

function markersIn(markdown: string): string[] {
  return STRUCTURE_MARKERS.filter(([re]) => re.test(markdown)).map(
    ([, name]) => name,
  );
}

function preview(s: string, n = 90): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const verbose = argv.includes("--verbose");
  const limitArg = argv.indexOf("--limit");
  const limit =
    limitArg >= 0 ? Number.parseInt(argv[limitArg + 1] ?? "", 10) : undefined;
  const idArg = argv.indexOf("--id");
  const singleId = idArg >= 0 ? argv[idArg + 1] : undefined;

  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  })();

  console.log(
    `\nRegen degraded notes — ${apply ? "APPLY (writes enabled)" : "DRY RUN (no writes)"}`,
  );
  console.log(`Database host: ${dbHost}\n`);

  const payloads = await prisma.notePayload.findMany({
    where: {
      ...(singleId ? { contentId: singleId } : {}),
      content: { deletedAt: null },
    },
    ...(limit ? { take: limit } : {}),
    select: {
      contentId: true,
      tiptapJson: true,
      metadata: true,
      content: { select: { title: true, ownerId: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Live-collab lookup in one query — skipping these is the load-bearing
  // safety rule (never rewrite a payload under an active Y.js doc).
  const collabRows = await prisma.collaborationDocument.findMany({
    where: {
      contentId: { in: payloads.map((p) => p.contentId) },
      NOT: { ydocState: null },
    },
    select: { contentId: true },
  });
  const liveCollab = new Set(collabRows.map((r) => r.contentId));

  type Candidate = {
    contentId: string;
    title: string;
    markdown: string;
    markers: string[];
    source: "ledger" | "heuristic";
  };
  const candidates: Candidate[] = [];
  const skippedCollab: Array<{ contentId: string; title: string }> = [];

  for (const p of payloads) {
    const doc = (p.tiptapJson ?? {}) as Doc;
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const title = p.content?.title ?? "(untitled)";

    // Fast path: the Run Ledger stores its verbatim markdown, so it
    // regenerates exactly regardless of the heuristic below.
    const ledgerMarkdown =
      typeof meta.ledgerMarkdown === "string" ? meta.ledgerMarkdown : null;

    let markdown: string | null = null;
    let source: "ledger" | "heuristic" = "heuristic";
    let markers: string[] = [];

    if (ledgerMarkdown && isParagraphOnly(doc)) {
      markdown = ledgerMarkdown;
      source = "ledger";
      markers = markersIn(ledgerMarkdown);
    } else if (isParagraphOnly(doc)) {
      const reconstructed = reconstructMarkdown(doc);
      const found = markersIn(reconstructed);
      if (reconstructed && found.length > 0) {
        markdown = reconstructed;
        markers = found;
      }
    }

    if (!markdown) continue;

    if (liveCollab.has(p.contentId)) {
      skippedCollab.push({ contentId: p.contentId, title });
      continue;
    }
    candidates.push({
      contentId: p.contentId,
      title,
      markdown,
      markers,
      source,
    });
  }

  console.log(`Scanned ${payloads.length} note payload(s).`);
  console.log(`Degraded candidates: ${candidates.length}`);
  console.log(`Skipped (live collaboration state): ${skippedCollab.length}\n`);

  for (const c of candidates) {
    console.log(
      `  • ${c.title}  [${c.contentId}]\n    markers: ${c.markers.join(", ") || "none"} · source: ${c.source}`,
    );
    // Dry-run proof: run the conversion IN MEMORY and report the node
    // types it would produce. A candidate that regenerates to paragraphs
    // only would be a no-op write — the report says so before the apply
    // pass silently skips it.
    const projected = markdownToTiptapForScript(c.markdown);
    const histogram = new Map<string, number>();
    for (const node of projected.content ?? []) {
      const t = node.type ?? "unknown";
      histogram.set(t, (histogram.get(t) ?? 0) + 1);
    }
    const shape = [...histogram.entries()]
      .map(([t, n]) => `${t}×${n}`)
      .join(", ");
    console.log(
      `    would become: ${shape || "(empty)"}${
        isParagraphOnly(projected) ? "   ⚠ NO STRUCTURE — would be skipped" : ""
      }`,
    );
    if (verbose) {
      console.log(`    before: ${preview(c.markdown)}`);
    }
  }
  if (skippedCollab.length > 0) {
    // NOTE: re-saving in the editor does NOT fix these — nothing in the
    // save path re-parses markdown, so the literal `##` text just round
    // trips through the Y.doc. They need either manual reformatting in
    // the editor, or a reset pass (regenerate the payload AND clear
    // CollaborationDocument.ydocState with the note closed everywhere,
    // so the next open re-bootstraps from the fixed payload).
    console.log(
      `\n  Skipped — live Y.js doc is the source of truth for these.\n  Fix by reformatting in the editor, or by a payload+ydocState reset while the note is CLOSED:`,
    );
    for (const s of skippedCollab) {
      console.log(`  • ${s.title}  [${s.contentId}]`);
    }
  }

  if (!apply) {
    console.log(
      `\nDry run complete — nothing written. Re-run with --apply to rewrite ${candidates.length} note(s).\n`,
    );
    await prisma.$disconnect();
    return;
  }

  let rewritten = 0;
  let unchanged = 0;
  for (const c of candidates) {
    const tiptapJson = markdownToTiptapForScript(c.markdown);
    // If the pipeline STILL produces paragraph-only output, the fix isn't
    // in effect (or this note isn't really markdown) — never write a
    // no-op that just churns updatedAt.
    if (isParagraphOnly(tiptapJson)) {
      unchanged++;
      console.log(`    ! skipped (regen produced no structure): ${c.title}`);
      continue;
    }
    const searchText = extractSearchTextFromTipTap(tiptapJson);
    const wordCount = searchText.split(/\s+/).filter(Boolean).length;
    const existing = await prisma.notePayload.findUnique({
      where: { contentId: c.contentId },
      select: { metadata: true },
    });
    const priorMeta = (existing?.metadata ?? {}) as Record<string, unknown>;
    await prisma.notePayload.update({
      where: { contentId: c.contentId },
      data: {
        tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
        searchText,
        metadata: {
          ...priorMeta,
          wordCount,
          characterCount: searchText.length,
          readingTime: Math.ceil(wordCount / 200),
          regeneratedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    rewritten++;
  }

  console.log(
    `\nApplied: ${rewritten} rewritten, ${unchanged} left untouched, ${skippedCollab.length} skipped (collab).\n`,
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("regen-degraded-notes failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
