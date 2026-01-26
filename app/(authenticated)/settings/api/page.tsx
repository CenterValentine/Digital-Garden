/**
 * API Keys Settings Page (Stub for M8)
 *
 * Generate and manage API keys for programmatic access
 * Currently shows dummy data and console alerts
 */

"use client";

import { useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { toast } from "sonner";

// Dummy data
const DUMMY_API_KEYS = [
  {
    id: "key-1",
    name: "My Automation Script",
    createdAt: new Date("2026-01-15"),
    lastUsedAt: new Date("2026-01-20"),
    maskedKey: "sk_***abc123",
  },
  {
    id: "key-2",
    name: "Mobile App",
    createdAt: new Date("2026-01-10"),
    lastUsedAt: new Date("2026-01-19"),
    maskedKey: "sk_***xyz789",
  },
];

export default function APIKeysSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");
  const glass1 = getSurfaceStyles("glass-1");

  const [apiKeys, setApiKeys] = useState(DUMMY_API_KEYS);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");

  const handleGenerateKey = () => {
    console.log("[APIKeys] Generate key with name:", keyName);
    const newKey = `sk_live_${Math.random().toString(36).substring(2, 15)}`;
    setGeneratedKey(newKey);
    toast.success("API key generated successfully");
  };

  const handleCopyKey = (keyId: string) => {
    console.log("[APIKeys] Copy key:", keyId);
    toast.success("API key copied to clipboard (stub)");
  };

  const handleDeleteKey = (keyId: string) => {
    console.log("[APIKeys] Delete key:", keyId);
    setApiKeys(apiKeys.filter(k => k.id !== keyId));
    toast.success("API key deleted");
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">API Keys</h1>
        <p className="text-muted-foreground mt-2">
          Generate API keys to access your notes programmatically
        </p>
      </div>

      {/* API Keys List */}
      <div
        className="border border-white/10 rounded-lg p-6"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h3 className="text-lg font-semibold mb-4">Your API Keys</h3>

        <div className="space-y-3">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-4 border border-white/10 rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium">{key.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Created {key.createdAt.toLocaleDateString()} • Last used{" "}
                  {key.lastUsedAt.toLocaleDateString()}
                </div>
                <div className="text-xs text-gray-500 mt-1 font-mono">
                  {key.maskedKey}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopyKey(key.id)}
                  className="p-2 hover:bg-white/5 rounded transition-colors"
                  title="Copy key"
                >
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
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteKey(key.id)}
                  className="p-2 hover:bg-red-500/10 text-red-400 rounded transition-colors"
                  title="Delete key"
                >
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
                  >
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setShowGenerateDialog(true)}
          className="mt-4 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium"
        >
          + Generate New API Key
        </button>
      </div>

      {/* Documentation Link */}
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
            <h4 className="text-sm font-semibold text-blue-400">API Documentation</h4>
            <p className="text-sm text-gray-300 mt-1">
              Learn how to use the API in our{" "}
              <a
                href="/docs/api"
                className="text-primary hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  console.log("[APIKeys] API docs link clicked");
                  toast.info("API Documentation (wired to console)");
                }}
              >
                API Documentation
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Generate Dialog */}
      {showGenerateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className="w-full max-w-md p-6 border border-white/10 rounded-lg"
            style={{
              background: glass1.background,
              backdropFilter: glass1.backdropFilter,
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Generate API Key</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This key will have full access to your notes. Store it securely.
            </p>

            {!generatedKey ? (
              <>
                <input
                  type="text"
                  placeholder="Key name (e.g., 'My Automation Script')"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                />

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleGenerateKey}
                    disabled={!keyName}
                    className="flex-1 px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Generate Key
                  </button>
                  <button
                    onClick={() => {
                      setShowGenerateDialog(false);
                      setKeyName("");
                    }}
                    className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div
                className="border border-yellow-500/30 rounded-lg p-4 bg-yellow-500/10"
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
                    className="text-yellow-400 flex-shrink-0 mt-0.5"
                  >
                    <circle cx="7.5" cy="15.5" r="5.5" />
                    <path d="m21 2-9.6 9.6" />
                    <path d="m15.5 7.5 3 3L22 7l-3-3" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-yellow-400">
                      Save This Key Now
                    </h4>
                    <p className="text-sm text-gray-300 mt-1">
                      This is the only time you'll see this key. Copy it now.
                    </p>

                    <div className="mt-3 p-3 bg-black/30 rounded font-mono text-sm break-all">
                      {generatedKey}
                    </div>

                    <button
                      onClick={() => handleCopyToClipboard(generatedKey)}
                      className="mt-3 w-full px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2"
                    >
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
                      >
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </svg>
                      Copy to Clipboard
                    </button>

                    <button
                      onClick={() => {
                        setShowGenerateDialog(false);
                        setKeyName("");
                        setGeneratedKey("");
                      }}
                      className="mt-2 w-full px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
