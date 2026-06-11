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
import {
  summarizeFlashcardContent,
  slugifyDeckName,
  createImageFrontDoc,
  createAudioFrontDoc,
} from "@/lib/domain/flashcards";
import type { ToolExecuteContext } from "./types";

const CARD_BATCH_LIMIT = 10;
// Identification-image cards are capped lower than text cards: each one runs a
// real image-generation call at propose time (latency + cost).
const IMAGE_CARD_LIMIT = 5;
// Sound-identification cards (propose_sound_id_cards) — scaffold only; no sound
// provider is wired yet, so cards commit as text prompts.
const SOUND_CARD_LIMIT = 10;
// Cards from attached media (propose_cards_from_media) — the media already
// exists (the user uploaded it), so this caps how many attachments per call.
const MEDIA_CARD_LIMIT = 10;

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

    // ─── propose_deck_with_cards ────────────────────────────
    // Single tool for "cards in a deck context." The deck info is
    // embedded so the commit step is self-sufficient — if the target
    // deck doesn't exist, the client creates it as part of "Add
    // selected." The leaf-deck propose_deck call is absorbed; only the
    // standalone propose_deck remains for non-cascade deck proposals
    // (typically the PARENT deck in a hierarchy).
    propose_deck_with_cards: tool({
      description:
        `Propose up to ${CARD_BATCH_LIMIT} flashcards bound to a deck context. The deck may be EXISTING (cards added directly) or NEW (the commit step creates the deck and adds the cards atomically). HARD LIMIT: ${CARD_BATCH_LIMIT} cards per call. If the user asks for more than ${CARD_BATCH_LIMIT}, propose ${CARD_BATCH_LIMIT}, set requestedCount to the true number, end your turn, and let the user accept these before you propose more.`,
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Leaf deck name (e.g. 'Irregular Verbs'). Combined with parentDeckPath to form the full target path. If a deck at that path already exists, the cards go there directly — otherwise the commit creates the deck first.",
          ),
        parentDeckPath: z
          .string()
          .optional()
          .describe(
            "Full path of the parent deck (e.g. 'spanish'). Omit for a root-level deck.",
          ),
        rationale: z
          .string()
          .optional()
          .describe(
            "One-sentence reason this deck fits — shown to the user only when the deck doesn't yet exist (i.e. the commit will create it). Omit when targeting an existing deck.",
          ),
        similarExistingPaths: z
          .array(z.string())
          .max(5)
          .optional()
          .describe(
            "Paths of existing decks that almost match the topic — the user may prefer to add to one of these instead. Pulled from list_decks / search_decks results.",
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
              audio: z
                .object({
                  side: z
                    .enum(["front", "back"])
                    .describe(
                      "Which face carries the spoken clip — the side that holds the word/phrase in the target language. Usually 'front' (hear the term, recall its meaning); 'back' for reverse/production cards where the answer is the spoken word.",
                    ),
                  hideText: z
                    .boolean()
                    .optional()
                    .describe(
                      "true = that face shows ONLY the audio player (the spoken text IS the thing being tested) — use for LISTENING-comprehension cards (e.g. hear a Chinese sentence, recall the meaning). Put the transcription on the OTHER side. Omit/false for pronunciation, where the word is both shown and spoken.",
                    ),
                })
                .optional()
                .describe(
                  "Attach a spoken pronunciation/clip to this card. Add it when the term is non-English (or the user explicitly asks for English audio). The text spoken is whatever you wrote on the chosen `side` — do NOT repeat it elsewhere. The user picks a voice/provider before any audio is generated (opt-in).",
                ),
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
        name,
        parentDeckPath,
        rationale,
        similarExistingPaths,
        cards,
        requestedCount,
        sourceContentId,
      }) => {
        // Resolve parent path → id when possible. Tolerate "not found"
        // — the parent may be one the model just proposed in this turn
        // (not yet created); the client listens for
        // `flashcard-deck-created` to adopt it when the sibling
        // propose_deck card commits.
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

        // Does a deck at this exact path already exist? If yes, the
        // commit skips deck creation entirely. If no, the embedded
        // deck info drives the create-then-add-cards flow.
        const existing = await prisma.flashcardDeck.findFirst({
          where: { ownerId: ctx.userId, path: proposedPath, deletedAt: null },
          select: { id: true, name: true },
        });

        const resolvedSourceContentId =
          sourceContentId ?? ctx.contentId ?? null;

        // Cards carrying an `audio` directive arrive as DRAFTS — the TTS is
        // synthesized client-side after the voice/provider window
        // (AudioCardGenGate), so flag each for generation and set the batch
        // flag that mounts the gate. Audio rides alongside ordinary cards: a
        // batch can mix audio and silent cards.
        const processedCards = cards.map((c) =>
          c.audio ? { ...c, pendingAudioGen: true } : c,
        );
        const hasAudio = processedCards.some((c) => c.audio);

        return JSON.stringify({
          __deckWithCardsProposal: true,
          deck: {
            name,
            proposedPath,
            parentDeckPath: parentDeckPath ?? null,
            parentDeckId,
            parentResolved: parentDeckPath ? parentDeckId !== null : true,
            rationale: rationale ?? null,
            similarExistingPaths: similarExistingPaths ?? [],
            deckExists: existing !== null,
            deckId: existing?.id ?? null,
            existingName: existing?.name ?? null,
          },
          cards: processedCards,
          requestedCount,
          batchLimit: CARD_BATCH_LIMIT,
          audioCards: hasAudio,
          sourceContentId: resolvedSourceContentId,
        });
      },
    }),

    propose_image_cards: tool({
      description:
        `Propose up to ${IMAGE_CARD_LIMIT} IDENTIFICATION flashcards whose front is an AI-GENERATED IMAGE plus a short instruction, for visual-recall study (plants, insects, anatomy, code screenshots, landmarks, etc.). For each card you provide: imagePrompt (what image to generate), identifyLabel (a few-word instruction shown under the image, e.g. "Identify this plant"), and back (the answer). The image is generated at PROPOSE time so the user previews it before accepting. HARD LIMIT: ${IMAGE_CARD_LIMIT} cards per call — if the user asks for more, propose ${IMAGE_CARD_LIMIT}, set requestedCount to the true number, and let them accept these first. Use propose_deck_with_cards (not this) for plain text Q&A cards.`,
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Leaf deck name. Combined with parentDeckPath to form the full target path. Existing deck → cards added directly; otherwise the commit creates it first.",
          ),
        parentDeckPath: z
          .string()
          .optional()
          .describe("Full path of the parent deck (e.g. 'biology'). Omit for a root-level deck."),
        rationale: z
          .string()
          .optional()
          .describe("One-sentence reason this deck fits — shown only when the deck will be created."),
        similarExistingPaths: z
          .array(z.string())
          .max(5)
          .optional()
          .describe("Paths of existing decks that almost match — from list_decks / search_decks."),
        cards: z
          .array(
            z.object({
              imagePrompt: z
                .string()
                .min(1)
                .describe(
                  "Prompt for the image generator describing the subject to depict (e.g. 'a single monarch butterfly on a flower, photorealistic, plain background'). Be specific and unambiguous so the image clearly shows the answer.",
                ),
              identifyLabel: z
                .string()
                .min(1)
                .max(80)
                .describe(
                  "Few-word instruction shown under the image telling the user what to identify (e.g. 'Identify this butterfly', 'Name this data structure').",
                ),
              back: z
                .string()
                .min(1)
                .describe("The answer / identification revealed on the back of the card (plain text)."),
              backLabel: z
                .string()
                .max(80)
                .optional()
                .describe("Label for the back side (default: 'Answer')."),
            }),
          )
          .min(1)
          .max(IMAGE_CARD_LIMIT)
          .describe(
            `Array of ${IMAGE_CARD_LIMIT} or fewer identification card drafts. ENFORCED by Zod — passing more will fail.`,
          ),
        requestedCount: z
          .number()
          .int()
          .min(1)
          .describe(
            "How many cards the user actually asked for. If they asked for 8 and you're proposing 5 (the limit), pass 8 here.",
          ),
        sourceContentId: z
          .string()
          .uuid()
          .optional()
          .describe("ContentNode id of the note these cards were drafted from, if any."),
      }),
      execute: async ({
        name,
        parentDeckPath,
        rationale,
        similarExistingPaths,
        cards,
        requestedCount,
        sourceContentId,
      }) => {
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

        const existing = await prisma.flashcardDeck.findFirst({
          where: { ownerId: ctx.userId, path: proposedPath, deletedAt: null },
          select: { id: true, name: true },
        });

        const resolvedSourceContentId = sourceContentId ?? ctx.contentId ?? null;

        // Return DRAFTS only — no image generation here. The proposal UI gives
        // the user a short window to pick/confirm the image provider, then
        // generates the images client-side via POST /api/flashcards/generate-
        // card-images. This keeps the proposal instant and lets the user
        // control which provider (and cost) is used before any generation runs.
        const proposedCards = cards.slice(0, IMAGE_CARD_LIMIT).map((card) => ({
          front: card.identifyLabel,
          back: card.back,
          backLabel: card.backLabel,
          imageCard: true,
          pendingImageGen: true,
          imagePrompt: card.imagePrompt,
          identifyLabel: card.identifyLabel,
        }));

        return JSON.stringify({
          __deckWithCardsProposal: true,
          deck: {
            name,
            proposedPath,
            parentDeckPath: parentDeckPath ?? null,
            parentDeckId,
            parentResolved: parentDeckPath ? parentDeckId !== null : true,
            rationale: rationale ?? null,
            similarExistingPaths: similarExistingPaths ?? [],
            deckExists: existing !== null,
            deckId: existing?.id ?? null,
            existingName: existing?.name ?? null,
          },
          cards: proposedCards,
          requestedCount,
          batchLimit: IMAGE_CARD_LIMIT,
          imageCards: true,
          sourceContentId: resolvedSourceContentId,
        });
      },
    }),

    propose_sound_id_cards: tool({
      description:
        `Propose up to ${SOUND_CARD_LIMIT} SOUND-IDENTIFICATION flashcards — the front is a real-world SOUND (a bird call, animal, instrument, engine, machine) and the back names it. For auditory recall ("which bird is this?", "name this engine"). For each card provide: soundPrompt (a precise description of the exact sound to source, e.g. "song of an American Robin, clear recording"), identifyLabel (the few-word instruction shown to the user, e.g. "Identify this bird"), and back (the answer). NOTE: automatic sound generation/sourcing is NOT wired yet, so for now these commit as TEXT prompts (the identifyLabel on the front, answer on the back) without an actual clip — the soundPrompt is preserved for when a sound provider lands. To make sound-ID cards WITH real audio today, the user should upload their own clips and use "cards from media". Do NOT use this for spoken words/pronunciation (that's propose_deck_with_cards with an audio directive) or for visual identification (propose_image_cards).`,
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Leaf deck name. Combined with parentDeckPath to form the full target path. Existing deck → cards added directly; otherwise the commit creates it first.",
          ),
        parentDeckPath: z
          .string()
          .optional()
          .describe("Full path of the parent deck (e.g. 'birds'). Omit for a root-level deck."),
        rationale: z
          .string()
          .optional()
          .describe("One-sentence reason this deck fits — shown only when the deck will be created."),
        similarExistingPaths: z
          .array(z.string())
          .max(5)
          .optional()
          .describe("Paths of existing decks that almost match — from list_decks / search_decks."),
        cards: z
          .array(
            z.object({
              soundPrompt: z
                .string()
                .min(1)
                .describe(
                  "Precise description of the exact sound to source/generate (e.g. 'song of an American Robin'). Preserved for a future sound provider.",
                ),
              identifyLabel: z
                .string()
                .min(1)
                .max(80)
                .describe(
                  "Few-word instruction shown on the front (e.g. 'Identify this bird', 'Name this engine').",
                ),
              back: z
                .string()
                .min(1)
                .describe("The answer / identification revealed on the back (plain text)."),
              backLabel: z
                .string()
                .max(80)
                .optional()
                .describe("Label for the back side (default: 'Answer')."),
            }),
          )
          .min(1)
          .max(SOUND_CARD_LIMIT)
          .describe(
            `Array of ${SOUND_CARD_LIMIT} or fewer sound-identification card drafts. ENFORCED by Zod — passing more will fail.`,
          ),
        requestedCount: z
          .number()
          .int()
          .min(1)
          .describe("How many cards the user actually asked for (for the 'proposed N of M' hint)."),
        sourceContentId: z
          .string()
          .uuid()
          .optional()
          .describe("ContentNode id of the note these cards were drafted from, if any."),
      }),
      execute: async ({
        name,
        parentDeckPath,
        rationale,
        similarExistingPaths,
        cards,
        requestedCount,
        sourceContentId,
      }) => {
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

        const existing = await prisma.flashcardDeck.findFirst({
          where: { ownerId: ctx.userId, path: proposedPath, deletedAt: null },
          select: { id: true, name: true },
        });

        const resolvedSourceContentId = sourceContentId ?? ctx.contentId ?? null;

        // SCAFFOLD: no sound provider exists yet, so cards commit as plain text
        // prompts (identifyLabel → answer). The soundPrompt rides along for the
        // future generation step. soundCards flags the proposal so the UI can
        // explain the limitation + point at the upload path.
        const proposedCards = cards.slice(0, SOUND_CARD_LIMIT).map((card) => ({
          front: card.identifyLabel,
          back: card.back,
          backLabel: card.backLabel,
          soundCard: true,
          soundPrompt: card.soundPrompt,
        }));

        return JSON.stringify({
          __deckWithCardsProposal: true,
          deck: {
            name,
            proposedPath,
            parentDeckPath: parentDeckPath ?? null,
            parentDeckId,
            parentResolved: parentDeckPath ? parentDeckId !== null : true,
            rationale: rationale ?? null,
            similarExistingPaths: similarExistingPaths ?? [],
            deckExists: existing !== null,
            deckId: existing?.id ?? null,
            existingName: existing?.name ?? null,
          },
          cards: proposedCards,
          requestedCount,
          batchLimit: SOUND_CARD_LIMIT,
          soundCards: true,
          sourceContentId: resolvedSourceContentId,
        });
      },
    }),

    propose_cards_from_media: tool({
      description:
        `Make IDENTIFICATION flashcards from media the user ATTACHED to this chat (images and/or audio). You have already SEEN/heard each attachment in context — examine it and create one card per item: the FRONT is the uploaded media itself, the BACK is your identification/answer (the inverse of propose_image_cards, which GENERATES an image). For each card provide: mediaIndex (0-based index into the attached media, in the order they appear in the conversation), identifyLabel (short instruction shown under the media, e.g. "Identify this mushroom"), and back (your answer). ONLY call this when the user attached image/audio and wants cards from it — if nothing is attached, say so instead of calling it. HARD LIMIT: ${MEDIA_CARD_LIMIT} cards per call.`,
      inputSchema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Leaf deck name. Combined with parentDeckPath to form the full target path. Existing deck → cards added directly; otherwise the commit creates it first.",
          ),
        parentDeckPath: z
          .string()
          .optional()
          .describe("Full path of the parent deck. Omit for a root-level deck."),
        rationale: z
          .string()
          .optional()
          .describe("One-sentence reason this deck fits — shown only when the deck will be created."),
        similarExistingPaths: z
          .array(z.string())
          .max(5)
          .optional()
          .describe("Paths of existing decks that almost match — from list_decks / search_decks."),
        cards: z
          .array(
            z.object({
              mediaIndex: z
                .number()
                .int()
                .min(0)
                .describe(
                  "0-based index into the attached media (order they appear in the conversation). Each attachment should map to at most one card.",
                ),
              identifyLabel: z
                .string()
                .min(1)
                .max(80)
                .describe("Short instruction shown under the media (e.g. 'Identify this bird')."),
              back: z
                .string()
                .min(1)
                .describe("Your identification / answer revealed on the back (plain text)."),
              backLabel: z
                .string()
                .max(80)
                .optional()
                .describe("Label for the back side (default: 'Answer')."),
            }),
          )
          .min(1)
          .max(MEDIA_CARD_LIMIT)
          .describe(
            `Array of ${MEDIA_CARD_LIMIT} or fewer cards, one per attached item you want to test. ENFORCED by Zod.`,
          ),
        requestedCount: z
          .number()
          .int()
          .min(1)
          .describe("How many cards the user actually asked for (for the 'proposed N of M' hint)."),
        sourceContentId: z
          .string()
          .uuid()
          .optional()
          .describe("ContentNode id of the note these cards were drafted from, if any."),
      }),
      execute: async ({
        name,
        parentDeckPath,
        rationale,
        similarExistingPaths,
        cards,
        requestedCount,
        sourceContentId,
      }) => {
        const media = ctx.attachedMedia ?? [];
        if (media.length === 0) {
          return "No image or audio attachments were found in this conversation. Ask the user to attach the media first, then call this tool.";
        }

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

        const existing = await prisma.flashcardDeck.findFirst({
          where: { ownerId: ctx.userId, path: proposedPath, deletedAt: null },
          select: { id: true, name: true },
        });

        const resolvedSourceContentId = sourceContentId ?? ctx.contentId ?? null;

        // Build each card's media FRONT from the attachment the model picked.
        // The media already exists, so the front is prebuilt rich content (no
        // generation step / gate) and commits directly.
        const proposedCards = cards
          .slice(0, MEDIA_CARD_LIMIT)
          .map((card) => {
            const item = media[card.mediaIndex];
            if (!item) return null;
            const isImage = item.mediaType.startsWith("image/");
            const frontContent = isImage
              ? createImageFrontDoc(item.url, item.contentNodeId ?? null, card.identifyLabel)
              : createAudioFrontDoc(item.url, item.contentNodeId ?? null, card.identifyLabel, { autoplayOnFlip: true });
            return {
              front: card.identifyLabel,
              back: card.back,
              backLabel: card.backLabel,
              mediaCard: true,
              frontContent,
              frontImageUrl: isImage ? item.url : undefined,
              isFrontRichText: true,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (proposedCards.length === 0) {
          return "None of the provided mediaIndex values matched an attachment. Re-check the indices against the attached media order.";
        }

        return JSON.stringify({
          __deckWithCardsProposal: true,
          deck: {
            name,
            proposedPath,
            parentDeckPath: parentDeckPath ?? null,
            parentDeckId,
            parentResolved: parentDeckPath ? parentDeckId !== null : true,
            rationale: rationale ?? null,
            similarExistingPaths: similarExistingPaths ?? [],
            deckExists: existing !== null,
            deckId: existing?.id ?? null,
            existingName: existing?.name ?? null,
          },
          cards: proposedCards,
          requestedCount,
          batchLimit: MEDIA_CARD_LIMIT,
          mediaCards: true,
          sourceContentId: resolvedSourceContentId,
        });
      },
    }),
  };
}
