"use client";

/**
 * FlashcardCardProposalList — Session 2 interactive list.
 *
 * Renders a __cardProposal payload from the propose_cards AI tool.
 *
 * Per-card state:
 *   - Checkbox (default checked) — controls whether the card is in the
 *     batch when "Add selected" fires.
 *   - Front + Back are AdaptiveFlashcardEditor in "plain" mode so the
 *     user can tweak the AI's wording before commit. Plain mode
 *     restricts to Document/Paragraph/Text — single-paragraph editing,
 *     which fits the flashcard front/back shape.
 *   - Status: idle | creating | created | error (per row).
 *
 * Commit flow ("Add selected"):
 *   - Loops POST /api/flashcards for each checked + non-created card.
 *   - On 201: marks the row as created (✓), stays in the list as a
 *     visual receipt rather than disappearing — the user can see what
 *     was actually saved.
 *   - On failure: marks the row as error with the message inline; the
 *     row stays in the list so the user can edit + retry.
 *   - Disabled when deckExists is false (deck must be created first
 *     via the DeckProposalCard above) or when no rows are checked.
 *
 * "Ask for next batch" link (only when requestedCount > batchLimit):
 *   - Dispatches a CustomEvent("flashcard-request-next-batch") on the
 *     window with { deckPath, sourceContentId, alreadyProposed }. The
 *     chat panel listens and sends a synthetic message asking the model
 *     to propose the next batch. This is the ONE deliberate model-loop-
 *     back in the design — natural conversational flow for pagination.
 */

import { useCallback, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  BookOpen,
  Check,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Sparkles,
  Volume2,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
  slugifyDeckName,
} from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "@/extensions/flashcards/components/AdaptiveFlashcardEditor";
import { useExistingDeckPaths } from "./use-existing-deck-paths";
import { DeckPathField } from "./DeckPathField";
import { ImageCardGenGate, type ImageGenResult } from "./ImageCardGenGate";
import { AudioCardGenGate, type AudioGenResult } from "./AudioCardGenGate";
import { createAudioFrontDoc, appendAudioToDoc } from "@/lib/domain/flashcards/content";
import { useSettingsStore } from "@/state/settings-store";

/**
 * Stage 3 payload — propose_deck_with_cards. Deck info is embedded so
 * the commit step is self-sufficient: when `deck.deckExists` is false
 * the client creates the deck (using deck.name + deck.parentDeckId)
 * before posting the cards. When the parent itself hasn't been
 * created yet either (deck.parentResolved === false), the card waits
 * for a sibling propose_deck card to fire `flashcard-deck-created`
 * with the matching parent path before "Add selected" enables.
 */
interface DeckWithCardsProposalPayload {
  __deckWithCardsProposal: true;
  deck: {
    name: string;
    proposedPath: string;
    parentDeckPath: string | null;
    parentDeckId: string | null;
    parentResolved: boolean;
    rationale: string | null;
    similarExistingPaths: string[];
    deckExists: boolean;
    deckId: string | null;
    existingName: string | null;
  };
  cards: Array<{
    front: string;
    back: string;
    frontLabel?: string;
    backLabel?: string;
    // ── Identification-image cards (propose_image_cards) ──
    /** When true, this card's front is an AI-generated image + caption. */
    imageCard?: boolean;
    /** True for draft image cards awaiting client-side generation. */
    pendingImageGen?: boolean;
    /** Draft fields used to generate the image after the provider window. */
    imagePrompt?: string;
    identifyLabel?: string;
    /** Prebuilt rich front (image node + caption); present on success. */
    frontContent?: JSONContent;
    /** Preview URL for the generated image. */
    frontImageUrl?: string;
    frontImageContentId?: string | null;
    /** True when frontContent is rich (image card); drives the commit flag. */
    isFrontRichText?: boolean;
    /** Set when image generation failed for this card (still proposable). */
    imageError?: string;
    // ── Spoken audio (propose_deck_with_cards `audio` directive) ──
    /** When present, this card carries a spoken clip on the named side. The
     *  text spoken is whatever the card holds on that side. hideText → that
     *  side shows only the player (listening-comprehension card). */
    audio?: { side: "front" | "back"; hideText?: boolean };
    /** True for draft audio cards awaiting client-side TTS generation. */
    pendingAudioGen?: boolean;
    /** Preview URL for the generated audio (post-gen). */
    audioUrl?: string;
    audioContentId?: string | null;
    /** Set when TTS generation failed for this card (still proposable). */
    audioError?: string;
    // ── Sound-identification cards (propose_sound_id_cards) — scaffold ──
    /** Draft sound-ID card; commits as a text prompt until a sound provider exists. */
    soundCard?: boolean;
    /** Description of the sound to source — preserved for a future provider. */
    soundPrompt?: string;
    // ── Cards from uploaded media (propose_cards_from_media) ──
    /** Front is the uploaded image/audio itself; commits directly (no gen). */
    mediaCard?: boolean;
  }>;
  requestedCount: number;
  batchLimit: number;
  /** True when this proposal is a batch of identification-image cards. */
  imageCards?: boolean;
  /** True when one or more cards in this batch carry spoken audio. */
  audioCards?: boolean;
  /** True when this proposal is a batch of sound-identification cards (scaffold). */
  soundCards?: boolean;
  /** True when cards were built from uploaded media (propose_cards_from_media). */
  mediaCards?: boolean;
  sourceContentId: string | null;
}

/**
 * Per-proposal localStorage of "already-added card indices" so the
 * commit state survives chat reloads. Without this the row state
 * (which lives in component state) resets to idle on remount, the
 * "Add selected" button re-enables, and the user can re-submit the
 * same batch — duplicating cards in the deck.
 *
 * Key shape: flashcards:proposal-added:<proposalId>. proposalId is
 * threaded from ChatMessage as <messageId>-cards-<proposalIndex>,
 * which is stable across reloads (messages are persisted with their
 * AI SDK ids via the Conversation entity).
 */
const ADDED_STORAGE_PREFIX = "flashcards:proposal-added:";

function loadAddedIndices(proposalId: string | undefined): Set<number> {
  if (!proposalId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ADDED_STORAGE_PREFIX + proposalId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function saveAddedIndices(
  proposalId: string | undefined,
  indices: Set<number>,
): void {
  if (!proposalId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ADDED_STORAGE_PREFIX + proposalId,
      JSON.stringify(Array.from(indices)),
    );
  } catch {
    /* quota exceeded or storage disabled — silent fail, the in-memory state
       still works for the rest of this session */
  }
}

type RowStatus =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created" }
  | { status: "duplicate" }
  | { status: "error"; message: string };

/** Normalize a card front for duplicate comparison (case/space-insensitive). */
function normalizeFront(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

interface RowState {
  checked: boolean;
  /**
   * Whether the row is expanded into its TipTap editors. Default false —
   * the compact view (front → back as plain text on one line) gives a
   * scannable bullet list. Click the row's text area to expand for
   * inline editing. Rows automatically expand when their status flips
   * to "error" so the user sees what failed without an extra click.
   */
  expanded: boolean;
  frontContent: JSONContent;
  backContent: JSONContent;
  frontLabel: string;
  backLabel: string;
  status: RowStatus;
  /** Identification-image card: commit with isFrontRichText, render image. */
  isFrontRichText: boolean;
  /** Preview URL for an image-card front (null for text cards). */
  frontImageUrl: string | null;
  /** Image generation failed for this card front (still proposable as text). */
  imageError?: string;
  /** This card carries (or will carry) a spoken clip. */
  isAudioCard?: boolean;
  /**
   * A clip is actually ATTACHED to this row. Distinct from `isAudioCard`,
   * which only says the model tagged it: with per-card generation the two
   * diverge constantly — one row can have audio while its neighbour does not —
   * so the speaker indicator keys off this rather than off a batch-wide flag.
   */
  hasAudio?: boolean;
  /** Which side the clip sits on, and whether that side hides its text. */
  audioSide?: "front" | "back";
  audioHideText?: boolean;
  /** TTS generation failed for this card (still proposable as silent text). */
  audioError?: string;
  /** Editable image prompt. Seeded from the model's suggestion. */
  imagePromptDraft: string;
  /** Caption/alt the image gate pairs with the generated picture. */
  identifyLabel: string;
}

export function FlashcardCardProposalList({
  payload,
  proposalId,
}: {
  payload: DeckWithCardsProposalPayload;
  /**
   * Stable id used to persist commit state across chat reloads. When
   * provided, indices of successfully-added cards are written to
   * localStorage; on remount the rows whose indices are persisted come
   * back as `status: "created"` (checkbox disabled, button respects
   * allDone). Without this, "Add selected" re-enables on reload and the
   * user can duplicate the batch.
   */
  proposalId?: string;
}) {
  // Initialize per-row state from the payload AND from any persisted
  // commit state. Plain-text front/back are converted to single-
  // paragraph TipTap docs via createTextTiptapDoc (client-safe helper
  // from the flashcards domain).
  const initialRows = useMemo<RowState[]>(() => {
    const added = loadAddedIndices(proposalId);
    return payload.cards.map((card, idx) => {
      const wasAdded = added.has(idx);
      // Cards that arrive with a prebuilt rich front (image+caption from a
      // committed image card, or the uploaded media front from
      // propose_cards_from_media) use it directly; plain text cards convert
      // their front to a single-paragraph doc.
      const isRichFront = Boolean(card.frontContent);
      return {
        // Already-added cards default unchecked: the user can't re-add
        // them (status is created), and showing them unchecked makes
        // the "X of Y selected" counter accurate.
        checked: !wasAdded,
        expanded: false,
        frontContent: isRichFront
          ? (card.frontContent as JSONContent)
          : createTextTiptapDoc(card.front),
        backContent: createTextTiptapDoc(card.back),
        frontLabel: card.frontLabel ?? "Question",
        backLabel: card.backLabel ?? "Answer",
        status: (wasAdded
          ? { status: "created" }
          : { status: "idle" }) as RowStatus,
        isFrontRichText: isRichFront,
        frontImageUrl: card.frontImageUrl ?? null,
        imageError: card.imageError,
        isAudioCard: Boolean(card.audio),
        hasAudio: false,
        audioSide: card.audio?.side,
        audioHideText: card.audio?.hideText,
        imagePromptDraft: card.imagePrompt ?? "",
        identifyLabel: card.identifyLabel ?? card.front,
        audioError: card.audioError,
      };
    });
  }, [payload.cards, proposalId]);
  const [rows, setRows] = useState<RowState[]>(initialRows);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Image-card proposals arrive as DRAFTS (pendingImageGen) — images are
  // generated client-side after the provider window (ImageCardGenGate).
  //
  // Every card can carry an illustration, for the same reason every card can
  // carry a pronunciation: it is a property of the card, not of how the
  // proposal happened to be phrased. Which rows are still MISSING one is a
  // question about live row state, so it is answered by batchImagePlan /
  // batchAudioPlan below rather than by a flag computed from the payload.
  // ── Generation requests ──────────────────────────────────────────────
  // A request is the SUBSET of rows a generation is running for: the whole
  // batch from the footer button, or a single row from its editor. Both gates
  // already accept an arbitrary card list, so one shape serves both — and
  // carrying the row `index` on every entry is what lets a single-card result
  // land on the right row. The image path previously mapped results
  // positionally over all rows, which is correct only when the collection IS
  // every row; per-card generation is what turns that shortcut into a bug.
  type AudioRequestEntry = {
    index: number;
    side: "front" | "back";
    hideText: boolean;
    term: string;
    directed: boolean;
  };
  type ImageRequestEntry = {
    index: number;
    imagePrompt: string;
    identifyLabel: string;
  };
  const [audioRequest, setAudioRequest] = useState<AudioRequestEntry[] | null>(
    null,
  );
  const [imageRequest, setImageRequest] = useState<ImageRequestEntry[] | null>(
    null,
  );
  // Image generation is EXPLICIT, never automatic. Generated images aren't
  // written back into the persisted chat payload, so without this gate every
  // ungenerated proposal in chat history would re-fire (billable) generation on
  // each page load. The gate (and its provider window) mounts only after the
  // user clicks "Generate" — on reload the button just sits dormant.
  // Apply generated images onto the rows named by the request. Results align
  // with the request's own order, and each entry carries its row index — so a
  // one-card generation lands on that card and leaves every other row alone.
  // A failed card keeps its text front and is unchecked, so the batch commits
  // only cards that actually got an image.
  const applyImageResults = useCallback(
    (results: ImageGenResult[], plan: ImageRequestEntry[]) => {
      setRows((prev) => {
        const next = [...prev];
        plan.forEach((p, k) => {
          const r = results[k];
          if (!r) return;
          const row = next[p.index];
          if (!row) return;
          if (r.error || !r.frontContent) {
            next[p.index] = {
              ...row,
              checked: false,
              imageError: r.error ?? "No image returned",
            };
            return;
          }
          next[p.index] = {
            ...row,
            frontContent: r.frontContent as JSONContent,
            frontImageUrl: r.frontImageUrl ?? null,
            isFrontRichText: true,
            imageError: undefined,
          };
        });
        return next;
      });
      setImageRequest(null);
    },
    [],
  );

  // ── Pronunciation cards (audio twin of the image block above) ──
  // Audio proposals arrive as DRAFTS (pendingAudioGen) — TTS is synthesized
  // client-side after the voice/provider window (AudioCardGenGate). The gate is
  // shown until generation completes; "Add selected" is gated on it.
  // Per-card audio plan: only the cards carrying an `audio` directive. Each
  // entry keeps its ROW INDEX so generated clips land on the right card (a
  // batch can mix audio and silent cards), and the spoken text = the text on
  // the chosen side.
  // Pronunciation is offered for EVERY card with speakable text, not only the
  // ones the model happened to tag with an `audio` directive. Whether a card
  // can be spoken is a property of the card, not of how the proposal was
  // phrased — and the affordance appearing on some proposals but not others
  // read as a bug rather than as a feature that had not been requested.
  //
  // `directed` preserves the distinction where it actually matters, in
  // applyAudioResults: a tagged card keeps its authored placement (a listening
  // card can replace its front and hide the text), while an untagged card only
  // ever gets a clip APPENDED to its front, so nothing already there — an
  // identification image included — is overwritten.
  const audioPlan = useMemo(
    () =>
      payload.cards
        .map((c, index) => {
          const directed = c.audio?.side === "front" || c.audio?.side === "back";
          const side: "front" | "back" = directed
            ? (c.audio?.side as "front" | "back")
            : "front";
          return {
            index,
            side,
            hideText: directed ? (c.audio?.hideText ?? false) : false,
            term: ((side === "back" ? c.back : c.front) ?? "").trim(),
            directed,
          };
        })
        // Nothing to synthesize from an empty side.
        .filter((p) => p.term.length > 0),
    [payload.cards],
  );
  const audioDraftsForPlan = useCallback(
    (plan: AudioRequestEntry[]) =>
      plan.map((p) => ({
        term: p.term,
        language: undefined as string | undefined,
      })),
    [],
  );

  // Generation is EXPLICIT, never automatic — generated media isn't written
  // back into the persisted chat payload, so an automatic run would re-fire
  // billable TTS/image generation every time chat history was replayed. A
  // request only ever exists because someone clicked. That property is what
  // the old `*GenStarted` booleans protected; the request state protects it
  // the same way, while also recording WHICH rows were asked for.
  //
  // Neither medium gates committing any more. The commit button is live from
  // the start and only goes dark while a generation is actually running.
  const audioGenInFlight = audioRequest !== null;
  const imageGenInFlight = imageRequest !== null;
  const genInFlight = audioGenInFlight || imageGenInFlight;

  // What the FOOTER buttons target: every row still missing that medium and
  // not already committed. Derived from live row state rather than from the
  // payload, so a batch run after some per-card runs only covers what is left
  // — and the button count is an honest statement of what will be spent.
  const batchAudioPlan = useMemo(
    () =>
      audioPlan.filter((p) => {
        const row = rows[p.index];
        return Boolean(row) && !row.hasAudio && row.status.status !== "created";
      }),
    [audioPlan, rows],
  );
  // Row index → its audio plan entry, for the per-card button in the editor.
  const audioPlanByIndex = useMemo(
    () => new Map(audioPlan.map((p) => [p.index, p])),
    [audioPlan],
  );
  const batchImagePlan = useMemo(
    () =>
      rows.flatMap((row, index) =>
        row.frontImageUrl || row.status.status === "created"
          ? []
          : [
              {
                index,
                imagePrompt: row.imagePromptDraft.trim() || row.identifyLabel,
                identifyLabel: row.identifyLabel,
              },
            ],
      ),
    [rows],
  );

  // Apply generated audio onto the draft rows. Results align with audioPlan
  // (same order). Placement is per-card: front-side audio rebuilds the front as
  // the spoken clip (hideText → player only, for listening cards; otherwise the
  // word is shown and spoken); back-side audio appends the clip to the back.
  // Either way it autoplays when that side is shown. Failed cards get an
  // audioError and are unchecked so the batch commits only cards that got audio.
  const applyAudioResults = useCallback(
    (results: AudioGenResult[], plan: AudioRequestEntry[]) => {
      setRows((prev) => {
        const next = [...prev];
        plan.forEach((p, k) => {
          const r = results[k];
          if (!r) return;
          const row = next[p.index];
          if (r.error || !r.audioUrl) {
            next[p.index] = {
              ...row,
              checked: false,
              // Mark it an audio card even on failure, otherwise the row's
              // indicator block is skipped entirely and the error is invisible
              // on a card the model never tagged.
              isAudioCard: true,
              audioError: r.error ?? "No audio returned",
            };
            return;
          }
          if (p.side === "front" && p.directed) {
            // Authored front-audio: the clip IS the front (hideText → player
            // only, for listening cards). Replacing is the intent here.
            next[p.index] = {
              ...row,
              frontContent: createAudioFrontDoc(
                r.audioUrl,
                r.audioContentId ?? null,
                p.hideText ? "" : p.term,
                { autoplayOnFlip: true },
              ),
              isFrontRichText: true,
              isAudioCard: true,
              hasAudio: true,
              audioError: undefined,
            };
          } else if (p.side === "front") {
            // Opt-in pronunciation on an untagged card: append, never replace,
            // so an existing front (text, or a generated identification image)
            // survives with the clip added beneath it.
            next[p.index] = {
              ...row,
              frontContent: appendAudioToDoc(
                row.frontContent,
                r.audioUrl,
                r.audioContentId ?? null,
                { autoplayOnFlip: true },
              ),
              isFrontRichText: true,
              isAudioCard: true,
              hasAudio: true,
              audioError: undefined,
            };
          } else {
            next[p.index] = {
              ...row,
              backContent: appendAudioToDoc(
                row.backContent,
                r.audioUrl,
                r.audioContentId ?? null,
                { autoplayOnFlip: true },
              ),
              isAudioCard: true,
              hasAudio: true,
              audioError: undefined,
            };
          }
        });
        return next;
      });
      setAudioRequest(null);
    },
    [],
  );

  // Editable deck path — Stage 4. The user can retarget the cards to
  // a different deck OR rename the proposed leaf inline. The cached
  // existing-decks list (useExistingDeckPaths) drives a <datalist>
  // autocomplete; matches against this cache also flip the commit
  // button label between "Add selected" (existing deck) and
  // "Create deck & add" (new deck).
  const [pathDraft, setPathDraft] = useState(payload.deck.proposedPath);
  const existingDecks = useExistingDeckPaths();

  // Slugify each "/"-separated segment so user keystrokes (which may
  // include capital letters, spaces) match the canonical form stored
  // in the DB. effectivePath is what we send to the server and
  // compare against existingDecks.
  const slugifyPath = useCallback((raw: string): string => {
    return raw
      .split("/")
      .map((s) => slugifyDeckName(s))
      .filter(Boolean)
      .join("/");
  }, []);

  const {
    effectivePath,
    effectiveLeafName,
    effectiveParentPath,
    effectiveDeckExists,
    effectiveDeckId,
    effectiveParentDeckId,
    effectiveParentResolved,
  } = useMemo(() => {
    const slugged = slugifyPath(pathDraft);
    const segments = slugged.split("/").filter(Boolean);
    const leafSlug = segments.at(-1) ?? "";
    const parentSegments = segments.slice(0, -1);
    const parentPath = parentSegments.join("/");

    // Derive a display name from the leaf slug — title-cased kebab.
    // If the leaf matches an existing deck, prefer that deck's name.
    const matchingDeck = existingDecks.find((d) => d.path === slugged);
    const matchingParent = parentPath
      ? existingDecks.find((d) => d.path === parentPath)
      : null;

    const leafName =
      matchingDeck?.name ??
      leafSlug
        .split("-")
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

    return {
      effectivePath: slugged,
      effectiveLeafName: leafName,
      effectiveParentPath: parentPath || null,
      effectiveDeckExists: !!matchingDeck,
      effectiveDeckId: matchingDeck?.id ?? null,
      effectiveParentDeckId: matchingParent?.id ?? null,
      effectiveParentResolved: !parentPath || !!matchingParent,
    };
  }, [pathDraft, existingDecks, slugifyPath]);

  const updateRow = useCallback(
    (index: number, patch: Partial<RowState>) => {
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    [],
  );

  const proposedCount = rows.length;
  const checkedCount = rows.filter(
    (r) => r.checked && r.status.status !== "created",
  ).length;
  const createdCount = rows.filter((r) => r.status.status === "created").length;
  const showTruncationHint =
    payload.requestedCount > payload.batchLimit && createdCount < proposedCount;

  const headerLine =
    payload.requestedCount > proposedCount
      ? `Proposed ${proposedCount} of ${payload.requestedCount} requested cards (limit: ${payload.batchLimit} per batch)`
      : `Proposed ${proposedCount} cards (limit: ${payload.batchLimit} per batch)`;

  // Two deck-state cases after Stage 3.5 — parent unresolved no
  // longer blocks; the server cascade-creates missing ancestors:
  //   1. exists → use effectiveDeckId directly (skip create)
  //   2. doesn't exist → create-then-add. When parent doesn't exist
  //      either, pass parentDeckPath to the server and it cascades
  //      through missing levels atomically.
  const deckStatusLine = effectiveDeckExists
    ? "already exists — cards will be added to it"
    : effectiveParentResolved
      ? "new deck"
      : effectiveParentPath
        ? `new deck — inside a new "${effectiveParentPath}"`
        : "new deck";

  const handleSubmitSelected = useCallback(async () => {
    setBulkSubmitting(true);
    let successCount = 0;
    let failureCount = 0;
    let duplicateCount = 0;
    // Track successful indices in this batch so we can persist them
    // alongside any previously-persisted indices once the loop ends.
    const successfulIndices: number[] = [];

    // ─── Phase 1: ensure the target deck exists ───
    // If the embedded deck is new, create it before posting cards. The
    // server cascades through missing parent levels when we pass
    // parentDeckPath instead of parentDeckId, so even deep hierarchies
    // commit in one click.
    let targetDeckId = effectiveDeckId;
    if (!effectiveDeckExists) {
      try {
        const res = await fetch("/api/flashcards/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: effectiveLeafName,
            // Prefer the resolved parent id when we have it (faster
            // server-side, no walk). Fall back to parentDeckPath so
            // the server cascades through missing ancestors.
            ...(effectiveParentDeckId
              ? { parentDeckId: effectiveParentDeckId }
              : effectiveParentPath
                ? { parentDeckPath: effectiveParentPath }
                : {}),
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; data?: { id?: string; path?: string }; error?: { message?: string } }
          | null;
        if (!res.ok || !json?.success || !json.data?.id) {
          toast.error(
            json?.error?.message ?? `Failed to create deck (${res.status})`,
          );
          setBulkSubmitting(false);
          return;
        }
        targetDeckId = json.data.id;
        // Notify the shared deck-paths cache + any sibling card via
        // the global event. The next render picks up the new deck
        // through useExistingDeckPaths, which flips effectiveDeckExists
        // to true and effectiveDeckId to the new id.
        window.dispatchEvent(
          new CustomEvent("flashcard-deck-created", {
            detail: {
              deckPath: json.data.path ?? effectivePath,
              deckId: targetDeckId,
            },
          }),
        );
        toast.success(`Created deck "${effectiveLeafName}"`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Network error creating deck",
        );
        setBulkSubmitting(false);
        return;
      }
    }

    // ─── Phase 2: POST each selected card ───
    if (!targetDeckId) {
      // Shouldn't happen given the branch above, but be defensive.
      setBulkSubmitting(false);
      return;
    }

    // Snapshot the indexes we're submitting so async writes don't race
    // with state changes the user might make mid-flight.
    const indexesToSubmit = rows
      .map((r, i) => (r.checked && r.status.status !== "created" ? i : -1))
      .filter((i) => i >= 0);

    // Duplicate handling (opt-out setting, default on). Fetch the target deck's
    // existing card fronts ONCE so we can skip cards already in the deck — and
    // dedupe within this batch (the AI sometimes proposes the same card twice).
    // Only TEXT fronts are compared; image/media fronts have no comparable text.
    const dropDuplicates =
      useSettingsStore.getState().flashcards?.dropDuplicatesOnAdd !== false;
    const existingFronts = new Set<string>();
    const seenFronts = new Set<string>();
    if (dropDuplicates && effectiveDeckExists) {
      try {
        const res = await fetch(
          `/api/flashcards?deckId=${encodeURIComponent(targetDeckId)}`,
          { credentials: "include" },
        );
        const json = (await res.json().catch(() => null)) as
          | { data?: Array<{ frontContent?: unknown }> }
          | null;
        for (const card of json?.data ?? []) {
          const norm = normalizeFront(extractPlainTextFromTiptap(card.frontContent));
          if (norm) existingFronts.add(norm);
        }
      } catch {
        // Non-fatal — on fetch failure we just don't dedupe against the deck.
      }
    }

    for (const i of indexesToSubmit) {
      const row = rows[i];

      // Skip duplicates (already in the deck, or earlier in this batch).
      if (dropDuplicates) {
        const norm = normalizeFront(extractPlainTextFromTiptap(row.frontContent));
        if (norm && (existingFronts.has(norm) || seenFronts.has(norm))) {
          updateRow(i, { status: { status: "duplicate" }, checked: false });
          duplicateCount++;
          continue;
        }
        if (norm) seenFronts.add(norm);
      }

      updateRow(i, { status: { status: "creating" } });
      try {
        const res = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: targetDeckId,
            frontContent: row.frontContent,
            backContent: row.backContent,
            frontLabel: row.frontLabel,
            backLabel: row.backLabel,
            isFrontRichText: row.isFrontRichText,
            sourceContentId: payload.sourceContentId ?? undefined,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; error?: { message?: string } }
          | null;

        if (!res.ok || !json?.success) {
          const message =
            json?.error?.message ?? `Failed (${res.status})`;
          updateRow(i, {
            status: { status: "error", message },
            expanded: true,
          });
          failureCount++;
          continue;
        }
        updateRow(i, { status: { status: "created" } });
        successfulIndices.push(i);
        successCount++;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error";
        updateRow(i, {
          status: { status: "error", message },
          expanded: true,
        });
        failureCount++;
      }
    }

    // Persist the newly-created indices alongside any that were already
    // saved (e.g. from a previous partial-success submit). Survives a
    // chat reload — the next mount reads these and starts those rows
    // as `status: "created"` so "Add selected" stays disabled.
    if (successfulIndices.length > 0) {
      const existing = loadAddedIndices(proposalId);
      for (const idx of successfulIndices) existing.add(idx);
      saveAddedIndices(proposalId, existing);
    }

    setBulkSubmitting(false);
    if (successCount > 0) {
      toast.success(
        `Added ${successCount} card${successCount === 1 ? "" : "s"} to ${effectivePath}` +
          (duplicateCount > 0
            ? ` · skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`
            : ""),
      );
    } else if (duplicateCount > 0 && failureCount === 0) {
      toast.info(
        `All ${duplicateCount} selected card${duplicateCount === 1 ? " was a duplicate" : "s were duplicates"} — already in ${effectivePath}`,
      );
    }
    if (failureCount > 0) {
      toast.error(
        `${failureCount} card${failureCount === 1 ? "" : "s"} failed — see inline errors`,
      );
    }
  }, [
    effectiveDeckId,
    effectiveDeckExists,
    effectiveParentDeckId,
    effectiveParentPath,
    effectivePath,
    effectiveLeafName,
    payload,
    rows,
    updateRow,
    proposalId,
  ]);

  const handleAskForNextBatch = useCallback(() => {
    const alreadyProposed = rows
      .filter((r) => r.status.status === "created")
      .map((r, i) => `${i + 1}`);
    window.dispatchEvent(
      new CustomEvent("flashcard-request-next-batch", {
        detail: {
          deckPath: effectivePath,
          deckId: effectiveDeckId,
          sourceContentId: payload.sourceContentId,
          alreadyProposedCount: alreadyProposed.length,
          totalRequested: payload.requestedCount,
          batchLimit: payload.batchLimit,
        },
      }),
    );
  }, [effectiveDeckId, effectivePath, payload, rows]);

  const allDone =
    rows.length > 0 &&
    rows.every((r) => r.status.status === "created");

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-3 text-sm dark:border-amber-400/20 dark:bg-amber-500/[0.06] max-w-md space-y-2 overflow-x-hidden">
      <div className="flex items-start gap-2">
        <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {headerLine}
          </div>
          {/*
            Stage 4 — editable deck path. The user can rename the
            leaf, retarget under a different parent, or pick an
            existing deck from the autocomplete list. Each keystroke
            re-derives effectivePath / effectiveDeckExists / etc.,
            so the button label, the absorbed-create affordance, and
            the deck-status hint all update in sync with what the
            user types. "/" creates a sub-deck.
          */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-300">
            <span className="shrink-0">Target deck:</span>
            <DeckPathField
              value={pathDraft}
              onChange={setPathDraft}
              disabled={bulkSubmitting || allDone}
              placeholder="e.g. spanish/irregular-verbs"
              accent="amber"
              ariaLabel="Target deck path"
              resetValueOnBlankBlur={payload.deck.proposedPath}
            />
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            <span className="font-mono">{effectivePath || "(empty path)"}</span>
            {" — "}
            <span>{deckStatusLine}</span>
            {effectivePath !== payload.deck.proposedPath && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setPathDraft(payload.deck.proposedPath)}
                  className="text-amber-700 hover:underline dark:text-amber-300"
                >
                  reset
                </button>
              </>
            )}
          </div>
          {payload.sourceContentId && (
            <div className="text-[11px] text-gray-500 dark:text-gray-300">
              Source: linked to the open note
            </div>
          )}
        </div>
      </div>

      {/*
        Absorbed deck-create affordance — Stage 3. When the leaf deck
        doesn't yet exist, surface the rationale + similar-existing
        chips so the user sees what's about to be created on commit.
        This is the inline equivalent of the old separate
        DeckProposalCard.
      */}
      {!effectiveDeckExists && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.04] p-2 text-[12px] dark:border-emerald-400/20 dark:bg-emerald-500/[0.06] space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <span className="text-gray-700 dark:text-gray-300">
                {/* "On commit" is developer vocabulary — the reader is adding
                    cards, not committing a transaction. Name the button they
                    are about to press instead. */}
                Adding these cards will also create the deck{" "}
                <span className="font-mono text-emerald-700 dark:text-emerald-300">
                  {effectivePath}
                </span>
              </span>
            </div>
          </div>
          {payload.deck.rationale && (
            <p className="text-gray-600 dark:text-gray-300">
              {payload.deck.rationale}
            </p>
          )}
          {payload.deck.similarExistingPaths.length > 0 && (
            <div className="text-[11px] text-gray-500 dark:text-gray-300">
              <div className="mb-1">
                Similar existing decks (tell the AI to use one instead):
              </div>
              <div className="flex flex-wrap gap-1">
                {payload.deck.similarExistingPaths.map((path) => (
                  <span
                    key={path}
                    className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
                  >
                    {path}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        Both media gates render only while a generation the user asked for is
        running, and each is driven by its request — the subset of rows that
        generation is for. The dormant "N cards need an image" banner is gone
        for the same reason the audio one went: it announced work the user had
        not asked for and blocked the commit until it was answered. The opt-in
        now lives beside the commit button (whole batch) and inside each row's
        editor (that card alone).
      */}
      {imageRequest && (
        <ImageCardGenGate
          cards={imageRequest.map((p) => ({
            imagePrompt: p.imagePrompt,
            identifyLabel: p.identifyLabel,
          }))}
          onComplete={(results) => applyImageResults(results, imageRequest)}
        />
      )}

      {audioRequest && (
        <AudioCardGenGate
          cards={audioDraftsForPlan(audioRequest)}
          onComplete={(results) => applyAudioResults(results, audioRequest)}
        />
      )}

      {/*
        Sound-identification cards (propose_sound_id_cards) — SCAFFOLD. No sound
        provider is wired yet, so these commit as text prompts; the banner is
        honest about that and points at the working (uploaded-clip) path.
      */}
      {payload.soundCards && (
        <div className="mx-1 mb-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] px-3 py-2.5 text-[12px] text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <Volume2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Sound clips aren&apos;t auto-generated yet</p>
              <p className="opacity-80">
                These commit as text prompts for now. To attach real audio, upload
                your clips and use “cards from media.”
              </p>
            </div>
          </div>
        </div>
      )}

      {/*
        Gallery: compact bullet list by default (one row per card,
        front → back as plain text), expandable on click into the full
        TipTap editors. Max-height + scroll keeps the cards panel from
        dominating the chat when there are 10. Rows auto-expand when
        their status flips to "error" so the user sees what failed.
      */}
      <div className="max-h-[480px] overflow-y-auto rounded-md border border-amber-400/20 bg-white/30 dark:border-amber-400/15 dark:bg-white/[0.02] divide-y divide-amber-400/15 dark:divide-amber-400/10">
        {rows.map((row, i) => {
          const isCreated = row.status.status === "created";
          const isCreating = row.status.status === "creating";
          const isError = row.status.status === "error";
          const isDuplicate = row.status.status === "duplicate";
          const frontPreview =
            extractPlainTextFromTiptap(row.frontContent) || "(empty)";
          const backPreview =
            extractPlainTextFromTiptap(row.backContent) || "(empty)";
          return (
            <div
              key={i}
              className={`${
                isCreated
                  ? "bg-emerald-500/[0.04]"
                  : isError
                    ? "bg-red-500/[0.04]"
                    : isDuplicate
                      ? "opacity-60"
                      : ""
              }`}
            >
              {/* Compact row — checkbox + summary + status icon + chevron */}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={isCreated || isCreating || isDuplicate}
                  onChange={(e) =>
                    updateRow(i, { checked: e.target.checked })
                  }
                  aria-label={`Include card ${i + 1}`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-amber-500 disabled:cursor-not-allowed"
                />
                {/* Identification-image preview thumbnail (propose-time gen). */}
                {row.frontImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not a static asset; next/image adds no value for a 36px proposal thumbnail
                  <img
                    src={row.frontImageUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded border border-amber-400/20 object-cover"
                  />
                ) : row.imageError ? (
                  <span
                    title={`Image generation failed: ${row.imageError}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-400/30 text-red-500"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                ) : null}
                {/* Pronunciation indicator: warns on failed TTS, otherwise a
                    speaker once audio is attached (post-gen). */}
                {row.isAudioCard ? (
                  row.audioError ? (
                    <span
                      title={`Audio generation failed: ${row.audioError}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-400/30 text-red-500"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                  ) : row.hasAudio ? (
                    <span
                      title="Pronunciation plays on flip"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-amber-400/20 text-amber-600 dark:text-amber-400"
                    >
                      <Volume2 className="h-4 w-4" />
                    </span>
                  ) : null
                ) : null}
                {/*
                  Horizontal scroll-to-peek pattern on the flex item:
                  whitespace-nowrap keeps the row one line tall,
                  overflow-x-auto lets the user wheel/trackpad/drag-
                  scroll to peek at the truncated definition. min-w-0 +
                  flex-1 + shrink-0 on the icon column keep the status
                  icons unobstructed regardless of text length. The
                  scrollbar itself is HIDDEN (scrollbar-width:none for
                  Firefox; ::-webkit-scrollbar display:none for
                  Chromium/Safari) — the gesture is invisible by design;
                  the user discovers it by swiping. Click still triggers
                  expand because a tap-without-drag fires onClick before
                  the scroll gesture is recognized.
                */}
                <button
                  type="button"
                  onClick={() =>
                    updateRow(i, { expanded: !row.expanded })
                  }
                  className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-left text-[12px] text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                  aria-expanded={row.expanded}
                  aria-controls={`card-editor-${i}`}
                  title={row.expanded ? "Collapse" : `${frontPreview} → ${backPreview}`}
                >
                  <span className="mr-1 font-medium text-gray-500 dark:text-gray-300">
                    {i + 1}.
                  </span>
                  {frontPreview}
                  <span className="mx-1 text-gray-400 dark:text-gray-400">
                    →
                  </span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {backPreview}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {isCreated && (
                    <Check
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-label="Added"
                    />
                  )}
                  {isCreating && (
                    <Loader2
                      className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400"
                      aria-label="Adding"
                    />
                  )}
                  {isError && (
                    <AlertTriangle
                      className="h-4 w-4 text-red-600 dark:text-red-400"
                      aria-label="Error"
                    />
                  )}
                  {isDuplicate && (
                    <span
                      className="rounded bg-gray-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                      title="Already in this deck — skipped"
                    >
                      Duplicate
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateRow(i, { expanded: !row.expanded })
                    }
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label={row.expanded ? "Collapse" : "Expand to edit"}
                  >
                    {row.expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded editors */}
              {row.expanded && (
                <div
                  id={`card-editor-${i}`}
                  className="space-y-1.5 px-2 pb-2 pl-8"
                >
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {row.frontLabel}
                  </div>
                  {/*
                    Image cards: the front is a generated image + caption —
                    not text-editable. Show it read-only (the user edits the
                    answer, or unchecks the card if the image is wrong).
                    `tight` overrides `compact` here — the term side is one
                    line by default and auto-grows on wrap.
                  */}
                  {row.frontImageUrl ? (
                    <div className="space-y-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL preview */}
                      <img
                        src={row.frontImageUrl}
                        alt={frontPreview}
                        className="max-h-48 w-auto rounded border border-amber-400/20 object-contain"
                      />
                      <div className="text-[12px] text-gray-700 dark:text-gray-300">
                        {frontPreview}
                      </div>
                    </div>
                  ) : (
                    <AdaptiveFlashcardEditor
                      value={row.frontContent}
                      onChange={(value) =>
                        updateRow(i, { frontContent: value })
                      }
                      mode="plain"
                      placeholder="Front"
                      editable={!isCreated && !isCreating}
                      ariaLabel={`Card ${i + 1} front`}
                      tight
                    />
                  )}
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {row.backLabel}
                  </div>
                  <AdaptiveFlashcardEditor
                    value={row.backContent}
                    onChange={(value) =>
                      updateRow(i, { backContent: value })
                    }
                    mode="plain"
                    placeholder="Back"
                    editable={!isCreated && !isCreating}
                    ariaLabel={`Card ${i + 1} back`}
                    compact
                  />
                  {/*
                    Per-card media. The same two generators the footer runs,
                    scoped to this row — both gates already accept an arbitrary
                    card list, so a one-entry request is an ordinary call, not a
                    special case. Hidden once the card is committed.
                  */}
                  {!isCreated && (
                    <div className="space-y-1.5 rounded border border-amber-400/20 bg-amber-500/[0.03] p-1.5 dark:bg-amber-500/[0.05]">
                      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Image prompt
                      </div>
                      <input
                        type="text"
                        value={row.imagePromptDraft}
                        onChange={(e) =>
                          updateRow(i, { imagePromptDraft: e.target.value })
                        }
                        disabled={isCreating || genInFlight}
                        placeholder={`Describe a picture for “${row.identifyLabel}”`}
                        aria-label={`Card ${i + 1} image prompt`}
                        className="w-full rounded border border-black/10 bg-white/70 px-2 py-1 text-[12px] outline-none focus:border-amber-500 disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setImageRequest([
                              {
                                index: i,
                                imagePrompt:
                                  row.imagePromptDraft.trim() ||
                                  row.identifyLabel,
                                identifyLabel: row.identifyLabel,
                              },
                            ])
                          }
                          disabled={isCreating || genInFlight}
                          className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:text-amber-300"
                        >
                          <ImageIcon className="h-3 w-3" />
                          {row.frontImageUrl
                            ? "Regenerate image"
                            : "Generate image"}
                        </button>
                        {audioPlanByIndex.has(i) && (
                          <button
                            type="button"
                            onClick={() =>
                              setAudioRequest([audioPlanByIndex.get(i)!])
                            }
                            disabled={isCreating || genInFlight}
                            className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:text-amber-300"
                          >
                            <Volume2 className="h-3 w-3" />
                            {row.hasAudio
                              ? "Regenerate pronunciation"
                              : "Generate pronunciation"}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {row.imageError && (
                    <div className="flex items-start gap-1.5 rounded bg-red-500/10 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>
                        Image generation failed: {row.imageError}{" "}
                        <a
                          href="/help/image-generation"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200"
                        >
                          How to enable image generation →
                        </a>
                      </span>
                    </div>
                  )}
                  {row.status.status === "error" && (
                    <div className="flex items-start gap-1.5 rounded bg-red-500/10 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{row.status.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          {/* "selected" is redundant beside a column of checkboxes, and the
              status text was wrapping to two lines alongside the actions. */}
          {allDone
            ? `All ${createdCount} added`
            : `${checkedCount} of ${proposedCount}${
                createdCount > 0 ? ` · ${createdCount} added` : ""
              }`}
        </div>
        <div className="flex items-center gap-2">
          {showTruncationHint && (
            <button
              type="button"
              onClick={handleAskForNextBatch}
              className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:underline dark:text-amber-300"
              title={`Ask the AI to propose the next ${payload.batchLimit}`}
            >
              Ask for next batch
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
          {/*
            Pronunciation as a peer of the commit action, not a prerequisite of
            it. Sits immediately left of "Create deck & add" so the pair reads
            as one choice: speak them first, or just add them.
          */}
          {/*
            Batch actions target every row still missing that medium. They are
            SECONDARY to committing, so they read as icon + count and carry
            their full sentence in the tooltip: three buttons each spelling out
            "Generate 15 …" wrapped the footer onto two lines and repeated the
            same 15 three times. The count stays visible because it is the one
            piece the user needs before clicking — it is what will be spent.
          */}
          {!allDone && batchAudioPlan.length > 0 && (
            <button
              type="button"
              onClick={() => setAudioRequest(batchAudioPlan)}
              disabled={genInFlight}
              title={`Generate spoken pronunciation for ${batchAudioPlan.length} card${batchAudioPlan.length === 1 ? "" : "s"} — optional, uses your speech provider`}
              aria-label={`Generate ${batchAudioPlan.length} pronunciations`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-300 dark:hover:bg-amber-400/20"
            >
              <Volume2 className="h-3.5 w-3.5" />
              {batchAudioPlan.length}
            </button>
          )}
          {!allDone && batchImagePlan.length > 0 && (
            <button
              type="button"
              onClick={() => setImageRequest(batchImagePlan)}
              disabled={genInFlight}
              title={`Generate a front image for ${batchImagePlan.length} card${batchImagePlan.length === 1 ? "" : "s"} — optional, uses your image provider`}
              aria-label={`Generate ${batchImagePlan.length} images`}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-300 dark:hover:bg-amber-400/20"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {batchImagePlan.length}
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmitSelected}
            disabled={
              checkedCount === 0 ||
              bulkSubmitting ||
              allDone ||
              !effectivePath ||
              genInFlight
            }
            title={
              imageGenInFlight
                ? "Generating images…"
                : audioGenInFlight
                  ? "Generating pronunciations…"
                  : !effectivePath
                    ? "Target deck path is empty — type a path or pick from the dropdown"
                    : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.08] px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:bg-amber-500/[0.10] dark:text-amber-300 dark:hover:bg-amber-500/[0.18]"
          >
            {bulkSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {!effectiveDeckExists ? "Creating + adding…" : "Adding…"}
              </>
            ) : !effectiveDeckExists ? (
              // "Create deck & add (15)" was the longest string in the row and
              // the deck line directly above already says the deck is new.
              `Create & add${checkedCount > 0 ? ` (${checkedCount})` : ""}`
            ) : (
              `Add${checkedCount > 0 ? ` (${checkedCount})` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
