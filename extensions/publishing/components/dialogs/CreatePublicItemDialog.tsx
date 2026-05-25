"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, ChevronDown, Plus, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import { useUserTenants } from "@/lib/domain/tenancy/use-user-tenants";
import {
  fetchPublicPaths,
  createPublicItem,
  type PublicPathSummary,
} from "../../lib/client-api";
import { slugify } from "../../lib/slug";
import { useAutoSlug } from "../../lib/use-auto-slug";
import { usePublishStore, type ContentTypeEntry } from "../../state/publish-store";
import { PublishingDialog } from "./PublishingDialog";

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

  // Tenant resolution. Hook is no-op visually when user owns exactly 1
  // tenant — the picker stays hidden and we just pass the primary as the
  // destination. Multi-tenant users see the picker.
  const { tenants, primaryTenantId, loading: isLoadingTenants } = useUserTenants();
  const [tenantId, setTenantId] = useState<string>("");
  useEffect(() => {
    // When the tenants load, default the selection to the user's primary
    // (or first tenant if no primary is set — rare edge case).
    if (!tenantId && tenants.length > 0) {
      setTenantId(primaryTenantId ?? tenants[0].id);
    }
  }, [tenants, primaryTenantId, tenantId]);

  const { contentTypes, addContentType, removeContentType } = usePublishStore();
  const [payloadType, setPayloadType] = useState<string>(contentTypes[0]?.value ?? "blog_post");
  const [pathId, setPathId] = useState<string>("");
  const [publicTitle, setPublicTitle] = useState(contentTitle ?? "");
  const {
    slug,
    setSlug,
    syncFromTitle: syncSlugFromTitle,
    error: slugError,
  } = useAutoSlug(slugify(contentTitle ?? ""));

  // Auto-slug from public title unless manually edited.
  useEffect(() => {
    if (publicTitle) syncSlugFromTitle(publicTitle);
  }, [publicTitle, syncSlugFromTitle]);

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
        // Only send tenantId when the user has explicitly chosen a non-primary
        // destination. For single-tenant users (or when the primary is selected),
        // the server defaults to primaryTenantId server-side — same result, fewer
        // hops through the request body.
        tenantId:
          tenants.length > 1 && tenantId && tenantId !== primaryTenantId
            ? tenantId
            : undefined,
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
    <PublishingDialog
      title="Add to publishing"
      onClose={onClose}
      size="md"
      onSubmit={handleSubmit}
    >
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

          {/* Tenant picker — hidden when user owns exactly 1 site.
              For multi-tenant users, lets them choose which site this
              item goes to. The destination is fixed at create time
              (1:1 PublicItem/tenant model). Manage sites in
              Settings → Sites. */}
          {!isLoadingTenants && tenants.length > 1 && (
            <label className="block">
              <span className="text-xs text-white/40 mb-1 block">Publish to site</span>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-muted px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                    {t.id === primaryTenantId ? " (primary)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Content type — custom picker */}
          <div>
            <span className="text-xs text-white/40 mb-1 block">Content type</span>
            <ContentTypePicker
              types={contentTypes}
              value={payloadType}
              onChange={setPayloadType}
              onAdd={addContentType}
              onRemove={removeContentType}
            />
          </div>

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
                className="w-full rounded-md border border-white/10 bg-muted px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
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
              onChange={(e) => setSlug(e.target.value)}
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
    </PublishingDialog>
  );
}

// ─── ContentTypePicker ────────────────────────────────────────────────────────

interface ContentTypePickerProps {
  types: ContentTypeEntry[];
  value: string;
  onChange: (value: string) => void;
  onAdd: (label: string) => ContentTypeEntry | null;
  onRemove: (value: string) => void;
}

function ContentTypePicker({
  types,
  value,
  onChange,
  onAdd,
  onRemove,
}: ContentTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleAddType() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const entry = onAdd(trimmed);
    if (entry) {
      onChange(entry.value);
      setNewLabel("");
      inputRef.current?.focus();
    }
  }

  const selectedLabel = types.find((t) => t.value === value)?.label ?? value;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-md border border-white/10 bg-muted px-3 py-2 text-sm text-white hover:border-white/20 focus:outline-none transition-colors"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/30 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-white/10 bg-popover shadow-xl overflow-hidden">
          {/* Type list */}
          <div className="max-h-40 overflow-y-auto py-1">
            {types.map((type) => (
              <div
                key={type.value}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 cursor-pointer"
                onClick={() => {
                  onChange(type.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "w-3.5 h-3.5 shrink-0 transition-opacity",
                    type.value === value ? "text-emerald-400 opacity-100" : "opacity-0"
                  )}
                />
                <span className="flex-1 text-sm text-white/80">{type.label}</span>
                {type.removable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(type.value);
                      // If removed type was selected, fall back to first
                      if (type.value === value && types.length > 1) {
                        const fallback = types.find((t) => t.value !== type.value);
                        if (fallback) onChange(fallback.value);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-white/30 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add new type */}
          <div className="border-t border-white/5 px-3 py-2 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddType();
                }
              }}
              placeholder="Add type…"
              className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleAddType();
              }}
              disabled={!newLabel.trim()}
              className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-30 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
