/**
 * Mark-as-playbook action (AI v3.2 T3).
 *
 * POST /api/content/charters/mark — hand-authoring path (primary use
 * case): flag an existing note OR folder as a playbook via
 * NotePayload.metadata (folders can carry a notePayload too — the folder
 * "Notes" editor). The `##` sections are already phases (see
 * lib/domain/ai/charters/parse.ts); this just marks it discoverable in
 * the /playbook picker.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  isCharterMetadata,
  stripCharterMetadata,
  withCharterMetadata,
} from "@/lib/domain/ai/charters/registry";
import { parseCharter } from "@/lib/domain/ai/charters/parse";
import {
  buildCharterStarterDoc,
  countStarterPlaceholderPhases,
} from "@/lib/domain/ai/charters/starter";
import { ensureMasterLedger } from "@/lib/domain/ai/quests";
import { writeNoteContent } from "@/lib/domain/content/write-note-content";
import type { JSONContent } from "@tiptap/core";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/charters/mark";

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const body = await request.json();
      const contentId = typeof body.contentId === "string" ? body.contentId : null;
      const description =
        typeof body.description === "string" ? body.description.trim() : "";
      // Opt-in starter body. Only ever honoured for a charter with NO body —
      // promoting an already-written note must never touch its content.
      const scaffold = body.scaffold === true;
      if (!contentId) {
        return NextResponse.json(
          { success: false, error: { message: "contentId is required" } },
          { status: 400 },
        );
      }

      const node = await prisma.contentNode.findFirst({
        where: {
          id: contentId,
          ownerId: session.user.id,
          contentType: { in: ["note", "folder"] },
          deletedAt: null,
        },
        select: {
          id: true,
          // The charter's name is the file title — the starter body opens with
          // it so a scaffolded page is about something from its first line.
          title: true,
          // tiptapJson so the response can report whether this charter has a
          // BODY (see the emptiness contract below).
          notePayload: { select: { metadata: true, tiptapJson: true } },
        },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note or folder not found" } },
          { status: 404 },
        );
      }

      // EMPTINESS CONTRACT (D5, owner report 2026-09-10). A charter is a
      // written commissioning document: the marker says "this is a charter",
      // the BODY says what the charter is. Marking a folder that has no
      // NotePayload row takes the `create` branch of the metadata upsert
      // below, which writes
      // `{type:"doc",content:[]}` — so the promotion itself mints the empty
      // charter, and the caller then reported success as readiness ("attach
      // it from any chat with /charter"). It is not ready: attaching a
      // bodyless charter yields "contains no instructions".
      //
      // The route knows — it is about to write the document — so it says so
      // and the caller can tell the truth. Reported, never blocked: marking
      // first and writing after is a legitimate order of work.
      const parsed = parseCharter(
        (node.notePayload?.tiptapJson as JSONContent | undefined) ?? {
          type: "doc",
          content: [],
        },
      );
      let hasBody =
        parsed.phases.length > 0 || parsed.standingRules.content.length > 0;
      let phaseCount = parsed.phases.length;
      // Starter headings still reading "[name the first phase]" — reported so
      // the dialog can say a run would start on a placeholder.
      let templatePhases = countStarterPlaceholderPhases(parsed);

      // STARTER BODY (D5). Opt-in, and only into a charter that has none: the
      // caller offers it solely for an empty one, and this re-checks rather
      // than trusting that, so a stale dialog can never overwrite writing.
      //
      // Routed through writeNoteContent, NEVER a NotePayload upsert: where a
      // CollaborationDocument row exists, a payload write is masked in any
      // open editor and destroyed by that session's next store (confirmed in
      // production 2026-08-12). A folder promoted moments ago usually has no
      // Y.Doc — but "usually" is exactly the assumption that path exists to
      // remove. The shrink guard cannot trip here: it needs >=200 chars
      // before, and this runs only when there are none.
      let scaffolded = false;
      if (scaffold && !hasBody) {
        try {
          const starter = buildCharterStarterDoc(node.title);
          await writeNoteContent({
            contentId: node.id,
            ownerId: session.user.id,
            mode: "replace",
            content: starter,
          });
          hasBody = true;
          const starterParsed = parseCharter(starter);
          phaseCount = starterParsed.phases.length;
          templatePhases = countStarterPlaceholderPhases(starterParsed);
          scaffolded = true;
        } catch (scaffoldError) {
          // The MARK is what the user asked for and it has already succeeded.
          // A failed scaffold degrades to the empty-charter warning the caller
          // shows anyway — never to a failed promotion.
          logger.warn({
            layer: "ai",
            event: "charters_mark:scaffold_failed",
            summary: "charter marked, but the starter body could not be written",
            error: scaffoldError,
          });
        }
      }

      // ORDER (prod 2026-09-11): the starter scaffold above is a full
      // payload write. writeNoteContent now merges metadata, but stamping the
      // markers AFTER any body write keeps them safe from a replacing writer
      // for good — the flag and the ledger stamp are the last thing written.
      const metadata = withCharterMetadata(
        (node.notePayload?.metadata as Record<string, unknown> | null) ?? null,
        description,
      );
      // upsert, not update — a folder's notePayload is created lazily by its
      // Notes editor on first edit, so a freshly-created folder with content
      // already typed may not have a row yet even though notePayload.metadata
      // above read null via the optional relation.
      await prisma.notePayload.upsert({
        where: { contentId: node.id },
        update: { metadata: metadata as unknown as Prisma.InputJsonValue },
        create: {
          contentId: node.id,
          tiptapJson: { type: "doc", content: [] } as unknown as Prisma.InputJsonValue,
          searchText: "",
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      // LEDGER AT MARK (owner directive 2026-09-11). The master ledger used
      // to be minted lazily on the first approved run (D10), which left a
      // freshly marked charter with no visible quest tracking — and sent the
      // owner off to build a "charter database" by hand (prod: Career Hunt
      // Charters, an orphan table nothing reads). Mint it here, idempotently:
      // it lands as referenced content under the charter (ownedByNoteId), so
      // the reference chip shows it from the moment of marking. Re-marking
      // an older charter is the backfill path. Best-effort: the MARK is what
      // was asked for and has already succeeded.
      let masterLedgerId: string | null = null;
      let masterLedgerCreated = false;
      try {
        const master = await ensureMasterLedger(session.user.id, {
          contentId: node.id,
          title: node.title,
        });
        masterLedgerId = master?.masterId ?? null;
        masterLedgerCreated = master?.created === true;
      } catch (ledgerError) {
        logger.warn({
          layer: "ai",
          event: "charters_mark:ledger_failed",
          summary: "charter marked, but its master ledger could not be created",
          error: ledgerError,
        });
      }

      return NextResponse.json({
        success: true,
        hasBody,
        phaseCount,
        scaffolded,
        templatePhases,
        masterLedgerId,
        masterLedgerCreated,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_mark:caught",
        summary: "failed to mark note as playbook",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to mark as playbook" } },
        { status: 500 },
      );
    }
  });
}

/**
 * GET /api/content/charters/mark?contentId=… — preflight for the mark dialog.
 *
 * Reports whether the target already has a charter BODY, so the dialog offers
 * the starter template only where it is safe (an empty charter) and never
 * where it would amount to proposing an overwrite of someone's writing. The
 * POST re-checks regardless; this exists to shape the UI, not to authorize.
 */
export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const contentId = request.nextUrl.searchParams.get("contentId");
      if (!contentId) {
        return NextResponse.json(
          { success: false, error: { message: "contentId is required" } },
          { status: 400 },
        );
      }
      const node = await prisma.contentNode.findFirst({
        where: {
          id: contentId,
          ownerId: session.user.id,
          contentType: { in: ["note", "folder"] },
          deletedAt: null,
        },
        select: { notePayload: { select: { metadata: true, tiptapJson: true } } },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note or folder not found" } },
          { status: 404 },
        );
      }
      const parsed = parseCharter(
        (node.notePayload?.tiptapJson as JSONContent | undefined) ?? {
          type: "doc",
          content: [],
        },
      );
      return NextResponse.json({
        success: true,
        data: {
          isCharter: isCharterMetadata(node.notePayload?.metadata),
          hasBody:
            parsed.phases.length > 0 || parsed.standingRules.content.length > 0,
          phaseCount: parsed.phases.length,
          templatePhases: countStarterPlaceholderPhases(parsed),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "charters_mark:preflight_caught",
        summary: "charter mark preflight failed",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to read charter state" } },
        { status: 500 },
      );
    }
  });
}

/**
 * DELETE /api/content/charters/mark?contentId=… — the "unmark" path.
 * Strips the playbook markers from NotePayload.metadata while preserving any
 * other metadata. Idempotent: unmarking something that isn't a playbook (or has
 * no payload row) succeeds with `wasPlaybook: false` rather than erroring.
 */
export async function DELETE(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const contentId = request.nextUrl.searchParams.get("contentId");
      if (!contentId) {
        return NextResponse.json(
          { success: false, error: { message: "contentId is required" } },
          { status: 400 },
        );
      }

      const node = await prisma.contentNode.findFirst({
        where: {
          id: contentId,
          ownerId: session.user.id,
          contentType: { in: ["note", "folder"] },
          deletedAt: null,
        },
        select: { id: true, notePayload: { select: { metadata: true } } },
      });
      if (!node) {
        return NextResponse.json(
          { success: false, error: { message: "Note or folder not found" } },
          { status: 404 },
        );
      }

      const metadata =
        (node.notePayload?.metadata as Record<string, unknown> | null) ?? null;
      // Nothing to strip — no payload row, or not actually marked. Idempotent success.
      if (!node.notePayload || !isCharterMetadata(metadata)) {
        return NextResponse.json({ success: true, wasPlaybook: false });
      }

      await prisma.notePayload.update({
        where: { contentId: node.id },
        data: {
          metadata: stripCharterMetadata(metadata) as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({ success: true, wasPlaybook: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { success: false, error: { message: "Unauthorized" } },
          { status: 401 },
        );
      }
      logger.error({
        layer: "ai",
        event: "playbooks_unmark:caught",
        summary: "failed to unmark playbook",
        error,
      });
      return NextResponse.json(
        { success: false, error: { message: "Failed to unmark playbook" } },
        { status: 500 },
      );
    }
  });
}
