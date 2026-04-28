"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";
import type { PageTemplateWithCategory } from "@/lib/domain/templates";
import { usePageTemplateStore } from "@/state/page-template-store";

interface PageTemplateEditorDialogProps {
  open: boolean;
  templateId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export function PageTemplateEditorDialog({
  open,
  templateId,
  onOpenChange,
  onSaved,
  onDeleted,
}: PageTemplateEditorDialogProps) {
  const [template, setTemplate] = useState<PageTemplateWithCategory | null>(null);
  const [title, setTitle] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const categories = usePageTemplateStore((s) => s.categories);
  const fetchCategories = usePageTemplateStore((s) => s.fetchCategories);
  const fetchTemplates = usePageTemplateStore((s) => s.fetchTemplates);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: getEditorExtensions(),
      editable: !template?.isSystem,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm sm:prose lg:prose-lg max-w-none focus:outline-none min-h-[360px] px-6 pt-4 pb-6",
        },
      },
    },
    [template?.isSystem]
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!template?.isSystem);
  }, [editor, template?.isSystem]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTemplate(null);
    setTitle("");
    setDefaultTitle("");
    setCategoryId("");
    setIsLoading(false);
    setIsSaving(false);
    setIsDeleting(false);
    editor?.commands.clearContent();
  }, [editor, onOpenChange]);

  useEffect(() => {
    if (!open || !templateId) return;

    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      try {
        await fetchCategories();
        const res = await fetch(`/api/content/page-templates/${templateId}`, {
          credentials: "include",
        });
        if (!res.ok) {
          toast.error("Failed to load page template");
          return;
        }
        const data: PageTemplateWithCategory = await res.json();
        if (cancelled) return;
        setTemplate(data);
        setTitle(data.title);
        setDefaultTitle(data.defaultTitle ?? "");
        setCategoryId(data.categoryId);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load page template");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, templateId, fetchCategories]);

  useEffect(() => {
    if (!isLoading && open) {
      window.setTimeout(() => titleRef.current?.focus(), 150);
    }
  }, [isLoading, open]);

  useEffect(() => {
    if (!editor || !template?.tiptapJson || !open) return;
    editor.commands.setContent(
      template.tiptapJson as Parameters<typeof editor.commands.setContent>[0]
    );
  }, [editor, template, open]);

  const handleSave = useCallback(async () => {
    if (!template || !editor || isSaving || template.isSystem) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Template title cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/content/page-templates/${template.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          tiptapJson: editor.getJSON(),
          categoryId: categoryId !== template.categoryId ? categoryId : undefined,
          defaultTitle: defaultTitle.trim() || null,
          searchText: trimmedTitle.toLowerCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Failed to save page template");
        return;
      }

      toast.success(`Page template "${trimmedTitle}" saved`);
      await fetchTemplates();
      onSaved?.();
      handleClose();
    } catch {
      toast.error("Failed to save page template");
    } finally {
      setIsSaving(false);
    }
  }, [
    template,
    editor,
    isSaving,
    title,
    categoryId,
    defaultTitle,
    fetchTemplates,
    onSaved,
    handleClose,
  ]);

  const handleDelete = useCallback(async () => {
    if (!template || template.isSystem || isDeleting) return;

    if (!confirm(`Delete page template "${template.title}"? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/content/page-templates/${template.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to delete page template");
        return;
      }

      toast.success(`Page template "${template.title}" deleted`);
      await fetchTemplates();
      onDeleted?.();
      handleClose();
    } catch {
      toast.error("Failed to delete page template");
    } finally {
      setIsDeleting(false);
    }
  }, [template, isDeleting, fetchTemplates, onDeleted, handleClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose, handleSave]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-white shadow-2xl backdrop-blur-md dark:bg-gray-900/95">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0 flex-1 pr-3">
            <input
              ref={titleRef}
              type="text"
              value={title}
              disabled={isLoading || template?.isSystem}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:text-gray-100"
              placeholder="Page template title..."
            />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
              <select
                value={categoryId}
                disabled={isLoading || template?.isSystem}
                onChange={(event) => setCategoryId(event.target.value)}
                className="min-w-[10rem] rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-[10px] text-gray-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:text-gray-400"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {template ? (
                <>
                  <span>
                    Used {template.usageCount} time{template.usageCount === 1 ? "" : "s"}
                  </span>
                  {template.isSystem ? (
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px]">
                      System Template
                    </span>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Default Note Title
          </label>
          <input
            type="text"
            value={defaultTitle}
            disabled={isLoading || template?.isSystem}
            onChange={(event) => setDefaultTitle(event.target.value)}
            placeholder="Pre-filled title when creating from this template"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gold-primary/40 disabled:cursor-not-allowed disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>

        <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-white/10">
          {isLoading ? (
            <div className="px-6 py-5 text-sm text-gray-500 dark:text-gray-400">
              Loading page template...
            </div>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {template?.isSystem
              ? "System templates are read-only."
              : "Edits here update the template used when creating new notes."}
          </div>
          <div className="flex items-center gap-2">
            {!template?.isSystem ? (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <button
              onClick={handleClose}
              className="rounded-md px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
            >
              Close
            </button>
            {!template?.isSystem ? (
              <button
                onClick={() => void handleSave()}
                disabled={isSaving || isLoading || !title.trim()}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "Saving..." : "Save (⌘S)"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
