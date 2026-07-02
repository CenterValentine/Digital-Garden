import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import {
  FLASHCARD_DECK_SELECT,
  slugifyDeckName,
  toFlashcardDeckRecordDto,
} from "@/lib/domain/flashcards";

type Params = Promise<{ id: string }>;

// Compose a materialized path from a deck name + its parent's path.
// Empty parentPath → root deck (path equals slug). Used by both GET
// (read-only check) and PATCH (path rebuild on rename/reparent).
function composePath(parentPath: string | null, slug: string): string {
  if (!parentPath) return slug;
  return `${parentPath}/${slug.split("/").at(-1) ?? slug}`;
}

// GET /api/flashcards/decks/[id]
//
// Returns one deck with its aggregate counts. No descendants — clients
// who need the full subtree call /decks/tree and filter on `path`.
export async function GET(_request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const deck = await prisma.flashcardDeck.findFirst({
      where: { id, ownerId: session.user.id, deletedAt: null },
      select: FLASHCARD_DECK_SELECT,
    });
    if (!deck) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Deck not found." } },
        { status: 404 },
      );
    }

    const now = new Date();
    const [childCount, cardCount, dueCount, newCount] = await Promise.all([
      prisma.flashcardDeck.count({
        where: { ownerId: session.user.id, parentDeckId: id, deletedAt: null },
      }),
      prisma.flashcard.count({
        where: { ownerId: session.user.id, deckId: id, deletedAt: null },
      }),
      prisma.flashcard.count({
        where: {
          ownerId: session.user.id,
          deckId: id,
          deletedAt: null,
          due: { lte: now },
          state: { notIn: ["suspended", "archived"] },
        },
      }),
      prisma.flashcard.count({
        where: { ownerId: session.user.id, deckId: id, deletedAt: null, state: "new" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: toFlashcardDeckRecordDto(deck, { childCount, cardCount, dueCount, newCount }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load deck";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}

// PATCH /api/flashcards/decks/[id]
//
// Body: { name?, description?, parentDeckId? (null to detach), iconName?,
// iconColor?, displayOrder? }
//
// Renaming or reparenting rebuilds the `path` for this deck AND every
// descendant. Done in a single transaction so partial updates can't
// leave the tree inconsistent.
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const existing = await prisma.flashcardDeck.findFirst({
      where: { id, ownerId: session.user.id, deletedAt: null },
      select: FLASHCARD_DECK_SELECT,
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Deck not found." } },
        { status: 404 },
      );
    }

    const data: Prisma.FlashcardDeckUpdateInput = {};
    let pathRebuildNeeded = false;
    let newParentPath: string | null = null;
    let newSlug = existing.slug;

    if (typeof body.name === "string" && body.name.trim() && body.name !== existing.name) {
      const trimmed = body.name.trim().slice(0, 120);
      data.name = trimmed;
      newSlug = slugifyDeckName(trimmed);
      data.slug = newSlug;
      pathRebuildNeeded = true;
    }

    if (typeof body.description === "string") {
      data.description = body.description.trim().slice(0, 500) || null;
    }
    if (typeof body.iconName === "string") {
      data.iconName = body.iconName.trim().slice(0, 60) || null;
    }
    if (typeof body.iconColor === "string") {
      data.iconColor = body.iconColor.trim().slice(0, 20) || null;
    }
    if (typeof body.displayOrder === "number" && Number.isFinite(body.displayOrder)) {
      data.displayOrder = Math.trunc(body.displayOrder);
    }

    if ("parentDeckId" in body) {
      const next = body.parentDeckId;
      if (next === null) {
        data.parent = { disconnect: true };
        newParentPath = null;
        pathRebuildNeeded = true;
      } else if (typeof next === "string") {
        if (next === id) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "INVALID_INPUT", message: "Deck cannot be its own parent." },
            },
            { status: 400 },
          );
        }
        const parent = await prisma.flashcardDeck.findFirst({
          where: { id: next, ownerId: session.user.id, deletedAt: null },
          select: { id: true, path: true },
        });
        if (!parent) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "INVALID_INPUT", message: "Parent deck not found." },
            },
            { status: 400 },
          );
        }
        // Refuse to create a cycle. Cheaper than a recursive walk: a
        // parent's path will contain our current path as a prefix iff
        // that parent is one of our descendants.
        if (parent.path === existing.path || parent.path.startsWith(`${existing.path}/`)) {
          return NextResponse.json(
            {
              success: false,
              error: { code: "INVALID_INPUT", message: "Cannot reparent under a descendant." },
            },
            { status: 400 },
          );
        }
        data.parent = { connect: { id: next } };
        newParentPath = parent.path;
        pathRebuildNeeded = true;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      if (pathRebuildNeeded) {
        const newPath = composePath(newParentPath ?? null, newSlug);
        // Rebuild path on this deck.
        data.path = newPath;
        // Rebuild paths of every descendant — replace the path prefix.
        // Done by reading descendant rows and updating one-by-one;
        // groupBy/raw could be faster but per-row update is simpler and
        // the descendant set is small in practice.
        const oldPrefix = `${existing.path}/`;
        const descendants = await tx.flashcardDeck.findMany({
          where: {
            ownerId: session.user.id,
            path: { startsWith: oldPrefix },
            deletedAt: null,
          },
          select: { id: true, path: true },
        });
        for (const desc of descendants) {
          const tail = desc.path.slice(existing.path.length); // includes leading "/"
          await tx.flashcardDeck.update({
            where: { id: desc.id },
            data: { path: `${newPath}${tail}` },
          });
        }
      }
      return tx.flashcardDeck.update({
        where: { id },
        data,
        select: FLASHCARD_DECK_SELECT,
      });
    });

    return NextResponse.json({ success: true, data: toFlashcardDeckRecordDto(result) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "A deck with this name already exists at that level." },
        },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to update deck";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}

// DELETE /api/flashcards/decks/[id]?cascade=true&moveToDeckId=<uuid>
//
// Soft-delete by default. Behavior:
//   - No params + deck is empty: soft-delete just this deck.
//   - No params + deck has cards or children: refuse with NOT_EMPTY 409.
//   - ?cascade=true: soft-delete this deck + every descendant deck + every
//     card in the deleted subtree. Cards are soft-deleted (deletedAt),
//     NOT orphaned — Flashcard.deckId is NOT NULL under Migration C, so
//     leaving cards pointing at a deleted deck would mean a follow-up
//     restore-deck flow could reattach. (Older comment in this route
//     described an orphan-to-null behavior that the schema no longer
//     permits.)
//   - ?moveToDeckId=<uuid>: re-parent this deck's cards into the target
//     deck, then soft-delete this deck. Descendant decks of the source
//     are ALSO soft-deleted (their cards move too). The target deck must
//     exist, belong to the user, and not be a descendant of this deck
//     (would be self-defeating — its cards would get deleted with the
//     cascade). When moveToDeckId is passed, cascade is implied.
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const cascade = searchParams.get("cascade") === "true";
    const moveToDeckIdRaw = searchParams.get("moveToDeckId");
    const moveToDeckId =
      typeof moveToDeckIdRaw === "string" && moveToDeckIdRaw.trim()
        ? moveToDeckIdRaw.trim()
        : null;

    const existing = await prisma.flashcardDeck.findFirst({
      where: { id, ownerId: session.user.id, deletedAt: null },
      select: { id: true, path: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Deck not found." } },
        { status: 404 },
      );
    }

    // Validate moveToDeckId: must exist, belong to user, and not be the
    // deck being deleted or any of its descendants.
    let moveTarget: { id: string; path: string } | null = null;
    if (moveToDeckId) {
      if (moveToDeckId === id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_INPUT",
              message: "Cannot move cards to the deck being deleted.",
            },
          },
          { status: 400 },
        );
      }
      const target = await prisma.flashcardDeck.findFirst({
        where: { id: moveToDeckId, ownerId: session.user.id, deletedAt: null },
        select: { id: true, path: true },
      });
      if (!target) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "INVALID_INPUT", message: "Move-target deck not found." },
          },
          { status: 400 },
        );
      }
      if (
        target.path === existing.path ||
        target.path.startsWith(`${existing.path}/`)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "INVALID_INPUT",
              message:
                "Cannot move cards into a descendant of the deck being deleted.",
            },
          },
          { status: 400 },
        );
      }
      moveTarget = target;
    }

    if (!cascade && !moveTarget) {
      const [childCount, cardCount] = await Promise.all([
        prisma.flashcardDeck.count({
          where: { ownerId: session.user.id, parentDeckId: id, deletedAt: null },
        }),
        prisma.flashcard.count({
          where: { ownerId: session.user.id, deckId: id, deletedAt: null },
        }),
      ]);
      if (childCount > 0 || cardCount > 0) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_EMPTY",
              message: `Deck has ${cardCount} card(s) and ${childCount} child deck(s). Pass ?cascade=true to delete cards too, or ?moveToDeckId=<id> to move them first.`,
            },
          },
          { status: 409 },
        );
      }
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      // Collect this deck + every descendant.
      const descendants = await tx.flashcardDeck.findMany({
        where: {
          ownerId: session.user.id,
          OR: [{ id }, { path: { startsWith: `${existing.path}/` } }],
          deletedAt: null,
        },
        select: { id: true },
      });
      const deckIds = descendants.map((d) => d.id);

      let movedCardCount = 0;
      let deletedCardCount = 0;
      if (moveTarget) {
        // Move all cards out of the subtree into the target, THEN soft-
        // delete the (now-empty) decks.
        const moved = await tx.flashcard.updateMany({
          where: {
            ownerId: session.user.id,
            deckId: { in: deckIds },
            deletedAt: null,
          },
          data: { deckId: moveTarget.id },
        });
        movedCardCount = moved.count;
      } else {
        // Cascade: soft-delete the cards alongside the decks.
        const deleted = await tx.flashcard.updateMany({
          where: {
            ownerId: session.user.id,
            deckId: { in: deckIds },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
        deletedCardCount = deleted.count;
      }

      await tx.flashcardDeck.updateMany({
        where: { id: { in: deckIds } },
        data: { deletedAt: now },
      });

      return {
        deletedDeckIds: deckIds,
        movedCardCount,
        deletedCardCount,
        moveTargetDeckId: moveTarget?.id ?? null,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete deck";
    return NextResponse.json(
      { success: false, error: { code: "SERVER_ERROR", message } },
      { status: message.includes("Authentication") ? 401 : 500 },
    );
  }
}
