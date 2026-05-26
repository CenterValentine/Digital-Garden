/**
 * Settings → Sites
 *
 * V1 minimum-viable scope per Epoch 20 plan: list + create + rename
 * + set-primary. No deletion, no custom-host claiming, no theming.
 * Custom hosts (TenantHost CRUD + DNS verification) and deletion
 * land in a follow-up epoch.
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Button } from "@/components/ui/glass/button";
import { Check, Pencil, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type SiteRow = {
  id: string;
  slug: string;
  displayName: string;
  isPersonal: boolean;
  createdAt: string;
};

type SitesResponse = {
  tenants: SiteRow[];
  primaryTenantId: string | null;
};

export default function SitesSettingsPage() {
  const glass0 = getSurfaceStyles("glass-0");

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create form
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadSites = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/user/tenants");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SitesResponse;
      setSites(data.tenants);
      setPrimaryId(data.primaryTenantId);
    } catch (err) {
      toast.error("Failed to load sites", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingRef.current) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      toast.error("Display name is required");
      return;
    }
    isCreatingRef.current = true;
    setIsCreating(true);
    try {
      const res = await fetch("/api/user/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: trimmedName,
          slug: newSlug.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setNewName("");
      setNewSlug("");
      await loadSites();
      toast.success("Site created", { icon: <Check className="h-4 w-4" /> });
    } catch (err) {
      toast.error("Failed to create site", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("Display name cannot be empty");
      return;
    }
    try {
      const res = await fetch(`/api/user/tenants/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setEditingId(null);
      setEditingName("");
      await loadSites();
      toast.success("Renamed", { icon: <Check className="h-4 w-4" /> });
    } catch (err) {
      toast.error("Failed to rename", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      const res = await fetch(`/api/user/tenants/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asPrimary: true }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      setPrimaryId(id);
      toast.success("Primary site updated", { icon: <Check className="h-4 w-4" /> });
    } catch (err) {
      toast.error("Failed to set primary", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  const handleDelete = async (site: SiteRow) => {
    if (
      !window.confirm(
        `Delete site "${site.displayName}"?\n\nThis cannot be undone. The site will be removed permanently.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/user/tenants/${site.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      await loadSites();
      toast.success(`Deleted ${site.displayName}`, {
        icon: <Check className="h-4 w-4" />,
      });
    } catch (err) {
      toast.error("Failed to delete site", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sites</h1>
        <p className="text-muted-foreground mt-2">
          Sites are publishing destinations for your content. Each note, page, or
          project you publish belongs to one site. New items default to your
          primary site.
        </p>
      </div>

      <section
        className="rounded-lg border border-white/10 p-6 space-y-4"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="text-lg font-semibold">Create a new site</h2>
        <form className="space-y-3" onSubmit={handleCreate}>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="site-name">
              Display name
            </label>
            <input
              id="site-name"
              type="text"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="My second garden"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="site-slug">
              Slug <span className="text-muted-foreground">(optional — auto-derived from name)</span>
            </label>
            <input
              id="site-slug"
              type="text"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono"
              placeholder="my-second-garden"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              pattern="^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$|^[a-z0-9]$"
              title="Lowercase letters, numbers, hyphens. 1–120 chars. No leading/trailing hyphen."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Lowercase letters, numbers, hyphens. Used in URLs.
            </p>
          </div>
          <Button type="submit" disabled={isCreating || !newName.trim()}>
            {isCreating ? "Creating…" : "Create site"}
          </Button>
        </form>
      </section>

      <section
        className="rounded-lg border border-white/10 p-6 space-y-3"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h2 className="text-lg font-semibold">Your sites</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any sites yet. Create one above to start publishing.
          </p>
        ) : (
          <ul className="divide-y divide-white/10">
            {sites.map((site) => {
              const isPrimary = site.id === primaryId;
              const isEditing = editingId === site.id;
              return (
                <li key={site.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRename(site.id);
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditingName("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleRename(site.id)}
                          className="text-emerald-400 hover:text-emerald-300"
                          aria-label="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditingName("");
                          }}
                          className="text-white/40 hover:text-white/60"
                          aria-label="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{site.displayName}</span>
                          {isPrimary && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-300 text-xs px-2 py-0.5">
                              <Star className="h-3 w-3" /> Primary
                            </span>
                          )}
                          {site.isPersonal && !isPrimary && (
                            <span className="inline-flex items-center rounded-full bg-white/5 text-white/40 text-xs px-2 py-0.5">
                              Personal
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {site.slug}
                        </div>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-2">
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => void handleSetPrimary(site.id)}
                          className="text-xs text-white/60 hover:text-white/90 px-2 py-1 rounded hover:bg-white/5"
                        >
                          Set as primary
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(site.id);
                          setEditingName(site.displayName);
                        }}
                        className="text-white/40 hover:text-white/70"
                        aria-label="Rename"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(site)}
                          className="text-white/40 hover:text-rose-400"
                          aria-label="Delete"
                          title="Delete site (must have no items, paths, or hosts)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Custom domain support (mapping your own URL to a site) is coming in a future
        update. For now, additional sites are published under
        <code className="mx-1 font-mono">digital-garden.com/u/your-slug</code>.
      </p>
    </div>
  );
}
