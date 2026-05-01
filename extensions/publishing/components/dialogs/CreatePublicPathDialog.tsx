"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import { slugify, isValidSlug } from "../../lib/slug";

interface CreatePublicPathDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePublicPathDialog({ onClose, onCreated }: CreatePublicPathDialogProps) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-slug from title
  function handleTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  const slugError = slug && !isValidSlug(slug) ? "Slug can only contain a-z, 0-9, and hyphens" : null;
  const canSubmit = title.trim() && slug && !slugError && !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/publishing/paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), slug, description: description.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Could not create path");
      }
      toast.success("Path created.");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create path");
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
          <span className="text-sm font-medium text-white">New publishing path</span>
          <button type="button" onClick={onClose} className="p-1 rounded-md text-white/30 hover:text-white/70 transition-colors">
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
              placeholder="e.g. Blog, Projects"
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Slug (URL segment)</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              placeholder="blog"
              className={cn(
                "w-full rounded-md border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none",
                slugError ? "border-rose-500/50" : "border-white/10 focus:border-white/20"
              )}
            />
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
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-xs text-white/50 hover:text-white/80 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating…" : "Create path"}
          </button>
        </div>
      </form>
    </div>
  );
}
