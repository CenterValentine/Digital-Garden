/**
 * Collaboration Hook Stub for Mermaid
 *
 * Structure-only implementation for future real-time collaboration
 * Simpler than Diagrams.net/Excalidraw since Mermaid is text-based
 */

export interface MermaidCollaborationState {
  isConnected: boolean;
  collaborators: Array<{
    userId: string;
    name: string;
    color: string;
    cursorPosition?: number; // Character position in text
  }>;
}

/**
 * Hook for managing real-time collaboration on Mermaid diagrams
 *
 * @param contentId - ID of the visualization being edited
 * @returns Collaboration state and control functions
 *
 * @example
 * const { isConnected, collaborators, startCollaboration } = useCollaboration(contentId);
 */
export function useCollaboration(contentId: string): {
  isConnected: boolean;
  collaborators: MermaidCollaborationState["collaborators"];
  startCollaboration: () => void;
} {
  // TODO: Y.js Text CRDT for collaborative text editing
  // - Simplest of the three engines (just text sync)
  // - Use Y.Text for diagram source
  // - Sync with WebSocket provider
  // - Show remote cursors in textarea

  // TODO: WebSocket room for real-time updates
  // - Create room per contentId
  // - Broadcast text changes
  // - Sync cursor positions

  // TODO: Conflict resolution
  // - Y.js handles conflicts automatically via CRDT
  // - Show merge indicator when conflicts resolved

  console.log(`[Mermaid useCollaboration] Stub called for contentId: ${contentId}`);

  return {
    isConnected: false,
    collaborators: [],
    startCollaboration: () => {
      console.log("Mermaid collaboration not yet implemented");
      console.log("Integration points:");
      console.log("- Y.js Text CRDT for text sync");
      console.log("- WebSocket room for real-time updates");
      console.log("- Cursor position tracking");
      console.log("- Simpler than Diagrams.net/Excalidraw (just text)");
    },
  };
}
