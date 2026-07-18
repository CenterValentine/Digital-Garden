/**
 * Settings → Site Pages
 *
 * The low-code governance surface for SitePage composition. Pick a site (tenant)
 * and a page, edit its metadata + JSON config, and save. The config textarea is
 * validated live against the SAME Zod schema the resolver uses
 * (lib/domain/page-layout/schema.ts) — client-safe because it imports only zod.
 *
 * This is the JSON-first step; a visual builder later reads/writes the same
 * config shape.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";
import { sitePageConfig } from "@/lib/domain/page-layout/schema";

type TenantRow = { id: string; slug: string; displayName: string; isPersonal: boolean };
type PageRow = {
  slug: string;
  title: string;
  kind: string;
  navLabel: string | null;
  navOrder: number;
  visibility: string;
};

const NEW = "__new__";
const KINDS = ["record", "index", "prose", "garden"] as const;
type Kind = (typeof KINDS)[number];

// Starter config so a new page isn't a blank void.
const STARTER: Record<Kind, string> = {
  record: JSON.stringify(
    {
      sections: [
        {
          type: "recordList",
          label: "— Projects",
          sort: "date-desc",
          items: [
            { title: "Digital *Garden*", type: "Tool / IDE", year: "2021–", status: "active", statusLabel: "Active", date: "2021-01-01", blurb: "Short description." },
          ],
        },
      ],
    },
    null,
    2,
  ),
  index: JSON.stringify(
    {
      sections: [
        {
          type: "directoryIndex",
          entries: [
            { bind: "publicPath:/engineering", title: "Engineering", subtitle: "Distributed systems, the web platform." },
          ],
        },
      ],
    },
    null,
    2,
  ),
  prose: JSON.stringify({ sections: [] }, null, 2),
  garden: JSON.stringify(
    {
      sections: [
        {
          type: "gardenCategories",
          categories: [
            {
              key: "engineering",
              label: "Engineering",
              title: "Engineering",
              intro: "Distributed systems, the web platform, small code.",
              bind: "publicPath:/engineering",
              items: [],
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
};

const emptyForm = {
  slug: "",
  title: "",
  kind: "record" as Kind,
  navLabel: "",
  navOrder: 0,
  visibility: "draft" as "draft" | "published",
  configText: STARTER.record,
};

export default function SitePagesSettings() {
  const glass0 = getSurfaceStyles("glass-0");

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [selected, setSelected] = useState<string>(NEW);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // ── Live validation of the config textarea ────────────────────────────────
  const validation = useMemo(() => {
    let json: unknown;
    try {
      json = JSON.parse(form.configText);
    } catch (e) {
      return { ok: false as const, message: `Invalid JSON: ${(e as Error).message}` };
    }
    const parsed = sitePageConfig.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return {
        ok: false as const,
        message: `${first.path.join(".") || "(root)"}: ${first.message}`,
      };
    }
    return { ok: true as const, sections: parsed.data.sections.length };
  }, [form.configText]);

  // ── Load tenants, default to the personal (or first) one ──────────────────
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/user/tenants");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { tenants: TenantRow[]; primaryTenantId: string | null };
        setTenants(data.tenants);
        const preferred =
          data.tenants.find((t) => t.isPersonal)?.id ??
          data.primaryTenantId ??
          data.tenants[0]?.id ??
          "";
        setTenantId(preferred);
      } catch (err) {
        toast.error("Failed to load sites", {
          description: err instanceof Error ? err.message : "Please try again",
        });
      }
    })();
  }, []);

  const loadPages = useCallback(async (tid: string) => {
    if (!tid) return;
    try {
      const res = await fetch(`/api/site-pages?tenantId=${encodeURIComponent(tid)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { pages: PageRow[] };
      setPages(data.pages);
    } catch (err) {
      toast.error("Failed to load pages", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  }, []);

  useEffect(() => {
    if (tenantId) void loadPages(tenantId);
  }, [tenantId, loadPages]);

  // ── Select a page → fetch its row into the form ───────────────────────────
  const selectPage = useCallback(
    async (slug: string) => {
      setSelected(slug);
      if (slug === NEW) {
        setForm(emptyForm);
        return;
      }
      try {
        const seg = slug === "" ? "home" : slug;
        const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}?tenantId=${encodeURIComponent(tenantId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { page: (PageRow & { config: unknown }) | null };
        if (!data.page) {
          setForm(emptyForm);
          return;
        }
        setForm({
          slug: data.page.slug,
          title: data.page.title,
          kind: (KINDS.includes(data.page.kind as Kind) ? data.page.kind : "record") as Kind,
          navLabel: data.page.navLabel ?? "",
          navOrder: data.page.navOrder,
          visibility: data.page.visibility === "published" ? "published" : "draft",
          configText: JSON.stringify(data.page.config ?? { sections: [] }, null, 2),
        });
      } catch (err) {
        toast.error("Failed to load page", {
          description: err instanceof Error ? err.message : "Please try again",
        });
      }
    },
    [tenantId],
  );

  const handleSave = async () => {
    if (!validation.ok) {
      toast.error("Fix the config before saving", { description: validation.message });
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const seg = form.slug.trim() === "" ? "home" : form.slug.trim();
      const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantId,
          title: form.title.trim(),
          kind: form.kind,
          navLabel: form.navLabel.trim() || null,
          navOrder: form.navOrder,
          visibility: form.visibility,
          config: JSON.parse(form.configText),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      await loadPages(tenantId);
      setSelected(form.slug);
      toast.success("Page saved");
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selected === NEW) return;
    if (!window.confirm(`Delete page "${form.slug || "home"}"? This cannot be undone.`)) return;
    try {
      const seg = form.slug.trim() === "" ? "home" : form.slug.trim();
      const res = await fetch(`/api/site-pages/${encodeURIComponent(seg)}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadPages(tenantId);
      setSelected(NEW);
      setForm(emptyForm);
      toast.success("Page deleted");
    } catch (err) {
      toast.error("Failed to delete", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    }
  };

  const cardStyle = { background: glass0.background, backdropFilter: glass0.backdropFilter };
  const inputCls = "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Site Pages</h1>
        <p className="text-muted-foreground mt-2">
          Compose your site&apos;s code-driven pages (Work, Field Notes…). Bind sections to
          published directories or list items by hand, and override how each row displays.
          Edited as JSON here; validated live against the same schema the site renders.
        </p>
      </div>

      <section className="rounded-lg border border-white/10 p-6 space-y-4" style={cardStyle}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1" htmlFor="sp-tenant">Site</label>
            <select
              id="sp-tenant"
              className={inputCls}
              value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setSelected(NEW); setForm(emptyForm); }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.slug}){t.isPersonal ? " · personal" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1" htmlFor="sp-page">Page</label>
            <select
              id="sp-page"
              className={inputCls}
              value={selected}
              onChange={(e) => void selectPage(e.target.value)}
            >
              <option value={NEW}>+ New page…</option>
              {pages.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title} (/{p.slug || ""}) · {p.visibility}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 p-6 space-y-4" style={cardStyle}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-slug">
              Slug <span className="text-muted-foreground">(empty = home)</span>
            </label>
            <input id="sp-slug" className={`${inputCls} font-mono`} value={form.slug}
              placeholder="results"
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-title">Title</label>
            <input id="sp-title" className={inputCls} value={form.title}
              placeholder="Results"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-kind">Kind (chrome)</label>
            <select id="sp-kind" className={inputCls} value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Kind }))}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-vis">Visibility</label>
            <select id="sp-vis" className={inputCls} value={form.visibility}
              onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as "draft" | "published" }))}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-navlabel">
              Nav label <span className="text-muted-foreground">(empty = not in nav)</span>
            </label>
            <input id="sp-navlabel" className={inputCls} value={form.navLabel}
              onChange={(e) => setForm((f) => ({ ...f, navLabel: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="sp-navorder">Nav order</label>
            <input id="sp-navorder" type="number" className={inputCls} value={form.navOrder}
              onChange={(e) => setForm((f) => ({ ...f, navOrder: Number(e.target.value) || 0 }))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium" htmlFor="sp-config">Config (JSON)</label>
            <button
              type="button"
              className="text-xs text-white/50 hover:text-white/80"
              onClick={() => setForm((f) => ({ ...f, configText: STARTER[f.kind] }))}
            >
              Reset to {form.kind} starter
            </button>
          </div>
          <textarea
            id="sp-config"
            className={`${inputCls} font-mono min-h-[320px] leading-relaxed`}
            spellCheck={false}
            value={form.configText}
            onChange={(e) => setForm((f) => ({ ...f, configText: e.target.value }))}
          />
          <div className="mt-2 text-xs">
            {validation.ok ? (
              <span className="text-emerald-400">✓ Valid · {validation.sections} section(s)</span>
            ) : (
              <span className="text-rose-400">✗ {validation.message}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" disabled={saving || !validation.ok} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save page"}
          </Button>
          {selected !== NEW && (
            <button type="button" onClick={() => void handleDelete()}
              className="text-sm text-white/40 hover:text-rose-400">
              Delete
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
