/**
 * AI Flashcard Tool Metadata (Client-Safe)
 *
 * Static metadata for the flashcard AI tools, surfaced as toggle rows
 * in AISettingsPage. NO server-side imports — safe to use in client
 * components. The settings page iterates ALL_TOOL_IDS (which includes
 * these) and reads from ALL_TOOL_METADATA.
 */

/** Flashcard tool IDs */
export const FLASHCARD_TOOL_IDS = [
  "list_decks",
  "search_decks",
  "get_deck",
  "propose_deck",
  "propose_deck_with_cards",
  "propose_image_cards",
] as const;

export type FlashcardToolId = (typeof FLASHCARD_TOOL_IDS)[number];

/** Tool metadata for the settings UI */
export const FLASHCARD_TOOL_METADATA: Record<
  FlashcardToolId,
  { name: string; description: string }
> = {
  list_decks: {
    name: "List Decks",
    description: "List all your flashcard decks with card and due counts",
  },
  search_decks: {
    name: "Search Decks",
    description: "Find existing decks by name, path, or description",
  },
  get_deck: {
    name: "Inspect Deck",
    description: "Read full detail of a specific deck and a sample of its cards",
  },
  propose_deck: {
    name: "Recommend Deck",
    description: "Suggest a new deck before creating it — you confirm in the chat",
  },
  propose_deck_with_cards: {
    name: "Recommend Cards (in a deck)",
    description:
      "Propose up to 10 cards bound to a deck — review, edit, and confirm; the commit creates the deck if it doesn't exist yet",
  },
  propose_image_cards: {
    name: "Recommend Image Cards",
    description:
      "Propose up to 5 identification cards with AI-generated images on the front (plants, insects, code, etc.) — images are generated for preview before you confirm. Uses your image-generation provider.",
  },
};
