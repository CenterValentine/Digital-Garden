/**
 * Main Panel Content (Client Component)
 *
 * Shows editor or content viewer.
 */

"use client";

export function MainPanelContent() {
  // TODO M5: Implement TipTap editor

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="prose prose-invert mx-auto max-w-3xl">
        <h1>Welcome to Digital Garden Notes</h1>
        <p>
          This is a placeholder for the TipTap editor. The full editor will be
          implemented in M5 with rich text editing, markdown support, and
          content viewing capabilities.
        </p>
        <h2>Features Coming Soon</h2>
        <ul>
          <li>Rich text editing with TipTap</li>
          <li>Markdown mode toggle</li>
          <li>PDF viewer</li>
          <li>Image viewer</li>
          <li>Code syntax highlighting</li>
        </ul>
      </div>
    </div>
  );
}

