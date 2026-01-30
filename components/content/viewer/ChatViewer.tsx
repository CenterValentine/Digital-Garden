/**
 * Chat Viewer Component (Stub)
 *
 * Placeholder for chat conversations feature.
 * Full implementation planned for Milestone: Chat V2
 */

"use client";

import { MessageSquare, AlertCircle } from "lucide-react";

interface ChatViewerProps {
  title: string;
  messages?: Array<{ role: string; content: string; timestamp: string }>;
}

export function ChatViewer({ title, messages = [] }: ChatViewerProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <MessageSquare className="h-5 w-5 text-green-400" />
        <div>
          <h1 className="text-lg font-semibold text-white">{title}</h1>
          <p className="text-sm text-gray-400">Chat Conversation</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Coming Soon Banner */}
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-yellow-400" />
            <div>
              <h3 className="text-xl font-medium text-yellow-100 mb-2">
                Chat Conversations Coming Soon
              </h3>
              <p className="text-sm text-yellow-200/80 max-w-md">
                This feature is planned for <strong>Milestone: Chat V2</strong>. It will support:
              </p>
              <ul className="mt-4 text-sm text-yellow-200/80 text-left max-w-md mx-auto space-y-2">
                <li>• Multi-turn conversations with AI assistants</li>
                <li>• Message history with timestamps</li>
                <li>• Code syntax highlighting in responses</li>
                <li>• Export chat transcripts</li>
                <li>• Link chats to related notes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Debug: Show message count if any */}
        {messages.length > 0 && (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-gray-400">
              Messages stored: {messages.length}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
