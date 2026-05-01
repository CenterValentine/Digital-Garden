"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import {
  fetchPublicPaths,
  createPublicItem,
  type PublicPathSummary,
} from "../../lib/client-api";
import { slugify, isValidSlug } from "../../lib/slug";

const PAYLOAD_TYPES = [
  { value: "blog_post", label: "Blog Post" },
  { value: "page", label: "Page" },
  { value: "bookmark", label: "Bookmark" },
  { value: "project", label: "Project" },
  { value: "profile_section", label: "Profile Section" },
] as const;

interface CreatePublicItemDialogProps {
  contentNodeId: string;
  contentTitle: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePublicItemDialog({
  contentNodeId,
  contentTitle,
  onClose,
  onCreated,
}: CreatePublicItemDialogProps) {
  const [paths, setPaths] = useState<PublicPathSummary[]>([]);
  const [isLoadingPaths, setIsLoadingPaths] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [payloadType, setPayloadType] = useState<string>("blog_post");
  const [pathId, setPathId] = useState<string>("");
  const [slug, setSlug] = useState(() => slugify(contentTitle ?? ""));
  const [publicTitle, setPublicTitle] = useState(contentTitle ?? "");
  const [slugTouched, setSlugTouched] = useState(false);

  // Auto-slug from public title unless manually edited
  useEffect(() => {
    if (!slugTouched && publicTitle) {
      setSlug(slugify(publicTitle));
    }
  }, [publicTitle, slugTouched]);

  useEffect(() => {
    setIsLoadingPaths(true);
    fetchPublicPaths()
      .then((p) => {
        setPaths(p);
        if (p.length > 0) setPathId(p[0].id);
      })
      .catch(() => toast.error("Could not load publishing paths"))
      .finally(() => setIsLoadingPaths(false));
  }, []);

  const slugError = slug && !isValidSlug(slug) ? "Slug can only contain a-z, 0-9, and hyphens" : null;
  const canSubmit = pathId && slug && !slugError && !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await createPublicItem({
        contentNodeId,
        pathId,
        payloadType,
        slug,
        publicTitle: publicTitle || undefined,
      });
      toast.success("Added to publishing as a draft.");
      onCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create public item.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
          <span className="text-sm font-medium text-white">Add to publishing</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-white/30 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Public title */}
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Title</span>
            <input
              type="text"
              value={publicTitle}
              onChange={(e) => setPublicTitle(e.target.value)}
              placeholder="Public title (optional)"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </label>

          {/* Payload type */}
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Content type</span>
            <select
              value={payloadType}
              onChange={(e) => setPayloadType(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
            >
              {PAYLOAD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {/* Path */}
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Publishing path</span>
            {isLoadingPaths ? (
              <div className="flex items-center gap-2 text-white/30 text-xs py-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading paths…
              </div>
            ) : paths.length === 0 ? (
              <p className="text-xs text-amber-400/70 py-1">
                No paths yet. Create one in the Publishing view first.
              </p>
            ) : (
              <select
                value={pathId}
                onChange={(e) => setPathId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
              >
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* Slug */}
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Slug</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="url-slug"
              className={cn(
                "w-full rounded-md border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none",
                slugError
                  ? "border-rose-500/50 focus:border-rose-500"
                  : "border-white/10 focus:border-white/20"
              )}
            />
            {slugError && (
              <p className="text-[11px] text-rose-400 mt-1">{slugError}</p>
            )}
          </label>
        </div>

        {/* Footer */}
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
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating…" : "Add as draft"}
          </button>
        </div>
      </form>
    </div>
  );
}
