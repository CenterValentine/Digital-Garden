"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useAutoSlug } from "../../lib/use-auto-slug";
import { useUserTenants } from "@/lib/domain/tenancy/use-user-tenants";
import { PublishingDialog } from "./PublishingDialog";

interface PathNode {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  children: PathNode[];
  tenantId: string | null;
}

interface FlatPathOption {
  id: string;
  label: string; // indented display label
  slug: string;
  tenantId: string | null;
}

function flattenPaths(nodes: PathNode[], depth = 0): FlatPathOption[] {
  const result: FlatPathOption[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      label: `${"— ".repeat(depth)}${node.title}`,
      slug: node.slug,
      tenantId: node.tenantId,
    });
    result.push(...flattenPaths(node.children, depth + 1));
  }
  return result;
}

interface CreatePublicPathDialogProps {
  onClose: () => void;
  onCreated: () => void;
  defaultParentId?: string;
}

export function CreatePublicPathDialog({ onClose, onCreated, defaultParentId }: CreatePublicPathDialogProps) {
  const [title, setTitle] = useState("");
  const { slug, setSlug, syncFromTitle, error: slugError } = useAutoSlug();
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pathOptions, setPathOptions] = useState<FlatPathOption[]>([]);

  // Tenant resolution — same pattern as CreatePublicItemDialog.
  // Picker hidden when user owns exactly 1 site.
  const { tenants, primaryTenantId, loading: isLoadingTenants } = useUserTenants();
  const [tenantId, setTenantId] = useState<string>("");
  useEffect(() => {
    if (!tenantId && tenants.length > 0) {
      setTenantId(primaryTenantId ?? tenants[0].id);
    }
  }, [tenants, primaryTenantId, tenantId]);

  // Filter parent-path options to the chosen tenant — a path's parent
  // must be on the same site (cross-tenant parenting would be a data
  // integrity bug).
  const tenantScopedPathOptions = useMemo(
    () => pathOptions.filter((p) => !tenantId || p.tenantId === tenantId),
    [pathOptions, tenantId],
  );

  // Reset parent when tenant changes (the chosen parent may no longer be valid)
  useEffect(() => {
    if (parentId && !tenantScopedPathOptions.some((p) => p.id === parentId)) {
      setParentId("");
    }
  }, [tenantId, tenantScopedPathOptions, parentId]);

  useEffect(() => {
    fetch("/api/publishing/paths")
      .then((r) => r.ok ? r.json() : [])
      .then((roots: PathNode[]) => setPathOptions(flattenPaths(roots)))
      .catch(() => {});
  }, []);

  function handleTitleChange(v: string) {
    setTitle(v);
    syncFromTitle(v);
  }

  const canSubmit = title.trim() && slug && !slugError && !isSubmitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/publishing/paths", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug,
          description: description.trim() || undefined,
          parentId: parentId || undefined,
          // Only send tenantId when explicitly choosing a non-primary
          // destination. Server defaults to primary when omitted.
          tenantId:
            tenants.length > 1 && tenantId && tenantId !== primaryTenantId
              ? tenantId
              : undefined,
        }),
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

  const selectedParent = tenantScopedPathOptions.find((p) => p.id === parentId);
  const slugPrefix = selectedParent ? `/${selectedParent.slug}/` : "/";

  return (
    <PublishingDialog
      title="New path"
      onClose={onClose}
      onSubmit={handleSubmit}
    >
        <div className="px-4 py-4 space-y-4">
          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Name</span>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Blog, Projects"
              autoFocus
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            />
          </label>

          {/* Tenant picker — hidden when user owns exactly 1 site. */}
          {!isLoadingTenants && tenants.length > 1 && (
            <label className="block">
              <span className="text-xs text-white/40 mb-1 block">Site</span>
              <select
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
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

          {tenantScopedPathOptions.length > 0 && (
            <label className="block">
              <span className="text-xs text-white/40 mb-1 block">Inside</span>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
              >
                <option value="">(top level)</option>
                {tenantScopedPathOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Slug</span>
            <div className="flex items-center rounded-md border bg-white/5 focus-within:border-white/20 overflow-hidden"
              style={{ borderColor: slugError ? "rgba(239,68,68,.5)" : "rgba(255,255,255,.1)" }}>
              <span className="pl-3 pr-1 text-sm text-white/30 whitespace-nowrap">{slugPrefix}</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-path"
                className="flex-1 bg-transparent pr-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none"
              />
            </div>
            {slugError && <p className="text-[11px] text-rose-400 mt-1">{slugError}</p>}
          </label>

          <label className="block">
            <span className="text-xs text-white/40 mb-1 block">Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
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
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </div>
    </PublishingDialog>
  );
}
