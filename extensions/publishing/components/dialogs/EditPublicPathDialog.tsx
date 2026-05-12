"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { slugify, isValidSlug } from "../../lib/slug";
import { updatePublicPath } from "../../lib/client-api";
import type { PublicPathNode } from "../../state/publish-tree-store";

interface EditPublicPathDialogProps {
  node: PublicPathNode;
  onClose: () => void;
  onSaved: () => void;
}

export function EditPublicPathDialog({ node, onClose, onSaved }: EditPublicPathDialogProps) {
  const [title, setTitle] = useState(node.title);
  const [slug, setSlug] = useState(node.slug);
  const [description, setDescription] = useState(node.description ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  const slugError = slug && !isValidSlug(slug) ? "Slug can only contain a-z, 0-9, and hyphens" : null;
  const hasChanges =
    title.trim() !== node.title ||
    slug !== node.slug ||
    (description.trim() || null) !== node.description;
  const canSubmit = title.trim() && slug && !slugError && hasChanges && !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await updatePublicPath(node.id, {
        title: title.trim(),
        slug,
        description: description.trim() || null,
      });
      toast.success("Path updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update path");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <span className="text-sm font-medium text-white">Edit path</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Slug (URL segment)</span>
            <div
              className="flex items-center rounded-md border bg-white/5 focus-within:border-white/20 overflow-hidden"
              style={{ borderColor: slugError ? "rgba(239,68,68,.5)" : "rgba(255,255,255,.1)" }}
            >
              <span className="pl-3 pr-1 text-sm text-white/30">/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
                className="flex-1 bg-transparent pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none"
              />
            </div>
            {slugError && <p className="text-[11px] text-rose-400 mt-1">{slugError}</p>}
          </label>

          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Description (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
