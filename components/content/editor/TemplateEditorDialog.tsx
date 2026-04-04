/**
 * Template Editor Dialog
 *
 * Modal dialog for editing an existing content template in-place.
 * Renders a mini TipTap editor with the template's tiptapJson content,
 * allowing the user to modify and save it back.
 *
 * Opened via CustomEvent "edit-template" with detail: { templateId: string }
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { toast } from "sonner";
import { useTemplateStore } from "@/state/template-store";
import type { ContentTemplateWithCategory } from "@/lib/domain/templates";

export function TemplateEditorDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [template, setTemplate] = useState<ContentTemplateWithCategory | null>(null);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const categories = useTemplateStore((s) => s.categories);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Template content..." }),
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none px-4 py-3 min-h-[200px] max-h-[400px] overflow-y-auto focus:outline-none",
      },
    },
  });

  // Listen for the open event
  useEffect(() => {
    const handleOpen = async (e: Event) => {
      const detail = (e as CustomEvent<{ templateId: string }>).detail;
      if (!detail?.templateId) return;

      try {
        const res = await fetch(`/api/content/templates/${detail.templateId}`);
        if (!res.ok) {
          toast.error("Failed to load template");
          return;
        }
        const data: ContentTemplateWithCategory = await res.json();
        setTemplate(data);
        setTitle(data.title);
        setCategoryId(data.categoryId);
        setIsOpen(true);

        // Load content into editor
        if (editor && data.tiptapJson) {
          editor.commands.setContent(data.tiptapJson as Parameters<typeof editor.commands.setContent>[0]);
        }
      } catch {
        toast.error("Failed to load template");
      }
    };

    window.addEventListener("edit-template", handleOpen);
    return () => window.removeEventListener("edit-template", handleOpen);
  }, [editor]);

  // Focus title when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => titleRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Set editor content when editor becomes available after template is loaded
  useEffect(() => {
    if (editor && template?.tiptapJson && isOpen) {
      const json = template.tiptapJson as { type?: string; content?: unknown[] };
      if (json?.content) {
        editor.commands.setContent(json as any);
      }
    }
  }, [editor, template, isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setTemplate(null);
    setTitle("");
    setCategoryId("");
    editor?.commands.clearContent();
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!template || !editor || isSaving) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const tiptapJson = editor.getJSON();
      const res = await fetch(`/api/content/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          tiptapJson,
          categoryId: categoryId !== template.categoryId ? categoryId : undefined,
          searchText: trimmedTitle.toLowerCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to save template");
        return;
      }

      toast.success(`Template "${trimmedTitle}" saved`);
      useTemplateStore.getState().fetchTemplates();
      handleClose();
    } catch {
      toast.error("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  }, [template, editor, title, categoryId, isSaving, handleClose]);

  const handleDelete = useCallback(async () => {
    if (!template || isDeleting) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/content/templates/${template.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error("Failed to delete template");
        return;
      }

      toast.success(`Template "${template.title}" deleted`);
      useTemplateStore.getState().fetchTemplates();
      handleClose();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setIsDeleting(false);
    }
  }, [template, isDeleting, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose, handleSave]);

  if (!isOpen || !template) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-white/15 bg-white dark:bg-gray-900/95 shadow-2xl backdrop-blur-md flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-white/10">
          <div className="flex-1 min-w-0 mr-3">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm font-medium bg-transparent border-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
              placeholder="Template title..."
            />
            <div className="flex items-center gap-1.5 mt-0.5">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="text-[10px] text-gray-400 dark:text-gray-500 bg-transparent border-none cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                · Used {template.usageCount} time{template.usageCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-white/10">
          <EditorContent editor={editor} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save (⌘S)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
