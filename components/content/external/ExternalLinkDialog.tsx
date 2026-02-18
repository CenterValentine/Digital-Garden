/**
 * External Link Dialog
 *
 * Dialog for creating/editing external links (bookmarks).
 * Phase 2: ExternalPayload support
 */

"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";

interface ExternalLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { name: string; url: string }) => void;
  initialName?: string;
  initialUrl?: string;
  mode?: "create" | "edit";
}

export function ExternalLinkDialog({
  open,
  onOpenChange,
  onConfirm,
  initialName = "",
  initialUrl = "",
  mode = "create",
}: ExternalLinkDialogProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const [urlCopied, setUrlCopied] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName(initialName);
      setUrl(initialUrl || "https://");
      setUrlCopied(false);
    }
  }, [open, initialName, initialUrl]);

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!url.trim() || url.trim() === "https://") {
      toast.error("URL is required");
      return;
    }

    // Auto-add https:// if protocol is missing
    let finalUrl = url.trim();
    if (!finalUrl.match(/^https?:\/\//i)) {
      finalUrl = `https://${finalUrl}`;
    }

    onConfirm({ name: name.trim(), url: finalUrl });
    onOpenChange(false);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      toast.success("URL copied to clipboard");
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy URL");
    }
  };

  if (!open) return null;

  // Ensure we're in browser environment
  if (typeof window === "undefined") return null;

  // Check if form is dirty and valid
  const isDirty = name !== initialName || url !== initialUrl;
  const isValid = name.trim().length > 0 && url.trim().length > 0 && url.trim() !== "https://";
  const canSave = isDirty && isValid;

  const dialogContent = (
    <>
      {/* Backdrop - lighter and more transparent */}
      <div
        className="fixed inset-0 z-50 bg-black/5 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2">
        <div
          className="border border-white/10 rounded-lg shadow-2xl"
          style={{
            background: glass0.background,
            backdropFilter: glass0.backdropFilter,
          }}
        >
          {/* Header */}
          <div className="border-b border-gray-900/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ExternalLink className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {mode === "create" ? "Create External Link" : "Edit External Link"}
                </h2>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="My Bookmark"
                autoFocus
                className="w-full px-3 py-2 bg-white/80 border border-gray-900/20 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* URL Field */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder="https://example.com"
                  className="flex-1 px-3 py-2 bg-white/80 border border-gray-900/20 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-2 bg-gray-900/10 hover:bg-gray-900/20 border border-gray-900/20 rounded-lg transition-colors"
                  title="Copy URL"
                >
                  {urlCopied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-700" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-900/10 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSave}
              className="px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mode === "create" ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(dialogContent, document.body);
}
