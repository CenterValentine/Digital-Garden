/**
 * AI Flashcard Tools
 *
 * Five tools that let the model interact with the user's flashcard decks:
 *
 * Inspection (return formatted text):
 *   1. list_decks   — flat list of decks ordered by path
 *   2. search_decks — case-insensitive contains-match on name/path/description
 *   3. get_deck     — full deck detail by id or path, with sample cards
 *
 * Proposals (return sentinel JSON for the chat panel to render):
 *   4. propose_deck  — returns __deckProposal — no DB write
 *   5. propose_cards — returns __cardProposal — no DB write; hard cap 10 cards
 *
 * The chat panel sniffs for the __deckProposal / __cardProposal sentinels
 * (same mechanism as __editPayload / __imagePayload) and renders cards
 * with action buttons. Session 1 renders read-only stubs; Session 2 wires
 * the commit buttons to POST /api/flashcards/decks and POST /api/flashcards.
 */

import "server-only";
import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { summarizeFlashcardContent, slugifyDeckName } from "@/lib/domain/flashcards";
import type { ToolExecuteContext } from "./types";

const CARD_BATCH_LIMIT = 10;

interface DeckRow {
  id: string;
  name: string;
  path: string;
  parentDeckId: string | null;
  description: string | null;
}

function formatDeckLine(
  deck: DeckRow,
  totals: { total: number; due: number },
): string {
  const parent = deck.parentDeckId ? "" : " [root]";
  const desc = deck.description ? ` — ${deck.description}` : "";
  return `- ${deck.path} (id: ${deck.id})${parent}: ${totals.total} cards, ${totals.due} due${desc}`;
}

export function createFlashcardTools(ctx: ToolExecuteContext) {
  return {
    // ─── list_decks ─────────────────────────────────────────
    list_decks: tool({
      description:
        "List all of the user's flashcard decks, ordered by path. Returns deck id, name, full path (e.g. 'spanish/verbs/irregular'), total card count, and due-now count. Call this BEFORE proposing a new deck so you can prefer adding to an existing deck and detect near-matches.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const [decks, totalCounts, dueCounts] = await Promise.all([
          prisma.flashcardDeck.findMany({
            where: { ownerId: ctx.userId, deletedAt: null },
            select: {
              id: true,
              name: true,
              path: true,
              parentDeckId: true,
              description: true,
            },
            orderBy: [{ path: "asc" }],
          }),
          prisma.flashcard.groupBy({
            by: ["deckId"],
            where: {
              ownerId: ctx.userId,
              deletedAt: null,
              state: { not: "archived" },
            },
            _count: { _all: true },
          }),
          prisma.flashcard.groupBy({
            by: ["deckId"],
            where: {
              ownerId: ctx.userId,
              deletedAt: null,
              suspendedAt: null,
              state: { not: "archived" },
              due: { lte: now },
            },
            _count: { _all: true },
          }),
        ]);

        if (decks.length === 0) {
          return "You don't have any flashcard decks yet. Use propose_deck to suggest one.";
        }

        const totalByDeck = new Map<string, number>();
        for (const row of totalCounts) {
          if (row.deckId) totalByDeck.set(row.deckId, row._count._all);
        }
        const dueByDeck = new Map<string, number>();
        for (const row of dueCounts) {
          if (row.deckId) dueByDeck.set(row.deckId, row._count._all);
        }

        const lines = decks.map((deck) =>
          formatDeckLine(deck, {
            total: totalByDeck.get(deck.id) ?? 0,
            due: dueByDeck.get(deck.id) ?? 0,
          }),
        );

        return [
          `You have ${decks.length} deck${decks.length !== 1 ? "s" : ""}:`,
          "",
          ...lines,
        ].join("\n");
      },
    }),

    // ─── search_decks ───────────────────────────────────────
    search_decks: tool({
      description:
        "Search flashcard decks by a query string. Matches case-insensitive against deck name, full path, and description. Use this when you suspect a deck may already exist for the user's topic — prefer adding to an existing match over proposing a new sibling. Returns up to 10 results.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("Search query — matched against deck name, path, and description"),
      }),
      execute: async ({ query }) => {
        const decks = await prisma.flashcardDeck.findMany({
          where: {
            ownerId: ctx.userId,
            deletedAt: null,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { path: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            name: true,
            path: true,
            parentDeckId: true,
            description: true,
          },
          orderBy: [{ path: "asc" }],
          take: 10,
        });

        if (decks.length === 0) {
          return `No decks matched "${query}". The topic likely needs a new deck — use propose_deck.`;
        }

        const cardCounts = await prisma.flashcard.groupBy({
          by: ["deckId"],
          where: {
            ownerId: ctx.userId,
            deletedAt: null,
            deckId: { in: decks.map((d) => d.id) },
            state: { not: "archived" },
          },
          _count: { _all: true },
        });
        const totalByDeck = new Map<string, number>();
        for (const row of cardCounts) {
          if (row.deckId) totalByDeck.set(row.deckId, row._count._all);
        }

        const lines = decks.map((deck) =>
          formatDeckLine(deck, {
            total: totalByDeck.get(deck.id) ?? 0,
            due: 0,
          }),
        );

        return [
          `${decks.length} deck${decks.length !== 1 ? "s" : ""} matched "${query}":`,
          "",
          ...lines,
        ].join("\n");
      },
    }),

    // ─── get_deck ───────────────────────────────────────────
    get_deck: tool({
      description:
        "Get full detail for a specific deck — by id OR full path. Returns the deck's name, path, description, parent deck, child decks, total card count, and a sample of up to 5 recent cards (front/back summaries). Use this when you need to inspect a deck before proposing additions.",
      inputSchema: z.object({
        deckId: z
          .string()
          .uuid()
          .optional()
          .describe("Deck id (UUID). Provide this OR path."),
        path: z
          .string()
          .min(1)
          .optional()
          .describe("Full deck path (e.g. 'spanish/verbs'). Provide this OR deckId."),
      }),
      execute: async ({ deckId, path }) => {
        if (!deckId && !path) {
          return "Provide either deckId or path.";
        }

        const deck = await prisma.flashcardDeck.findFirst({
          where: {
            ownerId: ctx.userId,
            deletedAt: null,
            ...(deckId ? { id: deckId } : {}),
            ...(path ? { path } : {}),
          },
          select: {
            id: true,
            name: true,
            path: true,
            description: true,
            parentDeckId: true,
            parent: { select: { name: true, path: true } },
            children: {
              where: { deletedAt: null },
              select: { name: true, path: true },
              orderBy: { path: "asc" },
            },
          },
        });

        if (!deck) {
          return `No deck found with ${deckId ? `id "${deckId}"` : `path "${path}"`}.`;
        }

        const [totalCount, sampleCards] = await Promise.all([
          prisma.flashcard.count({
            where: {
              ownerId: ctx.userId,
              deckId: deck.id,
              deletedAt: null,
              state: { not: "archived" },
            },
          }),
          prisma.flashcard.findMany({
            where: {
              ownerId: ctx.userId,
              deckId: deck.id,
              deletedAt: null,
              state: { not: "archived" },
            },
            select: { frontContent: true, backContent: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          }),
        ]);

        const childrenList = deck.children.length
          ? deck.children.map((c) => `  - ${c.path}`).join("\n")
          : "  (none)";

        const sampleList = sampleCards.length
          ? sampleCards
              .map((c, i) => {
                const front = summarizeFlashcardContent(c.frontContent, 80);
                const back = summarizeFlashcardContent(c.backContent, 80);
                return `  ${i + 1}. ${front} → ${back}`;
              })
              .join("\n")
          : "  (deck is empty)";

        return [
          `Deck: ${deck.name}`,
          `Path: ${deck.path} (id: ${deck.id})`,
          `Description: ${deck.description ?? "(none)"}`,
          `Parent: ${deck.parent?.path ?? "(root)"}`,
          `Total cards: ${totalCount}`,
          "",
          `Children:`,
          childrenList,
          "",
          `Sample cards (most recent ${sampleCards.length}):`,
          sampleList,
        ].join("\n");
      },
    }),

    // ─── propose_deck ───────────────────────────────────────
    propose_deck: tool({
      description:
        "Suggest a new flashcard deck for the user to confirm. Returns a proposal payload — does NOT create the deck. The user clicks 'Create deck' in the chat to commit. Use this AFTER calling list_decks/search_decks so you can populate similarExistingPaths with near-matches the user might prefer.",
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe("Display name for the new deck (e.g. 'Irregular Verbs')"),
        parentDeckPath: z
          .string()
          .optional()
          .describe(
            "Full path of the parent deck (e.g. 'spanish/verbs'). Omit for a root-level deck.",
          ),
        rationale: z
          .string()
          .min(1)
          .describe(
            "One-sentence reason this deck fits — shown to the user under the proposed name.",
          ),
        similarExistingPaths: z
          .array(z.string())
          .max(5)
          .optional()
          .describe(
            "Paths of existing decks that almost match the topic — the user may prefer to add to one of these instead. Pulled from list_decks / search_decks results.",
          ),
      }),
      execute: async ({ name, parentDeckPath, rationale, similarExistingPaths }) => {
        // Optional: validate parent exists so we don't render a card that
        // would fail on commit. Tolerate "not found" — the model may have
        // hallucinated a path.
        let parentDeckId: string | null = null;
        if (parentDeckPath) {
          const parent = await prisma.flashcardDeck.findFirst({
            where: { ownerId: ctx.userId, path: parentDeckPath, deletedAt: null },
            select: { id: true },
          });
          parentDeckId = parent?.id ?? null;
        }

        const proposedSlug = slugifyDeckName(name);
        const proposedPath = parentDeckPath
          ? `${parentDeckPath}/${proposedSlug}`
          : proposedSlug;

        return JSON.stringify({
          __deckProposal: true,
          name,
          parentDeckPath: parentDeckPath ?? null,
          parentDeckId,
          parentResolved: parentDeckPath ? parentDeckId !== null : true,
          proposedPath,
          rationale,
          similarExistingPaths: similarExistingPaths ?? [],
        });
      },
    }),

    // ─── propose_cards ──────────────────────────────────────
    propose_cards: tool({
      description:
        `Propose up to ${CARD_BATCH_LIMIT} flashcards for the user to review. Returns a proposal payload — does NOT create the cards. The user checks/unchecks cards, optionally edits front/back, and clicks 'Add selected' to commit. HARD LIMIT: ${CARD_BATCH_LIMIT} cards per call. If the user asks for more than ${CARD_BATCH_LIMIT}, propose ${CARD_BATCH_LIMIT}, set requestedCount to the true number, end your turn, and let the user accept these before you propose more.`,
      inputSchema: z.object({
        deckPath: z
          .string()
          .min(1)
          .describe(
            "Full path of the target deck (e.g. 'spanish/verbs/irregular'). Must be an existing deck OR a deck the user just proposed in this conversation.",
          ),
        cards: z
          .array(
            z.object({
              front: z
                .string()
                .min(1)
                .describe("Question / prompt side of the card (plain text)."),
              back: z
                .string()
                .min(1)
                .describe("Answer side of the card (plain text)."),
              frontLabel: z
                .string()
                .max(80)
                .optional()
                .describe("Label for the front side (default: 'Question')."),
              backLabel: z
                .string()
                .max(80)
                .optional()
                .describe("Label for the back side (default: 'Answer')."),
            }),
          )
          .min(1)
          .max(CARD_BATCH_LIMIT)
          .describe(
            `Array of ${CARD_BATCH_LIMIT} or fewer card drafts. ENFORCED by Zod — passing more will fail.`,
          ),
        requestedCount: z
          .number()
          .int()
          .min(1)
          .describe(
            "How many cards the user actually asked for. If they asked for 20 and you're proposing 10 (the batch limit), pass 20 here so the UI can show 'Proposed 10 of 20 requested'.",
          ),
        sourceContentId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "ContentNode id of the note these cards were drafted from. When the user has a note open, you should set this to that note's id so the cards link back to their source.",
          ),
      }),
      execute: async ({
        deckPath,
        cards,
        requestedCount,
        sourceContentId,
      }) => {
        // Resolve deck path → id when possible so the Session 2 commit
        // handler can POST without an extra lookup. Tolerate "not found" —
        // the deck may be one the model just proposed in this turn (not
        // yet created).
        const deck = await prisma.flashcardDeck.findFirst({
          where: { ownerId: ctx.userId, path: deckPath, deletedAt: null },
          select: { id: true, name: true },
        });

        // Default sourceContentId to the open note when the model omitted it
        const resolvedSourceContentId =
          sourceContentId ?? ctx.contentId ?? null;

        return JSON.stringify({
          __cardProposal: true,
          deckPath,
          deckId: deck?.id ?? null,
          deckName: deck?.name ?? null,
          deckExists: deck !== null,
          cards,
          requestedCount,
          batchLimit: CARD_BATCH_LIMIT,
          sourceContentId: resolvedSourceContentId,
        });
      },
    }),
  };
}
