/**
 * AI Tool Type Definitions
 *
 * Types for the base AI tools registry.
 * These tools are hard-coded application tools (searchNotes, getCurrentNote, createNote)
 * plus editor tools (read_first_chunk, apply_diff, etc.) added in Sprint 39.
 */

import type { PlaybookOutputDirective } from "../playbooks/output-directives";
import type { PhaseCheckpointGate } from "../playbooks/checkpoint-gate";

/** Context passed to tool execute functions from the API route */
export interface ToolExecuteContext {
  userId: string;
  /** The content node being edited — required for editor tools */
  contentId?: string;
  /**
   * Set by the chat route AFTER playbook resolution (attached or rooted
   * execution) when a playbook's full body is already injected into the
   * system prompt. getCurrentNote returns a short pointer for this id
   * instead of re-sending the body — weak models re-read the playbook as a
   * belt-and-braces habit (measured: 17k duplicate chars in one live run).
   * The pointer is absence-safe: the source is re-injected every request.
   */
  activePlaybook?: { contentId: string; title: string };
  /**
   * The bound Conversation entity id (sidebar multi-conv / full-page chat).
   * AI v3 core S3: lets tools associate created/read content with the
   * conversation (dual association — node + target folder).
   */
  conversationId?: string;
  /**
   * The conversation's target folder (AI v3 core S3, umbrella decision #7).
   * This is the storage parent for output nodes unless the selected target or
   * an explicit user destination overrides it. Referenced outputs additionally
   * use outputOwnerId so they appear under the selected chat/content.
   */
  targetFolderId?: string;
  /**
   * Mutable per-request token accumulator (v3.1 R5 tokens-per-phase).
   * The route's onStepFinish adds each step's usage; phase_checkpoint
   * reads it at execute time to stamp "tokens so far" into the Run
   * Ledger. Scoped to ONE streamText call — the ledger's per-phase
   * deltas come from subtracting successive checkpoint stamps.
   */
  runTokens?: { total: number };
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
   * Output-owner ContentNode id (Chat Outputs & References plan, WS3): the
   * chat this turn belongs to, when it can own referenced content — a
   * full-page chat's own id, or a sidebar chat's archived ContentNode id.
   * Undefined for a transient/unsaved sidebar chat (no node to own under).
   *
   * Output tools use this to nest content they
   * create as a REFERENCE under the chat by default — `role: "referenced"`
   * + `ownedByNoteId: outputOwnerId` — but ONLY when the user didn't name an
   * explicit destination (an explicit parentId always wins; this is a
   * fallback default, never an override of what the user asked for).
   */
  outputOwnerId?: string;
  /**
   * Stable symbolic destinations available to an individual tool call.
   * These are distinct from outputOwnerId, which is only the turn's preset.
   * A playbook can therefore route one artifact under the chat/content while
   * leaving every other artifact on the preset.
   */
  outputChatOwnerId?: string;
  outputContentOwnerId?: string;
  outputContentParentId?: string | null;
  /**
   * Trusted output-location directives extracted from the active/rooted
   * playbook. Write tools use these only when the model omits placement, and
   * only when the artifact title matches the directive's literal prefix.
   */
  playbookOutputDirectives?: PlaybookOutputDirective[];
  /**
   * Mutable request-scoped proof that externally verifiable current-phase
   * work actually ran before `phase_checkpoint` can request approval.
   */
  phaseCheckpointGate?: PhaseCheckpointGate;
  /**
   * Output-target chip "folder" mode (WS7): when the user chose a specific
   * folder for outputs, this is that folder id. Output tools file new content
   * there as a PLAIN primary node (not a referenced child) — the same as if
   * the user had named the folder. Overrides the referenced-owner default;
   * still yields to an explicit destination the model resolves per-request.
   */
  outputParentOverride?: string;
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
  /**
   * Agentic Browsing Phase 1: the approved per-run page budget when a research
   * run is active this turn. Raises the server-read acquisition budget above the
   * default so a multi-page research loop isn't strangled by the per-turn cap.
   * Undefined outside a research run (default cap applies).
   */
  researchPageBudget?: number;
}
