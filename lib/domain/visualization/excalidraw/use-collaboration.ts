/**
 * Collaboration Hook Stub for Excalidraw
 *
 * Structure-only implementation for future real-time collaboration
 * Note: Excalidraw has built-in collaboration support via collab.excalidraw.com
 */

export interface ExcalidrawCollaborationState {
  isConnected: boolean;
  collaborators: Array<{
    userId: string;
    name: string;
    color: string;
    pointer?: { x: number; y: number };
  }>;
}

/**
 * Hook for managing real-time collaboration on Excalidraw drawings
 *
 * @param contentId - ID of the visualization being edited
 * @returns Collaboration state and control functions
 *
 * @example
 * const { isConnected, collaborators, startCollaboration } = useCollaboration(contentId);
 */
export function useCollaboration(contentId: string): {
  isConnected: boolean;
  collaborators: ExcalidrawCollaborationState["collaborators"];
  startCollaboration: () => void;
} {
  // TODO: Excalidraw provides `collab` prop for real-time collaboration
  // - Option 1: Use Excalidraw's hosted collab server (collab.excalidraw.com)
  // - Option 2: Self-host collaboration backend
  // - See: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration#collaboration

  // TODO: WebSocket server + room management
  // - Create room for each contentId
  // - Broadcast element changes to all participants
  // - Sync awareness (cursors, selections, user info)

  // TODO: Y.js integration (alternative to Excalidraw's built-in collab)
  // - Use Y.Array for elements
  // - Sync with WebSocket provider
  // - Handle offline editing gracefully

  console.log(`[Excalidraw useCollaboration] Stub called for contentId: ${contentId}`);

  return {
    isConnected: false,
    collaborators: [],
    startCollaboration: () => {
      console.log("Excalidraw collaboration not yet implemented");
      console.log("Integration options:");
      console.log("- Use Excalidraw's collab prop with hosted backend");
      console.log("- Self-host collaboration server");
      console.log("- Integrate Y.js for custom CRDT sync");
    },
  };
}
