/**
 * Link Dialog Component
 *
 * Dialog for inserting/editing external links in the editor.
 * Triggered by Cmd+K (Mac) or Ctrl+K (Windows/Linux).
 *
 * M6: Link extension with keyboard shortcut support.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LinkDialogProps {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Load existing link data when dialog opens
  useEffect(() => {
    if (open && editor) {
      const { href } = editor.getAttributes("link");
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ");

      setUrl(href || "");
      setText(selectedText || "");

      // Focus URL input after dialog animation
      setTimeout(() => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }, 100);
    }
  }, [open, editor]);

  const handleInsert = () => {
    if (!editor || !url) return;

    // Auto-prepend https:// if no protocol is specified
    let finalUrl = url.trim();
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const isInLink = editor.isActive("link");

    if (isInLink) {
      // Update existing link (works whether text is selected or cursor is just inside link)
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: finalUrl })
        .run();
    } else if (hasSelection) {
      // Convert selected text to link
      editor
        .chain()
        .focus()
        .setLink({ href: finalUrl })
        .run();
    } else {
      // Insert new link with text
      const linkText = text || url;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          marks: [
            {
              type: "link",
              attrs: { href: finalUrl },
            },
          ],
          text: linkText,
        })
        .run();
    }

    handleClose();
  };

  const handleRemove = () => {
    if (!editor) return;

    editor.chain().focus().unsetLink().run();
    handleClose();
  };

  const handleClose = () => {
    setUrl("");
    setText("");
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleInsert();
    }
  };

  const isEditing = editor?.getAttributes("link").href;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Link" : "Insert Link"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the URL or remove the link."
              : "Enter a URL to create a clickable link."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* URL Input */}
          <div className="space-y-2">
            <label
              htmlFor="url"
              className="text-sm font-medium text-foreground"
            >
              URL
            </label>
            <input
              id="url"
              ref={urlInputRef}
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Text Input (only show for new links) */}
          {!isEditing && editor?.state.selection.empty && (
            <div className="space-y-2">
              <label
                htmlFor="text"
                className="text-sm font-medium text-foreground"
              >
                Link Text (optional)
              </label>
              <input
                id="text"
                type="text"
                placeholder="Link text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {isEditing && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleRemove}
              className="mr-auto"
            >
              Remove Link
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleInsert}
              disabled={!url}
            >
              {isEditing ? "Update" : "Insert"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
