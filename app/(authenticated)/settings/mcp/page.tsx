/**
 * MCP (Model Context Protocol) Settings Page (Stub)
 *
 * Future integration with Claude Desktop and other AI assistants
 * Currently non-functional placeholder
 */

"use client";

import { getSurfaceStyles } from "@/lib/design/system";

export default function MCPSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Model Context Protocol (MCP)</h1>
        <p className="text-muted-foreground mt-2">
          Connect your Digital Garden to AI assistants like Claude Desktop
        </p>
      </div>

      {/* Coming Soon Notice */}
      <div
        className="border border-white/10 rounded-lg p-8 text-center"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex justify-center mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            <path d="M5 3v4" />
            <path d="M19 17v4" />
            <path d="M3 5h4" />
            <path d="M17 19h4" />
          </svg>
        </div>

        <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          MCP integration is planned for a future release. This will allow you to
          connect your Digital Garden to Claude Desktop and other AI assistants,
          giving them context from your notes.
        </p>

        <div className="mt-6 space-y-3 text-sm text-gray-400 max-w-lg mx-auto text-left">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary flex-shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Real-time sync with Claude Desktop</span>
          </div>
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary flex-shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Context-aware AI assistance based on your notes</span>
          </div>
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary flex-shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Automatic knowledge graph generation</span>
          </div>
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary flex-shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Secure, local-first integration</span>
          </div>
        </div>
      </div>

      {/* Preview UI (Non-functional) */}
      <div
        className="border border-white/10 rounded-lg p-6 opacity-50 pointer-events-none"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">MCP Server Configuration</h3>

        <div className="space-y-4">
          {/* Enable Toggle (disabled) */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Enable MCP Server</div>
              <div className="text-sm text-muted-foreground mt-1">
                Allow AI assistants to access your notes via MCP
              </div>
            </div>
            <button
              disabled
              className="relative w-12 h-6 rounded-full bg-gray-600 cursor-not-allowed"
            >
              <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full" />
            </button>
          </div>

          {/* Server URL (disabled) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              MCP Server URL
            </label>
            <input
              type="text"
              disabled
              placeholder="http://localhost:3000/mcp"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-gray-500 placeholder-gray-600 cursor-not-allowed"
            />
          </div>

          {/* Connect Button (disabled) */}
          <button
            disabled
            className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-500 cursor-not-allowed font-medium"
          >
            Connect to Claude Desktop
          </button>
        </div>
      </div>

      {/* Learn More */}
      <div
        className="border border-blue-500/30 rounded-lg p-6 bg-blue-500/10"
        style={{
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <div className="flex gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-400 flex-shrink-0 mt-0.5"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <div>
            <h4 className="text-sm font-semibold text-blue-400">
              About Model Context Protocol
            </h4>
            <p className="text-sm text-gray-300 mt-1">
              MCP is an open protocol that enables AI assistants to securely
              connect to your data sources. Learn more at{" "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                modelcontextprotocol.io
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
