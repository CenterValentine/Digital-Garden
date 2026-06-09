/**
 * Folder Assistant — shared types (client-safe, no Prisma/AI imports).
 *
 * The assistant places selected file-tree nodes into a folder from a
 * natural-language description. It either moves directly (when the user
 * opted into "I'm feeling lucky", or referenced a folder it remembers
 * accurately), or returns candidates for the user to confirm.
 */

export interface FolderCandidate {
  folderId: string;
  /** Full display path including the folder's own name. */
  path: string;
  reason: string;
}

export interface CreateSuggestion {
  name: string;
  /** Parent folder the new folder would be created under (null = root). */
  underFolderId: string | null;
  /** Display path of the parent (or "Root"). */
  underPath: string;
  reason: string;
}

/**
 * Everything needed to reverse a placement. Echoed back to the client on a
 * successful move and returned to `/undo` if the user rejects it.
 */
export interface UndoPayload {
  /** fileId → previous parentId (null = was at root). */
  prevParents: Record<string, string | null>;
  /** Set when the assistant created a folder for this placement. */
  createdFolderId?: string;
  /** The originating prompt — recorded as a failure in memory on undo. */
  prompt: string;
  /** The folder the files were moved into — recorded so memory can avoid it. */
  targetFolderId?: string;
}

export type FolderAssistResult =
  | {
      status: "moved";
      targetPath: string;
      movedCount: number;
      /** Human label for what moved: the file's name (1) or "N files". */
      movedLabel: string;
      createdFolder?: { id: string; name: string };
      undo: UndoPayload;
      reason: string;
    }
  | {
      status: "needs_confirmation";
      candidates: FolderCandidate[];
      createSuggestion?: CreateSuggestion;
      reason: string;
    }
  | { status: "abstain"; reason: string };

export interface FolderAssistRequest {
  fileIds: string[];
  prompt: string;
  feelingLucky: boolean;
}

export interface FolderAssistConfirmRequest {
  fileIds: string[];
  prompt: string;
  /** Confirm an existing folder… */
  folderId?: string;
  /** …or confirm creating a new one then moving into it. */
  createFolder?: { name: string; underFolderId: string | null };
}
