/**
 * AI Tool Type Definitions
 *
 * Types for the base AI tools registry.
 * These tools are hard-coded application tools (searchNotes, getCurrentNote, createNote)
 * plus editor tools (read_first_chunk, apply_diff, etc.) added in Sprint 39.
 */

/** Context passed to tool execute functions from the API route */
export interface ToolExecuteContext {
  userId: string;
  /** The content node being edited — required for editor tools */
  contentId?: string;
  /**
   * The chat content node id when this chat is being viewed as a full-page
   * ChatViewer (i.e. the chat IS the open content, not the editor). Set
   * even though `contentId` is intentionally undefined for editor tools.
   *
   * Used by createNote to default the parent folder to the chat's own
   * parent — so "create a note about X" in a chat under /Recipes drops the
   * note next to the chat instead of at the vault root.
   */
  chatContentId?: string;
  /**
   * Image/audio attachments on the conversation, in order. propose_cards_from_media
   * references these by index to build each card's media front. The model has
   * already seen them in context, so it supplies the identification per item.
   */
  attachedMedia?: Array<{
    url: string;
    mediaType: string;
    contentNodeId?: string;
    filename?: string;
  }>;
}
